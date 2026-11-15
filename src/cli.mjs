import { mkdirSync, existsSync, writeFileSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  bridgeHome,
  configPath,
  config,
  statePath,
  nodeBinary,
  codexBinary,
  desktopIpcPath,
  appToolsDirectory,
} from './config.mjs';

const command = process.argv[2];
if (command === 'init') {
  mkdirSync(bridgeHome, { recursive: true, mode: 0o700 });
  chmodSync(bridgeHome, 0o700);
  if (!existsSync(configPath))
    writeFileSync(
      configPath,
      JSON.stringify(
        { port: 3007, publicOrigin: 'http://127.0.0.1:3007', callerThreadId: '', remotes: [] },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
  if (!existsSync(statePath('access-token')))
    writeFileSync(statePath('access-token'), randomBytes(32).toString('hex') + '\n', {
      mode: 0o600,
    });
  console.log(
    '已初始化私有配置：' +
      configPath +
      '\n配对密钥保存在 ' +
      statePath('access-token') +
      '，不会输出到日志。\n下一步：填写 publicOrigin 和 callerThreadId，然后运行 npm run doctor。',
  );
} else if (command === 'doctor') {
  const checks = [
    ['平台为 macOS', process.platform === 'darwin'],
    ['已创建独立配对密钥', existsSync(statePath('access-token'))],
    ['已配置 callerThreadId', !!config.callerThreadId],
    ['官方 Node 路径存在', !!nodeBinary && existsSync(nodeBinary)],
    ['Codex 二进制路径存在', codexBinary === 'codex' || existsSync(codexBinary)],
    ['桌面 IPC 存在', existsSync(desktopIpcPath)],
    ['桌面工具通道目录存在', existsSync(appToolsDirectory)],
    ['手机入口已设置 HTTPS', config.publicOrigin.startsWith('https://')],
  ];
  for (const [name, ok] of checks) console.log((ok ? 'OK  ' : 'WAIT ') + name);
  console.log('仅检查本地先决条件；不证明桌面进程信任检查、手机网络或原会话控制已经通过。');
  process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
} else if (command === 'mcp') {
  if (!nodeBinary)
    throw new Error(
      '未找到应用附带 Node；请在私有配置中设置 nodeBinary。不要禁用桌面的进程信任检查。',
    );
  console.log(
    JSON.stringify(
      {
        mcp_servers: {
          codex_browser_bridge: {
            enabled: true,
            command: nodeBinary,
            args: [fileURLToPath(new URL('./mcp/index.mjs', import.meta.url))],
            startup_timeout_sec: 15,
            env: {
              CODEX_BRIDGE_HOME: bridgeHome,
              ...(process.env.CODEX_HOME ? { CODEX_HOME: process.env.CODEX_HOME } : {}),
            },
          },
        },
      },
      null,
      2,
    ),
  );
  console.log(
    '\n这是待合并到 Codex 配置的字段预览，不会自动修改你的配置。config.toml 使用相同字段的 TOML 写法，见 README。',
  );
} else {
  console.error('用法：node cli.mjs init | doctor | mcp');
  process.exitCode = 1;
}
