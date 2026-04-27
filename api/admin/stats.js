const { getDB } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await requireAuth(req, res))) return;

  try {
    const db = getDB();
    const { data, error } = await db.rpc('exec_lead_stats').single();

    if (error && error.code !== 'PGRST202') throw error; // PGRST202 = function not found, fall back

    if (data) {
      return res.json({
        total: Number(data.total),
        newLeads: Number(data.new_leads),
        contacted: Number(data.contacted),
        converted: Number(data.converted),
        today: Number(data.today)
      });
    }

    // Fallback: compute via 5 simple count queries (no rpc available).
    const todayIso = new Date().toISOString().slice(0, 10);
    const counts = await Promise.all([
      db.from('leads').select('id', { count: 'exact', head: true }),
      db.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      db.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'contacted'),
      db.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'converted'),
      db.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', `${todayIso}T00:00:00Z`)
    ]);

    res.json({
      total:     counts[0].count ?? 0,
      newLeads:  counts[1].count ?? 0,
      contacted: counts[2].count ?? 0,
      converted: counts[3].count ?? 0,
      today:     counts[4].count ?? 0
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
};
