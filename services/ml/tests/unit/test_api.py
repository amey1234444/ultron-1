"""The API surface, tested through the handlers rather than through HTTP.

FastAPI is an optional dependency — the deterministic chain and the training
commands do not need it — so the behaviour lives in ``handlers.py`` and the
routes are a thin translation layer. These tests call the handlers directly
and therefore run whether or not FastAPI is installed; the one test that needs
it is skipped with a reason rather than failing.
"""

from __future__ import annotations

from datetime import timezone

import pytest

from app.api.handlers import MLService, require_internal_token
from app.core.capability import probe
from app.core.config import Settings, reset_settings
from app.core.errors import Unauthorized
from app.schemas.telemetry import InferenceRequest

UTC = timezone.utc


@pytest.fixture
def service(isolated_settings) -> MLService:
    return MLService(isolated_settings)


def test_health_answers_with_no_models_loaded(service: MLService) -> None:
    """The service is up; the ML layer is not. Both facts are reported."""
    payload = service.health()
    assert payload["status"] == "ok"
    assert payload["mode"] == "shadow"
    assert payload["publishes_alerts"] is False
    assert payload["knowledge"]["counts"]["faults"] == 90
    assert payload["models"]["champion"]["available"] is False
    assert "capabilities" in payload
    assert "versions" in payload


def test_champion_says_none_promoted_rather_than_erroring(service: MLService) -> None:
    payload = service.champion()
    assert payload["champion"] is None
    assert "deterministic rules" in payload["reason"]


def test_inference_returns_the_full_contract(service: MLService, steady_frame) -> None:
    response = service.infer(InferenceRequest(frame=steady_frame()))
    assert response["schema_version"] == "1.0"
    assert response["machine_id"] == "TSE-01"
    assert response["ml"]["eligible"] is False
    assert response["current_condition"]["rule_state"] in {"NORMAL", "ALERT", "DANGER"}
    assert isinstance(response["anomalies"], list)
    assert isinstance(response["diagnoses"], list)


def test_diagnosis_before_any_telemetry_is_a_stated_absence(service: MLService) -> None:
    payload = service.diagnosis("TSE-NEVER-SEEN")
    assert payload["diagnosis"] is None
    assert "No telemetry" in payload["reason"]


def test_diagnosis_history_accumulates(service: MLService, steady_run) -> None:
    for frame in steady_run(5):
        service.infer(InferenceRequest(frame=frame, force=True))
    payload = service.diagnosis_history("TSE-01")
    assert payload["count"] == 5
    assert all(entry["schema_version"] == "1.0" for entry in payload["history"])


def test_prognosis_carries_the_current_condition_alongside(service: MLService, steady_frame) -> None:
    """A risk without the current rule state misleads by omission."""
    service.infer(InferenceRequest(frame=steady_frame()))
    payload = service.prognosis("TSE-01")
    assert "current_condition" in payload
    assert "Predictive risk is not an alarm" in payload["note"]


def test_explanation_absence_is_explained(service: MLService) -> None:
    payload = service.explanation("no-such-prediction")
    assert payload["available"] is False
    assert "threshold" in payload["reason"]


def test_feedback_is_queued_for_review_not_trained_on(service: MLService) -> None:
    payload = service.submit_feedback(
        {
            "prediction_id": "abc",
            "machine_id": "TSE-01",
            "diagnosis_correct": "NO",
            "actual_fault_id": "TSE-DOWN-003",
            "false_positive": True,
            "label_quality": "GOLD",
        }
    )
    assert payload["accepted"] is True
    assert payload["review_status"] == "PENDING_REVIEW"
    assert "versioned dataset" in payload["note"]
    assert len(service.feedback.pending()) == 1


def test_metrics_reports_per_machine_status(service: MLService, steady_frame) -> None:
    service.infer(InferenceRequest(frame=steady_frame()))
    payload = service.metrics()
    assert "TSE-01" in payload["machines"]
    assert payload["counters"]["inference"] >= 1
    assert payload["latency_ms"]["count"] >= 1


# -- the internal guard fails closed ---------------------------------------


def test_internal_routes_are_closed_when_no_token_is_configured(isolated_settings) -> None:
    """An unauthenticated training endpoint burns a machine on someone else's
    schedule; an unauthenticated promotion endpoint is worse."""
    with pytest.raises(Unauthorized) as error:
        require_internal_token("anything", isolated_settings)
    assert "not configured" in str(error.value)


def test_internal_routes_reject_a_wrong_token(isolated_settings, tmp_path) -> None:
    configured = Settings(
        knowledge_dir=isolated_settings.knowledge_dir,
        artifacts_dir=tmp_path / "a",
        registry_dir=tmp_path / "a" / "registry",
        config_dir=tmp_path / "c",
        internal_api_token="correct-horse",
    )
    with pytest.raises(Unauthorized):
        require_internal_token("wrong", configured)
    require_internal_token("correct-horse", configured)  # does not raise


# -- cadence ----------------------------------------------------------------


def test_cadence_returns_the_previous_answer_rather_than_recomputing(
    isolated_settings, tmp_path, steady_run
) -> None:
    reset_settings(
        Settings(
            knowledge_dir=isolated_settings.knowledge_dir,
            artifacts_dir=tmp_path / "a",
            registry_dir=tmp_path / "a" / "registry",
            config_dir=tmp_path / "c",
            inference_interval_seconds=30.0,
        )
    )
    service = MLService()
    frames = steady_run(4)
    first = service.infer(InferenceRequest(frame=frames[0]))
    second = service.infer(InferenceRequest(frame=frames[1]))
    assert second["prediction_id"] == first["prediction_id"], "Within the cadence window."
    assert service._counters["inference_skipped_cadence"] == 1


# -- the FastAPI wiring, when FastAPI is present ---------------------------


@pytest.mark.skipif(not probe("fastapi").available, reason="FastAPI is an optional dependency.")
def test_fastapi_app_exposes_the_declared_routes(service: MLService) -> None:
    from app.api.app import create_app

    app = create_app(service)
    paths = {route.path for route in app.routes}
    for expected in (
        "/health",
        "/models",
        "/models/champion",
        "/inference",
        "/inference/batch",
        "/diagnosis/{machine_id}",
        "/diagnosis/{machine_id}/history",
        "/prognosis/{machine_id}",
        "/explanations/{prediction_id}",
        "/feedback",
        "/training/build-dataset",
        "/training/train-temporal",
        "/training/train-lightgbm",
        "/training/train-xgboost",
        "/training/evaluate",
        "/training/promote",
    ):
        assert expected in paths, f"{expected} is missing from the API."


def test_importing_the_app_module_needs_no_web_framework() -> None:
    """Importing must not require FastAPI, or the training host cannot import it."""
    import app.api.app as module

    assert hasattr(module, "create_app")
