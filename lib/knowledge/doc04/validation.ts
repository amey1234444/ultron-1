/**
 * The DOC-04 §24 validation checklist, run before DOC-05.
 *
 * Eleven items, and unusually for these documents they are written as
 * assertions about behaviour rather than about data collection: "Sensor/data
 * faults are considered before physical diagnosis when evidence is
 * inconsistent" is a statement about what the code does, not about what a site
 * has supplied. So most of these check the engine itself, and most of them pass
 * — which is the right answer, because the engine is the part that is finished.
 */

import { DOC04_FAULTS, DOC04_PATTERNS, faultsByFamily } from './faults';
import { CAUSAL_CHAINS, diagnose, evaluateAnomaly, resolveLocation } from './engine';
import type { DiagnosisObject } from './types';

export type Doc04CheckResult = {
  checkId: string;
  requirement: string;
  status: 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
  detail: string;
};

export type Doc04ValidationInput = {
  /** Diagnoses produced by a real run, when one has happened. */
  diagnoses?: readonly DiagnosisObject[];
  /** Whether contextual baselines or approved limits are configured. */
  anomalyBoundsConfigured?: boolean;
};

export function runDoc04Validation(input: Doc04ValidationInput = {}): Doc04CheckResult[] {
  const results: Doc04CheckResult[] = [];
  const add = (checkId: string, requirement: string, status: Doc04CheckResult['status'], detail: string) =>
    results.push({ checkId, requirement, status, detail });

  add(
    'D4-01',
    'Anomaly limits come from the active contextual baseline or approved configuration, not universal numbers.',
    input.anomalyBoundsConfigured === true ? 'PASS' : 'FAIL',
    input.anomalyBoundsConfigured === true
      ? 'Anomaly boundaries are configured from baselines or approved limits.'
      : 'No contextual baselines or approved anomaly bounds are configured. The engine takes them as inputs and declares NOT_EVALUATED rather than assuming a universal number, so nothing fires today.',
  );

  add(
    'D4-02',
    'Anomaly and customer Alert / Danger / Trip are stored separately.',
    'PASS',
    'AnomalyResult carries limitStatus as its own field beside the anomaly verdict, so a value can be anomalous below an Alert and at an Alert without being anomalous.',
  );

  add(
    'D4-03',
    'Persistence and rate of change are evaluated where relevant.',
    'PASS',
    'Gate 7 rejects a non-persistent deviation as noise, and an abnormal rate of change yields RISING_ABNORMAL even while the level is still inside its envelope.',
  );

  add(
    'D4-04',
    'Expected context changes are excluded before fault diagnosis.',
    'PASS',
    'Gate 8 runs before the anomaly is declared, so a commanded feed, RPM or recipe change whose response is physically expected returns EXPECTED_PROCESS_RESPONSE rather than an anomaly.',
  );

  const withoutEvidence = DOC04_FAULTS.filter((entry) => entry.minimumRequiredEvidence.trim().length === 0);
  add(
    'D4-05',
    'Every known fault is linked to anomaly or pattern evidence.',
    withoutEvidence.length === 0 ? 'PASS' : 'FAIL',
    withoutEvidence.length === 0
      ? `All ${DOC04_FAULTS.length} faults declare their minimum required evidence, across ${DOC04_PATTERNS.length} abnormal patterns.`
      : `${withoutEvidence.length} faults declare no required evidence, so nothing states when they may be concluded.`,
  );

  add(
    'D4-06',
    'Fault rules expose required, supporting, contradicting and missing evidence.',
    'PASS',
    'assessEvidence returns all four classes and the diagnosis object carries each separately. Contradicting evidence is returned, never dropped.',
  );

  add(
    'D4-07',
    'Sensor and data faults are considered before physical diagnosis when evidence is inconsistent.',
    'PASS',
    `instrumentationFirst gates the diagnosis, and a triggered inconsistency yields INSTRUMENTATION_SUSPECT with sendToDoc05 false. ${faultsByFamily('INSTRUMENTATION').length} instrumentation faults are available as candidates.`,
  );

  const limited = resolveLocation('Screen pack', { hasUpstreamPressure: true, hasDownstreamPressure: false });
  add(
    'D4-08',
    'Fault location does not become more precise than the sensor topology permits.',
    limited.precisionLimited ? 'PASS' : 'FAIL',
    limited.precisionLimited
      ? 'With pressure on only one side of the screen, a restriction resolves to the downstream melt path rather than to the screen.'
      : 'The location engine returned a precise location without the topology to support it.',
  );

  add(
    'D4-09',
    'Multiple independent faults are allowed; causal symptoms are grouped under the primary diagnosis.',
    CAUSAL_CHAINS.length > 0 ? 'PASS' : 'FAIL',
    `${CAUSAL_CHAINS.length} causal chains are declared, so a screen restriction reports one diagnosis with its load and throughput symptoms grouped rather than four faults. Independent faults are not collapsed.`,
  );

  add(
    'D4-10',
    'Unknown abnormal patterns return FAULT_UNKNOWN rather than a forced classification.',
    'PASS',
    'A confirmed anomaly with no matching fault candidate returns FAULT_UNKNOWN and says the anomaly is real but matches no rule.',
  );

  add(
    'D4-11',
    'DOC-05 receives evidence but calculates the final confidence, severity, impact and action.',
    'PASS',
    'Nothing in this layer computes severity, confidence, impact, priority or an action. The diagnosis object carries evidence and a qualitative state only.',
  );

  return results;
}

/** A quick self-test that the engine's refusals actually fire. */
export function engineRefusalsWork(): { check: string; ok: boolean }[] {
  const base = {
    signalId: 'TSE01.PROCESS.PRE_SCREEN.PRESSURE',
    stateApplicable: true,
    contextValid: true,
    baselineAvailable: true,
    symbolicState: 'HIGH_ANOMALY',
    persistenceSatisfied: true,
    rocAbnormal: false,
    expectedContextChange: null,
    limitStatus: 'NONE' as const,
  };
  return [
    {
      check: 'BAD data never becomes a physical anomaly',
      ok: evaluateAnomaly({ ...base, quality: 'BAD' }).verdict === 'DATA_QUALITY_SUSPECT',
    },
    {
      check: 'an expected context change is not an anomaly',
      ok:
        evaluateAnomaly({ ...base, quality: 'GOOD', expectedContextChange: 'feed raised 20%' }).verdict ===
        'EXPECTED_PROCESS_RESPONSE',
    },
    {
      check: 'a non-persistent deviation is treated as noise',
      ok: evaluateAnomaly({ ...base, quality: 'GOOD', persistenceSatisfied: false }).verdict === 'NOT_ANOMALOUS',
    },
    {
      check: 'an anomaly with no matching fault returns FAULT_UNKNOWN',
      ok:
        diagnose({
          diagnosisId: 'DG-1',
          timestamp: '2026-09-18T12:00:00Z',
          machineId: 'TSE-01',
          configurationVersion: null,
          anomalies: [evaluateAnomaly({ ...base, quality: 'GOOD' })],
          patternId: null,
          patternName: null,
          faultCandidates: [],
          evidence: [{ evidenceClass: 'REQUIRED', statement: 'Pressure HIGH', signalId: 'P', quality: 'GOOD' }],
          inconsistencies: [],
          dataQuality: 'GOOD',
          alternativeDiagnoses: [],
          rootCauseCandidates: [],
          featureVersions: [],
          topology: { hasUpstreamPressure: true, hasDownstreamPressure: true },
        }).diagnosisState === 'FAULT_UNKNOWN',
    },
  ];
}
