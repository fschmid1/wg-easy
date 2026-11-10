---
title: Configuration Reference
---

Everything the portal needs is configured through environment variables. Required
OIDC variables are covered in [OIDC Authentication](./external-authentication.md).

## Network and interface

| Env                     | Default                              | Example                     | Description                                                              |
| ----------------------- | ------------------------------------ | --------------------------- | ------------------------------------------------------------------------ |
| `PORT`                  | `51821`                              | `6789`                      | TCP port for the portal.                                                 |
| `HOST`                  | `0.0.0.0`                            | `localhost`                 | Address the portal binds to.                                             |
| `INSECURE`              | `false`                              | `true`                      | Allow cookies over HTTP and select the fallback public URL scheme.       |
| `DISABLE_IPV6`          | `false`                              | `true`                      | Disable IPv6 addresses and firewall rules.                               |
| `TRUSTED_PROXIES`       |                                      | `172.18.0.2,fd00:1234::/64` | Trusted proxy IPs/CIDRs; a nonempty list also enables CSRF origin checks. |
| `WG_INTERFACE`          | `wg0`                                | `wg1`                       | Name of the WireGuard interface.                                         |
| `VPN_HOST`              |                                      | `vpn.example.com`           | Endpoint written into generated configurations.                          |
| `VPN_PORT`              | `51820`                              | `443`                       | UDP port written into generated configurations.                          |
| `VPN_DNS`               | `1.1.1.1,2606:4700:4700::1111`       | `10.42.42.1`                | Comma-separated DNS servers for clients.                                 |
| `VPN_MTU`               | `1300`                               | `1420`                      | MTU written into generated configurations.                               |
| `VPN_KEEPALIVE`         | `25`                                 | `0`                         | Persistent keepalive in seconds; `0` disables it.                        |
| `VPN_ALLOWED_IPS`       | `0.0.0.0/0,::/0`                     | `10.0.0.0/8`                | Comma-separated AllowedIPs for clients.                                  |
| `VPN_IPV4_CIDR`         | `10.8.0.0/24`                        | `10.42.42.0/24`             | IPv4 subnet for the interface and grants.                               |
| `VPN_IPV6_CIDR`         | `fdcc:ad94:bacf:61a4::cafe:0/112`    | `fd42:42:42::/64`           | IPv6 subnet for the interface and grants.                               |
| `WG_PRE_UP`             | built-in                             | `...`                       | WireGuard `PreUp` hook; overrides the stored default.                   |
| `WG_POST_UP`            | built-in                             | `...`                       | WireGuard `PostUp` hook; overrides the stored default.                  |
| `WG_PRE_DOWN`           | built-in                             | `...`                       | WireGuard `PreDown` hook; overrides the stored default.                 |
| `WG_POST_DOWN`          | built-in                             | `...`                       | WireGuard `PostDown` hook; overrides the stored default.                |
| `VPN_IPV6_ENABLED`      | `true`                               | `false`                     | Explicit form of the IPv6 switch.                                        |

`TRUSTED_PROXIES` is the only source of forwarded host, protocol, and client IP
information. Only requests from those addresses may supply `X-Forwarded-Host`,
`X-Forwarded-Proto`, and `X-Forwarded-For`.

/// note | IPv6 Caveats

Disabling IPv6 disables the default IPv6 firewall rules and omits IPv6 addresses from
the interface and clients.

///

## Grants

All deadlines are measured from issuance, the moment the user presses **Generate config**.

| Env                       | Default | Description                                                        |
| ------------------------- | ------- | ------------------------------------------------------------------ |
| `GRANT_DOWNLOAD_WINDOW`   | `10m`   | Time to reveal the configuration before the grant is revoked.      |
| `GRANT_CONNECT_DEADLINE`  | `10m`   | Time to complete the first WireGuard handshake.                    |
| `GRANT_MAX_LIFETIME`      | `8h`    | Hard lifetime of a grant.                                           |
| `GRANT_IDLE_TIMEOUT`      | `0`     | Optional idle timeout measured from the last handshake; `0` is off. |
| `GRANT_MAX_PER_USER`      | `3`     | Live grants per user; a new login evicts the oldest.                |
| `GRANT_REISSUE_PER_HOUR`  | `3`     | Configs a user may issue in a rolling hour.                         |

Durations accept `s`, `m`, and `h` suffixes, or a plain number of seconds. A grant that
is never revealed dies with the download window. A revealed grant that never
handshakes dies with the connect deadline. A connected grant lives until its hard
lifetime. Revocation deletes the database row first and removes the peer fail-closed;
a failed host operation is retried by the maintenance loop.

## Sessions

| Env                | Default | Description                                     |
| ------------------ | ------- | ----------------------------------------------- |
| `SESSION_ABSOLUTE` | `8h`    | Absolute session lifetime.                      |
| `SESSION_IDLE`     | `30m`   | Rolling idle timeout; the portal polls while open. |

A session grants at most one live configuration. Logging out revokes the current
session and its grant. Revoking a grant from another session does not end that session.

## Operations

| Env                 | Default | Description                                                             |
| ------------------- | ------- | ----------------------------------------------------------------------- |
| `METRICS_ENABLED`   | `false` | Expose `/metrics/prometheus` and `/metrics/json`.                       |
| `PORTAL_WIPE_LEGACY`| `false` | Required once to delete long-lived clients from a previous installation. |
| `EXPERIMENTAL_AWG`  | `false` | Detect and use AmneziaWG when the kernel module is available.           |
| `OVERRIDE_AUTO_AWG` |         | Force `awg` or `wg` when `EXPERIMENTAL_AWG=true`.                        |

## Trusted proxies

Set `TRUSTED_PROXIES` when the portal runs behind a reverse proxy:

```yaml
environment:
    - TRUSTED_PROXIES=172.18.0.2,fd00:1234::/64
```

Only requests from these addresses may supply forwarded headers. Proxies must replace
client-supplied values and report the public scheme. Invalid entries prevent startup.

### Public URLs and cookies

- Preserve the public `Host`, or let a trusted proxy set `X-Forwarded-Host`, including a
  non-default port.
- A trusted `X-Forwarded-Proto` supplies the scheme when its first value is `http` or
  `https`.
- Without a trusted forwarded protocol, `INSECURE=false` implies HTTPS and
  `INSECURE=true` implies HTTP.

`INSECURE` independently controls the session cookie's `Secure` attribute. Keep
`INSECURE=false` for HTTPS deployments, even if the proxy connects over HTTP.

### CSRF implications

A nonempty `TRUSTED_PROXIES` also enables [origin checks](../api.md#csrf-protection) for
all writes. Scripts must then send a matching `Origin`, or a same-origin `Referer` when
`Origin` is absent. An empty list disables the check; authentication still applies, and
the session cookie is `SameSite=Lax`.

## WireGuard interface

Set `WG_INTERFACE` to use another interface name, for example when running multiple
instances on the same host with `network_mode: host`:

```yaml
environment:
    - WG_INTERFACE=wg1
```
