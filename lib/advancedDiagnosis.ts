import { conditionHexes, type OverviewCondition } from './analysisOverview';

// Domain for the senior-analyst workbench. The analyst's own sequence — observe,
// compare, validate, decompose, correlate, hypothesise, root cause, act — is what
// the work areas are named after, so the tool follows the method rather than the
// data model.

export type WorkArea = 'machine' | 'train' | 'signal' | 'correlation' | 'events' | 'investigation';

export const WORK_AREAS: Array<{ id: WorkArea; label: string; step: string; purpose: string }> = [
  { id: 'machine', label: 'MACHINE', step: 'OBSERVE', purpose: 'Establish operating context before isolating anything.' },
  { id: 'train', label: 'TRAIN', step: 'DECOMPOSE', purpose: 'Find where the energy is strongest and whether it propagates.' },
  { id: 'signal', label: 'SIGNAL LAB', step: 'VALIDATE', purpose: 'Interrogate one measurement point.' },
  { id: 'correlation', label: 'CORRELATION', step: 'CORRELATE', purpose: 'Test dependence on speed, load and process.' },
  { id: 'events', label: 'EVENTS', step: 'COMPARE', purpose: 'Line the signal up against what happened to the machine.' },
  { id: 'investigation', label: 'INVESTIGATION', step: 'CONCLUDE', purpose: 'Build a defensible case and record a decision.' },
];

// Whether a reading is fit to reason from. Distinct from condition: a signal can
// be perfectly healthy and completely untrustworthy.
export type DataQuality = 'good' | 'questionable' | 'poor' | 'stale' | 'missing';

export const QUALITY_LABEL: Record<DataQuality, string> = {
  good: 'GOOD',
  questionable: 'QUESTIONABLE',
  poor: 'POOR',
  stale: 'STALE',
  missing: 'MISSING',
};

export function qualityHex(quality: DataQuality, isDark = true): string {
  const hexes = conditionHexes(isDark);
  return quality === 'good'
    ? hexes.healthy
    : quality === 'questionable'
      ? hexes.attention
      : quality === 'poor'
        ? hexes.alert
        : hexes.offline;
}

// --- Analysis tree ------------------------------------------------------------

export type TreeNodeKind = 'machine' | 'component' | 'subcomponent' | 'location' | 'signal';

export type AnalystTreeNode = {
  id: string;
  name: string;
  kind: TreeNodeKind;
  condition?: OverviewCondition;
  // Present on signal nodes: the rack channel this maps to, so the Signal Lab can
  // resolve a real card and a real sample rate.
  channelId?: string;
  unit?: string;
  children?: AnalystTreeNode[];
};

export function findNode(nodes: AnalystTreeNode[], id: string): AnalystTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = node.children ? findNode(node.children, id) : null;
    if (hit) return hit;
  }
  return null;
}

// The chain from root to the selected node, which is the breadcrumb the analyst
// needs to keep their place: machine → component → subcomponent → location →
// signal. Losing it is how a workbench stops being navigable.
export function pathTo(nodes: AnalystTreeNode[], id: string, trail: AnalystTreeNode[] = []): AnalystTreeNode[] {
  for (const node of nodes) {
    const next = [...trail, node];
    if (node.id === id) return next;
    const deeper = node.children ? pathTo(node.children, id, next) : [];
    if (deeper.length > 0) return deeper;
  }
  return [];
}

// --- Machine-wide condition ---------------------------------------------------

export type ConditionRow = {
  area: string;
  health: number | null;
  indicator: string;
  trend: string;
  condition: OverviewCondition;
  quality: DataQuality;
  lastChange: string;
};

export type PropagationRow = {
  location: string;
  current: number;
  baseline: number | null;
  unit: string;
  role: string;
  condition: OverviewCondition;
};

export function changePercent(row: PropagationRow): number | null {
  if (row.baseline === null || row.baseline === 0) return null;
  return ((row.current - row.baseline) / row.baseline) * 100;
}

// --- Correlation --------------------------------------------------------------

export type CorrelationRow = {
  pair: string;
  // Magnitude 0..1. Sign is carried separately so the UI never has to encode
  // polarity in a colour that collides with the status palette.
  strength: number;
  positive: boolean;
  lagMinutes: number | null;
  interpretation: string;
};

// --- Events -------------------------------------------------------------------

export type AnalystEventKind = 'diagnostic' | 'alarm' | 'maintenance' | 'operating' | 'data';

export type AnalystEvent = {
  id: string;
  at: string;
  event: string;
  kind: AnalystEventKind;
  analystValue: string;
};

export const EVENT_KIND_LABEL: Record<AnalystEventKind, string> = {
  diagnostic: 'DIAGNOSTIC',
  alarm: 'ALARM',
  maintenance: 'MAINTENANCE',
  operating: 'OPERATING',
  data: 'DATA',
};

// --- Evidence and hypotheses --------------------------------------------------

export type EvidenceRole = 'supports' | 'contradicts' | 'context';

export type EvidenceItem = {
  id: string;
  title: string;
  detail: string;
  role: EvidenceRole;
  // Where it came from, so a case can be re-walked later.
  source: string;
};

export type HypothesisStatus = 'confirmed' | 'probable' | 'possible' | 'unlikely' | 'rejected' | 'unresolved';

export const HYPOTHESIS_STATUS_LABEL: Record<HypothesisStatus, string> = {
  confirmed: 'CONFIRMED',
  probable: 'PROBABLE',
  possible: 'POSSIBLE',
  unlikely: 'UNLIKELY',
  rejected: 'REJECTED',
  unresolved: 'UNRESOLVED',
};

const STATUS_RANK: Record<HypothesisStatus, number> = {
  confirmed: 5,
  probable: 4,
  possible: 3,
  unresolved: 2,
  unlikely: 1,
  rejected: 0,
};

export type AnalystHypothesis = {
  id: string;
  name: string;
  status: HypothesisStatus;
  // A relative ranking the model produced, never a probability. See the note on
  // matchScoreCaveat: an uncalibrated engine can order explanations but cannot put
  // a percentage on one, and printing "86%" off a match score is the most
  // misleading thing a diagnostic tool can do.
  matchScore?: number;
  supporting: string[];
  contradicting: string[];
  // What would settle it. A hypothesis with no discriminating test is not a
  // hypothesis, it is a guess.
  discriminator?: string;
};

export const MATCH_SCORE_CAVEAT =
  'Match scores order explanations against each other. They are not probabilities, and this machine has no calibrated fault-probability model.';

export function rankHypotheses(hypotheses: AnalystHypothesis[]): AnalystHypothesis[] {
  return [...hypotheses].sort((a, b) => {
    const byStatus = STATUS_RANK[b.status] - STATUS_RANK[a.status];
    if (byStatus !== 0) return byStatus;
    return (b.matchScore ?? 0) - (a.matchScore ?? 0);
  });
}

// --- Root cause ---------------------------------------------------------------

// Cause → mechanism → fault → symptom, each step marked with whether it is
// established or still assumed. A chain drawn without that distinction reads as
// proven all the way down when usually only the last two links are measured.
export type ChainStep = {
  id: string;
  label: string;
  value: string;
  established: boolean;
};

export type Conclusion = {
  suggested: string;
  analystAssessment: string | null;
  failureMechanism: string | null;
  rootCause: string | null;
  remainingUncertainty: string;
  status: 'under-investigation' | 'accepted' | 'modified' | 'rejected' | 'awaiting-evidence';
};

export const CONCLUSION_STATUS_LABEL: Record<Conclusion['status'], string> = {
  'under-investigation': 'UNDER INVESTIGATION',
  accepted: 'ACCEPTED',
  modified: 'MODIFIED BY ANALYST',
  rejected: 'REJECTED',
  'awaiting-evidence': 'AWAITING EVIDENCE',
};
