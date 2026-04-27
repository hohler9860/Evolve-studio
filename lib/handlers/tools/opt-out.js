// /api/tools/opt-out — invoked by the ElevenLabs agent when the prospect asks
// to be removed from outreach. The agent should call this whenever it detects
// "take me off your list", "do not call", "stop calling me", etc.

const { getDB } = require('../../db');
const { addToDNC } = require('../../compliance');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!authorize(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const { business_id, phone_e164, reason } = req.body || {};
    if (!phone_e164) return res.status(400).json({ success: false, error: 'phone required' });

    const db = getDB();
    await addToDNC(db, phone_e164, 'opt_out_during_call', reason || 'agent-detected');

    if (business_id) {
      await db.from('businesses').update({
        dnc_until: new Date('2099-12-31').toISOString(),
      }).eq('id', business_id);
    }

    res.json({ success: true, message: 'added to DNC; will not call again' });
  } catch (err) {
    console.error('[tools/opt-out] failed:', err);
    res.json({ success: false, error: err.message });
  }
};

function authorize(req) {
  const expected = process.env.EL_TOOL_SECRET;
  if (!expected) return true;
  return (req.headers.authorization || '') === `Bearer ${expected}`;
}
