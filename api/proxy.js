const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { requireSession } = require('../lib/serverAuth');

const ROUTES = [
  [/^\/health$/, ['GET', 'HEAD']],
  [/^\/api\/collectors\/vendors$/, ['GET']],
  [/^\/api\/devices\/history$/, ['GET']],
  [/^\/api\/devices\/history\/[^/]+$/, ['DELETE']],
  [/^\/api\/devices\/diagnostics\/ping$/, ['POST']],
  [/^\/api\/devices\/collect$/, ['POST']],
  [/^\/api\/devices\/collect\/stream$/, ['GET']]
];

function getTarget(req, origin) {
  const incoming = new URL(req.url, 'http://localhost');
  const prefix = incoming.pathname.match(/^\/api\/(?:relay|agent)\/(.*)$/);
  // Vercel preserves the original URL; the rewrite parameter also supports
  // runtimes that expose the rewritten URL instead.
  const path = prefix ? prefix[1] : req.query?.__agentPath;
  if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\')) return null;
  const target = new URL(origin);
  target.pathname = `/${path}`;
  target.search = '';
  incoming.searchParams.forEach((value, key) => {
    if (key !== '__agentPath') target.searchParams.append(key, value);
  });
  return target;
}

module.exports = async function agentProxy(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!requireSession(req, res)) return;
  if (!process.env.AGENT_ORIGIN) {
    return res.status(503).json({ status: 'error', message: 'Agente remoto não configurado.' });
  }
  let target;
  try { target = getTarget(req, process.env.AGENT_ORIGIN); } catch { target = null; }
  const route = target && ROUTES.find(([pattern]) => pattern.test(target.pathname));
  if (!route) return res.status(404).json({ status: 'error', message: 'Rota do agente não encontrada.' });
  if (!route[1].includes(req.method)) {
    res.setHeader('Allow', route[1].join(', '));
    return res.status(405).json({ status: 'error', message: 'Método não permitido.' });
  }

  // Cookies, browser credentials and content-length never cross to the agent.
  const headers = { accept: req.headers.accept || 'application/json', 'accept-encoding': 'identity' };
  if (process.env.AGENT_API_KEY) headers['x-agent-key'] = process.env.AGENT_API_KEY;
  const controller = new AbortController();
  const onClose = () => { if (!res.writableFinished) controller.abort(); };
  res.on('close', onClose);
  const request = { method: req.method, headers, signal: controller.signal, redirect: 'error' };
  if (!['GET', 'HEAD'].includes(req.method) && req.body != null) {
    headers['content-type'] = req.headers['content-type'] || 'application/json';
    request.body = Buffer.isBuffer(req.body) || typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  try {
    const upstream = await fetch(target, request);
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    if (upstream.headers.get('content-type')?.includes('text/event-stream')) {
      res.setHeader('Cache-Control', 'private, no-store, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
    }
    res.flushHeaders();
    if (!upstream.body) return res.end();
    // Keep the invocation alive until the last SSE event has been forwarded.
    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch {
    if (res.destroyed) return;
    if (res.headersSent) return res.destroy();
    return res.status(502).json({ status: 'error', message: 'Não foi possível conectar ao agente deste computador.' });
  } finally {
    res.off('close', onClose);
  }
};
