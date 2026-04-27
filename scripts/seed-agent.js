// One-shot: create the ElevenLabs Conversational AI agent that powers our cold-calls.
//
// What this does:
//   1. Creates an agent with the system-prompt template + tool config + voice settings
//   2. Registers two server tools (book_meeting, opt_out)
//   3. Prints the AGENT_ID for you to paste into .env
//
// What you do AFTER running this:
//   1. Go to elevenlabs.io → Agents → click the new "Evolve Cold Caller" agent
//   2. Voice tab → set Voice ID to your cloned voice (passed via VOICE_ID env)
//   3. Phone Numbers tab → import your Twilio number, copy the AGENT_PHONE_NUMBER_ID
//   4. Webhooks tab → paste your /api/webhooks/elevenlabs URL + the WEBHOOK_SECRET
//   5. Update .env with ELEVENLABS_AGENT_ID + ELEVENLABS_AGENT_PHONE_NUMBER_ID
//
// Usage: ELEVENLABS_API_KEY=... VOICE_ID=... TOOL_BASE_URL=https://yourdomain.com node scripts/seed-agent.js

const fetch = global.fetch;

const SYSTEM_PROMPT_TEMPLATE = `You are an AI voice assistant calling on behalf of Henry, founder of Evolve Studio — a small Boston-based web design studio that builds modern websites for local businesses ($2-5k typical project).

You are calling {{business_name}} in {{city}}. The owner's name is {{owner_first_name}}.

Their website was rated {{rating}}/10. The most pressing issue is: "{{top_issue}}". Two specific selling points to use: "{{selling_point_1}}" and "{{selling_point_2}}".

OPENING LINE (say this exactly, naturally, in one breath):
"Hi {{owner_first_name}}, this is an AI assistant calling on behalf of Henry at Evolve Studio. This call is recorded — got 30 seconds for a quick question about your website?"

If they say no/busy: thank them, ask if there's a better time tomorrow, then end the call politely.
If they say yes: deliver one of the talking points naturally, then ask if they'd like to see a free mock-up of what their new site could look like before a 15-minute Zoom this week.

TALKING POINTS to weave in: {{talking_points}}
OBJECTION HANDLERS: {{objection_handlers}}
CLOSER: {{closer}}

If they want to book, use the book_meeting tool. Always confirm the time + email back to them before ending the call. Never invent a booking time the tool didn't return.

If they say "do not record" / "stop recording" / "do not call" / "take me off your list" — IMMEDIATELY use the opt_out tool with their phone {{business_id}}, then say: "Understood, I'll remove you from our list. Have a great day." Then end the call.

Hard rules:
- Never lie. Never invent stats.
- Speak naturally — short sentences, one idea at a time.
- If asked "are you a real person?" — answer "No, I'm an AI calling on behalf of Henry, but I can connect you with him directly if you'd like to book a call."
- Do not sound robotic or over-rehearsed. Pause between sentences.
- Keep total call under 90 seconds unless they're engaged.

Booking link to share: {{booking_link}}`;

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.VOICE_ID;
  const toolBaseUrl = process.env.TOOL_BASE_URL;
  const toolSecret = process.env.EL_TOOL_SECRET || '';

  if (!apiKey || !voiceId) {
    console.error('Required: ELEVENLABS_API_KEY, VOICE_ID');
    console.error('Optional: TOOL_BASE_URL (deferred — re-run after Vercel deploy to register book_meeting + opt_out tools)');
    process.exit(1);
  }
  const skipTools = !toolBaseUrl;
  if (skipTools) {
    console.log('⚠️  TOOL_BASE_URL not set — creating agent WITHOUT server tools.');
    console.log('   You can talk to the agent in elevenlabs.io UI to validate voice/prompt.');
    console.log('   Re-run with TOOL_BASE_URL=https://yourdomain.com to add tools after deploy.');
    console.log('');
  }

  const agentBody = {
    name: 'Evolve Cold Caller',
    conversation_config: {
      agent: {
        prompt: { prompt: SYSTEM_PROMPT_TEMPLATE },
        first_message: "Hi {{owner_first_name}}, this is an AI assistant calling on behalf of Henry at Evolve Studio. This call is recorded — got 30 seconds for a quick question about your website?",
        language: 'en',
      },
      tts: {
        voice_id: voiceId,
        model_id: 'eleven_turbo_v2',  // EL Conversational AI requires turbo_v2 or flash_v2 for English agents
        stability: 0.45,
        similarity_boost: 0.85,
        speed: 1.0,
      },
      asr: { quality: 'high' },
      conversation: {
        max_duration_seconds: 240,
      },
    },
    platform_settings: {
      call_limits: { agent_concurrency_limit: 5 },
    },
  };

  console.log('→ creating agent…');
  const agentRes = await fetch('https://api.elevenlabs.io/v1/convai/agents/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify(agentBody),
  });
  const agentJson = await agentRes.json();
  if (!agentRes.ok) {
    console.error('agent create failed:', agentRes.status, JSON.stringify(agentJson, null, 2));
    process.exit(1);
  }
  const agentId = agentJson.agent_id || agentJson.id;
  console.log(`✓ agent created: ${agentId}`);

  if (skipTools) {
    console.log('');
    console.log('====================================================');
    console.log('  COPY THIS INTO YOUR .env:');
    console.log(`  ELEVENLABS_AGENT_ID=${agentId}`);
    console.log('====================================================');
    console.log('');
    console.log('Next:');
    console.log('  1. elevenlabs.io → Agents → "Evolve Cold Caller" → click "Talk to Agent" to test voice');
    console.log('  2. After Vercel deploy, re-run with TOOL_BASE_URL=<your-url> to register tools');
    return;
  }

  // Register tools
  const tools = [
    {
      name: 'book_meeting',
      description: 'Book a 15-minute Zoom consultation. Use this when the prospect agrees to a meeting time.',
      api_schema: {
        url: `${toolBaseUrl}/api/tools/book-meeting`,
        method: 'POST',
        request_headers: toolSecret ? [{ key: 'Authorization', value: `Bearer ${toolSecret}` }] : [],
        request_body_schema: {
          type: 'object',
          required: ['business_id', 'attendee_name', 'attendee_email', 'start_iso'],
          properties: {
            business_id: { type: 'string', description: 'pass {{business_id}} from dynamic variables' },
            attendee_name: { type: 'string', description: 'prospect full name' },
            attendee_email: { type: 'string', description: 'prospect email' },
            attendee_phone: { type: 'string', description: 'prospect phone E.164' },
            start_iso: { type: 'string', description: 'ISO8601 start time UTC' },
            timezone: { type: 'string', description: "default 'America/New_York'" },
          },
        },
      },
    },
    {
      name: 'opt_out',
      description: 'Add prospect to do-not-call list. Use immediately when they say "do not call", "stop calling", "take me off your list", "do not record".',
      api_schema: {
        url: `${toolBaseUrl}/api/tools/opt-out`,
        method: 'POST',
        request_headers: toolSecret ? [{ key: 'Authorization', value: `Bearer ${toolSecret}` }] : [],
        request_body_schema: {
          type: 'object',
          required: ['phone_e164'],
          properties: {
            business_id: { type: 'string', description: 'pass {{business_id}}' },
            phone_e164: { type: 'string', description: 'the number being called' },
            reason: { type: 'string' },
          },
        },
      },
    },
  ];

  for (const tool of tools) {
    const toolRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({ tool_config: tool }),
    });
    if (!toolRes.ok) {
      const t = await toolRes.text();
      console.warn(`! tool ${tool.name} create returned ${toolRes.status}: ${t.slice(0, 200)}`);
    } else {
      console.log(`✓ tool registered: ${tool.name}`);
    }
  }

  console.log('');
  console.log('====================================================');
  console.log('  COPY THIS INTO YOUR .env:');
  console.log(`  ELEVENLABS_AGENT_ID=${agentId}`);
  console.log('====================================================');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Go to elevenlabs.io → Agents → "Evolve Cold Caller"');
  console.log('  2. Phone Numbers tab → import Twilio number → copy the agent_phone_number_id');
  console.log('  3. Add ELEVENLABS_AGENT_PHONE_NUMBER_ID=... to .env');
  console.log(`  4. Webhooks tab → URL: ${toolBaseUrl}/api/webhooks/elevenlabs`);
  console.log('     Set webhook secret = ELEVENLABS_WEBHOOK_SECRET in .env');
}

main().catch(err => {
  console.error('seed-agent failed:', err);
  process.exit(1);
});
