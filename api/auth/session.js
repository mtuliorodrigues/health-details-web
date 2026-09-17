const { authRequired, hasValidSession } = require('../../lib/serverAuth');

module.exports = function session(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ status: 'error', message: 'Método não permitido.' });
  return res.status(200).json({ status: 'success', required: authRequired(), authenticated: authRequired() ? hasValidSession(req) : true });
};
