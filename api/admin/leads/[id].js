const { getSQL } = require('../../../lib/db');
const { requireAuth } = require('../../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await requireAuth(req, res))) return;

  const { id } = req.query;

  try {
    const sql = getSQL();

    if (req.method === 'DELETE') {
      await sql`DELETE FROM leads WHERE id = ${id}`;
      return res.json({ success: true });
    }

    // PATCH
    const { status, notes } = req.body;

    if (!status && notes === undefined) {
      return res.status(400).json({ error: 'No updates provided.' });
    }

    if (status && notes !== undefined) {
      await sql`UPDATE leads SET status = ${status}, notes = ${notes} WHERE id = ${id}`;
    } else if (status) {
      await sql`UPDATE leads SET status = ${status} WHERE id = ${id}`;
    } else {
      await sql`UPDATE leads SET notes = ${notes} WHERE id = ${id}`;
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating lead:', err);
    res.status(500).json({ error: 'Failed to update lead.' });
  }
};
