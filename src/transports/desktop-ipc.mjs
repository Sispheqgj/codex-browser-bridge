import net from 'node:net';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { desktopIpcPath } from '../config.mjs';
const VERSIONS = {
  'thread-owner-discovery': 1,
  'thread-stream-following-changed': 1,
  'thread-stream-state-changed': 11,
  'thread-follower-start-turn': 2,
  'thread-follower-steer-turn': 1,
  'thread-follower-interrupt-turn': 4,
  'thread-follower-read-model-settings': 1,
  'thread-follower-update-thread-settings': 2,
  'thread-follower-command-approval-decision': 1,
  'thread-follower-file-approval-decision': 1,
  'thread-follower-permissions-request-approval-response': 1,
  'thread-follower-submit-user-input': 1,
};
export class DesktopIpc extends EventEmitter {
  constructor() {
    super();
    this.pending = new Map();
    this.socket = null;
    this.clientId = 'initializing-client';
    this.buffer = Buffer.alloc(0);
    this.following = new Map();
    this.requests = new Map();
  }
  async connect() {
    if (this.socket && !this.socket.destroyed && this.clientId !== 'initializing-client') return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const socket = await new Promise((resolve, reject) => {
        const s = net.connect(desktopIpcPath);
        s.once('connect', () => resolve(s));
        s.once('error', reject);
      });
      this.socket = socket;
      this.buffer = Buffer.alloc(0);
      this.clientId = 'initializing-client';
      socket.on('data', (b) => this.onData(b));
      socket.on('error', () => this.disconnected(socket));
      socket.on('close', () => this.disconnected(socket));
      const r = await this.requestRaw('initialize', { clientType: 'cli' }, {});
      this.clientId = r.result.clientId;
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }
  disconnected(socket) {
    if (socket !== this.socket) return;
    this.socket = null;
    this.clientId = 'initializing-client';
    this.following.clear();
    this.requests.clear();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('桌面连接已断开'));
    }
    this.pending.clear();
  }
  send(value) {
    if (!this.socket || this.socket.destroyed) throw new Error('请在 Mac 打开 Codex');
    const body = Buffer.from(JSON.stringify(value)),
      frame = Buffer.alloc(body.length + 4);
    frame.writeUInt32LE(body.length);
    body.copy(frame, 4);
    this.socket.write(frame);
  }
  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE();
      if (length > 32 * 1024 * 1024) {
        this.socket?.destroy();
        return;
      }
      if (this.buffer.length < length + 4) return;
      let value;
      try {
        value = JSON.parse(this.buffer.subarray(4, length + 4).toString());
      } catch {
        this.socket?.destroy();
        return;
      }
      this.buffer = this.buffer.subarray(length + 4);
      if (value.type === 'response') {
        const p = this.pending.get(value.requestId);
        if (!p) continue;
        this.pending.delete(value.requestId);
        clearTimeout(p.timer);
        value.resultType === 'success'
          ? p.resolve(value)
          : p.reject(new Error(value.error || '桌面操作失败'));
      } else if (value.type === 'broadcast') {
        if (value.method === 'thread-stream-state-changed') {
          const p = value.params,
            key = (p.hostId || 'local') + ':' + p.conversationId,
            change = p.change;
          if (change.type === 'snapshot')
            this.requests.set(key, structuredClone(change.conversationState?.requests || []));
          else if (change.type === 'patches')
            for (const patch of change.patches || []) {
              const path = patch.path;
              if (
                !Array.isArray(path) ||
                path[0] !== 'requests' ||
                path.some((k) => ['__proto__', 'constructor', 'prototype'].includes(String(k)))
              )
                continue;
              if (path.length === 1) {
                this.requests.set(key, patch.op === 'remove' ? [] : structuredClone(patch.value));
                continue;
              }
              const requests = this.requests.get(key) || [];
              let parent = requests;
              for (const k of path.slice(1, -1)) {
                if (parent?.[k] == null) {
                  parent = null;
                  break;
                }
                parent = parent[k];
              }
              if (parent == null) continue;
              const last = path.at(-1);
              if (Array.isArray(parent) && patch.op === 'add')
                parent.splice(Number(last), 0, structuredClone(patch.value));
              else if (Array.isArray(parent) && patch.op === 'remove')
                parent.splice(Number(last), 1);
              else if (patch.op === 'remove') delete parent[last];
              else parent[last] = structuredClone(patch.value);
              this.requests.set(key, requests);
            }
        }
        this.emit('broadcast', value);
      } else if (value.type === 'client-discovery-request')
        this.send({
          type: 'client-discovery-response',
          requestId: value.requestId,
          response: { canHandle: false },
        });
    }
  }
  requestRaw(method, params, { hostId, targetClientId, timeout = 10000 } = {}) {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('桌面操作超时'));
      }, timeout);
      this.pending.set(requestId, { resolve, reject, timer });
      try {
        this.send({
          type: 'request',
          method,
          requestId,
          sourceClientId: this.clientId,
          version:
            (VERSIONS[method] || 0) + (hostId && method.startsWith('thread-follower-') ? 1 : 0),
          params,
          ...(hostId ? { hostId } : {}),
          ...(targetClientId ? { targetClientId } : {}),
          timeoutMs: timeout,
        });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(e);
      }
    });
  }
  async request(method, params, options) {
    await this.connect();
    return this.requestRaw(method, params, options);
  }
  async owner(threadId, hostId = 'local') {
    const r = await this.request('thread-owner-discovery', { conversationId: threadId, hostId });
    return r.handledByClientId;
  }
  async follow(threadId, hostId = 'local') {
    const key = hostId + ':' + threadId;
    if (this.following.has(key)) return this.following.get(key);
    const owner = await this.owner(threadId, hostId);
    this.send({
      type: 'broadcast',
      method: 'thread-stream-following-changed',
      sourceClientId: this.clientId,
      version: 1,
      targetClientIds: [owner],
      params: { conversationId: threadId, hostId, following: true },
    });
    this.following.set(key, owner);
    return owner;
  }
  async control(threadId, hostId, method, params) {
    const owner = await this.owner(threadId, hostId);
    return this.request(
      method,
      { conversationId: threadId, ...params },
      { targetClientId: owner, ...(hostId !== 'local' ? { hostId } : {}) },
    );
  }
  close() {
    this.socket?.destroy();
  }
}
