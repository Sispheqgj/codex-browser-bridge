# Validation scope

## Original personal deployment

The source was extracted from a working macOS setup. That setup verified original IDs for local and multiple SSH chats, a separate disposable chat observed by two clients, project grouping, Markdown rendering, persistent browser pairing, and same-value model-setting updates on local and remote chats. Its authenticated public entry and phone-size browser layout were checked.

These observations apply to that deployment. Its real addresses, usernames, thread IDs, logs and authenticated screenshots are excluded here. It used an existing HAPI token and an incremental two-port update; the public source replaces those details with independent configuration/token initialization and one listener.

## Automated checks in the extracted source

- Cookie signature, expiry, key changes and flags.
- Markdown syntax, math, code, table handling and sanitization.
- Project membership, host separation, native/local project-ID mapping.
- Catalog pagination, cached initial responses and offline retention.
- Supported model/effort combinations, original-thread updates, pending settings and authoritative desktop changes.
- Configuration validation, HTTPS origin restriction and SSH shell quoting.
- An isolated HTTP service with fake desktop directories: pairing, authenticated status, denied anonymous/cross-origin requests, path routing and static UI delivery. No real host or model interaction.
- Production frontend build and source release scan.

## Not established by these tests

Clean-machine installation; the generalized caller context on another Mac; signing/ancestry acceptance on every desktop build; current Windows support; actual phone hardware rendering after extraction; non-default remote shell environments; exhaustive approval/plugin compatibility; resilience under hostile load; all model-provider routes; or production security.

The repository deliberately labels these as pending validation. Do not replace them with claims inferred from mock tests. No real user task needs to be interrupted to run the automated checks.

At extraction, the installed bundled CLI reported `0.169.0-alpha.11.1`, and the existing helper reported Codex-managed ownership with four devices online. These are environment/status observations, not a fresh end-to-end test of every original feature after an application update. Isolated token initialization was also checked for user-only permissions, no token in stdout, and idempotence.

The directory refactor also checks built JavaScript/CSS delivery through the production HTTP service. Documentation screenshots were captured from the actual responsive frontend with synthetic demo fixtures. The separate demo service rejects write requests and has no production-backend imports; automated checks verify those HTTP boundaries.
