const express = require('express');
const { google } = require('googleapis');
const path = require('path');
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
  methods: ['GET', 'POST'],
}));
app.use(express.json({ limit: '10kb' }));

// Rate limit API routes — 30 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please wait a moment.' },
});
app.use('/api', apiLimiter);

// Serve static files
app.use(express.static(path.join(__dirname), {
  maxAge: '1d',
  etag: true,
}));

// ─── Config ──────────────────────────────────────────────────────────────────
const TIMEZONE = 'America/New_York';
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';
const OWNER_NAME = 'Alexa';
const OWNER_EMAIL = process.env.OWNER_EMAIL || '';
const BUSINESS_NAME = 'Forever Focused Driving Academy';
const BUSINESS_PHONE = '(617) 990-1299';

// Business hours: 9 AM to 6 PM Eastern
const BUSINESS_START = 9;
const BUSINESS_END = 18;

// Service definitions with durations and pricing
const SERVICES = {
  '1hr-city':          { label: '1-Hour City Driving Lesson',     duration: 60,  price: '$70' },
  '2hr-city':          { label: '2-Hour City Driving Lesson',     duration: 120, price: '$140' },
  '2hr-private':       { label: '2-Hour Private Lesson',          duration: 120, price: '$220' },
  'road-exam-prep':    { label: 'Road Exam Prep / Maneuvers',     duration: 120, price: '$140' },
  'highway':           { label: 'Highway Lesson',                 duration: 120, price: '$220' },
  'road-test-sponsor': { label: 'Road Test Sponsorship',          duration: 120, price: '$180' },
};

// ─── Google Calendar Auth ────────────────────────────────────────────────────
function getCalendar() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

// ─── Google Sheets Auth ─────────────────────────────────────────────────────
function getSheets() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// ─── Timezone Helpers ────────────────────────────────────────────────────────
// Get current time in Eastern timezone (DST-aware)
function nowEastern() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }));
}

// Build an ISO datetime string for a given date + hour in Eastern time
function easternDateTime(dateStr, hour, minute = 0) {
  // Create a date object in Eastern timezone
  const dtStr = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  // Use Intl to figure out the correct UTC offset for this date
  const testDate = new Date(dtStr + 'Z');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(testDate);
  const offsetPart = parts.find(p => p.type === 'timeZoneName');
  // Parse "GMT-5" or "GMT-4" to "-05:00" or "-04:00"
  const offsetMatch = offsetPart?.value.match(/GMT([+-]?\d+)/);
  let offset = '-05:00'; // fallback EST
  if (offsetMatch) {
    const hrs = parseInt(offsetMatch[1]);
    offset = `${hrs >= 0 ? '+' : '-'}${String(Math.abs(hrs)).padStart(2, '0')}:00`;
  }
  return new Date(`${dtStr}${offset}`);
}

// ─── Email Notifications ─────────────────────────────────────────────────────
let transporter = null;

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  console.log('✓ Email notifications enabled');
} else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  console.log('✓ Gmail notifications enabled');
} else {
  console.log('⚠ Email notifications disabled — set GMAIL_USER + GMAIL_APP_PASSWORD in .env');
}

async function sendBookingNotification(booking) {
  if (!transporter) return;

  const { name, phone, email, service, date, time } = booking;
  const svc = SERVICES[service] || { label: service, price: '' };

  // Email to owner
  if (OWNER_EMAIL) {
    try {
      await transporter.sendMail({
        from: `"${BUSINESS_NAME}" <${process.env.GMAIL_USER || process.env.SMTP_USER}>`,
        to: OWNER_EMAIL,
        subject: `New Booking: ${svc.label} — ${name}`,
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
            <p style="color: #666; font-size: 13px; margin-top: 16px;">This event has been added to your Google Calendar.</p>
          </div>
        `,
      });
    } catch (err) {
      console.error('Failed to send owner notification:', err.message);
    }
  }

  // Confirmation email to student
  try {
    await transporter.sendMail({
      from: `"${BUSINESS_NAME}" <${process.env.GMAIL_USER || process.env.SMTP_USER}>`,
      to: email,
      subject: `Booking Confirmed — ${svc.label}`,
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

// ─── API Routes ──────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    email: !!transporter,
    calendar: !!(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
  });
});

// GET /api/availability?date=YYYY-MM-DD&service=1hr-city
app.get('/api/availability', async (req, res) => {
  const { date, service } = req.query;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
  }

  // Validate the date isn't in the past
  const today = nowEastern();
  const requestDate = new Date(date + 'T00:00:00');
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (date < todayStr) {
    return res.json({ date, slots: [] });
  }

  // Determine slot duration based on service
  const svc = SERVICES[service];
  const slotMinutes = svc ? svc.duration : 60;

  try {
    const calendar = getCalendar();
    const timeMin = easternDateTime(date, 0);
    const timeMax = easternDateTime(date, 23, 59);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        timeZone: TIMEZONE,
        items: [{ id: CALENDAR_ID }],
      },
    });

    const busySlots = response.data.calendars[CALENDAR_ID]?.busy || [];

    // Generate slots based on service duration
    const allSlots = [];
    for (let h = BUSINESS_START; h < BUSINESS_END; h++) {
      // For multi-hour services, don't create slots that would extend past business hours
      const endHour = h + slotMinutes / 60;
      if (endHour > BUSINESS_END) continue;

      const hour12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      const ampm = h >= 12 ? 'PM' : 'AM';
      allSlots.push({
        label: `${hour12}:00 ${ampm}`,
        start: easternDateTime(date, h),
        end: easternDateTime(date, h, slotMinutes),
      });
    }

    // Filter out busy slots
    const available = allSlots.filter(slot => {
      return !busySlots.some(busy => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return slot.start < busyEnd && slot.end > busyStart;
      });
    });

    // Don't show past slots for today
    const now = new Date();
    const filtered = available.filter(slot => slot.start > now);

    res.json({ date, slots: filtered.map(s => s.label) });
  } catch (err) {
    console.error('Calendar API error:', err.message);
    if (err.message.includes('invalid_grant') || err.message.includes('unauthorized')) {
      return res.status(500).json({ error: 'Calendar connection issue. Please call us to book.' });
    }
    res.status(500).json({ error: 'Could not fetch availability. Please try again.' });
  }
});

// POST /api/book
app.post('/api/book', async (req, res) => {
  const { date, time, name, phone, email, service } = req.body;

  // Validate all fields
  if (!date || !time || !name || !phone || !email || !service) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Validate service
  const svc = SERVICES[service];
  if (!svc) {
    return res.status(400).json({ error: 'Invalid service selected.' });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  // Basic phone validation (at least 10 digits)
  if (phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }

  // Parse time
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!timeMatch) {
    return res.status(400).json({ error: 'Invalid time format.' });
  }

  let hour = parseInt(timeMatch[1]);
  const minute = parseInt(timeMatch[2]);
  const ampm = timeMatch[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  const startTime = easternDateTime(date, hour, minute);
  const endTime = new Date(startTime.getTime() + svc.duration * 60 * 1000);

  // Don't allow booking in the past
  if (startTime <= new Date()) {
    return res.status(400).json({ error: 'Cannot book a time in the past.' });
  }

  try {
    const calendar = getCalendar();

    // Double-check availability before booking
    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        timeZone: TIMEZONE,
        items: [{ id: CALENDAR_ID }],
      },
    });

    const conflicts = freeBusy.data.calendars[CALENDAR_ID]?.busy || [];
    if (conflicts.length > 0) {
      return res.status(409).json({ error: 'This time slot was just taken. Please choose another.' });
    }

    // Create the calendar event
    await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: `${svc.label} — ${name}`,
        description: [
          `Student: ${name}`,
          `Phone: ${phone}`,
          `Email: ${email}`,
          `Service: ${svc.label}`,
          `Price: ${svc.price}`,
          `Duration: ${svc.duration} minutes`,
          '',
          'Booked via foreverfocuseddrivingacademy.com',
        ].join('\n'),
        start: { dateTime: startTime.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: endTime.toISOString(), timeZone: TIMEZONE },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 60 },
            { method: 'popup', minutes: 15 },
          ],
        },
      },
    });

    // Send email notifications (non-blocking)
    sendBookingNotification({ name, phone, email, service, date, time }).catch(() => {});

    res.json({ success: true, message: 'Booking confirmed! Check your email for details.' });
  } catch (err) {
    console.error('Calendar booking error:', err.message);
    if (err.message.includes('invalid_grant') || err.message.includes('unauthorized')) {
      return res.status(500).json({ error: 'Calendar connection issue. Please call us to book.' });
    }
    res.status(500).json({ error: 'Could not create booking. Please call us instead.' });
  }
});

// POST /api/careers — instructor application
app.post('/api/careers', async (req, res) => {
  const { name, phone, email, license, message } = req.body;

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone, and email are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  if (phone.replace(/\D/g, '').length < 10) {
    return res.status(400).json({ error: 'Invalid phone number.' });
  }

  const licenseLabels = {
    'yes': 'Yes, currently licensed',
    'in-progress': 'In progress / studying',
    'no': 'No, but interested in obtaining one',
    '': 'Not specified'
  };

  // Log to Google Sheet
  if (process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_CLIENT_EMAIL) {
    try {
      const sheets = getSheets();
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.GOOGLE_SHEET_ID,
        range: 'Sheet1!A:F',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            new Date().toLocaleString('en-US', { timeZone: TIMEZONE }),
            name,
            phone,
            email,
            licenseLabels[license] || license || 'Not specified',
            message || '',
          ]],
        },
      });
    } catch (err) {
      console.error('Failed to log career application to Google Sheet:', err.message);
    }
  }

  // Email notification to owner
  if (transporter && OWNER_EMAIL) {
    try {
      await transporter.sendMail({
        from: `"${BUSINESS_NAME}" <${process.env.GMAIL_USER || process.env.SMTP_USER}>`,
        to: OWNER_EMAIL,
        subject: `New Instructor Application: ${name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 500px;">
            <h2 style="color: #111;">New Instructor Application</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; font-weight: bold;">Name</td><td style="padding: 8px;">${name}</td></tr>
              <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">Phone</td><td style="padding: 8px;"><a href="tel:${phone}">${phone}</a></td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Email</td><td style="padding: 8px;"><a href="mailto:${email}">${email}</a></td></tr>
              <tr style="background: #f5f5f5;"><td style="padding: 8px; font-weight: bold;">RMV License</td><td style="padding: 8px;">${licenseLabels[license] || license || 'Not specified'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold;">Message</td><td style="padding: 8px;">${message || 'No message provided'}</td></tr>
            </table>
            <p style="color: #666; font-size: 13px; margin-top: 16px;">Submitted via foreverfocuseddriving.com careers form.</p>
          </div>
        `,
      });
    } catch (err) {
      console.error('Failed to send career notification:', err.message);
    }
  }

  // Confirmation email to applicant
  if (transporter) {
    try {
      await transporter.sendMail({
        from: `"${BUSINESS_NAME}" <${process.env.GMAIL_USER || process.env.SMTP_USER}>`,
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

// ─── Fallback: serve index.html for any non-API route ────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ${BUSINESS_NAME}`);
  console.log(`  Server running on http://localhost:${PORT}`);
  console.log(`  Calendar: ${process.env.GOOGLE_CLIENT_EMAIL ? '✓ Connected' : '✗ Not configured'}`);
  console.log(`  Email:    ${transporter ? '✓ Enabled' : '✗ Disabled'}\n`);
});
