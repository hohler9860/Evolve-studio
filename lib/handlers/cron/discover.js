// /api/cron/discover — daily discovery cron.
// Picks N active campaigns (rotated by least-recently-run), runs the Apify Google
// Maps scraper for each, dedupes against `businesses` table by phone or place_id,
// inserts new rows with status pending rating.
//
// Env: APIFY_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
// Trigger: Vercel cron (configured in vercel.json) — also accepts manual GET
// with `Authorization: Bearer ${CRON_SECRET}` for ad-hoc runs from /admin.

const { getDB } = require('../../db');
const { scrapeGoogleMaps } = require('../../apify');

const CAMPAIGNS_PER_RUN = 8;   // 8 queries × 30 places ≈ 240 raw / day
const PLACES_PER_QUERY  = 30;

module.exports = async function handler(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const db = getDB();

    // Pick the N least-recently-run active campaigns.
    const { data: campaigns, error: campaignErr } = await db
      .from('campaigns')
      .select('id, name, region, category, query_template, started_at')
      .eq('is_active', true)
      .order('started_at', { ascending: true, nullsFirst: true })
      .limit(CAMPAIGNS_PER_RUN);
    if (campaignErr) throw campaignErr;
    if (!campaigns?.length) return res.json({ ok: true, message: 'no active campaigns' });

    const queries = campaigns.map(c => c.query_template);
    const places = await scrapeGoogleMaps(queries, { maxPlacesPerQuery: PLACES_PER_QUERY });

    // Dedupe against existing businesses (by phone or google_place_id).
    const phones = places.map(p => p.phone_e164).filter(Boolean);
    const placeIds = places.map(p => p.google_place_id).filter(Boolean);

    const [{ data: byPhone }, { data: byPlace }] = await Promise.all([
      phones.length
        ? db.from('businesses').select('phone_e164').in('phone_e164', phones)
        : Promise.resolve({ data: [] }),
      placeIds.length
        ? db.from('businesses').select('google_place_id').in('google_place_id', placeIds)
        : Promise.resolve({ data: [] }),
    ]);
    const seenPhones = new Set((byPhone || []).map(r => r.phone_e164));
    const seenPlaceIds = new Set((byPlace || []).map(r => r.google_place_id));

    // For each place, decide which campaign it belongs to (we don't have a deterministic
    // mapping back from Apify result to query, so assign by category match).
    const inserts = [];
    for (const place of places) {
      if (place.phone_e164 && seenPhones.has(place.phone_e164)) continue;
      if (place.google_place_id && seenPlaceIds.has(place.google_place_id)) continue;

      const campaign = matchCampaign(place, campaigns) || campaigns[0];
      inserts.push({
        campaign_id: campaign.id,
        name: place.name,
        phone_e164: place.phone_e164,
        website_url: place.website_url,
        address: place.address,
        city: place.city,
        state: place.state,
        zip: place.zip,
        google_place_id: place.google_place_id,
        google_rating: place.google_rating,
        google_review_count: place.google_review_count,
        category: place.category,
        source: 'apify_gmaps',
        metadata: place.metadata || {},
      });
    }

    let inserted = 0;
    if (inserts.length) {
      // Upsert by phone_e164 (no-op on conflict — businesses table has UNIQUE on it).
      const { data, error } = await db
        .from('businesses')
        .upsert(inserts, { onConflict: 'phone_e164', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      inserted = data?.length || 0;
    }

    // Bump campaign started_at so we rotate to the next set tomorrow.
    const ids = campaigns.map(c => c.id);
    await db.from('campaigns').update({ started_at: new Date().toISOString() }).in('id', ids);

    res.json({
      ok: true,
      campaigns_run: campaigns.length,
      raw_results: places.length,
      new_businesses: inserted,
    });
  } catch (err) {
    console.error('[cron/discover] failed:', err);
    res.status(500).json({ error: err.message || 'discover failed' });
  }
};

function authorize(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true; // dev mode
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${expected}`;
}

function matchCampaign(place, campaigns) {
  if (!place.category) return null;
  const cat = place.category.toLowerCase();
  return campaigns.find(c => cat.includes(c.category.toLowerCase())) || null;
}
