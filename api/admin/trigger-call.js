// /api/admin/trigger-call — manual one-off dial (Phase 4 dry-run + ad-hoc test calls).
// JWT-gated like the other admin endpoints. Body: { business_id, override_phone? }
//
// Override_phone bypasses the contact lookup and dials whatever you pass.
// Used for the ladder: dial Henry's cell first, then wife's, then a friendly biz.

const { getDB } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');
const { initiateOutboundCall, getProvider } = require('../../lib/voice');
const { isCallable } = require('../../lib/compliance');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const { business_id, override_phone } = req.body || {};
  if (!business_id) return res.status(400).json({ error: 'business_id required' });

  const db = getDB();

  const { data: biz, error } = await db
    .from('businesses')
    .select(`
      id, name, phone_e164, city, state, website_url,
      site_ratings ( rating_1_to_10, issues, selling_points ),
      contacts ( id, full_name, first_name, direct_phone_e164, mobile_phone_e164, email ),
      call_scripts ( id, opener, talking_points, objection_handlers, closer )
    `)
    .eq('id', business_id)
    .maybeSingle();
  if (error || !biz) return res.status(404).json({ error: 'business not found' });

  const contact = biz.contacts?.[0];
  const phone = override_phone || contact?.direct_phone_e164 || contact?.mobile_phone_e164 || biz.phone_e164;
  if (!phone) return res.status(400).json({ error: 'no phone to dial' });

  // Skip compliance check if override (so dry-run to your own cell isn't blocked by your own DNC)
  if (!override_phone) {
    const okay = await isCallable(db, phone, business_id);
    if (!okay.ok) return res.status(403).json({ error: `compliance: ${okay.reason}` });
  }

  const script = biz.call_scripts?.[0];
  const rating = biz.site_ratings?.[0];
  if (!script || !rating) return res.status(400).json({ error: 'business needs rating + script' });

  // Insert call_attempt
  const { data: attempt, error: aErr } = await db.from('call_attempts').insert({
    business_id,
    contact_id: contact?.id || null,
    script_id: script.id,
    status: 'dialing',
    initiated_at: new Date().toISOString(),
  }).select('id').single();
  if (aErr) return res.status(500).json({ error: aErr.message });

  try {
    const result = await initiateOutboundCall({
      to_number: phone,
      dynamic_variables: {
        business_name: biz.name,
        owner_first_name: contact?.first_name || 'there',
        city: biz.city || '',
        rating: rating.rating_1_to_10,
        top_issue: rating.issues?.[0] || '',
        selling_point_1: rating.selling_points?.[0] || '',
        selling_point_2: rating.selling_points?.[1] || '',
        opener: script.opener,
        talking_points: (script.talking_points || []).join(' | '),
        objection_handlers: (script.objection_handlers || []).join(' | '),
        closer: script.closer || '',
        booking_link: process.env.CAL_COM_PUBLIC_LINK || 'https://cal.com/evolvestudio/15min',
        business_id,
      },
    });

    const providerUpdate = getProvider() === 'retell'
      ? { twilio_call_sid: result.callSid, retell_call_id: result.conversation_id }
      : { twilio_call_sid: result.callSid, elevenlabs_conversation_id: result.conversation_id };
    await db.from('call_attempts').update(providerUpdate).eq('id', attempt.id);

    res.json({
      ok: true,
      call_attempt_id: attempt.id,
      conversation_id: result.conversation_id,
      dialed: phone,
    });
  } catch (err) {
    await db.from('call_attempts').update({
      status: 'failed',
      end_reason: err.message?.slice(0, 200) || 'dial threw',
    }).eq('id', attempt.id);
    res.status(500).json({ error: err.message });
  }
};
