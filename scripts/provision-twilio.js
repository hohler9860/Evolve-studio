// One-shot: search and buy a Twilio US local number for outbound dialing.
// Usage: AREA_CODE=617 node scripts/provision-twilio.js   (default 617)

const { provisionNumber } = require('../lib/twilio');

async function main() {
  const areaCode = process.env.AREA_CODE || '617';
  console.log(`→ searching available numbers in ${areaCode}…`);
  const result = await provisionNumber(areaCode);
  console.log('✓ purchased');
  console.log(`  TWILIO_PHONE_NUMBER=${result.phoneNumber}`);
  console.log(`  twilio_sid=${result.sid}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Add TWILIO_PHONE_NUMBER=${result.phoneNumber} to .env`);
  console.log('  2. Go to console.twilio.com → Phone Numbers → Trust Hub → start CNAM "Evolve Studio" registration (~7-10 days)');
  console.log('  3. Go to elevenlabs.io → Phone Numbers → Import → paste this number');
  console.log('  4. Copy the resulting agent_phone_number_id → .env ELEVENLABS_AGENT_PHONE_NUMBER_ID');
}

main().catch(err => { console.error('provision-twilio failed:', err); process.exit(1); });
