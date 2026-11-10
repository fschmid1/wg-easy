---
title: Upgrade to the Access Portal
---

This build replaces the long-lived client admin UI with an OIDC-only access portal.
The upgrade is **destructive** and there is no rollback path.

## What changes

- There is no admin UI, setup wizard, password login, TOTP, Google or GitHub login,
  client list, account page, or CLI client management.
- OIDC is the only authentication method. The required variables are listed in
  [OIDC Authentication](../config/external-authentication.md).
- Existing long-lived clients are not migrated. They must be destroyed.
- Users are provisioned from the OIDC `sub` claim on first authorized login.
- Configuration changes are made through environment variables, not through the UI.

## Before upgrading

1. Back up `/etc/wireguard`, including `wg-easy.db`, in case you need the old data for
   an audit.
2. Record the public endpoint, DNS servers, MTU, CIDRs, and hooks from the old install.
   They become environment variables in the new container.
3. Keep the WireGuard host key (the interface private key) if you want clients to
   recognise the same server key. The portal keeps the stored interface keys.

## Upgrade

1. Stop the old container:

    ```shell
    docker compose down
    ```

2. Update the image and configure the required portal variables from
    [Getting Started](../../getting-started.md).

3. Start once with the legacy wipe enabled:

    ```yaml
    environment:
        - PORTAL_WIPE_LEGACY=1
    ```

    Startup refuses to run while legacy clients exist and the flag is unset. The flag
    deletes long-lived clients, legacy accounts, and one-time links, while keeping the
    interface and the user-config defaults.

4. Remove `PORTAL_WIPE_LEGACY` after the first successful start.

Users sign in, generate a configuration, and connect. Existing WireGuard client
configurations stop working because their peers no longer exist; issue a new
configuration for each device.

[docs-getting-started]: ../../getting-started.md
