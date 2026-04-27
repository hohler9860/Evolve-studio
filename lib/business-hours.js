// Per-business hours gating.
//
// Apify Google Maps returns `openingHours` as either:
//   - empty array (no data) → fall back to global 9-5 ET
//   - [{day:"Monday",hours:"Open 24 hours"}, ...] → ignore "24 hours" (marketing) → fall back to 9-5
//   - [{day:"Monday",hours:"9 AM to 5 PM"}, ...] → honor literal hours
//   - [{day:"Sunday",hours:"Closed"}] → skip if today
//
// MA + NY are both America/New_York. If we ever target other regions we'd
// look up timezone by zip; for now hardcoded to ET.

const ET_TZ = 'America/New_York';

function nowInET() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date()).reduce((acc, p) => (acc[p.type] = p.value, acc), {});
}

/**
 * Parse a Google Maps hours string for a single day.
 * @returns {{open:boolean, openMinute?:number, closeMinute?:number}}
 */
function parseDayHours(hoursStr) {
  if (!hoursStr) return { open: false };
  const s = String(hoursStr).toLowerCase().trim();
  if (s === 'closed') return { open: false };
  if (s.includes('open 24') || s === '24 hours') {
    // 24/7 claim from Google Maps is usually marketing, not literal staffing.
    // We treat it as "no usable hours data" → caller falls back to global window.
    return { open: true, fallback: true };
  }

  // "9 AM to 5 PM" / "9:00 AM – 5:30 PM" / "9am-5pm"
  const match = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!match) return { open: false };

  const [, sH, sM = '0', sP, eH, eM = '0', eP] = match;
  const startHour = (parseInt(sH, 10) % 12) + (sP === 'pm' ? 12 : 0);
  const endHour = (parseInt(eH, 10) % 12) + (eP === 'pm' ? 12 : 0);
  const openMinute = startHour * 60 + parseInt(sM, 10);
  let closeMinute = endHour * 60 + parseInt(eM, 10);
  if (closeMinute <= openMinute) closeMinute += 24 * 60; // overnight (e.g. bar)
  return { open: true, openMinute, closeMinute };
}

/**
 * Check if a business is currently open per their stored Google Maps hours.
 * @param {Array} hours - businesses.metadata.hours array
 * @returns {{open:boolean, fallback:boolean, reason?:string}}
 *   `fallback: true` means hours data isn't usable (24/7 or missing); caller
 *   should fall back to the global 9-5 ET window via lib/compliance.
 */
function isOpenNow(hours) {
  if (!Array.isArray(hours) || hours.length === 0) {
    return { open: true, fallback: true, reason: 'no hours data' };
  }
  const t = nowInET();
  const today = t.weekday;
  const todayEntry = hours.find(h => h.day === today);
  if (!todayEntry) return { open: true, fallback: true, reason: `no entry for ${today}` };

  const parsed = parseDayHours(todayEntry.hours);
  if (parsed.fallback) return { open: true, fallback: true, reason: '24/7 marketing claim' };
  if (!parsed.open) return { open: false, fallback: false, reason: `closed today (${todayEntry.hours})` };

  const nowMin = parseInt(t.hour, 10) * 60 + parseInt(t.minute, 10);
  if (nowMin >= parsed.openMinute && nowMin < parsed.closeMinute) {
    return { open: true, fallback: false };
  }
  return {
    open: false,
    fallback: false,
    reason: `outside business hours (now ${t.hour}:${t.minute}, hours ${todayEntry.hours})`,
  };
}

module.exports = { isOpenNow, parseDayHours };
