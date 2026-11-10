---
title: Prometheus
---

To monitor the WireGuard server, you can use [Prometheus](https://prometheus.io/) and
[Grafana](https://grafana.com/). The container exposes `/metrics/prometheus` and
`/metrics/json`.

## Enable metrics

Metrics are off by default:

```yaml
environment:
    - METRICS_ENABLED=true
```

There is no admin UI switch. The two database flags are synchronised from
`METRICS_ENABLED` at startup.

When enabled, the endpoints are reachable without authentication unless you protect
them at the reverse proxy. Add an access rule or a separate listener before exposing
them to the internet.

## Configure Prometheus

```yaml
scrape_configs:
    - job_name: 'wg-easy'
      scrape_interval: 30s
      metrics_path: /metrics/prometheus
      static_configs:
          - targets:
                - 'localhost:51821'
```

If your reverse proxy requires a bearer token for `/metrics/*`, add:

```yaml
      authorization:
          type: Bearer
          credentials: 'SuperSecurePassword'
```

## Grafana Dashboard

You can use the following Grafana dashboard to visualize the metrics:

[![Grafana Dashboard](https://grafana.com/api/dashboards/21733/images/16863/image)](https://grafana.com/grafana/dashboards/21733-wireguard/)

[21733](https://grafana.com/grafana/dashboards/21733-wireguard/)

/// note | Unofficial

The Grafana dashboard is not official and is not maintained by the `wg-easy` team. If
you have any issues with the dashboard, please contact the author of the dashboard.
See [#1299](https://github.com/wg-easy/wg-easy/pull/1299) for more information.

///

## Metrics

WireGuard peers are now short-lived grants. The peer labels therefore reflect the
device name captured at issuance and disappear when the grant is revoked:

- `wireguard_configured_peers`, `wireguard_enabled_peers`, `wireguard_connected_peers`
- `wireguard_sent_bytes`, `wireguard_received_bytes`
- `wireguard_latest_handshake_seconds`
- `wireguard_peer_endpoint_info`
