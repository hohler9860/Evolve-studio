// /api/webhooks/cal — handles BOOKING_CREATED, BOOKING_CANCELLED, BOOKING_RESCHEDULED.
// On a new booking: update meetings row, email Henry, append Mockup Pipeline sheet row.

const { getDB } = require('../../db');
const { verifyWebhookSignature } = require('../../cal');
const { notifyMeetingBooked } = require('../../resend');
const { appendMockupRow } = require('../../sheets');

async function readRawBody(req) {
  if (req.body && Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  return await new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', c => data += c);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const raw = await readRawBody(req);
  const sig = req.headers['x-cal-signature-256'];
  const verify = verifyWebhookSignature(raw, sig);
  if (!verify.ok) {
    console.warn('[webhook/cal] sig fail:', verify.reason);
    return res.status(401).json({ error: 'invalid signature' });
  }

  let payload;
  try { payload = JSON.parse(raw); } catch { return res.status(400).json({ error: 'bad json' }); }

  const db = getDB();
  await db.from('webhook_events').insert({
    source: 'cal_com',
    event_type: payload.triggerEvent || 'unknown',
    payload,
  });

  try {
    if (payload.triggerEvent === 'BOOKING_CREATED' || payload.triggerEvent === 'BOOKING_CONFIRMED') {
      const p = payload.payload || {};
      const businessId = p.metadata?.business_id;
      const calBookingId = String(p.uid || p.id);
      const zoomUrl = p.metadata?.videoCallUrl || p.metadata?.meetingUrl || p.location || null;
      const scheduledFor = p.startTime;

      if (!businessId) {
        console.warn('[webhook/cal] no business_id in metadata');
        return res.status(200).json({ ok: true, note: 'missing business_id metadata' });
      }

      const [{ data: business }, { data: contact }] = await Promise.all([
        db.from('businesses').select('*').eq('id', businessId).maybeSingle(),
        db.from('contacts').select('*').eq('business_id', businessId).limit(1).maybeSingle(),
      ]);

      if (!business) return res.status(200).json({ ok: false, note: 'business not found' });

      // Insert meeting row
      const { data: meeting, error: mErr } = await db.from('meetings').insert({
        business_id: businessId,
        contact_id: contact?.id || null,
        cal_com_booking_id: calBookingId,
        zoom_join_url: zoomUrl,
        scheduled_for: scheduledFor,
        status: 'booked',
      }).select('*').single();
      if (mErr) throw mErr;

      // Notify Henry
      await Promise.allSettled([
        notifyMeetingBooked({ business, contact, scheduledFor, zoomUrl }),
        appendMockupRow({ business, contact, meeting }).then(({ updated_range }) =>
          db.from('meetings').update({ google_sheet_row_id: updated_range }).eq('id', meeting.id)
        ),
      ]);

    } else if (payload.triggerEvent === 'BOOKING_CANCELLED') {
      const calBookingId = String(payload.payload?.uid || payload.payload?.id);
      await db.from('meetings').update({ status: 'cancelled' }).eq('cal_com_booking_id', calBookingId);
    } else if (payload.triggerEvent === 'BOOKING_RESCHEDULED') {
      const calBookingId = String(payload.payload?.uid || payload.payload?.id);
      await db.from('meetings').update({
        scheduled_for: payload.payload?.startTime,
      }).eq('cal_com_booking_id', calBookingId);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook/cal] processing failed:', err);
    res.status(200).json({ ok: false, error: err.message });
  }
};

module.exports.config = { api: { bodyParser: false } };
