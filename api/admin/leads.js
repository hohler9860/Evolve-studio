const { getSQL } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await requireAuth(req, res))) return;

  try {
    const sql = getSQL();
    const rows = await sql`SELECT * FROM leads ORDER BY created_at DESC`;
    res.json(rows);
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: 'Failed to fetch leads.' });
  }
};
