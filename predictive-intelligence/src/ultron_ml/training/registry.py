"""Model registry: versioned bundles with lineage, champion/challenger promotion and rollback.

A *bundle* is a directory:

    <registry_root>/<profile>/<version>/
        manifest.json     lineage (config hash, feature schema version, dataset snapshot hash, metrics, git sha)
        trees/            MultiLabelTreeModel artefacts
        lstm/             optional LSTMTemporalModel artefacts

``<registry_root>/<profile>/champion.json`` points at the active version and keeps a history for rollback.
MLflow tracking is optional (``ULTRON_MLFLOW_TRACKING_URI``); everything is also written as plain JSON so the
registry works offline.
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ultron_ml.config.models import ProfileConfig
from ultron_ml.config.settings import get_settings
from ultron_ml.features.engine import FEATURE_SCHEMA_VERSION
from ultron_ml.models.lstm import LSTMTemporalModel
from ultron_ml.models.trees import MultiLabelTreeModel

log = logging.getLogger(__name__)


@dataclass
class ModelManifest:
    version: str
    profile: str
    created_at: str
    config_hash: str
    feature_schema_version: str
    feature_count: int
    feature_schema_hash: str
    dataset_snapshot_hash: str
    algorithm: str
    targets: list[str]
    metrics: dict[str, Any] = field(default_factory=dict)
    experiment: str = ""
    has_lstm: bool = False
    lstm_feature_names: list[str] = field(default_factory=list)
    git_sha: str | None = None
    training_data_synthetic: bool = True
    notes: str = ""


def _git_sha() -> str | None:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True, timeout=5).stdout.strip()
    except (subprocess.SubprocessError, FileNotFoundError):
        return None


def schema_hash(columns: list[str]) -> str:
    return hashlib.sha256("\n".join(columns).encode()).hexdigest()[:16]


class ModelRegistry:
    def __init__(self, root: Path) -> None:
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    def _pdir(self, profile: str) -> Path:
        d = self.root / profile
        d.mkdir(parents=True, exist_ok=True)
        return d

    # ---- registration --------------------------------------------------------------------
    def register(
        self,
        profile: ProfileConfig,
        trees: MultiLabelTreeModel,
        lstm: LSTMTemporalModel | None,
        dataset_snapshot_hash: str,
        metrics: dict[str, Any],
        experiment: str = "",
        lstm_feature_names: list[str] | None = None,
        notes: str = "",
    ) -> ModelManifest:
        ts = datetime.now(UTC)
        version = ts.strftime("%Y%m%dT%H%M%SZ") + "-" + schema_hash(trees.features)[:6]
        d = self._pdir(profile.name) / version
        trees.save(d / "trees")
        if lstm is not None:
            lstm.save(d / "lstm")
        man = ModelManifest(
            version=version, profile=profile.name, created_at=ts.isoformat(), config_hash=profile.config_hash,
            feature_schema_version=FEATURE_SCHEMA_VERSION, feature_count=len(trees.features), feature_schema_hash=schema_hash(trees.features),
            dataset_snapshot_hash=dataset_snapshot_hash, algorithm=trees.params.algorithm, targets=list(trees.targets), metrics=metrics,
            experiment=experiment, has_lstm=lstm is not None, lstm_feature_names=lstm_feature_names or [], git_sha=_git_sha(), notes=notes,
        )
        (d / "manifest.json").write_text(json.dumps(asdict(man), indent=2, default=str))
        (d / "feature_schema.json").write_text(json.dumps(trees.features))
        self._mlflow_log(man)
        return man

    def _mlflow_log(self, man: ModelManifest) -> None:
        uri = get_settings().mlflow_tracking_uri
        if not uri:
            return
        try:
            import mlflow

            mlflow.set_tracking_uri(uri)
            mlflow.set_experiment(f"ultron-{man.profile}")
            with mlflow.start_run(run_name=man.version):
                mlflow.log_params({"config_hash": man.config_hash, "feature_schema_version": man.feature_schema_version,
                                   "dataset_snapshot_hash": man.dataset_snapshot_hash, "algorithm": man.algorithm, "experiment": man.experiment})
                flat = {k: v for k, v in man.metrics.items() if isinstance(v, (int, float))}
                if flat:
                    mlflow.log_metrics(flat)
                mlflow.set_tags({"synthetic": str(man.training_data_synthetic), "git_sha": man.git_sha or ""})
        except Exception as exc:  # MLflow is optional; never fail training on tracking errors
            log.warning("mlflow logging skipped: %s", exc)

    # ---- lookup ----------------------------------------------------------------------------
    def versions(self, profile: str) -> list[ModelManifest]:
        out = []
        for d in sorted(self._pdir(profile).iterdir()):
            m = d / "manifest.json"
            if m.exists():
                out.append(ModelManifest(**json.loads(m.read_text())))
        return out

    def manifest(self, profile: str, version: str) -> ModelManifest:
        return ModelManifest(**json.loads((self._pdir(profile) / version / "manifest.json").read_text()))

    def _champ_file(self, profile: str) -> Path:
        return self._pdir(profile) / "champion.json"

    def champion(self, profile: str) -> ModelManifest | None:
        f = self._champ_file(profile)
        if not f.exists():
            return None
        state = json.loads(f.read_text())
        return self.manifest(profile, state["champion"]) if state.get("champion") else None

    def challenger(self, profile: str) -> ModelManifest | None:
        f = self._champ_file(profile)
        if not f.exists():
            return None
        state = json.loads(f.read_text())
        return self.manifest(profile, state["challenger"]) if state.get("challenger") else None

    def _write_state(self, profile: str, **update: Any) -> dict[str, Any]:
        f = self._champ_file(profile)
        state = json.loads(f.read_text()) if f.exists() else {"champion": None, "challenger": None, "history": []}
        state.update(update)
        f.write_text(json.dumps(state, indent=2))
        return state

    # ---- promotion / rollback --------------------------------------------------------------
    def set_challenger(self, profile: str, version: str) -> None:
        self.manifest(profile, version)
        self._write_state(profile, challenger=version)

    def promote(self, profile: str, version: str, reason: str = "") -> None:
        self.manifest(profile, version)
        f = self._champ_file(profile)
        state = json.loads(f.read_text()) if f.exists() else {"champion": None, "challenger": None, "history": []}
        state["history"].append({"at": datetime.now(UTC).isoformat(), "from": state.get("champion"), "to": version, "reason": reason})
        state["champion"] = version
        if state.get("challenger") == version:
            state["challenger"] = None
        f.write_text(json.dumps(state, indent=2))

    def rollback(self, profile: str, reason: str = "rollback") -> ModelManifest | None:
        f = self._champ_file(profile)
        if not f.exists():
            return None
        state = json.loads(f.read_text())
        prev = [h for h in state["history"] if h.get("from")]
        if not prev:
            return None
        target = prev[-1]["from"]
        self.promote(profile, target, reason=reason)
        return self.manifest(profile, target)

    def compare(self, profile: str, champion: str, challenger: str, key: str = "test_pr_auc_mean") -> dict[str, Any]:
        a, b = self.manifest(profile, champion), self.manifest(profile, challenger)
        va, vb = a.metrics.get(key), b.metrics.get(key)
        return {"metric": key, "champion": {"version": champion, "value": va}, "challenger": {"version": challenger, "value": vb},
                "challenger_better": (vb is not None and va is not None and vb > va)}

    # ---- loading ----------------------------------------------------------------------------
    def load(self, profile: str, version: str | None = None) -> tuple[ModelManifest, MultiLabelTreeModel, LSTMTemporalModel | None]:
        man = self.manifest(profile, version) if version else self.champion(profile)
        if man is None:
            raise FileNotFoundError(f"no champion model registered for profile {profile}")
        d = self._pdir(profile) / man.version
        trees = MultiLabelTreeModel.load(d / "trees")
        lstm = LSTMTemporalModel.load(d / "lstm") if man.has_lstm else None
        return man, trees, lstm

    def delete(self, profile: str, version: str) -> None:
        champ = self.champion(profile)
        if champ and champ.version == version:
            raise ValueError("cannot delete the active champion")
        shutil.rmtree(self._pdir(profile) / version)
