#!/usr/bin/env python
"""Build the SSE fault catalogue + propagation YAML from Document B (extracted markdown).

Document B = "ULTRON Master Fault Analysis Catalogue v1.0" (single-screw extruder). The extracted
text lives in ``docs/source/DocB_extracted.md``; every catalogue row is a pipe table row:

    | Fault ID | Fault / Condition | Sensors | Min / Low | Nominal | Max / Severe Reference |
      Typical Fault Values / Multi-Sensor Pattern | Detectability | Implementation / Confirmation Note |

and every cascade row (Appendix E) is:

    | Cascade ID | Initiating fault | Propagation path | Initiating / local values |
      Downstream values / symptoms | Time / detectability |

The generator is deterministic; re-run it after editing the source document::

    uv run python scripts/build_sse_catalogue.py

Nothing here is a runtime dependency; the engine loads the generated YAML through
``ultron_ml.config``.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "docs" / "source" / "DocB_extracted.md"
OUT_CAT = ROOT / "profiles" / "sse" / "fault_catalogue.yaml"
OUT_PROP = ROOT / "profiles" / "sse" / "propagation.yaml"

CHANNELS = {"RPM", "SRPM", "VM", "VG", "TMOT", "TGB", "Z1", "Z2", "Z3", "MT", "P", "L", "I", "FR"}

# Section id -> (family_id, family name, machine part) derived from Doc B §6 document map.
SECTION_FAMILY: dict[int, tuple[str, str]] = {
    1: ("SSE_FEED_SYSTEM", "Hopper & Raw-Material Feed System"),
    2: ("SSE_MAIN_MOTOR", "Main Motor"),
    3: ("SSE_GEARBOX", "Gearbox"),
    4: ("SSE_COUPLING_TRANSMISSION", "Coupling & Drive Transmission"),
    5: ("SSE_SCREW", "Screw"),
    6: ("SSE_BARREL_MECHANICAL", "Barrel - Mechanical"),
    7: ("SSE_BARREL_THERMAL", "Barrel Heating & Thermal Profile"),
    8: ("SSE_MELT_PROCESS", "Melt & Polymer Process"),
    9: ("SSE_SCREEN_PACK", "Screen Pack & Breaker Plate"),
    10: ("SSE_DIE_HEAD", "Die & Extrusion Head"),
    11: ("SSE_RAW_MATERIAL", "Raw Material / Polymer Condition"),
    12: ("SSE_COOLING", "Cooling System"),
    13: ("SSE_LUBRICATION", "Lubrication System"),
    14: ("SSE_ELECTRICAL_VFD", "Electrical Supply & VFD"),
    15: ("SSE_INSTRUMENTATION", "Instrumentation & Sensors"),
    16: ("SSE_DATA_TELEMETRY", "Data, Telemetry & Communication"),
    17: ("SSE_CONFIGURATION", "Configuration & Software"),
    18: ("SSE_PRODUCT_QUALITY", "Extrudate / Product Quality"),
    19: ("SSE_FRAME_FOUNDATION", "Machine Frame, Foundation & Supports"),
    20: ("SSE_SEALS_LEAKAGE", "Seals, Flanges & Leakage"),
    21: ("SSE_OPERATING_STATE", "Startup, Shutdown & Operating-State Abnormalities"),
}

# Canonical multi-sensor fault families from Doc B Appendix A / Rule 3. A record joins one of
# these ambiguity groups when its name matches; otherwise the group is the section family.
AMBIGUITY_GROUPS: list[tuple[str, re.Pattern[str]]] = [
    ("FEED_STARVATION", re.compile(r"starvation|bridging|rat-holing|throat|gate stuck closed|feeder", re.I)),
    ("DOWNSTREAM_FLOW_RESTRICTION", re.compile(r"screen|die|breaker|restriction|blockage|blocked|plug", re.I)),
    ("OVERFEED_HIGH_LOAD", re.compile(r"overfeed|excess(ive)? feed|gate stuck open|high load", re.I)),
    ("MOTOR_OVERLOAD", re.compile(r"motor overload|stall|seizure", re.I)),
    ("MOTOR_VIBRATION", re.compile(r"motor.*(vibration|bearing|imbalance|misalign|loosen|rub|eccentric)|imbalance|misalignment|looseness|resonance|soft-foot", re.I)),
    ("GEARBOX_VIBRATION", re.compile(r"gear|gearbox|mesh|tooth", re.I)),
    ("THERMAL_CONTROL", re.compile(r"heater|zone|thermocouple|thermal|temperature control|runaway", re.I)),
    ("MELT_THERMAL", re.compile(r"melt temp|viscosity|degradation|moisture|wrong grade|contamin", re.I)),
    ("COOLING_DEGRADATION", re.compile(r"cool", re.I)),
    ("LUBRICATION", re.compile(r"lubric|oil", re.I)),
    ("SENSOR_INTEGRITY", re.compile(r"sensor|drift|frozen|dropout|stale|noise|scaling|offset|telemetry|mapping|config", re.I)),
    ("SPEED_ANOMALY", re.compile(r"speed|rpm|hunting", re.I)),
    ("PROCESS_INSTABILITY", re.compile(r"surg|instabil|pulsation|oscillat|fluctuat", re.I)),
]

ROW_RE = re.compile(r"^\| ([A-Z]{1,5}-(?:[A-Z]{2,4}-)?[A-Z]?\d{2,3}) \|")
SECTION_RE = re.compile(r"^## (\d{1,2})\. (.+)$")
OCC_RE = re.compile(r"^## (\d{1,2})\.(\d)\s+(FREQUENT|SOMETIMES|RARE)")
CASCADE_SECTION_RE = re.compile(r"^## E\.(\d+) (.+)$")
CASCADE_OCC_RE = re.compile(r"^## (FREQUENT|SOMETIMES|RARE)$")
REF_RE = re.compile(r"([A-Z0-9_]+):\s*(-?\d+(?:\.\d+)?)")


def cells(line: str) -> list[str]:
    parts = [c.strip() for c in line.strip().strip("|").split("|")]
    return [re.sub(r"\s+", " ", p) for p in parts]


def parse_refs(text: str) -> dict[str, float]:
    return {k: float(v) for k, v in REF_RE.findall(text) if k in CHANNELS}


def sensors(text: str) -> tuple[list[str], list[str]]:
    toks = [t.strip().upper().replace(" ", "_").replace("/", "_") for t in text.split(",") if t.strip()]
    primary = [t for t in toks if t in CHANNELS]
    ext = [f"EXT:{t}" for t in toks if t not in CHANNELS]
    return primary, ext


def detectability(text: str) -> tuple[str, str]:
    """Return (level, raw). Mixed levels (D1/D2, D2/D3, D1/D3) resolve to the more conservative
    level so that the engine never over-localizes (Doc B Rule 3)."""
    m = re.match(r"(D[123])(?:/(D[123]))?", text)
    if not m:
        raise ValueError(f"unparseable detectability: {text!r}")
    levels = [m.group(1)] + ([m.group(2)] if m.group(2) else [])
    return max(levels), text


def ambiguity_group(name: str, section_family: str) -> str:
    for group, rx in AMBIGUITY_GROUPS:
        if rx.search(name):
            return group
    return section_family


def evidence_from_note(pattern: str, det_raw: str, note: str) -> list[str]:
    """Derive 'additional evidence required' text for D2/D3 records from the catalogue wording."""
    out: list[str] = []
    tail = det_raw.split("-", 1)[1].strip() if "-" in det_raw else ""
    if tail and not tail.lower().startswith("detectable"):
        out.append(tail)
    for m in re.finditer(
        r"([^.;]*?(required|needed|recommended|helpful|improves|needs|add [a-z\- /]+ sensor)[^.;]*)",
        pattern,
        re.I,
    ):
        frag = m.group(1).strip(" .")
        if frag and frag not in out:
            out.append(frag)
    if not out and note and "persistence" not in note.lower():
        out.append(note)
    return out or ["Inspection / additional measurement (see catalogue detectability note)"]


def build_catalogue(lines: list[str]) -> dict[str, Any]:
    faults: list[dict[str, Any]] = []
    section_no = 0
    section_title = ""
    occ = ""
    for line in lines:
        if line.startswith("## Appendix"):
            break
        m = SECTION_RE.match(line)
        if m and int(m.group(1)) in SECTION_FAMILY and m.group(2) == SECTION_FAMILY[int(m.group(1))][1]:
            section_no = int(m.group(1))
            section_title = m.group(2)
            continue
        m = OCC_RE.match(line)
        if m:
            occ = m.group(3)
            continue
        if not ROW_RE.match(line) or section_no == 0:
            continue
        c = cells(line)
        if len(c) != 9:
            raise ValueError(f"unexpected column count {len(c)} in row: {line[:80]}")
        fid, name, sens, mn, nom, mx, pattern, det, note = c
        primary, ext = sensors(sens)
        level, det_raw = detectability(det)
        fam_id, _ = SECTION_FAMILY[section_no]
        group = ambiguity_group(name, fam_id)
        rec: dict[str, Any] = {
            "fault_id": fid,
            "machine_profile": "sse",
            "machine_part": section_title,
            "section": f"{section_no}. {section_title}",
            "fault_name": name,
            "fault_family": fam_id,
            "occurrence_class": occ,
            "detectability": level,
            "detectability_note": det_raw,
            "primary_sensors": primary + ext,
            "minimum_reference": parse_refs(mn),
            "nominal_reference": parse_refs(nom),
            "maximum_reference": parse_refs(mx),
            "temporal_evidence": pattern,
            "maintenance_confirmation": note,
            "predictive": level == "D1" and section_no not in (15, 16, 17, 21),
            "source_document_reference": f"Doc B §{section_no} ({occ.title()}) row {fid}",
        }
        if level in ("D2", "D3"):
            rec["ambiguity_group"] = group
            rec["alternative_causes"] = [group]
        if level == "D3":
            rec["additional_evidence_required"] = evidence_from_note(pattern, det_raw, note)
        elif level == "D2":
            ev = evidence_from_note(pattern, det_raw, note)
            if ev:
                rec["additional_evidence_required"] = ev
        faults.append(rec)

    families = [
        {
            "family_id": fam,
            "name": title,
            "machine_part": title,
            "predictive": no not in (15, 16, 17, 18, 21),
            "source_document_reference": f"Doc B §6 document map row {no}",
        }
        for no, (fam, title) in SECTION_FAMILY.items()
    ]
    for group, _ in AMBIGUITY_GROUPS:
        families.append(
            {
                "family_id": group,
                "name": group.replace("_", " ").title(),
                "description": "Canonical multi-sensor fault family / ambiguity group",
                "predictive": group != "SENSOR_INTEGRITY",
                "source_document_reference": "Doc B Appendix A canonical vectors; Rule 3",
            }
        )
    return {
        "version": "sse-fault-catalogue-1.0.0",
        "machine_profile": "sse",
        "document": "ULTRON Master Fault Analysis Catalogue v1.0 (01 Sep 2026) - Document B",
        "sections": [f"{no}. {title}" for no, (_, title) in SECTION_FAMILY.items()],
        "families": families,
        "faults": faults,
    }


def build_propagation(lines: list[str], fault_names: dict[str, str]) -> dict[str, Any]:
    scenarios: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    in_appendix_e = False
    occ: str | None = None
    subsection = ""
    for line in lines:
        if line.startswith("## Appendix E"):
            in_appendix_e = True
            continue
        if not in_appendix_e:
            continue
        m = CASCADE_SECTION_RE.match(line)
        if m:
            subsection = f"E.{m.group(1)} {m.group(2)}"
            occ = None
            continue
        m = CASCADE_OCC_RE.match(line)
        if m:
            occ = m.group(1)
            continue
        if not ROW_RE.match(line):
            continue
        c = cells(line)
        sid = c[0]
        if sid.startswith("CAS-") and len(c) == 6:
            _, initiating, path, local_vals, downstream, timing = c
        elif sid.startswith("LOOP-") and len(c) == 5:
            _, initiating, path, local_vals, timing = c
            downstream = "self-reinforcing loop"
        else:
            raise ValueError(f"unexpected cascade row: {line[:80]}")
        chain = [s.strip() for s in re.split(r"\s*->\s*", path) if s.strip()]
        root = fault_names.get(initiating.lower())
        scenarios.append(
            {
                "scenario_id": sid,
                "name": initiating,
                "root_fault": root,
                "initiating_fault": initiating,
                "occurrence_class": occ,
                "chain": chain,
                "local_values": local_vals,
                "downstream_symptoms": downstream,
                "timing": timing,
                "source_document_reference": f"Doc B Appendix {subsection} row {sid}",
            }
        )
        for a, b in zip(chain, chain[1:], strict=False):
            edges.append(
                {
                    "source": a,
                    "target": b,
                    "relation": "may_propagate_to",
                    "mechanism": f"{sid}: {initiating}",
                    "source_document_reference": f"Doc B Appendix {subsection} row {sid}",
                }
            )
    return {
        "version": "sse-propagation-1.0.0",
        "machine_profile": "sse",
        "edges": edges,
        "scenarios": scenarios,
    }


def main() -> int:
    lines = SRC.read_text(encoding="utf-8").splitlines()
    cat = build_catalogue(lines)
    names = {f["fault_name"].lower(): f["fault_id"] for f in cat["faults"]}
    prop = build_propagation(lines, names)
    header = (
        "# GENERATED by scripts/build_sse_catalogue.py from docs/source/DocB_extracted.md "
        "(Document B). Do not hand-edit; edit the source document and regenerate.\n"
    )
    OUT_CAT.write_text(header + yaml.safe_dump(cat, sort_keys=False, allow_unicode=True, width=120))
    OUT_PROP.write_text(header + yaml.safe_dump(prop, sort_keys=False, allow_unicode=True, width=120))
    by_level: dict[str, int] = {}
    for f in cat["faults"]:
        by_level[f["detectability"]] = by_level.get(f["detectability"], 0) + 1
    print(f"faults={len(cat['faults'])} by_detectability={by_level} "
          f"scenarios={len(prop['scenarios'])} edges={len(prop['edges'])} "
          f"resolved_roots={sum(1 for s in prop['scenarios'] if s['root_fault'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
