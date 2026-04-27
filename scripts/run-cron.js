// Local runner for /api/cron/* endpoints. Imports the handler and invokes it
// with a mocked Vercel (req, res) so we can run the pipeline before any deploy.
//
// Usage: node --env-file=.env scripts/run-cron.js discover
//        node --env-file=.env scripts/run-cron.js rate
//        node --env-file=.env scripts/run-cron.js enrich
//        node --env-file=.env scripts/run-cron.js generate-scripts

const path = require('node:path');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/run-cron.js <discover|rate|enrich|generate-scripts|dial|daily-summary>');
  process.exit(1);
}

// Cron handlers moved to lib/handlers/cron/* (Vercel Hobby 12-fn cap workaround).
const handler = require(path.join('..', 'lib', 'handlers', 'cron', target));

const req = {
  method: 'GET',
  headers: { authorization: `Bearer ${process.env.CRON_SECRET || 'dev'}` },
  query: {},
};

const res = {
  _status: 200,
  status(code) { this._status = code; return this; },
  json(body) {
    console.log(JSON.stringify(body, null, 2));
    return this;
  },
  end() { return this; },
};

(async () => {
  const t0 = Date.now();
  console.log(`→ running cron/${target}…`);
  try {
    await handler(req, res);
    console.log(`\nstatus: ${res._status} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    process.exit(res._status >= 400 ? 1 : 0);
  } catch (err) {
    console.error('\nhandler threw:', err);
    process.exit(1);
  }
})();
