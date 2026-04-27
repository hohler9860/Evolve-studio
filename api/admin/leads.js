// /api/admin/leads — list (GET), update (PATCH ?id=), delete (DELETE ?id=)
// Merged from former /api/admin/leads/[id].js to fit Vercel Hobby's 12-function cap.

const { getDB } = require('../../lib/db');
const { requireAuth } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;
  const db = getDB();
  const id = req.query.id;

  try {
    if (req.method === 'GET') {
      const { data, error } = await db.from('leads').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.json(data);
    }

    if (!id) return res.status(400).json({ error: 'id query param required for PATCH/DELETE' });

    if (req.method === 'DELETE') {
      const { error } = await db.from('leads').delete().eq('id', id);
      if (error) throw error;
      return res.json({ success: true });
    }

    if (req.method === 'PATCH') {
      const { status, notes } = req.body || {};
      if (!status && notes === undefined) return res.status(400).json({ error: 'no updates provided' });
      const patch = {};
      if (status) patch.status = status;
      if (notes !== undefined) patch.notes = notes;
      const { error } = await db.from('leads').update(patch).eq('id', id);
      if (error) throw error;
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    console.error('[admin/leads] failed:', err);
    res.status(500).json({ error: err.message || 'failed' });
  }
};
