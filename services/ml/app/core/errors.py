"""Structured reasons the ML layer declines to answer.

Every one of these is a real answer, not an error page. "I cannot tell you,
and here is precisely why" is what an engineer needs from a diagnostic system;
a fabricated probability is what they must never get.

``MLIneligibleReason`` values are part of the response contract. The Analyzer
renders them as text, so renaming one is a contract change.
"""

from __future__ import annotations

from enum import Enum


class MLIneligibleReason(str, Enum):
    """Why the learned layer did not run for this observation."""

    BAD_DATA = "ML_INELIGIBLE_BAD_DATA"
    WRONG_STATE = "ML_INELIGIBLE_WRONG_STATE"
    INSUFFICIENT_LOOKBACK = "ML_INELIGIBLE_INSUFFICIENT_LOOKBACK"
    CONFIGURATION_MISMATCH = "ML_INELIGIBLE_CONFIGURATION_MISMATCH"
    MISSING_REQUIRED_SIGNAL = "ML_INELIGIBLE_MISSING_REQUIRED_SIGNAL"
    FEATURE_SCHEMA_MISMATCH = "ML_INELIGIBLE_FEATURE_SCHEMA_MISMATCH"
    NO_MODEL = "ML_INELIGIBLE_NO_MODEL"
    CONTEXT_UNKNOWN = "ML_INELIGIBLE_CONTEXT_UNKNOWN"
    MODE_DISABLED = "ML_INELIGIBLE_MODE_DISABLED"


class MLStatus(str, Enum):
    """The health of the learned layer for one response."""

    OK = "OK"
    DEGRADED = "DEGRADED"
    """A model or library failed. Deterministic rules still answered."""
    INELIGIBLE = "INELIGIBLE"
    """The gate refused, for a declared reason. Not a failure."""
    DISABLED = "DISABLED"


class MLServiceError(Exception):
    """Base for failures that must not take the deterministic path down."""

    status_code = 500
    code = "ML_ERROR"

    def __init__(self, message: str, *, detail: dict[str, object] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail or {}

    def payload(self) -> dict[str, object]:
        return {"error": self.code, "message": self.message, "detail": self.detail}


class KnowledgeError(MLServiceError):
    """The exported knowledge snapshot is missing, corrupt or the wrong shape."""

    status_code = 503
    code = "KNOWLEDGE_UNAVAILABLE"


class ModelLoadError(MLServiceError):
    """An artifact would not load. The caller degrades rather than failing."""

    status_code = 503
    code = "MODEL_LOAD_FAILED"


class ModelContractError(MLServiceError):
    """A model's recorded input contract does not match this feature set."""

    status_code = 409
    code = "MODEL_CONTRACT_MISMATCH"


class PromotionRefused(MLServiceError):
    """A model was not promoted. The reasons are the point of the exception."""

    status_code = 409
    code = "PROMOTION_REFUSED"

    def __init__(self, reasons: list[str]) -> None:
        super().__init__("Promotion refused.", detail={"reasons": reasons})
        self.reasons = reasons


class DatasetError(MLServiceError):
    """A dataset could not be built, or is not fit to train on."""

    status_code = 422
    code = "DATASET_INVALID"


class LeakageDetected(DatasetError):
    """A split would have leaked. Always fatal — never a warning."""

    code = "DATASET_LEAKAGE"


class Unauthorized(MLServiceError):
    status_code = 401
    code = "UNAUTHORIZED"
