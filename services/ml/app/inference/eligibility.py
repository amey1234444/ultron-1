"""The ML eligibility gate.

Asked before every learned inference: *may a model answer this at all?* If the
answer is no, the service returns a structured reason and no probability. It
does not return 0.5, or the last known value, or a number derived from
whatever features happened to compute.

That is the whole purpose. A fabricated probability is indistinguishable from a
real one downstream — it passes through calibration, crosses thresholds, raises
alerts and gets acted on. Refusing is the only safe failure, and a reason is
what makes the refusal actionable: ``ML_INELIGIBLE_INSUFFICIENT_LOOKBACK`` on a
machine that just restarted is expected and self-clearing;
``ML_INELIGIBLE_MISSING_REQUIRED_SIGNAL`` for a fortnight is an integration job
somebody has to do.

The gate is checked in cost order — the cheap categorical checks before the
ones that need a window — so the common refusals are also the fast ones.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..core.config import Settings
from ..core.errors import MLIneligibleReason
from ..features.engine import FeatureFrame
from ..knowledge.loader import knowledge
from ..quality.engine import FrameQuality
from ..state.engine import StateRecord
from ..windows.store import SequenceWindow


@dataclass
class EligibilityResult:
    """Whether the learned layer may run, and every reason it may not."""

    eligible: bool
    reason: MLIneligibleReason | None = None
    detail: str | None = None
    warnings: list[str] = field(default_factory=list)
    """Things that do not block but should lower confidence downstream."""

    @property
    def reason_value(self) -> str | None:
        return self.reason.value if self.reason else None


def evaluate_eligibility(
    *,
    settings: Settings,
    quality: FrameQuality,
    state: StateRecord,
    context_confidence: float,
    context_id: str | None,
    context_missing: tuple[str, ...] = (),
    features: FeatureFrame,
    sequence: SequenceWindow | None,
    required_lookback_steps: int,
    model_available: bool,
    model_reason: str | None = None,
    model_schema_error: str | None = None,
    configuration_version: str | None = None,
    model_configuration: str | None = None,
) -> EligibilityResult:
    """Run the gate. Cheapest and most categorical checks first."""
    warnings: list[str] = []

    if settings.ml_mode == "disabled":
        return EligibilityResult(
            eligible=False,
            reason=MLIneligibleReason.MODE_DISABLED,
            detail="ML_MODE is disabled. Deterministic rules continue to run.",
        )

    if quality.suppresses_physical_diagnosis:
        return EligibilityResult(
            eligible=False,
            reason=MLIneligibleReason.MISSING_REQUIRED_SIGNAL,
            detail=(
                "A mandatory signal is BAD or MISSING: "
                + ", ".join(sorted(quality.mandatory_unavailable))
                + ". Instrumentation is evaluated first."
            ),
        )

    # Observation-level gates first. "This machine is not in steady production"
    # and "a mandatory signal is missing" are true whether or not a model
    # exists, and they are what an engineer can act on. Model availability is a
    # property of the deployment and is checked last, so it never masks a
    # reason about the data.
    #
    # State before data quality: a machine that is stopped needs no comment on
    # its melt pressure sensor, and reporting one would be noise.
    if not state.is_steady_production:
        return EligibilityResult(
            eligible=False,
            reason=MLIneligibleReason.WRONG_STATE,
            detail=(
                f"Operating state is {state.state_name}. The models are trained on steady "
                "production and their expectations do not describe this state."
            ),
        )

    if state.state_confidence < 0.4:
        warnings.append(
            f"Operating state confidence is only {state.state_confidence:.2f}; the state was "
            "inferred rather than declared."
        )

    if quality.overall in {"BAD", "MISSING"}:
        return EligibilityResult(
            eligible=False,
            reason=MLIneligibleReason.BAD_DATA,
            detail=(
                f"Frame data quality is {quality.overall} across "
                f"{len(quality.bad_or_missing)} signal(s)."
            ),
        )
    if quality.overall == "UNCERTAIN":
        warnings.append("Frame data quality is UNCERTAIN; confidence is reduced accordingly.")

    if context_id is None:
        warnings.append(
            "No exact context could be formed; the comparison uses a broader grouping."
        )
    if context_confidence < 0.3:
        missing = ", ".join(context_missing) if context_missing else "none recorded"
        return EligibilityResult(
            eligible=False,
            reason=MLIneligibleReason.CONTEXT_UNKNOWN,
            detail=(
                f"Context confidence is {context_confidence:.2f} (missing keys: {missing}). "
                "A comparison would be against a normal that may not be this machine's."
            ),
        )

    if (
        model_configuration is not None
        and configuration_version is not None
        and model_configuration != configuration_version
    ):
        return EligibilityResult(
            eligible=False,
            reason=MLIneligibleReason.CONFIGURATION_MISMATCH,
            detail=(
                f"The model was trained under configuration {model_configuration}; this machine "
                f"is running {configuration_version}. A configuration change can invalidate "
                "every learned relationship."
            ),
        )

    if required_lookback_steps > 0:
        if sequence is None or sequence.length < required_lookback_steps:
            have = 0 if sequence is None else sequence.length
            return EligibilityResult(
                eligible=False,
                reason=MLIneligibleReason.INSUFFICIENT_LOOKBACK,
                detail=(
                    f"{have} aligned samples against a {required_lookback_steps}-step lookback. "
                    "This clears itself once the machine has run long enough."
                ),
            )
        completeness = sequence.completeness()
        if completeness < 0.7:
            return EligibilityResult(
                eligible=False,
                reason=MLIneligibleReason.INSUFFICIENT_LOOKBACK,
                detail=(
                    f"The lookback window is only {completeness * 100:.0f}% complete. "
                    "Interpolating the remainder would teach the model the interpolation."
                ),
            )
        if completeness < 0.9:
            warnings.append(f"Lookback window is {completeness * 100:.0f}% complete.")

    if not knowledge().field_calibrated:
        warnings.append(
            "Baselines and limits are engineering-development values, not field calibrated."
        )

    # A model that is loaded but cannot be fed is a different answer from no
    # model at all, and the difference matters to whoever is paged: NO_MODEL is
    # a deployment that has not adopted the ML layer, FEATURE_SCHEMA_MISMATCH is
    # an artifact and a pipeline that have drifted apart and needs a retrain.
    # Checked before NO_MODEL because a mismatched model is reported as
    # unavailable, and the more specific reason must win.
    if model_schema_error:
        return EligibilityResult(
            eligible=False,
            reason=MLIneligibleReason.FEATURE_SCHEMA_MISMATCH,
            detail=model_schema_error,
            warnings=warnings,
        )

    # Last: the observation would have been eligible, and there is no model.
    if not model_available:
        return EligibilityResult(
            eligible=False,
            reason=MLIneligibleReason.NO_MODEL,
            detail=model_reason or "No champion model is loaded for this machine type.",
            warnings=warnings,
        )

    return EligibilityResult(eligible=True, warnings=warnings)


def surfacing_decision(
    settings: Settings, machine_id: str, fault_id: str | None = None
) -> tuple[bool, str]:
    """Whether a finding may reach an operator, and the mode that decided it.

    Separate from eligibility on purpose. A shadow-mode prediction is fully
    eligible — it runs, it is persisted, engineering compares it against what
    actually happened — it simply does not alarm anybody. Collapsing the two
    would mean shadow mode produced no data, which defeats the point of it.
    """
    if settings.ml_mode == "production":
        return True, "production"
    if settings.ml_mode == "canary":
        allowed = settings.surfaces_for(machine_id, fault_id)
        return allowed, "canary"
    if settings.ml_mode == "shadow":
        return False, "shadow"
    return False, "disabled"
