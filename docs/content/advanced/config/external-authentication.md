---
title: OIDC Authentication
---

The portal supports exactly one authentication method: OpenID Connect. There is no
password, TOTP, Google, or GitHub login, and no account linking.

## Required variables

| Env                         | Required | Example                        | Description                                                     |
| --------------------------- | -------- | ------------------------------ | --------------------------------------------------------------- |
| `OAUTH_OIDC_SERVER`         | yes      | `https://idp.example.com`      | Issuer URL used for discovery                                   |
| `OAUTH_OIDC_CLIENT_ID`      | yes      | `wg-easy`                      | Confidential client ID                                          |
| `OAUTH_OIDC_CLIENT_SECRET`  | yes      | `...`                          | Confidential client secret                                      |
| `OIDC_ALLOWED_GROUPS`       | yes      | `vpn-users,contractors`        | Groups allowed to request a configuration                       |
| `OAUTH_OIDC_NAME`           | no       | `Example IdP`                  | Display name                                                    |
| `OIDC_SCOPES`               | no       | `openid email profile groups`  | Scopes requested from the provider                              |
| `OIDC_GROUPS_CLAIM`         | no       | `groups`                       | Dotted path to the group claim                                  |
| `OAUTH_ALLOWED_DOMAINS`     | no       | `example.com,example.org`      | Additional email-domain gate                                    |

The client must be confidential (it uses a client secret) and must allow the
authorization-code flow with PKCE.

## Redirect URI

Register this URI at the provider:

```text
https://your-portal.example.com/api/auth/callback
```

The portal derives it from the request's public origin. Behind a reverse proxy, set
[`TRUSTED_PROXIES`](./optional-config.md#trusted-proxies) so the forwarded host and
scheme are trusted; otherwise the redirect URI can differ from the registered one and
the login fails.

If the provider advertises an `end_session_endpoint` in its discovery document, logout
also ends the provider session. That step is best effort: a failure at the provider
never keeps the local session or WireGuard peer alive.

## Group claim

The group claim is read from the userinfo response. A flat array is the default:

```json
{ "groups": ["vpn-users", "other-team"] }
```

Use `OIDC_GROUPS_CLAIM` for nested claims, for example Keycloak's:

```dotenv
OIDC_GROUPS_CLAIM=realm_access.roles
```

The check fails closed: a missing, empty, or non-string claim never grants access.
Membership is evaluated **only at login**. No OIDC tokens are stored, so the portal
cannot notice a group removal until the current session and grant expire.

A rejected login redirects to the portal and shows a generic access-denied message that
does not name the required group.

## Email requirements

The userinfo response must contain a verified email address (`email` and
`email_verified`). Set `OAUTH_ALLOWED_DOMAINS` to also require a specific email domain.

## Account provisioning

Users are keyed by the OIDC `sub` claim. The first authorized login creates a local
account; later logins reuse it. If an account with the same email already exists, it is
linked to the `sub`. There is no admin UI and no way to edit users from the portal.

## Sessions

The cookie stores a random token; the database stores only its SHA-256 hash. Cookies are
`HttpOnly`, `SameSite=Lax`, and `Secure` unless `INSECURE=true`. The absolute lifetime
is 8 hours and the rolling idle timeout is 30 minutes by default. A session ends its
grant when it expires.
