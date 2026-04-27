// Google Sheets helper — appends a "Mockup Pipeline" row whenever a meeting
// is booked, so Henry has a single sheet to look at when he sits down to mock.
//
// Auth: service-account JSON key. Path is in env GOOGLE_SHEETS_CREDENTIALS_PATH.
// The target sheet must be shared (Editor) with the SA's email.
//
// Sheet must have a tab called "Mockup Pipeline" with a header row matching
// the columns appended below (or just empty A1 — we don't validate headers).

const { google } = require('googleapis');
const fs = require('node:fs');

let _client = null;
async function getClient() {
  if (_client) return _client;

  // Two sources of credentials:
  //   1. GOOGLE_SHEETS_CREDENTIALS_JSON env var (production / Vercel — the JSON content as a string)
  //   2. GOOGLE_SHEETS_CREDENTIALS_PATH file on disk (local dev — path to .json)
  let credentials;
  if (process.env.GOOGLE_SHEETS_CREDENTIALS_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_SHEETS_CREDENTIALS_JSON);
  } else if (process.env.GOOGLE_SHEETS_CREDENTIALS_PATH) {
    credentials = JSON.parse(fs.readFileSync(process.env.GOOGLE_SHEETS_CREDENTIALS_PATH, 'utf8'));
  } else {
    throw new Error('Set GOOGLE_SHEETS_CREDENTIALS_JSON or GOOGLE_SHEETS_CREDENTIALS_PATH');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _client = google.sheets({ version: 'v4', auth });
  return _client;
}

/**
 * Append one row representing a booked meeting / mockup task.
 */
async function appendMockupRow({ business, contact, meeting }) {
  const sheets = await getClient();
  const sheetId = process.env.MOCKUP_PIPELINE_SHEET_ID;
  if (!sheetId) throw new Error('MOCKUP_PIPELINE_SHEET_ID not configured');

  const row = [
    new Date().toISOString().slice(0, 10),                     // A: booked_date
    business.name,                                             // B: business_name
    business.website_url || '',                                // C: current_site_url
    `${business.city || ''}, ${business.state || ''}`,         // D: city_state
    business.category || '',                                   // E: category
    contact?.full_name || '',                                  // F: contact_name
    contact?.email || '',                                      // G: contact_email
    contact?.direct_phone_e164 || business.phone_e164 || '',   // H: contact_phone
    meeting.scheduled_for ? new Date(meeting.scheduled_for).toLocaleString('en-US', { timeZone: 'America/New_York' }) : '', // I: meeting_time_ET
    meeting.zoom_join_url || '',                               // J: zoom_link
    'mockup pending',                                          // K: status (manual updates)
    '',                                                        // L: mockup_url (manual fill)
    '',                                                        // M: notes (manual fill)
    business.id,                                               // N: business_id (debug)
  ];

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'Mockup Pipeline!A1',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  // The append result has updates.updatedRange like "'Mockup Pipeline'!A12:N12"
  const updatedRange = res.data.updates?.updatedRange || '';
  return { updated_range: updatedRange };
}

module.exports = { appendMockupRow };
