# Security model and limits

This service can send commands to an agent with access to your files and tools. Possessing a valid pairing token or session cookie is powerful access, even though the phone never receives the Codex credential cache. Intended use is a single trusted owner controlling their own environments.

- HTTP binds to loopback. Phone access requires a correctly configured HTTPS gateway or private network. Funnel makes the authenticated application publicly reachable; it is not a private-tailnet-only deployment.
- Fresh independent bridge token, HMAC-signed session cookie, Secure/HttpOnly/SameSite=Strict, origin checks, bounded request bodies and restrictive page CSP.
- The cookie currently lasts 180 days and is not bound to an IP. Changing a phone network should not force a new login. There is no per-device server-side revocation registry. Logout clears that browser's cookie; it does not revoke a copied cookie elsewhere.
- To invalidate existing bridge cookies, replace the private `access-token` with another cryptographically random 32-byte hex value and restart the helper. Existing SSE connections may remain until they close, so restart matters. Re-pair trusted devices afterward.
- Browser-local cached titles, project paths and drafts are private data. Forgetting a login does not erase all browser storage. Clear website data when retiring a device.
- No Codex authentication files are copied. SSH uses your own config and existing credentials. A selected host still uses its original agent permission configuration; this adapter does not force a broader sandbox or approval policy.
- Only the implemented HTTP actions are exposed; the browser cannot submit arbitrary native RPC methods. Those actions still include agent execution, approvals and stop controls.
- Desktop internal interfaces remain subject to their normal trust checks. Do not patch, disable or spoof signature/peer validation. A compatible managed launch must be validated separately.
- In-memory send deduplication is not durable exactly-once delivery. Confirm history after a timeout before retrying. Unknown approval forms stay on desktop.

This is not a security-audited multi-user service. There is no tenant isolation, roles, abuse-rate limiting, production audit trail, formal intrusion model or complete dependency audit. Do not expose it for a team or public users under the assumption that browser pairing provides those properties. Codex account, organizational and service restrictions still apply.

Before sharing a source archive, run `npm run check:release` and inspect `git diff --cached`. Do not share your private state directory, credentials, real conversations, relay logs, token-bearing URLs/QR codes or screenshots containing research content. The repository scanner is a focused regression check, not a guarantee that every possible secret is detected.

A private vulnerability-reporting contact has not yet been established. Do not disclose credentials or exploit details in a public issue.
