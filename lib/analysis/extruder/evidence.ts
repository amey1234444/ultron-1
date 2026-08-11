// Fault evidence objects and deterministic categorical sensor fusion.
//
// Ported from the digital twin's `diagnostics/evidence.py`.
//
// Why categorical
// ---------------
// No calibrated fault-probability model exists for this machine, so a numeric
// "confidence" would be fabricated. Evidence is combined categorically, and the
// only numeric output is an ordinal ENGINEERING_MATCH_SCORE derived
// deterministically from the evidence counts. It ranks candidates. It is not a
// probability, not a confidence, and must never be rendered as one.
//
// Combination rule
//   primary contradicted, no primary support -> ELIMINATED
//   >=1 primary and >=1 supporting            -> STRONG_CANDIDATE
//   >=1 primary only                          -> CANDIDATE
//   no primary, >=1 supporting                -> WEAK
//   nothing                                   -> INSUFFICIENT

export const EvidenceStrength = {
  PRIMARY: 'PRIMARY_MATCH',
  SUPPORTING: 'SUPPORTING_MATCH',
  WEAK: 'WEAK_MATCH',
  CONTRADICTED: 'CONTRADICTED',
} as const;

export type EvidenceStrengthValue = (typeof EvidenceStrength)[keyof typeof EvidenceStrength];

export const MatchClass = {
  STRONG_CANDIDATE: 'STRONG_CANDIDATE',
  CANDIDATE: 'CANDIDATE',
  WEAK: 'WEAK',
  INSUFFICIENT: 'INSUFFICIENT',
  ELIMINATED: 'ELIMINATED',
} as const;

export type MatchClassValue = (typeof MatchClass)[keyof typeof MatchClass];

/** Ordinal rank used only for deterministic ordering of candidates. */
const CLASS_RANK: Record<MatchClassValue, number> = {
  STRONG_CANDIDATE: 4,
  CANDIDATE: 3,
  WEAK: 2,
  INSUFFICIENT: 1,
  ELIMINATED: 0,
};

/** Marker that eliminates a hypothesis outright. */
export const PRIMARY_CONTRADICTION = 'PRIMARY_CONTRADICTION';

/** One measurement-derived statement about one fault hypothesis. */
export type FaultEvidence = {
  faultId: string;
  sensor: string;
  feature: string;
  observedValue: number | null;
  expectedDirection: string;
  strength: EvidenceStrengthValue;
  source: string;
  thresholdId?: string;
  description: string;
};

/** The fused position on one fault hypothesis. */
export type FaultAssessment = {
  faultId: string;
  matchClass: MatchClassValue;
  engineeringMatchScore: number;
  primary: FaultEvidence[];
  supporting: FaultEvidence[];
  weak: FaultEvidence[];
  contradicting: FaultEvidence[];
};

export function isCandidate(assessment: FaultAssessment): boolean {
  return assessment.matchClass === MatchClass.STRONG_CANDIDATE || assessment.matchClass === MatchClass.CANDIDATE;
}

export function contributingSensors(assessment: FaultAssessment): string[] {
  const sensors = new Set<string>();
  for (const item of [...assessment.primary, ...assessment.supporting, ...assessment.weak]) sensors.add(item.sensor);
  return [...sensors].sort();
}

/** Combine all evidence for one fault into a single categorical assessment. */
export function fuse(faultId: string, evidence: FaultEvidence[]): FaultAssessment {
  const primary = evidence.filter((item) => item.strength === EvidenceStrength.PRIMARY);
  const supporting = evidence.filter((item) => item.strength === EvidenceStrength.SUPPORTING);
  const weak = evidence.filter((item) => item.strength === EvidenceStrength.WEAK);
  const contradicting = evidence.filter((item) => item.strength === EvidenceStrength.CONTRADICTED);

  // A contradicted primary measurement eliminates the hypothesis: the measurement
  // that most directly observes the mechanism says the mechanism is not acting.
  //
  // It eliminates ONLY when no primary evidence supports the hypothesis. Faults
  // are location-specific: a healthy gearbox channel must not eliminate a motor
  // fault that the motor channel directly observes. Where support and refutation
  // both exist the hypothesis is retained and the conflict is reported.
  const primaryContradicted = contradicting.some((item) => item.expectedDirection === PRIMARY_CONTRADICTION);
  let matchClass: MatchClassValue;
  if (primaryContradicted && primary.length === 0) matchClass = MatchClass.ELIMINATED;
  else if (primary.length > 0 && supporting.length > 0) matchClass = MatchClass.STRONG_CANDIDATE;
  else if (primary.length > 0) matchClass = MatchClass.CANDIDATE;
  else if (supporting.length > 0) matchClass = MatchClass.WEAK;
  else matchClass = MatchClass.INSUFFICIENT;

  // Ordinal score: class dominates, then evidence breadth. Deterministic and explainable.
  const engineeringMatchScore =
    CLASS_RANK[matchClass] * 1000 +
    primary.length * 100 +
    supporting.length * 10 +
    weak.length -
    contradicting.length;

  return { faultId, matchClass, engineeringMatchScore, primary, supporting, weak, contradicting };
}

/** Order assessments strongest-first, deterministically. */
export function rank(assessments: FaultAssessment[]): FaultAssessment[] {
  return [...assessments].sort(
    (a, b) => b.engineeringMatchScore - a.engineeringMatchScore || a.faultId.localeCompare(b.faultId),
  );
}
