#!/usr/bin/env bash
#
# The whole training lifecycle, end to end, on synthetic data.
#
# What this proves: the pipeline works. Dataset builds, splits verify, models
# fit, calibration improves, evaluation reports, Golden regression passes, and
# promotion REFUSES — because every artifact here was fitted on generated
# scenarios and none of them carries evidence about a real machine.
#
# What this does not prove: anything about predictive accuracy. The last step
# prints the measured metrics precisely so nobody has to take that on trust.
#
# Requires the model profile:  pip install -e ".[all]"
# Runs in roughly fifteen minutes on a laptop.

set -euo pipefail
cd "$(dirname "$0")/.."

DATASET="${DATASET:-ds-demo}"
MODEL="${MODEL:-lgbm-demo}"
LIBRARY="${LIBRARY:-lightgbm}"

step() { printf '\n\033[1m=== %s ===\033[0m\n' "$1"; }

step "1/7  Build a dataset"
# --repeats spreads each scenario across the timeline. A fault that occurs once
# lands entirely in one chronological split, which is correct splitting and a
# useless dataset — so the catalogue is replayed with different seeds.
python -m app.training.build_dataset \
    --dataset-id "$DATASET" \
    --source synthetic \
    --scenarios SC-HEALTHY SC-SCREEN-RESTRICTION SC-DIE-RESTRICTION \
                SC-FEED-INSTABILITY SC-COOLING-FAILURE \
    --repeats 6 \
    --emit-every 15

step "2/7  Train the temporal model"
# Skipped without TensorFlow. The tree models still train; their residual and
# embedding columns simply stay null, which is the honest value for a column no
# model produced.
if python -c "import tensorflow" 2>/dev/null; then
    python -m app.training.train_temporal \
        --dataset "$DATASET" --lookback 120 --epochs 8 --model-id "temporal-demo"
    python -m app.training.generate_temporal_features \
        --dataset "$DATASET" --model "temporal-demo"
else
    echo "TensorFlow is not installed; residual and embedding columns stay null."
fi

step "3/7  Train the structured model"
# --min-events 6 lowers the eight-event floor. Below the floor a classifier
# memorises its positives, so the override is recorded in the model contract
# and is itself a promotion blocker.
python -m "app.training.train_${LIBRARY}" \
    --dataset "$DATASET" --model-id "$MODEL" \
    --min-events 6 --n-estimators 400 --early-stopping-rounds 40

step "4/7  Calibrate on validation"
python -m app.training.calibrate --dataset "$DATASET" --model "$MODEL"

step "5/7  Evaluate"
python -m app.training.evaluate --dataset "$DATASET" --model "$MODEL" --split valid
# The frozen test split, once. Choosing anything from these numbers turns the
# test set into a tuning set.
python -m app.training.evaluate --dataset "$DATASET" --model "$MODEL" \
    --split test --false-alarm-report

step "6/7  Golden regression"
python -m app.training.run_golden_tests --model "$MODEL"

step "7/7  Attempt promotion — this is expected to be refused"
if python -m app.training.promote_model \
       --model "$MODEL" --approved-by "Lifecycle demo"; then
    echo
    echo "PROMOTION SUCCEEDED. That is wrong unless ML_ALLOW_UNTRAINED_CHAMPION" \
         "is set: a model fitted on synthetic scenarios must not become champion."
    exit 1
else
    echo
    echo "Promotion refused, as it should be. The reasons above are the gate working."
fi

step "Measured result"
python - "$MODEL" <<'PY'
import json, sys
from pathlib import Path

model = sys.argv[1]
report = next(Path("artifacts/models").rglob(f"{model}-*/evaluation-test.json"), None)
if report is None:
    print("No frozen-test evaluation was written.")
    raise SystemExit(0)

payload = json.loads(report.read_text(encoding="utf-8"))
print(f"{'output':22s} {'PR-AUC':>7s} {'recall':>7s} {'prec':>6s} {'FA/h':>6s}  events")
for key, entry in sorted(payload["outputs"].items()):
    if "pr_auc" not in entry:
        print(f"{key:22s} {entry.get('note', 'no usable rows')}")
        continue
    threshold = entry["threshold_metrics"]
    events = entry["event_recall"]
    print(
        f"{key:22s} {entry['pr_auc']:7.3f} {threshold['recall']:7.2f} "
        f"{threshold['precision']:6.2f} {entry['false_alarms_per_hour']:6.2f}  "
        f"{events.get('detected', 0)}/{events.get('events', 0)}"
    )
print()
print(
    "These are synthetic-data numbers from a handful of generated events. They\n"
    "demonstrate that the measurement path works. They are not evidence about a\n"
    "real machine, and nothing here should be quoted as accuracy."
)
PY
