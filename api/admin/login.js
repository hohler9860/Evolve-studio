const bcrypt = require('bcryptjs');
const { signToken, setAuthCookie } = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body;
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPassHash = process.env.ADMIN_PASS_HASH;

  if (!adminPassHash) {
    return res.status(500).json({ error: 'Admin not configured.' });
  }

  if (username === adminUser && bcrypt.compareSync(password, adminPassHash)) {
    const token = await signToken({ username });
    setAuthCookie(res, token);
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials.' });
  }
};
