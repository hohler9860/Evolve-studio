const { getSQL } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await requireAuth(req, res))) return;

  try {
    const sql = getSQL();
    const rows = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'new') as "newLeads",
        COUNT(*) FILTER (WHERE status = 'contacted') as contacted,
        COUNT(*) FILTER (WHERE status = 'converted') as converted,
        COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) as today
      FROM leads
    `;
    const stats = rows[0];
    res.json({
      total: Number(stats.total),
      newLeads: Number(stats.newLeads),
      contacted: Number(stats.contacted),
      converted: Number(stats.converted),
      today: Number(stats.today)
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
};
