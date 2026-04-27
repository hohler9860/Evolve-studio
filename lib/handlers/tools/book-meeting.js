// /api/tools/book-meeting — invoked by the ElevenLabs agent mid-call as a server tool.
// Body shape (from the agent's tool call):
//   { business_id, attendee_name, attendee_email, attendee_phone, start_iso, timezone? }
//
// Auth: shared bearer token in `Authorization: Bearer ${EL_TOOL_SECRET}`.
// Response: { success, scheduled_for, join_url } — agent reads this aloud.
//
// We intentionally DO NOT trust agent-supplied times to be in the future or available
// without Cal.com confirming. Cal.com is the source of truth.

const { bookMeeting } = require('../../cal');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!authorize(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const body = req.body || {};
    const { business_id, attendee_name, attendee_email, attendee_phone, start_iso, timezone } = body;

    if (!business_id || !attendee_email || !start_iso) {
      return res.status(400).json({ success: false, error: 'missing fields' });
    }

    const result = await bookMeeting({
      attendeeName: attendee_name || 'Cold-call prospect',
      attendeeEmail: attendee_email,
      attendeePhone: attendee_phone || null,
      start: start_iso,
      timezone: timezone || 'America/New_York',
      metadata: { business_id, source: 'cold_call_agent' },
    });

    res.json({
      success: true,
      scheduled_for: result.scheduledFor,
      join_url: result.joinUrl || 'will be emailed',
    });
  } catch (err) {
    console.error('[tools/book-meeting] failed:', err);
    res.json({ success: false, error: err.message || 'booking failed' });
  }
};

function authorize(req) {
  const expected = process.env.EL_TOOL_SECRET;
  if (!expected) return true; // dev mode
  return (req.headers.authorization || '') === `Bearer ${expected}`;
}
