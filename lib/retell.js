// Retell AI adapter — drop-in replacement for lib/elevenlabs.js.
//
// Outbound flow:
//   1. We have one Retell Agent created via scripts/seed-retell-agent.js with
//      a system prompt that uses {{variable}} placeholders.
//   2. We have one phone number imported into Retell (from Twilio).
//   3. To dial, POST /v2/create-phone-call with from_number, to_number,
//      override_agent_id, and retell_llm_dynamic_variables.
//   4. Retell initiates the call, runs the agent, executes tool calls by
//      HTTPing our registered tool endpoints, then fires `call_analyzed` /
//      `call_ended` webhooks → /api/webhooks/retell.
//
// Docs:
//   https://docs.retellai.com/api-references/create-phone-call

const RETELL_BASE = 'https://api.retellai.com';

function getApiKey() {
  const k = process.env.RETELL_API_KEY;
  if (!k) throw new Error('RETELL_API_KEY not configured');
  return k;
}

function getAgentId() {
  const id = process.env.RETELL_AGENT_ID;
  if (!id) throw new Error('RETELL_AGENT_ID not configured (run scripts/seed-retell-agent.js)');
  return id;
}

function getFromNumber() {
  const n = process.env.RETELL_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;
  if (!n) throw new Error('RETELL_FROM_NUMBER (or TWILIO_PHONE_NUMBER) not configured');
  return n;
}

/**
 * Initiate an outbound call via Retell.
 * Returns the same shape as ElevenLabs' wrapper so callers don't care which provider.
 *
 * @param {object} input
 * @param {string} input.to_number        - destination, +1XXXYYYZZZZ
 * @param {object} input.dynamic_variables - merged into the agent's system prompt
 * @returns {Promise<{conversation_id:string, callSid:string, raw:object}>}
 */
async function initiateOutboundCall(input) {
  const apiKey = getApiKey();
  const agentId = getAgentId();
  const fromNumber = getFromNumber();

  const body = {
    from_number: fromNumber,
    to_number: input.to_number,
    override_agent_id: agentId,
    retell_llm_dynamic_variables: input.dynamic_variables || {},
  };

  const res = await fetch(`${RETELL_BASE}/v2/create-phone-call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Retell create-phone-call failed ${res.status}: ${text.slice(0, 400)}`);
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }

  // Retell returns { call_id, agent_id, call_status, from_number, to_number, ... }
  // We normalize: conversation_id = Retell's call_id, callSid = same (no separate Twilio SID exposed)
  return {
    conversation_id: parsed.call_id || null,
    callSid: parsed.call_id || null, // Retell wraps Twilio — call_id is the canonical handle
    raw: parsed,
  };
}

/**
 * Fetch full call data (transcript, recording, analysis) for a Retell call.
 * Used as a fallback if the webhook is missed.
 */
async function getConversation(call_id) {
  const apiKey = getApiKey();
  const res = await fetch(`${RETELL_BASE}/v2/get-call/${call_id}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Retell getCall ${res.status}`);
  return res.json();
}

/**
 * Verify the Retell webhook signature.
 * Retell signs with HMAC-SHA256 of the raw body using the API key as the secret.
 * Header: `x-retell-signature: <hex-sha256>`
 *
 * Docs: https://docs.retellai.com/features/webhooks#verify-webhook-payload
 */
async function verifyWebhookSignature(rawBody, signatureHeader, secret = process.env.RETELL_API_KEY) {
  if (!secret) return { ok: false, reason: 'no secret configured' };
  if (!signatureHeader) return { ok: false, reason: 'no signature header' };

  const sig = String(signatureHeader).trim();
  const { createHmac, timingSafeEqual } = require('node:crypto');
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
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
