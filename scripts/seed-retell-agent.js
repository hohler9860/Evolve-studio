// scripts/seed-retell-agent.js
//
// Provisions a Retell agent for Evolve Studio's cold-call pipeline.
//
// Two-step Retell flow:
//   1. POST /create-retell-llm   → defines the brain (system prompt, LLM, tools)
//   2. POST /create-agent        → ties the brain to a voice + telephony
//
// Defaults to Rime Mist v2 (Allison) — trained specifically on real phone calls.
// Override with RETELL_VOICE_ID=cartesia-Sonic-Female-3 or 11labs-Elise etc.
//
// After: paste the printed RETELL_AGENT_ID + RETELL_LLM_ID into .env, then run
// scripts/register-retell-tools.js to wire book_meeting/opt_out/send_followup.
//
// Usage:
//   TOOL_BASE_URL=https://www.evolvestudio.info \
//     node --env-file=.env scripts/seed-retell-agent.js

const fs = require('node:fs');
const path = require('node:path');

const RETELL_BASE = 'https://api.retellai.com';

// Default voice — Rime Mist v2 (Allison) per 2026 research, best for phone calls.
// Other strong picks:
//   - cartesia-Sonic-Female-3     (fastest TTS on Earth, ~40ms)
//   - 11labs-Elise-Warm-Natural   (port your EL voice over)
const DEFAULT_VOICE = process.env.RETELL_VOICE_ID || 'rime-mist-allison';

// LLM model. Claude Haiku is fast enough for real-time calls (~100-200ms).
// Sonnet is too slow. Gemini Flash is also fast but Haiku has better personality
// per the research. Override with RETELL_LLM_MODEL=gemini-2.0-flash.
const LLM_MODEL = process.env.RETELL_LLM_MODEL || 'claude-4.5-haiku';

async function main() {
  const apiKey = process.env.RETELL_API_KEY;
  const toolBaseUrl = process.env.TOOL_BASE_URL;

  if (!apiKey) {
    console.error('Required: RETELL_API_KEY in .env');
    console.error('Get one at: https://dashboard.retellai.com/dashboard/apiKeys');
    process.exit(1);
  }

  // Load the human-tuned system prompt. Falls back to a tiny inline default
  // if the file doesn't exist yet.
  const promptPath = process.env.RETELL_PROMPT_PATH || path.join(__dirname, '..', 'prompts', 'cold-call-retell.md');
  let systemPrompt;
  try {
    systemPrompt = fs.readFileSync(promptPath, 'utf8');
    console.log(`→ loaded system prompt from ${promptPath} (${systemPrompt.length} chars)`);
  } catch {
    console.error(`ERROR: prompt file not found at ${promptPath}`);
    console.error('Set RETELL_PROMPT_PATH or save the prompt to /tmp/evolve-human-prompt.txt first.');
    process.exit(1);
  }

  // 1. Create Retell LLM
  const llmBody = {
    general_prompt: systemPrompt,
    model: LLM_MODEL,
    model_temperature: 0.4,
    model_high_priority: true,
    begin_message: "Hey {{owner_first_name}} — noticed something specific about {{business_name}} I wanted to flag. Real quick, I'm an AI Henry built, the call's recorded — wanted to give you a heads-up before I take 20 seconds of your time. Cool?",
    general_tools: [], // Tools registered separately via register-retell-tools.js
    default_dynamic_variables: {
      business_name: 'your business',
      owner_first_name: 'there',
      city: 'Boston',
      category: 'small business',
      phone: '+10000000000',
      specific_observation: 'I noticed something about your site I wanted to flag.',
    },
  };

  console.log(`→ creating Retell LLM (model: ${LLM_MODEL})…`);
  const llmRes = await fetch(`${RETELL_BASE}/create-retell-llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(llmBody),
  });
  const llmText = await llmRes.text();
  if (!llmRes.ok) {
    console.error('LLM create failed:', llmRes.status);
    console.error(llmText.slice(0, 800));
    process.exit(1);
  }
  const llm = JSON.parse(llmText);
  console.log(`✓ LLM created: ${llm.llm_id}`);

  // 2. Create Agent that uses the LLM
  const agentBody = {
    agent_name: 'Evolve Cold Caller',
    response_engine: {
      type: 'retell-llm',
      llm_id: llm.llm_id,
    },
    voice_id: DEFAULT_VOICE,
    voice_temperature: 1.0,
    voice_speed: 1.0,
    enable_backchannel: true,           // "mhm", "yeah" while prospect talks — KEY for human feel
    backchannel_frequency: 0.8,
    backchannel_words: ['yeah', 'mhm', 'right', 'got it', 'totally'],
    interruption_sensitivity: 0.8,      // Higher = stops talking faster when prospect interrupts
    responsiveness: 0.9,                // 0-1, how fast agent responds after prospect finishes
    ambient_sound: 'coffee-shop',        // Subtle chatter — feels like a real person in a real space
    ambient_sound_volume: 0.4,
    normalize_for_speech: true,          // Numbers like $949.99 → "nine forty nine ninety nine"
    end_call_after_silence_ms: 30000,
    language: 'en-US',
    webhook_url: toolBaseUrl ? `${toolBaseUrl}/api/webhooks/retell` : undefined,
    enable_voicemail_detection: true,
    voicemail_message: '', // Stay silent on voicemail — don't leave a robo message
    post_call_analysis_data: [
      { type: 'string', name: 'meeting_booked', description: 'true/false — did the agent successfully book a meeting via book_meeting tool' },
      { type: 'string', name: 'objection_raised', description: 'main objection if any (price, busy, not_interested, already_have_site, etc)' },
    ],
  };

  console.log(`→ creating Retell agent (voice: ${DEFAULT_VOICE})…`);
  const agentRes = await fetch(`${RETELL_BASE}/create-agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(agentBody),
  });
  const agentText = await agentRes.text();
  if (!agentRes.ok) {
    console.error('Agent create failed:', agentRes.status);
    console.error(agentText.slice(0, 800));
    process.exit(1);
  }
  const agent = JSON.parse(agentText);
  console.log(`✓ Agent created: ${agent.agent_id}`);
  console.log('');
  console.log('=================================================');
  console.log('Add these to your .env (and Vercel production env):');
  console.log('=================================================');
  console.log(`RETELL_AGENT_ID=${agent.agent_id}`);
  console.log(`RETELL_LLM_ID=${llm.llm_id}`);
  console.log(`RETELL_FROM_NUMBER=${process.env.TWILIO_PHONE_NUMBER || '<your Twilio number imported into Retell>'}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Import your Twilio number into Retell (Dashboard → Phone Numbers → Import)');
  console.log('  2. Run: TOOL_BASE_URL=https://www.evolvestudio.info node --env-file=.env scripts/register-retell-tools.js');
  console.log('  3. Set VOICE_PROVIDER=retell in .env (local) to use Retell for dry-runs');
  console.log('  4. Test: TO=+1XXXYYYZZZZ npm run dry-run');
}

main().catch(err => { console.error('seed-retell-agent failed:', err); process.exit(1); });
