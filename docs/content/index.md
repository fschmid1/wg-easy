---
title: Home
hide:
    - navigation
---

# Welcome to the Documentation for `wg-easy`

/// info | This Documentation is Versioned

**Make sure** to select the correct version of this documentation! It should match the version of the image you are using. The default version corresponds to [the most recent stable release][docs-tagging].

///

This documentation covers the OIDC access portal build of `wg-easy`: installation,
identity provider setup, timers, and the environment reference.

[docs-tagging]: ./getting-started.md#tagging-convention

## About

`wg-easy` is an OIDC-only portal that issues short-lived WireGuard configurations.
A user signs in, requests one configuration, downloads it once, and connects. The
tunnel and the web session end on logout or timeout.

There is no admin UI, no password login, no user management, and no long-lived peer.
All behaviour is configured with environment variables.

## Contents

### Getting Started

If you are new to `wg-easy`, read the [_Getting Started_ chapter][docs-getting-started]
first. It covers the host, the identity provider, and the first deployment.

[docs-getting-started]: ./getting-started.md

### Configuration

- [OIDC Authentication](./advanced/config/external-authentication.md): register the
  client, choose the group claim, and control who may request access.
- [Optional Configuration](./advanced/config/optional-config.md): endpoints, timers,
  proxies, and operational switches.
- [API](./advanced/api.md): the small session and grant API used by the portal.
- [Metrics](./advanced/metrics/prometheus.md): optional Prometheus and JSON output.
- [AmneziaWG](./advanced/config/amnezia.md): experimental obfuscation support.

### Contributing

We are always happy to welcome new contributors. For guidelines and entrypoints please
have a look at the [Contributing section][docs-contributing].

[docs-contributing]: ./contributing/issues-and-pull-requests.md

### Migration

The portal is a destructive change from earlier releases. The
[_Migration_ chapter][docs-migration] explains the one-time wipe.

[docs-migration]: ./advanced/migrate/from-14-to-15.md
