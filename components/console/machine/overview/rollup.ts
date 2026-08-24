import {
  aggregateHealth,
  inferFailureModes,
  TREND_FLAT_BAND,
  worstLevel,
  type ConditionLevel,
  type Diagnosis,
  type PointEvidence,
} from '../../../../lib/condition';
import type { ComponentType, MachineNode } from '../../../../lib/machines';
import type { PointCondition } from './usePointCondition';

// Turns the per-point conditions into the two things the page above the card
// grid is actually reporting: how each component of the machine is doing, and
// how the machine is doing overall. Pure functions over already-derived point
// data, so the ring, the component list, the diagnosis banner and the alarm
// counts cannot disagree with each other.

// Points the gateway has actually reported. Everything scored below is scored
// over these: a channel with no reading contributes no health, no level and no
// evidence, and is reported as a data-quality problem instead of being averaged
// in as though it were fine.
export function hasReading(condition: PointCondition): condition is PointCondition & { value: number; health: number } {
  return condition.value !== null && condition.health !== null;
}

export function toEvidence(condition: PointCondition & { value: number }): PointEvidence {
  return {
    id: condition.id,
    code: condition.code,
    label: condition.label,
    kind: condition.kind,
    level: condition.level,
    value: condition.value,
    unit: condition.unit,
    decimals: condition.band.decimals,
    rising: condition.rising,
  };
}

function soonestRul(points: PointCondition[]): number | null {
  const projected = points.map((p) => p.prognosis.daysToDanger).filter((d): d is number => d !== null);
  return projected.length > 0 ? Math.min(...projected) : null;
}

export type ComponentSummary = {
  componentId: string | null;
  label: string;
  // 'Unattributed' is not a component type — it is the bucket for readings whose
  // component could not be recovered from the saved mapping. See
  // attributeToComponent in lib/condition.ts for why that bucket exists.
  type: ComponentType | 'Unattributed';
  points: PointCondition[];
  health: number | null;
  level: ConditionLevel;
  soonestRulDays: number | null;
  diagnoses: Diagnosis[];
};

export function rollUpComponents(machine: MachineNode, conditions: PointCondition[]): ComponentSummary[] {
  const summaries: ComponentSummary[] = machine.components.map((component) => {
    const points = conditions.filter((c) => c.componentId === component.id);
    const reported = points.filter(hasReading);
    return {
      componentId: component.id,
      label: component.label,
      type: component.type,
      points,
      health: aggregateHealth(reported.map((p) => p.health)),
      level: worstLevel(reported.map((p) => p.level)),
      soonestRulDays: soonestRul(points),
      diagnoses: inferFailureModes(reported.map(toEvidence)),
    };
  });

  const orphans = conditions.filter((c) => c.componentId === null);
  if (orphans.length > 0) {
    summaries.push({
      componentId: null,
      label: 'Unattributed points',
      type: 'Unattributed',
      points: orphans,
      health: aggregateHealth(orphans.filter(hasReading).map((p) => p.health)),
      level: worstLevel(orphans.filter(hasReading).map((p) => p.level)),
      soonestRulDays: soonestRul(orphans),
      // No diagnosis for this bucket: the failure-mode rules read a signature
      // across one physical component, and readings from different components
      // sharing a bucket would produce combinations that never existed.
      diagnoses: [],
    });
  }

  return summaries;
}

export type MachineSummary = {
  health: number | null;
  level: ConditionLevel;
  dangerCount: number;
  alertCount: number;
  normalCount: number;
  soonestRulDays: number | null;
  // The point driving the machine's level — what the banner should talk about.
  worstPoint: PointCondition | null;
  // Points whose limits were inferred rather than commissioned, so the page can
  // say how much of its own assessment is resting on made-up numbers.
  inferredLimitCount: number;
  // Points that have climbed materially across the window — the same test the
  // cards' trend arrows use, so the two agree.
  movingUpCount: number;
};

export function summarizeMachine(conditions: PointCondition[]): MachineSummary {
  const reported = conditions.filter(hasReading);
  const byHealth = [...reported].sort((a, b) => a.health - b.health);

  return {
    health: aggregateHealth(reported.map((c) => c.health)),
    level: worstLevel(reported.map((c) => c.level)),
    dangerCount: conditions.filter((c) => c.level === 'danger').length,
    alertCount: conditions.filter((c) => c.level === 'alert').length,
    normalCount: conditions.filter((c) => c.level === 'normal').length,
    soonestRulDays: soonestRul(conditions),
    worstPoint: byHealth[0] ?? null,
    inferredLimitCount: conditions.filter((c) => !c.thresholds.configured).length,
    movingUpCount: conditions.filter((c) => c.changeFraction > TREND_FLAT_BAND).length,
  };
}

// Machine-wide failure modes, ranked. Inference runs per component (a signature
// only means something within one physical machine element) and the results are
// then ordered by how urgent they are, so the page can show the two or three
// worth acting on rather than every rule that fired.
const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 } as const;

export type RankedDiagnosis = Diagnosis & { componentLabel: string; rulDays: number | null };

export function rankDiagnoses(summaries: ComponentSummary[]): RankedDiagnosis[] {
  return summaries
    .flatMap((summary) =>
      summary.diagnoses.map((diagnosis) => ({ ...diagnosis, componentLabel: summary.label, rulDays: summary.soonestRulDays })),
    )
    .sort((a, b) => {
      // A dated prediction outranks an undated one at the same confidence, and a
      // sooner date outranks a later one — that is the order a planner reads in.
      const byConfidence = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
      if (byConfidence !== 0) return byConfidence;
      if (a.rulDays === null) return b.rulDays === null ? 0 : 1;
      if (b.rulDays === null) return -1;
      return a.rulDays - b.rulDays;
    });
}

// --- Health contributors, machine state, sensor health -----------------------

export type HealthFactor = {
  key: string;
  label: string;
  // null when nothing of this kind is mapped, which the UI reports rather than
  // scoring as healthy.
  health: number | null;
  level: ConditionLevel;
  count: number;
};

// Health per measurement kind, which is how an analyst reads a machine: vibration
// is one story, temperature another. Only kinds actually present are returned —
// inventing a "Pressure 100%" row for a machine with no pressure channel would be
// the most misleading number on the page.
export function healthByKind(conditions: PointCondition[]): HealthFactor[] {
  const order = ['Vibration', 'Temperature', 'Speed', 'Current', 'Pressure', 'Unknown'];
  const factors: HealthFactor[] = [];

  for (const kind of order) {
    const of = conditions.filter((c) => c.kind === kind);
    if (of.length === 0) continue;
    const reported = of.filter(hasReading);
    factors.push({
      key: kind,
      label: kind === 'Unknown' ? 'Unclassified' : kind === 'Current' ? 'Motor current' : kind,
      health: aggregateHealth(reported.map((p) => p.health)),
      level: worstLevel(reported.map((p) => p.level)),
      count: of.length,
    });
  }

  // Data quality is not a measurement but it belongs in the same list: a machine
  // whose channels are half unreachable is not healthy, however good the readings
  // that did arrive look.
  if (conditions.length > 0) {
    const online = conditions.filter((c) => c.online).length;
    const fraction = (online / conditions.length) * 100;
    factors.push({
      key: 'data',
      label: 'Sensor / data quality',
      health: fraction,
      level: fraction === 100 ? 'normal' : fraction >= 80 ? 'alert' : 'danger',
      count: conditions.length,
    });
  }

  return factors;
}

export type MachineRunState = {
  label: 'RUNNING' | 'STOPPED' | 'UNKNOWN';
  detail: string | null;
};

// Derived from a speed channel where the machine has one. With no speed channel
// there is nothing in the data model that says whether the machine is turning, so
// this reports UNKNOWN rather than guessing from vibration amplitude.
const RUNNING_ABOVE_RPM = 1;

export function deriveRunState(conditions: PointCondition[]): MachineRunState {
  const speed = conditions.find((c) => c.kind === 'Speed' && c.online && c.value !== null);
  if (!speed) {
    const offlineSpeed = conditions.some((c) => c.kind === 'Speed');
    return { label: 'UNKNOWN', detail: offlineSpeed ? 'speed channel offline' : 'no speed channel' };
  }
  const reading = speed.value as number;
  const running = reading > RUNNING_ABOVE_RPM;
  return {
    label: running ? 'RUNNING' : 'STOPPED',
    detail: `${reading.toFixed(speed.band.decimals)} ${speed.unit}`,
  };
}

export function sensorHealthCounts(conditions: PointCondition[]): { online: number; total: number } {
  return { online: conditions.filter((c) => c.online).length, total: conditions.length };
}
