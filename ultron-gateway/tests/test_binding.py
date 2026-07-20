import pytest

from ultron_gateway.config import Config
from ultron_gateway.identity import resolve_gateway_ip


def test_explicit_ip_takes_priority(monkeypatch):
    monkeypatch.setenv("GATEWAY_IP", "192.168.50.10")
    monkeypatch.setenv("GATEWAY_PRIMARY_INTERFACE", "eth0")
    assert resolve_gateway_ip(Config()) == "192.168.50.10"


def test_startup_fails_without_ip_configuration(monkeypatch):
    monkeypatch.delenv("GATEWAY_IP", raising=False)
    monkeypatch.delenv("GATEWAY_PRIMARY_INTERFACE", raising=False)
    with pytest.raises(RuntimeError):
        resolve_gateway_ip(Config())


def test_client_id_derives_from_gateway_id(monkeypatch):
    monkeypatch.setenv("GATEWAY_ID", "GW-007")
    assert Config().mqtt_client_id == "ultron-gw-GW-007"


def test_rack_ids_parse_csv(monkeypatch):
    monkeypatch.setenv("RACK_IDS", "1,2,3,4")
    cfg = Config()
    assert cfg.rack_ids == (1, 2, 3, 4)
    assert cfg.primary_rack_id == 1
