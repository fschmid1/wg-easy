---
title: Getting Started
hide:
    - navigation
---

This page explains how to run the `wg-easy` access portal. The guide uses Docker
Compose as a reference. In our examples, we mount the named volume `etc_wireguard` to
`/etc/wireguard` inside the container.

## Preliminary Steps

Before you can deploy the portal, you need:

1. A Linux host that can run WireGuard and a container runtime.
2. A public DNS name or IP address for the WireGuard endpoint.
3. An OpenID Connect provider that exposes a group claim.
4. A supported architecture (x86_64, arm64).

### Host Setup

You need a container runtime (like _Docker_ or _Podman_) and
[Docker Compose][docker-compose]. If you use Podman, read the related
[documentation][docs-podman] first.

[docker-compose]: https://docs.docker.com/compose/
[docs-podman]: ./examples/tutorials/podman-nft.md

## Identity Provider

Register a confidential client at your provider:

| Setting        | Value                                                   |
| -------------- | ------------------------------------------------------- |
| Redirect URI   | `https://your-portal.example.com/api/auth/callback`     |
| Post logout    | `https://your-portal.example.com/`                      |
| Scopes         | `openid email profile groups` (adjust the group scope)  |
| Grant type     | Authorization code with PKCE                            |

Only members of the groups listed in `OIDC_ALLOWED_GROUPS` may request a
configuration. Group membership is checked when the user signs in; removing a user
from the group does not terminate a session that already exists. The worst-case
offboarding window is the grant's maximum lifetime (8 hours by default).

See [OIDC Authentication](./advanced/config/external-authentication.md) for every
provider-related variable, including nested group claims and an optional email-domain
gate.

## Deploying the Image

### Tagging Convention

[Our CI][github-ci] builds, tests, and pushes images to:

1. GitHub Container Registry ([`ghcr.io/wg-easy/wg-easy`][ghcr-image])
2. Codeberg Container Registry ([`codeberg.org/wg-easy/wg-easy`][codeberg-image])

| tag           | Type                            | Example                                                       | Description                                                                   |
| ------------- | ------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `15`          | latest minor for that major tag | `ghcr.io/wg-easy/wg-easy:15`                                  | latest features for specific major versions, no breaking changes, recommended |
| `15.0`        | latest patch for that minor tag | `ghcr.io/wg-easy/wg-easy:15.0`                                | latest patches for specific minor version                                     |
| `15.0.0`      | specific tag                    | `ghcr.io/wg-easy/wg-easy:15.0.0`                              | specific release, no updates                                                  |
| `edge`        | push to `master`                | `ghcr.io/wg-easy/wg-easy:edge`                                | mostly unstable, gets frequent package and code updates                       |
| `development` | pull requests                   | `ghcr.io/wg-easy/wg-easy:development`                         | used for development, testing code from PRs                                   |
| `latest`      | latest tag                      | `ghcr.io/wg-easy/wg-easy:latest` or `ghcr.io/wg-easy/wg-easy` | points to the v14 release, should be avoided                                  |

When publishing a tag we follow the [Semantic Versioning][semver] specification. Pin to
the latest major version to avoid breaking changes (e.g. `15`), avoid using the `latest`
tag.

[github-ci]: https://github.com/wg-easy/wg-easy/actions
[ghcr-image]: https://github.com/wg-easy/wg-easy/pkgs/container/wg-easy
[codeberg-image]: https://codeberg.org/wg-easy/-/packages/container/wg-easy/15
[semver]: https://semver.org/

### Required environment

```dotenv
OAUTH_OIDC_SERVER=https://idp.example.com
OAUTH_OIDC_NAME=Example IdP
OAUTH_OIDC_CLIENT_ID=wg-easy
OAUTH_OIDC_CLIENT_SECRET=...
OIDC_ALLOWED_GROUPS=vpn-users
VPN_HOST=vpn.example.com
```

The container refuses to start when the OIDC server, client ID, client secret, or
allowed groups are missing. `VPN_HOST` is the host name or address written into every
generated configuration.

Start it with:

```shell
docker compose up -d
```

The portal listens on `51821/tcp` and WireGuard on `51820/udp` by default. Terminate TLS
at a reverse proxy and set `TRUSTED_PROXIES` so forwarded host and scheme headers are
trusted. Keep `INSECURE=false` for HTTPS deployments so the session cookie is marked
`Secure`.

/// danger | Use the Correct Commands For Stopping and Starting `wg-easy`

**Use `sudo docker compose up / down`, not `sudo docker compose start / stop`**. Otherwise, the container is not properly destroyed and you may experience problems during startup because of inconsistent state.

///

### Follow tutorials

- [Basic Installation with Docker Compose (Recommended)](./examples/tutorials/basic-installation.md)
- [Simple Installation with Docker Run](./examples/tutorials/docker-run.md)
- [Advanced Installation with Podman](./examples/tutorials/podman-nft.md)

## First login

Open the portal. It sends you straight to your identity provider, then back to the
portal once you are signed in. Press **Generate config** and download the `.conf` file
or show the QR code immediately: the configuration is delivered **once**. Import it
into a WireGuard client and connect within the connect deadline (10 minutes by
default). The grant expires after 8 hours, or immediately when you log out.

After the configuration has been delivered, the private key is erased and cannot be
shown again. Use **Generate config** to replace it; issuance is rate-limited.
