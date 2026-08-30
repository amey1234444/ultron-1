// Analysis → Prognosis.
//
// This page answers one question the diagnosis page cannot: the machine is
// within its limits today, so what is coming, when, and how sure are we? It is
// deliberately NOT a sensor dashboard and not a second diagnosis screen — the
// live values on it are here only as the evidence behind a projection.
//
// The reading order is the argument:
//
//   hero        what is developing, and is the machine safe right now
//   summary     component, status, score, direction, alert, danger, confidence
//   trend       the shape of it — measured history, today, projection, limits
//   evidence    the readings the projection is computed from
//   correlation why the engine reached this conclusion
//   outlook     what happens next, on a timeline
//   guidance    what a person should inspect, and whether to stop the machine
//
// All arithmetic lives in `analysis/prognosisViewModel.ts`. Nothing in this
// file computes a threshold crossing, a score or a confidence — it reads them.
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { AnalysisSignal, Finding, Hypothesis } from '../../../lib/analysisDiagnosis';
import { type Issue, type OverviewCondition, type ProgressionEvent } from '../../../lib/analysisOverview';
import { QUALITY_LABEL, type AnalystHypothesis, type ChainStep, type Conclusion, type DataQuality } from '../../../lib/advancedDiagnosis';
import { consolePalette, text } from '../../ui';
import { AnalysisTabs, type AnalysisDepth } from './analysis/AnalysisTabs';
import type { ActionPriority } from './analysis/ActionList';
import { buildPrognosisViewModel } from './analysis/prognosisViewModel';
import { emptyPrognostics, type MachinePrognosticsResult } from './analysis/prognosticsModel';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';
import { PrognosisHero, PrognosisSummaryGrid, type SummaryFact } from './prognosis/PrognosisHero';
import {
  EvidenceCorrelationPanel,
  MaintenanceGuidancePanel,
  PredictiveOutlookPanel,
  PrognosisTrendPanel,
  SupportingEvidenceStrip,
} from './prognosis/PrognosisPanels';
import { PrognosisLoadingState, PrognosisStatePanel } from './prognosis/PrognosisStates';

export type MachineProDiagnosisPageProps = {
  machineName: string;
  template: string;
  hierarchyPath?: string;
  feed: FeedStatus;
  ageSeconds?: number | null;
  runState?: string;

  signals: AnalysisSignal[];
  findings: Finding[];
  hypothesis: Hypothesis | null;
  issues?: Issue[];
  progression?: ProgressionEvent[];
  condition?: OverviewCondition;
  dataQuality?: DataQuality;
  prognostics?: MachinePrognosticsResult;
  hypotheses?: AnalystHypothesis[];
  chain?: ChainStep[];
  conclusion?: Conclusion;

  doThis: string[];
  doThisPriority?: ActionPriority;
  thenConfirm: string[];
  modelCaveat?: string;

  onVerifyChain?: () => void;
  onOpenTrend?: () => void;
  onSelectDepth?: (depth: AnalysisDepth) => void;
  selectedProblemId?: string | null;
  onSelectProblem?: (problemId: string) => void;
  tabsTrailing?: ReactNode;
  onSelectMachine?: () => void;
  onRefresh?: () => void;
  /** True while the analysis payload for this machine is still being read. */
  loading?: boolean;
};

function formatDays(days: number | null): string {
  if (days === null) return '—';
  if (days <= 0) return 'NOW';
  return `${Math.round(days)} DAYS`;
}

export function MachineProDiagnosisPage({
  machineName,
  template,
  hierarchyPath,
  feed,
  ageSeconds,
  runState,
  signals,
  condition = 'healthy',
  dataQuality = 'good',
  prognostics,
  onSelectDepth,
  selectedProblemId,
  onSelectProblem,
  tabsTrailing,
  onSelectMachine,
  onRefresh,
  loading = false,
}: MachineProDiagnosisPageProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const model = useMemo(
    () =>
      buildPrognosisViewModel({
        prognostics: prognostics ?? emptyPrognostics(),
        signals,
        condition,
        runState,
        selectedPredictionId: selectedProblemId,
      }),
    [prognostics, signals, condition, runState, selectedProblemId],
  );

  const [metricId, setMetricId] = useState(model.metrics[0]?.id ?? '');
  useEffect(() => {
    setMetricId((current) => (model.metrics.some((metric) => metric.id === current) ? current : (model.metrics[0]?.id ?? '')));
  }, [model.metrics]);

  const metric = model.metrics.find((candidate) => candidate.id === metricId) ?? model.metrics[0] ?? null;

  const summaryFacts: SummaryFact[] = [
    {
      label: 'CURRENT CONDITION',
      value: model.machineCondition.toLocaleUpperCase(),
      note: model.runStateNote,
      tone: model.machineCondition === 'healthy' ? 'healthy' : 'attention',
    },
    { label: 'AFFECTED COMPONENT', value: model.affectedComponent, note: model.machineArea || 'Machine train' },
    { label: 'PROGNOSIS STATUS', value: model.statusLabel, note: model.statusNote, tone: 'attention' },
    {
      label: 'DEGRADATION SCORE',
      value: model.degradationScore === null ? '—' : `${model.degradationScore}%`,
      note: model.degradationNote,
      tone: 'attention',
    },
    { label: 'TREND DIRECTION', value: model.trendLabel, note: model.trendNote, tone: model.trendTone },
    { label: 'PREDICTED ALERT', value: formatDays(model.predictedAlertDays), note: 'Estimated crossing', tone: 'attention' },
    { label: 'DANGER WINDOW', value: formatDays(model.predictedDangerDays), note: 'If trend persists', tone: 'danger' },
    {
      label: 'CONFIDENCE',
      value: model.confidence === null ? '—' : `${Math.round(model.confidence)}%`,
      note: model.confidenceNote,
    },
  ];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
      <MachineHeader
        machineName={machineName}
        template={template}
        path={hierarchyPath}
        subtitle="Long-term degradation direction and projected threshold crossing"
        section="ANALYSIS / PROGNOSIS"
        feed={feed}
        ageSeconds={ageSeconds}
        onSelectMachine={onSelectMachine}
        onRefresh={onRefresh}
      />

      <AnalysisTabs active="diagnosis" onSelect={onSelectDepth} trailing={tabsTrailing} />

      {loading ? (
        <PrognosisLoadingState />
      ) : model.state !== 'ready' || !metric ? (
        <PrognosisStatePanel
          state={model.state === 'ready' ? 'healthy' : model.state}
          headline={model.headline}
          summary={model.summary}
          footnote={`${QUALITY_LABEL[dataQuality]} data quality · ${signals.length} measurement points · source ${model.sourceLabel}`}
        />
      ) : (
        <>
          <PrognosisHero model={model} />
          <PrognosisSummaryGrid facts={summaryFacts} />

          <PrognosisTrendPanel
            model={model}
            metric={metric}
            onSelectMetric={(id) => {
              setMetricId(id);
              if (id !== 'overall') onSelectProblem?.(id);
            }}
          />

          <SupportingEvidenceStrip items={model.evidence} />

          <View className="flex-row flex-wrap items-stretch" style={{ gap: 12 }}>
            <EvidenceCorrelationPanel model={model} />
            <PredictiveOutlookPanel model={model} />
            <MaintenanceGuidancePanel model={model} />
          </View>

          <Text className={text.micro} style={{ color: palette.inkFaint }}>
            Projections are onto the configured ALERT and DANGER thresholds, not a predicted failure date. Remaining Useful Life stays
            unavailable until a validated failure model exists for this measurement.
          </Text>
        </>
      )}
    </ScrollView>
  );
}
