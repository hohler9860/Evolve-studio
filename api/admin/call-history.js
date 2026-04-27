// /api/admin/call-history — list recent call attempts with their logs.
// Uses separate queries to dodge PostgREST embed limits at scale.

const { getDB } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const db = getDB();

  try {
    const { data: attempts, error: e1 } = await db
      .from('call_attempts')
      .select('id, status, initiated_at, duration_seconds, cost_usd, end_reason, business_id, contact_id')
      .order('initiated_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (e1) throw e1;
    if (!attempts?.length) return res.json({ count: 0, calls: [] });

    const businessIds = [...new Set(attempts.map(a => a.business_id).filter(Boolean))];
    const contactIds = [...new Set(attempts.map(a => a.contact_id).filter(Boolean))];
    const attemptIds = attempts.map(a => a.id);

    const [{ data: businesses }, { data: contacts }, { data: logs }] = await Promise.all([
      businessIds.length ? db.from('businesses').select('id, name, phone_e164, city, state').in('id', businessIds) : Promise.resolve({ data: [] }),
      contactIds.length ? db.from('contacts').select('id, full_name, title').in('id', contactIds) : Promise.resolve({ data: [] }),
      db.from('call_logs').select('call_attempt_id, transcript, summary, sentiment, audio_url, meeting_booked, recording_consent_given').in('call_attempt_id', attemptIds),
    ]);

    const bizMap = Object.fromEntries((businesses || []).map(b => [b.id, b]));
    const contactMap = Object.fromEntries((contacts || []).map(c => [c.id, c]));
    const logMap = Object.fromEntries((logs || []).map(l => [l.call_attempt_id, l]));

    const calls = attempts.map(a => ({
      ...a,
      businesses: bizMap[a.business_id] || null,
      contacts: contactMap[a.contact_id] || null,
      call_logs: logMap[a.id] ? [logMap[a.id]] : [],
    }));

    res.json({ count: calls.length, calls });
  } catch (err) {
    console.error('[admin/call-history] failed:', err);
    res.status(500).json({ error: err.message || 'failed' });
  }
};
