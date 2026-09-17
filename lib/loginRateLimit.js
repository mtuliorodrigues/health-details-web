const crypto = require('node:crypto');
const { isIP } = require('node:net');

async function reserveLoginAttempt(req) {
  if (!process.env.AGENT_ORIGIN || !process.env.AGENT_API_KEY || !process.env.SESSION_SIGNING_SECRET) throw new Error('Limiter unavailable');
  // Vercel overwrites x-forwarded-for. Local tests use the actual socket address.
  const ip = process.env.VERCEL === '1' ? req.headers['x-forwarded-for']?.split(',')[0].trim() : req.socket?.remoteAddress;
  if (!ip || !isIP(ip)) throw new Error('Client address unavailable');
  const clientKey = crypto.createHmac('sha256', process.env.SESSION_SIGNING_SECRET).update(ip).digest('hex');
  const response = await fetch(new URL('/api/internal/login-attempt', process.env.AGENT_ORIGIN), {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
    headers: { 'Content-Type': 'application/json', 'X-Agent-Key': process.env.AGENT_API_KEY },
    body: JSON.stringify({ clientKey })
  });
  if (!response.ok) throw new Error('Limiter unavailable');
  const result = await response.json();
  if (typeof result.allowed !== 'boolean' || !Number.isFinite(result.retryAfter) || result.retryAfter < 0) throw new Error('Invalid limiter response');
  return result;
}
module.exports = { reserveLoginAttempt };
