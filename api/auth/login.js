const {
  authRequired,
  createSessionToken,
  requestHasAllowedOrigin,
  sessionCookie,
  verifySharedPassword
} = require('../../lib/serverAuth');
const { reserveLoginAttempt } = require('../../lib/loginRateLimit');

module.exports = async function login(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Método não permitido.' });
  if (!authRequired()) return res.status(200).json({ status: 'success', required: false });
  if (!requestHasAllowedOrigin(req)) return res.status(403).json({ status: 'error', message: 'Origem não permitida.' });
  if (!process.env.APP_PASSWORD_HASH || !process.env.SESSION_SIGNING_SECRET) {
    return res.status(503).json({ status: 'error', message: 'Autenticação não configurada.' });
  }
  let attempt;
  try { attempt = await reserveLoginAttempt(req); }
  catch { return res.status(503).json({ status: 'error', message: 'Não foi possível verificar o acesso. Tente novamente em instantes.' }); }
  if (!attempt.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, attempt.retryAfter)));
    return res.status(429).json({ status: 'error', message: 'Limite de tentativas atingido. Aguarde antes de tentar novamente.' });
  }
  const password = req.body?.password;
  if (typeof password !== 'string' || !password.length || password.length > 1024) {
    return res.status(401).json({ status: 'error', message: 'Senha inválida.' });
  }
  let valid;
  try { valid = await verifySharedPassword(password, process.env.APP_PASSWORD_HASH); }
  catch { return res.status(503).json({ status: 'error', message: 'Autenticação indisponível.' }); }
  if (!valid) {
    return res.status(401).json({ status: 'error', message: 'Senha inválida.' });
  }
  res.setHeader('Set-Cookie', sessionCookie(createSessionToken(process.env.SESSION_SIGNING_SECRET)));
  return res.status(200).json({ status: 'success', authenticated: true });
};
