// scripts/register-retell-tools.js
//
// Registers book_meeting + opt_out + send_followup as custom tools on the
// Retell LLM created by seed-retell-agent.js. PATCHes /update-retell-llm.
//
// Retell's Cal.com integration is native (preset tool) — we don't need our
// custom book_meeting endpoint if you'd rather use that. But keeping the
// custom one for now because our endpoint also writes meetings to Supabase.
//
// Usage:
//   TOOL_BASE_URL=https://www.evolvestudio.info \
//     node --env-file=.env scripts/register-retell-tools.js

const RETELL_BASE = 'https://api.retellai.com';

async function main() {
  const apiKey = process.env.RETELL_API_KEY;
  const llmId = process.env.RETELL_LLM_ID;
  const toolBaseUrl = process.env.TOOL_BASE_URL;
  const toolSecret = process.env.EL_TOOL_SECRET || ''; // reuse existing secret — tool endpoints already check it

  if (!apiKey || !llmId || !toolBaseUrl) {
    console.error('Required: RETELL_API_KEY, RETELL_LLM_ID, TOOL_BASE_URL');
    process.exit(1);
  }

  const tools = [
    {
      type: 'custom',
      name: 'book_meeting',
      description: 'Book a 15-minute meeting with Henry. Use when the prospect agrees to a time.',
      url: `${toolBaseUrl}/api/tools/book-meeting`,
      speak_during_execution: true,
      speak_after_execution: true,
      execution_message_description: 'Tell the prospect you are confirming the booking right now.',
      headers: toolSecret ? { Authorization: `Bearer ${toolSecret}` } : {},
      parameters: {
        type: 'object',
        required: ['business_id', 'attendee_name', 'attendee_email', 'start_iso'],
        properties: {
          business_id:    { type: 'string', description: 'pass {{business_id}} from dynamic variables' },
          attendee_name:  { type: 'string', description: 'prospect full name' },
          attendee_email: { type: 'string', description: 'prospect email — confirm spelling on the call' },
          attendee_phone: { type: 'string', description: 'prospect phone E.164' },
          start_iso:      { type: 'string', description: 'ISO8601 start time UTC' },
          timezone:       { type: 'string', description: "default 'America/New_York'" },
        },
      },
    },
    {
      type: 'custom',
      name: 'opt_out',
      description: 'Add the prospect to do-not-call list. Use IMMEDIATELY when they say "do not call", "stop calling", "take me off your list", "do not record", or anything similar.',
      url: `${toolBaseUrl}/api/tools/opt-out`,
      speak_during_execution: false,
      speak_after_execution: true,
      execution_message_description: 'Confirm you are removing them from the list.',
      headers: toolSecret ? { Authorization: `Bearer ${toolSecret}` } : {},
      parameters: {
        type: 'object',
        required: ['phone_e164'],
        properties: {
          business_id: { type: 'string', description: 'pass {{business_id}}' },
          phone_e164:  { type: 'string', description: 'the number being called in E.164 format — use {{phone}}' },
          reason:      { type: 'string', description: 'short reason e.g. "do not call"' },
        },
      },
    },
    {
      type: 'custom',
      name: 'send_followup',
      description: 'Send a follow-up email with the booking link mid-call. Use when prospect says "send me an email", "I will think about it", or "I am driving / busy right now". Always confirm the email address out loud before calling this.',
      url: `${toolBaseUrl}/api/tools/send-followup`,
      speak_during_execution: false,
      speak_after_execution: true,
      execution_message_description: 'Tell the prospect the email is on its way.',
      headers: toolSecret ? { Authorization: `Bearer ${toolSecret}` } : {},
      parameters: {
        type: 'object',
        required: ['attendee_email'],
        properties: {
          business_id:    { type: 'string', description: 'pass {{business_id}}' },
          attendee_email: { type: 'string', description: 'prospect email address — confirm spelling on the call before calling this' },
          attendee_name:  { type: 'string', description: 'prospect first/full name if known' },
        },
      },
    },
  ];

  // Retell's update endpoint takes general_tools as part of the LLM update
  const body = {
    llm_id: llmId,
    general_tools: tools,
  };

  console.log(`→ patching LLM ${llmId} with ${tools.length} tools…`);
  const res = await fetch(`${RETELL_BASE}/update-retell-llm/${llmId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ general_tools: tools }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('update failed:', res.status);
    console.error(text.slice(0, 800));
    process.exit(1);
  }

  console.log('✓ tools registered');
  for (const t of tools) console.log(`  - ${t.name.padEnd(14)} → ${t.url}`);
  console.log('');
  console.log('Next:');
  console.log('  1. Webhook URL on agent is already set to /api/webhooks/retell');
  console.log('  2. Set VOICE_PROVIDER=retell to flip the dialer over');
  console.log('  3. Test with: TO=+1XXXYYYZZZZ npm run dry-run');
}

main().catch(err => { console.error('register-retell-tools failed:', err); process.exit(1); });
