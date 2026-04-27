// /api/cron/daily-summary — send Henry an end-of-day digest.

const { getDB } = require('../../db');
const { sendDailySummary } = require('../../resend');

module.exports = async function handler(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: 'unauthorized' });

  const db = getDB();

  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const since = startOfDay.toISOString();

  const [
    { count: discovered },
    { count: rated },
    { count: disqualified },
    { count: scripts },
    { count: callsPlaced },
    { count: connected },
    { count: meetings },
    { count: optOuts },
    { data: cost },
  ] = await Promise.all([
    db.from('businesses').select('id', { count: 'exact', head: true }).gte('discovered_at', since),
    db.from('site_ratings').select('id', { count: 'exact', head: true }).gte('rated_at', since),
    db.from('businesses').select('id', { count: 'exact', head: true }).gte('updated_at', since).not('disqualified_reason', 'is', null),
    db.from('call_scripts').select('id', { count: 'exact', head: true }).gte('generated_at', since),
    db.from('call_attempts').select('id', { count: 'exact', head: true }).gte('initiated_at', since),
    db.from('call_attempts').select('id', { count: 'exact', head: true }).gte('initiated_at', since).eq('status', 'connected'),
    db.from('meetings').select('id', { count: 'exact', head: true }).gte('created_at', since),
    db.from('dnc_phone_numbers').select('phone_e164', { count: 'exact', head: true }).gte('added_at', since).in('source', ['opt_out_during_call', 'do_not_record']),
    db.from('call_attempts').select('cost_usd').gte('initiated_at', since),
  ]);

  const totalCost = (cost || []).reduce((sum, r) => sum + (parseFloat(r.cost_usd) || 0), 0);

  await sendDailySummary({
    stats: {
      date: startOfDay.toISOString().slice(0, 10),
      discovered: discovered || 0,
      rated: rated || 0,
      disqualified: disqualified || 0,
      scripts: scripts || 0,
      calls_placed: callsPlaced || 0,
      calls_connected: connected || 0,
      meetings_booked: meetings || 0,
      opt_outs: optOuts || 0,
      cost_usd: totalCost,
    }
  });

  res.json({ ok: true });
};

function authorize(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return (req.headers.authorization || '') === `Bearer ${expected}`;
}
