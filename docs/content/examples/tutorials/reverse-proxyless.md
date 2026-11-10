---
title: No Reverse Proxy
---

/// warning | Insecure

This is insecure. You should use a reverse proxy to secure the connection.

Only use this method if you know what you are doing.

///

If you only allow access to the web UI from your local network, you can skip the reverse proxy setup. This is not recommended, but it is possible.

## Setup

- Keep the OIDC variables from the [configuration reference](../../advanced/config/external-authentication.md)
  and set `INSECURE` to `true` to allow the session cookie over HTTP.

- The environment should look something like this:

    ```yaml
    environment:
        - OAUTH_OIDC_SERVER=https://idp.example.com
        - OAUTH_OIDC_CLIENT_ID=wg-easy
        - OAUTH_OIDC_CLIENT_SECRET=...
        - OIDC_ALLOWED_GROUPS=vpn-users
        - VPN_HOST=vpn.example.com
        - INSECURE=true
    ```

- The OIDC redirect URI must match the address you use, for example
  `http://192.168.1.10:51821/api/auth/callback`.

- Save the file and restart `wg-easy`.

- Make sure that the portal is not accessible from outside your local network.
