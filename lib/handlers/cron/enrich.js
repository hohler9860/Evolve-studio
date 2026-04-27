// /api/cron/enrich — find decision-maker contacts for newly-rated, callable businesses.
//
// Eligible: business has site_rating with rating_1_to_10 ≤ 7, no disqualified_reason,
// no contacts row yet. Hits Apollo, inserts best contacts, falls back to
// the business's own google_phone if Apollo finds nothing.

const { getDB } = require('../../db');
const { findOwner } = require('../../apollo');

const BATCH_SIZE = 15;

module.exports = async function handler(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const db = getDB();

    // Pick businesses with a rating but no contacts yet.
    const { data: candidates, error: e1 } = await db
      .from('businesses')
      .select(`
        id, name, city, state, website_url, phone_e164,
        site_ratings!inner ( rating_1_to_10 ),
        contacts ( id )
      `)
      .is('disqualified_reason', null)
      .lte('site_ratings.rating_1_to_10', 7)
      .limit(50);
    if (e1) throw e1;

    const targets = (candidates || []).filter(b => !(b.contacts && b.contacts.length)).slice(0, BATCH_SIZE);
    if (!targets.length) return res.json({ ok: true, message: 'nothing to enrich' });

    const stats = { found: 0, fallback: 0, none: 0 };

    for (const biz of targets) {
      try {
        const found = await findOwner({
          name: biz.name,
          city: biz.city,
          state: biz.state,
          website_url: biz.website_url,
        });

        if (found.length) {
          // Take top 2 contacts (Apollo orders by quality).
          const inserts = found.slice(0, 2).map(c => ({ ...c, business_id: biz.id, source: 'apollo' }));
          await db.from('contacts').insert(inserts);
          stats.found++;
        } else if (biz.phone_e164) {
          // Fallback: business's main phone, no name.
          await db.from('contacts').insert({
            business_id: biz.id,
            full_name: 'Business main line',
            direct_phone_e164: biz.phone_e164,
            source: 'apify',
            confidence: 0.3,
          });
          stats.fallback++;
        } else {
          // No phone anywhere — disqualify.
          await db.from('businesses').update({ disqualified_reason: 'no_phone' }).eq('id', biz.id);
          stats.none++;
        }
      } catch (err) {
        console.error(`[cron/enrich] biz ${biz.id} failed:`, err.message);
      }
    }

    res.json({ ok: true, batch_size: targets.length, ...stats });
  } catch (err) {
    console.error('[cron/enrich] failed:', err);
    res.status(500).json({ error: err.message || 'enrich failed' });
  }
};

function authorize(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return (req.headers.authorization || '') === `Bearer ${expected}`;
}
