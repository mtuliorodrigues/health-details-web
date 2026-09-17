const { Readable } = require('node:stream');
const { requireSession } = require('../../lib/serverAuth');

const HOP_BY_HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

module.exports = async function relayProxy(req, res) {
  if (!requireSession(req, res)) return;
  const agentOrigin = process.env.AGENT_ORIGIN;
  if (!agentOrigin) return res.status(503).json({ status: 'error', message: 'Agente remoto não configurado.' });

  const incomingUrl = new URL(req.url, 'http://localhost');
  const path = incomingUrl.pathname.replace(/^\/api\/relay\/?/, '');
  const target = new URL(`/${path}`, agentOrigin);
  incomingUrl.searchParams.forEach((value, key) => target.searchParams.append(key, value));

  const headers = Object.fromEntries(Object.entries(req.headers)
    .filter(([key]) => !HOP_BY_HOP_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'host'));
  delete headers['x-agent-key'];
  if (process.env.AGENT_API_KEY) headers['x-agent-key'] = process.env.AGENT_API_KEY;
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
