// /api/webhooks/elevenlabs — receives `post_call_transcription` events.
// Verifies HMAC, persists raw payload to webhook_events, then promotes the
// call_attempt to status=connected, writes call_logs row, and (if the agent
// said the do-not-record phrase or full opt-out phrase) updates DNC.

const { getDB } = require('../../db');
const { verifyWebhookSignature } = require('../../elevenlabs');
const { addToDNC, containsRecordingOptOut, containsFullOptOut, verifyOpeningDisclosure } = require('../../compliance');

// Vercel serverless raw-body shim
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
  const sig = req.headers['elevenlabs-signature'];
  const verify = await verifyWebhookSignature(raw, sig);
  if (!verify.ok) {
    console.warn('[webhook/elevenlabs] sig fail:', verify.reason);
    return res.status(401).json({ error: 'invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(raw); } catch { return res.status(400).json({ error: 'bad json' }); }

  const db = getDB();

  // Persist raw payload first (audit trail, replayable)
  const { data: weRow, error: weErr } = await db.from('webhook_events').insert({
    source: 'elevenlabs',
    event_type: payload.type || 'post_call_transcription',
    payload,
  }).select('id').single();
  if (weErr) console.error('[webhook/elevenlabs] webhook_events insert failed:', weErr.message);

  try {
    const data = payload.data || payload;
    const conversationId = data.conversation_id || payload.conversation_id;
    if (!conversationId) {
      await markProcessed(db, weRow?.id, 'no conversation_id');
      return res.status(200).json({ ok: true, note: 'no conversation_id' });
    }

    // Find the call_attempt by elevenlabs_conversation_id
    const { data: attempt } = await db
      .from('call_attempts')
      .select('id, business_id, contact_id')
      .eq('elevenlabs_conversation_id', conversationId)
      .maybeSingle();

    if (!attempt) {
      await markProcessed(db, weRow?.id, 'no matching call_attempt');
      return res.status(200).json({ ok: true, note: 'no matching call_attempt' });
    }

    // EL sends `transcript` as an array of turn objects. Build a flat string for
    // compliance checks (opt-out detection, disclosure verification) + storage.
    const turns = Array.isArray(data.transcript) ? data.transcript : (Array.isArray(data.turns) ? data.turns : []);
    const transcript = typeof data.transcript_text === 'string'
      ? data.transcript_text
      : turns.map(t => `${t.role || 'unknown'}: ${t.message || ''}`).join('\n');
    const audioUrl = data.audio_url || data.recording_url || null;
    const summary = data.summary || data.call_summary || null;
    const durationSeconds = data.duration_seconds || data.metadata?.duration_seconds || null;
    const cost = data.cost_usd || data.metadata?.cost_usd || null;

    const disclosure = verifyOpeningDisclosure(transcript);

    // Write call_logs
    await db.from('call_logs').insert({
      call_attempt_id: attempt.id,
      transcript,
      transcript_jsonb: turns,
      audio_url: audioUrl,
      summary,
      sentiment: data.sentiment || null,
      disclosure_given: disclosure.ai && disclosure.recording,
      recording_consent_given: disclosure.recording,
      meeting_booked: !!data.tools_called?.find?.(t => t.name === 'book_meeting'),
    });

    // Update call_attempts → connected + duration + cost
    await db.from('call_attempts').update({
      status: 'connected',
      duration_seconds: durationSeconds,
      cost_usd: cost,
    }).eq('id', attempt.id);

    // Update business.last_called_at
    await db.from('businesses').update({ last_called_at: new Date().toISOString() }).eq('id', attempt.business_id);

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
          `auto-detected from conversation ${conversationId}`
        );
      }
    }

    await markProcessed(db, weRow?.id, null);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook/elevenlabs] processing failed:', err);
    await markProcessed(db, weRow?.id, err.message);
    // Always 200 so EL doesn't retry indefinitely; we have the raw payload.
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
