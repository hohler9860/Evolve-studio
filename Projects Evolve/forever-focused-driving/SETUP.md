# Forever Focused Driving Academy — Setup Guide

Everything you need to connect the booking system to Alexa's Google Calendar, enable email notifications, and deploy so it runs itself forever.

---

## Step 1: Google Calendar API (Required)

This lets the website read Alexa's calendar availability and add bookings automatically.

### 1a. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click **Select a project** (top bar) → **New Project**
3. Name it `forever-focused-booking` → **Create**
4. Make sure the new project is selected in the top bar

### 1b. Enable the Calendar API

1. In the left sidebar: **APIs & Services** → **Library**
2. Search for **Google Calendar API**
3. Click it → **Enable**

### 1c. Create a Service Account

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **Service Account**
3. Name: `booking-bot` → **Create and Continue**
4. Skip the role/access steps → **Done**
5. Click the service account you just created
6. Go to the **Keys** tab → **Add Key** → **Create new key** → **JSON** → **Create**
7. A JSON file downloads — open it and find:
   - `client_email` (looks like `booking-bot@forever-focused-booking.iam.gserviceaccount.com`)
   - `private_key` (starts with `-----BEGIN PRIVATE KEY-----`)

### 1d. Share Alexa's Calendar

1. Open [Google Calendar](https://calendar.google.com)
2. Find Alexa's calendar in the left sidebar → click the 3 dots → **Settings and sharing**
3. Scroll to **Share with specific people or groups** → **+ Add people and groups**
4. Paste the `client_email` from step 1c
5. Set permission to **Make changes to events**
6. Click **Send**

### 1e. Get the Calendar ID

- On the same settings page, scroll to **Integrate calendar**
- Copy the **Calendar ID** (it looks like an email address)
- If Alexa only has one calendar, you can just use `primary`

### 1f. Fill in the .env File

Open the `.env` file and fill in:

```
GOOGLE_CALENDAR_ID=alexa@gmail.com    (or the Calendar ID from step 1e)
GOOGLE_CLIENT_EMAIL=booking-bot@forever-focused-booking.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIEv...rest of key...\n-----END PRIVATE KEY-----\n
```

**Important:** The private key must be on ONE line with `\n` for newlines (exactly as it appears in the JSON file).

---

## Step 2: Email Notifications (Recommended)

When someone books a lesson, both Alexa and the student get an email.

### Gmail Setup (Easiest)

1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
   - You need 2-Factor Authentication enabled on the Gmail account
2. Create an app password — select **Mail** → **Generate**
3. Copy the 16-character password

Fill in the `.env`:

```
OWNER_EMAIL=alexa@gmail.com
GMAIL_USER=alexa@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

---

## Step 2b: Google Sheets for Career Applications

Career form submissions are logged to a Google Sheet so Alexa can see all applications in one place.

### Setup

1. In the **same Google Cloud project** from Step 1, go to **APIs & Services** → **Library**
2. Search for **Google Sheets API** → **Enable**
3. Go to [Google Sheets](https://sheets.google.com) → create a new spreadsheet
4. In row 1, add these headers: `Timestamp | Name | Phone | Email | License Status | Message`
5. Click **Share** (top right) → paste the same `client_email` from Step 1c → set to **Editor** → uncheck "Notify people" → **Send**
6. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

Fill in the `.env`:

```
GOOGLE_SHEET_ID=your_sheet_id_here
```

New applications will automatically appear as rows in the sheet.

---

## Step 3: How Alexa Manages Her Schedule

**Alexa never touches the website.** She just uses Google Calendar normally:

- **Block off personal time:** Create events on her Google Calendar for times she's NOT available (doctor appointments, vacations, lunch breaks, etc.)
- **Those times automatically disappear** from the website's available slots
- **When someone books:** The lesson shows up on her calendar as an event with the student's name, phone, email, and service
- **Google Calendar sends her notifications** automatically (1 hour and 15 minutes before each lesson)
- **If email is set up:** She also gets an email with full booking details, and the student gets a confirmation email

### Setting Regular Hours

If Alexa has a consistent schedule (e.g., she doesn't work Sundays), she can:

1. Open Google Calendar
2. Create a **recurring event** for her days off (e.g., "Day Off" every Sunday, all day)
3. Those days will show zero availability on the website

The server is set for **9 AM – 6 PM Eastern** business hours. Slots outside these hours are never shown.

---

## Step 4: Deploy (Run Forever)

### Option A: Railway (Recommended — Free tier available)

1. Push the project to a GitHub repository
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**
3. Select the repo
4. Go to **Variables** tab and add all the `.env` values
5. Railway auto-detects Node.js and runs `npm start`
6. Get your public URL from the **Settings** tab
7. Point the domain `foreverfocuseddrivingacademy.com` to the Railway URL

### Option B: Render (Free tier available)

1. Push to GitHub
2. Go to [render.com](https://render.com) → **New** → **Web Service**
3. Connect the repo
4. Build command: `npm install`
5. Start command: `node server.js`
6. Add environment variables from `.env`

### Option C: DigitalOcean App Platform

1. Push to GitHub
2. Go to [cloud.digitalocean.com](https://cloud.digitalocean.com) → **Apps** → **Create App**
3. Select the repo → set environment variables → deploy

### After Deploying

1. Set `ALLOWED_ORIGIN` in `.env` to your actual domain:
   ```
   ALLOWED_ORIGIN=https://foreverfocuseddrivingacademy.com
   ```
2. Verify the health endpoint works: `https://yourdomain.com/api/health`
3. Test a booking end-to-end

---

## Verification Checklist

- [ ] `/api/health` returns `{ status: "ok", email: true, calendar: true }`
- [ ] Calendar shows Alexa's actual availability (blocked times are excluded)
- [ ] Booking creates an event on Alexa's Google Calendar
- [ ] Alexa receives email notification for new bookings
- [ ] Student receives confirmation email
- [ ] 2-hour services (Private, Highway, etc.) only show slots with enough time

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Calendar connection issue" | Check `GOOGLE_CLIENT_EMAIL` and `GOOGLE_PRIVATE_KEY` in `.env`. Make sure the calendar is shared with the service account. |
| No available slots showing | Make sure the calendar isn't fully booked. Check that the Calendar ID is correct. |
| No email notifications | Verify `GMAIL_USER` and `GMAIL_APP_PASSWORD`. Make sure 2FA is on and you used an App Password (not your regular password). |
| "This time slot was just taken" | Someone else booked it. Choose another time. |
| Server won't start | Run `npm install` first. Check that Node.js 18+ is installed. |
