// A separate read-only demo server. It never imports the production backend.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { catalog, modelSettings, snapshot } from './fixtures.mjs';

const port = Number(process.env.CODEX_BRIDGE_DEMO_PORT || 3177);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid demo port');
const output = new URL('../../dist/', import.meta.url);
await readFile(new URL('index.html', output));
const json = (response, status, value) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
};
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname.replace(/^\/original(?:\/control)?(?=\/|$)/, '') || '/';
  if (request.method !== 'GET')
    return json(response, 405, { error: '演示模式只读，不会发送指令或更改设置。' });
  if (path === '/api/status') return json(response, 200, { hosts: catalog.hosts, demo: true });
  if (path === '/api/threads') return json(response, 200, catalog);
  if (path === '/api/model-settings') return json(response, 200, modelSettings);
  if (path === '/api/thread') {
    const data = snapshot(url.searchParams.get('host'), url.searchParams.get('id'));
    return json(response, data ? 200 : 404, data || { error: 'Unknown demo chat' });
  }
  if (path === '/api/events') {
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    response.write('data: {"method":"connected"}\n\n');
    const heartbeat = setInterval(() => response.write(': demo heartbeat\n\n'), 15000);
    request.on('close', () => clearInterval(heartbeat));
    return;
  }
  if (path === '/') {
    response.writeHead(302, { Location: '/original/index.html' });
    return response.end();
  }
  if (path !== '/index.html' && !/^\/assets\/[a-zA-Z0-9_.-]+$/.test(path))
    return json(response, 404, { error: 'Not found' });
  try {
    const data = await readFile(new URL('.' + path, output));
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.woff2': 'font/woff2',
      '.woff': 'font/woff',
      '.ttf': 'font/ttf',
    };
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    response.end(data);
  } catch {
    json(response, 404, { error: 'Not found' });
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log('Read-only demo: http://127.0.0.1:' + port + '/original/index.html'),
);
process.on('SIGTERM', () => server.close(() => process.exit(0)));
