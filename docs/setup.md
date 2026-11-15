# 安装与配置

## Requirements and compatibility

- A Mac with Codex desktop running and already signed in.
- Node.js 24+ for source checks/building. Desktop control also needs the application's compatible bundled Node and the normal Codex-managed process ancestry.
- A dedicated existing desktop chat ID for `callerThreadId`; create/select this yourself in Codex. It is a caller context, not a destination restriction: selected targets are passed separately.
- HTTPS for phone access. Tailscale Funnel is one option; a private Tailscale network is another.
- For direct SSH transport: working host aliases in your own SSH config, an existing remote Codex app-server control socket, and compatible Codex versions. This project does not install or restart remote app-servers.

At extraction, the installed bundled CLI reported `0.169.0-alpha.11.1`. This is a version snapshot, not a compatibility guarantee for that build or later releases; the generalized desktop-control path still needs a clean-machine check. Internal method versions and response shapes are explicit in `src/transports/desktop-ipc.mjs` and `src/transports/desktop-tools.mjs`.

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
args = ["/absolute/path/to/this/repository/src/mcp/index.mjs"]
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

This repository's automated tests do not perform those subscription-backed operations. [Validation scope](validation.md) separates the original deployment evidence from the new source tests.
