const { authRequired, clearSessionCookie, requestHasAllowedOrigin } = require('../../lib/serverAuth');

module.exports = function logout(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'Método não permitido.' });
  if (authRequired() && !requestHasAllowedOrigin(req)) return res.status(403).json({ status: 'error', message: 'Origem não permitida.' });
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.status(200).json({ status: 'success' });
};
