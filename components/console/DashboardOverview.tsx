import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

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
import { buildPlantAnalytics, type PlantAssetStatus } from '../../lib/plantAnalytics';
import { countPartEdits, type PlantScene3DConfig } from '../../lib/plantScene3d';
import { chromeVisible, isImmersive, PLANT_TRANSITION_MS, type PlantViewMode } from '../../lib/plantViewState';
import { apiFetch } from '../../src/lib/apiClient';
import { ROLE_LABEL, type PublicUser } from '../../src/lib/roles';
import type { PlantCalloutFacts } from './plant3d/types';
import { FadeLayer } from './plant/FadeLayer';
import { PlantAnalyticsPanel, type PlantKpi } from './plant/PlantAnalyticsPanel';
import { PlantBottomAnalytics } from './plant/PlantBottomAnalytics';
import PlantExperience from './plant/PlantExperience';
import { PlantOverviewHeader } from './plant/PlantOverviewHeader';
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
 * One workspace: the plant as it is right now.
 *
 * There were six. See the note on `renderSection` for what went and why. The
 * type survives as a single member rather than being deleted outright because
 * the switch it drives is the seam a second workspace would come back through,
 * and a one-member union documents that better than a removed one.
 */
type Section = 'operations';

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
/** How often the dashboard resamples. Also the clock tick — see the note in the component. */
const SAMPLE_MS = 5_000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function severityColor(palette: ConsolePalette, severity: DashboardAlarm['severity']) {
  return severityToneColor(palette, severity);
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}


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
function TickBar({ value, max = 100, ticks = 20, tone }: { value: number; max?: number; ticks?: number; tone?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ratio = clamp(value / Math.max(1, max), 0, 1);
  const lit = Math.round(ratio * ticks);
  const color = tone ?? (ratio >= 0.66 ? palette.accent : ratio >= 0.33 ? palette.warning : palette.critical);
  return (
    <View className="flex-row items-center gap-[2.5px]">
      {Array.from({ length: ticks }, (_, index) => {
        const isLit = index < lit;
        return (
          <View
            key={index}
            style={{
              width: 3.5,
              height: 14,
              borderRadius: 2,
              backgroundColor: isLit ? color : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            }}
          />
        );
      })}
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
        <Text className={cn('w-[52px] text-right font-mono text-[12px] font-semibold', isDark ? 'text-ink' : 'text-ink-inverse')}>
          {value.toFixed(1)}
          {suffix}
        </Text>
        <TickBar value={value} max={max} tone={tone} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

type Point = { x: number; y: number };

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
  const nowRatio = project ? 0.74 : 1;
  const nowX = padL + plotW * nowRatio;

  const lo = primaryMin;
  const hi = Math.max(primaryMax, ...series);
  const yFor = (value: number) => padT + plotH - ((value - lo) / Math.max(1, hi - lo)) * plotH;
  const xFor = (index: number, count: number) => padL + (index / Math.max(1, count - 1)) * (plotW * nowRatio);

  const points = series.map((value, index) => ({ x: xFor(index, series.length), y: yFor(value) }));

  // Catmull-Rom cubic bezier spline path
  let pathD = '';
  if (points.length >= 3) {
    pathD = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
    for (let i = 0; i < points.length - 1; i += 1) {
      const p0 = points[i - 1] ?? points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      pathD += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
  } else {
    pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  const areaD = `${pathD} L${points[points.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${points[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

  // Projection logic
  let projectedD = '';
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
    const tailPts: { x: number; y: number }[] = [{ x: nowX, y: yFor(last) }];
    for (let i = 1; i <= 12; i += 1) {
      const value = clamp(last + slope * i * 0.55, lo, hi);
      tailPts.push({ x: nowX + i * step, y: yFor(value) });
    }
    projectedD = tailPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }

  const rightFor = (value: number) => padT + plotH - ((value - secondMin) / Math.max(1, secondMax - secondMin)) * plotH;
  const gridRatios = [0, 0.25, 0.5, 0.75, 1];
  const gradId = `trendGrad_${color.replace('#', '')}`;

  // Find Maxima & Minima points in measured series
  let maxIdx = 0;
  let minIdx = 0;
  series.forEach((val, i) => {
    if (val > series[maxIdx]) maxIdx = i;
    if (val < series[minIdx]) minIdx = i;
  });
  const maxPt = points[maxIdx];
  const minPt = points[minIdx];
  const maxVal = series[maxIdx];
  const minVal = series[minIdx];

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <Stop offset="100%" stopColor={color} stopOpacity={0.01} />
        </LinearGradient>
      </Defs>

      {/* Horizontal grid + left scale */}
      {gridRatios.map((ratio) => {
        const y = padT + plotH - ratio * plotH;
        return (
          <G key={`h-${ratio}`}>
            <Line x1={padL} x2={padL + plotW} y1={y} y2={y} stroke={palette.grid} strokeWidth={1} strokeDasharray="4 4" opacity={0.5} />
            <SvgText x={padL - 14} y={y + 3} fontSize={9} fill={palette.inkFaint} textAnchor="end">
              {Math.round(lo + ratio * (hi - lo))}
            </SvgText>
            <SvgText x={padL + plotW + 14} y={y + 3} fontSize={9} fill={palette.inkFaint}>
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
            <Line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke={palette.grid} strokeWidth={1} opacity={0.35} strokeDasharray="2 2" />
            <SvgText x={x} y={height - 8} fontSize={8.5} fill={palette.inkFaint} textAnchor="middle">
              {label}
            </SvgText>
          </G>
        );
      })}

      {/* Colour rails */}
      {leftBands?.map((band) => (
        <Rect
          key={`lb-${band.from}-${band.color}`}
          x={padL - 8}
          y={padT + plotH - band.to * plotH}
          width={4}
          height={Math.max(1, (band.to - band.from) * plotH)}
          fill={band.color}
          rx={1}
        />
      ))}
      {rightBands?.map((band) => (
        <Rect
          key={`rb-${band.from}-${band.color}`}
          x={padL + plotW + 4}
          y={padT + plotH - band.to * plotH}
          width={4}
          height={Math.max(1, (band.to - band.from) * plotH)}
          fill={band.color}
          rx={1}
        />
      ))}

      {/* Translucent Area Fill */}
      <Path d={areaD} fill={`url(#${gradId})`} />

      {/* Measured Spline */}
      <Path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Projected Line */}
      {projectedD ? (
        <Path d={projectedD} fill="none" stroke={SERIES_B} strokeWidth={1.6} strokeDasharray="3 3" opacity={0.8} />
      ) : null}

      {/* Maxima Callout Badge */}
      {maxPt && (
        <G key="max-callout">
          <Circle cx={maxPt.x} cy={maxPt.y} r={4.5} fill={color} />
          <Circle cx={maxPt.x} cy={maxPt.y} r={8} stroke={color} strokeWidth={1} fill="none" opacity={0.4} />
          <Rect x={maxPt.x - 24} y={maxPt.y - 20} width={48} height={16} rx={4} fill={color} opacity={0.92} />
          <SvgText x={maxPt.x} y={maxPt.y - 9} fontSize={8.5} fontWeight="700" fill="#FFFFFF" textAnchor="middle">
            MAX {maxVal?.toFixed(1)}
          </SvgText>
        </G>
      )}

      {/* Minima Callout Badge */}
      {minPt && maxIdx !== minIdx && (
        <G key="min-callout">
          <Circle cx={minPt.x} cy={minPt.y} r={4.5} fill={palette.critical} />
          <Circle cx={minPt.x} cy={minPt.y} r={8} stroke={palette.critical} strokeWidth={1} fill="none" opacity={0.4} />
          <Rect x={minPt.x - 24} y={minPt.y + 6} width={48} height={16} rx={4} fill={palette.critical} opacity={0.92} />
          <SvgText x={minPt.x} y={minPt.y + 17} fontSize={8.5} fontWeight="700" fill="#FFFFFF" textAnchor="middle">
            MIN {minVal?.toFixed(1)}
          </SvgText>
        </G>
      )}

      {/* NOW Reference Line */}
      {project ? (
        <G>
          <Line x1={nowX} y1={padT} x2={nowX} y2={padT + plotH} stroke={palette.accent} strokeWidth={1.5} opacity={0.7} />
          <Circle cx={nowX} cy={points[points.length - 1]?.y ?? padT} r={4} fill={palette.accent} />
        </G>
      ) : null}

      {/* Event markers */}
      {(events ?? []).map((event, index) => (
        <G key={`ev-${index}`}>
          <Circle
            cx={padL + event.at * plotW}
            cy={rightFor(event.value)}
            r={4}
            fill={event.pending ? palette.neutral : palette.ink}
            opacity={event.pending ? 0.55 : 1}
          />
          <Circle
            cx={padL + event.at * plotW}
            cy={rightFor(event.value)}
            r={7}
            stroke={event.pending ? palette.neutral : palette.ink}
            strokeWidth={1}
            fill="none"
            opacity={0.35}
          />
        </G>
      ))}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

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
  // Below this the analytics column would be taking width the plant needs, so
  // it drops out entirely — the plant never shrinks to make room for a panel.
  const isNarrow = width > 0 && width < 1280;
  const canEditPlant = currentUser?.role === 'super_admin';

  // --- digital twin view state ---------------------------------------------
  const [plantView, setPlantView] = useState<PlantViewMode>('overview');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `entering`/`exiting` are held for exactly as long as the animation runs, so
  // the state and what is on screen never disagree.
  const runTransition = useCallback((next: PlantViewMode, settled: PlantViewMode) => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setPlantView(next);
    transitionTimer.current = setTimeout(() => setPlantView(settled), PLANT_TRANSITION_MS);
  }, []);

  useEffect(
    () => () => {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    },
    [],
  );

  const enterPlant = useCallback(() => {
    if (plantView !== 'overview') return;
    runTransition('entering', 'immersive');
  }, [plantView, runTransition]);

  const exitPlant = useCallback(() => {
    if (plantView !== 'immersive') return;
    // Deselect first: the camera pulls back from the asset and out to the yard
    // as one move rather than snapping between two framings.
    setSelectedAssetId(null);
    runTransition('exiting', 'overview');
  }, [plantView, runTransition]);

  // Leaving Operations must not strand the console in a fullscreen canvas.
  useEffect(() => {
    if (section !== 'operations' && plantView !== 'overview') {
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
      setPlantView('overview');
      setSelectedAssetId(null);
    }
  }, [plantView, section]);

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

  // The 3D components carry live status the same way the 2D tags did, but the
  // component → telemetry-area binding now lives in `buildPlantAnalytics`
  // (exact name, then word overlap, then leftovers) so a freshly seeded plant
  // reports six distinct real areas instead of six copies of one.
  //
  // Only an *explicit* status is passed in. `auto` is resolved from the bound
  // area inside the model, which is the one place that binding is known.
  const plantStatusOverrides = useMemo(() => {
    const out: Record<string, PlantAssetStatus> = {};
    for (const component of plantConfig.scene3d.components) {
      if (component.status !== 'auto') out[component.id] = component.status;
    }
    return out;
  }, [plantConfig.scene3d.components]);

  const analytics = useMemo(
    () =>
      buildPlantAnalytics({
        metrics,
        components: plantConfig.scene3d.components,
        statuses: plantStatusOverrides,
        nowMs,
      }),
    [metrics, nowMs, plantConfig.scene3d.components, plantStatusOverrides],
  );

  const plantComponentColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const asset of analytics.assets) colors[asset.id] = statusColor(palette, asset.status);
    return colors;
  }, [analytics.assets, palette]);

  const plantCallouts = useMemo(() => {
    const facts: Record<string, PlantCalloutFacts> = {};
    for (const asset of analytics.assets) {
      facts[asset.id] = {
        status: asset.status,
        health: asset.health,
        machines: asset.machines,
        machinesActive: asset.machinesActive,
        alarms: asset.alarms,
        telemetry: asset.telemetry,
        power: asset.powerKw,
        temperature: asset.temperatureC,
      };
    }
    return facts;
  }, [analytics.assets]);

  const healthValues = metrics.attention.map((row) => row.health);
  const gaps = healthValues.map((value) => value - HEALTH_TARGET);
  const onPlanCount = gaps.filter((gap) => gap >= -3).length;
  const worstAsset = metrics.attention[0];
  const bestAsset = metrics.attention[metrics.attention.length - 1];

  // One source for the four headline measures. `plan` is the combined string
  // the open `Metric` reads on the other sections; `planShort` + `detail` are
  // the same facts split into the two footer columns the KPI cards use.
  const headline = [
    {
      id: 'health',
      label: 'Overall health',
      value: String(metrics.healthScore),
      unit: '/100',
      progress: metrics.healthScore / 100,
      target: HEALTH_TARGET / 100,
      plan: `Plan ${HEALTH_TARGET} · △ ${metrics.healthScore - HEALTH_TARGET >= 0 ? '+' : ''}${metrics.healthScore - HEALTH_TARGET}`,
      planShort: `Plan ${HEALTH_TARGET}`,
      detail: `${metrics.healthScore - HEALTH_TARGET >= 0 ? '+' : ''}${metrics.healthScore - HEALTH_TARGET}`,
      detailIsDeviation: true,
      tone: metrics.healthScore >= 85 ? palette.accent : metrics.healthScore >= 60 ? palette.warning : palette.critical,
    },
    {
      id: 'machines',
      label: 'Machines online',
      value: String(metrics.machinesOnline),
      unit: `/${metrics.machinesTotal}`,
      progress: metrics.machinesTotal > 0 ? metrics.machinesOnline / metrics.machinesTotal : 0,
      target: 1,
      plan: `Plan ${metrics.machinesTotal} · △ -${metrics.machinesTotal - metrics.machinesOnline}`,
      planShort: `Plan ${metrics.machinesTotal}`,
      detail: `-${metrics.machinesTotal - metrics.machinesOnline}`,
      detailIsDeviation: true,
      tone: metrics.machinesOnline < metrics.machinesTotal ? palette.warning : palette.accent,
    },
    {
      id: 'channels',
      label: 'Channels streaming',
      value: metrics.activeChannels.toLocaleString(),
      unit: `/${metrics.configuredChannels.toLocaleString()}`,
      progress: metrics.configuredChannels > 0 ? metrics.activeChannels / metrics.configuredChannels : 0,
      target: 1,
      plan: `Plan ${metrics.configuredChannels.toLocaleString()} · ${metrics.packetRate.toLocaleString()} pkt/s`,
      planShort: `Plan ${metrics.configuredChannels.toLocaleString()}`,
      // Throughput, not a gap to plan — so it is never painted as a deviation.
      detail: `${metrics.packetRate.toLocaleString()} pkt/s`,
      detailIsDeviation: false,
      tone: metrics.activeChannels < metrics.configuredChannels ? palette.warning : palette.accent,
    },
    {
      id: 'gateways',
      label: 'Gateways connected',
      value: String(metrics.connectedGateways),
      unit: `/${metrics.totalGateways}`,
      progress: metrics.totalGateways > 0 ? metrics.connectedGateways / metrics.totalGateways : 0,
      target: 1,
      plan: `Plan ${metrics.totalGateways} · ${metrics.avgLatencyMs} ms latency`,
      planShort: `Plan ${metrics.totalGateways}`,
      detail: `${metrics.avgLatencyMs} ms latency`,
      detailIsDeviation: false,
      tone: metrics.connectedGateways < metrics.totalGateways ? palette.critical : palette.accent,
    },
  ];

  // The KPI strip carries the reading and one short caption — the state, the
  // rate or the latency. The gap-to-plan lives on the meter as a marker, which
  // says the same thing without a second row of numbers.
  const kpiCaptions: Record<string, string> = {
    health: metrics.healthLabel,
    machines: `${metrics.machinesOnline} active`,
    channels: `${metrics.packetRate.toLocaleString('en-US')} pkt/s`,
    gateways: `${metrics.avgLatencyMs} ms`,
  };

  const plantKpis: PlantKpi[] = headline.map((entry) => ({
    id: entry.id,
    label: entry.label,
    value: entry.value,
    unit: entry.unit,
    progress: entry.progress,
    target: entry.target,
    caption: kpiCaptions[entry.id] ?? entry.planShort,
    tone: entry.tone,
  }));

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

  /**
   * The plant overview, and only the plant overview.
   *
   * This used to be six workspaces behind an icon rail: Operations, Scorecard,
   * Diagnostics, Setup, Trends and History. Five of them are gone. Scorecard,
   * Trends and History were plant-wide summaries of numbers the machine screens
   * already own per machine, and a plant-level average of a per-machine reading
   * is a number nobody can act on. Diagnostics held Findings, which is the one
   * thing on any of those pages a reader wanted — it now sits in the analytics
   * column beside the plant it is about. Setup was configuration, which belongs
   * with the thing being configured.
   *
   * With one workspace left there is nothing for a switcher to switch, so the
   * rail went too, and the map got the 52px back.
   */
  const renderSection = () => {
    switch (section) {
      // Headline and scorecard run together as one open surface; the map and
      // the action rail are separate objects, so those keep their frames.
      // Map first and wide, the scorecard beside it, transport underneath. The
      // action rail moved to History, where a log of what already happened
      // belongs.
      // The 3D world is the ground of this page, not a component on it: the
      // canvas spans the whole content area and every panel floats over it.
      // That is the difference between "a dashboard with a Three.js widget" and
      // a digital twin you are looking into, and it is why the map is never
      // boxed.
      //
      // What changed is the budget, not the arrangement. The floating panels
      // used to be sized by how little of the yard they could get away with
      // covering, which is how this page ended up carrying 8px labels nobody
      // could read from a metre back. They are now sized by their own contents
      // first — a wider column, a taller strip, type at a readable scale — and
      // the yard takes what is left. That costs the plant roughly a fifth of its
      // unobstructed area and buys back every number on the page.
      //
      // The scene itself is untouched: the canvas still fills the region, so
      // aspect ratio, camera, zoom, pan, selection and hover are exactly what
      // they were. Only `chromeInsets` is new, and it exists so the label solver
      // knows which parts of the canvas the panels are sitting on and keeps
      // every callout inside the yard the operator can actually see.
      case 'operations': {
        const showChrome = chromeVisible(plantView);
        // Wide enough for a 12px label beside a 20px reading without wrapping.
        // The old 258/292 column could carry neither.
        const railWidth = width >= 1600 ? 372 : width >= 1400 ? 340 : 312;
        // Tall enough for a headline, a delta and a plot with a real axis. The
        // old 134px strip left about 60px of plot under its header. Held back on
        // a narrow viewport, where there is no rail to give the height back to.
        const stripHeight = isNarrow ? 184 : width >= 1600 ? 232 : 212;
        // The gutter the floating panels sit in, and the header band above them.
        const pad = 12;
        const headerBand = 44;
        // Which parts of the canvas are underneath a panel. The label solver
        // treats these as off-limits, so a callout can never end up behind the
        // analytics column or under the chart strip — the specific failure that
        // made asset cards look like they were being swallowed by the page.
        const mapInsets = {
          top: headerBand,
          right: isNarrow ? pad : railWidth + pad * 2,
          bottom: stripHeight + pad * 2,
          left: pad,
        };

        return (
          <View style={{ flex: 1, minHeight: 0 }}>
            {/* Layer 1-5: the world. Fills the region; the overlays sit on top. */}
            <PlantExperience
              mode={plantView}
              onEnter={enterPlant}
              onExit={exitPlant}
              scene={plantConfig.scene3d}
              statusColors={plantComponentColors}
              callouts={plantCallouts}
              palette={palette}
              isDark={isDark}
              plantName={metrics.plantName}
              live={metrics.live}
              assets={analytics.assets}
              selectedId={selectedAssetId}
              onSelect={setSelectedAssetId}
              canEdit={canEditPlant}
              onEdit={() => setPlantEditorOpen(true)}
              chromeInsets={mapInsets}
            />

            {/* Layer 6: dashboard overlays. `box-none` so only the panels
                themselves take the pointer — dragging the gaps still orbits
                the plant underneath. */}
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 5, padding: pad }}
            >
              {/* Inset by the analytics column: the header's actions sit at the
                  right edge and were landing underneath it. */}
              <FadeLayer visible={showChrome} translateY={-6} style={{ marginRight: isNarrow ? 0 : railWidth + 10 }}>
                <PlantOverviewHeader
                  title="Plant map"
                  live={metrics.live}
                  facts={[
                    `${plantConfig.scene3d.components.length} components`,
                    `${metrics.machinesOnline}/${metrics.machinesTotal} machines online`,
                  ]}
                  palette={palette}
                  canEdit={canEditPlant}
                  onEdit={() => setPlantEditorOpen(true)}
                  onEnter={enterPlant}
                />
              </FadeLayer>

              {/* Everything between the header and the charts is the plant. The
                  four headline measures live in the analytics column, which is
                  what keeps this band clear. */}
              <View style={{ flex: 1, minHeight: 0 }} pointerEvents="none" />

              <FadeLayer
                visible={showChrome}
                translateY={16}
                style={{ height: stripHeight, flexDirection: 'row', marginRight: isNarrow ? 0 : railWidth + 10 }}
              >
                <PlantBottomAnalytics
                  analytics={analytics}
                  alarmBars={alarmBars}
                  palette={palette}
                  isDark={isDark}
                  stacked={false}
                />
              </FadeLayer>
            </View>

            {/* Right analytics column, floating full-height over the world. */}
            {isNarrow ? null : (
              <FadeLayer
                visible={showChrome}
                translateX={16}
                style={{
                  position: 'absolute',
                  top: pad,
                  right: pad,
                  bottom: pad,
                  width: railWidth,
                  zIndex: 6,
                  flexDirection: 'row',
                }}
              >
                <PlantAnalyticsPanel
                  analytics={analytics}
                  kpis={plantKpis}
                  insights={metrics.insights}
                  palette={palette}
                  isDark={isDark}
                />
              </FadeLayer>
            )}
          </View>
        );
      }

      default:
        return null;
    }
  };

  return (
    <View
      className="flex-1 flex-row"
      style={{
        minHeight: 0,
        backgroundColor: palette.bg,
        zIndex: isImmersive(plantView) ? 60 : 0,
      }}
    >
      {/* One workspace, full bleed. No icon rail: it had one destination left. */}
      <View className="flex-1" style={{ minHeight: 0 }}>
        {renderSection()}
      </View>

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
