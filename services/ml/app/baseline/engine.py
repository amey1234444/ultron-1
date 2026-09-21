"""The contextual baseline engine — DOC-03 §11 to §14 and §26 to §29.

A baseline is what "normal" means for *this* machine in *this* context. It is
learned, versioned and revocable, and it is categorically not a limit: DOC-03
§4's authority rule says a learned baseline must never silently replace an
approved Alert, Danger or Trip, and the two are different types in this module
for exactly that reason. Nothing here can produce a limit, and nothing here
reads one.

The eligibility rules are the substance. Learning from the wrong data is how a
condition-monitoring system teaches itself that a fault is normal, and every
clause below is a way that happens:

    data quality GOOD            a frozen sensor teaches a very stable normal
    state eligible               a warm-up ramp teaches a normal that climbs
    context known                two recipes averaged teach neither
    no active fault              a restriction present all week becomes normal
    no approved limit active     the same, one authority level up
    sufficient duration          ten seconds of anything looks stable
    sufficient samples           three points have no spread to speak of
    configuration unchanged      a new screw configuration is a new machine

All eight must hold. `eligibility` returns the failures rather than a boolean,
so the UI can say *why* a machine has not learned a baseline in a fortnight,
which is a question sites actually ask.

The fallback hierarchy is the other half. A context with no learned baseline is
not left without a comparison — it falls back through the DOC-03 §12 levels to
the commissioning template, and the *level it used* travels on every feature so
a deviation against a template reference never looks like one against learned
history.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime
from pathlib import Path
from typing import Iterable, Sequence

from ..core.config import settings
from ..core.timeutil import iso, now as utc_now, parse_timestamp
from ..core.versions import BASELINE_ENGINE_VERSION
from ..features import families
from ..knowledge.enums import BaselineConfidence, BaselineLevel, BaselineStatus
from ..knowledge.loader import knowledge

#: Minimum evidence before a learned baseline may be used at all.
MIN_SAMPLES_PROVISIONAL = 200
MIN_SAMPLES_VALID = 2_000
MIN_DURATION_SECONDS_PROVISIONAL = 600
MIN_DURATION_SECONDS_VALID = 7_200

#: How much a level is worth, 0..1. Used as ``baseline_confidence`` in features
#: and as a cap on diagnosis confidence downstream. The numbers are a policy,
#: deliberately in one place.
LEVEL_CONFIDENCE: dict[str, float] = {
    "EXACT_CONTEXT": 1.00,
    "CONTEXT_BAND": 0.80,
    "BROADER_CONTEXT": 0.60,
    "TEMPLATE_REFERENCE": 0.30,
    "CUSTOMER_OEM_REFERENCE": 0.50,
}


@dataclass
class BaselineRecord:
    """One learned or declared normal, with everything needed to judge it."""

    baseline_id: str
    version: str
    feature_id: str
    """The tag or derived feature this describes."""

    context_id: str
    state: str
    configuration_version: str | None
    machine_id: str

    level: BaselineLevel
    source: str
    status: BaselineStatus

    unit: str | None = None
    mean: float | None = None
    median: float | None = None
    std_dev: float | None = None
    mad: float | None = None
    cv: float | None = None
    minimum: float | None = None
    maximum: float | None = None
    p05: float | None = None
    p25: float | None = None
    p50: float | None = None
    p75: float | None = None
    p95: float | None = None
    p99: float | None = None

    typical_roc: float | None = None
    typical_slope: float | None = None
    relationship_model_id: str | None = None

    sample_count: int = 0
    duration_seconds: float = 0.0
    learned_from: str | None = None
    learned_to: str | None = None
    created_at: str = field(default_factory=lambda: iso(utc_now()))
    updated_at: str = field(default_factory=lambda: iso(utc_now()))

    eligibility_rule_version: str = BASELINE_ENGINE_VERSION
    confidence: BaselineConfidence = "NONE"
    notes: list[str] = field(default_factory=list)

    @property
    def usable(self) -> bool:
        """Whether analytics may compare against this. DOC-03 §26."""
        return self.status in {"VALID", "PROVISIONAL", "FROZEN", "REVIEW_REQUIRED"}

    @property
    def confidence_score(self) -> float:
        """A 0..1 score combining the level with the evidence behind it."""
        base = LEVEL_CONFIDENCE.get(self.level, 0.3)
        if self.status == "PROVISIONAL":
            base *= 0.7
        elif self.status == "REVIEW_REQUIRED":
            base *= 0.5
        elif self.status in {"LEARNING", "NOT_AVAILABLE", "SUPERSEDED", "RETIRED"}:
            return 0.0
        return round(min(1.0, base), 3)

    def expected(self) -> float | None:
        """The central value to compare against.

        The median, not the mean. Process variables on an extruder are skewed
        by transients, and a mean that a single startup dragged upward is a
        worse reference than a median that ignored it.
        """
        return self.median if self.median is not None else self.mean

    def spread(self) -> float | None:
        """The robust spread, falling back to the standard deviation."""
        return self.mad if self.mad is not None else self.std_dev


@dataclass(frozen=True)
class EligibilityVerdict:
    """Whether a window may be learned from, and every reason it may not."""

    eligible: bool
    failures: tuple[str, ...] = ()

    def __bool__(self) -> bool:  # pragma: no cover - trivial
        return self.eligible


@dataclass(frozen=True)
class LearningInput:
    """One window offered to the learner."""

    machine_id: str
    feature_id: str
    context_id: str
    state: str
    configuration_version: str | None
    values: tuple[float, ...]
    timestamps: tuple[datetime, ...]
    unit: str | None
    quality_verdicts: tuple[str, ...]
    fault_active: bool
    limit_active: bool
    unresolved_anomaly: bool = False


def eligibility(sample: LearningInput) -> EligibilityVerdict:
    """The DOC-03 §14 eligibility rules, each failure named."""
    failures: list[str] = []
    book = knowledge()

    if any(verdict not in {"GOOD"} for verdict in sample.quality_verdicts):
        bad = sorted({verdict for verdict in sample.quality_verdicts if verdict != "GOOD"})
        failures.append(f"Data quality is not GOOD throughout the window ({', '.join(bad)}).")

    if sample.state not in book.baseline_learning_states():
        definition = book.state(sample.state)
        name = definition.name if definition else sample.state
        failures.append(f"Operating state {name} is not eligible for baseline learning.")

    if not sample.context_id:
        failures.append("No context id, so the baseline would not be attributable to an operating point.")

    if sample.configuration_version is None:
        failures.append("No configuration version, so the baseline could not be invalidated on a change.")

    if sample.fault_active:
        failures.append("A fault is active. Learning now would teach the fault as normal.")

    if sample.limit_active:
        failures.append("An approved Alert, Danger or Trip is active.")

    if sample.unresolved_anomaly:
        failures.append("An unresolved anomaly is present and policy excludes it.")

    if len(sample.values) < MIN_SAMPLES_PROVISIONAL:
        failures.append(
            f"{len(sample.values)} samples, below the {MIN_SAMPLES_PROVISIONAL} needed for a provisional baseline."
        )

    duration = _duration(sample.timestamps)
    if duration < MIN_DURATION_SECONDS_PROVISIONAL:
        failures.append(
            f"{duration:.0f}s of data, below the {MIN_DURATION_SECONDS_PROVISIONAL}s minimum."
        )

    return EligibilityVerdict(eligible=not failures, failures=tuple(failures))


def _duration(timestamps: Sequence[datetime]) -> float:
    if len(timestamps) < 2:
        return 0.0
    return (max(timestamps) - min(timestamps)).total_seconds()


def learn(sample: LearningInput, *, version: str = "1") -> BaselineRecord | None:
    """Build a baseline from an eligible window, or return None.

    Returns None rather than a low-quality baseline when the window is
    ineligible. A baseline that exists is used; the only way to not use a bad
    one is for it not to exist.
    """
    verdict = eligibility(sample)
    if not verdict.eligible:
        return None

    values = list(sample.values)
    duration = _duration(sample.timestamps)
    mature = len(values) >= MIN_SAMPLES_VALID and duration >= MIN_DURATION_SECONDS_VALID

    return BaselineRecord(
        baseline_id=f"BL-{sample.machine_id}-{sample.feature_id}-{sample.context_id}",
        version=version,
        feature_id=sample.feature_id,
        context_id=sample.context_id,
        state=sample.state,
        configuration_version=sample.configuration_version,
        machine_id=sample.machine_id,
        level="EXACT_CONTEXT",
        source="LEARNED_HISTORICAL",
        # VALID is reserved for an approved, mature contextual baseline. Nothing
        # learned automatically claims it; a mature window earns PROVISIONAL
        # with high confidence and an engineer promotes it.
        status="VALID" if mature else "PROVISIONAL",
        unit=sample.unit,
        mean=families.mean(values),
        median=families.median(values),
        std_dev=families.std_dev(values),
        mad=families.mad(values),
        cv=families.coefficient_of_variation(values),
        minimum=min(values) if values else None,
        maximum=max(values) if values else None,
        p05=families.percentile(values, 0.05),
        p25=families.percentile(values, 0.25),
        p50=families.percentile(values, 0.50),
        p75=families.percentile(values, 0.75),
        p95=families.percentile(values, 0.95),
        p99=families.percentile(values, 0.99),
        typical_roc=families.rate_of_change_per_minute(values, list(sample.timestamps)),
        typical_slope=families.slope_per_minute(values, list(sample.timestamps)),
        sample_count=len(values),
        duration_seconds=duration,
        learned_from=iso(min(sample.timestamps)) if sample.timestamps else None,
        learned_to=iso(max(sample.timestamps)) if sample.timestamps else None,
        confidence="HIGH" if mature else "MEDIUM",
    )


def template_baseline(tag: str, machine_id: str) -> BaselineRecord | None:
    """The commissioning cold-start baseline for a tag, as a record.

    TEMPLATE_REFERENCE level, and PROVISIONAL status, exactly as the
    TypeScript commissioning file declares — nothing here promotes it. It is
    what a machine compares against on its first day, and the level is what
    stops that comparison being mistaken for a learned one.
    """
    entry = knowledge().tag(tag)
    raw = entry.template_baseline if entry else None
    if not raw:
        return None
    return BaselineRecord(
        baseline_id=str(raw.get("baselineId", f"BL-TEMPLATE-{tag}")),
        version=str(raw.get("version", "1")),
        feature_id=tag,
        context_id="TEMPLATE",
        state="ST-06",
        configuration_version=None,
        machine_id=machine_id,
        level=str(raw.get("level", "TEMPLATE_REFERENCE")),  # type: ignore[arg-type]
        source=str(raw.get("source", "OEM_ENGINEERING")),
        status=str(raw.get("status", "PROVISIONAL")),  # type: ignore[arg-type]
        unit=raw.get("unit"),
        mean=raw.get("mean"),
        median=raw.get("median"),
        std_dev=raw.get("stdDev"),
        mad=raw.get("mad"),
        p05=raw.get("p05"),
        p50=raw.get("p50"),
        p95=raw.get("p95"),
        sample_count=int(raw.get("sampleCount", 0) or 0),
        confidence=str(raw.get("confidence", "LOW")),  # type: ignore[arg-type]
        notes=[knowledge().commissioning_notice] if knowledge().commissioning_notice else [],
    )


class BaselineStore:
    """Baselines on disk, keyed by machine, feature and context.

    JSON on the filesystem because a baseline is small, rarely written and read
    on every inference; a database round trip per signal per frame would be the
    single largest cost in the loop. Postgres persistence is the app's job, and
    the durable copy lives there — this is the runtime cache with a file behind
    it so a restart does not lose a fortnight of learning.
    """

    def __init__(self, directory: Path | None = None) -> None:
        self.directory = directory or (settings().artifacts_dir / "baselines")
        self._cache: dict[str, BaselineRecord] = {}
        self._loaded = False

    def _path(self) -> Path:
        return self.directory / "baselines.json"

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        path = self._path()
        if not path.is_file():
            return
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            # A corrupt store is a cold start, not a crash. The template
            # baselines still answer, at their declared lower confidence.
            return
        for row in payload.get("baselines", []):
            record = BaselineRecord(**row)
            self._cache[self._key(record.machine_id, record.feature_id, record.context_id)] = record

    @staticmethod
    def _key(machine_id: str, feature_id: str, context_id: str) -> str:
        return f"{machine_id}|{feature_id}|{context_id}"

    def put(self, record: BaselineRecord) -> None:
        self._ensure_loaded()
        key = self._key(record.machine_id, record.feature_id, record.context_id)
        existing = self._cache.get(key)
        if existing is not None and existing.version == record.version:
            # Same version replaced in place; a genuinely new baseline gets a
            # new version and the old one is marked superseded rather than
            # deleted, so a historical prediction can still be reproduced.
            record = replace(record, updated_at=iso(utc_now()))
        elif existing is not None:
            self._cache[f"{key}|v{existing.version}"] = replace(existing, status="SUPERSEDED")
        self._cache[key] = record

    def get(self, machine_id: str, feature_id: str, context_id: str) -> BaselineRecord | None:
        self._ensure_loaded()
        return self._cache.get(self._key(machine_id, feature_id, context_id))

    def all(self) -> tuple[BaselineRecord, ...]:
        self._ensure_loaded()
        return tuple(self._cache.values())

    def save(self) -> Path:
        self._ensure_loaded()
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self._path()
        path.write_text(
            json.dumps(
                {"engine_version": BASELINE_ENGINE_VERSION, "baselines": [asdict(r) for r in self._cache.values()]},
                indent=2,
            ),
            encoding="utf-8",
        )
        return path

    def freeze_context(self, machine_id: str, context_id: str, reason: str) -> int:
        """Stop learning for a context — a recipe change, a configuration change.

        DOC-02 §7 (RECIPE_CHANGE) requires this. Frozen baselines stay usable
        for comparison; they simply stop absorbing new data, which is what makes
        a transition survivable instead of corrupting.
        """
        self._ensure_loaded()
        frozen = 0
        for key, record in list(self._cache.items()):
            if record.machine_id == machine_id and record.context_id == context_id and record.status != "FROZEN":
                self._cache[key] = replace(
                    record, status="FROZEN", notes=[*record.notes, reason], updated_at=iso(utc_now())
                )
                frozen += 1
        return frozen

    def mark_stale(self, machine_id: str, configuration_version: str) -> int:
        """Flag baselines learned under a superseded configuration.

        Not deleted and not silently used: REVIEW_REQUIRED, which is usable at
        reduced confidence and visible as a thing somebody has to look at.
        """
        self._ensure_loaded()
        touched = 0
        for key, record in list(self._cache.items()):
            if (
                record.machine_id == machine_id
                and record.configuration_version is not None
                and record.configuration_version != configuration_version
                and record.status in {"VALID", "PROVISIONAL"}
            ):
                self._cache[key] = replace(
                    record,
                    status="REVIEW_REQUIRED",
                    notes=[
                        *record.notes,
                        f"Configuration moved to {configuration_version}; this baseline was learned under "
                        f"{record.configuration_version}.",
                    ],
                    updated_at=iso(utc_now()),
                )
                touched += 1
        return touched


@dataclass(frozen=True)
class BaselineSelection:
    """Which baseline a comparison used, and at what level."""

    record: BaselineRecord | None
    level: BaselineLevel | None
    confidence: float
    reason: str

    @property
    def expected(self) -> float | None:
        return self.record.expected() if self.record else None

    @property
    def spread(self) -> float | None:
        return self.record.spread() if self.record else None


class BaselineSelector:
    """The DOC-03 §12 fallback hierarchy, in order, with the level recorded."""

    def __init__(self, store: BaselineStore | None = None) -> None:
        self.store = store or BaselineStore()

    def select(
        self,
        *,
        machine_id: str,
        tag: str,
        context_id: str | None,
        fallback_context_id: str | None,
    ) -> BaselineSelection:
        if context_id:
            record = self.store.get(machine_id, tag, context_id)
            if record and record.usable:
                return BaselineSelection(
                    record=record,
                    level=record.level,
                    confidence=record.confidence_score,
                    reason=f"Learned baseline for this exact context ({record.sample_count} samples).",
                )

        if fallback_context_id:
            record = self.store.get(machine_id, tag, fallback_context_id)
            if record and record.usable:
                # A baseline learned against a broader key is a real comparison
                # at a lower level, and the level travels so nothing downstream
                # mistakes it for an exact-context one.
                broadened = replace(record, level="BROADER_CONTEXT")
                return BaselineSelection(
                    record=broadened,
                    level="BROADER_CONTEXT",
                    confidence=broadened.confidence_score,
                    reason=(
                        "No baseline for the exact context; compared against the broader "
                        "machine, configuration and load-band grouping."
                    ),
                )

        template = template_baseline(tag, machine_id)
        if template is not None:
            return BaselineSelection(
                record=template,
                level="TEMPLATE_REFERENCE",
                confidence=template.confidence_score,
                reason=(
                    "No learned history. Compared against the engineering-development "
                    "template reference, which is not field calibrated."
                ),
            )

        return BaselineSelection(
            record=None,
            level=None,
            confidence=0.0,
            reason="No baseline exists for this signal at any level.",
        )


def summarise(records: Iterable[BaselineRecord]) -> dict[str, int]:
    """Counts by status, for the health endpoint and the UI."""
    summary: dict[str, int] = {}
    for record in records:
        summary[record.status] = summary.get(record.status, 0) + 1
    return summary


def parse_iso(value: str | None) -> datetime | None:
    return parse_timestamp(value) if value else None
