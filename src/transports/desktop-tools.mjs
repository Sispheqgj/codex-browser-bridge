import net from 'node:net';
import { readdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

// Use the same local pipe as the bundled Codex App Tools plugin. No new
// app-server, account, history database, or continuation branch is created.
import { appToolsDirectory, requireCallerThread } from '../config.mjs';
const directory = appToolsDirectory;
export class DesktopTools {
  constructor() {
    this.socket = null;
    this.pending = new Map();
    this.counter = 0;
    this.buffer = Buffer.alloc(0);
    this.names = new Map();
  }
  async connect() {
    if (this.socket && !this.socket.destroyed) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const candidates = readdirSync(directory)
        .filter((n) => n.endsWith('.sock'))
        .map((n) => ({ path: directory + '/' + n, stat: statSync(directory + '/' + n) }))
        .filter((p) => p.stat.isSocket() && p.stat.uid === process.getuid())
        .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
      let last;
      for (const c of candidates) {
        try {
          const socket = await new Promise((resolve, reject) => {
            const s = net.connect(c.path);
            s.once('connect', () => resolve(s));
            s.once('error', reject);
          });
          this.socket = socket;
          this.buffer = Buffer.alloc(0);
          socket.on('data', (b) => this.onData(b));
          socket.on('error', (e) => this.closed(e, socket));
          socket.on('close', () => this.closed(new Error('请在 Mac 上打开 Codex'), socket));
          return;
        } catch (e) {
          last = e;
        }
      }
      throw last || new Error('请在 Mac 上打开 Codex');
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }
  closed(error, socket) {
    if (socket !== this.socket) return;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
  }
  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE();
      if (length > 32 * 1024 * 1024) {
        this.socket?.destroy(new Error('桌面响应过大'));
        return;
      }
      if (this.buffer.length < length + 4) return;
      let message;
      try {
        message = JSON.parse(this.buffer.subarray(4, length + 4).toString());
      } catch {
        this.socket?.destroy();
        return;
      }
      this.buffer = this.buffer.subarray(length + 4);
      const p = this.pending.get(message.id);
      if (!p) continue;
      this.pending.delete(message.id);
      clearTimeout(p.timer);
      message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result);
    }
  }
  async request(method, params, timeout = 20000) {
    await this.connect();
    const id = ++this.counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('桌面连接超时'));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      const payload = Buffer.from(JSON.stringify({ id, jsonrpc: '2.0', method, params })),
        frame = Buffer.alloc(4 + payload.length);
      frame.writeUInt32LE(payload.length);
      payload.copy(frame, 4);
      this.socket.write(frame);
    });
  }
  async tools() {
    const r = await this.request('tools/list', { threadStartKind: 'all' });
    this.names = new Map(r.tools.map((t) => [t.name, t.namespace]));
    return r.tools;
  }
  async call(tool, args, timeout = 30000) {
    if (!this.names.size) await this.tools();
    if (!this.names.has(tool)) throw new Error('桌面不支持 ' + tool);
    const r = await this.request(
      'tools/call',
      {
        tool,
        arguments: args,
        namespace: this.names.get(tool),
        callerSource: 'codex',
        hostId: 'local',
        threadId: requireCallerThread(),
        turnId: 'mobile-control-' + randomUUID(),
        callId: 'mobile-control-' + randomUUID(),
      },
      timeout,
    );
    const text = (r.contentItems || [])
      .filter((c) => c.type === 'inputText')
      .map((c) => c.text)
      .join('\n');
    if (!r.success) throw new Error(text || '桌面操作失败');
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
  close() {
    this.socket?.destroy();
  }
}
