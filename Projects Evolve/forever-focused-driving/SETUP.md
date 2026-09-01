# Forever Focused Driving Academy — Setup Guide

The booking system is fully self-contained. No Google Cloud, no API keys, no service accounts. Alexa controls her availability from an admin page, and bookings flow into whatever calendar app she uses via a private subscription link.

---

## How it works

1. **Alexa sets her hours** at `/admin` (password protected). Weekly recurring hours plus per-date overrides (day off, custom hours). Only hours she turns on show as bookable on the site.
2. **Students book** on the site. The server double-checks the slot is still open, saves the booking, and emails both sides a confirmation with a calendar invite (.ics) attached.
3. **Her calendar updates automatically.** She subscribes ONCE to a private ICS feed URL (shown on the admin page). Google Calendar, Apple Calendar, and Outlook all support it — every new booking appears on its own; cancelled bookings disappear.

Data lives in the `data/` folder as JSON files (`schedule.json`, `bookings.json`, `careers.json`). Back that folder up; it is gitignored.

> Note: subscribed calendars refresh on the provider's schedule (Google can take a few hours). The instant notification is the email + attached invite; the feed is the always-in-sync record.

---

## .env keys

| Key | What it is |
|---|---|
| `ADMIN_PASSWORD` | Password for the `/admin` page. Give this to Alexa. |
| `ICS_TOKEN` | Random secret in the private calendar feed URL. Don't share the URL publicly. |
| `SITE_URL` | The public site URL (used to build the feed link + email text). |
| `OWNER_EMAIL` | Alexa's email — receives booking + careers notifications. |
| `GMAIL_USER` + `GMAIL_APP_PASSWORD` | Gmail account that SENDS the emails (app password from Google Account → Security → 2-Step → App passwords). Or use `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`/`SMTP_PORT` instead. |
| `PORT` | Defaults to 3000. |

The old `GOOGLE_*` keys are no longer used and can be deleted.

---

## Run it

```bash
npm install
./start.sh        # or: node server.js
```

- Site: `http://localhost:3000`
- Admin: `http://localhost:3000/admin`
- Feed: `http://localhost:3000/calendar/<ICS_TOKEN>.ics`

## Deploy

The server keeps state in local JSON files, so it needs a host with a **persistent disk** — a small VPS, Railway, Render, or Fly.io. It will NOT work on Vercel/Netlify serverless (files vanish between requests). Point the domain at it, make sure HTTPS is on (the admin password and feed token travel in requests), and set the `.env` values on the host.

## Handing off to Alexa

Send her three things:
1. The admin link (`https://<domain>/admin`) + her password
2. One-time calendar subscribe steps (they're written on the admin page itself)
3. "Set your weekly hours once — you only come back to take days off or check bookings"
