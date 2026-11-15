// Codex owns this helper's lifecycle, so its existing local peer checks stay
// enabled. The helper exposes one read-only status tool and hosts the paired UI.
console.log = (...args) => console.error(...args);
const { readFileSync, openSync, closeSync, writeFileSync, unlinkSync } = await import('node:fs');
const { config, statePath, getToken } = await import('../config.mjs');
const key = getToken();
const lock = statePath('owner.lock');
let owner = false,
  starting = false;
async function ensureHost() {
  if (owner || starting) return;
  starting = true;
  try {
    try {
      const r = await fetch('http://127.0.0.1:' + config.port + '/api/status', {
        headers: { Authorization: 'Bearer ' + key },
        signal: AbortSignal.timeout(1500),
      });
      if (r.ok) return;
    } catch {}
    try {
      const pid = Number(readFileSync(lock, 'utf8'));
      try {
        process.kill(pid, 0);
        return;
      } catch {}
      unlinkSync(lock);
    } catch {}
    let fd;
    try {
      fd = openSync(lock, 'wx', 0o600);
    } catch {
      return;
    }
    writeFileSync(fd, String(process.pid));
    closeSync(fd);
    process.env.CODEX_BRIDGE_MANAGED_HELPER = '1';
    await import('../server/index.mjs');
    owner = true;
  } finally {
    starting = false;
  }
}
await ensureHost();
setInterval(
  () => ensureHost().catch((e) => console.error('Mobile helper:', e.message)),
  5000,
).unref();
const statusTool = {
  name: 'status',
  title: '手机远控状态',
  description:
    '查看手机远控是否运行、在线设备数量，以及是否由 Codex 常驻托管。此工具只读取连接状态，不读取聊天内容，不修改任务。',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
};
async function handle(request) {
  if (request.id === undefined) return;
  let result;
  if (request.method === 'initialize')
    result = {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'codex-browser-bridge', version: '0.1.0', title: '手机远控助手' },
    };
  else if (request.method === 'tools/list') result = { tools: [statusTool] };
  else if (request.method === 'ping') result = {};
  else if (request.method === 'tools/call' && request.params?.name === 'status') {
    await ensureHost();
    const response = await fetch('http://127.0.0.1:' + config.port + '/api/status', {
      headers: { Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('远控服务暂不可用');
    const data = await response.json();
    result = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            running: true,
            managedByCodex: data.managedByCodex === true,
            helperMode: owner ? 'owner' : 'standby',
            onlineDevices: data.hosts.filter((h) => h.online).length,
            knownDevices: data.hosts.length,
          }),
        },
      ],
    };
  } else {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: request.id,
        error: { code: -32601, message: 'Method not found' },
      }) + '\n',
    );
    return;
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
}
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue;
    }
    handle(request).catch((e) =>
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: { code: -32000, message: e.message },
        }) + '\n',
      ),
    );
  }
});
process.stdin.on('end', () => process.kill(process.pid, 'SIGTERM'));
