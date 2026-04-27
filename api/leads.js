const { getDB } = require('../lib/db');

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
    const db = getDB();
    const { data, error } = await db
      .from('leads')
      .insert({ name, business, email, phone: phone || '', link: link || '' })
      .select('id')
      .single();

    if (error) throw error;
    res.json({ success: true, id: data.id });
  } catch (err) {
    console.error('Error saving lead:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
