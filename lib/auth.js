const { SignJWT, jwtVerify } = require('jose');

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

async function signToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(getSecret());
}

async function verifyToken(token) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload;
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', `auth_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', 'auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0');
}

function getTokenFromRequest(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/auth_token=([^;]+)/);
  return match ? match[1] : null;
}

async function requireAuth(req, res) {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  try {
    await verifyToken(token);
    return true;
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
}

module.exports = { signToken, verifyToken, setAuthCookie, clearAuthCookie, getTokenFromRequest, requireAuth };
