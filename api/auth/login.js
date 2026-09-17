const {
  authRequired,
  createSessionToken,
  requestHasAllowedOrigin,
  sessionCookie,
  verifySharedPassword
} = require('../../lib/serverAuth');

module.exports = async function login(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Método não permitido.' });
  if (!authRequired()) return res.status(200).json({ status: 'success', required: false });
  if (!requestHasAllowedOrigin(req)) return res.status(403).json({ status: 'error', message: 'Origem não permitida.' });
  if (!process.env.APP_PASSWORD_HASH || !process.env.SESSION_SIGNING_SECRET) {
    return res.status(503).json({ status: 'error', message: 'Autenticação não configurada.' });
  }
  if (!(await verifySharedPassword(req.body?.password, process.env.APP_PASSWORD_HASH))) {
    return res.status(401).json({ status: 'error', message: 'Senha inválida.' });
  }
  res.setHeader('Set-Cookie', sessionCookie(createSessionToken(process.env.SESSION_SIGNING_SECRET)));
  return res.status(200).json({ status: 'success', authenticated: true });
};
