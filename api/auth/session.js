const { authRequired, sessionExpiresAt } = require('../../lib/serverAuth');

module.exports = function session(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Método não permitido.' });
  const required = authRequired();
  const expiresAt = required ? sessionExpiresAt(req) : null;
  return res.status(200).json({ status: 'success', required, authenticated: !required || Boolean(expiresAt), expiresAt });
};
