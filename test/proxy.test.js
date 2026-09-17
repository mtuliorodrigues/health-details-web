const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const proxy = require('../api/proxy');

test('proxy preserva rotas, parâmetros, métodos, corpo e SSE até o último evento', async (t) => {
  const previous = { ...process.env };
  const seen = [];
  const upstream = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    seen.push({ method: req.method, url: req.url, body, headers: req.headers });
    if (req.url.startsWith('/api/devices/collect/stream')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('event: log\ndata: {"message":"started"}\n\n');
      setTimeout(() => res.end('event: result\ndata: {"status":"success"}\n\n'), 250);
      return;
    }
    res.writeHead(req.method === 'DELETE' ? 404 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'success' }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  process.env.AGENT_ORIGIN = `http://127.0.0.1:${upstream.address().port}`;
  process.env.AGENT_API_KEY = 'mock-server-key';
  process.env.APP_AUTH_REQUIRED = 'false';
  const server = http.createServer(async (req, res) => {
    req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
    let body = '';
    for await (const chunk of req) body += chunk;
    if (body) req.body = JSON.parse(body);
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (payload) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)); };
    await proxy(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections(); server.close();
    upstream.closeAllConnections(); upstream.close();
    for (const key of ['AGENT_ORIGIN', 'AGENT_API_KEY', 'APP_AUTH_REQUIRED']) {
      if (previous[key] == null) delete process.env[key]; else process.env[key] = previous[key];
    }
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const prefix of ['/api/relay', '/api/agent']) {
    for (const path of ['/health', '/api/collectors/vendors', '/api/devices/history?limit=1&tag=a&tag=b']) {
      const response = await fetch(base + prefix + path, { headers: { cookie: 'private=session', 'x-agent-key': 'untrusted' } });
      assert.equal(response.status, 200);
      await response.text();
      assert.equal(seen.at(-1).url, path);
      assert.equal(seen.at(-1).headers.cookie, undefined);
      assert.equal(seen.at(-1).headers['x-agent-key'], 'mock-server-key');
    }
  }
  const rewritten = await fetch(`${base}/api/proxy?__agentPath=api/devices/history&limit=2`);
  assert.equal(rewritten.status, 200);
  await rewritten.text();
  assert.equal(seen.at(-1).url, '/api/devices/history?limit=2');
  for (const path of ['/api/devices/diagnostics/ping', '/api/devices/collect']) {
    const body = { ip: '172.16.141.2', vendor: 'ubiquiti-m5', label: 'teste ç' };
    const response = await fetch(base + '/api/relay' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    await response.text();
    assert.equal(seen.at(-1).method, 'POST');
    assert.deepEqual(JSON.parse(seen.at(-1).body), body);
  }
  const deletion = await fetch(base + '/api/relay/api/devices/history/nonexistent', { method: 'DELETE' });
  assert.equal(deletion.status, 404);
  await deletion.text();
  assert.equal(seen.at(-1).method, 'DELETE');
  assert.equal(seen.at(-1).body, '');

  const stream = await fetch(base + '/api/relay/api/devices/collect/stream?ip=172.16.141.2&vendor=ubiquiti-m5&protocol=http');
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader();
  const first = await reader.read();
  const firstText = Buffer.from(first.value).toString();
  assert.match(firstText, /event: log/);
  assert.doesNotMatch(firstText, /event: result/);
  let remaining = '';
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    remaining += Buffer.from(part.value).toString();
  }
  assert.match(remaining, /event: result/);
  assert.equal(seen.at(-1).url, '/api/devices/collect/stream?ip=172.16.141.2&vendor=ubiquiti-m5&protocol=http');

  const count = seen.length;
  const denied = await fetch(base + '/api/relay/api/devices/history', { method: 'POST' });
  assert.equal(denied.status, 405);
  const unknown = await fetch(base + '/api/relay/other');
  assert.equal(unknown.status, 404);
  assert.equal(seen.length, count);
  // Test the future session gate only in this isolated test process.
  process.env.APP_AUTH_REQUIRED = 'true';
  const unauthenticated = await fetch(base + '/api/relay/health');
  assert.equal(unauthenticated.status, 401);
  assert.equal(seen.length, count);
});
