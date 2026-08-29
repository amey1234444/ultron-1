import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { AnalysisSignal, Finding, Hypothesis } from '../../../lib/analysisDiagnosis';
import {
  CONDITION_LABEL,
  conditionHexes,
  type Issue,
  type OverviewCondition,
  type ProgressionEvent,
} from '../../../lib/analysisOverview';
import { QUALITY_LABEL, type AnalystHypothesis, type ChainStep, type Conclusion, type DataQuality } from '../../../lib/advancedDiagnosis';
import { cn } from '../../../lib/cn';
import { Panel } from '../../Panel';
import { AnalysisTabs, type AnalysisDepth } from './analysis/AnalysisTabs';
import type { ActionPriority } from './analysis/ActionList';
import { emptyPrognostics, type MachinePredictionResult, type MachinePrognosticsResult } from './analysis/prognosticsModel';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';

const FORECAST_LIST = { flexGrow: 3, flexBasis: 330, minWidth: 280 } as const;
const FORECAST_DETAIL = { flexGrow: 7, flexBasis: 720, minWidth: 320 } as const;
const DETAIL_CELL = { flexGrow: 1, flexBasis: 210, minWidth: 180 } as const;
const ACTION_CELL = { flexGrow: 1, flexBasis: 280, minWidth: 240 } as const;

const HEALTHY_PROGNOSIS_POINTS = [
  'No persistent upward bearing, gear, vibration, temperature, pressure or load degradation pattern.',
  'Projected ALERT crossing: no reliable crossing predicted.',
  'Projected DANGER crossing: no reliable crossing predicted.',
  'Validated RUL: not applicable for this healthy demonstration.',
  'Maintenance recommendation: continue routine/planned maintenance.',
];

const HEALTHY_PROGNOSIS_PLOTS = [
  '120-day machine-health trend: stable.',
  'Selected sensor / feature degradation trend: stable around the healthy baseline.',
  'Forecast plot: history remains stable with no artificial threshold crossing.',
  'Maintenance/event timeline: routine events only when present.',
];

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
};

function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return value.toFixed(digits).replace(/\.0$/, '');
}

function predictionListValue(forecast: MachinePredictionResult): string {
  return forecast.estimatedTimeToDangerDays === null ? forecast.predictionStatus : formatDayPhrase(forecast.estimatedTimeToDangerDays, true);
}

function predictionRange(forecast: MachinePredictionResult): string {
  if (forecast.predictionLowerBoundDays === null || forecast.predictionUpperBoundDays === null) return '--';
  return `${formatDayNumber(forecast.predictionLowerBoundDays)}-${formatDayPhrase(forecast.predictionUpperBoundDays)}`;
}

function formatDayNumber(value: number): string {
  if (value <= 0) return '0';
  if (value < 1) return '<1';
  return value < 10 ? value.toFixed(1).replace(/\.0$/, '') : fmt(value, 0);
}

function formatDayPhrase(value: number, compact = false): string {
  if (value <= 0) return 'now';
  const amount = formatDayNumber(value);
  return `${amount} ${compact ? 'd' : amount === '1' ? 'day' : 'days'}`;
}

function dayUnit(value: number | null): string | undefined {
  if (value === null || value <= 0) return undefined;
  return formatDayNumber(value) === '1' ? 'day' : 'days';
}

function formatSlope(value: number | null): string {
  if (value === null) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)} / day`;
}

function formatCurrentBaseline(forecast: MachinePredictionResult): string {
  const unit = forecast.unit ? ` ${forecast.unit}` : '';
  return `${fmt(forecast.currentValue, 2)} / ${fmt(forecast.baselineValue, 2)}${unit}`;
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

function ForecastButton({ forecast, selected, onPress }: { forecast: MachinePredictionResult; selected: boolean; onPress: () => void }) {
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
            {forecast.thresholdProjectionWording ?? forecast.predictionStatus}
          </Text>
        </View>
        <Text className={cn('font-mono text-[10px] tabular-nums', inkClass)}>
          {predictionListValue(forecast)}
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

function HealthyPrognosisState({
  signals,
  dataQuality,
  runState,
  model,
}: {
  signals: AnalysisSignal[];
  dataQuality: DataQuality;
  runState?: string;
  model: MachinePrognosticsResult;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const stableSignals = signals.slice(0, 6).map((signal) => `${signal.label}: ${fmt(signal.value, signal.decimals)} ${signal.unit} stable`);

  return (
    <View className="gap-4">
      <Panel>
        <View className="gap-4">
          <View className="flex-row flex-wrap items-start justify-between gap-4">
            <View className="min-w-0 flex-1 gap-2">
              <StatusPill condition="healthy" />
              <Text className={cn('font-heading-medium text-[24px]', inkClass)}>Stable healthy outlook</Text>
              <Text className={cn('max-w-[820px] font-body text-[11px] leading-[17px]', mutedClass)}>
                Current machine condition is healthy. No significant degradation forecast is available because the evidence does not
                support an artificial threshold crossing or a future failure date.
              </Text>
            </View>
            <Text className="font-mono text-[10px] font-bold tracking-wider text-accent">PROGNOSIS</Text>
          </View>

          <View className="flex-row flex-wrap gap-2">
            <Kpi label="Current condition" value="HEALTHY" condition="healthy" note={runState ?? 'Running normally'} />
            <Kpi label="Historical period" value="120" unit="days" note="Stable healthy operation" />
            <Kpi label="Degradation status" value="NONE" note="No meaningful degradation detected" />
            <Kpi label="Trend direction" value="STABLE" />
            <Kpi label="Data quality" value={QUALITY_LABEL[dataQuality]} note={`${signals.length} available measurements`} />
            <Kpi label="History samples" value={String(model.historySampleCount)} note={model.sourceLabel} />
          </View>
        </View>
      </Panel>

      <View className="flex-row flex-wrap gap-4">
        <DetailBox title="Forecast">
          <BulletList items={HEALTHY_PROGNOSIS_POINTS} empty="No healthy forecast statement is available." />
        </DetailBox>
        <DetailBox title="Stable evidence">
          <BulletList items={stableSignals} empty="No live sensor values are available for the prognosis." />
        </DetailBox>
        <DetailBox title="Plots shown">
          <BulletList items={HEALTHY_PROGNOSIS_PLOTS} empty="No plot definitions are available." />
        </DetailBox>
      </View>
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
  issues = [],
  condition = 'healthy',
  dataQuality = 'good',
  prognostics,
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

  const model = useMemo(() => prognostics ?? emptyPrognostics(), [prognostics]);
  const forecasts = model.predictions;
  const [selectedId, setSelectedId] = useState(selectedProblemId ?? forecasts[0]?.predictionId ?? '');
  const selected = forecasts.find((forecast) => forecast.predictionId === selectedId) ?? model.activeForecasts[0] ?? forecasts[0] ?? null;
  const bestPrediction = model.earliestProjectedDanger ?? model.activeForecasts[0] ?? selected;
  const activeForecasts = model.activeForecasts.length;
  const chainIssueCount = findings.filter((finding) => finding.rules.some((rule) => rule.evidenceClass === 'chain')).length;
  const goodSignalCount = Math.max(0, signals.length - chainIssueCount);
  const healthyOutlook = condition === 'healthy' && issues.length === 0 && findings.length === 0 && forecasts.length === 0;

  const choose = (forecast: MachinePredictionResult) => {
    setSelectedId(forecast.predictionId);
    onSelectProblem?.(forecast.predictionId);
  };

  useEffect(() => {
    setSelectedId((current) =>
      selectedProblemId && forecasts.some((forecast) => forecast.predictionId === selectedProblemId)
        ? selectedProblemId
        : current && forecasts.some((forecast) => forecast.predictionId === current)
          ? current
          : (model.activeForecasts[0]?.predictionId ?? forecasts[0]?.predictionId ?? ''),
    );
  }, [forecasts, model.activeForecasts, selectedProblemId]);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 18 }}>
      <MachineHeader
        machineName={machineName}
        template={template}
        path={hierarchyPath}
        subtitle="Predictive maintenance outlook and prognosis evidence"
        section="ANALYSIS / PROGNOSIS"
        feed={feed}
        ageSeconds={ageSeconds}
        onSelectMachine={onSelectMachine}
        onRefresh={onRefresh}
      />

      <AnalysisTabs active="diagnosis" onSelect={onSelectDepth} trailing={tabsTrailing} />

      {healthyOutlook ? (
        <HealthyPrognosisState signals={signals} dataQuality={dataQuality} runState={runState} model={model} />
      ) : (
        <>
      <Panel>
        <View className="gap-4">
          <View className="flex-row flex-wrap items-start justify-between gap-4">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">FUTURE DOCTOR</Text>
              <Text className={cn('font-heading-medium text-[24px]', inkClass)}>Predictive maintenance outlook</Text>
              <Text className={cn('max-w-[820px] font-body text-[11px] leading-[17px]', mutedClass)}>
                Prognosis reads active problem groups as maintenance forecasts. It does not claim functional RUL unless the production data exposes a validated failure model.
              </Text>
            </View>
            <View className="rounded-lg border px-3 py-2" style={{ borderColor: bestPrediction ? `${conditionHex[bestPrediction.condition]}66` : hairline }}>
              <Text style={bestPrediction ? { color: conditionHex[bestPrediction.condition] } : undefined} className={cn('font-mono text-[10px] font-bold tracking-wider', !bestPrediction && mutedClass)}>
                {model.sourceLabel}
              </Text>
            </View>
          </View>

          {bestPrediction ? (
            <View className="flex-row flex-wrap gap-2">
              <Kpi label="Current condition" value={CONDITION_LABEL[condition].toLocaleUpperCase()} condition={condition} note="Predictive risk is separate from current condition" />
              <Kpi
                label="Projected Alert"
                value={bestPrediction.estimatedTimeToAlertDays === null ? '--' : formatDayNumber(bestPrediction.estimatedTimeToAlertDays)}
                unit={dayUnit(bestPrediction.estimatedTimeToAlertDays)}
                note="Configured threshold crossing, not a fault today"
              />
              <Kpi
                label="Projected Danger"
                value={bestPrediction.estimatedTimeToDangerDays === null ? '--' : formatDayNumber(bestPrediction.estimatedTimeToDangerDays)}
                unit={dayUnit(bestPrediction.estimatedTimeToDangerDays)}
                note={bestPrediction.faultName}
                condition={bestPrediction.condition}
              />
              <Kpi
                label="Operating time"
                value={fmt(bestPrediction.operatingHoursToThreshold, 0)}
                unit={bestPrediction.operatingHoursToThreshold === null ? undefined : 'hours'}
                note={runState ?? 'Operating state duration not recorded'}
              />
              <Kpi label="Prediction confidence" value={fmt(bestPrediction.predictionConfidence, 0)} unit="%" />
              <Kpi label="Data coverage" value={`${goodSignalCount}/${signals.length}`} note={`${QUALITY_LABEL[dataQuality]} data quality`} />
            </View>
          ) : (
            <View className="items-center gap-1 rounded-lg border px-4 py-8" style={{ borderColor: hairline, borderStyle: 'dashed' }}>
              <Text className={cn('font-body-medium text-[13px]', inkClass)}>
                {model.enabled ? 'No credible threshold forecast' : 'Historical simulation is off'}
              </Text>
              <Text className={cn('text-center font-body text-[10px] leading-[15px]', mutedClass)}>
                {model.enabled ? 'Signals remain under monitoring or need more history.' : 'Enable historical trend capture to generate prognostic data.'}
              </Text>
            </View>
          )}
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
                {forecasts.length > 0 ? (
                  forecasts.map((forecast) => (
                    <ForecastButton
                      key={forecast.predictionId}
                      forecast={forecast}
                      selected={selected ? forecast.predictionId === selected.predictionId : false}
                      onPress={() => choose(forecast)}
                    />
                  ))
                ) : (
                  <Text className={cn('font-body text-[10px] italic leading-[15px]', mutedClass)}>
                    No prediction definitions are active for this machine snapshot.
                  </Text>
                )}
              </View>
            </View>
          </Panel>
        </View>

        <View style={FORECAST_DETAIL}>
          <Panel fill>
            {selected ? (
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
                <Kpi label="STATUS" value={selected.predictionStatus} />
                <Kpi label="PREDICTABILITY" value={selected.predictabilityClass} />
                <Kpi label="DIAGNOSIS" value={fmt(selected.diagnosticConfidence, 0)} unit="%" />
                <Kpi label="PREDICTION" value={fmt(selected.predictionConfidence, 0)} unit="%" />
              </View>

              <View className="flex-row flex-wrap gap-2">
                <Kpi label="CURRENT / BASELINE" value={formatCurrentBaseline(selected)} />
                <Kpi
                  label="PROJECTED ALERT"
                  value={selected.estimatedTimeToAlertDays === null ? '--' : formatDayPhrase(selected.estimatedTimeToAlertDays)}
                />
                <Kpi label="DEGRADATION RATE" value={formatSlope(selected.trendSlopePerDay)} />
                <Kpi label="MODEL / FIT" value={`${selected.modelType} / ${selected.modelFit === null ? '--' : `${fmt(selected.modelFit * 100, 0)}%`}`} />
                <Kpi label="PREDICTION RANGE" value={predictionRange(selected)} />
              </View>

              <Section title="What Happens Next">
                <Text className={cn('font-body text-[12px] leading-[18px]', inkClass)}>
                  {selected.thresholdProjectionWording ?? 'No defensible threshold horizon is currently available.'}
                </Text>
              </Section>

              <View className="flex-row flex-wrap gap-2">
                <DetailBox title="Maintenance plan">
                  <View className="gap-2">
                    <Text className={cn('font-body text-[11px] leading-[17px]', inkClass)}>
                      Inspection: {selected.recommendedInspectionWindow ?? 'Continue monitoring'}
                    </Text>
                    <Text className={cn('font-body text-[11px] leading-[17px]', inkClass)}>
                      Maintenance: {selected.recommendedMaintenanceWindow ?? 'Not scheduled'}
                    </Text>
                  </View>
                </DetailBox>
                <DetailBox title="Available inputs">
                  <BulletList items={selected.availableInputs} empty="No production inputs are available for this forecast." />
                </DetailBox>
                <DetailBox title="Missing inputs">
                  <BulletList items={selected.requiredAdditionalEvidence} empty="No expected inputs are missing." />
                </DetailBox>
              </View>

              <Section title="Advanced Model Evidence">
                <View className="flex-row flex-wrap gap-2">
                  <Kpi label="R²" value={fmt(selected.modelFit, 3)} />
                  <Kpi label="ROBUST SLOPE" value={fmt(selected.robustSlopePerDay, 4)} />
                  <Kpi label="MONOTONICITY" value={fmt(selected.advanced.monotonicity, 2)} />
                  <Kpi
                    label="RUL"
                    value={selected.functionalFailureValidated ? fmt(selected.estimatedTimeToFunctionalFailureDays, 0) : 'UNAVAILABLE'}
                  />
                </View>
              </Section>

              <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>
                Threshold projection is not Remaining Useful Life. Functional-failure forecasts stay unavailable until a validated failure model exists.
              </Text>
            </View>
            ) : (
              <View className="items-center gap-1 px-4 py-16">
                <Text className={cn('font-body-medium text-[13px]', inkClass)}>No credible threshold forecast</Text>
                <Text className={cn('text-center font-body text-[10px] leading-[15px]', mutedClass)}>
                  Signals remain under monitoring or need more history.
                </Text>
              </View>
            )}
          </Panel>
        </View>
      </View>
        </>
      )}
    </ScrollView>
  );
}
