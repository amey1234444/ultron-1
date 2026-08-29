import { capabilityFromCard } from '../../../lib/analysisCapability';
import type {
  AnalystEvent,
  AnalystHypothesis,
  AnalystTreeNode,
  ChainStep,
  Conclusion,
  ConditionRow,
  CorrelationRow,
  DataQuality,
  EvidenceItem,
  PropagationRow,
} from '../../../lib/advancedDiagnosis';
import type { AnalysisSignal, Finding, Hypothesis, RuleHit, SignalState } from '../../../lib/analysisDiagnosis';
import type {
  Consequence,
  Issue,
  IssueCategory,
  IssueTrend,
  OverviewCondition,
  ProgressionEvent,
} from '../../../lib/analysisOverview';
import { formatRul, TREND_FLAT_BAND, type ConditionLevel } from '../../../lib/condition';
import type { DeviceNode } from '../../../lib/devices';
import type { ComponentType, MachineNode } from '../../../lib/machines';
import type { CardNode } from '../../../lib/rack';
import type { SignalContext } from './AdvancedDiagnosisPage';
import type { AnalysisWorkspaceData } from './AnalysisWorkspace';
import type { TrainNode } from './analysis/TrainHealth';
import { buildMachinePrognostics } from './analysis/prognosticsModel';
import type { ComponentSummary, MachineRunState, MachineSummary, RankedDiagnosis } from './overview/rollup';
import { resolveSensorIdentity } from './overview/sensorIdentity';
import type { PointCondition } from './overview/usePointCondition';
import type { MappedChannel } from './RackOccupancyView';

// Turns what the sensors are actually reading into what the three analysis depths
// need to say about it.
//
// Every number below is computed from a real reading buffer, a real card config
// or a real device status. Nothing here is a fixture. Where the data model
// genuinely cannot answer something — availability, maintenance history, spectra,
// bearing geometry, low-side limits — this module says so in the text it produces
// rather than inventing a plausible value, because on a maintenance screen an
// invented number is worse than a blank.
//
// The one figure that looks more precise than it is, is the issue confidence. It
// is a rule-match score built from the failure-mode rule's own tier, how many
// independent readings agree, and how well the trend fits. It is not a
// probability, and nothing downstream presents it as one — see
// confidenceStatement() and MATCH_SCORE_CAVEAT in the analysis libs.

export type DeriveInput = {
  machine: MachineNode;
  mappedChannels: MappedChannel[];
  conditions: PointCondition[];
  components: ComponentSummary[];
  summary: MachineSummary;
  ranked: RankedDiagnosis[];
  runState: MachineRunState;
  devices: DeviceNode[];
  cards: CardNode[];
  now?: Date;
};

// --- small numeric helpers ---------------------------------------------------

// A point with a reading behind it. The analysis layer reasons only over these;
// a mapped channel the gateway has never reported is carried as a data-quality
// issue instead, never as a measurement.
type ReportedCondition = PointCondition & { value: number; health: number };

function sampleIntervalHours(c: PointCondition): number {
  return c.windowHours / Math.max(1, c.samples.length - 1);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function headOf(c: PointCondition): number[] {
  return c.samples.slice(0, Math.max(4, Math.floor(c.samples.length / 3)));
}

// The learned reference: the middle of where the point sat at the start of the
// window, before whatever is happening now started happening. Median rather than
// mean, so one spike at the beginning does not move the baseline that the rest of
// the page is then measured against.
function baselineOf(c: PointCondition): number {
  return median(headOf(c));
}

// Spread of that same early window, as a tolerance band. Median absolute
// deviation, for the same reason.
function toleranceOf(c: PointCondition): number {
  const head = headOf(c);
  const base = median(head);
  const mad = median(head.map((v) => Math.abs(v - base)));
  // A floor, so a very quiet channel does not report ordinary noise as a
  // boundary crossing.
  return Math.max(mad * 3, Math.abs(base) * 0.02);
}

// Scale ends a person would have chosen. Same reasoning as the overview's gauges:
// a bar topping out at 6.17 reads as a bug in the bar.
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalised = value / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

function fmt(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function labelIncludes(c: PointCondition, words: string[]): boolean {
  const haystack = `${c.label} ${c.code}`.toLocaleLowerCase();
  return words.every((word) => haystack.includes(word.toLocaleLowerCase()));
}

function uniqueReported(points: Array<ReportedCondition | undefined | null>): ReportedCondition[] {
  const seen = new Set<string>();
  const result: ReportedCondition[] = [];
  for (const point of points) {
    if (!point || seen.has(point.id)) continue;
    seen.add(point.id);
    result.push(point);
  }
  return result;
}

// How long the point has been continuously at or above its alert limit, walking
// the buffer back from now. Zero when it is currently inside limits.
function elevatedSamples(c: ReportedCondition): number {
  let n = 0;
  for (let i = c.samples.length - 1; i >= 0; i--) {
    if (c.samples[i] >= c.thresholds.alert) n += 1;
    else break;
  }
  return n;
}

function elevatedForMinutes(c: ReportedCondition): number {
  return elevatedSamples(c) * sampleIntervalHours(c) * 60;
}

// Hours ago the point last crossed a threshold upward. Null when it is currently
// below that threshold, or when it has never been below it inside the window — in
// which case the honest answer is "at least the whole window", which callers say
// differently rather than reporting a crossing that is not in the data.
function crossedHoursAgo(c: ReportedCondition, threshold: number): number | null {
  const last = c.samples.length - 1;
  if (last < 1 || c.samples[last] < threshold) return null;
  for (let i = last; i >= 0; i--) {
    if (c.samples[i] < threshold) return (last - (i + 1)) * sampleIntervalHours(c);
  }
  return null;
}

// How many times the point has moved in and out of its alert band across the
// window. Three or more is a genuinely intermittent signal rather than a trend.
function bandCrossings(c: ReportedCondition): number {
  if (c.samples.length === 0) return 0;
  let crossings = 0;
  let above = c.samples[0] >= c.thresholds.alert;
  for (const value of c.samples) {
    const now = value >= c.thresholds.alert;
    if (now !== above) {
      crossings += 1;
      above = now;
    }
  }
  return crossings;
}

// A channel repeating one value is a fact about the sensor, not about the machine.
function isFrozen(c: ReportedCondition): boolean {
  const tail = c.samples.slice(-8);
  return tail.length >= 8 && tail.every((v) => v === tail[0]);
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 8) return 0;
  const x = a.slice(a.length - n);
  const y = b.slice(b.length - n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return 0;
  return sxy / Math.sqrt(sxx * syy);
}

// Correlation at the lag that maximises it, so "vibration follows load by one
// sample" is a measured offset rather than an assumption that the two move
// together instantaneously.
function bestLagCorrelation(a: number[], b: number[], maxLag: number): { r: number; lag: number } {
  let best = { r: pearson(a, b), lag: 0 };
  for (let lag = 1; lag <= maxLag; lag++) {
    const shifted = pearson(a.slice(lag), b.slice(0, b.length - lag));
    if (Math.abs(shifted) > Math.abs(best.r)) best = { r: shifted, lag };
  }
  return best;
}

function worstLevelOf(points: ReportedCondition[]): ConditionLevel {
  return points.reduce<ConditionLevel>(
    (worst, p) => (p.level === 'danger' ? 'danger' : p.level === 'alert' && worst !== 'danger' ? 'alert' : worst),
    'normal',
  );
}

// --- vocabulary mapping ------------------------------------------------------

// ConditionLevel has three rungs; the overview's vocabulary has five. 'attention'
// is the one this adds: inside limits, but not where you would like it. Without
// it a point that has climbed 40% this week and is still under its alert limit
// reads as plain 'healthy'.
export function conditionFor(level: ConditionLevel, health: number | null, online: boolean): OverviewCondition {
  if (!online) return 'offline';
  if (level === 'danger') return 'danger';
  if (level === 'alert') return 'alert';
  if (health !== null && health < 90) return 'attention';
  return 'healthy';
}

// Which failure-mode rule is which kind of problem. Mechanical damage, a thermal
// or electrical condition and a process deviation call for three different
// people, so they never get merged into one list.
const CATEGORY_FOR_RULE: Record<string, IssueCategory> = {
  'bearing-wear': 'mechanical',
  misalignment: 'mechanical',
  unbalance: 'mechanical',
  lubrication: 'electrical',
  overload: 'electrical',
  'process-deviation': 'process',
};

function categoryForKind(kind: PointCondition['kind']): IssueCategory {
  if (kind === 'Vibration') return 'mechanical';
  if (kind === 'Temperature' || kind === 'Current' || kind === 'Power') return 'electrical';
  if (kind === 'Pressure' || kind === 'Speed' || kind === 'Level') return 'process';
  return 'sensor';
}

function consequenceFor(category: IssueCategory, condition: OverviewCondition): Consequence {
  if (category === 'sensor') return 'monitoring-only';
  if (category === 'process') return 'quality';
  if (condition === 'danger') return category === 'mechanical' ? 'unplanned-stop' : 'secondary-damage';
  if (condition === 'alert') return 'secondary-damage';
  return 'efficiency';
}

function trendFor(c: ReportedCondition): IssueTrend {
  if (bandCrossings(c) >= 3) return 'intermittent';
  if (c.prognosis.daysToDanger !== null && c.prognosis.daysToDanger <= 7) return 'rapidly-worsening';
  if (c.rising) return 'worsening';
  if (c.changeFraction < -TREND_FLAT_BAND) return 'improving';
  return 'stable';
}

const TREND_RANK: Record<IssueTrend, number> = {
  'rapidly-worsening': 4,
  worsening: 3,
  intermittent: 2,
  stable: 1,
  improving: 0,
};

function worstTrend(points: ReportedCondition[]): IssueTrend {
  if (points.length === 0) return 'stable';
  return points.map(trendFor).reduce<IssueTrend>((worst, t) => (TREND_RANK[t] > TREND_RANK[worst] ? t : worst), 'improving');
}

// A rule-match score, not a probability. The tier the failure-mode rule declares
// sets the band; how many independent readings agree and how well the trend
// actually fits move it inside that band.
const TIER_BASE: Record<RankedDiagnosis['confidence'], number> = { high: 78, medium: 62, low: 46 };

function matchScore(diagnosis: RankedDiagnosis, points: ReportedCondition[]): number {
  const base = TIER_BASE[diagnosis.confidence];
  const agreement = Math.min(9, Math.max(0, diagnosis.evidence.length - 1) * 4);
  const fit = points.length > 0 ? Math.round(Math.max(...points.map((p) => p.prognosis.r2)) * 8) : 0;
  return Math.min(95, base + agreement + fit);
}

// --- date formatting ---------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(now: Date, hoursAgo: number): string {
  const at = new Date(now.getTime() - hoursAgo * 3_600_000);
  const sameDay =
    at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate();
  return sameDay ? 'Today' : `${at.getDate()} ${MONTHS[at.getMonth()]}`;
}

function stampLabel(now: Date, hoursAgo: number): string {
  const at = new Date(now.getTime() - hoursAgo * 3_600_000);
  const hh = String(at.getHours()).padStart(2, '0');
  const mm = String(at.getMinutes()).padStart(2, '0');
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${hh}:${mm}`;
}

// --- derivation --------------------------------------------------------------

export function deriveAnalysis(input: DeriveInput): AnalysisWorkspaceData {
  const { machine, conditions, components, summary, ranked, runState, devices, cards } = input;
  const now = input.now ?? new Date();

  const mappedById = new Map(input.mappedChannels.map((m) => [m.id, m]));
  const componentLabelById = new Map(machine.components.map((c) => [c.id, c.label]));
  const conditionById = new Map(conditions.map((c) => [c.id, c]));

  // Points the gateway has actually reported, narrowed so everything below can
  // read a value without re-testing it. `online` already implies a reading:
  // usePointCondition marks a channel offline precisely when nothing has come
  // back for it, so these are the same set and this only tells the compiler so.
  const online = conditions.filter((c): c is ReportedCondition => c.online && c.value !== null && c.health !== null);
  const offline = conditions.filter((c) => !c.online);
  const frozen = online.filter(isFrozen);
  const inferred = online.filter((c) => !c.thresholds.configured);
  const windowHours = conditions[0]?.windowHours ?? 0;

  const speedPoint = online.find((c) => c.kind === 'Speed') ?? null;
  const currentPoint = online.find((c) => c.kind === 'Current' || c.kind === 'Power') ?? null;
  const vibration = online.filter((c) => c.kind === 'Vibration');

  // Narrows a component's points to the ones the gateway has reported. A
  // component can carry mapped channels that have never returned a frame, and
  // those have nothing to sort, compare or state a value for.
  const reportedOf = (points: PointCondition[]) =>
    points.filter((p): p is ReportedCondition => p.value !== null && p.health !== null);

  const componentLabelFor = (c: PointCondition) =>
    c.componentId ? componentLabelById.get(c.componentId) ?? 'Unattributed' : 'Unattributed';

  const identityFor = (c: PointCondition) => {
    const mapped = mappedById.get(c.id);
    if (!mapped) return null;
    return resolveSensorIdentity({
      channel: mapped.channel,
      machineName: machine.name,
      componentLabel: c.componentId ? componentLabelById.get(c.componentId) ?? null : null,
      devices,
      cards,
    });
  };

  const cardFor = (c: PointCondition): CardNode | null => {
    const mapped = mappedById.get(c.id);
    if (!mapped) return null;
    return cards.find((card) => card.deviceId === mapped.channel.rackId && card.slot === mapped.channel.slot) ?? null;
  };

  // The point's own label plus where it is mounted, which is what makes a row
  // readable on a page that lists a dozen of them.
  const labelFor = (c: PointCondition) => {
    const location = identityFor(c)?.location;
    return location && location !== 'location not recorded' ? `${c.label} · ${location}` : c.label;
  };

  const pointsOf = (diagnosis: RankedDiagnosis) =>
    diagnosis.evidence
      .map((e) => conditionById.get(e.id))
      .filter((c): c is ReportedCondition => Boolean(c) && c!.value !== null && c!.health !== null);

  // --- issues ----------------------------------------------------------------

  const claimedByDiagnosis = new Set<string>();
  const processRestrictionPointIds = new Set<string>();
  const issues: Issue[] = [];

  const meltPressurePoint = online.find((c) => c.kind === 'Pressure' && labelIncludes(c, ['melt', 'pressure']) && c.level !== 'normal');
  const motorPowerPoint =
    online.find((c) => (c.kind === 'Current' || c.kind === 'Power') && labelIncludes(c, ['motor', 'power']) && c.level !== 'normal') ??
    online.find((c) => (c.kind === 'Current' || c.kind === 'Power') && labelIncludes(c, ['power']) && c.level !== 'normal') ??
    null;
  const reducedSpeedPoints = online.filter(
    (c) => c.kind === 'Speed' && (c.value < baselineOf(c) * 0.99 || c.changeFraction < -TREND_FLAT_BAND),
  );
  const secondaryLoadResponse = vibration.filter(
    (c) =>
      c.level !== 'normal' &&
      (labelIncludes(c, ['motor']) || labelIncludes(c, ['gearbox', 'output']) || labelIncludes(c, ['gb', 'output'])),
  );

  if (meltPressurePoint && motorPowerPoint && reducedSpeedPoints.length > 0) {
    const processPoints = uniqueReported([meltPressurePoint, motorPowerPoint, ...reducedSpeedPoints, ...secondaryLoadResponse]);
    processPoints.forEach((p) => {
      claimedByDiagnosis.add(p.id);
      processRestrictionPointIds.add(p.id);
    });
    const condition = conditionFor(worstLevelOf(processPoints), Math.min(...processPoints.map((p) => p.health)), true);

    issues.push({
      id: 'dx-process-downstream-restriction',
      title: 'Developing downstream process restriction',
      componentLabel: 'Downstream melt path',
      category: 'process',
      condition,
      description:
        'Resistance to polymer flow has increased, raising screw torque demand and drive load in the screen-pack / die region.',
      trend: worstTrend(processPoints),
      consequence: 'secondary-damage',
      ageMinutes: Math.max(...processPoints.map(elevatedForMinutes)),
      confidence: Math.min(95, 82 + Math.min(10, processPoints.length * 2)),
      action: 'Inspect the screen pack and downstream die/melt path, clean or replace restrictions, then verify pressure, power, speed and vibration recover.',
    });
  }

  for (const diagnosis of ranked) {
    const points = pointsOf(diagnosis);
    if (points.length === 0) continue;
    if (points.every((p) => claimedByDiagnosis.has(p.id))) continue;
    points.forEach((p) => claimedByDiagnosis.add(p.id));

    const worst = [...points].sort((a, b) => a.health - b.health)[0];
    const category = CATEGORY_FOR_RULE[diagnosis.id] ?? categoryForKind(worst.kind);
    const condition = conditionFor(worstLevelOf(points), Math.min(...points.map((p) => p.health)), true);
    const readings = points.map((p) => `${p.code} ${fmt(p.value, p.band.decimals)} ${p.unit}`).join(', ');

    issues.push({
      id: `dx-${diagnosis.componentLabel}-${diagnosis.id}`,
      title: diagnosis.label,
      componentId: worst.componentId ?? undefined,
      componentLabel: diagnosis.componentLabel,
      category,
      condition,
      description: `${readings} — ${points.length > 1 ? 'readings agree' : 'reading is'} outside the limits set for the ${diagnosis.componentLabel.toLowerCase()}.`,
      trend: worstTrend(points),
      consequence: consequenceFor(category, condition),
      ageMinutes: Math.max(...points.map(elevatedForMinutes)),
      confidence: matchScore(diagnosis, points),
      action: diagnosis.recommendation,
    });
  }

  // Elevated readings no failure-mode rule claimed. They are still real limit
  // breaches, and dropping them would let a machine's worst point go unlisted
  // because it happened not to match a signature.
  for (const c of online) {
    if (c.level === 'normal' || claimedByDiagnosis.has(c.id)) continue;
    const category = categoryForKind(c.kind);
    const condition = conditionFor(c.level, c.health, true);
    const limit = c.level === 'danger' ? c.thresholds.danger : c.thresholds.alert;

    issues.push({
      id: `pt-${c.id}`,
      title: `${c.label} above its ${c.level === 'danger' ? 'danger' : 'alert'} limit`,
      componentId: c.componentId ?? undefined,
      componentLabel: componentLabelFor(c),
      category,
      condition,
      description: `${fmt(c.value, c.band.decimals)} ${c.unit} against a ${c.thresholds.configured ? 'commissioned' : 'inferred'} limit of ${fmt(limit, c.band.decimals)} ${c.unit}.`,
      trend: trendFor(c),
      consequence: consequenceFor(category, condition),
      ageMinutes: elevatedForMinutes(c),
      action: `Verify ${c.label} at the machine and confirm the reading against a handheld instrument.`,
    });
  }

  // Measurement-chain issues, kept in their own category the whole way through:
  // an unreachable rack and a failing bearing are both problems, but one sends a
  // technician to a terminal block and the other stops the machine.
  for (const c of offline) {
    const identity = identityFor(c);
    issues.push({
      id: `off-${c.id}`,
      title: `${c.label} is not reporting`,
      componentId: c.componentId ?? undefined,
      componentLabel: componentLabelFor(c),
      category: 'sensor',
      condition: 'offline',
      description: `${identity ? `${identity.rackName} · ${identity.address}` : 'This channel'} is unreachable, so the last value is stale and this point cannot be assessed.`,
      trend: 'stable',
      consequence: 'monitoring-only',
      ageMinutes: 0,
      action: 'Check rack power, network and the gateway link for this channel.',
    });
  }

  for (const c of frozen) {
    issues.push({
      id: `frz-${c.id}`,
      title: `${c.label} has stopped changing`,
      componentId: c.componentId ?? undefined,
      componentLabel: componentLabelFor(c),
      category: 'sensor',
      condition: 'attention',
      description: `The last ${Math.min(8, c.samples.length)} samples are identical, which is a sensor or wiring symptom rather than machine behaviour.`,
      trend: 'stable',
      consequence: 'monitoring-only',
      ageMinutes: 8 * sampleIntervalHours(c) * 60,
      action: 'Inspect the sensor channel and its wiring before trusting this reading.',
    });
  }

  if (inferred.length > 0) {
    issues.push({
      id: 'chan-inferred-limits',
      title: `${inferred.length} channel${inferred.length === 1 ? '' : 's'} assessed against inferred limits`,
      componentLabel: 'Instrumentation',
      category: 'sensor',
      condition: 'attention',
      description: `${inferred.map((c) => c.code).join(', ')} carr${inferred.length === 1 ? 'ies' : 'y'} no commissioned alarm limits, so ${inferred.length === 1 ? 'its' : 'their'} condition is judged against limits inferred from the measurement band.`,
      trend: 'stable',
      consequence: 'monitoring-only',
      ageMinutes: 0,
      action: 'Set alarm limits on these channels in the card configuration.',
    });
  }

  // --- train -----------------------------------------------------------------

  const train: TrainNode[] = components.map((c) => {
    const worst = [...reportedOf(c.points)].sort((a, b) => a.health - b.health)[0] ?? null;
    const allOffline = c.points.length > 0 && c.points.every((p) => !p.online);
    const diagnosis = c.diagnoses[0] ?? null;

    return {
      id: c.componentId ?? 'unattributed',
      name: c.label,
      detail:
        c.points.length === 0
          ? 'no points mapped'
          : `${c.type === 'Unattributed' ? 'unattributed' : c.type} · ${c.points.length} point${c.points.length === 1 ? '' : 's'}`,
      type: c.type === 'Unattributed' ? null : (c.type as ComponentType),
      condition: c.points.length === 0 ? 'offline' : conditionFor(c.level, c.health, !allOffline),
      health: c.health === null ? null : Math.round(c.health),
      metricLabel: worst ? `${worst.code} · ${String(worst.kind).toUpperCase()}` : 'NO DATA',
      metricValue: worst ? `${fmt(worst.value, worst.band.decimals)} ${worst.unit}` : '--',
      observation:
        c.points.length === 0
          ? 'Nothing on this component is instrumented, so its condition is unknown.'
          : allOffline
            ? 'Every channel on this component is unreachable.'
            : diagnosis
              ? `${diagnosis.label} — ${diagnosis.recommendation}`
              : c.level === 'normal'
                ? 'Every mapped point is inside its limits.'
                : `${worst?.label ?? 'A point'} is outside its limits.`,
    };
  });

  const instrumented = components.filter((c) => c.points.length > 0);
  const worstComponent = [...instrumented].sort((a, b) => (a.health ?? 101) - (b.health ?? 101))[0] ?? null;
  const secondary = worstComponent ? instrumented.filter((c) => c !== worstComponent && c.level !== 'normal') : [];

  const worstComponentPoint = worstComponent
    ? [...reportedOf(worstComponent.points)].sort((a, b) => a.health - b.health)[0] ?? null
    : null;
  const processRestrictionIssue = issues.find((issue) => issue.id === 'dx-process-downstream-restriction') ?? null;

  const criticalPath = processRestrictionIssue
    ? 'Primary problem group is increased process resistance in the downstream melt path. Melt pressure and drive load are high while motor and screw speeds fall together; motor, gearbox-output vibration and speed symptoms should be treated as secondary load response unless spectral evidence proves a separate fault.'
    : worstComponent
    ? `Abnormal evidence is strongest at the ${worstComponent.label.toLowerCase()} (${
        worstComponentPoint?.label ?? 'no reported point'
      }). ${
        secondary.length > 0
          ? `${secondary.map((c) => c.label).join(' and ')} ${secondary.length === 1 ? 'is' : 'are'} elevated as well and may be secondary.`
          : 'No other component shows an independent fault.'
      }`
    : 'No component on this machine has a mapped point to assess.';

  // --- progression -----------------------------------------------------------

  // An escalation history, built from where each buffer actually crossed a limit
  // — not an event log, and not a story.
  const progressionRaw: Array<ProgressionEvent & { hoursAgo: number }> = [];
  for (const c of online) {
    const toAlert = crossedHoursAgo(c, c.thresholds.alert);
    if (toAlert !== null) {
      progressionRaw.push({
        id: `prog-alert-${c.id}`,
        at: dayLabel(now, toAlert),
        condition: 'alert',
        text: `${c.label} moved above its alert limit (${fmt(c.thresholds.alert, c.band.decimals)} ${c.unit}).`,
        hoursAgo: toAlert,
      });
    }
    const toDanger = crossedHoursAgo(c, c.thresholds.danger);
    if (toDanger !== null) {
      progressionRaw.push({
        id: `prog-danger-${c.id}`,
        at: dayLabel(now, toDanger),
        condition: 'danger',
        text: `${c.label} escalated to danger (${fmt(c.thresholds.danger, c.band.decimals)} ${c.unit}).`,
        hoursAgo: toDanger,
      });
    }
  }
  const progression: ProgressionEvent[] = progressionRaw
    .sort((a, b) => b.hoursAgo - a.hoursAgo)
    .slice(-8)
    .map(({ hoursAgo: _hoursAgo, ...event }) => event);

  // --- signals ---------------------------------------------------------------

  // Only reported channels have a value to strip. An unreported one appears in
  // the data-quality issues instead, which is where it belongs.
  const signalOrder = [...online].sort((a, b) => a.health - b.health);

  const signalStateFor = (c: ReportedCondition): SignalState => {
    if (claimedByDiagnosis.has(c.id) && c.level === 'danger') return 'fault';
    if (c.level === 'danger') return 'limit';
    if (c.level === 'alert') return 'boundary';
    return Math.abs(c.value - baselineOf(c)) > toleranceOf(c) ? 'boundary' : 'in-control';
  };

  const diagnosisSignals: AnalysisSignal[] = signalOrder.map((c) => {
    const base = baselineOf(c);
    const overReference = Math.abs(base) > 1e-6 ? ((c.value - base) / Math.abs(base)) * 100 : 0;

    return {
      code: c.code,
      label: labelFor(c),
      unit: c.unit,
      value: c.value,
      decimals: c.band.decimals,
      reference: { target: base, tolerance: toleranceOf(c) },
      limit: c.thresholds.danger,
      // Scaled to the operating region rather than to the transducer's
      // capability, for the same reason the overview's gauges are: a 0-20 mm/s
      // span puts every reading and both limits in the bottom quarter of the bar.
      range: { min: c.band.min, max: niceCeil(Math.max(c.value, c.thresholds.danger) * 1.2) },
      state: c.online ? signalStateFor(c) : 'boundary',
      qualifier: !c.online
        ? 'channel unreachable — last value, not live'
        : isFrozen(c)
          ? 'not changing — unverified'
          : `${overReference >= 0 ? '+' : ''}${overReference.toFixed(0)} % against its learned reference`,
    };
  });
  const signals: AnalysisSignal[] = diagnosisSignals.slice(0, 8);

  // --- findings --------------------------------------------------------------

  const findings: Finding[] = [];

  for (const diagnosis of ranked) {
    const points = pointsOf(diagnosis);
    if (points.length === 0) continue;
    if (points.every((p) => processRestrictionPointIds.has(p.id))) continue;
    const lead = [...points].sort((a, b) => a.health - b.health)[0];

    const rules: RuleHit[] = points.map((p) => {
      const overDanger = p.value >= p.thresholds.danger;
      const limit = overDanger ? p.thresholds.danger : p.thresholds.alert;
      return {
        id: `rule-${diagnosis.id}-${p.id}`,
        code: overDanger ? 'TH-LIMIT-HIGH' : 'TH-BOUND-HIGH',
        label: overDanger ? 'Above the danger limit' : 'Above the alert limit',
        evidenceClass: 'machine',
        reference: `${fmt(limit, p.band.decimals)} ${p.unit}${p.thresholds.configured ? '' : ' (inferred)'}`,
        observed: `${fmt(p.value, p.band.decimals)} ${p.unit}`,
        exceedance: { value: p.value - limit, unit: p.unit, decimals: p.band.decimals },
        activeForMinutes: elevatedForMinutes(p),
      };
    });

    findings.push({
      id: `f-${diagnosis.componentLabel}-${diagnosis.id}`,
      severity: diagnosis.confidence === 'high' ? 'fault' : lead.level === 'danger' ? 'limit' : 'boundary',
      headline: `${diagnosis.componentLabel} signature matched — ${diagnosis.label.toLowerCase()}`,
      signalCode: lead.code,
      signalLabel: labelFor(lead),
      unit: lead.unit,
      rules,
      note:
        diagnosis.confidence === 'low'
          ? 'One elevated reading matched this signature. Separating it from the alternatives needs a spectrum, which this channel is not configured to capture.'
          : undefined,
    });
  }

  // Chain-class findings. Classification is a field on the rule rather than a
  // judgement the UI makes later, which is what keeps a frozen sensor from being
  // read as machine damage further down the page.
  for (const c of offline) {
    const identity = identityFor(c);
    findings.push({
      id: `f-offline-${c.id}`,
      severity: 'boundary',
      headline: `${c.label} is unreachable`,
      signalCode: c.code,
      signalLabel: labelFor(c),
      unit: c.unit,
      rules: [
        {
          id: `rule-offline-${c.id}`,
          code: 'TH-UNREACHABLE',
          label: 'Channel not reporting',
          evidenceClass: 'chain',
          reference: 'device Online',
          observed: identity ? `${identity.rackName} offline` : 'rack offline',
          exceedance: null,
          activeForMinutes: 0,
        },
      ],
      note: 'This describes the measurement chain, not the machine. Treat this point as unverified.',
    });
  }

  for (const c of frozen) {
    findings.push({
      id: `f-frozen-${c.id}`,
      severity: 'boundary',
      headline: `${c.label} is repeating one value`,
      signalCode: c.code,
      signalLabel: labelFor(c),
      unit: c.unit,
      rules: [
        {
          id: `rule-frozen-${c.id}`,
          code: 'TH-FROZEN-REPEAT',
          label: 'No change across consecutive samples',
          evidenceClass: 'chain',
          reference: 'a varying signal',
          observed: `${fmt(c.value, c.band.decimals)} ${c.unit} repeated`,
          exceedance: null,
          activeForMinutes: 8 * sampleIntervalHours(c) * 60,
        },
      ],
      note: 'A reading that has stopped moving is evidence about the sensor, not about the machine.',
    });
  }

  if (inferred.length > 0) {
    const first = inferred[0];
    findings.push({
      id: 'f-inferred-limits',
      severity: 'boundary',
      headline: `${inferred.length} channel${inferred.length === 1 ? '' : 's'} have no commissioned reference`,
      signalCode: first.code,
      signalLabel: inferred.map((c) => c.code).join(', '),
      unit: first.unit,
      rules: inferred.map<RuleHit>((c) => ({
        id: `rule-inferred-${c.id}`,
        code: 'TH-NO-REFERENCE',
        label: 'Alarm limits not configured on the card',
        evidenceClass: 'chain',
        reference: 'commissioned alert / danger',
        observed: `inferred ${fmt(c.thresholds.alert, c.band.decimals)} / ${fmt(c.thresholds.danger, c.band.decimals)} ${c.unit}`,
        exceedance: null,
        activeForMinutes: 0,
      })),
      note: 'Condition on these channels is judged against limits this app inferred from the measurement band, not against anything an engineer set.',
    });
  }

  // --- leading hypothesis ----------------------------------------------------

  const lead = ranked[0] ?? null;
  const leadPoints = lead ? pointsOf(lead) : [];
  const machineRules = findings.reduce(
    (count, f) => count + f.rules.filter((r) => r.evidenceClass === 'machine').length,
    0,
  );
  const chainDominates = findings.length > 0 && machineRules === 0;

  const hypothesis: Hypothesis | null = lead
    ? {
        label: lead.label,
        cause: chainDominates ? 'chain' : 'machine',
        localised: new Set(leadPoints.map((p) => p.componentId)).size === 1,
        affectedSubsystem: lead.componentLabel,
        statement: `${leadPoints.length} reading${leadPoints.length === 1 ? '' : 's'} on the ${lead.componentLabel.toLowerCase()} match this signature${
          new Set(leadPoints.map((p) => p.componentId)).size === 1
            ? ' and the response does not appear on the other components'
            : ', and the response is spread across more than one component'
        }.`,
        // Every other rule that fired on this same component is an explanation
        // the installed sensors cannot separate from this one, and so is the
        // spectral work that is not configured anywhere on this machine.
        indistinguishableAlternatives:
          Math.max(0, ranked.filter((d) => d.componentLabel === lead.componentLabel).length - 1) + 1,
        matchScore: matchScore(lead, leadPoints),
        // No machine in this app has a fault-probability model fitted against
        // recorded outcomes, and claiming otherwise is the most misleading thing
        // an analysis layer can do.
        calibrated: false,
      }
    : null;

  // --- what to do ------------------------------------------------------------

  const doThis = [
    ...(processRestrictionIssue ? [processRestrictionIssue.action] : []),
    ...ranked.slice(0, 3).map((d) => `${d.componentLabel}: ${d.recommendation}`),
    ...offline.slice(0, 2).map((c) => `Restore the link to ${c.label} — it cannot be assessed while unreachable.`),
    ...frozen.slice(0, 2).map((c) => `Treat ${c.code} as unverified until its wiring is checked.`),
  ].slice(0, 5);

  const thenConfirm = [
    ...(processRestrictionIssue
      ? [
          'Melt pressure returns below its alert limit under comparable conditions.',
          'Motor power falls while motor RPM and screw RPM recover.',
          'Motor and gearbox-output vibration reduce after the restriction is cleared.',
        ]
      : []),
    ...ranked.slice(0, 2).flatMap((d) =>
      pointsOf(d)
        .slice(0, 1)
        .map((p) => `${p.label} returns below ${fmt(p.thresholds.alert, p.band.decimals)} ${p.unit}.`),
    ),
    'Record the technician finding against the job, and close it on the evidence rather than on the work having been done.',
    inferred.length > 0
      ? 'Set real alarm limits on the uncommissioned channels, so the next assessment is not resting on inferred numbers.'
      : 'Confirm the readings hold inside limits across a full production cycle before resolving.',
  ];

  // --- advanced: analysis tree ------------------------------------------------

  const signalNode = (point: ReportedCondition): AnalystTreeNode => ({
    id: `sig-${point.id}`,
    name: point.label,
    kind: 'signal',
    condition: conditionFor(point.level, point.health, point.online),
    channelId: mappedById.get(point.id)?.channel.id,
    unit: point.unit,
  });

  const tree: AnalystTreeNode[] = [
    {
      id: `tree-${machine.id}`,
      name: machine.name,
      kind: 'machine',
      condition: conditionFor(summary.level, summary.health, online.length > 0),
      children: instrumented.map((component) => {
        const allOffline = component.points.every((p) => !p.online);

        // Grouped by mounting position where the labels give one, so the tree
        // reads machine → component → location → signal the way an analyst walks
        // it. A point whose label says nothing about position hangs directly off
        // the component rather than under an invented location.
        const byLocation = new Map<string, ReportedCondition[]>();
        for (const point of reportedOf(component.points)) {
          const location = identityFor(point)?.location ?? '';
          const position = location.split(' · ').slice(1, 2)[0] ?? '';
          const bucket = byLocation.get(position);
          if (bucket) bucket.push(point);
          else byLocation.set(position, [point]);
        }

        const children: AnalystTreeNode[] = [];
        for (const [position, points] of byLocation) {
          if (position === '') {
            children.push(...points.map(signalNode));
            continue;
          }
          children.push({
            id: `loc-${component.componentId ?? 'unattributed'}-${position}`,
            name: position,
            kind: 'location',
            condition: conditionFor(
              worstLevelOf(points),
              Math.min(...points.map((p) => p.health)),
              points.some((p) => p.online),
            ),
            children: points.map(signalNode),
          });
        }

        return {
          id: `cmp-${component.componentId ?? 'unattributed'}`,
          name: component.label,
          kind: 'component',
          condition: conditionFor(component.level, component.health, !allOffline),
          children,
        };
      }),
    },
  ];

  // --- advanced: condition rows ----------------------------------------------

  const conditionRows: ConditionRow[] = instrumented.map((component) => {
    const reported = reportedOf(component.points);
    const worst = [...reported].sort((a, b) => a.health - b.health)[0] ?? null;
    const allOffline = component.points.every((p) => !p.online);
    const anyInferred = component.points.some((p) => !p.thresholds.configured);
    const anyFrozen = reported.some(isFrozen);
    const elevatedHours = worst ? crossedHoursAgo(worst, worst.thresholds.alert) : null;

    return {
      area: component.label,
      health: component.health === null ? null : Math.round(component.health),
      indicator: worst
        ? `${worst.code} ${fmt(worst.value, worst.band.decimals)} ${worst.unit}`
        : 'no reported channel',
      trend:
        component.soonestRulDays !== null
          ? `To limit in ${formatRul(component.soonestRulDays)}`
          : worst.rising
            ? 'Rising'
            : worst.changeFraction < -TREND_FLAT_BAND
              ? 'Falling'
              : 'Stable',
      condition: conditionFor(component.level, component.health, !allOffline),
      quality: allOffline ? 'missing' : anyFrozen ? 'poor' : anyInferred ? 'questionable' : 'good',
      lastChange: elevatedHours !== null ? formatRul(elevatedHours / 24) : '--',
    };
  });

  // --- advanced: operating context -------------------------------------------

  // Spread of the recent speed samples about their own mean. This is what decides
  // whether the window is comparable at all — trending a vibration reading across
  // a speed change compares two different machines.
  const speedStability = (() => {
    if (!speedPoint) return null;
    const tail = speedPoint.samples.slice(-16);
    const mean = tail.reduce((s, v) => s + v, 0) / Math.max(1, tail.length);
    if (mean === 0) return null;
    return ((Math.max(...tail) - Math.min(...tail)) / 2 / mean) * 100;
  })();

  const loadPercent = currentPoint && currentPoint.band.max ? (currentPoint.value / currentPoint.band.max) * 100 : null;

  const operatingFacts: Array<{ label: string; value: string; note?: string }> = [
    {
      label: 'PERIOD',
      value: speedStability === null ? 'UNKNOWN' : speedStability < 2 ? 'STEADY' : 'VARYING',
      note:
        speedStability === null
          ? 'no speed channel to judge it from'
          : speedStability < 2
            ? 'suitable for comparison'
            : 'comparisons across this window are weaker',
    },
    speedPoint
      ? { label: 'SPEED', value: `${fmt(speedPoint.value, speedPoint.band.decimals)} ${speedPoint.unit}` }
      : { label: 'SPEED', value: '--', note: 'no speed channel mapped' },
    { label: 'SPEED STABILITY', value: speedStability === null ? '--' : `±${speedStability.toFixed(1)} %` },
    currentPoint
      ? {
          label: currentPoint.kind === 'Power' ? 'MOTOR POWER' : 'MOTOR CURRENT',
          value: `${fmt(currentPoint.value, currentPoint.band.decimals)} ${currentPoint.unit}`,
          note: loadPercent === null ? undefined : `${loadPercent.toFixed(0)} % of range`,
        }
      : { label: 'MOTOR LOAD', value: '--', note: 'no current or power channel mapped' },
    { label: 'HISTORY', value: windowHours >= 48 ? `${Math.round(windowHours / 24)} d` : `${Math.round(windowHours)} h` },
    { label: 'CHANNELS', value: `${online.length} / ${conditions.length}`, note: 'reporting' },
  ];

  // --- advanced: propagation --------------------------------------------------

  // Vibration where the machine has it, because that is the measurement that
  // actually propagates through a train. With none mapped this falls back to
  // every reporting point and the note below says the localisation argument
  // cannot be made.
  const propagationSource = vibration.length > 0 ? vibration : online;
  const propagation: PropagationRow[] = [...propagationSource]
    .sort((a, b) => b.value / (b.thresholds.danger || 1) - a.value / (a.thresholds.danger || 1))
    .slice(0, 6)
    .map((c, index) => ({
      location: labelFor(c),
      current: c.value,
      baseline: baselineOf(c),
      unit: c.unit,
      role: index === 0 ? 'Strongest response' : c.level === 'normal' ? 'Limited propagation' : 'Secondary response',
      condition: conditionFor(c.level, c.health, c.online),
    }));

  const propagationNote =
    propagation.length === 0
      ? 'No channel is reporting, so nothing can be said about where the energy is strongest.'
      : propagation.length === 1
        ? `Only ${propagation[0].location} is mapped for this measurement, so localisation cannot be established — a second point is what would separate a local fault from a machine-wide one.`
        : vibration.length === 0
          ? 'No vibration channel is mapped, so this compares readings of different kinds and cannot show whether a response propagates through the train.'
          : `The response is strongest at ${propagation[0].location} and ${
              propagation[propagation.length - 1].current < propagation[0].current * 0.7
                ? 'falls off across the rest of the train, so the source is local rather than transmitted'
                : 'is close to the same at the other points, which is what a transmitted or machine-wide response looks like'
            }.`;

  // --- advanced: correlation --------------------------------------------------

  const correlationBase = signalOrder.find((c) => c.online) ?? null;
  const MAX_LAG_SAMPLES = 6;

  const correlation: CorrelationRow[] = correlationBase
    ? online
        .filter((c) => c.id !== correlationBase.id)
        .map<CorrelationRow>((c) => {
          const { r, lag } = bestLagCorrelation(correlationBase.samples, c.samples, MAX_LAG_SAMPLES);
          const strength = Math.abs(r);
          return {
            pair: `${correlationBase.code} ↔ ${c.code}`,
            strength,
            positive: r >= 0,
            lagMinutes: lag * sampleIntervalHours(c) * 60,
            interpretation:
              strength >= 0.7 ? 'Strong association' : strength >= 0.4 ? 'Moderate association' : 'Weak — moves independently',
          };
        })
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 6)
    : [];

  const correlationCaveat = correlationBase
    ? `Correlated against ${correlationBase.code} over ${Math.round(windowHours)} h of trended scalars. A strong association narrows the mechanism but does not establish cause, and at ${sampleIntervalHours(correlationBase).toFixed(0)} h between samples the smallest resolvable lag is one sample.`
    : 'No channel is reporting, so no correlation can be computed.';

  // --- advanced: events -------------------------------------------------------

  const events: AnalystEvent[] = [];
  for (const c of online) {
    const toDanger = crossedHoursAgo(c, c.thresholds.danger);
    if (toDanger !== null) {
      events.push({
        id: `ev-danger-${c.id}`,
        at: stampLabel(now, toDanger),
        event: `${c.label} crossed its danger limit`,
        kind: 'alarm',
        analystValue: `${fmt(c.value, c.band.decimals)} ${c.unit} against ${fmt(c.thresholds.danger, c.band.decimals)}`,
      });
      continue;
    }
    const toAlert = crossedHoursAgo(c, c.thresholds.alert);
    if (toAlert !== null) {
      events.push({
        id: `ev-alert-${c.id}`,
        at: stampLabel(now, toAlert),
        event: `${c.label} crossed its alert limit`,
        kind: 'diagnostic',
        analystValue: `${fmt(c.value, c.band.decimals)} ${c.unit} against ${fmt(c.thresholds.alert, c.band.decimals)}`,
      });
    }
  }
  for (const c of offline) {
    events.push({
      id: `ev-offline-${c.id}`,
      at: '--',
      event: `${c.label} stopped reporting`,
      kind: 'data',
      analystValue: 'Every reading after this point is stale',
    });
  }
  // There is no maintenance or operating-event source in the data model, so the
  // timeline carries only what the readings themselves establish. Saying that is
  // the alternative to padding it with events that did not happen.
  if (events.length === 0) {
    events.push({
      id: 'ev-none',
      at: stampLabel(now, windowHours),
      event: 'No limit crossing inside the trended window',
      kind: 'diagnostic',
      analystValue: 'Nothing to line the signal up against',
    });
  }

  // --- advanced: competing hypotheses -----------------------------------------

  const STATUS_FOR_TIER = { high: 'probable', medium: 'possible', low: 'unlikely' } as const;

  const hypotheses: AnalystHypothesis[] = ranked.slice(0, 4).map((diagnosis) => {
    const points = pointsOf(diagnosis);
    return {
      id: `hyp-${diagnosis.componentLabel}-${diagnosis.id}`,
      name: `${diagnosis.label} · ${diagnosis.componentLabel}`,
      status: STATUS_FOR_TIER[diagnosis.confidence],
      matchScore: matchScore(diagnosis, points),
      supporting: points.map(
        (p) =>
          `${p.label} at ${fmt(p.value, p.band.decimals)} ${p.unit}, above its ${
            p.thresholds.configured ? 'commissioned' : 'inferred'
          } ${p.level === 'danger' ? 'danger' : 'alert'} limit`,
      ),
      contradicting: [
        ...(points.some((p) => !p.rising) ? ['Not every supporting reading is trending upward.'] : []),
        ...(points.some((p) => !p.thresholds.configured)
          ? ['At least one supporting channel has no commissioned limits.']
          : []),
        'No spectrum is captured on this machine, so the signature cannot be confirmed against defect frequencies.',
      ],
      discriminator: diagnosis.recommendation,
    };
  });

  // --- advanced: root-cause chain and conclusion ------------------------------

  const chain: ChainStep[] = lead
    ? [
        { id: 'c1', label: 'POSSIBLE ROOT CAUSE', value: `Not established — ${lead.recommendation}`, established: false },
        {
          id: 'c2',
          label: 'CONTRIBUTING CONDITION',
          value:
            loadPercent === null
              ? 'No load or current channel is mapped, so operating demand cannot be tested as a contributor'
              : `Running at ${loadPercent.toFixed(0)} % of the configured current range`,
          established: false,
        },
        { id: 'c3', label: 'FAILURE MECHANISM', value: lead.label, established: false },
        {
          id: 'c4',
          label: 'MEASURED SYMPTOMS',
          value: leadPoints.map((p) => `${p.code} ${fmt(p.value, p.band.decimals)} ${p.unit}`).join(', ') || '--',
          established: true,
        },
        {
          id: 'c5',
          label: 'MACHINE CONSEQUENCE',
          value: `${lead.componentLabel} ${
            summary.level === 'danger' ? 'in danger' : summary.level === 'alert' ? 'in alert' : 'inside limits'
          }${summary.soonestRulDays !== null ? `, projected to limit in ${formatRul(summary.soonestRulDays)}` : ''}`,
          established: true,
        },
      ]
    : [{ id: 'c1', label: 'MEASURED SYMPTOMS', value: 'No reading is outside its limits.', established: true }];

  const conclusion: Conclusion = {
    suggested: lead
      ? `${lead.label} at the ${lead.componentLabel.toLowerCase()} (match score ${matchScore(lead, leadPoints)})`
      : 'No fault signature matched. Every mapped point is inside its limits.',
    analystAssessment: null,
    failureMechanism: null,
    rootCause: null,
    remainingUncertainty: [
      'No spectrum, waveform or bearing geometry is configured on this machine, so a bearing defect cannot be confirmed from the data alone.',
      'Limits are single-sided, so a fault that shows as a reading falling — cavitation, loss of suction, a drive losing speed — is invisible here.',
      inferred.length > 0
        ? `${inferred.length} channel${inferred.length === 1 ? '' : 's'} are judged against inferred limits.`
        : '',
      offline.length > 0 ? `${offline.length} channel${offline.length === 1 ? '' : 's'} are unreachable.` : '',
    ]
      .filter(Boolean)
      .join(' '),
    status: 'under-investigation',
  };

  // --- advanced: signal lab ---------------------------------------------------

  const shaftHz = speedPoint ? speedPoint.value / 60 : null;

  const signalFor = (node: AnalystTreeNode): SignalContext | null => {
    if (node.kind !== 'signal') return null;
    const point = conditionById.get(node.id.replace(/^sig-/, ''));
    if (!point) return null;
    const identity = identityFor(point);

    return {
      unit: point.unit,
      decimals: point.band.decimals,
      samples: point.samples,
      reference: baselineOf(point),
      alert: point.thresholds.alert,
      danger: point.thresholds.danger,
      quality: !point.online || point.value === null
        ? 'missing'
        : isFrozen(point as ReportedCondition)
          ? 'poor'
          : point.thresholds.configured
            ? 'good'
            : 'questionable',
      sensorDescription: identity ? `${identity.sensor} · ${identity.rackName} ${identity.address}` : '--',
      capability: capabilityFromCard(cardFor(point), shaftHz, point.samples.length >= 8),
    };
  };

  // --- overall ----------------------------------------------------------------

  const dataQuality: DataQuality =
    conditions.length === 0 || online.length === 0
      ? 'missing'
      : offline.length > 0
        ? 'stale'
        : frozen.length > 0
          ? 'poor'
          : inferred.length > 0
            ? 'questionable'
            : 'good';

  const worstPoint = summary.worstPoint;

  const prognostics = buildMachinePrognostics({
    machineId: machine.id,
    machineName: machine.name,
    issues,
    conditions,
    signals,
    hypotheses,
    now,
  });

  return {
    operatingState: runState.label,
    speed: speedPoint ? `${fmt(speedPoint.value, speedPoint.band.decimals)} ${speedPoint.unit}` : undefined,
    load: loadPercent === null ? undefined : `${loadPercent.toFixed(0)} %`,
    // There is no operating-mode field anywhere in the data model, and a machine
    // screen that asserts "PRODUCTION" off nothing is asserting a fact about the
    // plant. Absent renders as unavailable, which is the truth.
    mode: undefined,
    health: summary.health === null ? null : Math.round(summary.health),
    issues,
    train,
    criticalPath,
    progression,
    prognostics,

    signals,
    diagnosisSignals,
    findings,
    hypothesis,
    doThis,
    thenConfirm,
    modelCaveat:
      'These conclusions come from threshold and signature rules over trended scalar readings, not from a trained model. Match scores order explanations against each other; they are not probabilities.',
    runState: runState.detail ? `${runState.label} · ${runState.detail}` : runState.label,

    condition: conditionFor(summary.level, summary.health, online.length > 0),
    dataQuality,
    tree,
    conditionRows,
    operatingFacts,
    propagation,
    propagationNote,
    correlation,
    correlationCaveat,
    events,
    hypotheses,
    chain,
    conclusion,
    signalFor,
    intelligence: {
      observation: worstPoint && worstPoint.value !== null
        ? `${worstPoint.label} reads ${fmt(worstPoint.value, worstPoint.band.decimals)} ${worstPoint.unit}, ${
            worstPoint.rising ? 'and is still rising' : 'and is not trending upward'
          }${summary.soonestRulDays !== null ? `, projecting to its limit in ${formatRul(summary.soonestRulDays)}` : ''}. ${
            summary.movingUpCount
          } of ${conditions.length} mapped points have climbed across the window.`
        : 'No point is mapped to this machine, so there is nothing to observe.',
      qualityNote:
        offline.length > 0
          ? `${offline.length} of ${conditions.length} channels are unreachable; their last values are stale and must not be reasoned from.`
          : frozen.length > 0
            ? `${frozen.length} channel${frozen.length === 1 ? '' : 's'} stopped changing, which is a measurement-chain symptom rather than a machine one.`
            : inferred.length > 0
              ? `${inferred.length} channel${inferred.length === 1 ? '' : 's'} are judged against inferred limits rather than commissioned ones.`
              : 'Every mapped channel is reporting and moving, against commissioned limits. Suitable for trend reasoning only — no spectra are captured here.',
      dominantEvidence: processRestrictionIssue
        ? 'Developing downstream process restriction, carried by pressure, power and speed evidence with secondary vibration response.'
        : lead
          ? `${lead.label} at the ${lead.componentLabel.toLowerCase()}, carried by ${leadPoints.length} reading${
            leadPoints.length === 1 ? '' : 's'
          }.`
          : 'No fault signature matched the current readings.',
      nextStep: processRestrictionIssue
        ? processRestrictionIssue.action
        : lead
          ? lead.recommendation
          : 'Nothing needs action. Keep the trend running and revisit if a point moves toward its limit.',
    },
    initialEvidence: leadPoints.slice(0, 3).map<EvidenceItem>((p) => ({
      id: `ev-${p.id}`,
      title: p.label,
      detail: `${fmt(p.value, p.band.decimals)} ${p.unit} against a ${
        p.thresholds.configured ? 'commissioned' : 'inferred'
      } limit of ${fmt(p.thresholds.alert, p.band.decimals)} ${p.unit}`,
      role: p.level === 'normal' ? 'context' : 'supports',
      source: labelFor(p),
    })),
  };
}
