import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

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
import { consolePalette } from '../../../lib/consoleTheme';
import { Panel } from '../../Panel';
import { AnalysisTabs, type AnalysisDepth } from './analysis/AnalysisTabs';
import type { ActionPriority } from './analysis/ActionList';
import { emptyPrognostics, type MachinePredictionResult, type MachinePrognosticsResult } from './analysis/prognosticsModel';
import {
  FAULTY_SSE_MAINTENANCE_GUIDANCE,
  FAULTY_SSE_OPTIONAL_SHORT_HISTORY,
  FAULTY_SSE_PROGNOSIS_ROWS,
  FAULTY_SSE_PROGNOSIS_WHAT,
  PREDICTIVE_SSE_FORECAST_PLOTS,
  PREDICTIVE_SSE_MAINTENANCE_GUIDANCE,
  PREDICTIVE_SSE_PROGNOSIS_ROWS,
  PREDICTIVE_SSE_PROGNOSIS_WHAT,
} from './demoSseDocs';
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

const PREDICTIVE_DEMO_HISTORY = Array.from({ length: 121 }, (_, index) => {
  const t = index / 120;
  const trend = t < 0.45 ? t * 0.32 : 0.144 + ((t - 0.45) / 0.55) ** 1.5 * 0.856;
  const ripple = index === 0 || index === 120 ? 0 : Math.sin(index * 0.39) * 0.025 + Math.sin(index * 0.11 + 1.4) * 0.016;
  return Math.min(2.45, Math.max(1.58, 1.58 + (2.45 - 1.58) * trend + ripple));
});

const PREDICTIVE_DEMO_FORECAST = Array.from({ length: 91 }, (_, index) => {
  const t = index / 90;
  return 2.45 + (7.1 - 2.45) * t ** 1.24;
});

const predictivePlotBullets = PREDICTIVE_SSE_FORECAST_PLOTS.map((row) => row.join(' | '));

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

function formatValue(value: number | null, unit: string, digits = 2): string {
  const suffix = unit ? ` ${unit}` : '';
  return `${fmt(value, digits)}${suffix}`;
}

function forecastStatusText(forecast: MachinePredictionResult): string {
  return forecast.degradationDetected ? `${forecast.predictionStatus} / DEGRADATION DETECTED` : forecast.predictionStatus;
}

function predictionTargetText(forecast: MachinePredictionResult): string {
  const alert = forecast.advanced.alertThreshold === null ? 'configured ALERT' : `configured ALERT (${formatValue(forecast.advanced.alertThreshold, forecast.unit)})`;
  const danger =
    forecast.advanced.dangerThreshold === null ? 'configured DANGER' : `configured DANGER (${formatValue(forecast.advanced.dangerThreshold, forecast.unit)})`;
  return `Time to ${alert} and ${danger} thresholds - not automatic RUL`;
}

function signedPercent(value: number | null, baseline: number | null): string {
  if (value === null || baseline === null || Math.abs(baseline) < 1e-6) return '--';
  const percent = ((value - baseline) / Math.abs(baseline)) * 100;
  return `${percent >= 0 ? '+' : ''}${fmt(percent, 0)}%`;
}

function thresholdDistance(forecast: MachinePredictionResult, threshold: number | null): string {
  if (forecast.currentValue === null || threshold === null) return '--';
  const distance = threshold - forecast.currentValue;
  return `${formatValue(Math.max(0, distance), forecast.unit)} below`;
}

function predictionSseDetailsFor(forecast: MachinePredictionResult): {
  rows: readonly (readonly [string, string])[];
  status: string;
  target: string;
  what: readonly string[];
  plots: readonly string[];
  maintenance: readonly string[];
} {
  const alertPhrase =
    forecast.estimatedTimeToAlertDays === null
      ? 'No reliable ALERT crossing is currently projected from the selected history.'
      : `Projected ALERT crossing: ${formatDayPhrase(forecast.estimatedTimeToAlertDays)} from the selected history.`;
  const dangerPhrase =
    forecast.estimatedTimeToDangerDays === null
      ? 'No reliable DANGER crossing is currently projected from the selected history.'
      : `Projected DANGER crossing: ${formatDayPhrase(forecast.estimatedTimeToDangerDays)} from the selected history.`;
  const range =
    forecast.predictionLowerBoundDays === null || forecast.predictionUpperBoundDays === null
      ? 'Prediction interval: unavailable until a threshold horizon is fitted.'
      : `Prediction interval: ${predictionRange(forecast)} around the projected DANGER crossing.`;
  const history = `${formatDayNumber(forecast.historyDurationDays)} days / ${forecast.sampleCount} samples`;
  const current = formatValue(forecast.currentValue, forecast.unit);
  const baseline = formatValue(forecast.baselineValue, forecast.unit);
  const alertLimit = formatValue(forecast.advanced.alertThreshold, forecast.unit);
  const dangerLimit = formatValue(forecast.advanced.dangerThreshold, forecast.unit);
  const fit = forecast.modelFit === null ? '--' : `${fmt(forecast.modelFit * 100, 0)}%`;
  const backtest = forecast.backtestError === null ? 'not enough holdout history' : `${formatValue(forecast.backtestError, forecast.unit)} mean error`;

  return {
    rows: [
      ['Current condition', CONDITION_LABEL[forecast.condition].toLocaleUpperCase()],
      ['Prediction status', forecastStatusText(forecast)],
      ['Prediction target', predictionTargetText(forecast)],
      ['Measured history', history],
      ['Current / baseline', `${current} / ${baseline} (${signedPercent(forecast.currentValue, forecast.baselineValue)})`],
      ['Model / fit', `${forecast.modelType} / ${fit}`],
    ],
    status: forecastStatusText(forecast),
    target: predictionTargetText(forecast),
    what: [
      `${history} of gearbox-output history are used for this demo prognosis.`,
      forecast.degradationOnset
        ? `Degradation onset is inferred from the history near ${forecast.degradationOnset}.`
        : 'Degradation onset is not separately identified from the available history.',
      `Current gearbox output reading is ${current}, still ${thresholdDistance(forecast, forecast.advanced.alertThreshold)} the ALERT threshold of ${alertLimit}.`,
      alertPhrase,
      dangerPhrase,
      range,
      `Prediction confidence is ${fmt(forecast.predictionConfidence, 0)}%, derived from model fit, monotonicity, sample count and residual error.`,
      'Prediction wording remains a threshold projection, not a machine failure date.',
    ],
    plots: [
      `Degradation trend: ${history} of ${forecast.unit || 'indicator'} history with the current point marked.`,
      `Forecast + threshold crossing: ${alertLimit} ALERT and ${dangerLimit} DANGER limits overlaid with the selected model.`,
      range,
      `Health forecast: current health indicator ${fmt(forecast.healthIndicator, 0)}/100.`,
      `Backtest: ${backtest}.`,
      `Forecast history: previous forecast ${forecast.previousForecastDays === null ? 'not available' : formatDayPhrase(forecast.previousForecastDays)}.`,
    ],
    maintenance: [
      `Increase monitoring frequency for ${forecast.availableInputs.join(', ') || 'the gearbox output vibration point'}.`,
      `Inspect ${forecast.location.join(' / ')} ${forecast.recommendedInspectionWindow?.toLocaleLowerCase() ?? 'during the next planned maintenance window'}.`,
      `Plan maintenance ${forecast.recommendedMaintenanceWindow?.toLocaleLowerCase() ?? 'after inspection evidence is confirmed'}.`,
      'After maintenance, verify the measured degradation trend stabilizes or falls toward baseline.',
    ],
  };
}

function hasPredictionSseDemoWords(value: string): boolean {
  const words = new Set(value.toLocaleLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return words.has('sse') && words.has('prediction') && words.has('demo');
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

function BulletList({ items, empty }: { items: readonly string[]; empty: string }) {
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

function PrognosisDocRows({
  rows,
  valueTone = 'warning',
}: {
  rows: readonly (readonly [string, string])[];
  valueTone?: 'warning' | 'accent';
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const valueColor = valueTone === 'accent' ? palette.accent : palette.warning;

  return (
    <View className="gap-3 border-b pb-4" style={{ borderColor: palette.line }}>
      {rows.map(([label, value]) => (
        <View key={label} className="flex-row flex-wrap items-baseline gap-x-8 gap-y-1">
          <Text className={cn('font-body-medium text-[11px]', mutedClass)} style={{ width: 240 }}>
            {label}
          </Text>
          <Text className="min-w-0 flex-1 font-body-bold text-[12px]" style={{ color: valueColor }}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function pointsPath(values: number[], xFor: (index: number) => number, yFor: (value: number) => number): string {
  return values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`)
    .join(' ');
}

function DemoForecastPlot() {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const width = 760;
  const height = 190;
  const left = 42;
  const right = 22;
  const top = 18;
  const bottom = 36;
  const min = 1.3;
  const max = 7.4;
  const alert = 2.8;
  const danger = 7.1;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const dayMin = -120;
  const dayMax = 90;
  const xDay = (day: number) => left + ((day - dayMin) / (dayMax - dayMin)) * plotW;
  const yValue = (value: number) => top + (1 - (value - min) / (max - min)) * plotH;
  const historyX = (index: number) => xDay(-120 + index);
  const forecastX = (index: number) => xDay(index);
  const historyPath = pointsPath(PREDICTIVE_DEMO_HISTORY, historyX, yValue);
  const forecastPath = pointsPath(PREDICTIVE_DEMO_FORECAST, forecastX, yValue);
  const uncertaintyTop = pointsPath(
    PREDICTIVE_DEMO_FORECAST.map((value, index) => value + 0.12 + index * 0.004),
    forecastX,
    yValue,
  );
  const uncertaintyBottom = pointsPath(
    [...PREDICTIVE_DEMO_FORECAST].reverse().map((value, reverseIndex) => {
      const index = PREDICTIVE_DEMO_FORECAST.length - reverseIndex - 1;
      return value - 0.1 - index * 0.003;
    }),
    (index) => forecastX(PREDICTIVE_DEMO_FORECAST.length - index - 1),
    yValue,
  );
  const uncertaintyPath = `${uncertaintyTop} ${uncertaintyBottom.replace(/^M/, 'L')} Z`;

  return (
    <View className="overflow-hidden rounded-lg border" style={{ borderColor: palette.line, backgroundColor: palette.chartBg }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Rect x={0} y={0} width={width} height={height} fill={palette.chartBg} />
        {[1.6, alert, danger].map((value) => (
          <Line
            key={value}
            x1={left}
            y1={yValue(value)}
            x2={width - right}
            y2={yValue(value)}
            stroke={value === danger ? palette.critical : value === alert ? palette.warning : palette.chartGridMajor}
            strokeWidth={1}
            strokeDasharray={value === 1.6 ? undefined : '6 5'}
          />
        ))}
        {[-120, -90, -60, -30, 0, 30, 60, 90].map((day) => (
          <Line key={day} x1={xDay(day)} y1={top} x2={xDay(day)} y2={height - bottom} stroke={palette.chartGridMinor} strokeWidth={1} />
        ))}
        <Path d={uncertaintyPath} fill={palette.info} fillOpacity={0.12} />
        <Path d={historyPath} fill="none" stroke={palette.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={forecastPath} fill="none" stroke={palette.info} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="7 5" />
        <Line x1={xDay(0)} y1={top} x2={xDay(0)} y2={height - bottom} stroke={palette.chartCrosshair} strokeWidth={1.4} />
        <Circle cx={xDay(0)} cy={yValue(2.45)} r={4.5} fill={palette.accent} />
        <Circle cx={xDay(15)} cy={yValue(alert)} r={4.5} fill={palette.warning} />
        <Circle cx={xDay(80)} cy={yValue(danger)} r={4.5} fill={palette.critical} />
        <SvgText x={left} y={14} fill={palette.chartText} fontSize={10} fontWeight="700">
          Gearbox Output Vibration - 120 days historical + future forecast
        </SvgText>
        <SvgText x={left} y={yValue(alert) - 5} fill={palette.warning} fontSize={9}>
          H 2.8
        </SvgText>
        <SvgText x={left} y={yValue(danger) - 5} fill={palette.critical} fontSize={9}>
          HH 7.1
        </SvgText>
        <SvgText x={xDay(0) + 7} y={yValue(2.45) - 8} fill={palette.accent} fontSize={9}>
          Today 2.45
        </SvgText>
        <SvgText x={xDay(15) + 7} y={yValue(alert) + 15} fill={palette.warning} fontSize={9}>
          ALERT about 15 d
        </SvgText>
        <SvgText x={xDay(80) - 88} y={yValue(danger) + 15} fill={palette.critical} fontSize={9}>
          DANGER about 80 d
        </SvgText>
        <SvgText x={left} y={height - 12} fill={palette.chartAxisText} fontSize={9}>
          Day -120
        </SvgText>
        <SvgText x={xDay(0) - 14} y={height - 12} fill={palette.chartAxisText} fontSize={9}>
          Today
        </SvgText>
        <SvgText x={width - right - 42} y={height - 12} fill={palette.chartAxisText} fontSize={9}>
          Day +90
        </SvgText>
      </Svg>
    </View>
  );
}

function HealthyPrognosisState({
  signals,
  dataQuality,
  runState,
  model,
  isHealthySseDemo,
}: {
  signals: AnalysisSignal[];
  dataQuality: DataQuality;
  runState?: string;
  model: MachinePrognosticsResult;
  isHealthySseDemo?: boolean;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const stableSignals = signals.slice(0, 6).map((signal) => `${signal.label}: ${fmt(signal.value, signal.decimals)} ${signal.unit} stable`);

  if (isHealthySseDemo) return null;

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
  const isHealthySseDemo = machineName === 'Healthy SSE Demo';
  const isPredictionSseDemo = hasPredictionSseDemoWords(machineName);
  const processRestrictionPrognosis = selected?.predictionId === 'dx-process-downstream-restriction';
  const predictiveGearboxPrognosis =
    isPredictionSseDemo &&
    selected?.predictionId.startsWith('pred-') &&
    selected.faultName === 'Gearbox Output Bearing Degradation';
  const predictiveGearboxDetails = useMemo(
    () => (predictiveGearboxPrognosis && selected ? predictionSseDetailsFor(selected) : null),
    [predictiveGearboxPrognosis, selected],
  );
  const bestPredictionGearboxDetails = useMemo(
    () =>
      isPredictionSseDemo &&
      bestPrediction?.predictionId.startsWith('pred-') &&
      bestPrediction.faultName === 'Gearbox Output Bearing Degradation'
        ? predictionSseDetailsFor(bestPrediction)
        : null,
    [bestPrediction, isPredictionSseDemo],
  );

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
        <HealthyPrognosisState signals={signals} dataQuality={dataQuality} runState={runState} model={model} isHealthySseDemo={isHealthySseDemo} />
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
            <>
              {processRestrictionPrognosis ? <PrognosisDocRows rows={FAULTY_SSE_PROGNOSIS_ROWS} /> : null}
              {bestPredictionGearboxDetails ? (
                <>
                  <PrognosisDocRows rows={PREDICTIVE_SSE_PROGNOSIS_ROWS} valueTone="accent" />
                  <DemoForecastPlot />
                </>
              ) : null}
              <View className="flex-row flex-wrap gap-2">
                <Kpi label="Current condition" value={CONDITION_LABEL[condition].toLocaleUpperCase()} condition={condition} note="Predictive risk is separate from current condition" />
                {processRestrictionPrognosis ? (
                  <Kpi label="Prediction Mode" value="Limited unless sufficient time history is available" />
                ) : null}
                {bestPredictionGearboxDetails ? (
                  <>
                    <Kpi label="Prediction Status" value={bestPredictionGearboxDetails.status} />
                    <Kpi label="Prediction Target" value={bestPredictionGearboxDetails.target} />
                  </>
                ) : null}
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
            </>
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
                {processRestrictionPrognosis ? (
                  <BulletList items={FAULTY_SSE_PROGNOSIS_WHAT} empty="No Demo 2 prognosis statement is available." />
                ) : predictiveGearboxDetails ? (
                  <BulletList items={PREDICTIVE_SSE_PROGNOSIS_WHAT} empty="No Demo 3 prognosis statement is available." />
                ) : (
                  <Text className={cn('font-body text-[12px] leading-[18px]', inkClass)}>
                    {selected.thresholdProjectionWording ?? 'No defensible threshold horizon is currently available.'}
                  </Text>
                )}
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

              {processRestrictionPrognosis ? (
                <View className="flex-row flex-wrap gap-2">
                  <DetailBox title="Optional short-history display">
                    <BulletList items={FAULTY_SSE_OPTIONAL_SHORT_HISTORY} empty="No optional short-history statement is available." />
                  </DetailBox>
                  <DetailBox title="Maintenance guidance shown">
                    <BulletList items={FAULTY_SSE_MAINTENANCE_GUIDANCE} empty="No Demo 2 maintenance guidance is available." />
                  </DetailBox>
                </View>
              ) : null}

              {predictiveGearboxDetails ? (
                <View className="flex-row flex-wrap gap-2">
                  <DetailBox title="Forecast overlay">
                    <DemoForecastPlot />
                  </DetailBox>
                  <DetailBox title="Forecast plots shown">
                    <BulletList items={predictivePlotBullets} empty="No Demo 3 forecast plot statement is available." />
                  </DetailBox>
                  <DetailBox title="Maintenance guidance shown">
                    <BulletList items={PREDICTIVE_SSE_MAINTENANCE_GUIDANCE} empty="No Demo 3 maintenance guidance is available." />
                  </DetailBox>
                </View>
              ) : null}

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
