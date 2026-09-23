"""Plots, for the questions a table of numbers answers badly.

    from app.evaluation.plots import write_all
    write_all(out_dir, results)

Eight families, each chosen because it makes one specific failure visible at a
glance that a metric hides:

    prediction_distributions  a constant predictor is a single spike. This
                              project shipped one, and PR-AUC, Brier and ECE
                              all looked ordinary while it did.
    PR_curves                 with the prevalence line drawn on, so a curve
                              hugging the baseline cannot read as skill.
    ROC_curves                with the diagonal, for the same reason.
    reliability_curves        calibration against the identity line. A
                              perfectly calibrated constant sits at one point.
    training_history          loss against epoch. A best epoch of 1 means the
                              model never improved.
    event_timelines           probability against time with onset marked --
                              the only view that shows lead time honestly.
    feature_importance        top contributors, to notice when a model leans
                              on a column that should not matter.
    SHAP                      per-prediction contributions.

Matplotlib is imported lazily and the Agg backend is forced: this runs on a
training host with no display, and importing pyplot against a GUI backend is a
reliable way to hang a container.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Sequence

#: Subdirectories written under ``artifacts/plots``.
FAMILIES = (
    "prediction_distributions",
    "PR_curves",
    "ROC_curves",
    "reliability_curves",
    "training_history",
    "event_timelines",
    "feature_importance",
    "SHAP",
)


def _pyplot():
    """Matplotlib with a headless backend, or None when it is not installed.

    Plots are evidence, never a dependency of a result. A training host without
    matplotlib must still produce its metrics.
    """
    try:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        return plt
    except Exception:  # noqa: BLE001 - a missing plotting library is not a failure
        return None


def ensure_directories(root: Path) -> list[Path]:
    """Create every family directory, so an empty one is visibly empty."""
    made = []
    for family in FAMILIES:
        directory = root / family
        directory.mkdir(parents=True, exist_ok=True)
        made.append(directory)
    return made


def prediction_distribution(
    path: Path, probabilities: Sequence[float], labels: Sequence[int], title: str
) -> Path | None:
    """Score histogram, split by outcome.

    The plot that would have made the constant predictor obvious on sight: one
    bar, at the base rate, for both classes.
    """
    plt = _pyplot()
    if plt is None or not probabilities:
        return None
    positives = [p for p, y in zip(probabilities, labels) if y == 1]
    negatives = [p for p, y in zip(probabilities, labels) if y != 1]

    figure, axes = plt.subplots(figsize=(7, 4))
    bins = 20
    if negatives:
        axes.hist(negatives, bins=bins, alpha=0.6, label=f"negative (n={len(negatives)})")
    if positives:
        axes.hist(positives, bins=bins, alpha=0.6, label=f"positive (n={len(positives)})")
    spread = (max(probabilities) - min(probabilities)) if probabilities else 0.0
    axes.set_title(f"{title}\nscore spread {spread:.4f}")
    axes.set_xlabel("predicted probability")
    axes.set_ylabel("count")
    axes.legend()
    if spread < 1e-6:
        # Said on the plot, not only in a report nobody opens beside it.
        axes.text(
            0.5,
            0.5,
            "CONSTANT PREDICTOR",
            transform=axes.transAxes,
            ha="center",
            fontsize=16,
            color="crimson",
            alpha=0.7,
        )
    figure.tight_layout()
    figure.savefig(path, dpi=110)
    plt.close(figure)
    return path


def pr_curve(
    path: Path, probabilities: Sequence[float], labels: Sequence[int], title: str
) -> Path | None:
    """Precision-recall, with the random baseline drawn in."""
    plt = _pyplot()
    if plt is None or not probabilities:
        return None
    ordered = sorted(zip(probabilities, labels), key=lambda pair: -pair[0])
    total_positive = sum(1 for _, y in ordered if y == 1)
    if total_positive == 0:
        return None

    precision, recall = [], []
    seen = 0
    for index, (_score, label) in enumerate(ordered, start=1):
        if label == 1:
            seen += 1
        precision.append(seen / index)
        recall.append(seen / total_positive)

    prevalence = total_positive / len(ordered)
    figure, axes = plt.subplots(figsize=(6, 5))
    axes.plot(recall, precision, label="model")
    # The line that stops a curve near the floor reading as performance.
    axes.axhline(
        prevalence,
        linestyle="--",
        color="grey",
        label=f"random baseline = prevalence {prevalence:.3f}",
    )
    axes.set_xlabel("recall")
    axes.set_ylabel("precision")
    axes.set_ylim(0, 1.02)
    axes.set_title(title)
    axes.legend()
    figure.tight_layout()
    figure.savefig(path, dpi=110)
    plt.close(figure)
    return path


def roc_curve(
    path: Path, probabilities: Sequence[float], labels: Sequence[int], title: str
) -> Path | None:
    """ROC, with the chance diagonal."""
    plt = _pyplot()
    if plt is None or not probabilities:
        return None
    ordered = sorted(zip(probabilities, labels), key=lambda pair: -pair[0])
    positives = sum(1 for _, y in ordered if y == 1)
    negatives = len(ordered) - positives
    if positives == 0 or negatives == 0:
        return None

    tpr, fpr = [0.0], [0.0]
    true_positive = false_positive = 0
    for _score, label in ordered:
        if label == 1:
            true_positive += 1
        else:
            false_positive += 1
        tpr.append(true_positive / positives)
        fpr.append(false_positive / negatives)

    figure, axes = plt.subplots(figsize=(5.5, 5))
    axes.plot(fpr, tpr, label="model")
    axes.plot([0, 1], [0, 1], linestyle="--", color="grey", label="chance (ROC-AUC 0.50)")
    axes.set_xlabel("false positive rate")
    axes.set_ylabel("true positive rate")
    axes.set_title(title)
    axes.legend()
    figure.tight_layout()
    figure.savefig(path, dpi=110)
    plt.close(figure)
    return path


def reliability_curve(
    path: Path, probabilities: Sequence[float], labels: Sequence[int], title: str, bins: int = 10
) -> Path | None:
    """Observed frequency against predicted, with the identity line.

    A perfectly calibrated constant collapses to a single point on the
    diagonal, which is what ECE 0.405 -> 0.000 looked like and why the number
    alone was misleading.
    """
    plt = _pyplot()
    if plt is None or not probabilities:
        return None
    edges = [index / bins for index in range(bins + 1)]
    centres, observed, counts = [], [], []
    for lower, upper in zip(edges, edges[1:]):
        inside = [
            y for p, y in zip(probabilities, labels) if lower <= p < upper or (upper == 1 and p == 1)
        ]
        if not inside:
            continue
        centres.append((lower + upper) / 2)
        observed.append(sum(1 for y in inside if y == 1) / len(inside))
        counts.append(len(inside))

    figure, axes = plt.subplots(figsize=(5.5, 5))
    axes.plot([0, 1], [0, 1], linestyle="--", color="grey", label="perfectly calibrated")
    if centres:
        axes.plot(centres, observed, marker="o", label="model")
    axes.set_xlabel("predicted probability")
    axes.set_ylabel("observed frequency")
    axes.set_title(f"{title}\n{len(centres)} populated bin(s)")
    axes.legend()
    if len(centres) <= 1:
        axes.text(
            0.5,
            0.35,
            "ONE BIN — calibration says nothing\nabout discrimination here",
            transform=axes.transAxes,
            ha="center",
            fontsize=11,
            color="crimson",
        )
    figure.tight_layout()
    figure.savefig(path, dpi=110)
    plt.close(figure)
    return path


def training_history(path: Path, history: dict[str, Sequence[float]], title: str) -> Path | None:
    """Loss against epoch. A best epoch of 1 means the model never improved."""
    plt = _pyplot()
    if plt is None or not history:
        return None
    figure, axes = plt.subplots(figsize=(6.5, 4))
    for name, values in history.items():
        if values:
            axes.plot(range(1, len(values) + 1), values, marker="o", label=name)
    axes.set_xlabel("epoch")
    axes.set_ylabel("loss")
    axes.set_title(title)
    axes.legend()
    figure.tight_layout()
    figure.savefig(path, dpi=110)
    plt.close(figure)
    return path


def feature_importance(
    path: Path, contributions: Sequence[tuple[str, float]], title: str, top: int = 20
) -> Path | None:
    """The strongest contributors, largest magnitude first."""
    plt = _pyplot()
    if plt is None or not contributions:
        return None
    ranked = sorted(contributions, key=lambda pair: -abs(pair[1]))[:top]
    if not ranked:
        return None
    names = [name for name, _ in reversed(ranked)]
    values = [value for _, value in reversed(ranked)]

    figure, axes = plt.subplots(figsize=(8, max(3.5, 0.32 * len(names))))
    axes.barh(names, values)
    axes.axvline(0, color="grey", linewidth=0.8)
    axes.set_xlabel("contribution")
    axes.set_title(title)
    figure.tight_layout()
    figure.savefig(path, dpi=110)
    plt.close(figure)
    return path


def event_timeline(
    path: Path,
    timestamps: Sequence[Any],
    probabilities: Sequence[float],
    *,
    onset: Any = None,
    threshold: float | None = None,
    title: str = "",
) -> Path | None:
    """Probability against time, with onset and threshold marked.

    The only view that shows lead time honestly: a high score after onset is
    not a prediction, and a table of recall cannot tell the two apart.
    """
    plt = _pyplot()
    if plt is None or not probabilities:
        return None
    figure, axes = plt.subplots(figsize=(9, 3.6))
    axes.plot(timestamps, probabilities, linewidth=1.1)
    if threshold is not None:
        axes.axhline(threshold, linestyle="--", color="orange", label=f"threshold {threshold:.2f}")
    if onset is not None:
        axes.axvline(onset, color="crimson", label="confirmed onset")
    axes.set_ylim(0, 1.02)
    axes.set_ylabel("probability")
    axes.set_title(title)
    axes.legend(loc="upper left")
    figure.autofmt_xdate()
    figure.tight_layout()
    figure.savefig(path, dpi=110)
    plt.close(figure)
    return path


def write_all(root: Path, payload: dict[str, Any]) -> dict[str, list[str]]:
    """Write every plot a results payload supports, and record what was skipped.

    Returns the files written per family. A family with nothing to draw stays
    an empty directory rather than being omitted, so "no PR curves" reads as a
    missing result rather than a missing feature.
    """
    ensure_directories(root)
    written: dict[str, list[str]] = {family: [] for family in FAMILIES}

    for key, entry in (payload.get("outputs") or {}).items():
        probabilities = entry.get("probabilities")
        labels = entry.get("labels")
        if not probabilities or not labels:
            continue
        safe = key.replace("@", "_at_").replace("/", "_")
        for family, function in (
            ("prediction_distributions", prediction_distribution),
            ("PR_curves", pr_curve),
            ("ROC_curves", roc_curve),
            ("reliability_curves", reliability_curve),
        ):
            target = root / family / f"{safe}.png"
            if function(target, probabilities, labels, key) is not None:
                written[family].append(str(target))

    history = payload.get("training_history")
    if history:
        target = root / "training_history" / "temporal.png"
        if training_history(target, history, "Temporal model") is not None:
            written["training_history"].append(str(target))

    (root / "index.json").write_text(
        json.dumps(
            {
                "families": list(FAMILIES),
                "written": written,
                "note": (
                    "An empty family means the result it would draw does not exist yet, "
                    "not that the plot is unimplemented."
                ),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return written
