// Cal.com booking helper. Two responsibilities:
//   1. Book a meeting from the agent's mid-call tool call (book_meeting tool
//      → /api/tools/book-meeting → this module's bookMeeting()).
//   2. Verify Cal.com webhook signatures on incoming meeting events.
//
// API: https://cal.com/docs/developing/api-reference (v2)

const CAL_BASE = 'https://api.cal.com/v2';

function getApiKey() {
  const k = process.env.CAL_COM_API_KEY;
  if (!k) throw new Error('CAL_COM_API_KEY not configured');
  return k;
}

function getEventTypeId() {
  const id = process.env.CAL_COM_EVENT_TYPE_ID;
  if (!id) throw new Error('CAL_COM_EVENT_TYPE_ID not configured');
  return id;
}

/**
 * Create a booking on the configured event type.
 * @param {object} input
 * @param {string} input.attendeeName
 * @param {string} input.attendeeEmail
 * @param {string} input.attendeePhone
 * @param {string} input.start - ISO8601 (UTC)
 * @param {string} [input.timezone='America/New_York']
 * @param {string} [input.metadata.business_id]
 * @returns {Promise<{id:string, joinUrl:string, scheduledFor:string}>}
 */
async function bookMeeting(input) {
  const apiKey = getApiKey();
  const eventTypeId = getEventTypeId();

  const body = {
    eventTypeId: parseInt(eventTypeId, 10),
    start: input.start,
    attendee: {
      name: input.attendeeName,
      email: input.attendeeEmail,
      phoneNumber: input.attendeePhone,
      timeZone: input.timezone || 'America/New_York',
      language: 'en',
    },
    metadata: input.metadata || {},
  };

  const res = await fetch(`${CAL_BASE}/bookings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'cal-api-version': '2024-08-13',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`cal.com booking failed ${res.status}: ${text.slice(0, 300)}`);

  const json = JSON.parse(text);
  const data = json.data || json;
  return {
    id: data.id || data.uid,
    joinUrl: data.meetingUrl || data.location || null,
    scheduledFor: data.start || data.startTime,
    raw: data,
  };
}

/**
 * Suggest open slots in the next N business days (used by the agent's
 * book_meeting tool to propose a time the prospect can pick from).
 */
async function getAvailability(daysAhead = 5) {
  const apiKey = getApiKey();
  const eventTypeId = getEventTypeId();
  const start = new Date().toISOString();
  const end = new Date(Date.now() + daysAhead * 86400000).toISOString();

  const url = `${CAL_BASE}/slots?eventTypeId=${eventTypeId}&start=${start}&end=${end}&timeZone=America/New_York`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'cal-api-version': '2024-09-04',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`cal.com availability ${res.status}`);
  const json = await res.json();
  return json.data?.slots || [];
}

/**
 * Verify Cal.com webhook signature.
 * Header: X-Cal-Signature-256 = hex(hmac_sha256(secret, rawBody))
 */
function verifyWebhookSignature(rawBody, signatureHeader, secret = process.env.CAL_COM_WEBHOOK_SECRET) {
  if (!secret) return { ok: false, reason: 'no secret configured' };
  if (!signatureHeader) return { ok: false, reason: 'no signature header' };

  const { createHmac, timingSafeEqual } = require('node:crypto');
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signatureHeader.replace(/^sha256=/, ''), 'hex');
  if (a.length !== b.length) return { ok: false, reason: 'length mismatch' };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'hmac mismatch' };
}

module.exports = { bookMeeting, getAvailability, verifyWebhookSignature };
