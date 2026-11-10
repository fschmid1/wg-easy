---
title: API
---

/// warning | Breaking Changes

This API is not yet stable and may change in the future.

///

The portal exposes a small API used by its own page. Authentication is cookie-only:
there is no HTTP Basic Authentication and no API token.

## Authentication

Sign in through `GET /api/auth/login`. After the OIDC callback, the browser holds an
`HttpOnly` session cookie. Send that cookie with every request.

`GET /api/session` returns the signed-in user and is the most convenient health check:

```python
import requests

session = requests.Session()
# Complete the OIDC login in a browser and copy the cookie, or drive the browser.
response = session.get("https://vpn.example.com/api/session")
response.raise_for_status()
print(response.json())
```

A missing, revoked, expired, or idle session returns `401`. Sessions are created only by
a successful OIDC login.

## Endpoints

| Endpoint                              | Method | Description                                                   |
| ------------------------------------- | ------ | ------------------------------------------------------------- |
| `/api/session`                        | GET    | Current user.                                                 |
| `/api/grants`                         | GET    | Current user's live grants and the configured per-user cap.  |
| `/api/grants`                         | POST   | Issue a configuration. Replaces the current session's grant. |
| `/api/grants/{id}/configuration`      | GET    | Reveal the `.conf` once.                                      |
| `/api/grants/{id}/qrcode`             | GET    | Reveal the configuration as an SVG QR code once.              |
| `/api/grants/{id}/revoke`             | POST   | Revoke any grant owned by the current user.                   |
| `/api/auth/login`                     | GET    | Start OIDC login.                                             |
| `/api/auth/callback`                  | GET    | OIDC callback; not called manually.                           |
| `/api/auth/logout`                    | POST   | Revoke the current session and its grant, return the logout URL. |

`POST /api/grants` returns `429` when the per-hour issuance limit is reached. It also
deletes the session's previous grant before creating a new one.

The reveal endpoints are one-time. Whichever endpoint successfully delivers first sets
`revealed_at` and erases the private key. A second attempt returns `409`. An aborted
transfer releases the claim, so the user can try again while the download window is
open.

Reveal responses use `Content-Type: application/x-wireguard-config` (or
`image/svg+xml`) and `Cache-Control: no-store`.

## CSRF Protection

CSRF origin checks are enabled when [`TRUSTED_PROXIES`](./config/optional-config.md#trusted-proxies)
contains at least one address or CIDR. This protects all state-changing requests.

When enabled, POST, PUT, PATCH, and DELETE requests require an `Origin` matching the
public URL's scheme, host, and port, without a path or trailing slash. Only an absent
`Origin` may fall back to a same-origin `Referer`. Missing, empty, `null`, or mismatched
source origins cause HTTP 403, even with a valid session.

Browsers normally supply these headers. API scripts should send `Origin` on writes:

```python
response = session.post(
    "https://vpn.example.com/api/grants",
    headers={"Origin": "https://vpn.example.com"},
)
```

Behind a proxy, follow the [public URL configuration](./config/optional-config.md#trusted-proxies).
An incorrect host, port, or scheme causes HTTP 403 on legitimate writes.

An empty `TRUSTED_PROXIES` disables the check for compatibility. The session cookie is
`SameSite=Lax`, which already blocks cross-site cookie use on writes.
