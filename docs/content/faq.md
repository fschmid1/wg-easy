---
title: FAQ
hide:
    - navigation
---

Here are some frequently asked questions or errors about `wg-easy`. If you have a question that is not answered here, please feel free to open a discussion on GitHub.

## Why can't I open my configuration a second time?

A configuration is delivered exactly once. The first successful `.conf` download or QR
reveal erases the private key. If the download was aborted before it completed, the
claim is released and you can try again while the download window is open. If the
window has already closed, use **Generate config** to issue a new grant; issuance is
rate-limited.

## Why is the connection refused before the first handshake?

The portal counts a grant as connected only after a real WireGuard handshake. Make sure
the client imported the full configuration, is using the same endpoint and port, and
connects before the connect deadline (10 minutes by default). Check `wg show` on the
host and the container logs if the client reports a handshake timeout.

## How do I change the client subnet or DNS?

Set `VPN_IPV4_CIDR`, `VPN_IPV6_CIDR`, and `VPN_DNS`. Changing a CIDR revokes existing
grants at the next startup because their addresses belong to the old subnet. See the
[configuration reference](./advanced/config/optional-config.md).

## How many devices can a user connect?

A user may have at most three live grants across all sessions. A fourth login evicts
the oldest grant and ends its session. Re-issuing inside one session replaces that
session's grant and uses the same shared hourly limit.

## What happens when a user is removed from the OIDC group?

The group is checked only at login. The existing session and grant keep working until
they expire: at most the grant's maximum lifetime (8 hours) and the session's absolute
lifetime. There is no token storage, so the portal cannot detect the removal sooner.

## Error: WireGuard exited with the error: Cannot find device "wg0"

This error indicates that the WireGuard interface `wg0` does not exist. This can happen if the WireGuard kernel module is not loaded or if the interface was not created properly.

To resolve this issue, you can try the following steps:

1. **Load the WireGuard kernel module**: If the WireGuard kernel module is not loaded, you can load it manually by running:

    ```shell
    sudo modprobe wireguard
    ```

2. **Load the WireGuard kernel module on boot**: If you want to ensure that the WireGuard kernel module is loaded automatically on boot, you can add it to the `/etc/modules` file:

    ```shell
    echo "wireguard" | sudo tee -a /etc/modules
    ```

## can't initialize iptables table `nat': Table does not exist (do you need to insmod?)

This error indicates that the `nat` table in `iptables` does not exist. This can happen if the `iptables` kernel module is not loaded or if the `nat` table is not supported by your kernel.

To resolve this issue, you can try the following steps:

1. **Load the `nat` kernel module**: If the `nat` kernel module is not loaded, you can load it manually by running:

    ```shell
    sudo modprobe iptable_nat
    ```

2. **Load the `nat` kernel module on boot**: If you want to ensure that the `nat` kernel module is loaded automatically on boot, you can add it to the `/etc/modules` file:

    ```shell
     echo "iptable_nat" | sudo tee -a /etc/modules
    ```

## can't initialize ip6tables table `nat': Table does not exist (do you need to insmod?)

This error indicates that the `nat` table in `ip6tables` does not exist. This can happen if the `ip6tables` kernel module is not loaded or if the `nat` table is not supported by your kernel.

To resolve this issue, you can try the following steps:

1. **Load the `nat` kernel module**: If the `nat` kernel module is not loaded, you can load it manually by running:

    ```shell
    sudo modprobe ip6table_nat
    ```

2. **Load the `nat` kernel module on boot**: If you want to ensure that the `nat` kernel module is loaded automatically on boot, you can add it to the `/etc/modules` file:

    ```shell
     echo "ip6table_nat" | sudo tee -a /etc/modules
    ```

## can't initialize iptables table `filter': Permission denied

This error indicates that the `filter` table in `iptables` cannot be initialized due to permission issues. This can happen if you are not running the command with sufficient privileges.

To resolve this issue, you can try the following steps:

1. **Load the `filter` kernel module**: If the `filter` kernel module is not loaded, you can load it manually by running:

    ```shell
    sudo modprobe iptable_filter
    ```

2. **Load the `filter` kernel module on boot**: If you want to ensure that the `filter` kernel module is loaded automatically on boot, you can add it to the `/etc/modules` file:

    ```shell
    echo "iptable_filter" | sudo tee -a /etc/modules
    ```

## can't initialize ip6tables table `filter': Permission denied

This error indicates that the `filter` table in `ip6tables` cannot be initialized due to permission issues. This can happen if you are not running the command with sufficient privileges.

To resolve this issue, you can try the following steps:

1. **Load the `filter` kernel module**: If the `filter` kernel module is not loaded, you can load it manually by running:

    ```shell
    sudo modprobe ip6table_filter
    ```

2. **Load the `filter` kernel module on boot**: If you want to ensure that the `filter` kernel module is loaded automatically on boot, you can add it to the `/etc/modules` file:

    ```shell
     echo "ip6table_filter" | sudo tee -a /etc/modules
    ```

## Clients lose connectivity after restarting the container when using multiple networks?

When you attach multiple Docker networks (e.g., `wg` and a reverse proxy network like `traefik` or `nginx`) to the `wg-easy` container, Docker might assign the network interfaces randomly (e.g., swapping `eth0` and `eth1`). Since `wg-easy` expects the wireguard interface to act as `eth0` and configures `POSTROUTING` rules for it, connectivity will break if the interfaces are swapped upon container restart.

To solve this, specify the `interface_name` and `gw_priority` explicitly in your `docker-compose.yml` file to guarantee that the `wg` network always binds to `eth0` and acts as the default gateway.

**Example `docker-compose.yml`:**

```yaml
services:
    wg-easy:
        # ... other configuration ...
        networks:
            wg:
                interface_name: eth0
                gw_priority: 1
                ipv4_address: 10.42.42.42
            nginx:
                interface_name: eth1
                gw_priority: 0

networks:
    wg:
        # ... wg network config ...
    nginx:
        external: true
```
