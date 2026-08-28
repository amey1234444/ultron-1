import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { AnalysisSignal, Finding, Hypothesis } from '../../../lib/analysisDiagnosis';
import {
  CONDITION_LABEL,
  conditionHexes,
  issueAgeLabel,
  prioritiseIssues,
  TREND_LABEL,
  type Issue,
  type OverviewCondition,
  type ProgressionEvent,
} from '../../../lib/analysisOverview';
import { QUALITY_LABEL, type AnalystHypothesis, type ChainStep, type Conclusion, type DataQuality } from '../../../lib/advancedDiagnosis';
import { cn } from '../../../lib/cn';
import { Panel } from '../../Panel';
import { AnalysisTabs, type AnalysisDepth } from './analysis/AnalysisTabs';
import type { ActionPriority } from './analysis/ActionList';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';

const FORECAST_LIST = { flexGrow: 3, flexBasis: 330, minWidth: 280 } as const;
const FORECAST_DETAIL = { flexGrow: 7, flexBasis: 720, minWidth: 320 } as const;
const DETAIL_CELL = { flexGrow: 1, flexBasis: 210, minWidth: 180 } as const;
const ACTION_CELL = { flexGrow: 1, flexBasis: 280, minWidth: 240 } as const;

const DEFAULT_CONCLUSION: Conclusion = {
  suggested: 'No automatic conclusion is active.',
  analystAssessment: null,
  failureMechanism: null,
  rootCause: null,
  remainingUncertainty: 'No unresolved diagnostic uncertainty has been recorded for this snapshot.',
  status: 'under-investigation',
};

type ForecastStatus = 'FORECAST_AVAILABLE' | 'MONITORING' | 'LIMITED' | 'UNAVAILABLE';

type ProForecast = {
  id: string;
  faultName: string;
  faultId: string;
  condition: OverviewCondition;
  location: string[];
  status: ForecastStatus;
  predictability: string;
  diagnosticSupport: number | null;
  predictionSupport: number | null;
  currentValue: string;
  baselineValue: string;
  trendSlope: string;
  model: string;
  modelFit: string;
  predictionRange: string;
  dangerHorizon: string;
  operatingTime: string;
  maintenanceWindow: string;
  inspectionWindow: string;
  thresholdProjection: string;
  availableInputs: string[];
  missingInputs: string[];
  modelEvidence: Array<{ label: string; value: string }>;
  actions: string[];
  verification: string[];
};

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
};

function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return value.toFixed(digits).replace(/\.0$/, '');
}

function unique(items: Array<string | undefined | null>): string[] {
  return [...new Set(items.filter((item): item is string => Boolean(item?.trim())).map((item) => item.trim()))];
}

function severityHorizon(issue: Issue): string {
  if (issue.condition === 'danger') return issue.trend === 'rapidly-worsening' ? 'Immediate review' : 'Now';
  if (issue.condition === 'alert') return issue.trend === 'worsening' || issue.trend === 'rapidly-worsening' ? 'Next shift' : 'Monitor';
  if (issue.condition === 'attention') return 'Watch list';
  if (issue.condition === 'offline') return 'Restore data';
  return 'No active horizon';
}

function signalForIssue(issue: Issue, signals: AnalysisSignal[]): AnalysisSignal | null {
  return (
    signals.find((signal) => signal.label.toLowerCase().includes(issue.componentLabel.toLowerCase())) ??
    signals.find((signal) => issue.description.toLowerCase().includes(signal.label.toLowerCase())) ??
    signals[0] ??
    null
  );
}

function forecastFromIssue(
  issue: Issue,
  signals: AnalysisSignal[],
  progression: ProgressionEvent[],
  hypotheses: AnalystHypothesis[],
  doThis: string[],
  thenConfirm: string[],
): ProForecast {
  const signal = signalForIssue(issue, signals);
  const relatedHypothesis =
    hypotheses.find((item) => item.name.toLowerCase().includes(issue.componentLabel.toLowerCase())) ?? hypotheses[0] ?? null;
  const hasTrend = ['worsening', 'rapidly-worsening', 'intermittent'].includes(issue.trend);
  const status: ForecastStatus = issue.condition === 'healthy' ? 'UNAVAILABLE' : hasTrend ? 'FORECAST_AVAILABLE' : 'MONITORING';
  const support = issue.confidence ?? relatedHypothesis?.matchScore ?? null;
  const projected = progression.find((item) => item.condition === issue.condition) ?? progression[0];

  return {
    id: issue.id,
    faultName: issue.title,
    faultId: issue.category.toUpperCase(),
    condition: issue.condition,
    location: [issue.componentLabel, issue.category.replace('-', ' ')],
    status,
    predictability: hasTrend ? 'SCALAR TREND AVAILABLE' : 'NEEDS MORE HISTORY',
    diagnosticSupport: support,
    predictionSupport: hasTrend && support !== null ? Math.max(0, Math.min(100, support - 12)) : null,
    currentValue: signal ? `${fmt(signal.value, signal.decimals)} ${signal.unit}` : '--',
    baselineValue: signal?.qualifier ?? 'Baseline not configured',
    trendSlope: TREND_LABEL[issue.trend],
    model: 'PRODUCTION SCALAR TREND',
    modelFit: hasTrend ? 'LIMITED' : 'UNAVAILABLE',
    predictionRange: status === 'FORECAST_AVAILABLE' ? `${severityHorizon(issue)} / ${issueAgeLabel(issue)} open` : '--',
    dangerHorizon: severityHorizon(issue),
    operatingTime: issueAgeLabel(issue),
    maintenanceWindow:
      issue.condition === 'danger'
        ? 'Plan intervention now'
        : issue.condition === 'alert'
          ? 'Schedule condition-based inspection'
          : 'Continue monitoring',
    inspectionWindow:
      issue.condition === 'danger'
        ? 'Before sustained operation'
        : issue.condition === 'alert'
          ? 'Next representative operating window'
          : 'Routine round',
    thresholdProjection:
      projected?.text ??
      (status === 'FORECAST_AVAILABLE'
        ? `${issue.title} is ${TREND_LABEL[issue.trend].toLowerCase()} at ${issue.componentLabel}; trend should be confirmed before treating this as RUL.`
        : 'No defensible threshold date is available from the current production payload.'),
    availableInputs: unique([
      signal ? `${signal.label}: ${fmt(signal.value, signal.decimals)} ${signal.unit}` : undefined,
      ...hypotheses.slice(0, 2).flatMap((item) => item.supporting),
    ]),
    missingInputs: unique([
      relatedHypothesis?.discriminator,
      issue.condition === 'offline' ? 'Fresh live measurement' : undefined,
      hasTrend ? undefined : 'Longer historical trend window',
      'Validated functional-failure model',
    ]),
    modelEvidence: [
      { label: 'TREND', value: TREND_LABEL[issue.trend] },
      { label: 'AGE', value: issueAgeLabel(issue) },
      { label: 'MODEL FIT', value: hasTrend ? 'Trend support only' : 'No fit' },
      { label: 'RUL', value: 'UNAVAILABLE' },
    ],
    actions: unique([issue.action, ...doThis]),
    verification: unique(thenConfirm),
  };
}

function fallbackForecast(
  machineName: string,
  condition: OverviewCondition,
  signals: AnalysisSignal[],
  hypothesis: Hypothesis | null,
  conclusion: Conclusion,
  doThis: string[],
  thenConfirm: string[],
): ProForecast {
  return {
    id: 'monitoring',
    faultName: hypothesis?.label ?? conclusion.suggested,
    faultId: 'MONITORING',
    condition,
    location: [machineName],
    status: condition === 'healthy' ? 'UNAVAILABLE' : 'LIMITED',
    predictability: 'NO ACTIVE PREDICTION',
    diagnosticSupport: hypothesis?.matchScore ?? null,
    predictionSupport: null,
    currentValue: signals[0] ? `${fmt(signals[0].value, signals[0].decimals)} ${signals[0].unit}` : '--',
    baselineValue: 'No active fault baseline',
    trendSlope: 'No active diagnostic trend',
    model: 'MONITORING SNAPSHOT',
    modelFit: 'UNAVAILABLE',
    predictionRange: '--',
    dangerHorizon: 'No credible threshold forecast',
    operatingTime: 'Not projected',
    maintenanceWindow: 'Not scheduled',
    inspectionWindow: 'Continue normal monitoring',
    thresholdProjection: 'Signals remain under monitoring or need more history before a predictive maintenance statement is defensible.',
    availableInputs: signals.slice(0, 4).map((signal) => `${signal.label}: ${fmt(signal.value, signal.decimals)} ${signal.unit}`),
    missingInputs: ['Active problem group', 'Historical degradation trend', 'Validated functional-failure model'],
    modelEvidence: [
      { label: 'TREND', value: 'UNAVAILABLE' },
      { label: 'MODEL FIT', value: 'UNAVAILABLE' },
      { label: 'MATCH SCORE', value: hypothesis?.matchScore === undefined ? 'NOT RATED' : String(hypothesis.matchScore) },
      { label: 'RUL', value: 'UNAVAILABLE' },
    ],
    actions: doThis,
    verification: thenConfirm,
  };
}

function StatusPill({ condition }: { condition: OverviewCondition }) {
  const { isDark } = useAppTheme();
  const tint = conditionHexes(isDark)[condition];
  return (
    <View className="rounded border px-2 py-1" style={{ borderColor: `${tint}66`, backgroundColor: `${tint}12` }}>
      <Text style={{ color: tint }} className="font-mono text-[8px] font-bold tracking-wider">
        {CONDITION_LABEL[condition]}
      </Text>
    </View>
  );
}

function Kpi({
  label,
  value,
  unit,
  note,
  condition,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  condition?: OverviewCondition;
}) {
  const { isDark } = useAppTheme();
  const tint = condition ? conditionHexes(isDark)[condition] : undefined;
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="gap-1 rounded-lg border px-3 py-2.5" style={{ ...DETAIL_CELL, borderColor: hairline }}>
      <Text className={cn('font-mono text-[8px] uppercase tracking-wider', mutedClass)}>{label}</Text>
      <Text style={tint ? { color: tint } : undefined} className={cn('font-heading-medium text-[20px] font-light tabular-nums', !tint && inkClass)}>
        {value}
        {unit ? <Text className={cn('font-mono text-[10px]', mutedClass)}> {unit}</Text> : null}
      </Text>
      {note ? <Text numberOfLines={2} className={cn('font-body text-[9px] leading-[13px]', mutedClass)}>{note}</Text> : null}
    </View>
  );
}

function ForecastButton({ forecast, selected, onPress }: { forecast: ProForecast; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  const tint = conditionHexes(isDark)[forecast.condition];
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={cn('rounded-lg border px-3 py-2.5', selected && 'bg-accent/10')}
      style={{ borderColor: selected ? `${tint}99` : hairline }}
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="min-w-0 flex-1 gap-1">
          <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{forecast.faultId}</Text>
          <Text numberOfLines={1} className={cn('font-body-medium text-[12px]', selected ? 'text-accent' : inkClass)}>
            {forecast.faultName}
          </Text>
          <Text numberOfLines={1} className={cn('font-body text-[10px]', mutedClass)}>
            {forecast.dangerHorizon}
          </Text>
        </View>
        <Text className={cn('font-mono text-[10px] tabular-nums', inkClass)}>
          {forecast.status === 'FORECAST_AVAILABLE' ? forecast.predictionRange : forecast.status}
        </Text>
      </View>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  return (
    <View className="gap-2">
      <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>{title}</Text>
      {children}
    </View>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  if (items.length === 0) return <Text className={cn('font-body text-[10px] italic leading-[15px]', mutedClass)}>{empty}</Text>;
  return (
    <View className="gap-1.5">
      {items.map((item) => (
        <View key={item} className="flex-row gap-2.5">
          <Text className={cn('font-mono text-[10px]', mutedClass)}>+</Text>
          <Text className={cn('flex-1 font-body text-[11px] leading-[17px]', inkClass)}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function DetailBox({ title, children }: { title: string; children: ReactNode }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  return (
    <View className="gap-2 rounded-lg border px-3 py-2.5" style={{ ...ACTION_CELL, borderColor: hairline }}>
      <Text className={cn('font-body-medium text-[11px]', mutedClass)}>{title}</Text>
      {children}
    </View>
  );
}

export function MachineProDiagnosisPage({
  machineName,
  template,
  hierarchyPath,
  feed,
  ageSeconds,
  runState,
  signals,
  findings,
  hypothesis,
  issues = [],
  progression = [],
  condition = 'healthy',
  dataQuality = 'good',
  hypotheses = [],
  chain = [],
  conclusion = DEFAULT_CONCLUSION,
  doThis,
  thenConfirm,
  modelCaveat,
  onVerifyChain,
  onOpenTrend,
  onSelectDepth,
  selectedProblemId,
  onSelectProblem,
  tabsTrailing,
  onSelectMachine,
  onRefresh,
}: MachineProDiagnosisPageProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  const conditionHex = conditionHexes(isDark);

  const forecasts = useMemo(() => {
    const ordered = prioritiseIssues(issues).map((issue) => forecastFromIssue(issue, signals, progression, hypotheses, doThis, thenConfirm));
    return ordered.length > 0 ? ordered : [fallbackForecast(machineName, condition, signals, hypothesis, conclusion, doThis, thenConfirm)];
  }, [condition, conclusion, doThis, hypothesis, hypotheses, issues, machineName, progression, signals, thenConfirm]);

  const [selectedId, setSelectedId] = useState(selectedProblemId ?? forecasts[0]?.id ?? '');
  const selected = forecasts.find((forecast) => forecast.id === selectedId) ?? forecasts[0];
  const activeForecasts = forecasts.filter((forecast) => forecast.status === 'FORECAST_AVAILABLE').length;
  const bestPrediction =
    forecasts.find((forecast) => forecast.status === 'FORECAST_AVAILABLE') ??
    forecasts.find((forecast) => forecast.status === 'MONITORING') ??
    selected;
  const chainIssueCount = findings.filter((finding) => finding.rules.some((rule) => rule.evidenceClass === 'chain')).length;
  const goodSignalCount = Math.max(0, signals.length - chainIssueCount);

  const choose = (forecast: ProForecast) => {
    setSelectedId(forecast.id);
    onSelectProblem?.(forecast.id);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 18 }}>
      <MachineHeader
        machineName={machineName}
        template={template}
        path={hierarchyPath}
        subtitle="Predictive maintenance outlook and prognosis evidence"
        section="ANALYSIS / PRO DIAGNOSIS"
        feed={feed}
        ageSeconds={ageSeconds}
        onSelectMachine={onSelectMachine}
        onRefresh={onRefresh}
      />

      <AnalysisTabs active="diagnosis" onSelect={onSelectDepth} trailing={tabsTrailing} />

      <Panel>
        <View className="gap-4">
          <View className="flex-row flex-wrap items-start justify-between gap-4">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">FUTURE DOCTOR</Text>
              <Text className={cn('font-heading-medium text-[24px]', inkClass)}>Predictive maintenance outlook</Text>
              <Text className={cn('max-w-[820px] font-body text-[11px] leading-[17px]', mutedClass)}>
                Pro Diagnosis reads active problem groups as maintenance forecasts. It does not claim functional RUL unless the production data exposes a validated failure model.
              </Text>
            </View>
            <View className="rounded-lg border px-3 py-2" style={{ borderColor: `${conditionHex[bestPrediction.condition]}66` }}>
              <Text style={{ color: conditionHex[bestPrediction.condition] }} className="font-mono text-[10px] font-bold tracking-wider">
                {bestPrediction.status}
              </Text>
            </View>
          </View>

          <View className="flex-row flex-wrap gap-2">
            <Kpi
              label="Projected Danger"
              value={bestPrediction.status === 'FORECAST_AVAILABLE' ? bestPrediction.dangerHorizon : '--'}
              note={bestPrediction.faultName}
              condition={bestPrediction.condition}
            />
            <Kpi label="Operating Time" value={bestPrediction.operatingTime} note={runState ?? 'Operating state duration not recorded'} />
            <Kpi
              label="Prediction Support"
              value={bestPrediction.predictionSupport === null ? '--' : fmt(bestPrediction.predictionSupport, 0)}
              unit={bestPrediction.predictionSupport === null ? undefined : 'match'}
              note="Ranking support, not probability"
            />
            <Kpi label="Data Coverage" value={`${goodSignalCount}/${signals.length}`} note={`${QUALITY_LABEL[dataQuality]} data quality`} />
          </View>
        </View>
      </Panel>

      <View className="flex-row flex-wrap items-stretch gap-4">
        <View style={FORECAST_LIST}>
          <Panel fill>
            <View className="gap-3">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">INDEPENDENT FORECASTS</Text>
                  <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Prediction library</Text>
                  <Text className={cn('mt-1 font-mono text-[9px]', mutedClass)}>{activeForecasts} active / {forecasts.length} total</Text>
                </View>
              </View>

              <View className="gap-2">
                {forecasts.map((forecast) => (
                  <ForecastButton key={forecast.id} forecast={forecast} selected={forecast.id === selected.id} onPress={() => choose(forecast)} />
                ))}
              </View>
            </View>
          </Panel>
        </View>

        <View style={FORECAST_DETAIL}>
          <Panel fill>
            <View className="gap-5">
              <View className="flex-row flex-wrap items-start justify-between gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">
                    PREDICTION / DISPLAY-READY PART 2 OUTPUT
                  </Text>
                  <Text className={cn('font-heading-medium text-[22px]', inkClass)}>{selected.faultName}</Text>
                  <Text className={cn('font-mono text-[9px]', mutedClass)}>{selected.location.join(' / ')}</Text>
                </View>
                <StatusPill condition={selected.condition} />
              </View>

              <View className="flex-row flex-wrap gap-2">
                <Kpi label="Status" value={selected.status} />
                <Kpi label="Predictability" value={selected.predictability} />
                <Kpi label="Diagnosis" value={selected.diagnosticSupport === null ? '--' : fmt(selected.diagnosticSupport, 0)} unit={selected.diagnosticSupport === null ? undefined : 'match'} />
                <Kpi label="Prediction" value={selected.predictionSupport === null ? '--' : fmt(selected.predictionSupport, 0)} unit={selected.predictionSupport === null ? undefined : 'match'} />
              </View>

              <View className="flex-row flex-wrap gap-2">
                <Kpi label="Current / Baseline" value={`${selected.currentValue} / ${selected.baselineValue}`} />
                <Kpi label="Degradation Rate" value={selected.trendSlope} />
                <Kpi label="Model / Fit" value={`${selected.model} / ${selected.modelFit}`} />
                <Kpi label="Prediction Range" value={selected.predictionRange} />
              </View>

              <Section title="What Happens Next">
                <Text className={cn('font-body text-[12px] leading-[18px]', inkClass)}>{selected.thresholdProjection}</Text>
              </Section>

              <View className="flex-row flex-wrap gap-2">
                <DetailBox title="Maintenance plan">
                  <View className="gap-2">
                    <Text className={cn('font-body text-[11px] leading-[17px]', inkClass)}>Inspection: {selected.inspectionWindow}</Text>
                    <Text className={cn('font-body text-[11px] leading-[17px]', inkClass)}>Maintenance: {selected.maintenanceWindow}</Text>
                  </View>
                </DetailBox>
                <DetailBox title="Available inputs">
                  <BulletList items={selected.availableInputs} empty="No production inputs are available for this forecast." />
                </DetailBox>
                <DetailBox title="Missing inputs">
                  <BulletList items={selected.missingInputs} empty="No expected inputs are missing." />
                </DetailBox>
              </View>

              <Section title="Advanced Model Evidence">
                <View className="flex-row flex-wrap gap-2">
                  {selected.modelEvidence.map((item) => (
                    <Kpi key={item.label} label={item.label} value={item.value} />
                  ))}
                </View>
              </Section>

              <View className="flex-row flex-wrap gap-2">
                <DetailBox title="Actions">
                  <BulletList items={selected.actions} empty="No corrective action is attached to this forecast." />
                </DetailBox>
                <DetailBox title="Verification">
                  <View className="gap-3">
                    <BulletList items={selected.verification} empty="No verification criteria are attached to this forecast." />
                    {onVerifyChain ? (
                      <Pressable
                        onPress={onVerifyChain}
                        accessibilityRole="button"
                        accessibilityLabel="Verify Pro Diagnosis forecast"
                        className="rounded-lg border border-accent/35 bg-accent/10 px-3 py-2"
                      >
                        <Text className="text-center font-mono text-[9px] font-bold tracking-wider text-accent">VERIFY FORECAST</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </DetailBox>
                <DetailBox title="Trend workspace">
                  <View className="gap-3">
                    <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>
                      {modelCaveat ?? 'Threshold projection is not Remaining Useful Life. Functional-failure forecasts stay unavailable until a validated failure model exists.'}
                    </Text>
                    {onOpenTrend ? (
                      <Pressable
                        onPress={onOpenTrend}
                        accessibilityRole="button"
                        accessibilityLabel="Open Advanced Diagnosis trend workspace"
                        className="rounded-lg border border-accent/35 bg-accent/10 px-3 py-2"
                      >
                        <Text className="text-center font-mono text-[9px] font-bold tracking-wider text-accent">OPEN ADVANCED TREND</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </DetailBox>
              </View>

              {chain.length > 0 || progression.length > 0 ? (
                <Section title="Progression And Reasoning">
                  <View className="gap-2">
                    {[...chain.map((step) => `${step.label}: ${step.value}`), ...progression.slice(0, 4).map((item) => `${item.at}: ${item.text}`)].map((item) => (
                      <View key={item} className="rounded-lg border px-3 py-2" style={{ borderColor: hairline }}>
                        <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>{item}</Text>
                      </View>
                    ))}
                  </View>
                </Section>
              ) : null}
            </View>
          </Panel>
        </View>
      </View>
    </ScrollView>
  );
}
