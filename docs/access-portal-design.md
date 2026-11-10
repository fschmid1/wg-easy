# Access Portal — Design Specification

Status: agreed and implemented.
This supersedes the previous "admin UI for long-lived WireGuard clients" purpose.

## Purpose

A self-service portal where a user authenticates with OIDC, requests **one short-lived
WireGuard config per login session**, must connect promptly, and loses both the tunnel
and the session on logout or timeout. There is no user management, no admin UI, no
password authentication, and no long-lived peers.

## Invariants

- **Identity** is the OIDC `sub`, matched to a local user row and auto-provisioned on
  first authorized login.
- **Authorization** is membership in an allow-listed OIDC group. It is evaluated **only
  at login** and fails closed when the claim is missing or empty.
- A **web session** and a **grant** (WireGuard peer) have separate lifetimes, but a
  grant never outlives the web session that owns it.
- One session owns at most **one live grant**.
- One user owns at most **three live grants** across all sessions.
- No peer exists until the user clicks **Generate config**.

## Authentication

An unauthenticated visit to the portal redirects to `/api/auth/login`, so a user never
has to click through an interstitial. Two states stay on the portal instead: a rejected
login and the page shown right after logout.

1. `GET /api/auth/login` starts OIDC discovery + PKCE (state and nonce in the sealed
   pre-session cookie).
2. The callback fetches userinfo, requires a verified email, and checks the group claim
   against `OIDC_ALLOWED_GROUPS`. Failure renders a generic "no access" page that never
   names the group.
3. The user is upserted by `sub`; a **DB-backed session** is created. The cookie holds a
   random 256-bit token; the DB stores only its hash. Cookie is `httpOnly`,
   `SameSite=Lax`, `Secure` unless `INSECURE`, absolute lifetime 8 h, rolling idle 30 min.
4. If the user already has three live grants, the oldest grant **and its session** are
   revoked before the new session is issued.
5. Logout revokes the current grant (peer removed immediately), deletes the session, and
   then redirects to the IdP `end_session_endpoint` when advertised (best effort; a failed
   IdP logout never blocks the local revoke).

Password, TOTP, Google, GitHub, account linking, and the setup wizard do not exist.

## Grant lifecycle

All deadlines are measured **from issuance** (the moment the user clicks Generate config),
except idle timeout which is disabled by default.

```
Generate -> issued (not revealed) --reveal--> delivered --handshake--> connected --8h--> revoked
                  |                              |                          |
                  |                              +-- logout/revoke --------> revoked
                  +-- download window (10 min) --> revoked (never usable)
                  +-- connect deadline (10 min) -> revoked
```

- Download window: **10 min**. Connect deadline: **10 min**. Max lifetime: **8 h**.
- Idle timeout: **off** by default; when enabled it is measured from the last handshake.
- Re-issue inside a session revokes the current grant and mints a new one with fresh
  timers. Limit: **3 per hour per user**, shared bucket.
- Peers are removed with `wg set <if> peer <key> remove` plus `syncconf`, using the
  existing lifecycle queue. A failed removal marks the grant revoked anyway (fail closed)
  and is retried in the background. Boot reconciliation runs **before** `vpn.start()`.

## One-time reveal

- Two actions: **Download .conf** and **Show QR**. Whichever first delivers successfully
  burns the grant. A transfer that is aborted before the response finishes does **not**
  burn.
- On burn: `revealed_at` is set and the client **private key is cleared immediately**
  (empty-string sentinel, because the legacy column is `NOT NULL`). The public key and
  PSK are retained for the peer's life. Responses use `Cache-Control: no-store`.
- Afterwards the portal shows "config already delivered — it cannot be shown again" and
  offers **Generate new config**.

## Peer list

- Shows the user's **live grants only**, across all their sessions, named from the
  User-Agent with a timestamp fallback.
- Any session can revoke any of the user's grants. Revoking another session's grant does
  not end that web session; it may re-issue.
- No history, no audit table, no "log out everywhere" action.

## Persistence

- The legacy `clients_table` is reused as the grant table: one row is one live peer owned
  by one session. It gains `session_id`, `revealed_at`, and `first_handshake_at`; the
  private key is an empty string after reveal.
- `sessions_table` (new): hashed token, user, created/last-seen/absolute-expiry/revoked-at.
- `users_table` is reused, keyed to the OIDC subject through `oauth_provider='oidc'` and
  `oauth_id`. It also stores the sliding issuance counter (`grant_issued_count`,
  `grant_window_start`). Legacy columns remain for migration compatibility.
- `interfaces` and `user_configs` remain the persisted effective configuration; environment
  variables override them at boot.
- `one_time_links` and `/cnf/[token]` are removed.

## Environment

| Area | Variables |
| --- | --- |
| OIDC | `OAUTH_OIDC_SERVER`, `OAUTH_OIDC_NAME`, `OAUTH_OIDC_CLIENT_ID`, `OAUTH_OIDC_CLIENT_SECRET`, `OIDC_SCOPES`, `OIDC_GROUPS_CLAIM`, `OIDC_ALLOWED_GROUPS`, optional `OAUTH_ALLOWED_DOMAINS` |
| WireGuard | `VPN_HOST`, `VPN_PORT`, `WG_INTERFACE`, `VPN_DNS`, `VPN_MTU` (1300), `VPN_KEEPALIVE` (25), `VPN_ALLOWED_IPS`, `VPN_IPV4_CIDR`, `VPN_IPV6_CIDR`, `VPN_IPV6_ENABLED`, `WG_PRE_UP`, `WG_POST_UP`, `WG_PRE_DOWN`, `WG_POST_DOWN`, `EXPERIMENTAL_AWG` |
| Grants | `GRANT_DOWNLOAD_WINDOW` (10m), `GRANT_CONNECT_DEADLINE` (10m), `GRANT_MAX_LIFETIME` (8h), `GRANT_IDLE_TIMEOUT` (off), `GRANT_MAX_PER_USER` (3), `GRANT_REISSUE_PER_HOUR` (3) |
| Sessions | `SESSION_ABSOLUTE` (8h), `SESSION_IDLE` (30m) |
| Ops | `TRUSTED_PROXIES`, `INSECURE`, `METRICS_ENABLED` (false), `PORTAL_WIPE_LEGACY` |
| Removed | `PASSWORD`, `PASSWORD_HASH`, `DISABLE_PASSWORD_AUTH`, `INIT_*`, `OAUTH_PROVIDERS`, `OAUTH_AUTO_*` |

## Portal page

States: **no grant** (Generate + explanation), **issued** (must-connect countdown,
Download/QR), **delivered** (waiting for first handshake), **connected** (remaining
lifetime, Revoke). An expired or revoked grant drops out of the polled list and the page
returns to **no grant**. Status is polled every 2 s only while a grant exists. No SSE or
WebSockets.

## Removed surface

- Pages: client list, client detail, account page, all admin pages, all setup pages.
- APIs: `/api/client/*`, password/2FA/pending/cancel routes, `/api/me/*`, provider linking,
  `/cnf/[oneTimeLink]`.
- Components: all client CRUD, bulk actions, search, filters, charts, one-time links, and
  the legacy base/form/UI component library, toasts, and color-mode/composable helpers.
- CLI: `clients:qr`, `db:admin:reset`; the CLI keeps only `--version`/`--help`.
- Kept: the portal page, OIDC auth routes, QR SVG rendering, the layout, and metrics
  behind `METRICS_ENABLED`.

## Security posture

Origin/CSRF validation enabled by `TRUSTED_PROXIES`; `SameSite=Lax`, `HttpOnly` session
cookies; hashed session tokens; a per-user issuance limit; `no-store` on reveal; private
keys never persist past reveal; generic access-denied page; structured grant lifecycle
logs without a DB audit trail.

No OIDC tokens are stored, so group removal cannot be detected mid-session. This is
accepted: worst-case exposure is the grant's 8 h maximum lifetime and the 8 h session
absolute lifetime, after which the user cannot re-issue.

## Upgrade

Startup refuses to run without `OAUTH_OIDC_*`. If legacy long-lived clients exist, startup
requires `PORTAL_WIPE_LEGACY=1`, then drops legacy users, clients, and one-time links while
keeping interface and user-config settings. There is no setup wizard, no `INIT_*` seeding,
and no rollback path.

## Test plan

Unit: timer origins, reveal burn versus aborted transfer, the full revoke matrix,
fail-closed group check, session absolute/idle expiry, cap and eviction, re-issue limit,
boot reconciliation, and the legacy-wipe guard.

E2E (mock IdP): login, generate, download, connect, logout kills the tunnel; a non-group
user is denied; expiry paths run against a controllable clock.
