// Run this once to create the leads table in your Neon Postgres database.
// Usage: DATABASE_URL=your_neon_url node scripts/setup-db.js

const { neon } = require('@neondatabase/serverless');

async function setup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is not set.');
    console.error('Usage: DATABASE_URL=your_neon_url node scripts/setup-db.js');
    process.exit(1);
  }

  const sql = neon(databaseUrl);

  console.log('Creating leads table...');
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      business TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT DEFAULT '',
      link TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT DEFAULT 'new',
      notes TEXT DEFAULT ''
    )
  `;

  console.log('Creating indexes...');
  await sql`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at)`;

  console.log('Database setup complete!');

  // Show current row count
  const rows = await sql`SELECT COUNT(*) as count FROM leads`;
  console.log(`Current leads in database: ${rows[0].count}`);
}

setup().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
