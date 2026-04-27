// /api/webhooks/twilio — Twilio call status callbacks.
// Currently optional; ElevenLabs already gives us call outcomes via post_call_transcription.
// We accept Twilio's status events as a backup signal for failed/no-answer/busy
// where EL never finishes a call.

const { getDB } = require('../../db');

async function readForm(req) {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', c => data += c);
    req.on('end', () => {
      const params = Object.fromEntries(new URLSearchParams(data).entries());
      resolve(params);
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const params = await readForm(req);
  const db = getDB();

  await db.from('webhook_events').insert({
    source: 'twilio',
    event_type: params.CallStatus || 'unknown',
    payload: params,
  });

  const sid = params.CallSid;
  const status = params.CallStatus;
  if (!sid || !status) return res.status(200).end();

  // Map Twilio statuses to our enum
  const map = {
    'no-answer': 'no_answer',
    'busy': 'busy',
    'failed': 'failed',
    'canceled': 'failed',
  };
  const mapped = map[status];
  if (mapped) {
    await db.from('call_attempts').update({
      status: mapped,
      end_reason: `twilio:${status}`,
    }).eq('twilio_call_sid', sid).eq('status', 'dialing');
  }

  res.status(200).end();
};

module.exports.config = { api: { bodyParser: false } };
