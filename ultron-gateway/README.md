# Ultron Gateway

Python MQTT 5 gateway (Phase C of the handover). Runs identically in Google
Colab (simulated CC/RCC input) and on the Raspberry Pi (real CC/RCC input) —
only the data source module differs:

```
Simulator / CC v3 telemetry  →  canonical RackModel  →  Publisher  →  MQTT 5/TLS  →  EMQX
```

`DATA_SOURCE` selects the input: `simulator` (default, synthetic rack) or
`cc_v3` (Ultron Gateway v3 CC-card telemetry, see below).

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

## CC v3 telemetry (`DATA_SOURCE=cc_v3`)

Set `MQTT_PAYLOAD_FORMAT=cc_v3_raw` to publish the exact normalized CC v3 JSON
frame on the rack telemetry topic. This is the default. Set
`MQTT_PAYLOAD_FORMAT=canonical` to publish the older `ultron.measurement.batch`
envelope instead.

For dashboard smoke tests, set `DATA_SOURCE=cc_v3_test_loop`. The gateway will
publish `CC_V3_TEST_FIXTURE_PATH` repeatedly, using the checked-in tested fixture
by default.

Ultron Gateway v3 normalizes each CC/DAQ frame and rewrites
`latest_telemetry.json` (or streams newline-delimited frames over TCP —
`CC_V3_TCP_HOST`/`CC_V3_TCP_PORT`). `cc_v3.py` translates a frame into the
canonical model:

| v3 frame | canonical model |
| --- | --- |
| `rack_number: "CC_Card_UID1"` | `rack_id: 1` — `RACK_NUMBER_MAP=CC_Card_UID1=1`, otherwise the trailing digits |
| `channels[].channel: 3` | slot 3, channel 1 — one channel per card; regroup with `CHANNEL_SLOT_MAP=1=1.1,7=1.2` |
| `card_type: rtd/thermocouple/pressure/current/voltage/proximity/digital_input` | `PROCESS` card, `measurement_type` `TEMPERATURE`/`PRESSURE`/… |
| `card_type: vibration` / `speed` | `VIBRATION` / `SPEED` card |
| `value_formatted` (else `value_raw / 10^decimal_places`) | `value` with the reported `unit` |
| `channel_status`, `daq_valid` | `quality`: fault → `BAD`, invalid DAQ → `UNCERTAIN`, else `GOOD` |
| `telemetry_age_seconds` vs `CC_STALE_AFTER_S` | `freshness` `FRESH`/`STALE`, gateway state `ONLINE`/`DEGRADED` |
| `alert_*` / `danger_*` | thresholds + states on each record and edge-triggered `ultron.event.alarm` (WARNING/CRITICAL) |
| `cc_gateway_communication.status` | slot `CC_CONTROLLER_SLOT` (13) `COMMUNICATION_CONTROLLER` presence/online state |

Retained inventory is republished only when the slot layout changes, and alarm
events only on ACTIVE/CLEARED edges.

## Tests

```bash
pip install pytest && pytest
```

## Raspberry Pi

`deploy/install.sh` installs to `/opt/ultron-gateway`, config at
`/etc/ultron-gateway/gateway.env`, state at `/var/lib/ultron-gateway`, and
supervises via `deploy/ultron-gateway.service` (systemd). Set `DATA_SOURCE=cc_v3`
and `CC_V3_TELEMETRY_PATH` in `gateway.env` to publish real CC data.
