import { formatDuration } from './analysisDiagnosis';
import { LEVEL_HEX } from './condition';
import { consolePalette } from './consoleTheme';

// The Analysis Overview's domain: what is wrong with this machine, how serious,
// where, since when, whether it is getting worse, and what to do first.
//
// This is the shallowest of the three analysis depths. It carries no spectra, no
// waveforms and no rule-level evidence — those belong to Diagnosis and Advanced
// Diagnosis. What it does carry is the prioritisation, and the two separations
// that stop an overview from lying:
//
//   * Operating state is not machine condition. A machine can be RUNNING and in
//     DANGER at the same time, and both facts matter.
//   * A health score never overrides a condition. See overallState.

// Five rungs, mapped onto tokens the app already has rather than a new palette.
// 'attention' is the rung between healthy and alert — inside limits, but not
// where you would like it — and it takes the gold accent. 'offline' is the
// absence of a reading, not a degree of badness.
export type OverviewCondition = 'healthy' | 'attention' | 'alert' | 'danger' | 'offline';

export const CONDITION_LABEL: Record<OverviewCondition, string> = {
  healthy: 'HEALTHY',
  attention: 'ATTENTION',
  alert: 'ALERT',
  danger: 'DANGER',
  offline: 'OFFLINE',
};

export const CONDITION_HEX: Record<OverviewCondition, string> = {
  healthy: LEVEL_HEX.normal,
  attention: '#C9A15C',
  alert: LEVEL_HEX.alert,
  danger: LEVEL_HEX.danger,
  offline: '#737373',
};

/**
 * The same map, resolved for the theme on screen.
 *
 * `CONDITION_HEX` above is the dark ramp and stays that way — it is what the
 * pure derivation modules, which have no React context, hand to callers.
 * Anything that actually paints resolves through here instead, because light
 * mode is not the dark palette on a white page: see the note at the top of
 * `lib/consoleTheme.ts`. Which condition a thing is in does not change; only
 * what that condition is painted.
 */
export function conditionHexes(isDark: boolean): Record<OverviewCondition, string> {
  const palette = consolePalette(isDark);
  return {
    healthy: palette.accent,
    // The fourth step — "notable, not yet alarming". A muted gold on the dark
    // console; on white it has to sit between neutral and the alert amber
    // without becoming a second alert.
    attention: isDark ? '#C9A15C' : '#8A6A2F',
    alert: palette.warning,
    danger: palette.critical,
    offline: palette.neutral,
  };
}

// Offline ranks above healthy but below a real condition: not knowing is worse
// than knowing it is fine, and better than knowing it is failing.
const CONDITION_RANK: Record<OverviewCondition, number> = {
  healthy: 0,
  offline: 1,
  attention: 2,
  alert: 3,
  danger: 4,
};

export function worstCondition(conditions: OverviewCondition[]): OverviewCondition {
  return conditions.reduce<OverviewCondition>(
    (worst, c) => (CONDITION_RANK[c] > CONDITION_RANK[worst] ? c : worst),
    'healthy',
  );
}

// --- Issues -------------------------------------------------------------------

// Categories stay separate all the way through. A dropping-out sensor and a
// failing bearing are both "problems", but one is a reason to send a technician
// to a terminal block and the other is a reason to stop the machine. Collapsing
// them into one severity list is how an overview makes a data-quality problem
// look like mechanical damage.
export type IssueCategory = 'mechanical' | 'process' | 'electrical' | 'sensor';

export const CATEGORY_LABEL: Record<IssueCategory, string> = {
  mechanical: 'Mechanical',
  process: 'Process',
  electrical: 'Electrical / thermal',
  sensor: 'Sensor / data quality',
};

export const CATEGORY_BLURB: Record<IssueCategory, string> = {
  mechanical: 'Condition of rotating and driven parts',
  process: 'How the machine is being run',
  electrical: 'Windings, supply and thermal behaviour',
  sensor: 'Whether the measurement can be trusted',
};

// Whether a category describes the machine or the instrumentation measuring it.
// Used to keep the two apart in the breakdown, and to stop a sensor issue from
// being read as machine damage.
export function categoryIsAboutMachine(category: IssueCategory): boolean {
  return category !== 'sensor';
}

export type IssueTrend = 'rapidly-worsening' | 'worsening' | 'intermittent' | 'stable' | 'improving';

export const TREND_LABEL: Record<IssueTrend, string> = {
  'rapidly-worsening': 'Rapidly worsening',
  worsening: 'Slowly worsening',
  intermittent: 'Intermittent',
  stable: 'Stable',
  improving: 'Improving',
};

const TREND_RANK: Record<IssueTrend, number> = {
  'rapidly-worsening': 4,
  worsening: 3,
  intermittent: 2,
  stable: 1,
  improving: 0,
};

// What happens if this is left alone. Ranked, because two issues at the same
// severity are not equally urgent if one risks a stop and the other costs
// efficiency.
export type Consequence = 'unplanned-stop' | 'secondary-damage' | 'quality' | 'efficiency' | 'monitoring-only';

export const CONSEQUENCE_LABEL: Record<Consequence, string> = {
  'unplanned-stop': 'Unplanned stop',
  'secondary-damage': 'Secondary damage',
  quality: 'Product quality',
  efficiency: 'Efficiency loss',
  'monitoring-only': 'Monitoring only',
};

const CONSEQUENCE_RANK: Record<Consequence, number> = {
  'unplanned-stop': 4,
  'secondary-damage': 3,
  quality: 2,
  efficiency: 1,
  'monitoring-only': 0,
};

export type Issue = {
  id: string;
  title: string;
  // Where it is, in the machine's own structure. Used to point the reader at a
  // component rather than at a channel code.
  componentId?: string;
  componentLabel: string;
  category: IssueCategory;
  condition: OverviewCondition;
  // One sentence. Not a paragraph of generated prose.
  description: string;
  trend: IssueTrend;
  consequence: Consequence;
  // How long it has been open. Sortable, and formatted for display from the same
  // number so the two cannot disagree.
  ageMinutes: number;
  // Diagnostic confidence, 0-100, where the analysis layer produces one. Absent
  // is a legitimate value and displays as "not rated" rather than as zero.
  confidence?: number;
  action: string;
};

export function issueAgeLabel(issue: Issue): string {
  return formatDuration(issue.ageMinutes);
}

// Severity first, then how fast it is moving, then what it costs, then how sure
// the model is, then how long it has gone unresolved. Exactly the order in which
// a planner would argue about two competing jobs.
export function prioritiseIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const bySeverity = CONDITION_RANK[b.condition] - CONDITION_RANK[a.condition];
    if (bySeverity !== 0) return bySeverity;

    const byTrend = TREND_RANK[b.trend] - TREND_RANK[a.trend];
    if (byTrend !== 0) return byTrend;

    const byConsequence = CONSEQUENCE_RANK[b.consequence] - CONSEQUENCE_RANK[a.consequence];
    if (byConsequence !== 0) return byConsequence;

    const byConfidence = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (byConfidence !== 0) return byConfidence;

    // Older unresolved issues outrank newer ones at otherwise equal weight.
    return b.ageMinutes - a.ageMinutes;
  });
}

export type ConditionCounts = Record<OverviewCondition, number>;

export function countByCondition(issues: Issue[]): ConditionCounts {
  const counts: ConditionCounts = { healthy: 0, attention: 0, alert: 0, danger: 0, offline: 0 };
  for (const issue of issues) counts[issue.condition] += 1;
  return counts;
}

export type CategorySummary = {
  category: IssueCategory;
  count: number;
  worst: OverviewCondition;
  // The components involved, so the card says where rather than only how many.
  where: string;
};

export function summariseCategories(issues: Issue[]): CategorySummary[] {
  const order: IssueCategory[] = ['mechanical', 'process', 'electrical', 'sensor'];

  return order
    .map((category) => {
      const inCategory = issues.filter((i) => i.category === category);
      return {
        category,
        count: inCategory.length,
        worst: worstCondition(inCategory.map((i) => i.condition)),
        where: inCategory.map((i) => i.componentLabel).join(' · '),
      };
    })
    .filter((summary) => summary.count > 0);
}

// --- Overall state ------------------------------------------------------------

export type OverallState = {
  // The machine's condition: the worst thing that is true about it.
  condition: OverviewCondition;
  // The health score, which is supporting information and nothing more.
  health: number | null;
  // What the score alone would have said, kept only so the UI can show that the
  // two disagree rather than silently taking the worse one.
  healthSuggests: OverviewCondition;
  // True when the score would have understated the machine's condition. A health
  // of 78 next to a bearing in DANGER is not a healthy machine, and an overview
  // that leads with the average is how a critical fault gets averaged away.
  scoreUnderstates: boolean;
  criticalReason: string | null;
};

// Health thresholds for the *supporting* reading only. Never used to set the
// machine's condition.
export function conditionFromHealth(health: number | null): OverviewCondition {
  if (health === null) return 'offline';
  if (health >= 90) return 'healthy';
  if (health >= 75) return 'attention';
  if (health >= 55) return 'alert';
  return 'danger';
}

export function overallState(issues: Issue[], health: number | null): OverallState {
  const prioritised = prioritiseIssues(issues);
  const condition = worstCondition(issues.map((i) => i.condition));
  const healthSuggests = conditionFromHealth(health);
  const worstIssue = prioritised[0] ?? null;

  return {
    condition,
    health,
    healthSuggests,
    scoreUnderstates: CONDITION_RANK[condition] > CONDITION_RANK[healthSuggests],
    criticalReason: worstIssue ? `${worstIssue.componentLabel} · ${worstIssue.title}` : null,
  };
}

export type OverallTrend = 'worsening' | 'stable' | 'improving';

export const OVERALL_TREND_LABEL: Record<OverallTrend, string> = {
  worsening: 'WORSENING',
  stable: 'STABLE',
  improving: 'IMPROVING',
};

export function overallTrend(issues: Issue[]): { trend: OverallTrend; detail: string } {
  if (issues.length === 0) return { trend: 'stable', detail: 'No open issues' };

  const rapid = issues.filter((i) => i.trend === 'rapidly-worsening').length;
  const slow = issues.filter((i) => i.trend === 'worsening').length;
  const improving = issues.filter((i) => i.trend === 'improving').length;

  if (rapid > 0) return { trend: 'worsening', detail: `${rapid} deteriorating rapidly` };
  if (slow > 0) return { trend: 'worsening', detail: 'Slowly deteriorating' };
  if (improving > 0 && improving === issues.length) return { trend: 'improving', detail: 'All open issues improving' };
  return { trend: 'stable', detail: 'Holding steady' };
}

// --- Priority actions ---------------------------------------------------------

export type PriorityAction = {
  priority: string;
  area: string;
  condition: OverviewCondition;
  title: string;
  description: string;
};

// The top few issues, restated as instructions. Deliberately capped: an overview
// that lists twelve recommendations has not prioritised anything.
export function topActions(issues: Issue[], limit = 3): PriorityAction[] {
  return prioritiseIssues(issues)
    .slice(0, limit)
    .map((issue, index) => ({
      priority: `P${index + 1}`,
      area: issue.componentLabel.toUpperCase(),
      condition: issue.condition,
      title: issue.action,
      description: issue.description,
    }));
}

// --- Plain-language summary ---------------------------------------------------

export type ConditionSummaryText = {
  headline: string;
  body: string;
};

// Short, structured, and assembled from the data rather than generated prose.
// The six questions an overview has to answer are answered in order: what is
// happening, how serious, where, since when, is it getting worse, what first.
export function summariseCondition(issues: Issue[], state: OverallState): ConditionSummaryText {
  if (issues.length === 0) {
    return {
      headline: 'No open issues. Every monitored parameter is inside its limits.',
      body: 'Nothing requires attention. Condition monitoring is running and the machine is behaving as commissioned.',
    };
  }

  const prioritised = prioritiseIssues(issues);
  const lead = prioritised[0];
  const counts = countByCondition(issues);
  const machineIssues = issues.filter((i) => categoryIsAboutMachine(i.category));
  const sensorIssues = issues.filter((i) => !categoryIsAboutMachine(i.category));

  const headline =
    state.condition === 'danger'
      ? 'Machine condition is deteriorating and one issue needs attention now.'
      : state.condition === 'alert'
        ? 'Machine condition is degraded and should be looked at this shift.'
        : state.condition === 'attention'
          ? 'Machine is inside its limits, with parameters worth watching.'
          : 'Machine condition is acceptable.';

  const parts: string[] = [];
  parts.push(`${issues.length} open issue${issues.length === 1 ? '' : 's'}.`);
  parts.push(
    `The most critical is ${lead.title.toLowerCase()} at the ${lead.componentLabel.toLowerCase()}, ${TREND_LABEL[
      lead.trend
    ].toLowerCase()} for ${issueAgeLabel(lead)}.`,
  );

  if (counts.danger > 0) parts.push(`Address the ${lead.componentLabel.toLowerCase()} first; the rest can continue under monitoring.`);

  // Named separately and last, so a data-quality problem is never folded into
  // the machine's condition.
  if (sensorIssues.length > 0) {
    parts.push(
      `${sensorIssues.length} of these ${sensorIssues.length === 1 ? 'is' : 'are'} a data-quality problem rather than machine damage, which reduces diagnostic confidence on ${
        machineIssues.length > 0 ? 'the affected channels' : 'this machine'
      }.`,
    );
  }

  return { headline, body: parts.join(' ') };
}

// --- Fault progression --------------------------------------------------------

export type ProgressionEvent = {
  id: string;
  at: string;
  condition: OverviewCondition;
  text: string;
};
