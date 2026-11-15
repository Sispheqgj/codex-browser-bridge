# 开发指南

项目保持单个 npm 包，按职责分目录，避免为小型适配服务引入多包构建。

| 目录                            | 职责                                          |
| ------------------------------- | --------------------------------------------- |
| `src/server/`                   | HTTP 接口、认证、会话目录、项目映射、模型设置 |
| `src/transports/`               | 桌面工具通道、桌面 IPC、SSH App Server 连接   |
| `src/mcp/`                      | Codex 托管的 MCP 服务入口                     |
| `src/config.mjs`、`src/cli.mjs` | 配置读取与初始化、诊断命令                    |
| `web/`                          | 页面模板、浏览器交互、样式、Markdown          |
| `tests/`                        | 隔离测试；测试数据放在 `fixtures/`            |
| `scripts/`                      | 构建、测试调度、格式和发布检查                |
| `examples/demo/`                | 独立只读演示服务及虚构数据                    |
| `docs/assets/`                  | 使用演示数据拍摄的界面截图                    |

## 常用命令

```sh
npm ci
npm run format
npm test
npm run manifest
npm run check:release
```

`npm test` 会先构建前端，再运行测试。测试使用临时配置目录，不连接真实 Codex 或模型服务。`npm run format:check` 仅检查代码格式。

`npm run build` 把 `web/` 构建为 `dist/`，不会修改页面源文件。后端使用 `import.meta.url` 定位构建产物，静态资源包含内容版本和依赖许可证。生成文件与 `node_modules/` 都不提交 Git。

## 演示与截图

```sh
npm run demo
```

演示独立监听本机回环地址，默认端口 3177；可用 `CODEX_BRIDGE_DEMO_PORT` 修改。它只导入 `examples/demo/fixtures.mjs`，不加载生产后端，也不访问登录缓存。所有修改请求返回 405。

README 截图来自这套真实前端与虚构数据。更新截图时保持设备名称、会话内容和路径为演示值，并检查图片没有私人信息。

## 发布检查

发布文件由 `scripts/release-files.mjs` 的显式清单约束。增加源文件或截图时，同步更新清单，然后运行 `npm run manifest`，刷新 `docs/release-manifest.json`。检查会验证文件哈希、本地文档链接及指定的私人数据模式；它不能替代人工检查图片和待提交内容。

本次组织方式参考了 [HAPI](https://github.com/tiann/hapi) 按功能划分目录的做法，以及 [Uptime Kuma](https://github.com/louislam/uptime-kuma) 的截图、功能、安装入口顺序。只借鉴组织和呈现方式，没有复制它们的代码或图片。
