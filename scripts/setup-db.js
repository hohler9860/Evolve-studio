// One-shot migration runner for the new Supabase project.
// Reads supabase/migrations/*.sql in order and applies them via a direct
// Postgres connection using the project's connection string.
//
// Usage:  DATABASE_URL=postgres://... node scripts/setup-db.js
//         (DATABASE_URL is the "Connection string" → "Direct connection" from
//          the Supabase project Settings → Database page.)
//
// Idempotent: every migration uses `create ... if not exists` / `do $$ begin ... exception when duplicate_object`
// patterns, so re-running the script is safe.

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL not set.');
    console.error('Find it in Supabase: Project Settings → Database → Connection string (Direct).');
    process.exit(1);
  }

  const dir = path.join(__dirname, '..', 'supabase', 'migrations');
  if (!fs.existsSync(dir)) {
    console.error(`ERROR: migrations directory not found at ${dir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  if (!files.length) {
    console.error('ERROR: no .sql files in migrations directory.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  for (const file of files) {
    console.log(`→ applying ${file}`);
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await client.query(sql);
  }

  // Sanity check
  const { rows } = await client.query('select count(*)::int as count from leads');
  console.log(`✓ migrations applied. leads count: ${rows[0].count}`);

  await client.end();
}

main().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
