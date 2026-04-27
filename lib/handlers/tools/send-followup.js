// EL server tool: send a follow-up email mid-call.
// Agent invokes this when the prospect says "send me an email" / "I'll think about it".
// Body: { business_id, attendee_email, attendee_name? }
// Auth: Bearer EL_TOOL_SECRET

const { getDB } = require('../../db');
const { sendProspectFollowup } = require('../../resend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!authorize(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    const { business_id, attendee_email, attendee_name } = req.body || {};
    if (!attendee_email) return res.status(400).json({ success: false, error: 'attendee_email required' });

    const db = getDB();

    let businessName = 'your business';
    let topIssue = null;
    let ownerFirstName = attendee_name?.split(/\s+/)[0] || 'there';

    if (business_id) {
      const [{ data: biz }, { data: rating }] = await Promise.all([
        db.from('businesses').select('name').eq('id', business_id).maybeSingle(),
        db.from('site_ratings').select('issues, selling_points').eq('business_id', business_id).maybeSingle(),
      ]);
      if (biz) businessName = biz.name;
      if (rating) topIssue = rating.issues?.[0] || rating.selling_points?.[0] || null;
    }

    await sendProspectFollowup({
      to: attendee_email,
      businessName,
      ownerFirstName,
      topIssue,
      bookingLink: process.env.CAL_COM_PUBLIC_LINK || 'https://cal.com/evolvestudio/15min',
      voicemail: false,
    });

    res.json({ success: true, message: 'follow-up email sent' });
  } catch (err) {
    console.error('[tools/send-followup] failed:', err);
    res.json({ success: false, error: err.message || 'send failed' });
  }
};

function authorize(req) {
  const expected = process.env.EL_TOOL_SECRET;
  if (!expected) return true;
  return (req.headers.authorization || '') === `Bearer ${expected}`;
}
