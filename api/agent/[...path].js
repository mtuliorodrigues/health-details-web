const { Readable } = require('node:stream');

const HOP_BY_HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

module.exports = async function agentProxy(req, res) {
  const agentOrigin = process.env.AGENT_ORIGIN;
  if (!agentOrigin) return res.status(503).json({ status: 'error', message: 'Agente remoto não configurado.' });

  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path || '';
  const target = new URL(`/${path}`, agentOrigin);
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path' && typeof value === 'string') target.searchParams.set(key, value);
  }

  const headers = Object.fromEntries(Object.entries(req.headers)
    .filter(([key]) => !HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'host'));
  const requestInit = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method)) requestInit.body = JSON.stringify(req.body || {});

  try {
    const upstream = await fetch(target, requestInit);
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) res.setHeader(key, value);
    });
    if (!upstream.body) return res.end();
    return Readable.fromWeb(upstream.body).pipe(res);
  } catch {
    return res.status(502).json({ status: 'error', message: 'Não foi possível conectar ao agente deste computador.' });
  }
};
