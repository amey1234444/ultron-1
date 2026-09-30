"""Runtime settings from environment (12-factor). No credentials are hard-coded."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ULTRON_ML_", env_file=".env", extra="ignore")

    env: str = "dev"
    log_level: str = "INFO"
    log_json: bool = False
    default_profile: str = "tse"
    artifacts_dir: Path = Path("artifacts")
    models_dir: Path = Path("artifacts/models")
    database_url: str = "sqlite:///artifacts/ultron_ml.db"
    redis_url: str | None = None
    mlflow_tracking_uri: str = "file:artifacts/mlruns"
    mqtt_enabled: bool = False
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic: str = "ultron/+/telemetry"
    api_host: str = "0.0.0.0"  # noqa: S104
    api_port: int = 8000
    admin_token: str | None = Field(default=None, description="bearer token for admin endpoints")
    inference_seed: int = 42


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
