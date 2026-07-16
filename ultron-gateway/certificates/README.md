# TLS certificates

Place the broker CA certificate here (e.g. `emqx-ca.crt`) and point
`MQTT_CA_CERT` at it if your EMQX deployment uses a private CA. Public EMQX
Cloud endpoints with certificates from a public CA need no file here — the
system trust store is used by default.

Never commit private keys.
