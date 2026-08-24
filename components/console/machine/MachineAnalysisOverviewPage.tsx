import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  CONDITION_HEX,
  countByCondition,
  overallState,
  overallTrend,
  prioritiseIssues,
  summariseCondition,
  topActions,
  type Issue,
  type ProgressionEvent,
} from '../../../lib/analysisOverview';
import { cn } from '../../../lib/cn';
import { Panel } from '../../Panel';
import { AnalysisTabs, type AnalysisDepth } from './analysis/AnalysisTabs';
import { ConditionSummary, PriorityActions } from './analysis/ConditionSummary';
import { FaultProgression, GoDeeper, OperatingContext } from './analysis/ContextAndProgression';
import { CategoryBreakdown, IssueList } from './analysis/IssueList';
import { StatusStrip } from './analysis/StatusStrip';
import { TrainHealth, type TrainNode } from './analysis/TrainHealth';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';

const HALF = { flexGrow: 1, flexBasis: 420, minWidth: 300 } as const;

export type MachineAnalysisOverviewPageProps = {
  machineName: string;
  template: string;
  hierarchyPath?: string;

  feed: FeedStatus;
  ageSeconds?: number | null;

  // Operating state, kept entirely separate from condition.
  operatingState: string;
  speed?: string;
  load?: string;
  mode?: string;

  // Supporting only. Never sets the machine's condition — see overallState.
  health: number | null;

  issues: Issue[];
  train: TrainNode[];
  criticalPath?: string;
  progression: ProgressionEvent[];

  loading?: boolean;

  onSelectDepth?: (depth: AnalysisDepth) => void;
  // Rendered at the end of the depth row — used for the link out to the machine
  // overview, so that cross-link lives in an existing row.
  tabsTrailing?: ReactNode;
  advancedAvailable?: boolean;
  onOpenDiagnosis?: (issue?: Issue) => void;
  onSelectTrainNode?: (node: TrainNode) => void;
  onSelectMachine?: () => void;
  onRefresh?: () => void;
};

// Analysis · Overview — the shallowest of the three analysis depths.
//
// Its whole job is to let someone who is not an analyst answer six questions in
// under ten seconds: is the machine okay, what is wrong, where, how serious, is
// it getting worse, what should I do first. Everything on it is arranged in that
// order, and nothing signal-level appears here at all — no spectra, no waveforms,
// no rule tables. Those are Diagnosis and Advanced Diagnosis.
//
// Two invariants are enforced rather than trusted:
//   * A health score can never set or soften the machine's condition.
//   * A sensor or data-quality problem is never presented as machine damage.
export function MachineAnalysisOverviewPage({
  machineName,
  template,
  hierarchyPath,
  feed,
  ageSeconds,
  operatingState,
  speed,
  load,
  mode,
  health,
  issues,
  train,
  criticalPath,
  progression,
  loading = false,
  onSelectDepth,
  tabsTrailing,
  advancedAvailable = true,
  onOpenDiagnosis,
  onSelectTrainNode,
  onSelectMachine,
  onRefresh,
}: MachineAnalysisOverviewPageProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  const state = useMemo(() => overallState(issues, health), [issues, health]);
  const counts = useMemo(() => countByCondition(issues), [issues]);
  const trend = useMemo(() => overallTrend(issues), [issues]);
  const summary = useMemo(() => summariseCondition(issues, state), [issues, state]);
  const actions = useMemo(() => topActions(issues), [issues]);
  const ordered = useMemo(() => prioritiseIssues(issues), [issues]);

  const offline = feed === 'offline';
  const dataFreshness = {
    label: offline ? 'STALE' : ageSeconds === null || ageSeconds === undefined ? 'UNKNOWN' : `${Math.round(ageSeconds)} s`,
    healthy: !offline && ageSeconds !== null && ageSeconds !== undefined,
  };

  // The oldest open issue is when this started, since that is the thing the
  // reader means by "how long has this been going on".
  const startedLabel = ordered.length > 0 ? `${Math.max(...ordered.map((i) => Math.round(i.ageMinutes / 60 / 24)))} d ago` : '--';

  const header = (
    <MachineHeader
      machineName={machineName}
      template={template}
      // The eyebrow already says ANALYSIS / OVERVIEW, so the path must not
      // repeat it — the two together read as a doubled breadcrumb.
      path={hierarchyPath}
      subtitle="Is the machine okay?"
      section="ANALYSIS / OVERVIEW"
      feed={feed}
      ageSeconds={ageSeconds}
      onSelectMachine={onSelectMachine}
      onRefresh={onRefresh}
    />
  );

  const tabs = <AnalysisTabs
      active="overview"
      onSelect={onSelectDepth}
      available={{ advanced: advancedAvailable }}
      trailing={tabsTrailing}
    />;

  if (loading) {
    return (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 20 }}>
        {header}
        {tabs}
        <Panel>
          <Text className={cn('font-body text-[12px] italic', mutedClass)}>Loading analysis for this machine…</Text>
        </Panel>
      </ScrollView>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 20 }}>
      {header}
      {tabs}

      {/* Stale data is stated before anything derived from it. Every number below
          came from readings this old, and a reader must know that first. */}
      {offline ? (
        <View
          className="flex-row flex-wrap items-center gap-2 rounded-xl border px-4 py-3"
          style={{ borderColor: `${CONDITION_HEX.offline}59`, backgroundColor: `${CONDITION_HEX.offline}14` }}
        >
          <Text style={{ color: CONDITION_HEX.offline }} className="font-mono text-[11px] font-bold tracking-wider">
            OFFLINE
          </Text>
          <Text className={cn('flex-1 font-body text-[11px]', inkClass)}>
            No live data from this machine. Everything below is the last valid picture, not the current one.
          </Text>
        </View>
      ) : null}

      <StatusStrip
        state={state}
        counts={counts}
        trend={trend}
        operatingState={operatingState}
        operatingDetail={[speed, load].filter(Boolean).join(' · ') || undefined}
        totalIssues={issues.length}
      />

      <Panel status={state.condition === 'danger' ? 'critical' : state.condition === 'alert' ? 'warning' : 'success'}>
        <ConditionSummary
          summary={summary}
          state={state}
          trend={trend}
          startedLabel={startedLabel}
          dataFreshness={dataFreshness}
        />
      </Panel>

      {actions.length > 0 ? (
        <Panel>
          <PriorityActions actions={actions} />
        </Panel>
      ) : null}

      <Panel>
        <IssueList issues={issues} onOpenDiagnosis={onOpenDiagnosis ? (issue) => onOpenDiagnosis(issue) : undefined} />
      </Panel>

      {issues.length > 0 ? (
        <Panel>
          <CategoryBreakdown issues={issues} />
        </Panel>
      ) : null}

      <Panel>
        <TrainHealth nodes={train} criticalPath={criticalPath} onSelectNode={onSelectTrainNode} />
      </Panel>

      <View className="flex-row flex-wrap gap-4">
        <View style={HALF}>
          <Panel>
            <OperatingContext
              state={state}
              operatingState={operatingState}
              speed={speed}
              load={load}
              mode={mode}
              lastData={dataFreshness}
            />
          </Panel>
        </View>
        <View style={HALF}>
          <Panel>
            <FaultProgression events={progression} />
          </Panel>
        </View>
      </View>

      <Panel>
        <GoDeeper
          onOpenDiagnosis={onOpenDiagnosis ? () => onOpenDiagnosis() : undefined}
          onOpenAdvanced={advancedAvailable && onSelectDepth ? () => onSelectDepth('advanced') : undefined}
          advancedAvailable={advancedAvailable}
        />
      </Panel>
    </ScrollView>
  );
}
