"""The feature registry — every feature this service can compute, declared.

A model trained on "column 47" cannot be audited, retrained against a changed
pipeline, or explained to an engineer. So no feature exists here without a
stable id, a human name, its inputs, the DOC-03 formula it implements, a unit
and a version. SHAP output is rendered from this registry, which is why a
contribution can say *"melt pressure slope over 2 minutes, 3.1 MPa/min"*
rather than *"f_312 = 3.1"*.

The registry is generated rather than typed out: families crossed with tags
crossed with windows produce a few hundred features, and hand-writing them
would guarantee drift between the definition and the computation. The
generators are explicit about which combinations are physical — a coefficient
of variation is only declared where the signal cannot cross zero, a gearbox
ratio feature only where the ratio is known.

``FEATURE_SET_VERSION`` in ``core.versions`` covers the whole registry. A model
records the version it saw, and the eligibility gate refuses a model whose
recorded feature set no longer matches, because silently feeding a reordered
vector to a trained tree is the failure that produces confident nonsense.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from ..knowledge.loader import knowledge

FeatureFamily = Literal[
    "RAW",
    "ROLLING_LOCATION",
    "ROLLING_DISPERSION",
    "TREND",
    "EXTREME",
    "PERSISTENCE",
    "SETPOINT",
    "BASELINE",
    "THRESHOLD",
    "CROSS_SIGNAL",
    "THERMAL",
    "LOAD",
    "SPEED",
    "RESIDUAL",
    "EMBEDDING",
    "CONTEXT",
    "QUALITY",
]

#: Rolling windows, in seconds. Four scales because the fault signatures this
#: machine produces live at different ones: a pressure spike is seconds, a
#: screen loading up is minutes, a thermal drift is tens of minutes.
WINDOWS: tuple[int, ...] = (30, 120, 300, 600)

#: Windows used for the expensive families, where four scales would triple the
#: feature count for very little extra signal.
TREND_WINDOWS: tuple[int, ...] = (120, 600)


@dataclass(frozen=True)
class FeatureDefinition:
    """One computable feature, fully described."""

    feature_id: str
    name: str
    family: FeatureFamily
    inputs: tuple[str, ...]
    unit: str
    formula_ids: tuple[str, ...]
    """DOC-03 formula ids this implements. Empty for ML-native features, which
    say so rather than citing a formula that does not cover them."""

    window_seconds: int | None = None
    version: str = "1.0"
    description: str = ""
    requires_quality: tuple[str, ...] = ()
    """Tags whose quality must be usable. Empty means the inputs themselves."""

    @property
    def quality_inputs(self) -> tuple[str, ...]:
        return self.requires_quality or self.inputs


def _unit_for(tag: str) -> str:
    entry = knowledge().tag(tag)
    return (entry.canonical_unit if entry else None) or "unknown"


def _label_for(tag: str) -> str:
    entry = knowledge().tag(tag)
    return entry.label if entry else tag


#: Tags whose values cannot legitimately cross zero, so a CV is meaningful.
_RATIO_SCALE_FAMILIES = {"PRES", "PWR", "FEED", "RPM", "VIB", "VAC", "LVL"}

#: Cross-signal relationships that are physically meaningful on this machine.
#: Each is a ratio whose *stability* carries information the two signals do not
#: carry separately: specific load drifting with feed and rpm unchanged is a
#: material or restriction story that neither current nor speed tells alone.
CROSS_SIGNAL_PAIRS: tuple[tuple[str, str, str, str], ...] = (
    ("TS-P3", "TS-F1", "pressure_per_feed", "Melt pressure per unit feed"),
    ("TS-PM1", "TS-S1", "load_per_rpm", "Drive load per screw rpm"),
    ("TS-P3", "TS-PM1", "pressure_per_load", "Melt pressure per unit drive load"),
    ("TS-P3", "TS-S1", "pressure_per_rpm", "Melt pressure per screw rpm"),
    ("TS-F1", "TS-S1", "feed_per_rpm", "Feed rate per screw rpm — specific throughput"),
    ("TS-V3", "TS-S1", "vibration_per_rpm", "Gearbox vibration per screw rpm"),
    ("TS-PM1", "TS-F1", "specific_energy", "Drive load per unit throughput"),
)

#: Adjacent barrel zones, for the thermal gradient family. Zone pairs only —
#: a gradient between non-adjacent zones describes nothing physical.
ZONE_SEQUENCE: tuple[str, ...] = tuple(f"TS-TZ{index}" for index in range(1, 10))

#: Tags a setpoint is plausibly published for. The machine currently publishes
#: none, so every one of these yields a gap rather than a number — which is the
#: honest output and is why the integration gap shows up in the UI.
SETPOINT_TAGS: tuple[str, ...] = ("TS-F1", "TS-S1", "TS-F2", *ZONE_SEQUENCE)


def _analysed_tags() -> tuple[str, ...]:
    """Tags worth building a full feature stack on.

    Every tag with a cold-start baseline, which is the same set DOC-04's fault
    rules actually read. A feature stack on a tag nothing diagnoses from would
    triple the vector width and improve no conclusion.
    """
    return tuple(
        entry.tag
        for entry in knowledge().tags
        if entry.template_baseline is not None
    )


def _unique(tags: tuple[str, ...]) -> tuple[str, ...]:
    seen: list[str] = []
    for tag in tags:
        if tag not in seen:
            seen.append(tag)
    return tuple(seen)


@lru_cache(maxsize=1)
def feature_definitions() -> tuple[FeatureDefinition, ...]:
    """Every declared feature, in a stable order.

    Order is part of the contract: a trained tree indexes into this vector, and
    a reordering that kept every id would still invalidate every model. The
    order is generation order, which is deterministic given the knowledge
    snapshot, and the snapshot is hash-pinned.
    """
    book = knowledge()
    tags = _unique(_analysed_tags())
    out: list[FeatureDefinition] = []

    def add(definition: FeatureDefinition) -> None:
        out.append(definition)

    # --- RAW ---------------------------------------------------------------
    for tag in tags:
        add(
            FeatureDefinition(
                feature_id=f"{tag}.value",
                name=f"{_label_for(tag)} — current value",
                family="RAW",
                inputs=(tag,),
                unit=_unit_for(tag),
                formula_ids=(),
                description="The validated reading, in the tag's canonical unit.",
            )
        )

    # --- ROLLING LOCATION and DISPERSION -----------------------------------
    for tag in tags:
        family = book.tag(tag).doc07_parameter_family if book.tag(tag) else None
        unit = _unit_for(tag)
        for seconds in WINDOWS:
            add(
                FeatureDefinition(
                    feature_id=f"{tag}.mean_{seconds}s",
                    name=f"{_label_for(tag)} — mean over {seconds}s",
                    family="ROLLING_LOCATION",
                    inputs=(tag,),
                    unit=unit,
                    formula_ids=("F-COM-001",),
                    window_seconds=seconds,
                )
            )
            add(
                FeatureDefinition(
                    feature_id=f"{tag}.median_{seconds}s",
                    name=f"{_label_for(tag)} — median over {seconds}s",
                    family="ROLLING_LOCATION",
                    inputs=(tag,),
                    unit=unit,
                    formula_ids=("F-COM-002",),
                    window_seconds=seconds,
                )
            )
            add(
                FeatureDefinition(
                    feature_id=f"{tag}.std_{seconds}s",
                    name=f"{_label_for(tag)} — standard deviation over {seconds}s",
                    family="ROLLING_DISPERSION",
                    inputs=(tag,),
                    unit=unit,
                    formula_ids=("F-COM-003",),
                    window_seconds=seconds,
                )
            )
            add(
                FeatureDefinition(
                    feature_id=f"{tag}.mad_{seconds}s",
                    name=f"{_label_for(tag)} — median absolute deviation over {seconds}s",
                    family="ROLLING_DISPERSION",
                    inputs=(tag,),
                    unit=unit,
                    formula_ids=("F-COM-005",),
                    window_seconds=seconds,
                )
            )
            add(
                FeatureDefinition(
                    feature_id=f"{tag}.range_{seconds}s",
                    name=f"{_label_for(tag)} — range over {seconds}s",
                    family="ROLLING_DISPERSION",
                    inputs=(tag,),
                    unit=unit,
                    formula_ids=("F-COM-004",),
                    window_seconds=seconds,
                )
            )
            if family in _RATIO_SCALE_FAMILIES:
                add(
                    FeatureDefinition(
                        feature_id=f"{tag}.cv_{seconds}s",
                        name=f"{_label_for(tag)} — coefficient of variation over {seconds}s",
                        family="ROLLING_DISPERSION",
                        inputs=(tag,),
                        unit="ratio",
                        formula_ids=("F-COM-006",),
                        window_seconds=seconds,
                        description=(
                            "Declared only for quantities on a ratio scale. A CV on a "
                            "signal that crosses zero is not a variability measure."
                        ),
                    )
                )

    # --- TREND -------------------------------------------------------------
    for tag in tags:
        unit = _unit_for(tag)
        for seconds in TREND_WINDOWS:
            add(
                FeatureDefinition(
                    feature_id=f"{tag}.slope_{seconds}s",
                    name=f"{_label_for(tag)} — slope over {seconds}s",
                    family="TREND",
                    inputs=(tag,),
                    unit=f"{unit}/min",
                    formula_ids=("F-COM-012",),
                    window_seconds=seconds,
                )
            )
            add(
                FeatureDefinition(
                    feature_id=f"{tag}.ewma_slope_{seconds}s",
                    name=f"{_label_for(tag)} — smoothed slope over {seconds}s",
                    family="TREND",
                    inputs=(tag,),
                    unit=f"{unit}/min",
                    formula_ids=("F-COM-013",),
                    window_seconds=seconds,
                )
            )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.roc",
                name=f"{_label_for(tag)} — rate of change",
                family="TREND",
                inputs=(tag,),
                unit=f"{unit}/min",
                formula_ids=("F-COM-011",),
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.ewma_120s",
                name=f"{_label_for(tag)} — exponentially weighted mean over 120s",
                family="ROLLING_LOCATION",
                inputs=(tag,),
                unit=unit,
                formula_ids=("F-COM-013",),
                window_seconds=120,
            )
        )

    # --- EXTREMES ----------------------------------------------------------
    for tag in tags:
        unit = _unit_for(tag)
        add(
            FeatureDefinition(
                feature_id=f"{tag}.min_600s",
                name=f"{_label_for(tag)} — minimum over 600s",
                family="EXTREME",
                inputs=(tag,),
                unit=unit,
                formula_ids=(),
                window_seconds=600,
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.max_600s",
                name=f"{_label_for(tag)} — maximum over 600s",
                family="EXTREME",
                inputs=(tag,),
                unit=unit,
                formula_ids=(),
                window_seconds=600,
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.seconds_since_max_600s",
                name=f"{_label_for(tag)} — time since maximum",
                family="EXTREME",
                inputs=(tag,),
                unit="s",
                formula_ids=(),
                window_seconds=600,
                description="Separates still-climbing from peaked-and-holding.",
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.seconds_since_min_600s",
                name=f"{_label_for(tag)} — time since minimum",
                family="EXTREME",
                inputs=(tag,),
                unit="s",
                formula_ids=(),
                window_seconds=600,
            )
        )

    # --- BASELINE DEVIATION ------------------------------------------------
    for tag in tags:
        unit = _unit_for(tag)
        add(
            FeatureDefinition(
                feature_id=f"{tag}.baseline_abs_dev",
                name=f"{_label_for(tag)} — deviation from expected",
                family="BASELINE",
                inputs=(tag,),
                unit=unit,
                formula_ids=("F-COM-008",),
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.baseline_pct_dev",
                name=f"{_label_for(tag)} — percent deviation from expected",
                family="BASELINE",
                inputs=(tag,),
                unit="%",
                formula_ids=("F-COM-009",),
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.baseline_z",
                name=f"{_label_for(tag)} — z-score against baseline",
                family="BASELINE",
                inputs=(tag,),
                unit="sigma",
                formula_ids=("F-COM-010",),
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.baseline_robust_z",
                name=f"{_label_for(tag)} — robust score against baseline",
                family="BASELINE",
                inputs=(tag,),
                unit="sigma",
                formula_ids=("F-COM-010",),
                description="Median/MAD based. Preferred where the distribution is skewed.",
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.baseline_percentile",
                name=f"{_label_for(tag)} — percentile position in baseline",
                family="BASELINE",
                inputs=(tag,),
                unit="fraction",
                formula_ids=(),
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.baseline_confidence",
                name=f"{_label_for(tag)} — baseline confidence",
                family="BASELINE",
                inputs=(tag,),
                unit="fraction",
                formula_ids=(),
                description=(
                    "How much the comparison is worth. A deviation against a "
                    "TEMPLATE_REFERENCE baseline is a far weaker claim than the same "
                    "deviation against a learned one, and the model is given the "
                    "difference rather than being left to assume."
                ),
            )
        )

    # --- PERSISTENCE -------------------------------------------------------
    for tag in tags:
        add(
            FeatureDefinition(
                feature_id=f"{tag}.abnormal_seconds",
                name=f"{_label_for(tag)} — seconds continuously abnormal",
                family="PERSISTENCE",
                inputs=(tag,),
                unit="s",
                formula_ids=("F-COM-017",),
                window_seconds=600,
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.abnormal_fraction_600s",
                name=f"{_label_for(tag)} — fraction of 600s abnormal",
                family="PERSISTENCE",
                inputs=(tag,),
                unit="fraction",
                formula_ids=("F-COM-017",),
                window_seconds=600,
            )
        )

    # --- THRESHOLD DISTANCE ------------------------------------------------
    for tag in tags:
        unit = _unit_for(tag)
        for boundary in ("normal", "alert", "danger"):
            add(
                FeatureDefinition(
                    feature_id=f"{tag}.distance_to_{boundary}",
                    name=f"{_label_for(tag)} — distance to {boundary} boundary",
                    family="THRESHOLD",
                    inputs=(tag,),
                    unit=unit,
                    formula_ids=(),
                    description=(
                        "Approved limits only. Null where the site has declared none, "
                        "which is the honest answer and not a zero."
                    ),
                )
            )
            add(
                FeatureDefinition(
                    feature_id=f"{tag}.normalised_distance_to_{boundary}",
                    name=f"{_label_for(tag)} — normalised distance to {boundary}",
                    family="THRESHOLD",
                    inputs=(tag,),
                    unit="fraction",
                    formula_ids=(),
                )
            )

    # --- SETPOINT ----------------------------------------------------------
    for tag in SETPOINT_TAGS:
        if tag not in tags:
            continue
        add(
            FeatureDefinition(
                feature_id=f"{tag}.setpoint_error",
                name=f"{_label_for(tag)} — actual minus setpoint",
                family="SETPOINT",
                inputs=(tag,),
                unit=_unit_for(tag),
                formula_ids=("F-COM-014",),
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"{tag}.setpoint_error_normalised",
                name=f"{_label_for(tag)} — normalised setpoint error",
                family="SETPOINT",
                inputs=(tag,),
                unit="fraction",
                formula_ids=("F-COM-014",),
            )
        )

    # --- CROSS-SIGNAL ------------------------------------------------------
    known = set(tags)
    for numerator, denominator, name, description in CROSS_SIGNAL_PAIRS:
        if numerator not in known or denominator not in known:
            continue
        add(
            FeatureDefinition(
                feature_id=f"x.{name}",
                name=description,
                family="CROSS_SIGNAL",
                inputs=(numerator, denominator),
                unit=f"{_unit_for(numerator)}/{_unit_for(denominator)}",
                formula_ids=("F-TSE-001",),
                description=description,
            )
        )
        add(
            FeatureDefinition(
                feature_id=f"x.{name}.slope_300s",
                name=f"{description} — slope over 300s",
                family="CROSS_SIGNAL",
                inputs=(numerator, denominator),
                unit="ratio/min",
                formula_ids=("F-COM-012",),
                window_seconds=300,
                description=(
                    "The ratio drifting is the signal. A restriction moves pressure per "
                    "unit feed long before it moves pressure past any limit."
                ),
            )
        )

    # --- THERMAL -----------------------------------------------------------
    zones = [tag for tag in ZONE_SEQUENCE if tag in known]
    for earlier, later in zip(zones, zones[1:]):
        add(
            FeatureDefinition(
                feature_id=f"t.gradient_{earlier}_{later}",
                name=f"Barrel gradient {_label_for(earlier)} to {_label_for(later)}",
                family="THERMAL",
                inputs=(earlier, later),
                unit="degC",
                formula_ids=("F-TSE-006",),
            )
        )
    if "TS-TM" in known and zones:
        add(
            FeatureDefinition(
                feature_id="t.melt_minus_last_zone",
                name="Melt temperature above the final barrel zone",
                family="THERMAL",
                inputs=("TS-TM", zones[-1]),
                unit="degC",
                formula_ids=("F-TSE-007",),
                description=(
                    "Shear heating shows here before it shows anywhere else: melt above "
                    "the barrel means the material is being worked, not heated."
                ),
            )
        )
    if zones:
        add(
            FeatureDefinition(
                feature_id="t.zone_profile_spread",
                name="Spread across the barrel temperature profile",
                family="THERMAL",
                inputs=tuple(zones),
                unit="degC",
                formula_ids=(),
            )
        )

    # --- LOAD and SPEED ----------------------------------------------------
    if "TS-PM1" in known and "TS-S1" in known:
        add(
            FeatureDefinition(
                feature_id="l.load_proxy",
                name="Load proxy — drive load per screw rpm",
                family="LOAD",
                inputs=("TS-PM1", "TS-S1"),
                unit="kW/rpm",
                formula_ids=("F-TSE-003",),
            )
        )
    if "TS-S1" in known and "TS-S2" in known:
        add(
            FeatureDefinition(
                feature_id="s.screw_speed_mismatch",
                name="Difference between the two screw shaft speeds",
                family="SPEED",
                inputs=("TS-S1", "TS-S2"),
                unit="rpm",
                formula_ids=(),
                description=(
                    "The shafts are geared together, so a real difference is a "
                    "measurement fault long before it is a gear-train failure."
                ),
            )
        )
    if "TS-E1" in known and "TS-S1" in known:
        add(
            FeatureDefinition(
                feature_id="s.gear_ratio_observed",
                name="Observed motor-to-screw speed ratio",
                family="SPEED",
                inputs=("TS-E1", "TS-S1"),
                unit="ratio",
                formula_ids=(),
                description=(
                    "The expected ratio is an OEM gearbox fact this deployment does not "
                    "have, so the observed ratio is reported and no error against a "
                    "made-up nominal is computed."
                ),
            )
        )

    # --- QUALITY and CONTEXT ----------------------------------------------
    add(
        FeatureDefinition(
            feature_id="q.good_fraction",
            name="Fraction of expected signals judged GOOD",
            family="QUALITY",
            inputs=(),
            unit="fraction",
            formula_ids=(),
            description=(
                "A model that cannot see the data quality will learn the artefacts of "
                "bad data as if they were machine behaviour."
            ),
        )
    )
    add(
        FeatureDefinition(
            feature_id="q.bad_or_missing_count",
            name="Count of BAD or MISSING signals",
            family="QUALITY",
            inputs=(),
            unit="count",
            formula_ids=(),
        )
    )
    add(
        FeatureDefinition(
            feature_id="q.mandatory_unavailable",
            name="Count of unusable mandatory signals",
            family="QUALITY",
            inputs=(),
            unit="count",
            formula_ids=(),
        )
    )
    add(
        FeatureDefinition(
            feature_id="c.state_confidence",
            name="Operating state confidence",
            family="CONTEXT",
            inputs=(),
            unit="fraction",
            formula_ids=(),
        )
    )
    add(
        FeatureDefinition(
            feature_id="c.context_confidence",
            name="Context confidence",
            family="CONTEXT",
            inputs=(),
            unit="fraction",
            formula_ids=(),
        )
    )
    add(
        FeatureDefinition(
            feature_id="c.time_in_state",
            name="Seconds in the current operating state",
            family="CONTEXT",
            inputs=(),
            unit="s",
            formula_ids=(),
        )
    )
    for state_id in ("ST-01", "ST-02", "ST-04", "ST-05", "ST-06", "ST-07", "ST-08"):
        definition = book.state(state_id)
        add(
            FeatureDefinition(
                feature_id=f"c.state_is_{state_id.replace('-', '_').lower()}",
                name=f"Operating state is {definition.name if definition else state_id}",
                family="CONTEXT",
                inputs=(),
                unit="bool",
                formula_ids=(),
                description=(
                    "One-hot rather than an ordinal code. ST-06 is not 'more' than "
                    "ST-05, and a tree given the code would split on an order that "
                    "means nothing."
                ),
            )
        )

    return tuple(out)


def residual_feature_definitions(forecast_tags: tuple[str, ...]) -> tuple[FeatureDefinition, ...]:
    """Features derived from the temporal model, declared the same way.

    Separate from the base registry because they exist only when a temporal
    model does, and a feature vector that silently changes width depending on
    whether TensorFlow loaded is the worst possible contract. The union builder
    always emits these columns; they are simply null when no model ran.
    """
    out: list[FeatureDefinition] = []
    for tag in forecast_tags:
        unit = _unit_for(tag)
        out.append(
            FeatureDefinition(
                feature_id=f"r.{tag}.residual",
                name=f"{_label_for(tag)} — actual minus LSTM expectation",
                family="RESIDUAL",
                inputs=(tag,),
                unit=unit,
                formula_ids=(),
            )
        )
        out.append(
            FeatureDefinition(
                feature_id=f"r.{tag}.abs_residual",
                name=f"{_label_for(tag)} — absolute residual",
                family="RESIDUAL",
                inputs=(tag,),
                unit=unit,
                formula_ids=(),
            )
        )
        out.append(
            FeatureDefinition(
                feature_id=f"r.{tag}.norm_residual",
                name=f"{_label_for(tag)} — residual in training-scale units",
                family="RESIDUAL",
                inputs=(tag,),
                unit="sigma",
                formula_ids=(),
                description=(
                    "Divided by the residual scale measured on the training set, so a "
                    "residual of 3 means the same thing on pressure and on temperature."
                ),
            )
        )
        out.append(
            FeatureDefinition(
                feature_id=f"r.{tag}.residual_mean_300s",
                name=f"{_label_for(tag)} — mean residual over 300s",
                family="RESIDUAL",
                inputs=(tag,),
                unit=unit,
                formula_ids=(),
                window_seconds=300,
            )
        )
        out.append(
            FeatureDefinition(
                feature_id=f"r.{tag}.residual_slope_300s",
                name=f"{_label_for(tag)} — residual slope over 300s",
                family="RESIDUAL",
                inputs=(tag,),
                unit=f"{unit}/min",
                formula_ids=(),
                window_seconds=300,
                description=(
                    "A residual that is growing is the strongest early signal the "
                    "temporal model produces: the machine is departing from its own "
                    "recent behaviour in a consistent direction."
                ),
            )
        )
        out.append(
            FeatureDefinition(
                feature_id=f"r.{tag}.residual_persistence_300s",
                name=f"{_label_for(tag)} — seconds of continuous residual excursion",
                family="RESIDUAL",
                inputs=(tag,),
                unit="s",
                formula_ids=(),
                window_seconds=300,
            )
        )
    return tuple(out)


def embedding_feature_definitions(dimensions: int = 32) -> tuple[FeatureDefinition, ...]:
    """The LSTM's temporal embedding, as declared columns.

    Uninterpretable by construction, and declared anyway: a model is not
    allowed to consume a column that is not in the registry, including the ones
    nobody can name. SHAP will attribute to ``e.embedding_17`` and the UI will
    say "compressed temporal pattern, dimension 17", which is honest.
    """
    return tuple(
        FeatureDefinition(
            feature_id=f"e.embedding_{index:02d}",
            name=f"Temporal embedding dimension {index}",
            family="EMBEDDING",
            inputs=(),
            unit="latent",
            formula_ids=(),
            description="A learned summary of recent behaviour. Not physically interpretable.",
        )
        for index in range(dimensions)
    )


@lru_cache(maxsize=1)
def definition_index() -> dict[str, FeatureDefinition]:
    """Every declared feature by id, including residual and embedding columns."""
    index = {entry.feature_id: entry for entry in feature_definitions()}
    for entry in residual_feature_definitions(default_forecast_tags()):
        index[entry.feature_id] = entry
    for entry in embedding_feature_definitions():
        index[entry.feature_id] = entry
    return index


def default_forecast_tags() -> tuple[str, ...]:
    """Channels the temporal model forecasts, unless configuration says otherwise.

    Pressure, drive load, melt temperature and the mid-barrel zones: the
    variables whose short-term trajectory carries the process information, and
    the ones DOC-04's fault patterns are actually written against. Read from
    configuration at training time — this is the fallback, not the definition.
    """
    known = set(_analysed_tags())
    preferred = ("TS-P3", "TS-P4", "TS-PM1", "TS-TM", "TS-TZ4", "TS-TZ5", "TS-F1", "TS-S1")
    return tuple(tag for tag in preferred if tag in known)


def describe(feature_id: str) -> FeatureDefinition | None:
    return definition_index().get(feature_id)


def reset_registry_cache() -> None:
    """Rebuild the registry. Needed after the knowledge snapshot is swapped."""
    feature_definitions.cache_clear()
    definition_index.cache_clear()
