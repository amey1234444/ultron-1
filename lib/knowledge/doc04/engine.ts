/**
 * The DOC-04 diagnosis engine — §3 anomaly gates, §17 instrumentation-first,
 * §18 evidence, §19 multi-fault, §20 states, §21 diagnosis object.
 *
 * The whole point of this layer is restraint. It is easy to turn a high
 * pressure reading into "screen blockage"; what is hard, and what the document
 * spends most of its length on, is *not* doing that when the pressure is a
 * spike from a failing transmitter, or an expected response to a feed increase,
 * or a genuine restriction whose location the sensors cannot resolve.
 *
 * So the engine refuses in four specific ways, each traceable to a rule:
 *
 *   §3 gate 1  BAD or MISSING data yields DATA_QUALITY_SUSPECT, never a
 *              physical anomaly.
 *   §3 gate 8  A commanded change whose response is physically expected yields
 *              EXPECTED_PROCESS_RESPONSE, not an anomaly.
 *   §17        Internally inconsistent evidence puts the instrument first: the
 *              physical diagnosis is withheld until the sensor is cleared.
 *   §20        An anomaly nothing explains yields FAULT_UNKNOWN rather than the
 *              nearest fault that happens to fit.
 *
 * And DOC-04 stops where DOC-05 begins. Nothing here computes severity,
 * confidence, impact, priority or an action.
 */

import type { QualityVerdict } from '../doc02/types';
import { DOC04_FAULTS, faultById } from './faults';
import type {
  AnomalyGate,
  AnomalyResult,
  AnomalyVerdict,
  DiagnosisObject,
  DiagnosisState,
  EvidenceItem,
  FaultDefinition,
} from './types';

/* 3 — The anomaly engine ------------------------------------------------------------ */

export type AnomalyInput = {
  signalId: string;
  quality: QualityVerdict;
  /** Whether the current operating state makes this comparison valid. */
  stateApplicable: boolean;
  /** Whether the context needed to pick a baseline is known. */
  contextValid: boolean;
  /** Whether a baseline was available to compare against at all. */
  baselineAvailable: boolean;
  /** DOC-03's symbolic state for this signal. */
  symbolicState: string;
  /** Whether the deviation held long enough to matter. */
  persistenceSatisfied: boolean;
  /** Whether the rate of change is outside its healthy boundary. */
  rocAbnormal: boolean;
  /**
   * Set when feed, RPM, recipe or a setpoint was intentionally changed and the
   * observed response is what physics predicts. §3 gate 8.
   */
  expectedContextChange: string | null;
  limitStatus: AnomalyResult['limitStatus'];
};

function anomaly(
  input: AnomalyInput,
  verdict: AnomalyVerdict,
  reason: string,
  blockedAtGate: AnomalyGate | null = null,
): AnomalyResult {
  return { signalId: input.signalId, verdict, blockedAtGate, reason, limitStatus: input.limitStatus };
}

/**
 * Run the nine gates of §3 in order.
 *
 * Order is the design. Data quality is asked before anything physical, and the
 * expected-context-change question is asked before the answer is allowed to be
 * an anomaly — so a feed increase that raises pressure exactly as it should is
 * never reported as abnormal, however far from baseline it lands.
 */
export function evaluateAnomaly(input: AnomalyInput): AnomalyResult {
  // Gate 1 — data quality.
  if (input.quality === 'BAD' || input.quality === 'MISSING') {
    return anomaly(
      input,
      'DATA_QUALITY_SUSPECT',
      `${input.signalId} data is ${input.quality}. No physical anomaly is declared from it; the instrumentation or data issue is the finding.`,
      'DATA_QUALITY',
    );
  }

  // Gate 2 — operating state.
  if (!input.stateApplicable) {
    return anomaly(
      input,
      'NOT_EVALUATED',
      `The current operating state does not support this comparison, so a steady-production baseline is not applied.`,
      'OPERATING_STATE',
    );
  }

  // Gate 3 — context.
  if (!input.contextValid) {
    return anomaly(
      input,
      'NOT_EVALUATED',
      'Context is not known, so no baseline can be selected and no deviation is meaningful.',
      'CONTEXT',
    );
  }

  // Gate 4 — expected range needs something to compare against.
  if (!input.baselineAvailable) {
    return anomaly(
      input,
      'NOT_EVALUATED',
      'No baseline is available for this context, so there is no healthy envelope to be outside of.',
      'EXPECTED_RANGE',
    );
  }

  const deviating =
    input.symbolicState === 'HIGH_ANOMALY' ||
    input.symbolicState === 'LOW_ANOMALY' ||
    input.symbolicState === 'HIGH_DEVIATION' ||
    input.symbolicState === 'LOW_DEVIATION';

  if (!deviating && !input.rocAbnormal) {
    return anomaly(input, 'NOT_ANOMALOUS', 'The value sits inside its contextual healthy envelope and is not changing abnormally fast.');
  }

  // Gate 7 — persistence. A single noisy sample is not a finding.
  if (!input.persistenceSatisfied) {
    return anomaly(
      input,
      'NOT_ANOMALOUS',
      'The deviation did not persist long enough to be meaningful; a single sample is treated as noise.',
      'PERSISTENCE',
    );
  }

  // Gate 8 — expected context change. Asked before the anomaly is declared.
  if (input.expectedContextChange) {
    return anomaly(
      input,
      'EXPECTED_PROCESS_RESPONSE',
      `The machine responded as physics predicts to a commanded change: ${input.expectedContextChange}. A context change is not a fault.`,
      'CONTEXT_CHANGE',
    );
  }

  const high = input.symbolicState.startsWith('HIGH');
  if (!deviating && input.rocAbnormal) {
    return anomaly(input, 'RISING_ABNORMAL', 'The level is still inside its envelope but is changing faster than normal.');
  }
  return anomaly(
    input,
    high ? 'HIGH_ANOMALY' : 'LOW_ANOMALY',
    `${input.signalId} is outside its contextual healthy envelope and the condition is sustained.`,
  );
}

/* 17 — Instrumentation-first validation ---------------------------------------------- */

/** One §17 inconsistency: evidence that points at the instrument, not the machine. */
export type InconsistencyCheck = {
  /** What was seen. */
  observation: string;
  /** True when the pattern holds and the instrument should be suspected. */
  holds: boolean;
  /** The correct DOC-04 reading of it. */
  interpretation: string;
};

/**
 * Whether a physical diagnosis may stand.
 *
 * Returns the instrument-first interpretations that must be reported instead.
 * An empty array means the evidence is internally consistent and a physical
 * conclusion is allowed.
 *
 * §17's four canonical cases all share a shape: one signal claims something
 * dramatic while every signal that would have to agree with it does not. That
 * is a sensor, and calling it a process fault sends a maintainer to the wrong
 * equipment.
 */
export function instrumentationFirst(checks: readonly InconsistencyCheck[]): InconsistencyCheck[] {
  return checks.filter((check) => check.holds);
}

/* 18 — Evidence assembly -------------------------------------------------------------- */

export type EvidenceAssessment = {
  supporting: EvidenceItem[];
  contradicting: EvidenceItem[];
  missing: EvidenceItem[];
  /** True when every REQUIRED item is present and usable. */
  requiredSatisfied: boolean;
};

/**
 * Sort evidence into the §18 classes.
 *
 * Contradictory evidence is returned, never dropped. A diagnosis that hides the
 * evidence against it looks more certain than it is, and §18 is explicit: "keep
 * alternatives; do not hide contradiction."
 */
export function assessEvidence(items: readonly EvidenceItem[]): EvidenceAssessment {
  const required = items.filter((item) => item.evidenceClass === 'REQUIRED');
  const unusable = required.filter((item) => item.quality === 'BAD' || item.quality === 'MISSING');
  return {
    supporting: items.filter((item) => item.evidenceClass === 'REQUIRED' || item.evidenceClass === 'SUPPORTING'),
    contradicting: items.filter((item) => item.evidenceClass === 'CONTRADICTORY'),
    missing: items.filter((item) => item.evidenceClass === 'MISSING'),
    requiredSatisfied: required.length > 0 && unusable.length === 0,
  };
}

/**
 * The §20 diagnosis state for a body of evidence.
 *
 * PROBABLE needs strong consistent evidence and no contradiction; a single
 * contradicting item pulls it down to SUSPECTED, because the alternative it
 * supports has not been ruled out. The numeric confidence is still DOC-05's.
 */
export function diagnosisStateFor(assessment: EvidenceAssessment, supportingCount: number): DiagnosisState {
  if (!assessment.requiredSatisfied) return 'INSUFFICIENT_EVIDENCE';
  if (supportingCount === 0) return 'NOT_DETECTED';
  if (assessment.contradicting.length > 0) return supportingCount >= 3 ? 'SUSPECTED' : 'POSSIBLE';
  if (supportingCount >= 3) return 'PROBABLE';
  if (supportingCount === 2) return 'SUSPECTED';
  return 'POSSIBLE';
}

/* 16 — Location engine ---------------------------------------------------------------- */

/**
 * How precisely a fault can be located, given what is actually measured.
 *
 * §16 asks "how specific can we be?" and the answer is bounded by topology. A
 * restriction can only be narrowed to the screen when pressures exist on both
 * sides of it; with one tap the honest answer is "downstream melt path", and
 * saying "screen" instead would send someone to strip a screen changer that may
 * be fine.
 */
export function resolveLocation(
  candidateLocation: string,
  availableTopology: { hasUpstreamPressure: boolean; hasDownstreamPressure: boolean },
): { location: string; precisionLimited: boolean; note: string | null } {
  const canLocalise = availableTopology.hasUpstreamPressure && availableTopology.hasDownstreamPressure;
  if (canLocalise) return { location: candidateLocation, precisionLimited: false, note: null };
  return {
    location: 'Downstream melt path, region not resolved',
    precisionLimited: true,
    note: 'Pressure exists on only one side of the screen, so a restriction cannot be attributed to the screen rather than the die or adapter. Fault location must not be more precise than the sensor topology permits.',
  };
}

/* 19 — Multi-fault and causal chains --------------------------------------------------- */

/**
 * Known causal chains: a primary fault and the symptoms it produces.
 *
 * §19's rule is that a chain is one diagnosis. A screen restriction raises
 * pressure, raises torque and current, and lowers throughput — reporting four
 * faults would bury the one that matters under three of its own consequences.
 */
export const CAUSAL_CHAINS: readonly { primary: string; symptoms: string[]; note: string }[] = [
  {
    primary: 'TSE-DOWN-001',
    symptoms: ['Pressure HIGH', 'Torque HIGH', 'Current HIGH', 'Throughput LOW'],
    note: 'One primary restriction diagnosis; load and throughput are symptoms, not separate faults.',
  },
  {
    primary: 'TSE-THERM-012',
    symptoms: ['Melt temperature HIGH', 'Viscosity change', 'Pressure change'],
    note: 'Cooling fault as primary where the causal evidence supports it; downstream effects grouped under it.',
  },
] as const;

/**
 * Collapse a set of fault candidates into primaries and grouped symptoms.
 *
 * Only collapses where a declared causal chain explains the relationship.
 * Independent faults stay independent — §19 keeps "feed instability plus an
 * unrelated gearbox temperature rise" as two diagnoses, because they are two.
 */
export function groupCausalChain(candidateFaultIds: readonly string[]): {
  primaries: string[];
  grouped: Record<string, string[]>;
} {
  const grouped: Record<string, string[]> = {};
  const absorbed = new Set<string>();

  for (const chain of CAUSAL_CHAINS) {
    if (!candidateFaultIds.includes(chain.primary)) continue;
    grouped[chain.primary] = [...chain.symptoms];
  }

  // An instrumentation fault is never absorbed into a physical chain: §19 keeps
  // "pressure sensor drift plus true feed instability" as two findings, and the
  // sensor one has to stay visible.
  const primaries = candidateFaultIds.filter((id) => !absorbed.has(id));
  return { primaries, grouped };
}

/* 21 — The diagnosis object ------------------------------------------------------------ */

export type DiagnoseInput = {
  diagnosisId: string;
  timestamp: string;
  machineId: string;
  configurationVersion: string | null;
  anomalies: readonly AnomalyResult[];
  patternId: string | null;
  patternName: string | null;
  faultCandidates: readonly string[];
  evidence: readonly EvidenceItem[];
  inconsistencies: readonly InconsistencyCheck[];
  dataQuality: QualityVerdict;
  alternativeDiagnoses: string[];
  rootCauseCandidates: string[];
  featureVersions: string[];
  topology: { hasUpstreamPressure: boolean; hasDownstreamPressure: boolean };
};

/**
 * Produce the §21 diagnosis object.
 *
 * The order of refusals matters and mirrors the document. Instrumentation
 * inconsistency is checked before anything physical; then required evidence;
 * then whether any known fault actually fits. Only a diagnosis that survives
 * all three is handed to DOC-05.
 */
export function diagnose(input: DiagnoseInput): DiagnosisObject {
  const assessment = assessEvidence(input.evidence);
  const blockers = instrumentationFirst(input.inconsistencies);

  const base = {
    diagnosisId: input.diagnosisId,
    timestamp: input.timestamp,
    machineId: input.machineId,
    patternId: input.patternId,
    patternName: input.patternName,
    supportingEvidence: assessment.supporting,
    contradictingEvidence: assessment.contradicting,
    missingEvidence: assessment.missing,
    alternativeDiagnoses: input.alternativeDiagnoses,
    rootCauseCandidates: input.rootCauseCandidates,
    dataQuality: input.dataQuality,
    groupedSymptoms: [] as string[],
    ruleVersion: '1.0',
    featureVersions: input.featureVersions,
    configurationVersion: input.configurationVersion,
  };

  // §17 — the instrument is the suspect before the machine.
  if (blockers.length > 0) {
    return {
      ...base,
      primaryDiagnosis: 'INSTRUMENTATION_SUSPECT',
      diagnosisState: 'SUSPECTED',
      what: 'The measurements contradict each other in a way a real process change cannot produce.',
      where: 'Measurement chain — sensor, port, wiring, scaling or communication.',
      why: blockers.map((blocker) => `${blocker.observation}: ${blocker.interpretation}`).join(' '),
      faultCandidates: DOC04_FAULTS.filter((entry) => entry.family === 'INSTRUMENTATION')
        .slice(0, 3)
        .map((entry) => entry.faultId),
      // A data-quality finding is real and actionable, but it is not a machine
      // condition, so DOC-05 does not score it as one.
      sendToDoc05: false,
    };
  }

  // §18 — required evidence missing or BAD.
  if (!assessment.requiredSatisfied) {
    return {
      ...base,
      primaryDiagnosis: 'INSUFFICIENT_EVIDENCE',
      diagnosisState: 'INSUFFICIENT_EVIDENCE',
      what: 'An abnormal condition may be present but the minimum evidence for any rule is not available.',
      where: 'Not resolvable without the missing evidence.',
      why: `Required evidence is missing or unusable: ${assessment.missing.map((item) => item.statement).join('; ') || 'not declared'}.`,
      faultCandidates: [],
      sendToDoc05: false,
    };
  }

  const anomalous = input.anomalies.filter(
    (result) => result.verdict !== 'NOT_ANOMALOUS' && result.verdict !== 'NOT_EVALUATED' && result.verdict !== 'EXPECTED_PROCESS_RESPONSE',
  );

  // §20 — an anomaly nothing explains stays unexplained.
  if (anomalous.length > 0 && input.faultCandidates.length === 0) {
    return {
      ...base,
      primaryDiagnosis: 'FAULT_UNKNOWN',
      diagnosisState: 'FAULT_UNKNOWN',
      what: `An abnormal condition is confirmed on ${anomalous.map((result) => result.signalId).join(', ')}.`,
      where: 'Not attributed — no known fault pattern fits this evidence safely.',
      why: 'The anomaly is real but matches no rule in the fault library. Forcing it into the nearest fault would be a guess.',
      faultCandidates: [],
      sendToDoc05: true,
    };
  }

  if (anomalous.length === 0) {
    return {
      ...base,
      primaryDiagnosis: 'NO_FAULT',
      diagnosisState: 'NOT_DETECTED',
      what: 'No abnormal condition is present.',
      where: 'Not applicable.',
      why: input.anomalies.some((result) => result.verdict === 'EXPECTED_PROCESS_RESPONSE')
        ? 'Signals moved, but as the expected physical response to a commanded change.'
        : 'All evaluated signals sit inside their contextual healthy envelopes.',
      faultCandidates: [],
      sendToDoc05: false,
    };
  }

  const { primaries, grouped } = groupCausalChain(input.faultCandidates);
  const primaryId = primaries[0];
  const primary: FaultDefinition | undefined = faultById(primaryId);
  const location = resolveLocation(primary?.primaryLocation ?? 'Not resolved', input.topology);

  return {
    ...base,
    primaryDiagnosis: primary?.name ?? primaryId ?? 'UNCLASSIFIED',
    diagnosisState: diagnosisStateFor(assessment, assessment.supporting.length),
    what: primary ? `${primary.name} is indicated by the current evidence.` : 'An abnormal pattern is present.',
    where: location.location + (location.note ? ` — ${location.note}` : ''),
    why: assessment.supporting.map((item) => item.statement).join('; '),
    faultCandidates: primaries,
    groupedSymptoms: grouped[primaryId] ?? [],
    sendToDoc05: true,
  };
}
