import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const listener = createServer();
listener.listen(0, '127.0.0.1');
await once(listener, 'listening');
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const child = spawn(process.execPath, ['examples/demo/server.mjs'], {
  cwd: new URL('../', import.meta.url),
  env: { ...process.env, CODEX_BRIDGE_DEMO_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (data) => (log += data));
child.stderr.on('data', (data) => (log += data));
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(check);
      reject(new Error(log));
    }, 5000);
    const check = setInterval(() => {
      if (log.includes('Read-only demo:')) {
        clearTimeout(timeout);
        clearInterval(check);
        resolve();
      } else if (child.exitCode !== null) {
        clearTimeout(timeout);
        clearInterval(check);
        reject(new Error(log));
      }
    }, 25);
  });
  const request = (path, options = {}) =>
    fetch('http://127.0.0.1:' + port + '/original' + path, {
      ...options,
      signal: AbortSignal.timeout(5000),
    });
  const catalog = await (await request('/api/threads')).json();
  assert.equal(catalog.hosts[0].name, '演示 Mac');
  assert.equal(catalog.hosts.length, 2);
  assert.equal((await request('/control/api/message', { method: 'POST', body: '{}' })).status, 405);
  assert.equal(
    (await request('/control/api/model-settings', { method: 'POST', body: '{}' })).status,
    405,
  );
  assert.equal((await request('/api/threads')).status, 200);
  assert.equal((await request('/assets/missing.js')).status, 404);
  assert.equal((await request('/api/thread?host=unknown&id=unknown')).status, 404);
  assert.equal((await request('/index.html')).status, 200);
  console.log(
    'PASS: synthetic demo catalog and read-only controls, missing files rejected; no real Codex connection',
  );
} finally {
  const ended = once(child, 'exit');
  child.kill('SIGTERM');
  await ended;
}
