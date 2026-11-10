# Hostinger monitoring operations

This directory contains the source-controlled service definitions used by the
CodAstra Hostinger monitoring stack. Secrets are intentionally excluded.

## Components

- `monitor.mjs`: five public API checks, resource thresholds, TLS expiry,
  systemd/PM2 processes, MongoDB, Brevo, Cloudinary, email alerts, and the
  FlareWatch heartbeat.
- `telemetry.mjs`: loopback-only aggregate health endpoints consumed through
  the authenticated FlareWatch proxy.
- `codastra-monitor.service` and `codastra-monitor.timer`: run the monitor every
  five minutes.
- `codastra-telemetry.service`: keeps the loopback telemetry API available.
- `flarewatch-proxy.service`: runs the official FlareWatch proxy binary.
- `flarewatch-proxy.nginx.conf`: publishes only the authenticated proxy route
  and its health endpoint through Nginx.
- `codastra-status`: operator summary for applications and infrastructure.

## Production paths

| Repository file               | Hostinger path                                   |
| ----------------------------- | ------------------------------------------------ |
| `monitor.mjs`                 | `/opt/codastra-monitor/monitor.mjs`              |
| `telemetry.mjs`               | `/opt/codastra-monitor/telemetry.mjs`            |
| `codastra-monitor.service`    | `/etc/systemd/system/codastra-monitor.service`   |
| `codastra-monitor.timer`      | `/etc/systemd/system/codastra-monitor.timer`     |
| `codastra-telemetry.service`  | `/etc/systemd/system/codastra-telemetry.service` |
| `flarewatch-proxy.service`    | `/etc/systemd/system/flarewatch-proxy.service`   |
| `flarewatch-proxy.nginx.conf` | `/etc/nginx/snippets/flarewatch-proxy.conf`      |
| `codastra-status`             | `/usr/local/bin/codastra-status`                 |

The proxy binary is built from `saminnet/flarewatch-proxy` release `2.1.0`
(source commit `4b57321`). It is installed as
`/usr/local/bin/flarewatch-proxy`.

## Secret configuration

The following root-owned files must remain mode `600` and must never be
committed:

- `/etc/codastra-monitor.env`
- `/etc/flarewatch-proxy.env`

Use `codastra-monitor.env.example` as the variable inventory. Values must come
from the relevant production secret stores.

## Verification

```bash
codastra-status
sudo systemctl status codastra-monitor.timer codastra-telemetry flarewatch-proxy
sudo journalctl -u codastra-monitor.service -n 100 --no-pager
curl -fsS https://status.codastralabs.com/api/data
```

The telemetry service intentionally binds to `127.0.0.1:5097`. The proxy listens
on port `5098`, which must remain blocked by UFW; external access goes through
HTTPS and the authenticated Nginx route only.
