# Ultron Gateway

Python MQTT 5 gateway (Phase C of the handover). Runs identically in Google
Colab (simulated CC/RCC input) and on the Raspberry Pi (real CC/RCC input) —
only the data source module differs:

```
Simulator / CC/RCC TCP  →  canonical RackModel  →  Publisher  →  MQTT 5/TLS  →  EMQX
```

- Identity: permanent `gateway_id + rack_id`; `gateway_ip` is the mandatory
  network-binding field in every envelope (`envelope.py` adds it automatically).
- Dashboard binding: set `GATEWAY_ID` to the Gateway Script ID shown in the
  Devices gateway details, and set `RACK_IDS` to the comma-separated Rack Script
  IDs shown for the racks inside that gateway. The demo gateway defaults to
  `GATEWAY_ID=ultron-gw-demo-01` and `RACK_IDS=1,2,3,4`.
- Client id: `ultron-gw-{GATEWAY_ID}`; retained Last Will publishes OFFLINE
  status.
- QoS 1 everywhere; status/inventory retained, telemetry/events not.
- Offline spool (`spool.py`, SQLite): telemetry produced while disconnected is
  replayed after reconnect with `"replayed": true` and original timestamps.

## Run (Colab / dev)

```bash
cd ultron-gateway
pip install -e .
cp .env.example .env    # fill in EMQX credentials
set -a; source .env; set +a
python -m ultron_gateway.main
```

For the seeded first gateway in the app, these are the important values:

```bash
export GATEWAY_ID=ultron-gw-demo-01
export RACK_IDS=1,2,3,4
export GATEWAY_IP=192.168.10.10
```

Real mode only shows live values when those IDs match the gateway and rack IDs
stored in the database. Dummy mode keeps the same gateway/rack structure but
uses simulated UI data.

## Tests

```bash
pip install pytest && pytest
```

## Raspberry Pi

`deploy/install.sh` installs to `/opt/ultron-gateway`, config at
`/etc/ultron-gateway/gateway.env`, state at `/var/lib/ultron-gateway`, and
supervises via `deploy/ultron-gateway.service` (systemd). Replace
`Simulator` with `CcRccClient` in `main.py` when the hardware link lands.
