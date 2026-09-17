const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const COOKIE_NAME = '__Host-health-session';
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function authRequired() {
  return process.env.APP_AUTH_REQUIRED === 'true';
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').flatMap((part) => {
    const index = part.indexOf('=');
    if (index < 1) return [];
    try { return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]]; }
    catch { return []; }
  }));
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createSessionToken(secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ iat: now, exp: now + SESSION_DURATION_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function verifySessionToken(token, secret, now = Date.now()) {
  if (!token || !secret) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !timingSafeEqual(signature, sign(payload, secret))) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(session.exp) && session.exp > now;
  } catch {
    return false;
  }
}

async function verifySharedPassword(password, encodedHash) {
  if (typeof password !== 'string' || !encodedHash) return false;
  const [algorithm, salt, expectedHash, extra] = encodedHash.split(':');
  if (algorithm !== 'scrypt' || !salt || !expectedHash || extra) return false;
  const expected = Buffer.from(expectedHash, 'base64url');
  if (!expected.length) return false;
  const derived = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length);
  return timingSafeEqual(derived, expected);
}

function hasValidSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifySessionToken(cookies[COOKIE_NAME], process.env.SESSION_SIGNING_SECRET);
}

function sessionExpiresAt(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!verifySessionToken(token, process.env.SESSION_SIGNING_SECRET)) return null;
  return JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')).exp;
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function requestHasAllowedOrigin(req) {
  const expectedOrigin = process.env.APP_ORIGIN;
  return Boolean(expectedOrigin && req.headers.origin === expectedOrigin);
}

function requireSession(req, res) {
  if (!authRequired()) return true;
  if (!hasValidSession(req)) {
    res.status(401).json({ status: 'error', message: 'Sessão necessária.' });
    return false;
  }
  return true;
}

module.exports = {
  authRequired,
  clearSessionCookie,
  createSessionToken,
  hasValidSession,
  requestHasAllowedOrigin,
  requireSession,
  sessionCookie,
  sessionExpiresAt,
  verifySessionToken,
  verifySharedPassword
};
