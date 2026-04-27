// scripts/register-tools.js
//
// Registers book_meeting + opt_out as server tools on the existing EL agent.
// PATCHes the agent — only updates `prompt.tools`, leaves voice/system prompt/
// audio tags/test values intact.
//
// Usage: TOOL_BASE_URL=https://www.evolvestudio.info node --env-file=.env scripts/register-tools.js

async function main() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const toolBaseUrl = process.env.TOOL_BASE_URL;
  const toolSecret = process.env.EL_TOOL_SECRET || '';

  if (!apiKey || !agentId || !toolBaseUrl) {
    console.error('Required: ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, TOOL_BASE_URL');
    process.exit(1);
  }

  const tools = [
    {
      type: 'webhook',
      name: 'book_meeting',
      description: 'Book a 15-minute Zoom consultation with Henry. Use this when the prospect agrees to a meeting time.',
      api_schema: {
        url: `${toolBaseUrl}/api/tools/book-meeting`,
        method: 'POST',
        request_headers: toolSecret ? { Authorization: `Bearer ${toolSecret}` } : {},
        request_body_schema: {
          type: 'object',
          required: ['business_id', 'attendee_name', 'attendee_email', 'start_iso'],
          properties: {
            business_id:    { type: 'string', description: 'pass {{business_id}} from dynamic variables' },
            attendee_name:  { type: 'string', description: 'prospect full name' },
            attendee_email: { type: 'string', description: 'prospect email' },
            attendee_phone: { type: 'string', description: 'prospect phone E.164' },
            start_iso:      { type: 'string', description: 'ISO8601 start time UTC' },
            timezone:       { type: 'string', description: "default 'America/New_York'" },
          },
        },
      },
    },
    {
      type: 'webhook',
      name: 'opt_out',
      description: 'Add the prospect to do-not-call list. Use immediately when they say "do not call", "stop calling", "take me off your list", or "do not record".',
      api_schema: {
        url: `${toolBaseUrl}/api/tools/opt-out`,
        method: 'POST',
        request_headers: toolSecret ? { Authorization: `Bearer ${toolSecret}` } : {},
        request_body_schema: {
          type: 'object',
          required: ['phone_e164'],
          properties: {
            business_id: { type: 'string', description: 'pass {{business_id}}' },
            phone_e164:  { type: 'string', description: 'the number being called in E.164 format' },
            reason:      { type: 'string', description: 'short reason for the opt-out, e.g. "do not call"' },
          },
        },
      },
    },
  ];

  // Fetch current agent
  console.log(`→ fetching current agent ${agentId}…`);
  const getRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!getRes.ok) {
    console.error('agent fetch failed:', getRes.status, await getRes.text());
    process.exit(1);
  }
  const current = await getRes.json();
  const currentPrompt = current?.conversation_config?.agent?.prompt || {};

  // PATCH with just the tools field merged into prompt
  const body = {
    conversation_config: {
      agent: {
        prompt: {
          ...currentPrompt,
          tools,
        },
      },
    },
  };

  console.log('→ patching agent with 2 tools…');
  const patchRes = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const patchText = await patchRes.text();
  if (!patchRes.ok) {
    console.error('patch failed:', patchRes.status);
    console.error(patchText.slice(0, 800));
    process.exit(1);
  }

  console.log('✓ tools registered');
  console.log('  - book_meeting → ' + tools[0].api_schema.url);
  console.log('  - opt_out      → ' + tools[1].api_schema.url);
  console.log('');
  console.log('Next: in elevenlabs.io → Agent → Webhooks tab,');
  console.log('  paste post-call URL: ' + toolBaseUrl + '/api/webhooks/elevenlabs');
  console.log('  paste secret:        (your ELEVENLABS_WEBHOOK_SECRET from .env)');
}

main().catch(err => { console.error('register-tools failed:', err); process.exit(1); });
