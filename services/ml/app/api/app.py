"""The FastAPI surface.

Thin by design. Every route does three things: check authorisation where the
route needs it, call a handler, and translate an ``MLServiceError`` into a
status code. All the behaviour is in ``handlers.py``, which is why the tests do
not need a web server.

FastAPI is imported inside ``create_app`` rather than at module scope, so this
file can be imported — and the rest of the service exercised — in an
environment where FastAPI is not installed.

Route groups:

    public      health, models, diagnosis, prognosis, explanations, inference
    internal    training, evaluation, promotion — token-guarded, fail closed

The split matters. The public routes are read-mostly and safe to expose to the
Next.js application; the internal ones start jobs that consume a machine and
change which model answers a production question, and they are refused outright
when no token is configured.
"""

from __future__ import annotations

from typing import Any

from ..core.errors import MLServiceError
from ..schemas.telemetry import BatchInferenceRequest, InferenceRequest
from .handlers import MLService, require_internal_token


def create_app(service: MLService | None = None) -> Any:
    """Build the ASGI application. Requires FastAPI to be installed."""
    from fastapi import Depends, FastAPI, Header, HTTPException, Query
    from fastapi.responses import JSONResponse

    app = FastAPI(
        title="BLACKGATE ML service",
        version="1.0.0",
        description=(
            "Predictive diagnosis and prognosis for the twin-screw extruder. "
            "Advisory: the deterministic engineering rules are authoritative and run "
            "whether or not any model here is available."
        ),
    )
    ml = service or MLService()
    app.state.ml = ml

    def current() -> MLService:
        return app.state.ml

    @app.exception_handler(MLServiceError)
    async def _service_error(_request, exc: MLServiceError):  # type: ignore[no-untyped-def]
        return JSONResponse(status_code=exc.status_code, content=exc.payload())

    def internal(x_ultron_token: str | None = Header(default=None)) -> None:
        try:
            require_internal_token(x_ultron_token, current().settings)
        except MLServiceError as error:
            raise HTTPException(status_code=error.status_code, detail=error.message) from error

    # -- public -----------------------------------------------------------

    @app.get("/health", summary="Liveness, plus what is and is not working")
    def health() -> dict[str, Any]:
        return current().health()

    @app.get("/models", summary="Every registered model version")
    def models() -> dict[str, Any]:
        return current().describe_models()

    @app.get("/models/champion", summary="The model currently answering")
    def champion() -> dict[str, Any]:
        return current().champion()

    @app.post("/inference", summary="Run the chain over one telemetry frame")
    def inference(request: InferenceRequest) -> dict[str, Any]:
        return current().infer(request)

    @app.post("/inference/batch", summary="Replay several frames in order")
    def inference_batch(request: BatchInferenceRequest) -> dict[str, Any]:
        return current().infer_batch(request)

    @app.get("/diagnosis/{machine_id}", summary="The latest diagnosis for a machine")
    def diagnosis(machine_id: str) -> dict[str, Any]:
        return current().diagnosis(machine_id)

    @app.get("/diagnosis/{machine_id}/history", summary="Recent diagnoses")
    def diagnosis_history(machine_id: str, limit: int = Query(default=50, ge=1, le=240)) -> dict[str, Any]:
        return current().diagnosis_history(machine_id, limit=limit)

    @app.get("/prognosis/{machine_id}", summary="Fault risk per horizon")
    def prognosis(machine_id: str) -> dict[str, Any]:
        return current().prognosis(machine_id)

    @app.get("/explanations/{prediction_id}", summary="Model contributions for a prediction")
    def explanation(prediction_id: str) -> dict[str, Any]:
        return current().explanation(prediction_id)

    @app.post("/feedback", summary="Record an engineer's verdict on a diagnosis")
    def feedback(payload: dict[str, Any]) -> dict[str, Any]:
        return current().submit_feedback(payload)

    @app.get("/metrics", summary="Counters, latency and per-machine status")
    def metrics() -> dict[str, Any]:
        return current().metrics()

    # -- internal ---------------------------------------------------------
    #
    # These start jobs that take minutes to hours and change which model
    # answers a production question. They return a command line rather than
    # spawning work inside the request: training inside a web worker competes
    # with inference for the same process and cannot be cancelled, and a
    # training run should be visible in a scheduler, not buried in an HTTP log.

    @app.post("/training/build-dataset", dependencies=[Depends(internal)])
    def build_dataset(payload: dict[str, Any]) -> dict[str, Any]:
        return _command("app.training.build_dataset", payload)

    @app.post("/training/train-temporal", dependencies=[Depends(internal)])
    def train_temporal(payload: dict[str, Any]) -> dict[str, Any]:
        return _command("app.training.train_temporal", payload)

    @app.post("/training/train-lightgbm", dependencies=[Depends(internal)])
    def train_lightgbm(payload: dict[str, Any]) -> dict[str, Any]:
        return _command("app.training.train_lightgbm", payload)

    @app.post("/training/train-xgboost", dependencies=[Depends(internal)])
    def train_xgboost(payload: dict[str, Any]) -> dict[str, Any]:
        return _command("app.training.train_xgboost", payload)

    @app.post("/training/calibrate", dependencies=[Depends(internal)])
    def calibrate(payload: dict[str, Any]) -> dict[str, Any]:
        return _command("app.training.calibrate", payload)

    @app.post("/training/evaluate", dependencies=[Depends(internal)])
    def evaluate(payload: dict[str, Any]) -> dict[str, Any]:
        return _command("app.training.evaluate", payload)

    @app.post("/training/golden", dependencies=[Depends(internal)])
    def golden(payload: dict[str, Any]) -> dict[str, Any]:
        return _command("app.training.run_golden_tests", payload)

    @app.post("/training/promote", dependencies=[Depends(internal)])
    def promote(payload: dict[str, Any]) -> dict[str, Any]:
        return _command("app.training.promote_model", payload)

    @app.post("/models/reload", dependencies=[Depends(internal)])
    def reload_models() -> dict[str, Any]:
        return current().reload_models()

    return app


def _command(module: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Render the command line a caller should run, rather than running it.

    A deliberate non-implementation. Training inside the web process would
    compete with inference for CPU in a way nothing can bound, could not be
    cancelled, and would have no log anybody can find afterwards. Returning the
    exact command keeps the API as the place you ask, and the scheduler as the
    place it happens.
    """
    arguments = " ".join(
        f"--{key.replace('_', '-')} {value}" for key, value in payload.items() if value is not None
    )
    return {
        "accepted": False,
        "reason": (
            "Training is run out of process, deliberately. Run the command below on a "
            "training host or through your scheduler."
        ),
        "command": f"python -m {module} {arguments}".strip(),
    }


app = None
"""Populated by ``main()``; uvicorn imports ``app.api.app:build``."""


def build() -> Any:
    """Entry point for ``uvicorn app.api.app:build --factory``."""
    return create_app()
