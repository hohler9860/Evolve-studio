// /api/cron/generate-scripts — Claude generates a personalized 60-90s script for
// every business that has a rating + a contact but no script yet.

const { getDB } = require('../../db');
const { generateScript } = require('../../claude');

const BATCH_SIZE = 20;

module.exports = async function handler(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const db = getDB();

    // Find businesses with rating + contact + no script
    const { data, error } = await db
      .from('businesses')
      .select(`
        id, name, city, state, category,
        site_ratings!inner ( rating_1_to_10, issues, selling_points ),
        contacts!inner ( id, first_name, full_name ),
        call_scripts ( id )
      `)
      .is('disqualified_reason', null)
      .lte('site_ratings.rating_1_to_10', 7)
      .limit(60);
    if (error) throw error;

    const targets = (data || [])
      .filter(b => !(b.call_scripts && b.call_scripts.length))
      .slice(0, BATCH_SIZE);

    if (!targets.length) return res.json({ ok: true, message: 'nothing to script' });

    let written = 0;
    let failed = 0;

    for (const biz of targets) {
      try {
        const rating = biz.site_ratings[0];
        const contact = biz.contacts[0];

        const script = await generateScript({
          business_name: biz.name,
          city: biz.city,
          category: biz.category,
          owner_first_name: contact?.first_name || splitFirstName(contact?.full_name),
          rating: rating.rating_1_to_10,
          issues: rating.issues,
          selling_points: rating.selling_points,
        });

        await db.from('call_scripts').insert({
          business_id: biz.id,
          contact_id: contact?.id || null,
          opener: script.opener,
          talking_points: script.talking_points,
          objection_handlers: script.objection_handlers,
          closer: script.closer,
          model_version: script.model,
        });
        written++;
      } catch (err) {
        console.error(`[cron/generate-scripts] biz ${biz.id} failed:`, err.message);
        failed++;
      }
    }

    res.json({ ok: true, batch_size: targets.length, written, failed });
  } catch (err) {
    console.error('[cron/generate-scripts] failed:', err);
    res.status(500).json({ error: err.message || 'script generation failed' });
  }
};

function splitFirstName(full) {
  if (!full) return null;
  const first = full.trim().split(/\s+/)[0];
  return first && first !== 'Business' ? first : null;
}

function authorize(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return (req.headers.authorization || '') === `Bearer ${expected}`;
}
