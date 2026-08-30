import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { AnalysisSignal, Finding, Hypothesis } from '../../../lib/analysisDiagnosis';
import {
  CONDITION_LABEL,
  type Issue,
  type OverviewCondition,
  type ProgressionEvent,
} from '../../../lib/analysisOverview';
import { QUALITY_LABEL, type AnalystHypothesis, type ChainStep, type Conclusion, type DataQuality } from '../../../lib/advancedDiagnosis';
import { cn } from '../../../lib/cn';
import { Panel } from '../../Panel';
import { Hoverable, alpha, consolePalette, radius, tabular, text } from '../../ui';
import { AnalysisTabs, type AnalysisDepth } from './analysis/AnalysisTabs';
import type { ActionPriority } from './analysis/ActionList';
import {
  ConditionPill,
  DefinitionRows,
  EvidenceCard,
  EvidenceShell,
  FactStrip,
  RegionHeading,
  StatementList,
  VerdictHeader,
  conditionColour,
  type Fact,
} from './analysis/DiagnosisPresentation';
import { emptyPrognostics, type MachinePredictionResult, type MachinePrognosticsResult } from './analysis/prognosticsModel';
import {
  FAULTY_SSE_MAINTENANCE_GUIDANCE,
  FAULTY_SSE_OPTIONAL_SHORT_HISTORY,
  FAULTY_SSE_PROGNOSIS_ROWS,
  FAULTY_SSE_PROGNOSIS_WHAT,
  HEALTHY_SSE_FORECAST,
  HEALTHY_SSE_PROGNOSIS_CONDITION,
  HEALTHY_SSE_PROGNOSIS_MESSAGE,
  HEALTHY_SSE_PROGNOSIS_PLOTS,
  PREDICTIVE_SSE_FORECAST_PLOTS,
  PREDICTIVE_SSE_MAINTENANCE_GUIDANCE,
  PREDICTIVE_SSE_PROGNOSIS_WHAT,
} from './demoSseDocs';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';

const FORECAST_LIST = { flexGrow: 3, flexBasis: 330, minWidth: 280 } as const;
const FORECAST_DETAIL = { flexGrow: 7, flexBasis: 720, minWidth: 320 } as const;

/**
 * Type inside the SVG plot.
 *
 * Everything that can be a real `<Text>` already is — the chart's title, its
 * legend and its caption live in the card header above the drawing, where they
 * get the console's own type scale. What is left inside the SVG is only the
 * text that has to sit at a coordinate: axis ticks, threshold names and the
 * three point callouts. Those still need a face, and `fontFamily` on an SVG
 * node does not go through nativewind, so the two web faces are named here and
 * the bundled families are named for the native targets.
 */
const PLOT_SANS = Platform.select({ web: 'Inter, system-ui, sans-serif', default: 'Inter_500Medium' });
const PLOT_SANS_BOLD = Platform.select({ web: 'Inter, system-ui, sans-serif', default: 'Inter_600SemiBold' });
const PLOT_MONO = Platform.select({ web: '"JetBrains Mono", ui-monospace, monospace', default: 'IBMPlexMono_400Regular' });

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

// The plot's vertical geometry, and the two dates the demo script quotes.
const PLOT_MIN = 1.0;
const PLOT_MAX = 8.6;
const PLOT_ALERT = 2.8;
const PLOT_DANGER = 7.1;
const PLOT_TODAY = 2.45;
const PLOT_BASELINE = 1.58;
const PLOT_VALUE_TICKS = [2, 3, 4, 5, 6, 7, 8];
const PLOT_DAY_TICKS = [-120, -90, -60, -30, 0, 30, 60, 90];
const FORECAST_ALERT_DAY = 15;
const FORECAST_DANGER_DAY = 80;

/**
 * The forecast curve, solved through its own two crossings.
 *
 * It used to be `2.45 + (7.1 - 2.45) * t ** 1.24` over a normalised t, with the
 * ALERT and DANGER markers separately hardcoded at day 15 and day 80. Those are
 * two different claims about the same curve, and they did not agree: that
 * exponent puts the curve at 2.98 on day 15 and 6.03 on day 80, so the amber dot
 * floated below the line it was supposed to mark and the red dot sat well above
 * it. The chart was contradicting itself in the one place a reader looks.
 *
 * Fitting `v = today + k·d^p` through (15, H) and (80, HH) makes the crossings
 * a property of the curve rather than an annotation laid on top of it, so the
 * markers are on the line by construction and stay there if the thresholds or
 * the quoted days ever change.
 */
const FORECAST_EXPONENT =
  Math.log((PLOT_DANGER - PLOT_TODAY) / (PLOT_ALERT - PLOT_TODAY)) / Math.log(FORECAST_DANGER_DAY / FORECAST_ALERT_DAY);
const FORECAST_SCALE = (PLOT_ALERT - PLOT_TODAY) / FORECAST_ALERT_DAY ** FORECAST_EXPONENT;

const PREDICTIVE_DEMO_FORECAST = Array.from(
  { length: 91 },
  (_, day) => PLOT_TODAY + FORECAST_SCALE * day ** FORECAST_EXPONENT,
);

/**
 * 120 days of measured history.
 *
 * Four incommensurate harmonics rather than one: a weekly-sampled vibration
 * trend is not a smooth line, and a demo curve that looks drawn rather than
 * measured undercuts the whole point of the screen. The ripple is damped to
 * nothing at both ends so the series starts cleanly at the healthy baseline and
 * hands over to the forecast at exactly today's reading.
 */
const PREDICTIVE_DEMO_HISTORY = Array.from({ length: 121 }, (_, index) => {
  const t = index / 120;
  const trend = t < 0.45 ? t * 0.32 : 0.144 + ((t - 0.45) / 0.55) ** 1.5 * 0.856;
  const base = PLOT_BASELINE + (PLOT_TODAY - PLOT_BASELINE) * trend;
  const damp = Math.max(0, Math.min(1, index / 6, (120 - index) / 10));
  const ripple =
    (Math.sin(index * 0.39) * 0.046 +
      Math.sin(index * 0.11 + 1.4) * 0.034 +
      Math.sin(index * 0.93 + 0.6) * 0.023 +
      Math.sin(index * 1.71 + 2.2) * 0.013) *
    damp;
  return Math.max(1.42, base + ripple);
});

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
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
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

function demoWords(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function hasPredictionSseDemoWords(value: string): boolean {
  const words = demoWords(value);
  return words.has('sse') && words.has('prediction') && words.has('demo');
}

/**
 * The healthy demo, recognised by its words rather than by an exact name.
 *
 * It used to be `machineName === 'Healthy SSE Demo'`, which matched exactly one
 * spelling — and the machine an engineer actually creates in the tree is called
 * things like "sse healthy". So the check said false, and separately the page
 * said "if this is the healthy demo, render nothing at all", which is how the
 * healthy machine ended up with a blank prognosis either way.
 */
function hasHealthySseDemoWords(value: string): boolean {
  const words = demoWords(value);
  return words.has('sse') && words.has('healthy');
}

/** How many things a region is listing. Sits on the region heading, not in it. */
function CountChip({ count, suffix }: { count: number; suffix?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className="flex-row items-baseline gap-1 px-2 py-[3px]"
      style={{ backgroundColor: alpha(palette.neutral, 0.12), borderRadius: radius.sm }}
    >
      <Text className={text.code} style={[tabular, { color: palette.ink }]}>
        {count}
      </Text>
      {suffix ? (
        <Text className={text.meta} style={{ color: palette.inkMuted }}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

/** A region: its heading, then whatever it is a heading for. */
function Region({
  eyebrow,
  title,
  trailing,
  children,
}: {
  eyebrow: string;
  title: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View className="gap-3">
      <RegionHeading eyebrow={eyebrow} title={title} trailing={trailing} />
      {children}
    </View>
  );
}

/** A bordered ground for a list that is a whole region rather than a card. */
function Surface({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className={cn('overflow-hidden border', padded && 'px-4 py-1')}
      style={{ borderColor: palette.line, borderRadius: radius.md, backgroundColor: palette.panelRaised }}
    >
      {children}
    </View>
  );
}

/**
 * A plot specification: what a chart draws, and what its two axes are.
 *
 * These arrive as ['Degradation Trend', 'Date / Time', 'mm/s RMS'] triples and
 * used to be joined with " | " into one grey sentence, which threw away the one
 * thing the triple actually says — that the second field is the X axis and the
 * third is the Y. Naming the axes costs two characters and makes the row
 * readable without the reader reconstructing the convention.
 */
function PlotSpecList({ rows }: { rows: readonly (readonly string[])[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View>
      {rows.map((row, index) => (
        <Hoverable
          key={row[0]}
          className="gap-1.5 px-2 py-3"
          style={({ hovered }) => ({
            marginHorizontal: -8,
            borderRadius: radius.sm,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: palette.lineSubtle,
            backgroundColor: hovered ? palette.hoverSurface : undefined,
          })}
        >
          <Text className={text.bodyStrong} style={{ color: palette.ink }}>
            {row[0]}
          </Text>
          <View className="flex-row flex-wrap items-baseline gap-x-5 gap-y-1">
            {row.slice(1).map((cell, cellIndex) => (
              <View key={cell} className="flex-row items-baseline gap-1.5">
                <Text className={text.code} style={{ color: alpha(palette.accent, 0.85) }}>
                  {cellIndex === 0 ? 'X' : 'Y'}
                </Text>
                <Text className={text.micro} style={{ color: palette.inkMuted }}>
                  {cell}
                </Text>
              </View>
            ))}
          </View>
        </Hoverable>
      ))}
    </View>
  );
}

function LegendKey({ colour, label, dashed, band }: { colour: string; label: string; dashed?: boolean; band?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className="flex-row items-center gap-1.5">
      <Svg width={17} height={10}>
        {band ? (
          <Rect x={0} y={1} width={17} height={8} rx={2} fill={colour} fillOpacity={0.22} stroke={colour} strokeOpacity={0.45} strokeWidth={1} />
        ) : (
          <Line x1={0} y1={5} x2={17} y2={5} stroke={colour} strokeWidth={2.4} strokeDasharray={dashed ? '4 3' : undefined} strokeLinecap="round" />
        )}
      </Svg>
      <Text className={text.meta} style={{ color: palette.inkMuted }}>
        {label}
      </Text>
    </View>
  );
}

function pointsPath(values: number[], xFor: (index: number) => number, yFor: (value: number) => number): string {
  return values
    .map((value, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`)
    .join(' ');
}

/**
 * The demo forecast plot: 120 days measured, 90 days projected.
 *
 * The version this replaces was drawn into a fixed 760x190 viewBox and mounted
 * at `width="100%"`, which does not do what it looks like it does — an SVG with
 * a viewBox and the default `preserveAspectRatio` *fits* the drawing inside the
 * box rather than filling it, so on a 1350px panel the chart still drew at 760px
 * and sat marooned in the middle of six hundred pixels of empty card. Measuring
 * the container and drawing at 1:1 pixel units fixes both problems at once: the
 * chart occupies the space it was given, and every stroke and glyph is at its
 * true size instead of being scaled by whatever ratio the fit happened to pick.
 *
 * The chart is also now tall enough to read. A forecast whose whole point is the
 * angle at which a curve approaches two horizontal limits cannot be shown 190px
 * high — at that height the ALERT and DANGER lines are close enough together
 * that the gap between "15 days" and "80 days" is about a centimetre of screen.
 */
function ForecastPlot() {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((previous) => (Math.abs(previous - next) < 2 ? previous : next));
  }, []);

  const w = width > 0 ? width : 960;
  const h = Math.max(300, Math.min(440, Math.round(w * 0.3)));
  const left = 62;
  const right = 26;
  const top = 22;
  const bottom = 46;
  const plotW = w - left - right;
  const plotH = h - top - bottom;
  const ready = width > 0 && plotW > 120;

  const xDay = (day: number) => left + ((day + 120) / 210) * plotW;
  const yValue = (value: number) => top + (1 - (value - PLOT_MIN) / (PLOT_MAX - PLOT_MIN)) * plotH;
  const historyX = (index: number) => xDay(-120 + index);
  const forecastX = (index: number) => xDay(index);

  const historyPath = pointsPath(PREDICTIVE_DEMO_HISTORY, historyX, yValue);
  const forecastPath = pointsPath(PREDICTIVE_DEMO_FORECAST, forecastX, yValue);
  const uncertaintyTop = pointsPath(
    PREDICTIVE_DEMO_FORECAST.map((value, index) => value + 0.12 + index * 0.003),
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
    <View
      className="overflow-hidden border"
      style={{ borderColor: palette.line, borderRadius: radius.md, backgroundColor: palette.panelRaised }}
    >
      <View className="gap-3 px-4 pb-3 pt-3.5" style={{ borderBottomWidth: 1, borderBottomColor: palette.lineSubtle }}>
        <View className="flex-row flex-wrap items-start justify-between gap-x-6 gap-y-1">
          <View className="min-w-0 gap-1">
            <Text className={text.label} style={{ color: palette.inkFaint }}>
              FORECAST + THRESHOLD CROSSING
            </Text>
            <Text className={text.title} style={{ color: palette.ink }}>
              Gearbox Output Vibration
            </Text>
          </View>
          <Text className={text.micro} style={{ color: palette.inkMuted }}>
            120 days measured, 90 days projected — mm/s RMS
          </Text>
        </View>
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5">
          <LegendKey colour={palette.accent} label="Measured history" />
          <LegendKey colour={palette.info} label="Forecast" dashed />
          <LegendKey colour={palette.info} label="Prediction interval" band />
          <LegendKey colour={palette.warning} label="H 2.80 alert" dashed />
          <LegendKey colour={palette.critical} label="HH 7.10 danger" dashed />
        </View>
      </View>

      <View onLayout={onLayout} style={{ backgroundColor: palette.chartBg }}>
        {ready ? (
          <Svg width={w} height={h}>
            <Rect x={0} y={0} width={w} height={h} fill={palette.chartBg} />

            {/* The three configured regions, as ground rather than as lines. A
                reader should be able to see which band the curve is in without
                first finding the limit it is being compared against. */}
            <Rect x={left} y={top} width={plotW} height={Math.max(0, yValue(PLOT_DANGER) - top)} fill={palette.critical} fillOpacity={0.07} />
            <Rect
              x={left}
              y={yValue(PLOT_DANGER)}
              width={plotW}
              height={Math.max(0, yValue(PLOT_ALERT) - yValue(PLOT_DANGER))}
              fill={palette.warning}
              fillOpacity={0.055}
            />
            <Rect
              x={left}
              y={yValue(PLOT_ALERT)}
              width={plotW}
              height={Math.max(0, top + plotH - yValue(PLOT_ALERT))}
              fill={palette.accent}
              fillOpacity={0.045}
            />

            {PLOT_VALUE_TICKS.map((value) => (
              <Line
                key={`grid-y-${value}`}
                x1={left}
                y1={yValue(value)}
                x2={left + plotW}
                y2={yValue(value)}
                stroke={palette.chartGridMinor}
                strokeWidth={1}
              />
            ))}
            {PLOT_DAY_TICKS.map((day) => (
              <Line
                key={`grid-x-${day}`}
                x1={xDay(day)}
                y1={top}
                x2={xDay(day)}
                y2={top + plotH}
                stroke={palette.chartGridMinor}
                strokeWidth={1}
              />
            ))}

            <Line x1={left} y1={top} x2={left} y2={top + plotH} stroke={palette.chartAxis} strokeWidth={1} />
            <Line x1={left} y1={top + plotH} x2={left + plotW} y2={top + plotH} stroke={palette.chartAxis} strokeWidth={1} />

            <Line
              x1={left}
              y1={yValue(PLOT_ALERT)}
              x2={left + plotW}
              y2={yValue(PLOT_ALERT)}
              stroke={palette.warning}
              strokeWidth={1.4}
              strokeDasharray="7 5"
            />
            <Line
              x1={left}
              y1={yValue(PLOT_DANGER)}
              x2={left + plotW}
              y2={yValue(PLOT_DANGER)}
              stroke={palette.critical}
              strokeWidth={1.4}
              strokeDasharray="7 5"
            />

            <Path d={uncertaintyPath} fill={palette.info} fillOpacity={0.16} />
            <Path d={historyPath} fill="none" stroke={palette.accent} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            <Path
              d={forecastPath}
              fill="none"
              stroke={palette.info}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="8 6"
            />

            <Line x1={xDay(0)} y1={top} x2={xDay(0)} y2={top + plotH} stroke={palette.chartCrosshair} strokeWidth={1.4} />

            {/* Halo rings, so a marker still reads where the curve passes under it. */}
            <Circle cx={xDay(0)} cy={yValue(PLOT_TODAY)} r={7} fill={palette.chartBg} />
            <Circle cx={xDay(0)} cy={yValue(PLOT_TODAY)} r={5} fill={palette.accent} />
            <Circle cx={xDay(FORECAST_ALERT_DAY)} cy={yValue(PLOT_ALERT)} r={7} fill={palette.chartBg} />
            <Circle cx={xDay(FORECAST_ALERT_DAY)} cy={yValue(PLOT_ALERT)} r={5} fill={palette.warning} />
            <Circle cx={xDay(FORECAST_DANGER_DAY)} cy={yValue(PLOT_DANGER)} r={7} fill={palette.chartBg} />
            <Circle cx={xDay(FORECAST_DANGER_DAY)} cy={yValue(PLOT_DANGER)} r={5} fill={palette.critical} />

            {PLOT_VALUE_TICKS.map((value) => (
              <SvgText
                key={`tick-y-${value}`}
                x={left - 10}
                y={yValue(value) + 4}
                fill={palette.chartAxisText}
                fontSize={10.5}
                fontFamily={PLOT_MONO}
                textAnchor="end"
              >
                {value.toFixed(1)}
              </SvgText>
            ))}
            {PLOT_DAY_TICKS.map((day) => (
              <SvgText
                key={`tick-x-${day}`}
                x={xDay(day)}
                y={top + plotH + 21}
                fill={day === 0 ? palette.chartText : palette.chartAxisText}
                fontSize={10.5}
                fontFamily={day === 0 ? PLOT_SANS_BOLD : PLOT_MONO}
                fontWeight={day === 0 ? '600' : undefined}
                textAnchor="middle"
              >
                {day === 0 ? 'Today' : day > 0 ? `+${day} d` : `${day} d`}
              </SvgText>
            ))}

            <SvgText x={left + 10} y={top + 15} fill={palette.chartAxisText} fontSize={10} fontFamily={PLOT_SANS} letterSpacing={1.2}>
              MEASURED
            </SvgText>
            <SvgText x={xDay(0) + 10} y={top + 15} fill={palette.chartAxisText} fontSize={10} fontFamily={PLOT_SANS} letterSpacing={1.2}>
              PROJECTED
            </SvgText>

            <SvgText x={left + 10} y={yValue(PLOT_DANGER) - 9} fill={palette.critical} fontSize={11} fontFamily={PLOT_MONO}>
              HH 7.10 danger
            </SvgText>
            <SvgText x={left + 10} y={yValue(PLOT_ALERT) - 9} fill={palette.warning} fontSize={11} fontFamily={PLOT_MONO}>
              H 2.80 alert
            </SvgText>

            <SvgText
              x={xDay(0) - 12}
              y={yValue(PLOT_TODAY) - 12}
              fill={palette.accent}
              fontSize={11.5}
              fontFamily={PLOT_SANS_BOLD}
              fontWeight="600"
              textAnchor="end"
            >
              Today 2.45
            </SvgText>
            <SvgText
              x={xDay(FORECAST_ALERT_DAY) + 12}
              y={yValue(PLOT_ALERT) + 19}
              fill={palette.warning}
              fontSize={11.5}
              fontFamily={PLOT_SANS_BOLD}
              fontWeight="600"
            >
              ALERT in about 15 days
            </SvgText>
            <SvgText
              x={xDay(FORECAST_DANGER_DAY) - 12}
              y={yValue(PLOT_DANGER) + 21}
              fill={palette.critical}
              fontSize={11.5}
              fontFamily={PLOT_SANS_BOLD}
              fontWeight="600"
              textAnchor="end"
            >
              DANGER in about 80 days
            </SvgText>
          </Svg>
        ) : (
          <View style={{ height: h }} />
        )}
      </View>

      <View className="px-4 py-2.5" style={{ borderTopWidth: 1, borderTopColor: palette.lineSubtle }}>
        <Text className={text.micro} style={{ color: palette.inkFaint }}>
          Crossings are projections onto the configured H / HH thresholds, not a predicted failure date.
        </Text>
      </View>
    </View>
  );
}

function ForecastButton({ forecast, selected, onPress }: { forecast: MachinePredictionResult; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const colour = conditionColour(forecast.condition, isDark);
  const hasDanger = forecast.estimatedTimeToDangerDays !== null;

  return (
    <Hoverable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${forecast.faultName}, ${CONDITION_LABEL[forecast.condition]}, ${predictionListValue(forecast)}`}
      className="border px-3 py-3"
      style={({ pressed, hovered }) => ({
        borderColor: selected || hovered ? alpha(colour, 0.55) : palette.line,
        borderLeftColor: colour,
        borderLeftWidth: 3,
        backgroundColor: pressed || hovered ? palette.hoverSurface : selected ? palette.selected : palette.panelRaised,
        borderRadius: radius.md,
      })}
    >
      <View className="gap-2">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className={text.code} style={{ color: palette.inkFaint }}>
              {forecast.faultId}
            </Text>
            <Text numberOfLines={2} className={text.bodyStrong} style={{ color: palette.ink }}>
              {forecast.faultName}
            </Text>
          </View>
          <View className="items-end gap-0.5">
            <Text className={text.data} style={[tabular, { color: hasDanger ? colour : palette.inkMuted }]}>
              {predictionListValue(forecast)}
            </Text>
            {hasDanger ? (
              <Text className={text.meta} style={{ color: palette.inkFaint }}>
                to danger
              </Text>
            ) : null}
          </View>
        </View>
        <Text numberOfLines={2} className={text.micro} style={{ color: palette.inkMuted }}>
          {forecast.thresholdProjectionWording ?? forecast.predictionStatus}
        </Text>
      </View>
    </Hoverable>
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
  const palette = consolePalette(isDark);
  const stableSignals = signals.map((signal) => `${signal.label}: ${fmt(signal.value, signal.decimals)} ${signal.unit} stable`);

  // The healthy demo used to `return null` here, so the one machine whose whole
  // point is "a healthy machine still gets a prognosis, and it says nothing is
  // coming" showed an empty page — which reads as a broken screen rather than as
  // a stated result. It now renders the same instrument as every other healthy
  // machine, carrying the demo script's own wording where there is some.
  const forecastPoints = isHealthySseDemo ? HEALTHY_SSE_FORECAST : HEALTHY_PROGNOSIS_POINTS;
  const conditionPoints = isHealthySseDemo ? HEALTHY_SSE_PROGNOSIS_CONDITION : null;
  const plotPoints = isHealthySseDemo ? HEALTHY_SSE_PROGNOSIS_PLOTS : HEALTHY_PROGNOSIS_PLOTS;

  const facts: Fact[] = [
    { label: 'CURRENT CONDITION', value: 'HEALTHY', tone: 'healthy', note: runState ?? 'Running normally' },
    { label: 'HISTORICAL PERIOD', value: '120', unit: 'days', note: 'Stable healthy operation' },
    { label: 'DEGRADATION STATUS', value: 'NONE', note: 'No meaningful degradation detected' },
    { label: 'TREND DIRECTION', value: 'STABLE' },
    { label: 'DATA QUALITY', value: QUALITY_LABEL[dataQuality], note: `${signals.length} available measurements` },
    { label: 'HISTORY SAMPLES', value: String(model.historySampleCount), note: model.sourceLabel },
  ];

  return (
    <View className="gap-4">
      <Panel>
        <View className="gap-5">
          <VerdictHeader
            condition="healthy"
            eyebrow="FUTURE DOCTOR / PROGNOSIS"
            title="Stable healthy outlook"
            detail="Current machine condition is healthy. No significant degradation forecast is available because the evidence does not support an artificial threshold crossing or a future failure date."
          />
          <FactStrip facts={facts} />
        </View>
      </Panel>

      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        <EvidenceCard
          title="Forecast"
          caption="What the history does and does not support"
          variant="success"
          icon="chart-timeline-variant"
          items={forecastPoints}
          empty="No healthy forecast statement is available."
        />
        {conditionPoints ? (
          <EvidenceCard
            title="Condition and history"
            caption="What 120 days of measured history show"
            variant="success"
            icon="history"
            items={conditionPoints}
            empty="No condition statement is available."
          />
        ) : null}
        <EvidenceCard
          title="Stable evidence"
          caption="Live readings holding at the healthy baseline"
          variant="success"
          icon="pulse"
          items={stableSignals}
          empty="No live sensor values are available for the prognosis."
        />
        <EvidenceCard
          title="Plots shown"
          caption="What the prognosis draws for this machine"
          variant="info"
          icon="chart-line"
          items={plotPoints}
          empty="No plot definitions are available."
        />
      </View>

      {isHealthySseDemo ? (
        <View
          className="px-3 py-2.5"
          style={{ borderLeftWidth: 2, borderLeftColor: palette.accent, backgroundColor: palette.panelRaised }}
        >
          <Text className={text.micro} style={{ color: palette.inkMuted }}>
            {HEALTHY_SSE_PROGNOSIS_MESSAGE}
          </Text>
        </View>
      ) : null}
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
  const palette = consolePalette(isDark);

  const model = useMemo(() => prognostics ?? emptyPrognostics(), [prognostics]);
  const forecasts = model.predictions;
  const [selectedId, setSelectedId] = useState(selectedProblemId ?? forecasts[0]?.predictionId ?? '');
  const selected = forecasts.find((forecast) => forecast.predictionId === selectedId) ?? model.activeForecasts[0] ?? forecasts[0] ?? null;
  const bestPrediction = model.earliestProjectedDanger ?? model.activeForecasts[0] ?? selected;
  const activeForecasts = model.activeForecasts.length;
  const chainIssueCount = findings.filter((finding) => finding.rules.some((rule) => rule.evidenceClass === 'chain')).length;
  const goodSignalCount = Math.max(0, signals.length - chainIssueCount);
  const healthyOutlook = condition === 'healthy' && issues.length === 0 && findings.length === 0 && forecasts.length === 0;
  const isHealthySseDemo = hasHealthySseDemoWords(machineName);
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

  // The demo scripts put their own headline rows on the page verbatim. Where
  // those are shown, the fact strip must not say the same three things again a
  // hand's width lower — a fact repeated twice on one screen is a fact the
  // reader stops trusting the position of.
  const showsScriptRows = processRestrictionPrognosis || Boolean(bestPredictionGearboxDetails);
  // Likewise the plot: the page-level forecast and the selected forecast are
  // usually the same one, and two identical 400px charts is not two readings.
  const detailPlotIsPageHero = Boolean(bestPredictionGearboxDetails) && selected?.predictionId === bestPrediction?.predictionId;

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

  const outlookFacts: Fact[] = bestPrediction
    ? [
        {
          label: 'CURRENT CONDITION',
          value: CONDITION_LABEL[condition].toLocaleUpperCase(),
          tone: condition,
          note: 'Predictive risk is separate from current condition',
        },
        ...(showsScriptRows ? [] : [{ label: 'PREDICTION STATUS', value: forecastStatusText(bestPrediction), wide: true }]),
        {
          label: 'PROJECTED ALERT',
          value: bestPrediction.estimatedTimeToAlertDays === null ? '--' : formatDayNumber(bestPrediction.estimatedTimeToAlertDays),
          unit: dayUnit(bestPrediction.estimatedTimeToAlertDays),
          note: 'Configured threshold crossing, not a fault today',
        },
        {
          label: 'PROJECTED DANGER',
          value: bestPrediction.estimatedTimeToDangerDays === null ? '--' : formatDayNumber(bestPrediction.estimatedTimeToDangerDays),
          unit: dayUnit(bestPrediction.estimatedTimeToDangerDays),
          note: bestPrediction.faultName,
          tone: bestPrediction.condition,
        },
        {
          label: 'OPERATING TIME',
          value: fmt(bestPrediction.operatingHoursToThreshold, 0),
          unit: bestPrediction.operatingHoursToThreshold === null ? undefined : 'hours',
          note: runState ?? 'Operating state duration not recorded',
        },
        { label: 'PREDICTION CONFIDENCE', value: fmt(bestPrediction.predictionConfidence, 0), unit: '%' },
        {
          label: 'DATA COVERAGE',
          value: `${goodSignalCount}/${signals.length}`,
          note: `${QUALITY_LABEL[dataQuality]} data quality`,
        },
      ]
    : [];

  const detailFacts: Fact[] = selected
    ? [
        { label: 'STATUS', value: selected.predictionStatus },
        { label: 'PREDICTABILITY', value: selected.predictabilityClass },
        { label: 'DIAGNOSTIC CONFIDENCE', value: fmt(selected.diagnosticConfidence, 0), unit: '%' },
        { label: 'PREDICTION CONFIDENCE', value: fmt(selected.predictionConfidence, 0), unit: '%' },
        { label: 'CURRENT / BASELINE', value: formatCurrentBaseline(selected) },
        {
          label: 'PROJECTED ALERT',
          value: selected.estimatedTimeToAlertDays === null ? '--' : formatDayPhrase(selected.estimatedTimeToAlertDays),
        },
        { label: 'DEGRADATION RATE', value: formatSlope(selected.trendSlopePerDay), unit: '/ day' },
        {
          label: 'MODEL / FIT',
          value: `${selected.modelType} / ${selected.modelFit === null ? '--' : `${fmt(selected.modelFit * 100, 0)}%`}`,
        },
        { label: 'PREDICTION RANGE', value: predictionRange(selected) },
      ]
    : [];

  const advancedFacts: Fact[] = selected
    ? [
        { label: 'R² MODEL FIT', value: fmt(selected.modelFit, 3) },
        { label: 'ROBUST SLOPE', value: fmt(selected.robustSlopePerDay, 4), unit: '/ day' },
        { label: 'MONOTONICITY', value: fmt(selected.advanced.monotonicity, 2) },
        {
          label: 'VALIDATED RUL',
          value: selected.functionalFailureValidated ? fmt(selected.estimatedTimeToFunctionalFailureDays, 0) : 'UNAVAILABLE',
          unit: selected.functionalFailureValidated ? 'days' : undefined,
          note: 'Only stated once a validated failure model exists',
        },
      ]
    : [];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 20 }}>
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
            <View className="gap-5">
              <VerdictHeader
                condition={bestPrediction?.condition ?? condition}
                eyebrow="FUTURE DOCTOR / PROGNOSIS"
                title="Predictive maintenance outlook"
                detail="Prognosis reads active problem groups as maintenance forecasts. It does not claim functional RUL unless the production data exposes a validated failure model."
                action={
                  <View
                    className="border px-3 py-2"
                    style={{
                      borderColor: bestPrediction ? alpha(conditionColour(bestPrediction.condition, isDark), 0.4) : palette.line,
                      borderRadius: radius.sm,
                      backgroundColor: palette.panelRaised,
                    }}
                  >
                    <Text className={text.label} style={{ color: palette.inkFaint }}>
                      SOURCE
                    </Text>
                    <Text
                      className={cn('mt-1', text.chip)}
                      style={{ color: bestPrediction ? conditionColour(bestPrediction.condition, isDark) : palette.inkMuted }}
                    >
                      {model.sourceLabel}
                    </Text>
                  </View>
                }
              />

              {bestPrediction ? (
                <>
                  {processRestrictionPrognosis ? <DefinitionRows rows={FAULTY_SSE_PROGNOSIS_ROWS} tone="warning" /> : null}
                  <FactStrip facts={outlookFacts} />
                  {bestPredictionGearboxDetails ? <ForecastPlot /> : null}
                </>
              ) : (
                <View
                  className="items-center gap-1.5 px-4 py-10"
                  style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: palette.line, borderRadius: radius.md }}
                >
                  <Text className={text.title} style={{ color: palette.ink }}>
                    {model.enabled ? 'No credible threshold forecast' : 'Historical simulation is off'}
                  </Text>
                  <Text className={cn('max-w-[520px] text-center', text.body)} style={{ color: palette.inkMuted }}>
                    {model.enabled
                      ? 'Signals remain under monitoring or need more history.'
                      : 'Enable historical trend capture to generate prognostic data.'}
                  </Text>
                </View>
              )}
            </View>
          </Panel>

          <View className="flex-row flex-wrap items-stretch gap-4">
            <View style={FORECAST_LIST}>
              <Panel fill>
                <View className="gap-3">
                  <RegionHeading
                    eyebrow="INDEPENDENT FORECASTS"
                    title="Prediction library"
                    trailing={<CountChip count={forecasts.length} suffix="total" />}
                  />
                  <Text className={text.micro} style={{ color: palette.inkFaint }}>
                    {activeForecasts} of {forecasts.length} currently projecting a threshold crossing.
                  </Text>

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
                      <Text className={text.body} style={{ color: palette.inkMuted }}>
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
                  <View className="gap-6">
                    <View
                      className="flex-row flex-wrap items-start justify-between gap-3 pb-5"
                      style={{ borderBottomWidth: 1, borderBottomColor: palette.line }}
                    >
                      <View className="min-w-0 flex-1 gap-1.5">
                        <Text className={text.label} style={{ color: palette.inkFaint }}>
                          PREDICTION / DISPLAY-READY PART 2 OUTPUT
                        </Text>
                        <Text className="font-body-bold text-[24px] leading-[30px] tracking-[-0.03em]" style={{ color: palette.ink }}>
                          {selected.faultName}
                        </Text>
                        <Text className={text.code} style={{ color: palette.inkMuted }}>
                          {selected.location.join(' / ')}
                        </Text>
                      </View>
                      <ConditionPill condition={selected.condition} />
                    </View>

                    <FactStrip facts={detailFacts} />

                    <Region
                      eyebrow="THRESHOLD PROJECTION"
                      title="What happens next"
                      trailing={
                        processRestrictionPrognosis ? (
                          <CountChip count={FAULTY_SSE_PROGNOSIS_WHAT.length} suffix="statements" />
                        ) : predictiveGearboxDetails ? (
                          <CountChip count={PREDICTIVE_SSE_PROGNOSIS_WHAT.length} suffix="statements" />
                        ) : undefined
                      }
                    >
                      {processRestrictionPrognosis ? (
                        <Surface>
                          <StatementList items={FAULTY_SSE_PROGNOSIS_WHAT} empty="No Demo 2 prognosis statement is available." />
                        </Surface>
                      ) : predictiveGearboxDetails ? (
                        <Surface>
                          <StatementList items={PREDICTIVE_SSE_PROGNOSIS_WHAT} empty="No Demo 3 prognosis statement is available." />
                        </Surface>
                      ) : (
                        <Surface>
                          <View className="py-3">
                            <Text className={text.lede} style={{ color: palette.ink }}>
                              {selected.thresholdProjectionWording ?? 'No defensible threshold horizon is currently available.'}
                            </Text>
                          </View>
                        </Surface>
                      )}
                    </Region>

                    {predictiveGearboxDetails && !detailPlotIsPageHero ? (
                      <Region eyebrow="FORECAST OVERLAY" title="Measured history against the configured limits">
                        <ForecastPlot />
                      </Region>
                    ) : null}

                    <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                      <EvidenceShell
                        title="Maintenance plan"
                        caption="The window this forecast recommends"
                        variant="warning"
                        icon="calendar-clock"
                      >
                        <View className="gap-2.5 pt-3">
                          <View className="gap-1">
                            <Text className={text.label} style={{ color: palette.inkFaint }}>
                              INSPECTION
                            </Text>
                            <Text className={text.bodyStrong} style={{ color: palette.ink }}>
                              {selected.recommendedInspectionWindow ?? 'Continue monitoring'}
                            </Text>
                          </View>
                          <View className="gap-1">
                            <Text className={text.label} style={{ color: palette.inkFaint }}>
                              MAINTENANCE
                            </Text>
                            <Text className={text.bodyStrong} style={{ color: palette.ink }}>
                              {selected.recommendedMaintenanceWindow ?? 'Not scheduled'}
                            </Text>
                          </View>
                        </View>
                      </EvidenceShell>
                      <EvidenceCard
                        title="Available inputs"
                        caption="What this forecast was actually computed from"
                        variant="success"
                        icon="database-outline"
                        items={selected.availableInputs}
                        empty="No production inputs are available for this forecast."
                      />
                      <EvidenceCard
                        title="Missing inputs"
                        caption="What would have to be measured to go further"
                        variant="info"
                        icon="clipboard-text-search-outline"
                        items={selected.requiredAdditionalEvidence}
                        empty="No expected inputs are missing."
                      />
                      {predictiveGearboxDetails ? (
                        <EvidenceCard
                          title="Maintenance guidance shown"
                          caption="What the demo tells the operator to do"
                          variant="warning"
                          icon="wrench-outline"
                          items={PREDICTIVE_SSE_MAINTENANCE_GUIDANCE}
                          empty="No Demo 3 maintenance guidance is available."
                        />
                      ) : null}
                      {processRestrictionPrognosis ? (
                        <EvidenceCard
                          title="Maintenance guidance shown"
                          caption="What the demo tells the operator to do"
                          variant="warning"
                          icon="wrench-outline"
                          items={FAULTY_SSE_MAINTENANCE_GUIDANCE}
                          empty="No Demo 2 maintenance guidance is available."
                        />
                      ) : null}
                    </View>

                    {processRestrictionPrognosis ? (
                      <Region
                        eyebrow="IF SHORT HISTORY IS SUPPLIED"
                        title="Optional short-history display"
                        trailing={<CountChip count={FAULTY_SSE_OPTIONAL_SHORT_HISTORY.length} suffix="rows" />}
                      >
                        <Surface>
                          <StatementList items={FAULTY_SSE_OPTIONAL_SHORT_HISTORY} empty="No optional short-history statement is available." />
                        </Surface>
                      </Region>
                    ) : null}

                    {predictiveGearboxDetails ? (
                      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                        <EvidenceShell
                          title="Forecast plots shown"
                          caption="What each prognosis chart draws, and on which axes"
                          variant="info"
                          icon="chart-line"
                          count={PREDICTIVE_SSE_FORECAST_PLOTS.length}
                          basis={620}
                          minWidth={300}
                        >
                          <PlotSpecList rows={PREDICTIVE_SSE_FORECAST_PLOTS} />
                        </EvidenceShell>
                      </View>
                    ) : null}

                    <Region eyebrow="MODEL DIAGNOSTICS" title="Advanced model evidence">
                      <FactStrip facts={advancedFacts} />
                    </Region>

                    <View
                      className="px-3 py-2.5"
                      style={{ borderLeftWidth: 2, borderLeftColor: palette.warning, backgroundColor: palette.panelRaised }}
                    >
                      <Text className={text.micro} style={{ color: palette.inkMuted }}>
                        Threshold projection is not Remaining Useful Life. Functional-failure forecasts stay unavailable until a validated failure
                        model exists.
                      </Text>
                    </View>
                  </View>
                ) : (
                  <View className="items-center gap-1.5 px-4 py-16">
                    <Text className={text.title} style={{ color: palette.ink }}>
                      No credible threshold forecast
                    </Text>
                    <Text className={cn('max-w-[420px] text-center', text.body)} style={{ color: palette.inkMuted }}>
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
