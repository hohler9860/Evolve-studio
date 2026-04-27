// /api/tools/[name] — single dispatcher for ElevenLabs server tool calls.
// Routes /api/tools/book-meeting → handlers/tools/book-meeting.js, etc.

const handlers = {
  'book-meeting':  require('../../lib/handlers/tools/book-meeting'),
  'opt-out':       require('../../lib/handlers/tools/opt-out'),
  'send-followup': require('../../lib/handlers/tools/send-followup'),
};

module.exports = async function handler(req, res) {
  const name = req.query.name;
  const fn = handlers[name];
  if (!fn) return res.status(404).json({ error: `unknown tool: ${name}` });
  return fn(req, res);
};
