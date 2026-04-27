// /api/webhooks/[provider] — single dispatcher for all webhook receivers.
// Routes /api/webhooks/elevenlabs → handlers/webhooks/elevenlabs.js, etc.

const handlers = {
  'elevenlabs': require('../../lib/handlers/webhooks/elevenlabs'),
  'cal':        require('../../lib/handlers/webhooks/cal'),
  'twilio':     require('../../lib/handlers/webhooks/twilio'),
};

module.exports = async function handler(req, res) {
  const provider = req.query.provider;
  const fn = handlers[provider];
  if (!fn) return res.status(404).json({ error: `unknown webhook provider: ${provider}` });
  return fn(req, res);
};

// Disable body parser so HMAC signature verification can read raw bytes
module.exports.config = { api: { bodyParser: false } };
