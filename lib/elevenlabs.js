// ElevenLabs Conversational AI wrapper.
//
// Outbound flow:
//   1. We have one Agent created in the EL dashboard with a system-prompt template
//      that uses {{variable}} placeholders. (See scripts/seed-agent.js to create it.)
//   2. We have one phone number imported from Twilio into EL's Phone Numbers page.
//   3. To dial, POST /v1/convai/twilio/outbound-call with the agent_id, the imported
//      agent_phone_number_id, the destination number, and a `dynamic_variables` map
//      (business_name, owner_first_name, opener, talking_points, booking_link, etc.).
//   4. EL initiates the call via Twilio, runs the agent, executes tool calls
//      (book_meeting, opt_out) by HTTPing our /api/tools/* endpoints, then fires
//      `post_call_transcription` webhook → /api/webhooks/elevenlabs.
//
// Docs:
//   https://elevenlabs.io/docs/conversational-ai/api-reference/twilio/outbound-call

const EL_BASE = 'https://api.elevenlabs.io';

function getApiKey() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error('ELEVENLABS_API_KEY not configured');
  return k;
}

function getAgentId() {
  const id = process.env.ELEVENLABS_AGENT_ID;
  if (!id) throw new Error('ELEVENLABS_AGENT_ID not configured (run scripts/seed-agent.js)');
  return id;
}

function getAgentPhoneNumberId() {
  const id = process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID;
  if (!id) throw new Error('ELEVENLABS_AGENT_PHONE_NUMBER_ID not configured');
  return id;
}

/**
 * Initiate an outbound call.
 * @param {object} input
 * @param {string} input.to_number        - destination, +1XXXYYYZZZZ
 * @param {object} input.dynamic_variables - merged into the agent's system prompt template
 * @returns {Promise<{conversation_id:string, callSid:string}>}
 */
async function initiateOutboundCall(input) {
  const apiKey = getApiKey();
  const agentId = getAgentId();
  const agentPhoneNumberId = getAgentPhoneNumberId();

  const body = {
    agent_id: agentId,
    agent_phone_number_id: agentPhoneNumberId,
    to_number: input.to_number,
    conversation_initiation_client_data: {
      dynamic_variables: input.dynamic_variables || {},
    },
  };

  const res = await fetch(`${EL_BASE}/v1/convai/twilio/outbound-call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`ElevenLabs outbound-call failed ${res.status}: ${text.slice(0, 400)}`);
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  // EL returns 200 with {success:false, message:"..."} when Twilio rejects (trial limits, invalid number, etc).
  if (parsed.success === false) {
    throw new Error(`ElevenLabs outbound-call rejected: ${parsed.message || 'unknown'}`);
  }

  return {
    conversation_id: parsed.conversation_id || parsed.id || null,
    callSid: parsed.callSid || parsed.call_sid || null,
    raw: parsed,
  };
}

/**
 * Fetch the post-call data (transcript, audio URL, summary) for a conversation.
 * Used as a fallback if the webhook is missed.
 */
async function getConversation(conversation_id) {
  const apiKey = getApiKey();
  const res = await fetch(`${EL_BASE}/v1/convai/conversations/${conversation_id}`, {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`getConversation ${res.status}`);
  return res.json();
}

/**
 * Verify the EL webhook HMAC signature. Header format:
 *   ElevenLabs-Signature: t=<unix_ts>,v0=<hex_hmac_sha256>
 * Signed payload is `${ts}.${rawBody}`. Tolerance window: 300s.
 */
async function verifyWebhookSignature(rawBody, signatureHeader, secret = process.env.ELEVENLABS_WEBHOOK_SECRET) {
  if (!secret) return { ok: false, reason: 'no secret configured' };
  if (!signatureHeader) return { ok: false, reason: 'no signature header' };

  const parts = Object.fromEntries(
    signatureHeader.split(',').map(kv => kv.split('=').map(s => s.trim()))
  );
  const ts = parts.t;
  const sig = parts.v0;
  if (!ts || !sig) return { ok: false, reason: 'malformed header' };

  const age = Math.abs(Date.now() / 1000 - parseInt(ts, 10));
  if (age > 300) return { ok: false, reason: `timestamp ${age}s old` };

  const { createHmac, timingSafeEqual } = require('node:crypto');
  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(sig, 'hex');
  if (a.length !== b.length) return { ok: false, reason: 'length mismatch' };

  const ok = timingSafeEqual(a, b);
  return ok ? { ok: true } : { ok: false, reason: 'hmac mismatch' };
}

module.exports = {
  initiateOutboundCall,
  getConversation,
  verifyWebhookSignature,
};
