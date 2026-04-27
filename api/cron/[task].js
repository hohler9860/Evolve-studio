// /api/cron/[task] — single dispatcher for all cron handlers.
// Routes /api/cron/discover → handlers/cron/discover.js, etc.
// Required by Vercel Hobby's 12-function cap.

const handlers = {
  'discover':         require('../../lib/handlers/cron/discover'),
  'rate':             require('../../lib/handlers/cron/rate'),
  'enrich':           require('../../lib/handlers/cron/enrich'),
  'generate-scripts': require('../../lib/handlers/cron/generate-scripts'),
  'dial':             require('../../lib/handlers/cron/dial'),
  'daily-summary':    require('../../lib/handlers/cron/daily-summary'),
};

module.exports = async function handler(req, res) {
  const task = req.query.task;
  const fn = handlers[task];
  if (!fn) {
    return res.status(404).json({ error: `unknown cron task: ${task}`, available: Object.keys(handlers) });
  }
  return fn(req, res);
};
