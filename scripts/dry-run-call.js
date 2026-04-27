// One-shot: dial a real phone using your fully-wired ElevenLabs agent + Twilio
// number, with a fake "business" for testing. Use this to walk the dry-run ladder
// from the plan: your cell → spouse → friendly small biz → first real prospect.
//
// Usage:
//   TO=+16175551212 node scripts/dry-run-call.js
//   TO=+16175551212 BUSINESS_ID=<uuid> node scripts/dry-run-call.js
//
// If BUSINESS_ID is provided, uses that business's actual rating + script.
// Otherwise uses a hard-coded fake.

const { initiateOutboundCall } = require('../lib/elevenlabs');
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const to = process.env.TO;
  if (!to) {
    console.error('Set TO=+1XXXYYYZZZZ');
    process.exit(1);
  }

  let dynamicVars;

  if (process.env.BUSINESS_ID) {
    const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const [{ data: biz }, { data: rating }, { data: contact }, { data: script }] = await Promise.all([
      db.from('businesses').select('id, name, city').eq('id', process.env.BUSINESS_ID).single(),
      db.from('site_ratings').select('rating_1_to_10, issues, selling_points').eq('business_id', process.env.BUSINESS_ID).maybeSingle(),
      db.from('contacts').select('first_name, full_name').eq('business_id', process.env.BUSINESS_ID).limit(1).maybeSingle(),
      db.from('call_scripts').select('opener, talking_points, objection_handlers, closer').eq('business_id', process.env.BUSINESS_ID).limit(1).maybeSingle(),
    ]);

    if (!biz) { console.error('business not found'); process.exit(1); }
    if (!rating || !script) { console.error('business needs rating + script first'); process.exit(1); }

    const r = rating;
    const c = contact;
    const s = script;

    dynamicVars = {
      business_name: biz.name,
      owner_first_name: c?.first_name || 'there',
      city: biz.city || '',
      rating: r.rating_1_to_10,
      top_issue: r.issues?.[0] || '',
      selling_point_1: r.selling_points?.[0] || '',
      selling_point_2: r.selling_points?.[1] || '',
      opener: s.opener,
      talking_points: (s.talking_points || []).join(' | '),
      objection_handlers: (s.objection_handlers || []).join(' | '),
      closer: s.closer || '',
      booking_link: process.env.CAL_COM_PUBLIC_LINK || 'https://cal.com/evolvestudio/15min',
      business_id: biz.id,
    };
  } else {
    dynamicVars = {
      business_name: 'Acme Plumbing (TEST)',
      owner_first_name: 'Henry',
      city: 'Boston',
      rating: 4,
      top_issue: 'site does not load on mobile',
      selling_point_1: 'we add online booking with same-day appointment slots',
      selling_point_2: 'you have 200+ Google reviews invisible on your current site',
      opener: 'Hi Henry, this is an AI assistant calling on behalf of Henry at Evolve Studio — this call is recorded. Got 30 seconds for a quick question about your website?',
      talking_points: 'site is slow on mobile | no booking flow | reviews not visible',
      objection_handlers: '"already have a guy" → great, anyone reviewing performance lately? | "send an email" → sure, what is the best email to send a 90-second mockup video to?',
      closer: 'I will mock up a sample homepage before we hop on. Cool if I send a Calendar link?',
      booking_link: 'https://cal.com/evolvestudio/15min',
      business_id: 'dry-run-test',
    };
  }

  // Insert a call_attempt row first so the dashboard sees the call.
  // Skip DB insert for the hard-coded fake (no real business_id).
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let attemptId = null;
  if (process.env.BUSINESS_ID && process.env.BUSINESS_ID !== 'dry-run-test') {
    const { data: contact } = await db.from('contacts').select('id').eq('business_id', process.env.BUSINESS_ID).limit(1).maybeSingle();
    const { data: script } = await db.from('call_scripts').select('id').eq('business_id', process.env.BUSINESS_ID).limit(1).maybeSingle();
    const { data: attempt, error: aErr } = await db.from('call_attempts').insert({
      business_id: process.env.BUSINESS_ID,
      contact_id: contact?.id || null,
      script_id: script?.id || null,
      status: 'dialing',
      initiated_at: new Date().toISOString(),
    }).select('id').single();
    if (aErr) console.warn('[dry-run] call_attempt insert failed:', aErr.message);
    else attemptId = attempt.id;
  }

  console.log(`→ dialing ${to}…`);
  const result = await initiateOutboundCall({ to_number: to, dynamic_variables: dynamicVars });
  console.log('✓ initiated');
  console.log('  conversation_id:', result.conversation_id);
  console.log('  call_sid:', result.callSid);

  if (attemptId) {
    await db.from('call_attempts').update({
      twilio_call_sid: result.callSid,
      elevenlabs_conversation_id: result.conversation_id,
    }).eq('id', attemptId);
    console.log('✓ call_attempt logged:', attemptId);
  }
}

main().catch(err => { console.error('dry-run failed:', err); process.exit(1); });
