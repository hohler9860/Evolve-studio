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

// Secure flag only on HTTPS — localhost dev uses http, browser silently drops Secure cookies otherwise.
const isDev = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
const SECURE_FLAG = isDev ? '' : '; Secure';

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', `auth_token=${token}; HttpOnly${SECURE_FLAG}; SameSite=Lax; Path=/; Max-Age=86400`);
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `auth_token=; HttpOnly${SECURE_FLAG}; SameSite=Lax; Path=/; Max-Age=0`);
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
