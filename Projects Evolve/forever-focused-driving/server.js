const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// ─── Security & Middleware ───────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Allow inline styles/scripts in index.html
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json({ limit: '50kb' }));

// Rate limit API routes — 30 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please wait a moment.' },
});
app.use('/api', apiLimiter);

// Serve static files
app.use(express.static(path.join(__dirname), {
  maxAge: '1d',
  etag: true,
  index: 'index.html',
}));

// ─── Config ──────────────────────────────────────────────────────────────────
const TIMEZONE = 'America/New_York';
const OWNER_NAME = 'Alexa';
const OWNER_EMAIL = process.env.OWNER_EMAIL || '';
const BUSINESS_NAME = 'Forever Focused Driving Academy';
const BUSINESS_PHONE = '(617) 990-1299';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ICS_TOKEN = process.env.ICS_TOKEN || '';
const SITE_URL = process.env.SITE_URL || 'https://foreverfocuseddriving.com';

// Service definitions with durations and pricing
const SERVICES = {
  '1hr-city':          { label: '1-Hour City Driving Lesson',     duration: 60,  price: '$80' },
  '2hr-city':          { label: '2-Hour City Driving Lesson',     duration: 120, price: '$160' },
  '1hr-private':       { label: '1-Hour Private Lesson',          duration: 60,  price: '$120' },
  '2hr-private':       { label: '2-Hour Private Lesson',          duration: 120, price: '$240' },
  'road-exam-prep':    { label: 'Road Exam Prep / Maneuvers',     duration: 120, price: '$160' },
  'highway':           { label: 'Highway Lesson',                 duration: 120, price: '$240' },
  'road-test-sponsor': { label: 'Road Test Sponsorship',          duration: 120, price: 'from $180' },
};

// ─── Data Store (JSON files) ─────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');
const CAREERS_FILE = path.join(DATA_DIR, 'careers.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// Schedule shape:
// {
//   weekly:    { "0": [], "1": [9,10,11], ... }   // weekday (0=Sun) -> open start hours
//   overrides: { "2026-09-12": { closed: true } | { hours: [9, 13] } }
// }
function getSchedule() {
  return readJson(SCHEDULE_FILE, { weekly: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, overrides: {} });
}
function getBookings() {
  return readJson(BOOKINGS_FILE, []);
}

// ─── Timezone Helpers ────────────────────────────────────────────────────────
function nowEastern() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
}

// Build a real Date for a given Eastern-local date + hour (DST-aware)
function easternDateTime(dateStr, hour, minute = 0) {
  const dtStr = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  const testDate = new Date(dtStr + 'Z');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(testDate);
  const offsetPart = parts.find(p => p.type === 'timeZoneName');
  const offsetMatch = offsetPart?.value.match(/GMT([+-]?\d+)/);
  let offset = '-05:00';
  if (offsetMatch) {
    const hrs = parseInt(offsetMatch[1]);
    offset = `${hrs >= 0 ? '+' : '-'}${String(Math.abs(hrs)).padStart(2, '0')}:00`;
  }
  return new Date(`${dtStr}${offset}`);
}

function hourLabel(h) {
  const hour12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${hour12}:00 ${h >= 12 ? 'PM' : 'AM'}`;
}

// Which start hours are open on a given date, per the owner's schedule
function openHoursForDate(dateStr) {
  const schedule = getSchedule();
  const override = schedule.overrides[dateStr];
  if (override) {
    if (override.closed) return [];
    if (Array.isArray(override.hours)) return [...override.hours].sort((a, b) => a - b);
  }
  const weekday = new Date(dateStr + 'T12:00:00').getDay();
  return [...(schedule.weekly[String(weekday)] || [])].sort((a, b) => a - b);
}

// Compute bookable start hours for a date + service duration
function availableSlots(dateStr, slotMinutes) {
  const openHours = new Set(openHoursForDate(dateStr));
  const hoursNeeded = Math.ceil(slotMinutes / 60);
  const bookings = getBookings().filter(b => b.date === dateStr && b.status !== 'cancelled');

  const results = [];
  for (const h of [...openHours].sort((a, b) => a - b)) {
    // Every hour the lesson spans must be open
    let allOpen = true;
    for (let i = 0; i < hoursNeeded; i++) {
      if (!openHours.has(h + i)) { allOpen = false; break; }
    }
    if (!allOpen) continue;

    // No overlap with existing bookings
    const start = h;
    const end = h + slotMinutes / 60;
    const conflict = bookings.some(b => {
      const bStart = b.hour;
      const bEnd = b.hour + (SERVICES[b.service]?.duration || 60) / 60;
      return start < bEnd && end > bStart;
    });
    if (conflict) continue;

    // No past slots
    const slotStart = easternDateTime(dateStr, h);
    if (slotStart <= new Date()) continue;

    results.push(h);
  }
  return results;
}

// ─── ICS (calendar file / feed) ──────────────────────────────────────────────
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function icsUtc(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function bookingToVevent(b) {
  const svc = SERVICES[b.service] || { label: b.service, duration: 60, price: '' };
  const start = easternDateTime(b.date, b.hour);
  const end = new Date(start.getTime() + svc.duration * 60 * 1000);
  return [
    'BEGIN:VEVENT',
    `UID:${b.id}@foreverfocuseddriving`,
    `DTSTAMP:${icsUtc(new Date(b.createdAt || Date.now()))}`,
    `DTSTART:${icsUtc(start)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${icsEscape(`${svc.label} — ${b.name}`)}`,
    `DESCRIPTION:${icsEscape(`Student: ${b.name}\nPhone: ${b.phone}\nEmail: ${b.email}\nService: ${svc.label} (${svc.price})\nBooked via ${SITE_URL}`)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Upcoming driving lesson',
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}
function buildIcsFeed(bookings) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Forever Focused Driving Academy//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(BUSINESS_NAME + ' — Lessons')}`,
    `X-WR-TIMEZONE:${TIMEZONE}`,
    ...bookings.map(bookingToVevent),
    'END:VCALENDAR',
  ].join('\r\n');
}

// ─── Email Notifications ─────────────────────────────────────────────────────
let transporter = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  console.log('✓ Email notifications enabled (SMTP)');
} else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  console.log('✓ Email notifications enabled (Gmail)');
} else {
  console.log('⚠ Email notifications disabled — set GMAIL_USER + GMAIL_APP_PASSWORD in .env');
}

const FROM = () => `"${BUSINESS_NAME}" <${process.env.GMAIL_USER || process.env.SMTP_USER}>`;

async function sendBookingNotification(booking) {
  if (!transporter) return;
  const { name, phone, email, service, date, time } = booking;
  const svc = SERVICES[service] || { label: service, price: '' };

  // Single-event .ics attachment — opens in ANY calendar app (Google, Apple, Outlook)
  const ics = buildIcsFeed([booking]);
  const attachment = {
    filename: 'lesson.ics',
    content: ics,
    contentType: 'text/calendar; method=PUBLISH',
  };

  if (OWNER_EMAIL) {
    try {
      await transporter.sendMail({
        from: FROM(),
        to: OWNER_EMAIL,
        subject: `New Booking: ${svc.label} — ${name}`,
        attachments: [attachment],
        html: `
          <div style="font-family: sans-serif; max-width: 500px;">
            <h2 style="color: #111;">New Lesson Booked</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; font-weight: bold;">Student</td><td style="padding: 8px;">${name}</td></tr>
              <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">${svc.label} (${svc.price})</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">${date}</td></tr>
              <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">${time}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Phone</td><td style="padding: 8px;"><a href="tel:${phone}">${phone}</a></td></tr>
              <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;"><a href="mailto:${email}">${email}</a></td></tr>
            </table>
            <p style="color: #666; font-size: 13px; margin-top: 16px;">If your calendar is subscribed to the booking feed, this lesson will appear automatically. The attached invite also adds it with one tap.</p>
          </div>
        `,
      });
    } catch (err) {
      console.error('Failed to send owner notification:', err.message);
    }
  }

  try {
    await transporter.sendMail({
      from: FROM(),
      to: email,
      subject: `Booking Confirmed — ${svc.label}`,
      attachments: [attachment],
      html: `
        <div style="font-family: sans-serif; max-width: 500px;">
          <h2 style="color: #111;">You're All Set, ${name}!</h2>
          <p>Your driving lesson has been confirmed:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; font-weight: bold;">Service</td><td style="padding: 8px;">${svc.label}</td></tr>
            <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Date</td><td style="padding: 8px;">${date}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Time</td><td style="padding: 8px;">${time}</td></tr>
            <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Price</td><td style="padding: 8px;">${svc.price}</td></tr>
          </table>
          <p><strong>Instructor:</strong> ${OWNER_NAME}</p>
          <p>The attached invite adds this lesson to your calendar with one tap.</p>
          <p>Need to reschedule? Call or text <a href="tel:${BUSINESS_PHONE}">${BUSINESS_PHONE}</a></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">${BUSINESS_NAME} — 810 Memorial Dr, Suite 205B, Cambridge, MA 02139</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Failed to send student confirmation:', err.message);
  }
}

// ─── Admin Auth ──────────────────────────────────────────────────────────────
function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: 'Admin password not configured on server.' });
  const key = req.get('x-admin-key') || '';
  if (!timingSafeEqual(key, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

// ─── Public API ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', email: !!transporter });
});

// GET /api/availability?date=YYYY-MM-DD&service=1hr-city
app.get('/api/availability', (req, res) => {
  const { date, service } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }
  const today = nowEastern();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (date < todayStr) return res.json({ date, slots: [] });

  const svc = SERVICES[service];
  const slotMinutes = svc ? svc.duration : 60;
  const hours = availableSlots(date, slotMinutes);
  res.json({ date, slots: hours.map(hourLabel) });
});

// POST /api/book
app.post('/api/book', (req, res) => {
  const { date, time, name, phone, email, service } = req.body;

  if (!date || !time || !name || !phone || !email || !service) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  const svc = SERVICES[service];
  if (!svc) return res.status(400).json({ error: 'Invalid service selected.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address.' });
  if (phone.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Invalid phone number.' });

  const timeMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!timeMatch) return res.status(400).json({ error: 'Invalid time format.' });
  let hour = parseInt(timeMatch[1]);
  const ampm = timeMatch[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  const startTime = easternDateTime(date, hour);
  if (startTime <= new Date()) return res.status(400).json({ error: 'Cannot book a time in the past.' });

  // Re-check the slot is genuinely open right now
  const open = availableSlots(date, svc.duration);
  if (!open.includes(hour)) {
    return res.status(409).json({ error: 'This time slot was just taken. Please choose another.' });
  }

  const booking = {
    id: crypto.randomUUID(),
    date,
    hour,
    time: hourLabel(hour),
    name: String(name).slice(0, 100),
    phone: String(phone).slice(0, 30),
    email: String(email).slice(0, 100),
    service,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };

  const bookings = getBookings();
  bookings.push(booking);
  writeJson(BOOKINGS_FILE, bookings);

  sendBookingNotification(booking).catch(() => {});
  res.json({ success: true, message: 'Booking confirmed! Check your email for details.' });
});

// GET /calendar/:token.ics — private subscribable feed for the owner's calendar app
app.get('/calendar/:token.ics', (req, res) => {
  if (!ICS_TOKEN || !timingSafeEqual(req.params.token, ICS_TOKEN)) {
    return res.status(404).send('Not found');
  }
  const bookings = getBookings().filter(b => b.status !== 'cancelled');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.send(buildIcsFeed(bookings));
});

// ─── Admin API ───────────────────────────────────────────────────────────────
app.post('/api/admin/login', loginLimiter, (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: 'Admin password not configured on server.' });
  if (!timingSafeEqual(req.body.password || '', ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  res.json({ success: true });
});

app.get('/api/admin/schedule', requireAdmin, (req, res) => {
  res.json(getSchedule());
});

app.put('/api/admin/schedule', requireAdmin, (req, res) => {
  const { weekly, overrides } = req.body || {};
  const clean = { weekly: {}, overrides: {} };
  for (let d = 0; d <= 6; d++) {
    const hours = (weekly && weekly[String(d)]) || [];
    clean.weekly[String(d)] = [...new Set(hours.map(Number))]
      .filter(h => Number.isInteger(h) && h >= 5 && h <= 21)
      .sort((a, b) => a - b);
  }
  if (overrides && typeof overrides === 'object') {
    for (const [dateStr, ov] of Object.entries(overrides)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !ov) continue;
      if (ov.closed) {
        clean.overrides[dateStr] = { closed: true };
      } else if (Array.isArray(ov.hours)) {
        clean.overrides[dateStr] = {
          hours: [...new Set(ov.hours.map(Number))]
            .filter(h => Number.isInteger(h) && h >= 5 && h <= 21)
            .sort((a, b) => a - b),
        };
      }
    }
  }
  writeJson(SCHEDULE_FILE, clean);
  res.json({ success: true, schedule: clean });
});

app.get('/api/admin/bookings', requireAdmin, (req, res) => {
  const bookings = getBookings()
    .filter(b => b.status !== 'cancelled')
    .sort((a, b) => (a.date + String(a.hour).padStart(2, '0')).localeCompare(b.date + String(b.hour).padStart(2, '0')))
    .map(b => ({ ...b, serviceLabel: SERVICES[b.service]?.label || b.service }));
  res.json({ bookings });
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const bookings = getBookings();
  const booking = bookings.find(b => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  booking.status = 'cancelled';
  booking.cancelledAt = new Date().toISOString();
  writeJson(BOOKINGS_FILE, bookings);
  res.json({ success: true });
});

app.get('/api/admin/feed-url', requireAdmin, (req, res) => {
  if (!ICS_TOKEN) return res.json({ url: null });
  res.json({ url: `${SITE_URL}/calendar/${ICS_TOKEN}.ics` });
});

// ─── Careers (email + local log, no Google Sheets) ───────────────────────────
app.post('/api/careers', async (req, res) => {
  const { name, phone, email, license, message } = req.body;

  if (!name || !phone || !email) return res.status(400).json({ error: 'Name, phone, and email are required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email address.' });
  if (phone.replace(/\D/g, '').length < 10) return res.status(400).json({ error: 'Invalid phone number.' });

  const licenseLabels = {
    'yes': 'Yes, currently licensed',
    'in-progress': 'In progress / studying',
    'no': 'No, but interested in obtaining one',
    '': 'Not specified',
  };

  const entry = {
    submittedAt: new Date().toISOString(),
    name, phone, email,
    license: licenseLabels[license] || license || 'Not specified',
    message: message || '',
  };
  const applications = readJson(CAREERS_FILE, []);
  applications.push(entry);
  writeJson(CAREERS_FILE, applications);

  if (transporter && OWNER_EMAIL) {
    try {
      await transporter.sendMail({
        from: FROM(),
        to: OWNER_EMAIL,
        subject: `New Instructor Application: ${name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px;">
            <h2 style="color: #111;">New Instructor Application</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; font-weight: bold;">Name</td><td style="padding: 8px;">${name}</td></tr>
              <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Phone</td><td style="padding: 8px;"><a href="tel:${phone}">${phone}</a></td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;"><a href="mailto:${email}">${email}</a></td></tr>
              <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">RMV License</td><td style="padding: 8px;">${entry.license}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Message</td><td style="padding: 8px;">${message || 'No message provided'}</td></tr>
            </table>
          </div>
        `,
      });
    } catch (err) {
      console.error('Failed to send career notification:', err.message);
    }
  }

  if (transporter) {
    try {
      await transporter.sendMail({
        from: FROM(),
        to: email,
        subject: `Application Received — ${BUSINESS_NAME}`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px;">
            <h2 style="color: #111;">Thanks for Your Interest, ${name}!</h2>
            <p>We received your application to join the Forever Focused Driving Academy team. Alexa will review your info and reach out soon.</p>
            <p>If you have any questions in the meantime, call or text <a href="tel:${BUSINESS_PHONE}">${BUSINESS_PHONE}</a>.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 12px;">${BUSINESS_NAME} — 810 Memorial Dr, Suite 205B, Cambridge, MA 02139</p>
          </div>
        `,
      });
    } catch (err) {
      console.error('Failed to send career confirmation:', err.message);
    }
  }

  res.json({ success: true, message: 'Application received.' });
});


// ─── Square Appointments proxy (public buyer API, no auth needed) ───────────
const SQUARE_MERCHANT = process.env.SQUARE_MERCHANT || 'uxsphao02hdarx';
const SQUARE_LOCATION = process.env.SQUARE_LOCATION || 'LFX3M7S62PB2R';
const SQUARE_API = 'https://app.squareup.com/appointments/api/buyer';
const SQUARE_HEADERS = { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Origin': 'https://book.squareup.com', 'Referer': 'https://book.squareup.com/' };
const sqCache = new Map();
const cached = async (key, ttlMs, fn) => {
  const hit = sqCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.val;
  const val = await fn();
  sqCache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
};

async function squareWidget() {
  return cached('widget', 10 * 60 * 1000, async () => {
    const r = await fetch(`${SQUARE_API}/widget/${SQUARE_MERCHANT}`, { headers: SQUARE_HEADERS });
    if (!r.ok) throw new Error(`Square widget ${r.status}`);
    const d = await r.json();
    const staffById = Object.fromEntries((d.staff || []).map(s => [s.id, s]));
    const services = (d.services || []).map(s => {
      const v = (s.variations || [])[0] || {};
      const staff = (v.staff_ids || s.staff_ids || []).map(id => staffById[id]).filter(Boolean);
      return {
        id: s.id, name: s.name, description: s.description || '',
        price_cents: v.price_cents ?? s.price_cents ?? null,
        minutes: Math.round((v.service_time ?? s.time ?? 0) / 60),
        variation_id: v.id || s.item_variation_token,
        staff_ids: staff.map(x => x.id), employee_tokens: staff.map(x => x.employee_token),
        ordinal: s.ordinal ?? 0,
      };
    }).sort((a, b) => a.ordinal - b.ordinal);
    return { business: { name: d.business?.name, cancellation_policy: d.business?.cancellation_policy || '' }, location_id: SQUARE_LOCATION, merchant_id: SQUARE_MERCHANT, services };
  });
}

app.get('/api/square/services', async (req, res) => {
  try { res.set('Cache-Control', 'public, max-age=300'); res.json(await squareWidget()); }
  catch (e) { console.error('square services', e.message); res.status(502).json({ error: 'Square unavailable' }); }
});

// Eastern-time helpers (Square's widget queries in the business timezone)
const ET = 'America/New_York';
const etParts = d => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(d).map(p => [p.type, p.value]));
const etDayKey = d => { const p = etParts(d); return `${p.year}-${p.month}-${p.day}`; };
const etOffsetFor = (ymd) => etParts(new Date(`${ymd}T12:00:00Z`)).timeZoneName.replace('GMT', '') || '-05:00';
const etTime = (ymd, hms) => new Date(`${ymd}T${hms}${etOffsetFor(ymd)}`);
const addDays = (ymd, n) => etDayKey(new Date(etTime(ymd, '12:00:00').getTime() + n * 86400000));

async function fetchAvailability(variation, startAt, endAt) {
  const w = await squareWidget();
  const svc = w.services.find(s => s.variation_id === variation);
  if (!svc) throw Object.assign(new Error('Unknown service'), { status: 400 });
  const key = `avail:${variation}:${startAt.toISOString()}:${endAt.toISOString()}`;
  return cached(key, 90 * 1000, async () => {
    const body = { search_availability_request: { query: { filter: {
      start_at_range: { start_at: startAt.toISOString(), end_at: endAt.toISOString() },
      location_id: SQUARE_LOCATION,
      segment_filters: [{ service_variation_id: variation, team_member_id_filter: { any: svc.employee_tokens } }],
    } } } };
    const r = await fetch(`${SQUARE_API}/availability`, { method: 'POST', headers: SQUARE_HEADERS, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(d.errors || d));
    return (d.availability || []).filter(a => a.available !== false).map(a => ({ start: a.start, end: a.end }));
  });
}

// GET /api/square/availability?variation=ID&from=YYYY-MM-DD   → same 31-day window Square's own widget uses
// GET /api/square/availability?variation=ID&day=YYYY-MM-DD    → single-day check (what Square runs at checkout)
app.get('/api/square/availability', async (req, res) => {
  try {
    const { variation, from, day } = req.query;
    const today = etDayKey(new Date());
    let startAt, endAt;
    if (day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'Bad day' });
      startAt = etTime(day, '00:00:00'); endAt = etTime(addDays(day, 1), '23:59:59');
    } else {
      let start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : today;
      if (start < today) start = today;
      startAt = etTime(start, '00:00:00');
      endAt = new Date(etTime(addDays(start, 31), '23:59:59').getTime() - 3600000);
    }
    let slots = await fetchAvailability(variation, startAt, endAt);
    if (!day) {
      // Square's checkout re-queries a single day and can drop slots the month view showed.
      // Intersect with per-day results so every slot we show is guaranteed to survive checkout.
      const days = [...new Set(slots.map(s => etDayKey(new Date(s.start * 1000))))];
      const perDay = await Promise.all(days.map(d => fetchAvailability(variation, etTime(d, '00:00:00'), etTime(addDays(d, 1), '23:59:59')).catch(() => null)));
      const ok = new Set();
      perDay.forEach((list, i) => { if (list) list.forEach(s => { if (etDayKey(new Date(s.start * 1000)) === days[i]) ok.add(s.start); }); });
      slots = slots.filter((s, i) => perDay[days.indexOf(etDayKey(new Date(s.start * 1000)))] === null || ok.has(s.start));
    }
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ variation, start: startAt.toISOString(), end: endAt.toISOString(), slots });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('square availability', e.message); res.status(502).json({ error: 'Square unavailable' });
  }
});

// ─── Admin page + fallback ───────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/book', (req, res) => {
  res.sendFile(path.join(__dirname, 'book.html'));
});

app.get('/services', (req, res) => {
  res.sendFile(path.join(__dirname, 'services.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ${BUSINESS_NAME}`);
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log(`  Admin:    http://localhost:${PORT}/admin ${ADMIN_PASSWORD ? '✓' : '✗ set ADMIN_PASSWORD in .env'}`);
  console.log(`  ICS feed: ${ICS_TOKEN ? '✓ enabled' : '✗ set ICS_TOKEN in .env'}`);
  console.log(`  Email:    ${transporter ? '✓ enabled' : '✗ disabled'}\n`);
});
