const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const login = require('../api/auth/login');
const logout = require('../api/auth/logout');
const session = require('../api/auth/session');
const { createSessionToken, sessionCookie } = require('../lib/serverAuth');

function response() {
  return { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

test('fluxo de autenticação isolado: cookie, expiração, logout, bloqueio e falha segura', async () => {
  const keys = ['APP_AUTH_REQUIRED','APP_ORIGIN','AGENT_ORIGIN','AGENT_API_KEY','SESSION_SIGNING_SECRET','APP_PASSWORD_HASH','VERCEL'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const realFetch = global.fetch;
  try {
    Object.assign(process.env, { APP_AUTH_REQUIRED: 'true', APP_ORIGIN: 'https://app.example', AGENT_ORIGIN: 'https://agent.example', AGENT_API_KEY: 'fake-agent-key', SESSION_SIGNING_SECRET: 'fake-session-key', VERCEL: '1' });
    const salt = Buffer.from('test-only-salt');
    process.env.APP_PASSWORD_HASH = `scrypt:${salt.toString('base64url')}:${crypto.scryptSync('test-only-password', salt, 32).toString('base64url')}`;
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      assert.equal(url.origin, 'https://agent.example');
      assert.equal(options.headers['X-Agent-Key'], 'fake-agent-key');
      const data = JSON.parse(options.body);
      assert.match(data.clientKey, /^[a-f0-9]{64}$/);
      assert.equal(data.password, undefined);
      return { ok: true, json: async () => ({ allowed: true, retryAfter: 0 }) };
    };
    const req = { method: 'POST', headers: { origin: 'https://app.example', 'x-forwarded-for': '192.0.2.1' }, body: { password: 'test-only-password' } };
    let res = response(); await login(req, res);
    assert.equal(res.code, 200);
    assert.match(res.headers['set-cookie'], /HttpOnly; Secure; SameSite=Strict/);
    assert.equal(res.headers['cache-control'], 'private, no-store');
    const cookie = res.headers['set-cookie'].split(';')[0];
    res = response(); session({ method: 'GET', headers: { cookie } }, res);
    assert.equal(res.body.authenticated, true); assert.ok(res.body.expiresAt > Date.now());
    res = response(); logout(req, res);
    assert.match(res.headers['set-cookie'], /Max-Age=0/);
    const expired = sessionCookie(createSessionToken('fake-session-key', 0)).split(';')[0];
    res = response(); session({ method: 'GET', headers: { cookie: expired } }, res);
    assert.equal(res.body.authenticated, false);
    res = response(); session({ method: 'GET', headers: { cookie: '__Host-health-session=%ZZ' } }, res);
    assert.equal(res.body.authenticated, false);
    res = response(); await login({ ...req, body: { password: 'wrong' } }, res);
    assert.equal(res.code, 401);
    res = response(); await login({ ...req, headers: { ...req.headers, origin: 'https://evil.example' } }, res);
    assert.equal(res.code, 403);
    global.fetch = async () => ({ ok: true, json: async () => ({ allowed: false, retryAfter: 800 }) });
    res = response(); await login(req, res);
    assert.equal(res.code, 429); assert.equal(res.headers['retry-after'], '800'); assert.equal(res.headers['set-cookie'], undefined);
    global.fetch = async () => { throw new Error('offline'); };
    res = response(); await login(req, res); assert.equal(res.code, 503);
    process.env.APP_AUTH_REQUIRED = 'false';
    res = response(); await login(req, res); assert.equal(res.code, 200); assert.equal(res.body.required, false);
    assert.equal(calls, 2);
  } finally {
    global.fetch = realFetch;
    for (const key of keys) { if (old[key] == null) delete process.env[key]; else process.env[key] = old[key]; }
  }
});
