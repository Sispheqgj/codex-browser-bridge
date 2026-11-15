# Codex Browser Bridge

An experimental, self-hosted browser controller for existing Codex desktop and SSH chats. 手机浏览器查看并控制已有 Codex 会话，保留桌面项目分组，使用独立配对认证。

**Status: experimental reference implementation.** Extracted from a working personal macOS deployment. The portable source has automated checks; installation on another Mac has not been verified. Desktop integration uses internal, version-dependent interfaces. This is an independent project, not an official OpenAI product.

## What this is useful for

- Open a small web page in Safari, without switching the ChatGPT account on the phone.
- Browse local and configured SSH chats in one recent/project view.
- Send to the original thread, steer or interrupt a running turn, and handle supported approvals.
- Select the next turn's model and reasoning effort from the target device's model catalog.
- Cache the catalog, paginate history, and render Markdown, code, tables and math on the client.

The phone holds bridge credentials. Codex credentials stay in their existing host-side configuration. Independent browser pairing is **not** account sharing or a way to bypass an organization's access policy.

## Existing alternatives come first

This is not the first Codex mobile controller. Official remote connections, HAPI, Happy, Open Codex UI, and other browser bridges overlap substantially. [Related work and positioning](docs/RELATED_WORK.md) explains what was checked and what was not. If the official same-account workflow meets your needs, it is a better default than depending on internal desktop IPC.

## Requirements and compatibility

- A Mac with Codex desktop running and already signed in.
- Node.js 24+ for source checks/building. Desktop control also needs the application's compatible bundled Node and the normal Codex-managed process ancestry.
- A dedicated existing desktop chat ID for `callerThreadId`; create/select this yourself in Codex. It is a caller context, not a destination restriction: selected targets are passed separately.
- HTTPS for phone access. Tailscale Funnel is one option; a private Tailscale network is another.
- For direct SSH transport: working host aliases in your own SSH config, an existing remote Codex app-server control socket, and compatible Codex versions. This project does not install or restart remote app-servers.

At extraction, the installed bundled CLI reported `0.169.0-alpha.11.1`. This is a version snapshot, not a compatibility guarantee for that build or later releases; the generalized desktop-control path still needs a clean-machine check. Internal method versions and response shapes are explicit in `desktop-ipc.mjs` and `desktop.mjs`.

## Install from source

```sh
npm ci
npm test
npm run build
npm run init
```

Initialization writes private state under `~/.codex-browser-bridge`, using user-only permissions. It generates a fresh 256-bit bridge token; no HAPI installation or token is needed. Run from the repository root.

Edit the private `~/.codex-browser-bridge/config.json`:

```json
{
  "port": 3007,
  "publicOrigin": "https://your-mac.your-tailnet.ts.net",
  "callerThreadId": "PUT_YOUR_EXISTING_DESKTOP_CHAT_ID_HERE",
  "remotes": []
}
```

`publicOrigin` is the exact scheme/host/port of the browser entry, with no path or trailing slash. The examples are placeholders. Optional `CODEX_BRIDGE_HOME` and existing `CODEX_HOME` select other private state locations. Optional `nodeBinary`, `codexBinary`, and `appToolsDirectory` override detected application paths.

Local and desktop-discovered SSH catalogs use desktop tools. For the explicit SSH transport, add a remote entry only after confirming the existing server's socket path:

```json
{
  "id": "devbox",
  "name": "Development server",
  "host": "devbox",
  "codexBinary": "codex",
  "socketPath": "/home/you/.codex/app-server-control/app-server-control.sock"
}
```

Place entries in `remotes`. `host` is an SSH config alias; authentication and jump hosts stay in your SSH configuration. Do not put private keys, passwords or tokens here. Remote socket paths must be actual absolute paths, not `~` placeholders.

## Start through Codex's MCP manager

```sh
npm run doctor
npm run mcp
```

`doctor` checks prerequisites without invoking chats. `mcp` prints the detected command/arguments without editing Codex settings. Merge those values into your existing Codex `config.toml`, preserving its other contents. The TOML shape is:

```toml
[mcp_servers.codex_browser_bridge]
enabled = true
command = "/absolute/path/to/the/application-bundled/node"
args = ["/absolute/path/to/this/repository/stdio-host.mjs"]
startup_timeout_sec = 15
```

If using a custom state location, add the `env` values printed by `npm run mcp` in the corresponding MCP configuration. Refresh MCP settings; a full desktop restart may be needed to load a new service into existing chats. The helper exposes only one MCP status tool while hosting the authenticated web control API.

**A standalone `npm start` can serve HTTP but does not prove desktop control works.** The desktop's normal process trust checks still apply. Use the supported Codex-managed launch arrangement for this experimental adapter; do not disable, spoof or patch peer/signature checks. A failed check is a compatibility blocker.

## Connect a phone

After the Codex-managed helper is listening on loopback, choose your own HTTPS access arrangement. For example, with Tailscale already installed and authenticated:

```sh
tailscale funnel --bg --https=443 --set-path=/original http://127.0.0.1:3007
```

This command creates a public HTTPS entry to the authenticated bridge. Read the [Tailscale Funnel documentation](https://tailscale.com/docs/features/tailscale-funnel) before running it. If using a private tailnet instead, configure Serve and the phone's Tailscale client. Neither deployment is configured automatically by this repository.

Open `https://your-mac.your-tailnet.ts.net/original/index.html` in Safari and paste your bridge token from the private `access-token` file once. Never publish that token, a token-bearing QR, or an authenticated browser export. Pairing uses a signed Secure/HttpOnly cookie, currently valid for 180 days. The phone's ChatGPT app account remains unchanged.

The generalized source uses one HTTP listener. The `/original/control` alias is served by that same listener; an extra control port is unnecessary. An earlier personal deployment used two ports for a live update.

## Verify before relying on it

1. Check the status tool says the bridge is Codex-managed.
2. Open a disposable existing chat and compare its original ID on both clients.
3. Send a harmless task from the phone and confirm the desktop observes the same turn; test an approval if your configured policy requests one.
4. Change a model setting for the next turn and verify the desktop reflects it.
5. Disconnect/reconnect the phone and confirm history is read back without replaying uncertain messages.

This repository's automated tests do not perform those subscription-backed operations. [Validation scope](docs/VALIDATION.md) separates the original deployment evidence from the new source tests.

## Development

```sh
npm test
npm run build
node test-http.mjs
npm run check:release
```

Tests use mocks and an isolated HTTP service. They do not read real chat history, call a model, or control real sessions. Build output is ignored by Git and should be generated locally. See [architecture](docs/ARCHITECTURE.md), [security](SECURITY.md), and [third-party notices](THIRD_PARTY_NOTICES.md).

## Limits

- macOS desktop integration only; no Windows desktop validation.
- A desktop/app-server upgrade may require adapter changes. This is not a stable public desktop API.
- Offline hosts retain cached metadata but cannot be controlled.
- Project metadata is mapped from desktop state; directory matching is a fallback.
- File/image placeholders are shown; phone uploads/downloads and full plugin interfaces are not implemented.
- Selected approvals are supported; unknown native forms stay on desktop.
- No durable exactly-once delivery guarantee across bridge restarts. Refresh history before retrying an uncertain send.
- Browser-local catalog entries and drafts are private data. Use a trusted device.

MIT for this adapter's source. No Codex binaries, HAPI source, personal logs, chat histories, QR codes or credentials are distributed. The release is intentionally private to npm (`private: true`); GitHub publication is a separate action.
