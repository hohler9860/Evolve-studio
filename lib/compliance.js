// Compliance helpers — gate every outbound dial.
//
// Rules enforced:
//   1. Calling hours: 9am-5pm in the called number's local timezone.
//      MA + NY are both America/New_York → simple. If we ever target other
//      regions we map by area code. For now: ET only, weekdays only.
//   2. Federal holidays: skip entirely.
//   3. Per-business cooldown: 30 days unless they answered (handled in caller).
//   4. DNC list: phone present in dnc_phone_numbers OR businesses.dnc_until > now.
//   5. Recording-consent: opt-out phrase detector for use during the call.
//   6. AI + recording disclosure: enforced at script level; verified per call.
//
// Pure logic where possible; DB hits are clearly marked.

const ET_TZ = 'America/New_York';

const FEDERAL_HOLIDAYS_2026 = new Set([
  '2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19',
  '2026-07-03','2026-07-04','2026-09-07','2026-10-12','2026-11-11',
  '2026-11-26','2026-12-25'
]);

const RECORDING_OPT_OUT_PHRASES = [
  'do not record', "don't record", 'stop recording', 'no recording',
  'i do not consent', 'i don\'t consent'
];

const FULL_OPT_OUT_PHRASES = [
  'take me off your list', 'remove me from your list', 'do not call',
  "don't call me again", 'put me on your do not call', 'never call again'
];

/**
 * Is this moment within calling hours? Returns { ok, reason }.
 */
function isWithinCallingHours(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ,
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(now).reduce((acc, p) => (acc[p.type] = p.value, acc), {});

  const dow = parts.weekday;            // "Mon", "Tue", ...
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = parseInt(parts.hour, 10);

  if (dow === 'Sat' || dow === 'Sun') return { ok: false, reason: 'weekend' };
  if (FEDERAL_HOLIDAYS_2026.has(date)) return { ok: false, reason: `federal holiday ${date}` };
  if (hour < 9)  return { ok: false, reason: `before 9am ET (now ${hour}h)` };
  if (hour >= 17) return { ok: false, reason: `after 5pm ET (now ${hour}h)` };
  return { ok: true };
}

const { isOpenNow } = require('./business-hours');

/**
 * DNC + cooldown + business-hours check. Hits the DB.
 * @param {object} db - supabase client
 * @param {string} phone_e164
 * @param {string} business_id
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function isCallable(db, phone_e164, business_id) {
  if (!phone_e164) return { ok: false, reason: 'no phone' };

  // 1. Global DNC list
  const { data: dnc } = await db
    .from('dnc_phone_numbers')
    .select('phone_e164')
    .eq('phone_e164', phone_e164)
    .maybeSingle();
  if (dnc) return { ok: false, reason: 'on DNC list' };

  // 2. Per-business cooldown / DNC-until + hours
  const { data: biz } = await db
    .from('businesses')
    .select('dnc_until, last_called_at, disqualified_reason, metadata')
    .eq('id', business_id)
    .maybeSingle();
  if (!biz) return { ok: false, reason: 'business not found' };
  if (biz.disqualified_reason) return { ok: false, reason: `disqualified: ${biz.disqualified_reason}` };

  const now = Date.now();
  if (biz.dnc_until && new Date(biz.dnc_until).getTime() > now) {
    return { ok: false, reason: `cooldown until ${biz.dnc_until}` };
  }
  // 30-day cooldown if last_called_at set and no booking happened
  if (biz.last_called_at) {
    const days = (now - new Date(biz.last_called_at).getTime()) / 86400000;
    if (days < 30) return { ok: false, reason: `${days.toFixed(1)} days since last call (need 30)` };
  }

  // 3. Per-business hours — only call when they're actually open.
  // Fallback (24/7 marketing claim or missing data) is handled by the global
  // 9-5 ET hours-gate in isWithinCallingHours() which the caller checks separately.
  const hoursCheck = isOpenNow(biz.metadata?.hours);
  if (!hoursCheck.open) return { ok: false, reason: `business hours: ${hoursCheck.reason}` };

  return { ok: true };
}

/**
 * Add a phone to the DNC list. Idempotent.
 */
async function addToDNC(db, phone_e164, source, notes = '') {
  if (!phone_e164) return;
  await db.from('dnc_phone_numbers').upsert(
    { phone_e164, source, notes },
    { onConflict: 'phone_e164', ignoreDuplicates: false }
  );
}

/**
 * Detect recording opt-out in a turn of transcript. Used by the EL webhook
 * + by the agent's tool-call path.
 */
function containsRecordingOptOut(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return RECORDING_OPT_OUT_PHRASES.some(p => t.includes(p));
}

/**
 * Detect general DNC opt-out in a transcript turn.
 */
function containsFullOptOut(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return FULL_OPT_OUT_PHRASES.some(p => t.includes(p));
}

/**
 * Verify the AI + recording disclosure was actually said in the opening.
 * Used by post-call audit. Looks at first ~30 seconds of transcript.
 */
function verifyOpeningDisclosure(transcript) {
  if (!transcript) return { ai: false, recording: false };
  const opening = transcript.slice(0, 1200).toLowerCase();
  const ai = /\b(ai|automated|artificial)\b/.test(opening) && /\b(assistant|voice|caller|calling on behalf)\b/.test(opening);
  const recording = /\b(recorded|recording)\b/.test(opening);
  return { ai, recording };
}

module.exports = {
  isWithinCallingHours,
  isCallable,
  addToDNC,
  containsRecordingOptOut,
  containsFullOptOut,
  verifyOpeningDisclosure,
};
