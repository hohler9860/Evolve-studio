// /api/cron/dial — paced batch dialer.
// Fires every 15 min during business hours. Picks call-ready prospects, runs
// every compliance gate, and initiates outbound calls via ElevenLabs.
//
// Hard guardrails (each is fatal — call is skipped):
//   1. DIALING_ENABLED env flag must be "true"
//   2. Within calling hours (9-5 ET, weekday, non-holiday)
//   3. DAILY_CALL_CAP not yet hit (count call_attempts initiated today)
//   4. Per-prospect: callable() — DNC, cooldown, disqualified
//   5. Has script + has callable contact phone
//
// Pacing: max 5 calls per batch (one cron tick).

const { getDB } = require('../../db');
const { initiateOutboundCall } = require('../../elevenlabs');
const { isWithinCallingHours, isCallable } = require('../../compliance');

const BATCH_SIZE = 5;

module.exports = async function handler(req, res) {
  if (!authorize(req)) return res.status(401).json({ error: 'unauthorized' });

  // 1. master kill switch
  if (process.env.DIALING_ENABLED !== 'true') {
    return res.json({ ok: true, skipped: 'DIALING_ENABLED is not "true"' });
  }

  // 2. calling hours
  const hoursCheck = isWithinCallingHours();
  if (!hoursCheck.ok) {
    return res.json({ ok: true, skipped: `outside hours: ${hoursCheck.reason}` });
  }

  const db = getDB();

  // 3. daily cap
  const cap = parseInt(process.env.DAILY_CALL_CAP || '10', 10);
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: todayCount } = await db
    .from('call_attempts')
    .select('id', { count: 'exact', head: true })
    .gte('initiated_at', startOfDay.toISOString());
  if ((todayCount || 0) >= cap) {
    return res.json({ ok: true, skipped: `daily cap ${cap} reached (${todayCount})` });
  }
  const remaining = cap - (todayCount || 0);
  const slot = Math.min(BATCH_SIZE, remaining);

  // 4. find prospects with rating + script + contact, no recent attempt
  const { data: pool, error } = await db
    .from('businesses')
    .select(`
      id, name, phone_e164, city, state, website_url,
      site_ratings!inner ( rating_1_to_10, issues, selling_points ),
      contacts!inner ( id, full_name, first_name, direct_phone_e164, mobile_phone_e164, email ),
      call_scripts!inner ( id, opener, talking_points, objection_handlers, closer )
    `)
    .is('disqualified_reason', null)
    .lte('site_ratings.rating_1_to_10', 7)
    .order('discovered_at', { ascending: true })
    .limit(40);
  if (error) throw error;

  let dialed = 0;
  let skipped_compliance = 0;
  const log = [];

  for (const biz of pool || []) {
    if (dialed >= slot) break;

    const contact = biz.contacts[0];
    const phone = contact?.direct_phone_e164 || contact?.mobile_phone_e164 || biz.phone_e164;
    if (!phone) {
      skipped_compliance++; log.push({ id: biz.id, skip: 'no phone' }); continue;
    }

    // 5. compliance gate
    const okay = await isCallable(db, phone, biz.id);
    if (!okay.ok) { skipped_compliance++; log.push({ id: biz.id, skip: okay.reason }); continue; }

    const script = biz.call_scripts[0];
    const rating = biz.site_ratings[0];

    // Insert call_attempt FIRST (before outbound API) so we have the row to update.
    const { data: attempt, error: aErr } = await db.from('call_attempts').insert({
      business_id: biz.id,
      contact_id: contact?.id || null,
      script_id: script.id,
      status: 'dialing',
      initiated_at: new Date().toISOString(),
    }).select('id').single();
    if (aErr) { log.push({ id: biz.id, skip: 'attempt_insert_failed' }); continue; }

    try {
      const result = await initiateOutboundCall({
        to_number: phone,
        dynamic_variables: {
          business_name: biz.name,
          owner_first_name: contact?.first_name || splitFirst(contact?.full_name) || 'there',
          city: biz.city || '',
          rating: rating.rating_1_to_10,
          top_issue: (rating.issues?.[0] || ''),
          selling_point_1: (rating.selling_points?.[0] || ''),
          selling_point_2: (rating.selling_points?.[1] || ''),
          opener: script.opener,
          talking_points: (script.talking_points || []).join(' | '),
          objection_handlers: (script.objection_handlers || []).join(' | '),
          closer: script.closer || '',
          booking_link: process.env.CAL_COM_PUBLIC_LINK || 'https://cal.com/evolvestudio/15min',
          business_id: biz.id,
        },
      });

      await db.from('call_attempts').update({
        twilio_call_sid: result.callSid,
        elevenlabs_conversation_id: result.conversation_id,
      }).eq('id', attempt.id);

      dialed++;
      log.push({ id: biz.id, dialed: phone, conversation: result.conversation_id });
    } catch (err) {
      console.error(`[cron/dial] biz ${biz.id} dial failed:`, err.message);
      await db.from('call_attempts').update({
        status: 'failed',
        end_reason: err.message?.slice(0, 200) || 'dial threw',
      }).eq('id', attempt.id);
      log.push({ id: biz.id, error: err.message });
    }
  }

  res.json({
    ok: true,
    today_so_far: (todayCount || 0) + dialed,
    cap,
    dialed,
    skipped_compliance,
    log,
  });
};

function splitFirst(full) {
  if (!full) return null;
  const f = full.trim().split(/\s+/)[0];
  return f && f !== 'Business' ? f : null;
}

function authorize(req) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  return (req.headers.authorization || '') === `Bearer ${expected}`;
}
