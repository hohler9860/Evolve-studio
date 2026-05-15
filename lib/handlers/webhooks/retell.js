// /api/webhooks/retell — receives Retell `call_ended` and `call_analyzed` events.
// Verifies HMAC, persists raw payload to webhook_events, then promotes the
// call_attempt to status=connected, writes call_logs row, and (on the agent
// saying do-not-record or opt-out phrases) updates DNC.
//
// Retell sends two relevant events per call:
//   - call_ended:    fires when the call hangs up. Has duration + outcome.
//   - call_analyzed: fires ~30s later with the full transcript + summary + sentiment.
//
// We process both — call_ended marks status, call_analyzed adds transcript data.
//
// Docs: https://docs.retellai.com/features/webhooks

const { getDB } = require('../../db');
const { verifyWebhookSignature } = require('../../retell');
const { addToDNC, containsRecordingOptOut, containsFullOptOut, verifyOpeningDisclosure } = require('../../compliance');

async function readRawBody(req) {
  if (req.body && Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  return await new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const raw = await readRawBody(req);
  const sig = req.headers['x-retell-signature'];
  const verify = await verifyWebhookSignature(raw, sig);
  if (!verify.ok) {
    console.warn('[webhook/retell] sig fail:', verify.reason);
    return res.status(401).json({ error: 'invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(raw); } catch { return res.status(400).json({ error: 'bad json' }); }

  const db = getDB();
  const event = payload.event || payload.type || 'unknown';
  const call = payload.call || payload.data || payload;

  // Persist raw payload first (audit trail, replayable)
  const { data: weRow, error: weErr } = await db.from('webhook_events').insert({
    source: 'retell',
    event_type: event,
    payload,
  }).select('id').single();
  if (weErr) console.error('[webhook/retell] webhook_events insert failed:', weErr.message);

  try {
    const callId = call.call_id;
    if (!callId) {
      await markProcessed(db, weRow?.id, 'no call_id');
      return res.status(200).json({ ok: true, note: 'no call_id' });
    }

    // Match call_attempt by retell_call_id
    const { data: attempt } = await db
      .from('call_attempts')
      .select('id, business_id, contact_id')
      .eq('retell_call_id', callId)
      .maybeSingle();

    if (!attempt) {
      await markProcessed(db, weRow?.id, 'no matching call_attempt');
      return res.status(200).json({ ok: true, note: 'no matching call_attempt' });
    }

    // Common updates regardless of event type
    const durationMs = call.duration_ms || (call.end_timestamp && call.start_timestamp ? call.end_timestamp - call.start_timestamp : null);
    const durationSeconds = durationMs ? Math.round(durationMs / 1000) : null;
    const cost = call.call_cost?.combined_cost || call.cost_usd || null;

    if (event === 'call_ended') {
      // Mark connected + duration. Transcript comes in call_analyzed.
      await db.from('call_attempts').update({
        status: 'connected',
        duration_seconds: durationSeconds,
        cost_usd: cost,
      }).eq('id', attempt.id);

      await db.from('businesses').update({
        last_called_at: new Date().toISOString()
      }).eq('id', attempt.business_id);
    }

    if (event === 'call_analyzed') {
      // Full transcript + summary + sentiment ready
      const turns = Array.isArray(call.transcript_object) ? call.transcript_object : [];
      const transcript = typeof call.transcript === 'string'
        ? call.transcript
        : turns.map(t => `${t.role || 'unknown'}: ${t.content || ''}`).join('\n');
      const audioUrl = call.recording_url || null;
      const summary = call.call_analysis?.call_summary || call.call_summary || null;
      const sentiment = call.call_analysis?.user_sentiment || null;
      const meetingBooked = !!(
        call.call_analysis?.custom_analysis_data?.meeting_booked ||
        call.transcript_with_tool_calls?.some?.(t => t.tool_calls?.some?.(c => c.name === 'book_meeting'))
      );

      const disclosure = verifyOpeningDisclosure(transcript);

      await db.from('call_logs').insert({
        call_attempt_id: attempt.id,
        transcript,
        transcript_jsonb: turns,
        audio_url: audioUrl,
        summary,
        sentiment,
        disclosure_given: disclosure.ai && disclosure.recording,
        recording_consent_given: disclosure.recording,
        meeting_booked: meetingBooked,
      });

      // Compliance: scan full transcript for opt-outs
      if (containsRecordingOptOut(transcript) || containsFullOptOut(transcript)) {
        const { data: contact } = attempt.contact_id
          ? await db.from('contacts').select('direct_phone_e164,mobile_phone_e164').eq('id', attempt.contact_id).maybeSingle()
          : { data: null };
        const phone = contact?.direct_phone_e164 || contact?.mobile_phone_e164;
        if (phone) {
          await addToDNC(
            db,
            phone,
            containsRecordingOptOut(transcript) ? 'do_not_record' : 'opt_out_during_call',
            `auto-detected from retell call ${callId}`
          );
        }
      }
    }

    await markProcessed(db, weRow?.id, null);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook/retell] processing failed:', err);
    await markProcessed(db, weRow?.id, err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};

async function markProcessed(db, id, error) {
  if (!id) return;
  await db.from('webhook_events').update({
    processed: true,
    processed_at: new Date().toISOString(),
    error,
  }).eq('id', id);
}

module.exports.config = { api: { bodyParser: false } };
