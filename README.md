# WireGuard Easy

[![Build & Publish latest Image](https://github.com/wg-easy/wg-easy/actions/workflows/deploy.yml/badge.svg)](https://github.com/wg-easy/wg-easy/actions/workflows/deploy.yml)
[![Lint](https://github.com/wg-easy/wg-easy/actions/workflows/lint.yml/badge.svg?branch=master)](https://github.com/wg-easy/wg-easy/actions/workflows/lint.yml)
[![GitHub Stars](https://img.shields.io/github/stars/wg-easy/wg-easy)](https://github.com/wg-easy/wg-easy/stargazers)
[![License](https://img.shields.io/github/license/wg-easy/wg-easy)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/wg-easy/wg-easy)](https://github.com/wg-easy/wg-easy/releases/latest)
[![Image Pulls](https://img.shields.io/badge/image_pulls-28M+-blue)](https://github.com/wg-easy/wg-easy/pkgs/container/wg-easy)

This build is an **OIDC-only access portal** for WireGuard. A user signs in with an
identity provider, requests one short-lived configuration, downloads it once, and
connects. The tunnel and the web session end on logout or timeout.

There is no admin UI, no password login, no user management, and no long-lived peer.
Everything is configured through environment variables.

## Features

- OIDC login with an allow-listed group. Membership is checked at login.
- One configuration per login session, downloadable as `.conf` or QR exactly once.
- The private key is erased as soon as a delivery succeeds.
- A grant must be downloaded and connected within 10 minutes, and expires after 8 hours.
- Logging out removes the current session and its WireGuard peer immediately.
- Users can see and revoke all of their live grants, including ones from other sessions.
- Three live grants per user at most; the oldest is evicted by a fourth login.
- Re-issuing a configuration is rate-limited.
- Per-grant MTU (default 1300) and DNS settings.
- Optional Prometheus and JSON metrics (`METRICS_ENABLED=true`).
- IPv6, multi-client CIDR layouts, and experimental AmneziaWG support.
- Fail-closed revocation and boot-time reconciliation, so a deleted grant never
  survives a restart.

The full behaviour and timer contract are documented in
[docs/access-portal-design.md](docs/access-portal-design.md).

## Installation

You need a WireGuard host, Docker, and an OpenID Connect provider that exposes a group
claim (for example Keycloak, Authentik, Authelia, or Entra ID).

Create a `compose.yml` with the settings from
[docker-compose.yml](docker-compose.yml), then provide at least:

```dotenv
OAUTH_OIDC_SERVER=https://idp.example.com
OAUTH_OIDC_CLIENT_ID=wg-easy
OAUTH_OIDC_CLIENT_SECRET=...
OIDC_ALLOWED_GROUPS=vpn-users
VPN_HOST=vpn.example.com
```

Register `https://your-portal.example.com/api/auth/callback` as the redirect URI at your
identity provider. The same client is used for RP-initiated logout when the provider
advertises an `end_session_endpoint`.

Start it with:

```shell
docker compose up -d
```

The portal listens on port `51821` (HTTP). Put it behind a TLS-terminating reverse proxy
and set `TRUSTED_PROXIES` so forwarded headers are trusted. If you terminate TLS in
front of the container, also leave `INSECURE=false` so session cookies are marked
`Secure`.

The container starts only when `OAUTH_OIDC_SERVER`, `OAUTH_OIDC_CLIENT_ID`,
`OAUTH_OIDC_CLIENT_SECRET`, and `OIDC_ALLOWED_GROUPS` are set. Upgrading from an earlier
release is destructive: start once with `PORTAL_WIPE_LEGACY=1` to remove long-lived
clients and legacy accounts.

The documentation site has the full configuration reference:
[https://wg-easy.github.io/wg-easy/latest](https://wg-easy.github.io/wg-easy/latest)

## Development

### Prerequisites

- Docker
- Node LTS with corepack enabled

### Dev server

`pnpm dev` starts the portal together with a disposable mock OpenID Connect
provider, so no external IdP is needed:

```shell
pnpm dev
```

Open <http://localhost:51821> and sign in. The mock provider always approves the
configured user (`Dev User`, groups: `vpn-users`) and is reachable from your
browser as <http://mock-idp.localhost:9000>. Both the portal container and the
browser use that same issuer URL; Docker resolves it to the mock service and
browsers resolve `*.localhost` to loopback. If your browser does not, add
`127.0.0.1 mock-idp.localhost` to your hosts file.

The mock user and group are configurable through `MOCK_OIDC_NAME`,
`MOCK_OIDC_EMAIL`, `MOCK_OIDC_USERNAME`, and `MOCK_OIDC_GROUPS`. To develop
against a real identity provider instead, override `OAUTH_OIDC_SERVER`,
`OAUTH_OIDC_CLIENT_ID`, `OAUTH_OIDC_CLIENT_SECRET`, and `OIDC_ALLOWED_GROUPS`:

```shell
export OAUTH_OIDC_SERVER=https://idp.example.com
export OAUTH_OIDC_CLIENT_ID=wg-easy
export OAUTH_OIDC_CLIENT_SECRET=...
export OIDC_ALLOWED_GROUPS=vpn-users
pnpm dev
```

### Checks

```shell
cd src
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
```

End-to-end tests build the image and start a disposable stack with a mock OIDC provider:

```shell
cd src
pnpm test:e2e:typecheck
pnpm test:e2e
```

## License

This project is licensed under the AGPL-3.0-only License - see the [LICENSE](LICENSE) file for details

This project is not affiliated, associated, authorized, endorsed by, or in any way officially connected with Jason A. Donenfeld, ZX2C4 or Edge Security

"WireGuard" and the "WireGuard" logo are registered trademarks of Jason A. Donenfeld
