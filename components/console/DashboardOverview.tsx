import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import {
  consolePalette,
  severityColor as severityToneColor,
  statusColor,
  type ConsolePalette,
} from '../../lib/consoleTheme';
import {
  buildDashboardMetrics,
  pushSample,
  type AttentionRow,
  type DashboardAlarm,
  type Insight,
} from '../../lib/dashboardMetrics';
import type { DeviceNode } from '../../lib/devices';
import type { FolderNode, ProjectNode } from '../../lib/hierarchy';
import type { LiveState } from '../../lib/liveTelemetry';
import type { MachineNode } from '../../lib/machines';
import type { CardNode } from '../../lib/rack';
import {
  DEFAULT_PLANT_OVERVIEW,
  normalizePlantOverview,
  type PlantOverviewConfig,
} from '../../lib/plantOverview';
import { countPartEdits, type PlantScene3DConfig } from '../../lib/plantScene3d';
import { apiFetch } from '../../src/lib/apiClient';
import { ROLE_LABEL, type PublicUser } from '../../src/lib/roles';
import { PlantScene3D } from './plant3d/PlantScene3D';
import { PlantOverviewEditor } from './PlantOverviewEditor';

type DashboardOverviewProps = {
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  currentUser?: PublicUser | null;
  onOpenDevices: () => void;
  onOpenMachine: (id: string) => void;
};

/**
 * Five workspaces, not one scroll: what is happening now, how we are
 * performing, why the system says so, what it is set up to do, what already
 * happened. Each fits a screen.
 */
type Section = 'operations' | 'scorecard' | 'diagnostics' | 'setup' | 'trends' | 'history';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'operations', label: 'Operations' },
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'setup', label: 'Setup' },
  { id: 'trends', label: 'Trends' },
  { id: 'history', label: 'History' },
];

/**
 * Measured series get their own hues.
 *
 * The console palette reserves green/amber/red for *status*, so painting a
 * measurement green would make "this is the health line" and "this is healthy"
 * look like the same statement. These two are deliberately outside the signal
 * set: they identify a series without asserting anything about it.
 */
const SERIES_A = '#8E86D6';
const SERIES_B = '#4FD1C5';

const DEMO_HEALTH_TREND = [86, 88, 92, 96, 79, 88, 94, 82, 98, 91, 99, 90, 84, 88, 91, 93];
const DEMO_THROUGHPUT = [150, 160, 140, 182, 153, 169, 126, 201, 224, 228, 282, 338, 289, 238, 190, 176];
const DEMO_ALARM_DAYS = ['18', '19', '20', '21', '22', '23', '24'];
const DEMO_ALARM_BARS = {
  critical: [10, 11, 18, 15, 20, 13, 16],
  warning: [22, 29, 34, 27, 31, 36, 30],
  info: [14, 18, 16, 12, 20, 15, 18],
};
/** Health target every asset is scored against. */
const HEALTH_TARGET = 90;
/** Where the health score leaves the amber band and becomes an alarm. */
const HEALTH_ALERT = 70;
/** Mirrors the weighting in `buildDashboardMetrics` — availability and reliability carry the score. */
const HEALTH_WEIGHTS = ['30%', '20%', '30%', '20%'];
/** How often the dashboard resamples. Also the clock tick — see the note in the component. */
const SAMPLE_MS = 5_000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function severityColor(palette: ConsolePalette, severity: DashboardAlarm['severity']) {
  return severityToneColor(palette, severity);
}

/** Colour bands the health axis is read against, low to high. */
function healthBands(palette: ConsolePalette) {
  return [
    { from: 0, to: 0.5, color: palette.critical },
    { from: 0.5, to: 0.7, color: palette.warning },
    { from: 0.7, to: 1, color: palette.accent },
  ];
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1));
}

/** Stable identity for "no second series", so the easing hook isn't handed a fresh array each render. */
const EMPTY_SERIES: number[] = [];

/** Samples a series at `length` evenly spaced positions, interpolating between them. */
function resample(values: number[], length: number): number[] {
  if (values.length === 0) return Array.from({ length }, () => 0);
  if (values.length === length) return values;
  return Array.from({ length }, (_, index) => {
    const at = (index / Math.max(1, length - 1)) * (values.length - 1);
    const low = Math.floor(at);
    const high = Math.min(values.length - 1, low + 1);
    return values[low] + (values[high] - values[low]) * (at - low);
  });
}

/**
 * Eases a series toward its target instead of snapping to it.
 *
 * Telemetry arrives as packets, so a chart bound straight to it twitches once
 * per frame — which reads as instrument noise rather than as the plant moving.
 * Every sample is interpolated toward the incoming one over a short ease, so a
 * value that steps 4 points travels those 4 points. Motion becomes information:
 * a slow drift looks slow and a spike looks like a spike.
 */
function useSmoothSeries(target: number[], duration = 700): number[] {
  const [shown, setShown] = useState<number[]>(target);
  const fromRef = useRef<number[]>(target);
  const frameRef = useRef<number | null>(null);
  const key = target.join(',');

  useEffect(() => {
    const to = target;
    const from = resample(fromRef.current, to.length);
    // A fresh series (first paint, or a switch between live and demo) has
    // nothing to travel from, so it simply appears.
    if (fromRef.current.length === 0) {
      fromRef.current = to;
      setShown(to);
      return;
    }
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic: quick to respond, settles without overshooting.
      const eased = 1 - (1 - t) ** 3;
      const next = to.map((value, index) => from[index] + (value - from[index]) * eased);
      setShown(next);
      fromRef.current = next;
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // `key` stands in for the array identity so a re-render with the same
    // numbers does not restart the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);

  return shown;
}

/**
 * A plant that moves, for the demo.
 *
 * With real mode off the console used to draw one frozen curve, which shows the
 * layout but not the behaviour — you cannot tell whether a chart reacts, or
 * what a threshold crossing looks like, from a still picture. This walks the
 * demo signals with enough drift to cross bands occasionally, so the charts
 * demonstrate what they do.
 */
// The bounds are separate numbers rather than a tuple so the effect's
// dependencies are primitives — a `[48, 99]` literal is a new array on every
// render, which would tear down and rebuild the interval each time.
function useDemoWalk(seed: number[], enabled: boolean, min: number, max: number, stepMs = 2200): number[] {
  const [series, setSeries] = useState<number[]>(seed);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      setSeries((current) => {
        const previous = current[current.length - 1] ?? min;
        // Mean-reverting walk: wanders, but never runs off the axis.
        const centre = (min + max) / 2;
        const drift = (centre - previous) * 0.06;
        const noise = (Math.random() - 0.5) * (max - min) * 0.13;
        const next = clamp(previous + drift + noise, min, max);
        return [...current.slice(1), Math.round(next * 10) / 10];
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [enabled, max, min, stepMs]);
  return series;
}

/** Bins `values` into `count` buckets spanning [min, max]. */
function histogram(values: number[], count: number, min: number, max: number) {
  const bins = Array.from({ length: count }, () => 0);
  const span = Math.max(1, max - min);
  for (const value of values) {
    const index = clamp(Math.floor(((value - min) / span) * count), 0, count - 1);
    bins[index] += 1;
  }
  return bins;
}

// ---------------------------------------------------------------------------
// Surface primitives
//
// One plate style for the whole console: a softly rounded panel, a hairline
// border, and a small label chip in the corner instead of a header bar with a
// rule under it. Panels carry their own quiet — the structure comes from the
// space between them and from hairlines inside them, not from boxing every
// element in its own outline.
// ---------------------------------------------------------------------------

function Chip({ children, tone }: { children: string; tone?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className={cn('self-start rounded-md px-2 py-[3px]', isDark ? 'bg-white/[0.055]' : 'bg-black/[0.045]')}>
      <Text
        className="font-mono text-[8.5px] uppercase tracking-[0.16em]"
        style={{ color: tone ?? palette.inkMuted }}
      >
        {children}
      </Text>
    </View>
  );
}

function Panel({
  label,
  labelTone,
  meta,
  action,
  children,
  padded = true,
  style,
}: {
  label?: string;
  labelTone?: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Off for panels whose content runs edge to edge (tables, the map). */
  padded?: boolean;
  style?: object;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className={cn('h-full overflow-hidden rounded-xl border', isDark ? 'border-line-dark' : 'border-line-light')}
      style={[{ backgroundColor: palette.panel }, style] as never}
    >
      {label || action ? (
        <View className={cn('flex-row items-center gap-3', padded ? 'px-4 pt-3.5' : 'px-4 py-3.5')}>
          {label ? <Chip tone={labelTone}>{label}</Chip> : null}
          <View className="min-w-0 flex-1 flex-row items-center justify-end gap-3">
            {meta ? (
              <Text numberOfLines={1} className={cn('font-mono text-[9.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                {meta}
              </Text>
            ) : null}
            {action}
          </View>
        </View>
      ) : null}
      <View className={cn('flex-1', padded && 'px-4 pb-3.5 pt-2')} style={{ minHeight: 0 }}>
        {children}
      </View>
    </View>
  );
}

/**
 * An open section: the same label chip and spacing as a panel, without the
 * border or the fill.
 *
 * Boxing everything is what made the last pass feel like a spreadsheet. A
 * border should mean "this is a separate object" — the map, a card in a rail, a
 * chart. Things that are continuous with what surrounds them get a hairline
 * instead, and the eye reads the group rather than counting the crates.
 */
function OpenSection({
  label,
  meta,
  action,
  children,
  divided = false,
}: {
  label?: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Draws the hairline that closes the section off from what follows. */
  divided?: boolean;
  /** Accepted so an open section is drop-in swappable with a panel. */
  padded?: boolean;
}) {
  const { isDark } = useAppTheme();
  return (
    <View className="h-full" style={{ minHeight: 0 }}>
      {label || action ? (
        <View className="flex-row items-center gap-3 pb-2.5">
          {label ? <Chip>{label}</Chip> : null}
          <View className="min-w-0 flex-1 flex-row items-center justify-end gap-3">
            {meta ? (
              <Text numberOfLines={1} className={cn('font-mono text-[9.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                {meta}
              </Text>
            ) : null}
            {action}
          </View>
        </View>
      ) : null}
      <View className="flex-1" style={{ minHeight: 0 }}>
        {children}
      </View>
      {divided ? <Rule /> : null}
    </View>
  );
}

/** Hairline. The only structural line the layout uses inside a panel. */
function Rule({ vertical = false }: { vertical?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return <View style={vertical ? { width: 1, alignSelf: 'stretch', backgroundColor: palette.line } : { height: 1, backgroundColor: palette.line }} />;
}

function Dot({ color, size = 6 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/**
 * A headline metric stated against its plan.
 *
 * No card, no border — just the label, the number, the track and the plan line.
 * A row of these divided by hairlines reads as one instrument rather than four
 * competing tiles.
 */
function Metric({
  label,
  value,
  unit,
  progress,
  target,
  plan,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  progress: number;
  target?: number;
  plan: string;
  tone: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const fill = clamp(progress, 0, 1);
  return (
    <View className="min-w-0 flex-1 px-4">
      <View className="flex-row items-start justify-between gap-2">
        <Text
          className={cn('min-w-0 flex-1 font-mono text-[9px] uppercase leading-[13px] tracking-[0.14em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}
        >
          {label}
        </Text>
        <View className="flex-row items-baseline gap-1">
          <Text className="font-display text-[23px] leading-[26px]" style={{ color: tone }}>
            {value}
          </Text>
          {unit ? (
            <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{unit}</Text>
          ) : null}
        </View>
      </View>

      <View className="mt-2.5 h-[5px] flex-row items-center gap-[3px]">
        <View className="flex-1 flex-row overflow-hidden rounded-full" style={{ backgroundColor: palette.grid }}>
          <View style={{ width: `${fill * 100}%`, height: 5, borderRadius: 999, backgroundColor: tone }} />
        </View>
        {target !== undefined ? <View style={{ width: 2, height: 5, borderRadius: 1, backgroundColor: palette.inkFaint }} /> : null}
      </View>

      <Text numberOfLines={1} className={cn('mt-2 font-body text-[10.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {plan}
      </Text>
    </View>
  );
}

/**
 * A magnitude as a row of ticks.
 *
 * A solid bar invites you to compare lengths you cannot actually measure by
 * eye; discrete ticks quantise the reading, so "eleven of twenty" is countable
 * at a glance and two rows a tick apart are visibly a tick apart. The colour
 * carries the same rank, so the column can be skimmed without reading a number.
 */
function TickBar({ value, max = 100, ticks = 22, tone }: { value: number; max?: number; ticks?: number; tone?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ratio = clamp(value / Math.max(1, max), 0, 1);
  const lit = Math.round(ratio * ticks);
  const color = tone ?? (ratio >= 0.66 ? SERIES_A : ratio >= 0.33 ? SERIES_B : palette.neutral);
  return (
    <View className="flex-row items-center gap-[2px]">
      {Array.from({ length: ticks }, (_, index) => (
        <View
          key={index}
          style={{
            width: 3,
            height: 13,
            borderRadius: 1,
            backgroundColor: index < lit ? color : palette.grid,
          }}
        />
      ))}
    </View>
  );
}

/** Label · value · tick-bar row. */
function ContributionRow({ label, value, suffix = '%', max = 100, tone, first = false }: { label: string; value: number; suffix?: string; max?: number; tone?: string; first?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <View>
      {!first ? <Rule /> : null}
      <View className="flex-row items-center gap-3 py-2.5">
        <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body text-[12px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
          {label}
        </Text>
        <Text className={cn('w-[52px] text-right font-mono text-[12px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
          {value.toFixed(1)}
          {suffix}
        </Text>
        <TickBar value={value} max={max} tone={tone} />
      </View>
    </View>
  );
}

/**
 * Deviation, as five steps centred on zero.
 *
 * Rounded segments rather than blocks: the scale is a reading, not a grid.
 */
function DeviationScale({ gap, palette }: { gap: number; palette: ConsolePalette }) {
  const magnitude = Math.min(2, Math.round(Math.abs(gap) / 6));
  const index = gap === 0 ? 2 : gap < 0 ? 2 - magnitude : 2 + magnitude;
  const tint = Math.abs(gap) <= 3 ? palette.accent : Math.abs(gap) <= 12 ? palette.warning : palette.critical;
  return (
    <View className="flex-row items-center gap-[4px]">
      {[0, 1, 2, 3, 4].map((step) => (
        <View key={step} style={{ width: 13, height: 7, borderRadius: 4, backgroundColor: step === index ? tint : palette.grid }} />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

type Point = { x: number; y: number };

/**
 * Catmull-Rom through the samples, emitted as cubic beziers.
 *
 * A polyline turns every sample into a corner, so a reading that drifts looks
 * like a reading that jumped. The spline passes through every point — it does
 * not invent values — while showing the shape of the movement between them.
 */
function splinePath(points: Point[], tension = 0.5): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension * 2;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Indices where the series turns hardest.
 *
 * A trend line answers "what is it doing"; the turns answer "when did it start
 * doing that", which is the question an operator actually opens a chart with.
 * Scored by second difference, and only the sharpest few are marked so the
 * chart does not turn into a picket fence.
 */
function inflections(values: number[], count = 2): number[] {
  if (values.length < 5) return [];
  const spread = Math.max(1, Math.max(...values) - Math.min(...values));
  const scored = values
    .slice(1, -1)
    .map((value, index) => ({
      index: index + 1,
      score: Math.abs(values[index] - 2 * value + values[index + 2]) / spread,
    }))
    .filter((entry) => entry.score > 0.18)
    .sort((a, b) => b.score - a.score);

  // Keep the marks apart: two neighbouring samples on the same turn are one
  // event, not two.
  const chosen: number[] = [];
  for (const entry of scored) {
    if (chosen.length >= count) break;
    if (chosen.every((index) => Math.abs(index - entry.index) > values.length / 6)) chosen.push(entry.index);
  }
  return chosen;
}

/** Gauge rail for the health axis: the bands the score is judged against. */
function healthRail(palette: ConsolePalette): GaugeBand[] {
  return [
    { from: 0, to: 0.5, color: palette.critical },
    { from: 0.5, to: 0.7, color: palette.warning },
    { from: 0.7, to: 1, color: palette.accent },
  ];
}

/** Gauge rail for open alarms: few is good, many is not. */
function alarmRail(palette: ConsolePalette): GaugeBand[] {
  return [
    { from: 0, to: 0.35, color: palette.accent },
    { from: 0.35, to: 0.65, color: palette.warning },
    { from: 0.65, to: 1, color: palette.critical },
  ];
}

/** A gauge rail segment: `from`/`to` are fractions of the axis, low to high. */
type GaugeBand = { from: number; to: number; color: string };

/** A sparsely sampled reading, plotted as a dot against the right axis. */
type TrendEvent = { at: number; value: number; pending?: boolean };

/**
 * The plant trend, drawn the way a control room reads one.
 *
 * Two axes, each with a colour rail beside it showing the bands that axis is
 * judged against, so a line's position can be read as good or bad without
 * consulting a legend. A dense measured series on the left axis; sparse lab-style
 * readings as dots on the right. The NOW rule separates measured from projected
 * — everything left of it happened, everything right of it is arithmetic on the
 * recent window, drawn in a different colour so the two are never confused.
 */
function TrendChart({
  primary,
  events,
  height = 200,
  primaryMin = 0,
  primaryMax = 100,
  secondMin = 0,
  secondMax = 4,
  leftBands,
  rightBands,
  timeLabels,
  project = false,
  color = SERIES_A,
}: {
  primary: number[];
  events?: TrendEvent[];
  height?: number;
  primaryMin?: number;
  primaryMax?: number;
  secondMin?: number;
  secondMax?: number;
  leftBands?: GaugeBand[];
  rightBands?: GaugeBand[];
  timeLabels?: string[];
  project?: boolean;
  color?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const smooth = useSmoothSeries(primary);

  const width = 1000;
  const padL = 58;
  const padR = 58;
  const padT = 14;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const series = smooth.length > 1 ? smooth : [smooth[0] ?? 0, smooth[0] ?? 0];
  // The measured window occupies the left portion; the projection continues into
  // the remainder, so NOW always sits at the same place on the frame.
  const nowRatio = project ? 0.74 : 1;
  const nowX = padL + plotW * nowRatio;

  const lo = primaryMin;
  const hi = Math.max(primaryMax, ...series);
  const yFor = (value: number) => padT + plotH - ((value - lo) / Math.max(1, hi - lo)) * plotH;
  const xFor = (index: number, count: number) => padL + (index / Math.max(1, count - 1)) * (plotW * nowRatio);

  const points = series.map((value, index) => ({ x: xFor(index, series.length), y: yFor(value) }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');

  // Projection: least-squares slope over the recent window, continued past NOW.
  let projected = '';
  if (project && series.length >= 4) {
    const window = series.slice(-Math.min(10, series.length));
    const n = window.length;
    const meanX = (n - 1) / 2;
    const meanY = mean(window);
    let num = 0;
    let den = 0;
    window.forEach((value, index) => {
      num += (index - meanX) * (value - meanY);
      den += (index - meanX) ** 2;
    });
    const slope = den === 0 ? 0 : num / den;
    const step = (plotW * (1 - nowRatio)) / 12;
    const last = series[series.length - 1];
    const tail: string[] = [`${nowX},${yFor(last)}`];
    for (let i = 1; i <= 12; i += 1) {
      // Damped, so a steep recent slope does not imply the plant keeps that up.
      const value = clamp(last + slope * i * 0.55, lo, hi);
      tail.push(`${nowX + i * step},${yFor(value)}`);
    }
    projected = tail.join(' ');
  }

  const rightFor = (value: number) => padT + plotH - ((value - secondMin) / Math.max(1, secondMax - secondMin)) * plotH;
  const gridRatios = [0, 0.25, 0.5, 0.75, 1];

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Plot frame */}
      <Rect x={padL} y={padT} width={plotW} height={plotH} fill="none" stroke={palette.line} strokeWidth={1} />

      {/* Horizontal grid + left scale */}
      {gridRatios.map((ratio) => {
        const y = padT + plotH - ratio * plotH;
        return (
          <G key={`h-${ratio}`}>
            <Line x1={padL} x2={padL + plotW} y1={y} y2={y} stroke={palette.grid} strokeWidth={1} />
            <SvgText x={padL - 20} y={y + 3} fontSize={9} fill={palette.inkFaint} textAnchor="end">
              {Math.round(lo + ratio * (hi - lo))}
            </SvgText>
            <SvgText x={padL + plotW + 20} y={y + 3} fontSize={9} fill={palette.inkFaint}>
              {(secondMin + ratio * (secondMax - secondMin)).toFixed(1)}
            </SvgText>
          </G>
        );
      })}

      {/* Faint vertical grid on the time ticks */}
      {(timeLabels ?? []).map((label, index, all) => {
        const x = padL + (index / Math.max(1, all.length - 1)) * plotW;
        return (
          <G key={`v-${label}-${index}`}>
            <Line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke={palette.grid} strokeWidth={1} opacity={0.55} />
            <SvgText x={x} y={height - 10} fontSize={8.5} fill={palette.inkFaint} textAnchor="middle">
              {label}
            </SvgText>
          </G>
        );
      })}

      {/* Colour rails: the bands each axis is judged against, drawn against the
          scale they apply to. */}
      {leftBands?.map((band) => (
        <Rect
          key={`lb-${band.from}-${band.color}`}
          x={padL - 12}
          y={padT + plotH - band.to * plotH}
          width={5}
          height={Math.max(1, (band.to - band.from) * plotH)}
          fill={band.color}
        />
      ))}
      {rightBands?.map((band) => (
        <Rect
          key={`rb-${band.from}-${band.color}`}
          x={padL + plotW + 7}
          y={padT + plotH - band.to * plotH}
          width={5}
          height={Math.max(1, (band.to - band.from) * plotH)}
          fill={band.color}
        />
      ))}

      {/* Measured */}
      <Polyline points={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />

      {/* Projected */}
      {projected ? (
        <Polyline points={projected} fill="none" stroke={SERIES_B} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      ) : null}

      {/* NOW */}
      {project ? (
        <Line x1={nowX} y1={padT} x2={nowX} y2={padT + plotH} stroke={palette.accent} strokeWidth={1.5} />
      ) : null}

      {/* Sparse readings on the right axis. Pending ones are hollow grey — they
          are scheduled, not measured, and must not read as data. */}
      {(events ?? []).map((event, index) => (
        <Circle
          key={`ev-${index}`}
          cx={padL + event.at * plotW}
          cy={rightFor(event.value)}
          r={3.5}
          fill={event.pending ? palette.neutral : palette.ink}
          opacity={event.pending ? 0.55 : 1}
        />
      ))}
    </Svg>
  );
}

/**
 * Distribution of a population, banded by the same thresholds as the gauge.
 *
 * A mean alone hides the shape: twelve assets averaging 78 could be twelve at
 * 78 or six at 95 and six at 61, and those need different work. The histogram
 * shows which, and the summary line under it carries the numbers.
 */
function Histogram({ values, height = 172, min = 0, max = 100, bins }: { values: number[]; height?: number; min?: number; max?: number; bins?: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const width = 520;
  const padL = 30;
  const padB = 22;
  const padT = 10;
  const plotW = width - padL - 14;
  const plotH = height - padT - padB;
  // Bin count follows the population. Eighteen bins over five assets is five
  // lonely spikes and thirteen gaps, which says nothing about the distribution.
  const binCount = bins ?? clamp(Math.round(values.length * 1.5), 6, 18);
  const counts = histogram(values, binCount, min, max);
  const peak = Math.max(1, ...counts);
  const barW = plotW / binCount;
  // Counts are whole assets, so the axis only ever carries whole numbers —
  // otherwise a peak of 1 prints "1, 1, 0" up the side.
  const ticks = peak <= 4 ? Array.from({ length: peak + 1 }, (_, i) => i / peak) : [0, 0.5, 1];

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {ticks.map((ratio) => {
        const y = padT + plotH - ratio * plotH;
        return (
          <G key={ratio}>
            <Line x1={padL} x2={padL + plotW} y1={y} y2={y} stroke={palette.grid} strokeWidth={1} />
            <SvgText x={padL - 8} y={y + 3} fontSize={9} fill={palette.inkFaint} textAnchor="end">
              {Math.round(ratio * peak)}
            </SvgText>
          </G>
        );
      })}
      {counts.map((count, index) => {
        const centre = min + ((index + 0.5) / binCount) * (max - min);
        const colour = centre >= 70 ? palette.accent : centre >= 50 ? palette.warning : palette.critical;
        const h = (count / peak) * plotH;
        return (
          <Rect
            key={index}
            x={padL + index * barW + 1}
            y={padT + plotH - h}
            width={Math.max(1, barW - 2)}
            height={h}
            rx={1.5}
            fill={colour}
            opacity={0.85}
          />
        );
      })}
      {[0, 0.5, 1].map((ratio) => (
        <SvgText key={ratio} x={padL + ratio * plotW} y={height - 6} fontSize={9} fill={palette.inkFaint} textAnchor="middle">
          {Math.round(min + ratio * (max - min))}
        </SvgText>
      ))}
    </Svg>
  );
}

function StackedBars({ labels, critical, warning, info, height = 190 }: { labels: string[]; critical: number[]; warning: number[]; info: number[]; height?: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const width = 620;
  const padL = 32;
  const padB = 24;
  const padT = 10;
  const plotH = height - padT - padB;
  const baseY = padT + plotH;
  const max = Math.max(10, ...labels.map((_, index) => (critical[index] ?? 0) + (warning[index] ?? 0) + (info[index] ?? 0)));
  const step = (width - padL - 16) / Math.max(1, labels.length);
  const barW = Math.min(26, step * 0.5);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {[0, 0.5, 1].map((ratio) => {
        const y = baseY - ratio * plotH;
        return (
          <G key={ratio}>
            <Line x1={padL} x2={width - 16} y1={y} y2={y} stroke={palette.grid} strokeWidth={1} />
            <SvgText x={padL - 8} y={y + 3} fontSize={9} fill={palette.inkFaint} textAnchor="end">
              {Math.round(ratio * max)}
            </SvgText>
          </G>
        );
      })}
      {labels.map((label, index) => {
        const x = padL + index * step + (step - barW) / 2;
        const cH = ((critical[index] ?? 0) / max) * plotH;
        const wH = ((warning[index] ?? 0) / max) * plotH;
        const iH = ((info[index] ?? 0) / max) * plotH;
        return (
          <G key={`${label}-${index}`}>
            <Rect x={x} y={baseY - cH} width={barW} height={cH} fill={palette.critical} />
            <Rect x={x} y={baseY - cH - wH} width={barW} height={wH} fill={palette.warning} />
            <Rect x={x} y={baseY - cH - wH - iH} width={barW} height={iH} rx={2} fill={palette.neutral} />
            <SvgText x={x + barW / 2} y={height - 8} fontSize={9} fill={palette.inkFaint} textAnchor="middle">
              {label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function DonutChart({ segments, total, size = 148 }: { segments: { label: string; value: number; color: string }[]; total: number; size?: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const scale = size / 150;
  const radius = 48 * scale;
  const circumference = 2 * Math.PI * radius;
  const sum = Math.max(1, total);
  let offset = 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={palette.grid} strokeWidth={11 * scale} fill="none" />
      {segments.map((segment) => {
        const length = (segment.value / sum) * circumference;
        const item = (
          <Circle
            key={segment.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={segment.color}
            strokeWidth={11 * scale}
            fill="none"
            strokeDasharray={`${Math.max(0, length - 2)} ${circumference - Math.max(0, length - 2)}`}
            strokeDashoffset={-offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += length;
        return item;
      })}
      <SvgText x={size / 2} y={size / 2 + 2} textAnchor="middle" fontSize={26 * scale} fontWeight="600" fill={palette.ink}>
        {total}
      </SvgText>
      <SvgText x={size / 2} y={size / 2 + 18 * scale} textAnchor="middle" fontSize={9 * scale} fill={palette.inkFaint}>
        TOTAL
      </SvgText>
    </Svg>
  );
}

/** Series legend + summary, in the row form the reference uses under a chart. */
function SeriesTable({ rows }: { rows: { color: string; name: string; mean: string; spread: string }[] }) {
  const { isDark } = useAppTheme();
  const headCell = cn('font-mono text-[8.5px] uppercase tracking-[0.14em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted');
  return (
    <View className="mt-1">
      <View className="flex-row items-center pb-1.5">
        <Text className={cn(headCell, 'flex-1')}>Name</Text>
        <Text className={cn(headCell, 'w-[80px] text-right')}>Mean</Text>
        <Text className={cn(headCell, 'w-[80px] text-right')}>Stddev</Text>
      </View>
      <Rule />
      {rows.map((row) => (
        <View key={row.name} className="flex-row items-center pt-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: row.color }} />
            <Text numberOfLines={1} className={cn('font-body text-[11.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{row.name}</Text>
          </View>
          <Text className={cn('w-[80px] text-right font-mono text-[11.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{row.mean}</Text>
          <Text className={cn('w-[80px] text-right font-mono text-[11.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row.spread}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Gives a chart whatever height its panel has left.
 *
 * The charts draw into a fixed viewBox, so stretching the SVG would stretch the
 * type and the stroke weights with it. Measuring the slot and handing the chart
 * a real pixel height keeps every line the weight it was drawn at, at any panel
 * size.
 */
function FillChart({ render, min = 90 }: { render: (height: number) => ReactNode; min?: number }) {
  const [height, setHeight] = useState(0);
  return (
    <View
      className="flex-1"
      style={{ minHeight: 0 }}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.height);
        setHeight((current) => (Math.abs(current - next) > 1 ? next : current));
      }}
    >
      {height >= min ? render(height) : null}
    </View>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  const { isDark } = useAppTheme();
  return (
    <View className="flex-row items-center gap-4">
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          <View style={{ width: 10, height: 2, borderRadius: 1, backgroundColor: item.color }} />
          <Text className={cn('font-body text-[10.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

/**
 * The plant map, rendered as real 3D geometry.
 *
 * The illustration this panel used to show has been replaced by the Blender
 * component models: an operator can orbit the plant, and every component
 * carries its live status on the model itself (the beacon lens) as well as on
 * its floating label.
 */
function PlantMap({
  scene,
  statusColors,
  canEdit,
  onEdit,
}: {
  scene: PlantScene3DConfig;
  /** Resolved status colour per component id. */
  statusColors: Record<string, string>;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const { isDark } = useAppTheme();
  return (
    <Panel
      label="Plant map"
      padded={false}
      meta={`${scene.components.length} components`}
      action={
        canEdit ? (
          <Pressable onPress={onEdit} accessibilityRole="button" className="rounded-md px-2 py-1">
            <Text className="font-body text-[10.5px] text-accent">Edit map</Text>
          </Pressable>
        ) : null
      }
    >
      <View className="relative flex-1 overflow-hidden" style={{ minHeight: 220 }}>
        <PlantScene3D scene={scene} statusColors={statusColors} dark={isDark} />
      </View>
    </Panel>
  );
}

/**
 * Asset performance against plan.
 *
 * The row an operator reads first, so it states target, actual and the gap
 * between them side by side, and tints the whole row when an asset is off
 * plan — the deviation is a property of the asset, not of one cell.
 */
function AssetTable({
  rows,
  onOpenMachine,
  label = 'Asset scorecard',
  boxed = true,
}: {
  rows: AttentionRow[];
  onOpenMachine: (id: string) => void;
  label?: string;
  boxed?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const headCell = cn('font-mono text-[8.5px] uppercase tracking-[0.14em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted');
  const onPlan = rows.filter((row) => row.health >= HEALTH_TARGET - 3).length;
  const Wrapper = boxed ? Panel : OpenSection;
  // The open variant sits on the page, so it drops the panel's inner gutter.
  const gutter = boxed ? 'px-4' : 'px-0';

  return (
    <Wrapper label={label} meta={`${onPlan}/${rows.length} on plan`} padded={false}>
      <View className={cn('flex-row items-center gap-2 pb-2', gutter)}>
        <Text className={cn(headCell, 'flex-[2]')}>Asset</Text>
        <Text className={cn(headCell, 'w-[88px]')}>Deviation</Text>
        <Text className={cn(headCell, 'w-[52px] text-right')}>Target</Text>
        <Text className={cn(headCell, 'w-[52px] text-right')}>Actual</Text>
        <Text className={cn(headCell, 'w-[46px] text-right')}>Gap</Text>
        <Text className={cn(headCell, 'flex-[1.5] pl-3')}>System intent</Text>
      </View>
      <Rule />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {rows.length === 0 ? (
          <View className="items-center py-10">
            <Text className={cn('font-body text-[11.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Every asset is on plan</Text>
          </View>
        ) : (
          rows.map((row) => {
            const gap = row.health - HEALTH_TARGET;
            const tint = gap >= -3 ? palette.accent : gap >= -12 ? palette.warning : palette.critical;
            const offPlan = gap < -3;
            // Only a material miss earns a tinted row. Highlighting every asset
            // that is a point or two under plan turns the whole table into one
            // coloured block, which highlights nothing.
            const flagged = gap < -12;
            return (
              <Pressable
                key={row.id}
                disabled={!row.machineId}
                onPress={() => row.machineId && onOpenMachine(row.machineId)}
                accessibilityRole="button"
                accessibilityLabel={`${row.name}, health ${row.health} against target ${HEALTH_TARGET}. ${row.action}`}
                className={cn('flex-row items-center gap-2 py-2.5', gutter)}
                style={
                  flagged
                    ? {
                        // Lighter on white: the same alpha that reads as a
                        // whisper on near-black reads as a pink block on paper.
                        backgroundColor: `${tint}${isDark ? '14' : '0B'}`,
                        borderLeftWidth: 2,
                        borderLeftColor: tint,
                        paddingLeft: boxed ? 14 : 10,
                      }
                    : undefined
                }
              >
                <View className="min-w-0 flex-[2] flex-row items-center gap-2.5">
                  <Dot color={tint} />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className={cn('font-body text-[12.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{row.name}</Text>
                    <Text numberOfLines={1} className={cn('mt-0.5 font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                      {row.area}
                    </Text>
                  </View>
                </View>
                <View className="w-[88px]">
                  <DeviationScale gap={gap} palette={palette} />
                </View>
                <Text className={cn('w-[52px] text-right font-mono text-[12px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{HEALTH_TARGET}</Text>
                <Text className="w-[52px] text-right font-mono text-[12px]" style={{ color: offPlan ? tint : palette.ink }}>{row.health}</Text>
                <Text className="w-[46px] text-right font-mono text-[12px]" style={{ color: tint }}>
                  {gap > 0 ? `+${gap}` : gap}
                </Text>
                <Text numberOfLines={1} className={cn('flex-[1.5] pl-3 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                  {row.action}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Wrapper>
  );
}

/**
 * What the platform has done, newest first.
 *
 * Every other panel answers "what is the plant doing". This one answers "what
 * did ULTRON do about it", which is the difference between a dashboard you
 * watch and one you trust.
 */
function ActionRail({
  insights,
  alarms,
  label = 'Recent actions',
  boxed = true,
}: {
  insights: Insight[];
  alarms: DashboardAlarm[];
  label?: string;
  boxed?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const entries = [
    ...insights.slice(0, 5).map((insight) => ({
      id: `i-${insight.id}`,
      time: insight.confidence,
      tag: insight.subject,
      title: insight.recommendation,
      meta: insight.finding,
      tone: insight.priority === 'High' ? palette.critical : insight.priority === 'Medium' ? palette.warning : palette.accent,
    })),
    ...alarms.slice(0, 5).map((alarm) => ({
      id: `a-${alarm.id}`,
      time: alarm.age,
      tag: alarm.source,
      title: alarm.message,
      meta: `${alarm.value} · threshold ${alarm.threshold}`,
      tone: severityColor(palette, alarm.severity),
    })),
  ];

  // Open variant: a spine with a dot per entry. A log is a sequence, and a
  // continuous line says that where a stack of separate cards does not.
  if (!boxed) {
    return (
      <OpenSection label={label} meta={`${entries.length} entries`}>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {entries.length === 0 ? (
            <Text className={cn('py-8 text-center font-body text-[11.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              Nothing to report
            </Text>
          ) : (
            entries.map((entry, index) => (
              <View key={entry.id} className="flex-row gap-3">
                <View className="items-center" style={{ width: 12 }}>
                  <View style={{ width: 1, height: 7, backgroundColor: index === 0 ? 'transparent' : palette.line }} />
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: entry.tone }} />
                  <View style={{ width: 1, flex: 1, backgroundColor: palette.line }} />
                </View>
                <View className="min-w-0 flex-1 pb-3.5">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body-medium text-[12px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
                      {entry.title}
                    </Text>
                    <Text className={cn('font-mono text-[9.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{entry.time}</Text>
                  </View>
                  <Text numberOfLines={1} className={cn('mt-1 font-body text-[10.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    {entry.tag} - {entry.meta}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </OpenSection>
    );
  }

  return (
    <Panel label={label} padded={false}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 8 }} showsVerticalScrollIndicator={false}>
        {entries.length === 0 ? (
          <Text className={cn('px-2 py-8 text-center font-body text-[11.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            Nothing to report
          </Text>
        ) : (
          entries.map((entry, index) => (
            <View
              key={entry.id}
              className={cn('rounded-lg border px-3 py-2.5', isDark ? 'border-line-dark' : 'border-line-light')}
              // Older entries recede down the rail — recency without a
              // timestamp column taking up width.
              style={{ backgroundColor: palette.panelRaised, opacity: 1 - Math.min(0.5, index * 0.09) }}
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text className={cn('font-mono text-[9.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{entry.time}</Text>
                <View className="flex-row items-center gap-1.5">
                  <Dot color={entry.tone} size={5} />
                  <Text numberOfLines={1} className={cn('max-w-[120px] font-mono text-[8.5px] uppercase tracking-[0.12em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    {entry.tag}
                  </Text>
                </View>
              </View>
              <Text numberOfLines={2} className={cn('mt-1.5 font-body-medium text-[12px] leading-[16px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
                {entry.title}
              </Text>
              <Text numberOfLines={1} className={cn('mt-1 font-body text-[10.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                {entry.meta}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </Panel>
  );
}

function AlarmLog({ alarms, boxed = true }: { alarms: DashboardAlarm[]; boxed?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const headCell = cn('font-mono text-[8.5px] uppercase tracking-[0.14em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted');
  const Wrapper = boxed ? Panel : OpenSection;
  const gutter = boxed ? 'px-4' : 'px-0';
  return (
    <Wrapper label="Alarm log" meta={`${alarms.length} open`} padded={false}>
      <View className={cn('flex-row items-center pb-2', gutter)}>
        <Text className={cn(headCell, 'w-[72px]')}>Severity</Text>
        <Text className={cn(headCell, 'min-w-0 flex-[1.4]')}>Alarm</Text>
        <Text className={cn(headCell, 'min-w-0 flex-1')}>Source</Text>
        <Text className={cn(headCell, 'w-[92px]')}>Value</Text>
        <Text className={cn(headCell, 'w-[84px]')}>Time</Text>
        <Text className={cn(headCell, 'w-[56px] text-right')}>State</Text>
      </View>
      <Rule />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {alarms.length === 0 ? (
          <View className="items-center py-10">
            <Text className={cn('font-body text-[11.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>No active alarms</Text>
          </View>
        ) : (
          alarms.map((alarm) => {
            const color = severityColor(palette, alarm.severity);
            return (
              <View key={alarm.id} className={cn('flex-row items-center py-2.5', gutter)}>
                <View className="w-[72px] flex-row items-center gap-2">
                  <Dot color={color} size={5} />
                  <Text className="font-body text-[10.5px]" style={{ color }}>{alarm.severity}</Text>
                </View>
                <Text numberOfLines={1} className={cn('min-w-0 flex-[1.4] font-body text-[11.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{alarm.message}</Text>
                <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm.source}</Text>
                <Text numberOfLines={1} className={cn('w-[92px] font-mono text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{alarm.value}</Text>
                <Text numberOfLines={1} className={cn('w-[84px] font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm.time}</Text>
                <Text className={cn('w-[56px] text-right font-body text-[10.5px]', alarm.state === 'Ack' ? 'text-accent' : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                  {alarm.state}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </Wrapper>
  );
}

function Findings({ insights }: { insights: Insight[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <Panel label="Findings" meta={`${insights.length} open`} padded={false}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 14 }} showsVerticalScrollIndicator={false}>
        {insights.length === 0 ? (
          <Text className={cn('py-10 text-center font-body text-[11.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            No recommendations right now
          </Text>
        ) : (
          insights.map((insight, index) => {
            const color = insight.priority === 'High' ? palette.critical : insight.priority === 'Medium' ? palette.warning : palette.accent;
            return (
              <View key={insight.id}>
                {index > 0 ? <Rule /> : null}
                <View className="py-3">
                  <View className="flex-row items-center gap-2">
                    <Dot color={color} size={5} />
                    <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body-medium text-[12.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
                      {insight.subject}
                    </Text>
                    <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color }}>{insight.priority}</Text>
                  </View>
                  <Text className={cn('mt-1.5 font-body text-[12px] leading-[17px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    {insight.finding}. {insight.recommendation}.
                  </Text>
                  <View className="mt-2 flex-row items-center gap-3">
                    <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                      {insight.evidence}
                    </Text>
                    <Text className={cn('font-mono text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>Conf {insight.confidence}</Text>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </Panel>
  );
}

/** Label/value line used by the configuration plates. */
function SpecRow({ label, value, tint, first = false }: { label: string; value: string; tint?: string; first?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <View>
      {!first ? <Rule /> : null}
      <View className="flex-row items-center justify-between gap-3 py-2.5">
        <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body text-[11.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          className={cn('font-mono text-[11.5px]', !tint && (isDark ? 'text-ink' : 'text-ink-inverse'))}
          style={tint ? { color: tint } : undefined}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Full-screen sheet, used by the plant map editor. */
function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { isDark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const sheetWidth = Math.min(Math.max(width - 32, 320), 1280);
  const sheetHeight = Math.min(Math.max(height - 64, 360), 820);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/60 p-4">
        <View
          className={cn('overflow-hidden rounded-2xl border', isDark ? 'border-line-dark bg-surface' : 'border-line-light bg-white')}
          style={{ width: sheetWidth, maxHeight: sheetHeight }}
        >
          <View className={cn('flex-row items-center justify-between border-b px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
            <Text className={cn('font-body-medium text-[13px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
            <Pressable onPress={onClose} className={cn('rounded-lg border px-3 py-1.5', isDark ? 'border-line-dark' : 'border-line-light')}>
              <Text className={cn('font-body text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The section switcher.
 *
 * Plain text on a single baseline, the active one underlined in the accent.
 * No pills, no cells, no borders between items — the underline is the whole
 * control, which is why it reads as navigation rather than as five buttons.
 */
function SectionTabs({ active, onChange }: { active: Section; onChange: (section: Section) => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className={cn('border-b', isDark ? 'border-line-dark' : 'border-line-light')}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', paddingHorizontal: 16 }}>
        {SECTIONS.map((section) => {
          const isActive = section.id === active;
          return (
            <Pressable
              key={section.id}
              onPress={() => onChange(section.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              className="mr-7 h-10 justify-center"
              style={{ borderBottomWidth: 2, borderBottomColor: isActive ? palette.accent : 'transparent', marginBottom: -1 }}
            >
              <Text
                className={cn(
                  'font-body text-[12.5px]',
                  isActive ? (isDark ? 'text-ink' : 'text-ink-inverse') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
                )}
              >
                {section.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function DashboardOverview({
  projects,
  folders,
  machines,
  devices,
  cards,
  live,
  currentUser,
  onOpenDevices,
  onOpenMachine,
}: DashboardOverviewProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  const [section, setSection] = useState<Section>('operations');
  const [plantConfig, setPlantConfig] = useState<PlantOverviewConfig>(DEFAULT_PLANT_OVERVIEW);
  const [plantEditorOpen, setPlantEditorOpen] = useState(false);
  const [plantSaving, setPlantSaving] = useState(false);
  const [plantError, setPlantError] = useState<string | null>(null);
  const isCompact = width > 0 && width < 1180;
  const canEditPlant = currentUser?.role === 'super_admin';

  // The plant overview layout is shared: super admins save it, everyone else
  // renders whatever was saved.
  useEffect(() => {
    let cancelled = false;
    void apiFetch('/api/workspace/plant-overview')
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { config?: unknown };
        if (!cancelled) setPlantConfig(normalizePlantOverview(data.config));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const savePlantConfig = async (config: PlantOverviewConfig) => {
    setPlantSaving(true);
    setPlantError(null);
    try {
      const response = await apiFetch('/api/workspace/plant-overview', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = (await response.json().catch(() => ({}))) as { config?: unknown; error?: string };
      if (!response.ok) {
        setPlantError(data.error ?? 'Could not save the plant overview.');
        return;
      }
      setPlantConfig(normalizePlantOverview(data.config ?? config));
      setPlantEditorOpen(false);
    } catch {
      setPlantError('Could not reach the server.');
    } finally {
      setPlantSaving(false);
    }
  };

  // One tick per sample window, not per second.
  //
  // `buildDashboardMetrics` walks every measurement, rack and gateway, and the
  // whole dashboard hangs off its result — so a 1s clock meant rebuilding and
  // re-rendering the entire console once a second for a timestamp nobody reads.
  // The charts only sample this often anyway, so the extra 4 renders bought
  // nothing but jank on a plant with real channel counts.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), SAMPLE_MS);
    return () => clearInterval(id);
  }, []);

  // Telemetry frames arrive coalesced per animation frame, which is right for a
  // live canvas and wrong for this: `buildDashboardMetrics` walks every
  // measurement, rack and gateway, so binding the dashboard to the frame rate
  // meant rebuilding the whole plant model up to 60 times a second on a busy
  // broker. The latest frames are read through a ref and the model is rebuilt
  // on the sample tick instead — same freshness the charts plot at, a fraction
  // of the work.
  const liveRef = useRef(live);
  liveRef.current = live;
  const nowMs = now.getTime();
  const metrics = useMemo(
    () => buildDashboardMetrics({ projects, folders, machines, devices, cards, live: liveRef.current, nowMs }),
    // `live` is deliberately absent: `nowMs` is the rebuild trigger.
    [cards, devices, folders, machines, nowMs, projects],
  );

  // Real mode has no historical aggregate endpoint, so the trend charts are fed
  // by sampling the derived metrics while the dashboard is open.
  const [healthSeries, setHealthSeries] = useState<number[]>([]);
  const [alarmSeries, setAlarmSeries] = useState<{ critical: number; warning: number; info: number; label: string }[]>([]);
  const [throughputSeries, setThroughputSeries] = useState<number[]>([]);
  const lastSampleRef = useRef(0);

  useEffect(() => {
    if (!metrics.live) return;
    if (nowMs - lastSampleRef.current < SAMPLE_MS) return;
    lastSampleRef.current = nowMs;
    setHealthSeries((series) => pushSample(series, metrics.healthScore));
    setThroughputSeries((series) => pushSample(series, metrics.packetRate));
    setAlarmSeries((series) => {
      const next = [
        ...series,
        {
          critical: metrics.criticalCount,
          warning: metrics.warningCount,
          info: metrics.infoCount,
          label: new Date(nowMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
      return next.length > 8 ? next.slice(next.length - 8) : next;
    });
  }, [metrics, nowMs]);

  // With real mode off the demo signals walk, so the charts show what they do
  // with moving data rather than standing still.
  const demoHealth = useDemoWalk(DEMO_HEALTH_TREND, !metrics.live, 48, 99);
  const demoThroughput = useDemoWalk(DEMO_THROUGHPUT, !metrics.live, 110, 350, 1900);

  // These stay the raw samples. The easing lives inside `TrendChart`, so an
  // animating chart repaints itself instead of dragging the map, the tables and
  // the rail through sixty re-renders a second with it.
  const healthTrend = metrics.live ? (healthSeries.length > 1 ? healthSeries : [metrics.healthScore, metrics.healthScore]) : demoHealth;
  const throughputTrend = metrics.live ? (throughputSeries.length > 1 ? throughputSeries : [metrics.packetRate, metrics.packetRate]) : demoThroughput;
  const alarmBars = metrics.live
    ? {
        labels: alarmSeries.map((sample) => sample.label),
        critical: alarmSeries.map((sample) => sample.critical),
        warning: alarmSeries.map((sample) => sample.warning),
        info: alarmSeries.map((sample) => sample.info),
      }
    : { labels: DEMO_ALARM_DAYS, ...DEMO_ALARM_BARS };

  // Time ticks across the plotted window, at the sample cadence.
  const trendTimeLabels = useMemo(() => {
    const count = 7;
    const spanMs = Math.max(1, healthTrend.length - 1) * SAMPLE_MS;
    return Array.from({ length: count }, (_, index) => {
      const at = new Date(nowMs - spanMs + (index / (count - 1)) * spanMs);
      return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });
  }, [healthTrend.length, nowMs]);

  // Open alarms as sparse readings on the right axis — the plant's equivalent of
  // a lab sample: taken at a point in time rather than streamed.
  const alarmEvents = useMemo(
    () =>
      alarmSeries.map((sample, index) => ({
        at: (index / Math.max(1, alarmSeries.length - 1)) * 0.74,
        value: sample.critical + sample.warning,
      })),
    [alarmSeries],
  );
  const alarmAxisMax = Math.max(4, ...alarmEvents.map((event) => event.value));

  const severitySegments = useMemo(
    () => [
      { label: 'Critical', value: metrics.criticalCount, color: palette.critical },
      { label: 'Warning', value: metrics.warningCount, color: palette.warning },
      { label: 'Info', value: metrics.infoCount, color: palette.neutral },
      { label: 'Acknowledged', value: metrics.ackCount, color: palette.inkFaint },
    ],
    [metrics.ackCount, metrics.criticalCount, metrics.infoCount, metrics.warningCount, palette],
  );
  const severityTotal = severitySegments.reduce((sum, segment) => sum + segment.value, 0);

  // The 3D components carry live status the same way the 2D tags did: an `auto`
  // component borrows the status of the telemetry area with a matching name, so
  // the placement stays fixed while the colours stay live.
  const plantComponentColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const component of plantConfig.scene3d.components) {
      const derived = metrics.areas.find((area) => area.name === component.name);
      const status = component.status === 'auto' ? derived?.status ?? 'healthy' : component.status;
      colors[component.id] = statusColor(palette, status);
    }
    return colors;
  }, [metrics.areas, palette, plantConfig.scene3d.components]);

  const healthValues = metrics.attention.map((row) => row.health);
  const gaps = healthValues.map((value) => value - HEALTH_TARGET);
  const onPlanCount = gaps.filter((gap) => gap >= -3).length;
  const worstAsset = metrics.attention[0];
  const bestAsset = metrics.attention[metrics.attention.length - 1];

  const headline = [
    {
      label: 'Overall health',
      value: String(metrics.healthScore),
      unit: '/100',
      progress: metrics.healthScore / 100,
      target: HEALTH_TARGET / 100,
      plan: `Plan ${HEALTH_TARGET} · △ ${metrics.healthScore - HEALTH_TARGET >= 0 ? '+' : ''}${metrics.healthScore - HEALTH_TARGET}`,
      tone: metrics.healthScore >= 85 ? palette.accent : metrics.healthScore >= 60 ? palette.warning : palette.critical,
    },
    {
      label: 'Machines online',
      value: String(metrics.machinesOnline),
      unit: `/${metrics.machinesTotal}`,
      progress: metrics.machinesTotal > 0 ? metrics.machinesOnline / metrics.machinesTotal : 0,
      target: 1,
      plan: `Plan ${metrics.machinesTotal} · △ -${metrics.machinesTotal - metrics.machinesOnline}`,
      tone: metrics.machinesOnline < metrics.machinesTotal ? palette.warning : palette.accent,
    },
    {
      label: 'Channels streaming',
      value: metrics.activeChannels.toLocaleString(),
      unit: `/${metrics.configuredChannels.toLocaleString()}`,
      progress: metrics.configuredChannels > 0 ? metrics.activeChannels / metrics.configuredChannels : 0,
      target: 1,
      plan: `Plan ${metrics.configuredChannels.toLocaleString()} · ${metrics.packetRate.toLocaleString()} pkt/s`,
      tone: metrics.activeChannels < metrics.configuredChannels ? palette.warning : palette.accent,
    },
    {
      label: 'Gateways connected',
      value: String(metrics.connectedGateways),
      unit: `/${metrics.totalGateways}`,
      progress: metrics.totalGateways > 0 ? metrics.connectedGateways / metrics.totalGateways : 0,
      target: 1,
      plan: `Plan ${metrics.totalGateways} · ${metrics.avgLatencyMs} ms latency`,
      tone: metrics.connectedGateways < metrics.totalGateways ? palette.critical : palette.accent,
    },
  ];

  const rowClass = cn('gap-3', isCompact ? 'flex-col' : 'flex-row');
  // A row that takes whatever height is left on the page. Stacked layouts fall
  // back to a fixed height because there is no "rest of the page" to share.
  const fillRow = (minHeight: number) => (isCompact ? { width: '100%' as const, height: minHeight } : { width: '100%' as const, flex: 1, minHeight });

  // Open, not boxed: the headline reads as the top of the page rather than as
  // one more crate sitting on it.
  const headlineBand = (
    <OpenSection label="Plant output" meta={metrics.live ? 'Live' : 'Demo plant'} divided>
      <View className={cn('flex-1 pb-3.5', isCompact ? 'flex-col gap-4' : 'flex-row items-center')}>
        {headline.map((entry, index) => (
          <View key={entry.label} className={cn(isCompact ? 'w-full' : 'min-w-0 flex-1 flex-row items-center')}>
            {!isCompact && index > 0 ? <Rule vertical /> : null}
            <Metric {...entry} />
          </View>
        ))}
      </View>
    </OpenSection>
  );

  const healthFactorBars = (
    <View>
      {metrics.healthFactors.map((factor, index) => (
        <ContributionRow
          key={factor.label}
          first={index === 0}
          label={factor.label}
          value={factor.value}
          tone={factor.value >= 75 ? palette.accent : factor.value >= 50 ? palette.warning : palette.critical}
        />
      ))}
    </View>
  );

  const renderSection = () => {
    switch (section) {
      // Headline and scorecard run together as one open surface; the map and
      // the action rail are separate objects, so those keep their frames.
      // Map first and wide, the scorecard beside it, transport underneath. The
      // action rail moved to History, where a log of what already happened
      // belongs.
      case 'operations':
        return (
          <View className="gap-3" style={{ flex: 1, minHeight: 0 }}>
            <View style={{ height: 124 }}>{headlineBand}</View>

            <View className={rowClass} style={fillRow(340)}>
              <View style={{ flex: isCompact ? undefined : 1.45, height: isCompact ? 320 : undefined }}>
                <PlantMap
                  scene={plantConfig.scene3d}
                  statusColors={plantComponentColors}
                  canEdit={canEditPlant}
                  onEdit={() => setPlantEditorOpen(true)}
                />
              </View>
              <View style={{ flex: isCompact ? undefined : 1.55, height: isCompact ? 340 : undefined }}>
                <AssetTable rows={metrics.attention} onOpenMachine={onOpenMachine} boxed={false} />
              </View>
            </View>

            <Rule />

            <View style={{ height: 84 }}>
              <OpenSection
                label="Transport"
                meta={metrics.streamHealthy ? `${metrics.packetRate.toLocaleString()} pkt/s · ${metrics.avgLatencyMs} ms` : 'Stream stale'}
              >
                <View className="flex-row flex-wrap content-start gap-x-6 gap-y-2">
                  {metrics.services.map((service) => (
                    <View key={service.name} className="flex-row items-center gap-2">
                      <Dot color={statusColor(palette, service.status)} size={5} />
                      <Text numberOfLines={1} className={cn('font-body text-[11.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{service.name}</Text>
                    </View>
                  ))}
                </View>
              </OpenSection>
            </View>
          </View>
        );

      case 'scorecard':
        return (
          <View className={rowClass} style={{ flex: 1, minHeight: 0 }}>
            {/* Left rail, open: the numbers that answer "are we on plan", with
                the factors that produced them directly underneath. */}
            <View style={{ flex: isCompact ? undefined : 1, minHeight: 560 }}>
              <OpenSection label="Plant scorecard" meta={`Target ${HEALTH_TARGET}`}>
                <View className="flex-1 justify-start">
                  <Text className={cn('font-body text-[12.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Assets on plan</Text>
                  <View className="mt-1 flex-row items-baseline gap-1.5">
                    <Text className="font-display text-[38px] leading-[42px]" style={{ color: palette.accent }}>
                      {onPlanCount}
                    </Text>
                    <Text className={cn('font-body text-[14px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                      / {metrics.attention.length}
                    </Text>
                  </View>

                  <View className="my-4">
                    <Rule />
                  </View>

                  <Text className={cn('font-body text-[12.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Average gap to target</Text>
                  <View className="mt-1 flex-row items-baseline gap-1.5">
                    <Text
                      className="font-display text-[38px] leading-[42px]"
                      style={{ color: mean(gaps) >= -3 ? palette.accent : mean(gaps) >= -12 ? palette.warning : palette.critical }}
                    >
                      {mean(gaps) >= 0 ? '+' : ''}{mean(gaps).toFixed(1)}
                    </Text>
                    <Text className={cn('font-body text-[14px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>pts</Text>
                  </View>

                  <View className="my-4">
                    <Rule />
                  </View>

                  <View className="flex-row">
                    <View className="flex-1 pr-3">
                      <Text numberOfLines={2} className={cn('font-body text-[11.5px] leading-[15px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                        Furthest off plan{'\n'}{worstAsset?.name ?? '—'}
                      </Text>
                      <Text className="mt-1.5 font-display text-[26px]" style={{ color: palette.critical }}>
                        {worstAsset ? worstAsset.health : '—'}
                      </Text>
                    </View>
                    <Rule vertical />
                    <View className="flex-1 pl-3">
                      <Text numberOfLines={2} className={cn('font-body text-[11.5px] leading-[15px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                        Best performing{'\n'}{bestAsset?.name ?? '—'}
                      </Text>
                      <Text className="mt-1.5 font-display text-[26px]" style={{ color: palette.accent }}>
                        {bestAsset ? bestAsset.health : '—'}
                      </Text>
                    </View>
                  </View>

                  <View className="my-4">
                    <Rule />
                  </View>

                  {/* The factors belong with the score they produce, not in a
                      separate panel two columns away. */}
                  <Text className={cn('mb-3 font-body text-[12.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    What the score is made of
                  </Text>
                  {healthFactorBars}
                </View>
              </OpenSection>
            </View>

            {/* Right: the distributions behind those numbers, each filling its
                own half of the column rather than sitting on empty space. */}
            <View className="gap-3" style={{ flex: isCompact ? undefined : 2.5 }}>
              <View className={rowClass} style={fillRow(282)}>
                <View style={{ flex: 1, height: isCompact ? 282 : undefined }}>
                  <Panel label="Asset health distribution">
                    <View className="flex-1">
                      <FillChart render={(h) => <Histogram values={healthValues} height={h} />} />
                      <SeriesTable
                        rows={[{ color: palette.accent, name: 'Asset health', mean: mean(healthValues).toFixed(1), spread: stddev(healthValues).toFixed(2) }]}
                      />
                    </View>
                  </Panel>
                </View>
                <View style={{ flex: 1, height: isCompact ? 282 : undefined }}>
                  <Panel label="Health score over period" action={<Legend items={[{ color: SERIES_A, label: 'Health score' }]} />}>
                    <View className="flex-1">
                      <FillChart
                        render={(h) => (
                          <TrendChart primary={healthTrend} height={h} leftBands={healthRail(palette)} timeLabels={trendTimeLabels} />
                        )}
                      />
                      <SeriesTable
                        rows={[{ color: SERIES_A, name: 'Health score', mean: mean(healthTrend).toFixed(1), spread: stddev(healthTrend).toFixed(2) }]}
                      />
                    </View>
                  </Panel>
                </View>
              </View>

              <View style={fillRow(282)}>
                <Panel label="Throughput over period" action={<Legend items={[{ color: SERIES_B, label: 'Packets / s' }]} />}>
                  <View className="flex-1">
                    <FillChart
                      render={(h) => <TrendChart primary={throughputTrend} height={h} primaryMax={Math.max(10, ...throughputTrend)} color={SERIES_B} timeLabels={trendTimeLabels} />}
                    />
                    <SeriesTable
                      rows={[{ color: SERIES_B, name: 'Packets / s', mean: mean(throughputTrend).toFixed(0), spread: stddev(throughputTrend).toFixed(2) }]}
                    />
                  </View>
                </Panel>
              </View>
            </View>
          </View>
        );

      // Trends gets the plant-wide chart to itself, at the size a trend chart
      // is actually read at.
      case 'trends':
        return (
          <View className="gap-3" style={{ flex: 1, minHeight: 0 }}>
            <View style={fillRow(400)}>
              <Panel
                label="Plant trend"
                meta={metrics.live ? 'Live session' : 'Demo plant'}
                action={<Legend items={[{ color: SERIES_A, label: 'Health score' }, { color: SERIES_B, label: 'Packets / s' }]} />}
              >
                <FillChart
                  render={(h) => (
                    <TrendChart
                      primary={healthTrend}
                      events={alarmEvents}
                      height={h}
                      leftBands={healthRail(palette)}
                      rightBands={alarmRail(palette)}
                      secondMax={alarmAxisMax}
                      timeLabels={trendTimeLabels}
                      project
                    />
                  )}
                />
              </Panel>
            </View>

            <View className={rowClass} style={{ width: '100%', height: 244 }}>
              <View style={{ flex: 1 }}>
                <OpenSection label="Health score" action={<Legend items={[{ color: SERIES_A, label: 'Health score' }]} />}>
                  <FillChart
                    render={(h) => (
                      <TrendChart primary={healthTrend} height={h} leftBands={healthRail(palette)} timeLabels={trendTimeLabels} />
                    )}
                  />
                </OpenSection>
              </View>
              <Rule vertical />
              <View style={{ flex: 1 }}>
                <OpenSection label="Throughput" action={<Legend items={[{ color: SERIES_B, label: 'Packets / s' }]} />}>
                  <FillChart
                    render={(h) => (
                      <TrendChart primary={throughputTrend} height={h} primaryMax={Math.max(10, ...throughputTrend)} color={SERIES_B} timeLabels={trendTimeLabels} project />
                    )}
                  />
                </OpenSection>
              </View>
            </View>
          </View>
        );

      case 'diagnostics':
        return (
          <View className="gap-3" style={{ flex: 1, minHeight: 0 }}>
            <View className={rowClass} style={{ width: '100%' }}>
              <View style={{ flex: isCompact ? undefined : 1.8, height: 356 }}>
                <Findings insights={metrics.insights} />
              </View>
              <View style={{ flex: isCompact ? undefined : 1, height: 356 }}>
                <Panel label="Alarm distribution" meta={`${severityTotal} total`}>
                  <View className="flex-1 flex-row items-center justify-around gap-3">
                    <DonutChart segments={severitySegments} total={severityTotal} size={136} />
                    <View className="gap-2.5">
                      {severitySegments.map((segment) => (
                        <View key={segment.label} className="flex-row items-center gap-2.5">
                          <Dot color={segment.color} size={6} />
                          <Text className={cn('w-[88px] font-body text-[11.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{segment.label}</Text>
                          <Text className={cn('font-mono text-[11.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                            {segment.value}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </Panel>
              </View>
            </View>

            <View style={fillRow(300)}>
              <AssetTable rows={metrics.attention} onOpenMachine={onOpenMachine} label="Evidence by asset" boxed={false} />
            </View>
          </View>
        );

      // Setup is a specification sheet, and a spec sheet is a set of rows. It
      // reads as one document divided by rules rather than as eight cards
      // competing for the same page.
      case 'setup':
        return (
          <View className="gap-3" style={{ flex: 1, minHeight: 0 }}>
            <View className={rowClass} style={fillRow(320)}>
              <View style={{ flex: isCompact ? undefined : 1.4, minHeight: 0 }}>
                <OpenSection
                  label="Plant map layout"
                  meta={`Scale ${plantConfig.scene3d.modelScale}% · ${plantConfig.scene3d.components.length} components`}
                  action={
                    canEditPlant ? (
                      <Pressable onPress={() => setPlantEditorOpen(true)} accessibilityRole="button" className="rounded-md px-2 py-1">
                        <Text className="font-body text-[10.5px] text-accent">Edit map</Text>
                      </Pressable>
                    ) : null
                  }
                >
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    {plantConfig.scene3d.components.map((component, index) => {
                      const edits = countPartEdits(component.parts);
                      const changed = edits.hidden + edits.colored + edits.resized;
                      return (
                        <View key={component.id}>
                          {index > 0 ? <Rule /> : null}
                          <View className="flex-row items-center gap-3 py-2.5">
                            <Dot color={plantComponentColors[component.id] ?? '#7A7E86'} size={5} />
                            <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body text-[12px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
                              {component.name}
                            </Text>
                            <Text className={cn('w-[86px] font-body text-[10.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                              {changed > 0 ? `${changed} part edits` : component.status}
                            </Text>
                            <Text className={cn('w-[96px] text-right font-mono text-[10.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                              {Math.round(component.x)} / {Math.round(component.z)} · {component.scale}%
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                    {!canEditPlant ? (
                      <Text className={cn('pt-3 font-body text-[10.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                        The map layout is shared. Only a super admin can change the 3D plant.
                      </Text>
                    ) : null}
                  </ScrollView>
                </OpenSection>
              </View>

              <Rule vertical />

              <View style={{ flex: isCompact ? undefined : 1, minHeight: 0 }}>
                <OpenSection label="Signal sources" meta={metrics.live ? 'Live pipeline' : 'Demo plant'}>
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    <SpecRow first label="Plant" value={metrics.plantName} />
                    <SpecRow label="Projects" value={String(projects.length)} />
                    <SpecRow
                      label="Areas"
                      value={String(folders.filter((folder) => folder.type === 'Area' || folder.type === 'Unit' || folder.type === 'System').length)}
                    />
                    <SpecRow label="Machines defined" value={String(machines.length)} />
                    <SpecRow label="Devices" value={String(devices.filter((device) => !device.archived).length)} />
                    <SpecRow label="I/O cards" value={String(cards.length)} />
                    <SpecRow
                      label="Gateways connected"
                      value={`${metrics.connectedGateways} / ${metrics.totalGateways}`}
                      tint={metrics.connectedGateways < metrics.totalGateways ? palette.critical : palette.accent}
                    />
                    <SpecRow
                      label="Transport"
                      value={metrics.streamHealthy ? 'MQTT · healthy' : 'MQTT · stale'}
                      tint={metrics.streamHealthy ? palette.accent : palette.warning}
                    />
                  </ScrollView>
                </OpenSection>
              </View>
            </View>

            <Rule />

            <View className={rowClass} style={fillRow(258)}>
              <View style={{ flex: isCompact ? undefined : 1.4, minHeight: 0 }}>
                <OpenSection label="Health model" meta={`Score ${metrics.healthScore}/100 · target ${HEALTH_TARGET}`}>
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    {metrics.healthFactors.map((factor, index) => (
                      <ContributionRow
                        key={factor.label}
                        first={index === 0}
                        label={`${factor.label}  ·  weight ${HEALTH_WEIGHTS[index] ?? '—'}`}
                        value={factor.value}
                        tone={factor.value >= 75 ? palette.accent : factor.value >= 50 ? palette.warning : palette.critical}
                      />
                    ))}
                    <SpecRow label="Sampling interval" value={`${SAMPLE_MS / 1000} s`} />
                  </ScrollView>
                </OpenSection>
              </View>

              <Rule vertical />

              <View style={{ flex: isCompact ? undefined : 1, minHeight: 0 }}>
                <OpenSection
                  label="System status"
                  meta={metrics.services.filter((service) => service.status !== 'healthy').length === 0 ? 'All nominal' : 'Degraded'}
                >
                  <View className="flex-row flex-wrap content-start gap-x-5 gap-y-2.5">
                    {metrics.services.map((service) => (
                      <View key={service.name} className="min-w-[128px] flex-row items-center gap-2">
                        <Dot color={statusColor(palette, service.status)} size={5} />
                        <Text numberOfLines={1} className={cn('font-body text-[11.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{service.name}</Text>
                      </View>
                    ))}
                  </View>
                </OpenSection>
              </View>
            </View>

            <Rule />

            <View className={rowClass} style={{ width: '100%' }}>
              <View style={{ flex: 1 }}>
                <OpenSection label="Access">
                  <SpecRow first label="Signed in as" value={currentUser?.name || currentUser?.username || 'Admin User'} />
                  <SpecRow label="Role" value={currentUser ? ROLE_LABEL[currentUser.role] : 'Administrator'} />
                  <SpecRow label="Edit plant map" value={canEditPlant ? 'Allowed' : 'Read only'} tint={canEditPlant ? palette.accent : palette.neutral} />
                </OpenSection>
              </View>

              <Rule vertical />

              <View style={{ flex: 1 }}>
                <OpenSection label="Browse">
                  <Pressable
                    onPress={onOpenDevices}
                    accessibilityRole="button"
                    className="flex-row items-center gap-2.5 py-2.5"
                  >
                    <MaterialCommunityIcons name="server-network" size={15} color={palette.accent} />
                    <Text className={cn('font-body text-[12px]', isDark ? 'text-ink' : 'text-ink-inverse')}>Open the devices table</Text>
                    <Text className="font-body text-[12px]" style={{ color: palette.accent }}>→</Text>
                  </Pressable>
                  <Rule />
                  <Text className={cn('pt-2.5 font-body text-[10.5px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    Gateways, racks, cards and channels, with their live IPs.
                  </Text>
                </OpenSection>
              </View>
            </View>
          </View>
        );

      case 'history':
        return (
          <View className="gap-3" style={{ flex: 1, minHeight: 0 }}>
            <View className={rowClass} style={{ width: '100%', height: 288 }}>
              <View style={{ flex: isCompact ? undefined : 1.7 }}>
                <OpenSection
                  label="Alarm trend"
                  meta={metrics.live ? 'Live session' : 'Last 7 days'}
                  action={
                    <Legend
                      items={[
                        { color: palette.critical, label: 'Critical' },
                        { color: palette.warning, label: 'Warning' },
                        { color: palette.neutral, label: 'Info' },
                      ]}
                    />
                  }
                >
                  <FillChart render={(h) => <StackedBars labels={alarmBars.labels} critical={alarmBars.critical} warning={alarmBars.warning} info={alarmBars.info} height={h} />} />
                </OpenSection>
              </View>
              <Rule vertical />
              <View style={{ flex: isCompact ? undefined : 1, minWidth: isCompact ? undefined : 300 }}>
                <ActionRail insights={metrics.insights} alarms={metrics.alarms} label="Action log" boxed={false} />
              </View>
            </View>

            <Rule />

            <View style={fillRow(300)}>
              <AlarmLog alarms={metrics.alarms} boxed={false} />
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <View className="flex-1" style={{ minHeight: 0, backgroundColor: palette.bg }}>
      <SectionTabs active={section} onChange={setSection} />

      <ScrollView
        className="flex-1"
        style={{ minHeight: 0 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, padding: 14 }}
      >
        {renderSection()}
      </ScrollView>

      <Sheet visible={plantEditorOpen} title="Edit plant map" onClose={() => setPlantEditorOpen(false)}>
        {plantEditorOpen ? (
          <PlantOverviewEditor
            initialConfig={plantConfig}
            componentColors={plantComponentColors}
            saving={plantSaving}
            error={plantError}
            onCancel={() => setPlantEditorOpen(false)}
            onSave={(config) => void savePlantConfig(config)}
          />
        ) : null}
      </Sheet>
    </View>
  );
}
