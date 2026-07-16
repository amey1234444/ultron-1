# Contract changelog

## v1.1

- Added mandatory `gateway_ip` to every Gateway-originated envelope.
  `gateway_id + rack_id` stays the permanent identity; `gateway_ip` is the
  mandatory network-binding/verification field.
- Frozen topic tree `ultron/v1/gateways/{gateway_id}/...` (no IPs in topics).
- QoS 1 everywhere; retained: status/inventory/health/identity/capabilities/
  configuration; non-retained: telemetry/events/commands.
- Gateway MQTT client id: `ultron-gw-{gateway_id}`. Last Will publishes a
  retained OFFLINE status on `.../status`.
