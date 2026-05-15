// Provider-agnostic voice wrapper. Switches between ElevenLabs and Retell
// via VOICE_PROVIDER env var. Defaults to elevenlabs for safe rollback.
//
// Flip live by setting VOICE_PROVIDER=retell on Vercel (and locally in .env).
// Flip back instantly by setting it to "elevenlabs" or unsetting.
//
// Both adapters expose the same surface:
//   initiateOutboundCall({ to_number, dynamic_variables })
//     → { conversation_id, callSid, provider }
//   getConversation(id)
//   verifyWebhookSignature(rawBody, signatureHeader, secret?)

function getProvider() {
  const p = (process.env.VOICE_PROVIDER || 'elevenlabs').toLowerCase().trim();
  if (p !== 'elevenlabs' && p !== 'retell') {
    console.warn(`[voice] unknown VOICE_PROVIDER="${p}", falling back to elevenlabs`);
    return 'elevenlabs';
  }
  return p;
}

function getAdapter() {
  const p = getProvider();
  if (p === 'retell') return require('./retell');
  return require('./elevenlabs');
}

async function initiateOutboundCall(input) {
  const adapter = getAdapter();
  const result = await adapter.initiateOutboundCall(input);
  return { ...result, provider: getProvider() };
}

async function getConversation(id) {
  return getAdapter().getConversation(id);
}

async function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  return getAdapter().verifyWebhookSignature(rawBody, signatureHeader, secret);
}

module.exports = {
  getProvider,
  initiateOutboundCall,
  getConversation,
  verifyWebhookSignature,
};
