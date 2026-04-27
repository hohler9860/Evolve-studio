// scripts/prep-test-prospect.js
//
// Picks the worst-rated prospect with a website, ensures it has a contact row
// (creating a "Business main line" placeholder if Apollo hasn't run yet),
// generates a Claude script for it, and prints the BUSINESS_ID to use with
// `npm run dry-run`.
//
// Usage:  node --env-file=.env scripts/prep-test-prospect.js
//
// Output (final line):
//   BUSINESS_ID=<uuid>   <name>  rating=<n>/10  phone=+1...
//
// You then run:
//   TO=+1<your-cell> BUSINESS_ID=<uuid> npm run dry-run

const { createClient } = require('@supabase/supabase-js');
const { generateScript } = require('../lib/claude');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY first');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // 1. Find worst-rated businesses (2 queries — PostgREST embedded filtering is unreliable here)
  const { data: ratings, error: e1 } = await db
    .from('site_ratings')
    .select('business_id, rating_1_to_10, issues, selling_points')
    .lte('rating_1_to_10', 6)
    .order('rating_1_to_10', { ascending: true })
    .limit(20);
  if (e1) throw e1;
  if (!ratings?.length) {
    console.error('No callable prospects yet — wait for the rate loop to finish.');
    process.exit(1);
  }

  const businessIds = ratings.map(r => r.business_id);
  const { data: bizRows, error: e1b } = await db
    .from('businesses')
    .select('id, name, phone_e164, city, state, website_url, category, disqualified_reason')
    .in('id', businessIds)
    .not('phone_e164', 'is', null)
    .is('disqualified_reason', null);
  if (e1b) throw e1b;

  // Stitch together — keep ratings order (lowest rating first)
  const bizMap = Object.fromEntries((bizRows || []).map(b => [b.id, b]));
  const sorted = ratings
    .map(r => ({ ...bizMap[r.business_id], site_ratings: [r] }))
    .filter(b => b.id);

  const biz = sorted[0];
  if (!biz) {
    console.error('No callable prospects yet. Wait for the rate loop to finish.');
    console.error(`(got ${candidates?.length || 0} candidates from query but none had site_ratings populated)`);
    process.exit(1);
  }

  const r = biz.site_ratings[0];
  console.log(`→ chosen: ${biz.name} (${biz.city}, ${biz.state}) — rating ${r.rating_1_to_10}/10`);

  // 2. Ensure a contact row exists
  const { data: existingContacts } = await db
    .from('contacts')
    .select('id')
    .eq('business_id', biz.id);

  let contactId;
  if (existingContacts?.length) {
    contactId = existingContacts[0].id;
    console.log(`✓ existing contact: ${contactId}`);
  } else {
    const { data: newContact, error: e2 } = await db
      .from('contacts')
      .insert({
        business_id: biz.id,
        full_name: 'Business main line',
        direct_phone_e164: biz.phone_e164,
        source: 'manual',
        confidence: 0.3,
      })
      .select('id')
      .single();
    if (e2) throw e2;
    contactId = newContact.id;
    console.log(`✓ created placeholder contact: ${contactId}`);
  }

  // 3. Ensure a script exists (or regenerate)
  const { data: existingScripts } = await db
    .from('call_scripts')
    .select('id')
    .eq('business_id', biz.id);

  if (existingScripts?.length) {
    console.log(`✓ existing script: ${existingScripts[0].id}`);
  } else {
    console.log('→ generating script via Claude…');
    const script = await generateScript({
      business_name: biz.name,
      city: biz.city,
      category: biz.category,
      owner_first_name: null,
      rating: r.rating_1_to_10,
      issues: r.issues,
      selling_points: r.selling_points,
    });

    const { data: newScript, error: e3 } = await db
      .from('call_scripts')
      .insert({
        business_id: biz.id,
        contact_id: contactId,
        opener: script.opener,
        talking_points: script.talking_points,
        objection_handlers: script.objection_handlers,
        closer: script.closer,
        model_version: script.model,
      })
      .select('id, opener, talking_points, closer')
      .single();
    if (e3) throw e3;
    console.log(`✓ script created: ${newScript.id}`);
    console.log('');
    console.log('--- OPENER ---');
    console.log(newScript.opener);
    console.log('');
    console.log('--- TALKING POINTS ---');
    (newScript.talking_points || []).forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
    console.log('');
    console.log('--- CLOSER ---');
    console.log(newScript.closer);
  }

  console.log('');
  console.log('====================================================');
  console.log(`  BUSINESS_ID=${biz.id}`);
  console.log(`  Business: ${biz.name}`);
  console.log(`  Rating: ${r.rating_1_to_10}/10`);
  console.log(`  Phone (real biz): ${biz.phone_e164}`);
  console.log('');
  console.log('  Once your ElevenLabs agent + Twilio number are wired:');
  console.log(`  TO=+1<your-cell> BUSINESS_ID=${biz.id} npm run dry-run`);
  console.log('====================================================');
}

main().catch(err => {
  console.error('prep-test-prospect failed:', err);
  process.exit(1);
});
