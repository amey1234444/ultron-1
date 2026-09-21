/**
 * Export the DOC-01..DOC-07 knowledge layer as JSON, for the Python ML service.
 *
 * The knowledge is written in TypeScript and that is where it stays. Ninety
 * faults, forty anomalies, sixty signals and thirteen operating states retyped
 * into Python would be a second copy to keep in step, and the copy would be
 * wrong within a release. So this script is the only bridge: it reads the
 * shipped modules and writes a snapshot the ML service loads at import time.
 *
 * Three properties make the snapshot safe to depend on:
 *
 *   - every file is content-addressed in `manifest.json`, so the Python side
 *     can refuse to start against a snapshot it was not built for;
 *   - `npm run check:knowledge-export` rebuilds and diffs, so a change to a
 *     fault definition that is not re-exported fails the build rather than
 *     silently drifting;
 *   - nothing is transformed on the way out. An id is the id the document uses.
 *
 * What is deliberately *not* exported: the engines. `evaluateAnomaly`,
 * `diagnose` and `decide` are logic, not knowledge, and the ML service
 * re-implements the parts it needs against the same enums rather than shipping
 * a second copy of the reasoning. Where the two must agree — diagnosis states,
 * severity floors, the authority ladder — the enums travel in `enums.json` and
 * a Python test asserts its own literals against them.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { DOC02_SIGNAL_MASTER } from '../lib/knowledge/doc02/signals';
import { DOC02_OPERATING_STATES } from '../lib/knowledge/doc02/operatingState';
import { DOC02_DOCUMENT_REF } from '../lib/knowledge/doc02';
import { PRIORITY_BEHAVIOUR_IF_MISSING, QUALITY_RANK } from '../lib/knowledge/doc02/types';
import { LIMIT_CONCEPT, LIMIT_CONCEPT_ORDER } from '../lib/knowledge/doc02/limits';
import { DOC03_FORMULAS } from '../lib/knowledge/doc03/formulas';
import {
  BASELINE_LEVEL_MEANING,
  BASELINE_LEVEL_ORDER,
  BASELINE_STATUS_USE,
  FEATURE_FAILURE_RULE,
} from '../lib/knowledge/doc03/types';
import { DOC03_DOCUMENT_REF } from '../lib/knowledge/doc03';
import { DOC04_FAULTS, DOC04_PATTERNS } from '../lib/knowledge/doc04/faults';
import {
  ANOMALY_GATE_RULE,
  DIAGNOSIS_LEVEL_EXAMPLE,
  DIAGNOSIS_STATE_MEANING,
  EVIDENCE_BEHAVIOUR,
  FAULT_FAMILY_SCOPE,
} from '../lib/knowledge/doc04/types';
import { DOC04_DOCUMENT_REF, ML_LABEL_FIELDS } from '../lib/knowledge/doc04';
import {
  ACTION_LEVEL_USE,
  ACTION_STEP_PURPOSE,
  AUTHORITY_SEVERITY_FLOOR,
  CONFIDENCE_MEANING,
  PRIORITY_MEANING,
  PROGRESSION_MEANING,
  SEVERITY_MEANING,
} from '../lib/knowledge/doc05/types';
import { DOC05_DOCUMENT_REF } from '../lib/knowledge/doc05';
import { DOC07_ANOMALIES, parameterFamily } from '../lib/knowledge/doc07/anomalies';
import { DOC07_DOCUMENT_REF } from '../lib/knowledge/doc07';
import { TWIN_SCREW_POINT_REGISTRY } from '../lib/twinScrewExtruderPoints';
import { TAG_TO_SIGNAL, UNBOUND_TAGS, unboundMandatorySignals } from '../lib/knowledge/tse/signalBinding';
import {
  COMMISSIONING_NOTICE,
  COMMISSIONING_SOURCE,
  FEATURE_BANDS,
  FIELD_CALIBRATED,
  QUALITY_CONFIG,
  STATE_THRESHOLDS,
  TEMPLATE_BASELINES,
} from '../lib/knowledge/tse/commissioning';
import { TSE_TEMPLATE } from '../lib/knowledge/tse/template';

/**
 * Where the snapshot lands.
 *
 * Resolved from the working directory rather than `__dirname`, because the
 * script is bundled into `node_modules/.cache` before it runs and `__dirname`
 * would point there. npm scripts always run from the repository root.
 */
const DEFAULT_OUT = join(process.cwd(), 'services', 'ml', 'knowledge');

/**
 * The snapshot's own version.
 *
 * Bumped when the *shape* changes, not when a fault is added — the content hash
 * covers content. Python pins this, so a shape change Python has not been
 * taught about fails loudly at import rather than as a KeyError under load.
 */
const SNAPSHOT_SCHEMA_VERSION = '1.0.0';

function stable(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Every DOC-02 signal, with whether this machine actually supplies it. */
function signals() {
  const supplied = new Set(Object.values(TAG_TO_SIGNAL));
  return DOC02_SIGNAL_MASTER.map((signal) => ({
    ...signal,
    suppliedByMachine: supplied.has(signal.signalId),
    behaviourIfMissing: PRIORITY_BEHAVIOUR_IF_MISSING[signal.priority],
  }));
}

/**
 * The machine's own tags, joined to everything keyed on them.
 *
 * One row per instrument carrying its DOC-02 signal, its DOC-07 parameter
 * family, its commissioning quality config and its cold-start baseline. The ML
 * feature engine reads exactly this and needs no second lookup.
 */
function tags() {
  return TWIN_SCREW_POINT_REGISTRY.map((point) => {
    const tag = point.analyzerTag;
    const signalId = TAG_TO_SIGNAL[tag] ?? null;
    const signal = signalId ? DOC02_SIGNAL_MASTER.find((entry) => entry.signalId === signalId) ?? null : null;
    return {
      tag,
      code: point.code,
      label: point.label,
      kind: point.kind,
      canonicalUnit: TEMPLATE_BASELINES[tag]?.unit ?? null,
      doc02SignalId: signalId,
      doc02Priority: signal?.priority ?? null,
      doc02AcquisitionClass: signal?.acquisitionClass ?? null,
      doc02CanonicalLocation: signal?.canonicalLocation ?? null,
      doc07ParameterFamily: parameterFamily(tag) ?? null,
      qualityConfig: QUALITY_CONFIG[tag] ?? null,
      templateBaseline: TEMPLATE_BASELINES[tag] ?? null,
    };
  });
}

/**
 * The enums the two languages must agree on, character for character.
 *
 * Exported as data rather than documented in prose because a Python test reads
 * this file and asserts its own literals against it. A severity renamed in
 * TypeScript breaks the Python suite on the next export, which is the only
 * mechanism that actually keeps two languages honest about a shared vocabulary.
 */
function enums() {
  return {
    qualityVerdict: Object.keys(QUALITY_RANK),
    qualityRank: QUALITY_RANK,
    operatingState: DOC02_OPERATING_STATES.map((entry) => entry.stateId),
    limitConcept: LIMIT_CONCEPT_ORDER,
    limitConceptMeaning: LIMIT_CONCEPT,
    baselineLevel: BASELINE_LEVEL_ORDER,
    baselineLevelMeaning: BASELINE_LEVEL_MEANING,
    baselineStatusUse: BASELINE_STATUS_USE,
    featureFailureRule: FEATURE_FAILURE_RULE,
    faultFamily: Object.keys(FAULT_FAMILY_SCOPE),
    faultFamilyScope: FAULT_FAMILY_SCOPE,
    anomalyGate: Object.keys(ANOMALY_GATE_RULE),
    anomalyGateRule: ANOMALY_GATE_RULE,
    evidenceClass: Object.keys(EVIDENCE_BEHAVIOUR),
    evidenceBehaviour: EVIDENCE_BEHAVIOUR,
    diagnosisLevel: Object.keys(DIAGNOSIS_LEVEL_EXAMPLE),
    diagnosisState: Object.keys(DIAGNOSIS_STATE_MEANING),
    diagnosisStateMeaning: DIAGNOSIS_STATE_MEANING,
    severity: Object.keys(SEVERITY_MEANING),
    severityMeaning: SEVERITY_MEANING,
    limitAuthority: Object.keys(AUTHORITY_SEVERITY_FLOOR),
    authoritySeverityFloor: AUTHORITY_SEVERITY_FLOOR,
    progression: Object.keys(PROGRESSION_MEANING),
    progressionMeaning: PROGRESSION_MEANING,
    confidenceLevel: Object.keys(CONFIDENCE_MEANING),
    confidenceMeaning: CONFIDENCE_MEANING,
    priority: Object.keys(PRIORITY_MEANING),
    priorityMeaning: PRIORITY_MEANING,
    actionLevel: Object.keys(ACTION_LEVEL_USE),
    actionLevelUse: ACTION_LEVEL_USE,
    actionStep: Object.keys(ACTION_STEP_PURPOSE),
    actionStepPurpose: ACTION_STEP_PURPOSE,
    mlLabelFields: ML_LABEL_FIELDS,
  };
}

/** The commissioning set, marked for exactly what it is. */
function commissioning() {
  return {
    fieldCalibrated: FIELD_CALIBRATED,
    source: COMMISSIONING_SOURCE,
    notice: COMMISSIONING_NOTICE,
    stateThresholds: STATE_THRESHOLDS,
    featureBands: FEATURE_BANDS,
    templateId: TSE_TEMPLATE.templateId,
    unboundTags: UNBOUND_TAGS,
    unboundMandatorySignals: unboundMandatorySignals().map((signal) => ({
      signalId: signal.signalId,
      parameter: signal.parameter,
      priority: signal.priority,
    })),
  };
}

export function buildSnapshot(): Record<string, unknown> {
  return {
    'signals.json': { documentRef: DOC02_DOCUMENT_REF, signals: signals() },
    'operating_states.json': { documentRef: DOC02_DOCUMENT_REF, states: DOC02_OPERATING_STATES },
    'formulas.json': { documentRef: DOC03_DOCUMENT_REF, formulas: DOC03_FORMULAS },
    'faults.json': { documentRef: DOC04_DOCUMENT_REF, faults: DOC04_FAULTS, patterns: DOC04_PATTERNS },
    'anomalies.json': { documentRef: DOC07_DOCUMENT_REF, anomalies: DOC07_ANOMALIES },
    'tags.json': { templateId: TSE_TEMPLATE.templateId, tags: tags() },
    'enums.json': { documentRefs: [DOC04_DOCUMENT_REF, DOC05_DOCUMENT_REF], enums: enums() },
    'commissioning.json': commissioning(),
  };
}

export function writeSnapshot(outDir: string): { files: string[] } {
  mkdirSync(outDir, { recursive: true });
  const snapshot = buildSnapshot();
  const files: Record<string, string> = {};

  for (const [name, payload] of Object.entries(snapshot)) {
    const text = stable(payload);
    writeFileSync(join(outDir, name), text, 'utf8');
    files[name] = sha256(text);
  }

  const manifest = stable({
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    // No timestamp. A regenerated-but-identical snapshot must be byte-identical
    // or the staleness check reports a false difference on every run.
    generator: 'scripts/exportKnowledge.ts',
    documents: {
      'DOC-02': DOC02_DOCUMENT_REF,
      'DOC-03': DOC03_DOCUMENT_REF,
      'DOC-04': DOC04_DOCUMENT_REF,
      'DOC-05': DOC05_DOCUMENT_REF,
      'DOC-07': DOC07_DOCUMENT_REF,
    },
    counts: {
      signals: DOC02_SIGNAL_MASTER.length,
      operatingStates: DOC02_OPERATING_STATES.length,
      formulas: DOC03_FORMULAS.length,
      faults: DOC04_FAULTS.length,
      patterns: DOC04_PATTERNS.length,
      anomalies: DOC07_ANOMALIES.length,
      tags: TWIN_SCREW_POINT_REGISTRY.length,
    },
    files,
  });
  writeFileSync(join(outDir, 'manifest.json'), manifest, 'utf8');

  return { files: [...Object.keys(files), 'manifest.json'] };
}

/** Compare a freshly built snapshot against what is committed. */
function checkStale(outDir: string): number {
  const fresh = buildSnapshot();
  const problems: string[] = [];

  let committed: string[];
  try {
    committed = readdirSync(outDir).filter((name) => name.endsWith('.json'));
  } catch {
    console.error(`knowledge export: ${outDir} does not exist. Run "npm run export:knowledge".`);
    return 1;
  }

  for (const [name, payload] of Object.entries(fresh)) {
    const expected = stable(payload);
    let actual: string;
    try {
      actual = readFileSync(join(outDir, name), 'utf8');
    } catch {
      problems.push(`${name} is missing from the committed snapshot`);
      continue;
    }
    if (actual !== expected) problems.push(`${name} differs from the knowledge layer`);
  }

  const expectedNames = new Set([...Object.keys(fresh), 'manifest.json']);
  for (const name of committed) {
    if (!expectedNames.has(name)) problems.push(`${name} is committed but no longer exported`);
  }

  if (problems.length > 0) {
    console.error('knowledge export is stale:');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('Run "npm run export:knowledge" and commit the result.');
    return 1;
  }

  console.log(`knowledge export is current (${Object.keys(fresh).length} files).`);
  return 0;
}

function main(): void {
  const mode = process.argv[2] ?? 'write';
  const outDir = process.argv[3] ?? DEFAULT_OUT;

  if (mode === 'check') {
    process.exitCode = checkStale(outDir);
    return;
  }

  const { files } = writeSnapshot(outDir);
  console.log(`knowledge exported to ${outDir}`);
  for (const file of files) console.log(`  ${file}`);
}

main();
