// /api/admin/prospects — list rated prospects for the dashboard.
// Filters: ?region=boston|westchester  ?max_rating=6  ?status=open|disqualified|all
// Default: open prospects sorted by rating ascending (worst sites = highest opportunity first).

const { getDB } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  const id = req.query.id;

  // PATCH /api/admin/prospects?id=<uuid> — update single prospect
  if (req.method === 'PATCH' && id) {
    try {
      const db = getDB();
      const { disqualified_reason, dnc_until } = req.body || {};
      const patch = {};
      if (disqualified_reason !== undefined) patch.disqualified_reason = disqualified_reason;
      if (dnc_until !== undefined) patch.dnc_until = dnc_until;
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'no updates' });
      const { error } = await db.from('businesses').update(patch).eq('id', id);
      if (error) throw error;
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // DELETE /api/admin/prospects?id=<uuid>
  if (req.method === 'DELETE' && id) {
    try {
      const db = getDB();
      const { error } = await db.from('businesses').delete().eq('id', id);
      if (error) throw error;
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { region, max_rating, status = 'open', limit = '100' } = req.query || {};
  const cap = parseInt(limit, 10) || 100;

  try {
    const db = getDB();

    // 1. Pull businesses (no embeds — PostgREST embed limits unreliably truncate at scale)
    let bizQuery = db
      .from('businesses')
      .select('id, name, phone_e164, website_url, city, state, category, google_rating, google_review_count, last_called_at, disqualified_reason, discovered_at')
      .order('discovered_at', { ascending: false })
      .limit(Math.min(cap * 3, 1500));  // fetch extra so we have room to filter by rating

    if (status === 'open') bizQuery = bizQuery.is('disqualified_reason', null);
    else if (status === 'disqualified') bizQuery = bizQuery.not('disqualified_reason', 'is', null);

    if (region === 'boston') bizQuery = bizQuery.in('state', ['MA', 'Massachusetts']);
    else if (region === 'westchester') bizQuery = bizQuery.in('state', ['NY', 'New York']);

    const { data: businesses, error: bizErr } = await bizQuery;
    if (bizErr) throw bizErr;
    if (!businesses?.length) return res.json({ count: 0, prospects: [] });

    const ids = businesses.map(b => b.id);

    // 2. Pull ratings + contacts in parallel (separate queries — no embed issues)
    const [{ data: ratings }, { data: contacts }] = await Promise.all([
      db.from('site_ratings').select('business_id, rating_1_to_10, issues, selling_points, screenshot_url, lighthouse_perf, lighthouse_seo, lighthouse_a11y, rated_at').in('business_id', ids),
      db.from('contacts').select('id, business_id, full_name, title, direct_phone_e164, email').in('business_id', ids),
    ]);

    const ratingMap = Object.fromEntries((ratings || []).map(r => [r.business_id, r]));
    const contactsByBiz = {};
    for (const c of contacts || []) {
      if (!contactsByBiz[c.business_id]) contactsByBiz[c.business_id] = [];
      contactsByBiz[c.business_id].push(c);
    }

    // 3. Stitch + filter by rating + sort worst-first
    let rows = businesses.map(b => ({
      ...b,
      site_ratings: ratingMap[b.id] ? [ratingMap[b.id]] : [],
      contacts: contactsByBiz[b.id] || [],
    }));

    if (max_rating) {
      const ratingCap = parseInt(max_rating, 10);
      rows = rows.filter(b => {
        const r = b.site_ratings[0]?.rating_1_to_10;
        return typeof r === 'number' && r <= ratingCap;
      });
    }

    rows.sort((a, b) => {
      const ra = a.site_ratings[0]?.rating_1_to_10 ?? 99;
      const rb = b.site_ratings[0]?.rating_1_to_10 ?? 99;
      return ra - rb;
    });

    rows = rows.slice(0, cap);

    // 4. Generate signed URLs for screenshots
    for (const b of rows) {
      const path = b.site_ratings[0]?.screenshot_url;
      if (path) {
        const { data: signed } = await db.storage.from('screenshots').createSignedUrl(path, 3600);
        if (signed?.signedUrl) {
          b.site_ratings[0].screenshot_signed_url = signed.signedUrl;
        }
      }
    }

    res.json({ count: rows.length, prospects: rows });
  } catch (err) {
    console.error('[admin/prospects] failed:', err);
    res.status(500).json({ error: err.message || 'failed to fetch prospects' });
  }
};
