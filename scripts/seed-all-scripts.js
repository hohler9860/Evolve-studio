// scripts/seed-all-scripts.js
//
// For every callable business (rating ≤ 6, not disqualified, has phone):
//   1. Create a placeholder "Business main line" contact if none exists.
//   2. Generate a Claude script for it if none exists.
//
// Idempotent. Skips businesses that already have a contact + script.
//
// Used in the bootstrap phase before Apollo enrichment is wired.

const { createClient } = require('@supabase/supabase-js');
const { generateScript } = require('../lib/claude');

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('missing supabase env'); process.exit(1); }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // 1. Find every business that's callable (rating ≤ 6, has phone, not disqualified)
  const { data: ratings, error: e1 } = await db
    .from('site_ratings')
    .select('business_id, rating_1_to_10, issues, selling_points')
    .lte('rating_1_to_10', 6);
  if (e1) throw e1;

  const businessIds = ratings.map(r => r.business_id);
  if (!businessIds.length) { console.log('no rated businesses to script'); return; }

  const { data: businesses, error: e2 } = await db
    .from('businesses')
    .select('id, name, phone_e164, city, state, category')
    .in('id', businessIds)
    .not('phone_e164', 'is', null)
    .is('disqualified_reason', null);
  if (e2) throw e2;

  const ratingMap = Object.fromEntries(ratings.map(r => [r.business_id, r]));

  // Existing contacts + scripts
  const ids = businesses.map(b => b.id);
  const [{ data: existingContacts }, { data: existingScripts }] = await Promise.all([
    db.from('contacts').select('business_id, id').in('business_id', ids),
    db.from('call_scripts').select('business_id, id').in('business_id', ids),
  ]);
  const contactByBiz = Object.fromEntries((existingContacts || []).map(c => [c.business_id, c.id]));
  const scriptByBiz = new Set((existingScripts || []).map(s => s.business_id));

  console.log(`→ ${businesses.length} callable businesses`);
  console.log(`  ${Object.keys(contactByBiz).length} already have contacts`);
  console.log(`  ${scriptByBiz.size} already have scripts`);
  console.log('');

  let contactsCreated = 0;
  let scriptsCreated = 0;
  let scriptsFailed = 0;

  for (const biz of businesses) {
    const r = ratingMap[biz.id];
    if (!r) continue;

    // 1. Ensure contact
    let contactId = contactByBiz[biz.id];
    if (!contactId) {
      const { data: newContact, error: cErr } = await db
        .from('contacts')
        .insert({
          business_id: biz.id,
          full_name: 'Business main line',
          direct_phone_e164: biz.phone_e164,
          source: 'manual',
          confidence: 0.3,
        })
        .select('id').single();
      if (cErr) { console.error(`[${biz.name}] contact insert failed:`, cErr.message); continue; }
      contactId = newContact.id;
      contactsCreated++;
    }

    // 2. Ensure script
    if (scriptByBiz.has(biz.id)) {
      process.stdout.write('.');
      continue;
    }

    try {
      const script = await generateScript({
        business_name: biz.name,
        city: biz.city,
        category: biz.category,
        owner_first_name: null,
        rating: r.rating_1_to_10,
        issues: r.issues,
        selling_points: r.selling_points,
      });

      const { error: sErr } = await db.from('call_scripts').insert({
        business_id: biz.id,
        contact_id: contactId,
        opener: script.opener,
        talking_points: script.talking_points,
        objection_handlers: script.objection_handlers,
        closer: script.closer,
        model_version: script.model,
      });
      if (sErr) throw sErr;
      scriptsCreated++;
      process.stdout.write('✓');
    } catch (err) {
      console.error(`\n[${biz.name}] script gen failed:`, err.message);
      scriptsFailed++;
      process.stdout.write('✗');
    }
  }

  console.log('');
  console.log(`✓ contacts created: ${contactsCreated}`);
  console.log(`✓ scripts created: ${scriptsCreated}`);
  console.log(`✗ scripts failed: ${scriptsFailed}`);
}

main().catch(err => { console.error('seed-all-scripts failed:', err); process.exit(1); });
