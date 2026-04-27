// Twilio helpers.
// We don't dial via Twilio directly — ElevenLabs does that — but we use Twilio
// to verify call-leg metadata, look up CNAM status, and (optionally) for AMD
// (answering machine detection) on a separate path if EL's AMD doesn't work.
//
// For Phase 4 the only thing we actually need is to provision a number and
// register CNAM. Both of those are one-shot operations done from
// scripts/provision-twilio.js.

const Twilio = require('twilio');

let _client = null;
function getClient() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured');
  _client = Twilio(sid, tok);
  return _client;
}

/**
 * One-shot: search and buy a US local number in the given area code.
 * @returns {Promise<{phoneNumber:string, sid:string}>}
 */
async function provisionNumber(areaCode = '617') {
  const client = getClient();

  const available = await client.availablePhoneNumbers('US').local.list({
    areaCode,
    voiceEnabled: true,
    smsEnabled: true,
    limit: 5,
  });
  if (!available.length) throw new Error(`no numbers available in ${areaCode}`);

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    friendlyName: 'Evolve Studio Outbound',
  });

  return { phoneNumber: purchased.phoneNumber, sid: purchased.sid };
}

/**
 * Pull metadata about a Twilio call SID (used by webhook handlers).
 */
async function getCall(sid) {
  return getClient().calls(sid).fetch();
}

module.exports = { provisionNumber, getCall };
