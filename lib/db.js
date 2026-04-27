// Supabase service-role client. Replaces the Neon client.
// Existing call sites use `getSQL()` with template-literal queries; we now expose
// `getDB()` that returns the Supabase client. Inquiry form INSERT and admin SELECT
// are rewritten in their respective handlers (api/leads.js, api/admin/*).
//
// Service role bypasses RLS — never ship the service-role key to the browser.
// All callers run server-side in Vercel API routes.

const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getDB() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var');
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return _client;
}

module.exports = { getDB };
