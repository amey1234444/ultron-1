"""Prove the prognosis path end to end, against a running service.

    ML_MODE=production npm run ml:serve          # in one shell
    npm run ml:smoke                             # in another

Replays a scenario the catalogue already declares a fault for, then reads the
prognosis back and prints what came out. It asserts the pipeline answered —
not that the answer is accurate, which is a different claim and one no
synthetic dataset can support.

Why this exists: every part of the chain can be healthy while the console
still shows an empty Prognosis tab, and the cause is almost always one of two
settings rather than a fault. ML_MODE defaults to `shadow`, where predictions
run and persist but deliberately surface to nobody; and ML_SERVICE_URL unset
means the web app never calls the service at all. Both are correct defaults
and both look identical from the UI. This says which one you are in.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("ML_SMOKE_URL", "http://127.0.0.1:8080").rstrip("/")
SCENARIO = os.environ.get("ML_SMOKE_SCENARIO", "SC-SCREEN-RESTRICTION")
MACHINE = os.environ.get("ML_SMOKE_MACHINE", "TSE-01")
#: One frame per this many seconds of the scenario. Matches what
#: build_dataset replays with, and is plenty to develop a trend.
EVERY = int(os.environ.get("ML_SMOKE_EVERY", "15"))


def get(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE}{path}", timeout=120) as response:
        return json.load(response)


def post(path: str, payload: dict) -> dict:
    request = urllib.request.Request(
        f"{BASE}{path}",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=300) as response:
        return json.load(response)


def main() -> int:
    try:
        health = get("/health")
    except (urllib.error.URLError, OSError) as error:
        print(f"No service at {BASE} — start it with `npm run ml:serve`. ({error})")
        return 1

    mode = health.get("mode")
    champion = health.get("models", {}).get("champion", {})
    print(f"service   {BASE}")
    print(f"mode      {mode}   publishes_alerts={health.get('publishes_alerts')}")
    print(
        f"champion  {champion.get('model_id')} "
        f"capability={champion.get('capability')} outputs={champion.get('output_count')} "
        f"trained_on_real_data={champion.get('trained_on_real_data')}"
    )

    if champion.get("capability") != "AVAILABLE":
        print(f"\nNo champion is answering: {champion.get('reason')}")
        print("Train and promote one — `bash scripts/lifecycle_demo.sh`.")
        return 1

    from app.synthetic.scenarios import scenario  # imported late: needs the service's env

    selected = scenario(SCENARIO)
    frames = [json.loads(frame.model_dump_json()) for frame in selected.frames(machine_id=MACHINE)]
    sampled = frames[::EVERY]
    print(f"\nreplaying {SCENARIO}: {len(sampled)} frames (1 in {EVERY} of {len(frames)})")
    post("/inference/batch", {"frames": sampled})

    prognosis = get(f"/prognosis/{MACHINE}")
    ml = prognosis.get("ml", {})
    print(
        f"\neligible={ml.get('eligible')} status={ml.get('status')} mode={ml.get('mode')} "
        f"surfaced={ml.get('surfaced')} latency={ml.get('inference_latency_ms')}ms"
    )
    if ml.get("eligibility_reason"):
        print(f"reason    {ml['eligibility_reason']} — {ml.get('reason_detail')}")

    rows = prognosis.get("prognosis", [])
    print(f"\n{len(rows)} fault(s) carrying risk:")
    for entry in rows:
        horizons = "  ".join(
            f"{h['horizon_minutes']:>2}m {h['probability']:.3f}" for h in entry["horizons"]
        )
        print(
            f"  {entry['fault_id']:24s} {entry['diagnosis_state']:14s} "
            f"surfaced={str(entry['surfaced']):5s} {horizons}"
        )

    if not rows:
        print("\nThe chain ran and produced no risk. That is a real answer on a")
        print("healthy replay; on a fault scenario it means the eligibility gate")
        print("declined — the reason is printed above.")
        return 1

    if mode == "shadow":
        print("\nRisk was produced, and in shadow mode the ML contribution reaches")
        print("nobody. The console's Prognosis tab will be empty by design.")
        print("Set ML_MODE to `canary` (with ML_CANARY_MACHINES) or `production`.")
        # A finding can still read surfaced=True here. That is the deterministic
        # rule layer, which is authoritative and always surfaces: ML_MODE gates
        # what the models add, never what an approved limit already says.
        if any(entry["surfaced"] for entry in rows):
            print("\nAnything above marked surfaced=True in this mode came from the")
            print("rules, not the models. Approved limits are not gated by ML_MODE.")
        return 1

    surfaced = sum(1 for entry in rows if entry["surfaced"])
    print(f"\n{surfaced} of {len(rows)} would reach an operator in mode `{mode}`.")
    print("These probabilities come from a model fitted on synthetic scenarios.")
    print("They demonstrate the path, and are not evidence about a real machine.")
    return 0 if surfaced else 1


if __name__ == "__main__":
    sys.exit(main())
