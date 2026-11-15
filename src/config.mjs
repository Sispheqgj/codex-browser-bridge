import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export const bridgeHome = process.env.CODEX_BRIDGE_HOME || join(homedir(), '.codex-browser-bridge');
export const configPath = join(bridgeHome, 'config.json');
export const codexHome =
  process.env.CODEX_BRIDGE_CODEX_HOME || process.env.CODEX_HOME || join(homedir(), '.codex');
const bundles = [
  '/Applications/ChatGPT.app/Contents/Resources',
  '/Applications/Codex.app/Contents/Resources',
];
const bundled = (suffix, fallback) =>
  bundles.map((root) => root + '/' + suffix).find(existsSync) || fallback;
export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('配置必须是 JSON 对象');
  const port = value.port ?? 3007;
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('port 必须为 1024-65535');
  const origin = value.publicOrigin || 'http://127.0.0.1:' + port;
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error('publicOrigin 必须是有效网址');
  }
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !['http:', 'https:'].includes(url.protocol)
  )
    throw new Error('publicOrigin 只包含协议、主机和端口');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('外部入口必须使用 HTTPS');
  if (value.callerThreadId && !/^[a-zA-Z0-9_-]{12,100}$/.test(value.callerThreadId))
    throw new Error('callerThreadId 格式无效');
  const remotes = value.remotes || [];
  if (!Array.isArray(remotes)) throw new Error('remotes 必须为数组');
  const ids = new Set(['mac']),
    hosts = new Set();
  for (const remote of remotes) {
    if (!remote || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(remote.id || '') || ids.has(remote.id))
      throw new Error('远程 id 无效或重复');
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$/.test(remote.host || '') || hosts.has(remote.host))
      throw new Error('SSH host 无效或重复');
    if (!remote.socketPath || !isAbsolute(remote.socketPath))
      throw new Error('远程 socketPath 必须填写实际绝对路径');
    if (remote.codexBinary && remote.codexBinary !== 'codex' && !isAbsolute(remote.codexBinary))
      throw new Error('codexBinary 使用 codex 或绝对路径');
    ids.add(remote.id);
    hosts.add(remote.host);
  }
  return { ...value, port, publicOrigin: origin, remotes };
}
let settings = {};
if (existsSync(configPath)) settings = JSON.parse(readFileSync(configPath, 'utf8'));
export const config = validateConfig(settings);
export const statePath = (name) => join(bridgeHome, name);
export const nativeStatePath = join(codexHome, '.codex-global-state.json');
export const desktopIpcPath = join(codexHome, 'ipc', 'ipc.sock');
export const appToolsDirectory = config.appToolsDirectory || '/tmp/codex-app-tools';
export const codexBinary =
  config.codexBinary || bundled('codex-cli/CodexCLI.app/Contents/MacOS/codex', 'codex');
export const nodeBinary = config.nodeBinary || bundled('cua_node/bin/node', null);
export function getToken() {
  const token = readFileSync(statePath('access-token'), 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('配对密钥无效，请运行 npm run init');
  return token;
}
export function requireCallerThread() {
  if (!config.callerThreadId)
    throw new Error('请在私有 config.json 设置用于桌面调用的 callerThreadId，参见 README');
  return config.callerThreadId;
}
export function shellQuote(value) {
  return "'" + String(value).replaceAll("'", "'\\''") + "'";
}
export function sshArguments(remote) {
  const command = [
    remote.codexBinary || 'codex',
    'app-server',
    'proxy',
    '--sock',
    remote.socketPath,
  ]
    .map(shellQuote)
    .join(' ');
  return [
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'ConnectTimeout=15',
    '-o',
    'ServerAliveInterval=15',
    '-o',
    'ServerAliveCountMax=3',
    remote.host,
    command,
  ];
}
