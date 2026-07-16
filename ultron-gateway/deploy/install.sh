#!/usr/bin/env bash
# Raspberry Pi install: /opt/ultron-gateway + systemd supervision.
set -euo pipefail

INSTALL_DIR=/opt/ultron-gateway
CONF_DIR=/etc/ultron-gateway
STATE_DIR=/var/lib/ultron-gateway
LOG_DIR=/var/log/ultron-gateway

id -u ultron-gateway &>/dev/null || sudo useradd --system --no-create-home ultron-gateway

sudo mkdir -p "$INSTALL_DIR" "$CONF_DIR" "$CONF_DIR/certs" "$STATE_DIR" "$LOG_DIR"
sudo cp -r "$(dirname "$0")/.." "$INSTALL_DIR"

sudo python3 -m venv "$INSTALL_DIR/venv"
sudo "$INSTALL_DIR/venv/bin/pip" install "$INSTALL_DIR"

if [ ! -f "$CONF_DIR/gateway.env" ]; then
  sudo cp "$INSTALL_DIR/.env.example" "$CONF_DIR/gateway.env"
  echo "Edit $CONF_DIR/gateway.env with real broker credentials before starting."
fi
sudo sed -i "s|^GATEWAY_STATE_DIR=.*|GATEWAY_STATE_DIR=$STATE_DIR|" "$CONF_DIR/gateway.env"

sudo chown -R ultron-gateway:ultron-gateway "$STATE_DIR" "$LOG_DIR"
sudo cp "$INSTALL_DIR/deploy/ultron-gateway.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ultron-gateway
echo "Run: sudo systemctl start ultron-gateway"
