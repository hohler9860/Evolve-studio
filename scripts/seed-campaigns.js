// One-shot: push the campaign config from lib/campaigns.js into the
// `campaigns` table. Idempotent — uses upsert on (region, query_template).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-campaigns.js
//
// Or just `npm run seed:campaigns` once we add the script.

const { createClient } = require('@supabase/supabase-js');
const { buildCampaigns } = require('../lib/campaigns');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const all = buildCampaigns();
  console.log(`→ seeding ${all.length} campaigns…`);

  // Upsert in batches of 200 to stay well below Postgres parameter limits.
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    const { data, error } = await db
      .from('campaigns')
      .upsert(batch, { onConflict: 'region,query_template', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    inserted += data?.length || 0;
    process.stdout.write('.');
  }
  console.log(`\n✓ inserted/updated ${inserted} campaigns`);

  const { count } = await db.from('campaigns').select('id', { count: 'exact', head: true });
  console.log(`✓ total active campaigns in DB: ${count}`);
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
