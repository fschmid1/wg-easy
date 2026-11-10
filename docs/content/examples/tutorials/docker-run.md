---
title: Docker Run
---

To setup the IPv6 Network, simply run once:

```shell
docker network create \
  -d bridge --ipv6 \
  --subnet 10.42.42.0/24 \
  --subnet fdcc:ad94:bacf:61a3::/64 \
   wg
```

<!-- ref: major version -->

To automatically install & run `wg-easy`, simply run:

```shell
docker run -d \
  --net wg \
  -e INSECURE=true \
  -e OAUTH_OIDC_SERVER=https://idp.example.com \
  -e OAUTH_OIDC_CLIENT_ID=wg-easy \
  -e OAUTH_OIDC_CLIENT_SECRET=change-me \
  -e OIDC_ALLOWED_GROUPS=vpn-users \
  -e VPN_HOST=vpn.example.com \
  --name wg-easy \
  --ip6 fdcc:ad94:bacf:61a3::2a \
  --ip 10.42.42.42 \
  -v ~/.wg-easy:/etc/wireguard \
  -v /lib/modules:/lib/modules:ro \
  -p 51820:51820/udp \
  -p 51821:51821/tcp \
  --cap-add NET_ADMIN \
  --cap-add SYS_MODULE \
  --sysctl net.ipv4.ip_forward=1 \
  --sysctl net.ipv4.conf.all.src_valid_mark=1 \
  --sysctl net.ipv6.conf.all.disable_ipv6=0 \
  --sysctl net.ipv6.conf.all.forwarding=1 \
  --sysctl net.ipv6.conf.default.forwarding=1 \
  --restart unless-stopped \
  ghcr.io/wg-easy/wg-easy:15
```

The portal will now be available at <http://0.0.0.0:51821>. Register
`https://your-portal.example.com/api/auth/callback` at your identity provider before
signing in.
