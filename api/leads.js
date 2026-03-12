const { getSQL } = require('../lib/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, business, email, phone, link } = req.body;

  if (!name || !business || !email) {
    return res.status(400).json({ error: 'Name, business, and email are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  try {
    const sql = getSQL();
    const rows = await sql`
      INSERT INTO leads (name, business, email, phone, link)
      VALUES (${name}, ${business}, ${email}, ${phone || ''}, ${link || ''})
      RETURNING id
    `;
    res.json({ success: true, id: rows[0].id });
  } catch (err) {
    console.error('Error saving lead:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
