// scripts/check-env.js — validate every integration is wired correctly.
// Reads .env, pings each provider with the cheapest possible call, prints a status table.
//
// Usage: node scripts/check-env.js
//        npm run check:env
//
// Exit code 0 = everything required works. Non-zero = at least one required check failed.

const fs = require('node:fs');
const path = require('node:path');

// Load .env manually so we don't need a dotenv dep
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z][A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const checks = [];

function check(name, required, fn) {
  checks.push({ name, required, fn });
}

// =============================================================================
// the checks
// =============================================================================

check('SUPABASE_URL', true, async () => {
  const url = process.env.SUPABASE_URL;
  if (!url) return { ok: false, msg: 'not set' };
  if (!url.includes('supabase.co')) return { ok: false, msg: 'invalid format' };
  return { ok: true, msg: url.replace(/^https:\/\//, '').slice(0, 40) };
});

check('SUPABASE_SERVICE_ROLE_KEY', true, async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, msg: 'not set' };
  try {
    const { createClient } = require('@supabase/supabase-js');
    const db = createClient(url, key, { auth: { persistSession: false } });
    const { count, error } = await db.from('leads').select('id', { count: 'exact', head: true });
    if (error) return { ok: false, msg: error.message };
    return { ok: true, msg: `connected, ${count ?? 0} leads` };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

check('ANTHROPIC_API_KEY', true, async () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, msg: 'not set' };
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const c = new Anthropic({ apiKey: key });
    const msg = await c.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'reply with just "ok"' }],
    });
    return { ok: true, msg: 'auth ok' };
  } catch (e) {
    return { ok: false, msg: e.message?.slice(0, 80) };
  }
});

check('APIFY_API_TOKEN', true, async () => {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return { ok: false, msg: 'not set' };
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me?token=${token}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, msg: `${r.status}` };
    const j = await r.json();
    return { ok: true, msg: j.data?.username || 'auth ok' };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

check('FIRECRAWL_API_KEY', true, async () => {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return { ok: false, msg: 'not set' };
  try {
    const r = await fetch('https://api.firecrawl.dev/v1/team/credit-usage', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, msg: `${r.status}` };
    const j = await r.json();
    return { ok: true, msg: `${j.data?.remaining_credits ?? '?'} credits left` };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

check('APOLLO_API_KEY', true, async () => {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return { ok: false, msg: 'not set' };
  try {
    const r = await fetch('https://api.apollo.io/api/v1/auth/health', {
      headers: { 'X-Api-Key': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, msg: `${r.status}` };
    return { ok: true, msg: 'auth ok' };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

check('RESEND_API_KEY', true, async () => {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, msg: 'not set' };
  if (!key.startsWith('re_')) return { ok: false, msg: 'invalid format (should start with re_)' };
  // Resend sending-access keys can't read /api-keys or /domains — they're scoped to POST /emails only.
  // The most reliable validation is a domains lookup, which works for both full + sending-access keys
  // (sending keys get 401, which still confirms the key is recognized as a valid auth token).
  try {
    const r = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401) return { ok: true, msg: 'sending-access key (limited scope, valid for POST /emails)' };
    if (!r.ok) return { ok: false, msg: `${r.status}` };
    return { ok: true, msg: 'full-access key' };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

check('GOOGLE_PSI_API_KEY', false, async () => {
  const key = process.env.GOOGLE_PSI_API_KEY;
  if (!key) return { ok: 'skip', msg: 'optional, not set' };
  try {
    const r = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&strategy=mobile&category=performance&key=${key}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return { ok: false, msg: `${r.status}: ${text.slice(0, 60)}` };
    }
    return { ok: true, msg: 'auth ok' };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

check('ELEVENLABS_API_KEY', true, async () => {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, msg: 'not set' };
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, msg: `${r.status}` };
    const j = await r.json();
    return { ok: true, msg: `${j.subscription?.tier || 'auth ok'}` };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

check('TWILIO_ACCOUNT_SID', false, async () => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return { ok: 'skip', msg: 'phase 4 prereq, not yet set' };
  try {
    const auth = Buffer.from(`${sid}:${tok}`).toString('base64');
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, msg: `${r.status}` };
    const j = await r.json();
    return { ok: true, msg: j.friendly_name || 'auth ok' };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

check('CAL_COM_API_KEY', false, async () => {
  const key = process.env.CAL_COM_API_KEY;
  if (!key) return { ok: 'skip', msg: 'phase 5 prereq, not yet set' };
  try {
    const r = await fetch('https://api.cal.com/v2/me', {
      headers: { Authorization: `Bearer ${key}`, 'cal-api-version': '2024-08-13' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, msg: `${r.status}` };
    const j = await r.json();
    return { ok: true, msg: j.data?.username || 'auth ok' };
  } catch (e) {
    return { ok: false, msg: e.message };
  }
});

check('GOOGLE_SHEETS_CREDENTIALS_PATH', false, async () => {
  const p = process.env.GOOGLE_SHEETS_CREDENTIALS_PATH;
  if (!p) return { ok: 'skip', msg: 'phase 5 prereq, not yet set' };
  if (!fs.existsSync(p)) return { ok: false, msg: 'file not found' };
  return { ok: true, msg: 'file exists' };
});

check('CRON_SECRET', false, async () => {
  const s = process.env.CRON_SECRET;
  if (!s) return { ok: 'skip', msg: 'unset (any string works for dev; required in prod)' };
  return { ok: true, msg: `${s.length} chars` };
});

check('DIALING_ENABLED', false, async () => {
  const v = process.env.DIALING_ENABLED;
  if (v === 'true') return { ok: 'warn', msg: 'TRUE — calls will fire when cron runs' };
  return { ok: 'skip', msg: v || 'false (kill switch)' };
});

// =============================================================================
// run
// =============================================================================

(async () => {
  console.log('\n  evolve-studio — environment check\n');

  let failed = 0;
  for (const c of checks) {
    process.stdout.write(`  ${c.name.padEnd(32, ' ')} `);
    let result;
    try {
      result = await c.fn();
    } catch (e) {
      result = { ok: false, msg: e.message };
    }
    const icon =
      result.ok === true ? '✅' :
      result.ok === false ? (c.required ? '❌' : '⚠️ ') :
      result.ok === 'warn' ? '⚠️ ' :
      '⏭️ ';
    console.log(`${icon} ${result.msg || ''}`);
    if (result.ok === false && c.required) failed++;
  }

  console.log('');
  if (failed === 0) {
    console.log('  ✅ All required checks passed. Ready to run the discover→rate→script pipeline.\n');
    process.exit(0);
  } else {
    console.log(`  ❌ ${failed} required check(s) failed. Fix the keys above in .env before proceeding.\n`);
    process.exit(1);
  }
})();
