/**
 * TRENDS — every mapped channel on one time chart.
 *
 * Why this is hand-drawn rather than a charting package
 * ----------------------------------------------------
 * The obvious move is to drop in Recharts, Chart.js, ECharts, Tremor or visx.
 * None of them can mount here: they render React DOM and reach for `document`,
 * and this screen also compiles to real native views for the Expo iOS/Android
 * targets. The React Native charting packages that do run on both — victory-native
 * (Skia + Reanimated), react-native-gifted-charts, react-native-graph — bring
 * their own visual language, their own colour props and their own type ramp,
 * which is exactly what the console kit exists to prevent: see the note at the
 * top of `components/ui/tokens.ts` on why shadcn/ui is not used either. A chart
 * that does not resolve its colours out of `lib/consoleTheme.ts` cannot stay in
 * step with the rest of the product, and a themed wrapper around a package that
 * fights you is more code than the plot itself.
 *
 * So the *techniques* are borrowed rather than the code, and they are the ones
 * the good financial and observability charts share:
 *
 *   - a nice-number value scale, so gridlines land on 2.0 and 3.0 rather than
 *     on 2.275 and 3.35 — a tick you cannot say out loud is a tick you cannot
 *     read a value off;
 *   - a crosshair that snaps to the nearest sample column and reads every
 *     visible series at that instant, which is the single feature that turns a
 *     picture of lines into an instrument you can interrogate;
 *   - a last-value flag pinned to the axis edge, so the current number is on
 *     the plot rather than only in a table below it;
 *   - a filled area under the subject, a live pulse on its newest sample, and a
 *     ruled matrix behind everything.
 *
 * The crosshair rides W3C pointer events, which `react-native-web` forwards to
 * the DOM node directly. On the native targets those only fire once the runtime
 * emits W3C pointer events, so the crosshair is a desktop affordance and the
 * plot degrades to a static chart on a phone — everything it would have told
 * you is also in the table below.
 *
 * Why the screen has a subject
 * ----------------------------
 * Twelve equally-weighted strokes over a grid is a picture of a machine, not a
 * reading of one. Exactly one series is the subject at any moment: it is drawn
 * thick with a filled area, the value axis is labelled in *its* real
 * engineering units, and its reading, direction and session range are stated
 * above and below the plot. Everything else drops to a hairline — still there
 * for comparison, no longer competing for the eye. Pressing a row in the table
 * moves the subject; there is no "all equal" mode to fall into, because that
 * mode was the confusion this screen started with.
 *
 * The series are real. There is no historian behind this: each one plots the
 * samples its channel has actually reported, accumulated from live frames and
 * persisted per channel, so a series begins at the moment the channel first
 * reports and fills from there. A channel that has never reported draws nothing
 * at all — a flat line would read as a genuine measurement of zero.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, Pressable, ScrollView, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { DeviceNode } from '../../../lib/devices';
import { channelNumberFor, liveMeasurementKeyForChannel, useLiveChannelHistory } from '../../../lib/liveChannelValue';
import type { ChannelRef } from '../../../lib/rack';
import { alpha, consolePalette } from '../../ui';
import { EmptyState, FilterChips, PressSurface, RangeRail } from './analyzer/AnalyzerParts';
import { LIVE_RANGE_FOR_LETTER, type LiveKindLetter } from './liveValue';
import type { MappedChannel } from './RackOccupancyView';

// Human labels for the V/T/S/P/C/X live-reading letter scheme (see liveValue.ts).
const KIND_LABEL: Record<LiveKindLetter, string> = {
  V: 'Vibration',
  T: 'Temperature',
  S: 'Speed',
  P: 'Pressure',
  C: 'Current',
  X: 'Other',
};

/**
 * Overlaid series have to stay tellable apart, but a twelve-hue rainbow fights
 * the console's black-grey-green palette and makes hue meaningless — you cannot
 * tell "red because it is series four" from "red because it is in alarm".
 *
 * So the ramp is built from lightness instead: the first series takes the
 * accent, the rest step down a neutral scale. Alarm colour is then free to mean
 * only one thing. Twelve steps stay distinguishable because consecutive series
 * are never adjacent in the ramp — and there are two ramps, because a stroke
 * that reads clearly on the dark console is invisible on the light one.
 */
const SERIES_RAMP_DARK = [
  '#3FBF6A', '#E8EAE7', '#8FF0A8', '#A1A3A0', '#2F7A48', '#C9CCC9',
  '#4FA36A', '#6B6D6B', '#B8F5C6', '#87897F', '#1F8A4C', '#F2F2F0',
];
const SERIES_RAMP_LIGHT = [
  '#1F8A4C', '#2B2E33', '#3FBF6A', '#6B6D6B', '#14603A', '#9A9DA3',
  '#4FA36A', '#4A4D52', '#7ACF97', '#B0B3B8', '#0F4A2C', '#1A1C20',
];

/**
 * Text that stays readable on a filled swatch.
 *
 * The value flag is painted in its series' own colour, and both ramps run from
 * near-black to near-white — so picking the label colour from the *theme* gets
 * it wrong for half the series in either mode. WCAG relative luminance decides
 * it per colour instead.
 */
function inkOn(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return '#FFFFFF';
  const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance =
    0.2126 * linear(parseInt(value.slice(0, 2), 16) / 255) +
    0.7152 * linear(parseInt(value.slice(2, 4), 16) / 255) +
    0.0722 * linear(parseInt(value.slice(4, 6), 16) / 255);
  return luminance > 0.4 ? '#0B0D10' : '#FFFFFF';
}

const CHART_HEIGHT = 300;
const PAD = { left: 54, right: 58, top: 18, bottom: 26 };
const GRID_COLS = 8;
const TICK_TARGET = 4;
const HISTORY_POINTS = 40; // matches useLiveChannelHistory's rolling buffer length
const TOOLTIP_WIDTH = 214;
const TOOLTIP_ROWS = 7;

type Pt = { x: number; y: number };

/**
 * A value scale a human can read off.
 *
 * The raw measurement bands are engineering numbers — vibration runs 1.2 to 5.5
 * — and slicing one into four equal parts puts gridlines at 2.275 and 3.35. The
 * standard fix, and the one every serious charting library implements: round
 * the step up to the nearest 1, 2 or 5 times a power of ten, then extend the
 * domain outwards to land on multiples of it. The plot loses a few pixels of
 * resolution and gains an axis you can read a value off without arithmetic.
 */
function niceScale(min: number, max: number, targetTicks = TICK_TARGET): { min: number; max: number; ticks: number[] } {
  const range = max - min || Math.abs(max) || 1;
  const rawStep = range / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = niceMin; value <= niceMax + step / 2; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return { min: niceMin, max: niceMax, ticks };
}

// Catmull-Rom spline (uniform, tension 0) expressed as cubic Béziers — turns the
// jagged straight-segment polyline into a smooth curve through every sample.
function smoothPath(points: Pt[]): string {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

type SeriesMeta = {
  id: string;
  letter: LiveKindLetter;
  colour: string;
  code: string;
  label: string;
  unit: string;
  channel: ChannelRef;
};

type SeriesData = {
  samples: number[];
  latest?: number;
  first?: number;
  min?: number;
  max?: number;
  mean?: number;
  count: number;
};

const EMPTY_DATA: SeriesData = { samples: [], count: 0 };

/**
 * A channel's live subscription, with nothing to show for itself.
 *
 * Each series needs its own `useLiveChannelHistory` call, and hooks cannot be
 * called in a loop from the parent — so there is one of these per series and it
 * renders nothing. All the drawing happens in the parent, because the crosshair
 * has to read *every* series at one instant and a component that owns its own
 * samples cannot be asked what it was reading four columns ago.
 */
function SeriesFeed({
  meta,
  devices,
  machineId,
  onData,
}: {
  meta: SeriesMeta;
  devices: DeviceNode[];
  machineId: string;
  onData: (id: string, data: SeriesData) => void;
}) {
  const key = useMemo(
    () => liveMeasurementKeyForChannel(meta.channel, channelNumberFor(meta.channel), devices),
    [devices, meta.channel],
  );
  const history = useLiveChannelHistory(key, `ultron.trendhistory.${machineId}.${meta.id}`);

  const data = useMemo<SeriesData>(() => {
    if (history.length === 0) return EMPTY_DATA;
    return {
      samples: history,
      latest: history[history.length - 1],
      first: history[0],
      min: Math.min(...history),
      max: Math.max(...history),
      mean: history.reduce((sum, value) => sum + value, 0) / history.length,
      count: history.length,
    };
  }, [history]);

  // Reported up in an effect, not during render, so the parent is never set
  // mid-render. `data` only changes identity when the sample buffer does.
  useEffect(() => {
    onData(meta.id, data);
  }, [onData, meta.id, data]);

  return null;
}

/**
 * The newest sample, breathing.
 *
 * A live chart that is indistinguishable from a screenshot is a chart you stop
 * trusting to be live. One slow ring, on the subject only — repeat it on twelve
 * series and it stops meaning "live" and starts meaning "busy".
 */
function LivePulse({ x, y, colour }: { x: number; y: number; colour: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - 18,
        top: y - 18,
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1.5,
        borderColor: colour,
        opacity: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.55, 0, 0] }),
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.28, 1] }) }],
      }}
    />
  );
}

export type TrendViewProps = {
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  machineId: string;
};

export function TrendView({ mappedChannels, devices, machineId }: TrendViewProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ramp = isDark ? SERIES_RAMP_DARK : SERIES_RAMP_LIGHT;

  const [kindFilter, setKindFilter] = useState<'all' | LiveKindLetter>('all');
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, SeriesData>>({});
  const [chartWidth, setChartWidth] = useState(0);
  /** Which sample column the crosshair is on, counted back from the newest. */
  const [cursorSlot, setCursorSlot] = useState<number | null>(null);

  const onData = useCallback((id: string, next: SeriesData) => {
    setData((previous) => (previous[id] === next ? previous : { ...previous, [id]: next }));
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setChartWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const series = useMemo<SeriesMeta[]>(
    () =>
      mappedChannels.map((mapped, index) => ({
        id: mapped.id,
        letter: mapped.channel.letter,
        colour: ramp[index % ramp.length],
        code: mapped.channel.code,
        label: mapped.label,
        unit: mapped.channel.unit,
        channel: mapped.channel,
      })),
    [mappedChannels, ramp],
  );

  // Only the measurement kinds actually present, each with how many series it
  // holds — the count is the reason to press the chip, so it lives on the chip.
  const kindOptions = useMemo(() => {
    const present: LiveKindLetter[] = [];
    for (const entry of series) if (!present.includes(entry.letter)) present.push(entry.letter);
    return [
      { value: 'all' as const, label: 'All', count: series.length },
      ...present.map((letter) => ({
        value: letter,
        label: KIND_LABEL[letter],
        count: series.filter((entry) => entry.letter === letter).length,
      })),
    ];
  }, [series]);

  /** One rounded value scale per measurement kind, shared by every series of it. */
  const scales = useMemo(() => {
    const map = {} as Record<LiveKindLetter, ReturnType<typeof niceScale>>;
    (Object.keys(LIVE_RANGE_FOR_LETTER) as LiveKindLetter[]).forEach((letter) => {
      const band = LIVE_RANGE_FOR_LETTER[letter];
      map[letter] = niceScale(band.min, band.max);
    });
    return map;
  }, []);

  const filtered = useMemo(
    () => (kindFilter === 'all' ? series : series.filter((entry) => entry.letter === kindFilter)),
    [series, kindFilter],
  );
  const visible = useMemo(() => filtered.filter((entry) => !hidden[entry.id]), [filtered, hidden]);

  /**
   * Exactly one subject, always.
   *
   * It falls back on its own when the chosen series is filtered out or hidden,
   * rather than leaving the header empty — and the default lands on the first
   * series that has actually reported something. Opening on a channel that has
   * never sent a sample would show a correct, fully-labelled, completely empty
   * plot, which reads as a broken screen rather than as a silent channel.
   */
  const focused =
    visible.find((entry) => entry.id === focusedId) ??
    visible.find((entry) => (data[entry.id]?.count ?? 0) > 1) ??
    visible[0] ??
    null;

  // Paint order: the subject last, so it sits over everything it is compared to.
  const ordered = useMemo(
    () => (focused ? [...visible.filter((entry) => entry.id !== focused.id), focused] : visible),
    [visible, focused],
  );

  // --- geometry --------------------------------------------------------------
  const plotW = Math.max(0, chartWidth - PAD.left - PAD.right);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const floor = PAD.top + plotH;
  const stepX = plotW / (HISTORY_POINTS - 1);
  const xForSlot = (slot: number) => PAD.left + plotW - slot * stepX;

  const pointsFor = useCallback(
    (meta: SeriesMeta): Pt[] => {
      const samples = (data[meta.id] ?? EMPTY_DATA).samples;
      const scale = scales[meta.letter];
      const span = scale.max - scale.min || 1;
      return samples.map((value, index) => ({
        x: xForSlot(samples.length - 1 - index),
        y: PAD.top + (1 - (value - scale.min) / span) * plotH,
      }));
    },
    // xForSlot and plotH are derived from chartWidth, which is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, scales, chartWidth],
  );

  const axisScale = focused ? scales[focused.letter] : null;
  const decimals = focused ? LIVE_RANGE_FOR_LETTER[focused.letter].decimals : 1;
  const focusedData = focused ? (data[focused.id] ?? EMPTY_DATA) : EMPTY_DATA;
  const focusedPoints = focused ? pointsFor(focused) : [];
  const focusedLast = focusedPoints.length > 0 ? focusedPoints[focusedPoints.length - 1] : null;
  // The flag rides the axis edge, so it is clamped into the plot even when the
  // reading itself is outside the channel's declared band. The *line* is never
  // clamped — a measurement off the top of the scale has to look off the scale.
  const flagY = focusedLast ? Math.min(floor - 10, Math.max(PAD.top + 10, focusedLast.y)) : 0;

  const delta =
    focusedData.latest !== undefined && focusedData.first !== undefined
      ? focusedData.latest - focusedData.first
      : null;

  // --- crosshair -------------------------------------------------------------
  const onPointerMove = useCallback(
    (event: { nativeEvent: unknown }) => {
      if (plotW <= 0) return;
      const native = event.nativeEvent as { offsetX?: number; locationX?: number };
      const x = native.offsetX ?? native.locationX;
      if (typeof x !== 'number') return;
      if (x < PAD.left - 8 || x > PAD.left + plotW + 8) {
        setCursorSlot(null);
        return;
      }
      const slot = Math.round((PAD.left + plotW - x) / stepX);
      setCursorSlot(Math.min(HISTORY_POINTS - 1, Math.max(0, slot)));
    },
    [plotW, stepX],
  );

  /**
   * Every visible series at the crosshair's instant.
   *
   * The buffers are all right-aligned on "now", so a column counted back from
   * the right edge is the same moment for every series regardless of how long
   * each has been reporting. A series that had not started yet at that column
   * is absent from the read-out rather than shown as a dash — it has no value
   * there, and inventing one is the thing this whole screen refuses to do.
   */
  const cursorRows = useMemo(() => {
    if (cursorSlot === null) return [];
    return ordered
      .map((meta) => {
        const entry = data[meta.id] ?? EMPTY_DATA;
        const value = entry.samples[entry.samples.length - 1 - cursorSlot];
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        const scale = scales[meta.letter];
        const span = scale.max - scale.min || 1;
        return {
          meta,
          value,
          y: PAD.top + (1 - (value - scale.min) / span) * plotH,
        };
      })
      .filter((row): row is { meta: SeriesMeta; value: number; y: number } => row !== null)
      .sort((a, b) => a.y - b.y);
  }, [cursorSlot, ordered, data, scales, plotH]);

  if (mappedChannels.length === 0) {
    return (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20 }}>
        <EmptyState
          icon="chart-line-variant"
          title="No mapped channels"
          detail="Trends plot saved rack mappings. Link a box to a channel in Design mode, then save the canvas configuration."
        />
      </ScrollView>
    );
  }

  const cursorX = cursorSlot === null ? 0 : xForSlot(cursorSlot);
  const tooltipLeft =
    cursorX + 14 + TOOLTIP_WIDTH > chartWidth ? Math.max(4, cursorX - 14 - TOOLTIP_WIDTH) : cursorX + 14;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 12 }}>
      {/* Every subscription in the screen, drawing nothing. */}
      {series.map((meta) => (
        <SeriesFeed key={meta.id} meta={meta} devices={devices} machineId={machineId} onData={onData} />
      ))}

      <View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <Text className="font-body-bold text-[15px] tracking-[-0.02em]" style={{ color: palette.ink }}>
          Live trends
        </Text>
        <FilterChips label="Filter by measurement kind" options={kindOptions} value={kindFilter} onChange={setKindFilter} />
      </View>

      <View
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: palette.line, backgroundColor: palette.panel }}
      >
        {/* The subject, read out. */}
        {focused ? (
          <View
            className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
            style={{ borderBottomWidth: 1, borderBottomColor: palette.line }}
          >
            <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
              <View style={{ width: 16, height: 2.5, borderRadius: 2, backgroundColor: focused.colour }} />
              <View className="min-w-0">
                <Text className="font-body-bold text-[13px]" style={{ color: palette.ink }} numberOfLines={1}>
                  {focused.label}
                </Text>
                <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                  {focused.code} · {KIND_LABEL[focused.letter]}
                </Text>
              </View>
            </View>

            <View className="flex-row flex-wrap items-center gap-2.5">
              <Text
                className="font-body text-[22px] leading-[26px] tracking-[-0.03em]"
                style={{ color: palette.ink, fontWeight: '300', fontVariant: ['tabular-nums'] }}
              >
                {focusedData.latest === undefined ? '—' : focusedData.latest.toFixed(decimals)}
                <Text className="font-mono text-[10px]" style={{ color: palette.inkMuted }}>
                  {' '}
                  {focused.unit}
                </Text>
              </Text>

              {delta !== null ? (
                <View
                  className="flex-row items-center gap-1.5 rounded-full border px-2 py-[3px]"
                  style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
                >
                  <MaterialCommunityIcons
                    name={delta > 0 ? 'arrow-top-right' : delta < 0 ? 'arrow-bottom-right' : 'arrow-right'}
                    size={11}
                    color={palette.inkMuted}
                  />
                  <Text className="font-mono text-[9.5px]" style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}>
                    {delta > 0 ? '+' : delta < 0 ? '−' : ''}
                    {Math.abs(delta).toFixed(decimals)}
                  </Text>
                  <Text className="font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: palette.inkFaint }}>
                    over {focusedData.count}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* The plot. The wrapper is the only pointer target on the stack — the
            SVG and the label overlay are both inert — so a pointer position is
            always in the wrapper's own coordinates and never in a child's. */}
        <View className="px-3 pb-1 pt-2">
          <View
            onLayout={onLayout}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setCursorSlot(null)}
            style={{ height: CHART_HEIGHT }}
          >
            {chartWidth > 0 && focused ? (
              <>
                <View pointerEvents="none">
                  <Svg width={chartWidth} height={CHART_HEIGHT}>
                    <Defs>
                      <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={focused.colour} stopOpacity={isDark ? 0.34 : 0.22} />
                        <Stop offset="1" stopColor={focused.colour} stopOpacity={0} />
                      </LinearGradient>
                    </Defs>

                    {/* The plot well: a hair darker than the card, so the chart
                        reads as a recessed instrument window rather than as a
                        drawing floating on the panel. */}
                    <Rect
                      x={PAD.left}
                      y={PAD.top}
                      width={plotW}
                      height={plotH}
                      rx={6}
                      fill="#000000"
                      fillOpacity={isDark ? 0.16 : 0.015}
                    />

                    {/* The matrix. Verticals are the sampling grid, horizontals
                        the value grid, and both sit under everything so no
                        series is ever mistaken for one of them. */}
                    {Array.from({ length: GRID_COLS + 1 }, (_, index) => {
                      const x = Math.round(PAD.left + (index / GRID_COLS) * plotW) + 0.5;
                      const edge = index === 0 || index === GRID_COLS;
                      return (
                        <Line
                          key={`v${index}`}
                          x1={x}
                          y1={PAD.top}
                          x2={x}
                          y2={floor}
                          stroke={palette.line}
                          strokeWidth={1}
                          opacity={edge ? 0.95 : 0.45}
                        />
                      );
                    })}
                    {axisScale
                      ? axisScale.ticks.map((tick, index) => {
                          const span = axisScale.max - axisScale.min || 1;
                          const y = Math.round(PAD.top + (1 - (tick - axisScale.min) / span) * plotH) + 0.5;
                          const edge = index === 0 || index === axisScale.ticks.length - 1;
                          return (
                            <Line
                              key={`h${tick}`}
                              x1={PAD.left}
                              y1={y}
                              x2={PAD.left + plotW}
                              y2={y}
                              stroke={palette.line}
                              strokeWidth={1}
                              strokeDasharray={edge ? undefined : '2 5'}
                              opacity={edge ? 0.95 : 0.7}
                            />
                          );
                        })
                      : null}

                    {/* The comparison set, then the subject over it. */}
                    {ordered.map((meta) => {
                      const points = pointsFor(meta);
                      if (points.length < 2) return null;
                      const isFocused = meta.id === focused.id;
                      const d = smoothPath(points);
                      const last = points[points.length - 1];
                      return (
                        <Fragment key={meta.id}>
                          {isFocused ? (
                            <Path d={`${d} L ${last.x} ${floor} L ${points[0].x} ${floor} Z`} fill="url(#trendFill)" />
                          ) : null}
                          <Path
                            d={d}
                            fill="none"
                            stroke={meta.colour}
                            strokeWidth={isFocused ? 2.4 : 1.1}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={isFocused ? 1 : 0.32}
                          />
                          <Circle
                            cx={last.x}
                            cy={last.y}
                            r={isFocused ? 3.4 : 2.2}
                            fill={meta.colour}
                            opacity={isFocused ? 1 : 0.4}
                          />
                        </Fragment>
                      );
                    })}

                    {/* The crosshair, and every series it is crossing. */}
                    {cursorSlot !== null ? (
                      <>
                        <Line
                          x1={cursorX}
                          y1={PAD.top}
                          x2={cursorX}
                          y2={floor}
                          stroke={palette.lineStrong}
                          strokeWidth={1}
                        />
                        {cursorRows.map((row) => (
                          <Circle
                            key={row.meta.id}
                            cx={cursorX}
                            cy={row.y}
                            r={row.meta.id === focused.id ? 4 : 3}
                            fill={palette.panel}
                            stroke={row.meta.colour}
                            strokeWidth={row.meta.id === focused.id ? 2.2 : 1.6}
                          />
                        ))}
                      </>
                    ) : null}

                    {/* Corner brackets. An instrument frames its window. */}
                    {[
                      [PAD.left, PAD.top],
                      [PAD.left + plotW - 10, PAD.top],
                      [PAD.left, floor - 1.4],
                      [PAD.left + plotW - 10, floor - 1.4],
                    ].map(([x, y], index) => (
                      <Rect key={`c${index}`} x={x} y={y} width={10} height={1.4} fill={palette.lineStrong} />
                    ))}
                  </Svg>
                </View>

                {/* Scale, time and the flags, as real text: the console's mono
                    face is loaded for the DOM, and naming it again inside the
                    SVG would mean maintaining the same type in two systems. */}
                <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
                  {axisScale
                    ? axisScale.ticks.map((tick) => {
                        const span = axisScale.max - axisScale.min || 1;
                        return (
                          <Text
                            key={tick}
                            className="absolute font-mono text-[9px]"
                            style={{
                              color: palette.inkFaint,
                              left: 0,
                              width: PAD.left - 10,
                              textAlign: 'right',
                              top: PAD.top + (1 - (tick - axisScale.min) / span) * plotH - 6,
                              fontVariant: ['tabular-nums'],
                            }}
                            numberOfLines={1}
                          >
                            {tick.toFixed(decimals)}
                          </Text>
                        );
                      })
                    : null}
                  <Text
                    className="absolute font-mono text-[8px] uppercase tracking-[0.14em]"
                    style={{ color: palette.inkFaint, left: 0, width: PAD.left - 10, textAlign: 'right', top: 2 }}
                    numberOfLines={1}
                  >
                    {focused.unit || 'value'}
                  </Text>

                  {/* Sample axis. There is no clock behind these buffers, so the
                      honest x label is how many samples ago, not a time. */}
                  {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
                    const slot = Math.round((1 - fraction) * (HISTORY_POINTS - 1));
                    return (
                      <Text
                        key={fraction}
                        className="absolute font-mono text-[8.5px] uppercase tracking-[0.12em]"
                        style={{
                          color: palette.inkFaint,
                          left: PAD.left + fraction * plotW - 20,
                          width: 40,
                          textAlign: 'center',
                          bottom: 5,
                        }}
                        numberOfLines={1}
                      >
                        {slot === 0 ? 'now' : `−${slot}`}
                      </Text>
                    );
                  })}

                  {/* The last-value flag, pinned to the axis edge at the height
                      the subject is currently reading. The number a reader wants
                      most should be on the plot, not only in a table below it. */}
                  {focusedLast && focusedData.latest !== undefined ? (
                    <>
                      <View
                        style={{
                          position: 'absolute',
                          left: PAD.left + plotW,
                          top: flagY - 0.5,
                          width: PAD.right - 6,
                          height: 1,
                          backgroundColor: alpha(focused.colour, 0.4),
                        }}
                      />
                      <View
                        className="absolute items-center justify-center rounded-md px-1.5 py-[3px]"
                        style={{
                          left: PAD.left + plotW + 6,
                          top: flagY - 10,
                          backgroundColor: focused.colour,
                        }}
                      >
                        <Text
                          className="font-mono text-[9.5px]"
                          style={{ color: inkOn(focused.colour), fontVariant: ['tabular-nums'] }}
                        >
                          {focusedData.latest.toFixed(decimals)}
                        </Text>
                      </View>
                      <LivePulse x={focusedLast.x} y={focusedLast.y} colour={focused.colour} />
                    </>
                  ) : null}

                  {/* The crosshair read-out. */}
                  {cursorSlot !== null && cursorRows.length > 0 ? (
                    <View
                      className="absolute overflow-hidden rounded-xl border"
                      style={{
                        left: tooltipLeft,
                        top: PAD.top + 6,
                        width: TOOLTIP_WIDTH,
                        borderColor: palette.lineStrong,
                        backgroundColor: palette.panel,
                        shadowColor: palette.shadow,
                        shadowOpacity: isDark ? 0.6 : 0.16,
                        shadowRadius: 18,
                        shadowOffset: { width: 0, height: 8 },
                      }}
                    >
                      <View
                        className="px-2.5 py-1.5"
                        style={{ backgroundColor: palette.panelRaised, borderBottomWidth: 1, borderBottomColor: palette.line }}
                      >
                        <Text className="font-mono text-[8.5px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
                          {cursorSlot === 0 ? 'latest sample' : `${cursorSlot} samples ago`}
                        </Text>
                      </View>
                      <View className="px-2.5 py-1.5" style={{ gap: 4 }}>
                        {cursorRows.slice(0, TOOLTIP_ROWS).map((row) => (
                          <View key={row.meta.id} className="flex-row items-center gap-2">
                            <View
                              style={{ width: 8, height: 2.5, borderRadius: 2, backgroundColor: row.meta.colour }}
                            />
                            <Text
                              numberOfLines={1}
                              className={
                                row.meta.id === focused.id
                                  ? 'min-w-0 flex-1 font-body-bold text-[10.5px]'
                                  : 'min-w-0 flex-1 font-body text-[10.5px]'
                              }
                              style={{ color: row.meta.id === focused.id ? palette.ink : palette.inkMuted }}
                            >
                              {row.meta.label}
                            </Text>
                            <Text
                              className="font-mono text-[10.5px]"
                              style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}
                            >
                              {row.value.toFixed(LIVE_RANGE_FOR_LETTER[row.meta.letter].decimals)}
                            </Text>
                            <Text className="font-mono text-[8px] uppercase" style={{ color: palette.inkFaint, width: 26 }}>
                              {row.meta.unit}
                            </Text>
                          </View>
                        ))}
                        {cursorRows.length > TOOLTIP_ROWS ? (
                          <Text className="font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: palette.inkFaint }}>
                            +{cursorRows.length - TOOLTIP_ROWS} more
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                </View>
              </>
            ) : (
              <View className="flex-1 items-center justify-center">
                <Text className="font-body text-[11.5px]" style={{ color: palette.inkFaint }}>
                  {visible.length === 0
                    ? 'Every series is hidden. Use the eye in the table below to bring one back.'
                    : 'Sizing the plot…'}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Where the subject currently sits inside everything this session has
            seen, and the one caveat the axis needs. */}
        {focused ? (
          <View className="px-4 pb-3 pt-2" style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
            {focusedData.min !== undefined && focusedData.max !== undefined && focusedData.max > focusedData.min ? (
              <>
                <RangeRail
                  min={focusedData.min}
                  max={focusedData.max}
                  mean={focusedData.mean ?? focusedData.min}
                  value={focusedData.latest ?? null}
                  colour={focused.colour}
                />
                <View className="mt-1 flex-row items-center justify-between">
                  <Text className="font-mono text-[8.5px]" style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
                    {focusedData.min.toFixed(decimals)}
                  </Text>
                  <Text className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                    session range · {focused.unit}
                  </Text>
                  <Text className="font-mono text-[8.5px]" style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
                    {focusedData.max.toFixed(decimals)}
                  </Text>
                </View>
              </>
            ) : null}
            <Text className="mt-1.5 font-body text-[10px]" style={{ color: palette.inkFaint }}>
              Axis in {focused.unit || 'the channel band'} · other series drawn against their own bands
            </Text>
          </View>
        ) : null}
      </View>

      {/* The series table. Pressing a row makes it the subject; the eye keeps a
          noisy channel out of the picture without losing its place in the list. */}
      <View
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: palette.line, backgroundColor: palette.panel }}
      >
        <View
          className="flex-row items-center justify-between px-4 py-2.5"
          style={{ borderBottomWidth: 1, borderBottomColor: palette.line }}
        >
          <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
            Series
          </Text>
          <Text className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
            {visible.length} of {filtered.length} shown
          </Text>
        </View>

        {filtered.map((meta, index) => {
          const isHidden = Boolean(hidden[meta.id]);
          const isFocused = focused?.id === meta.id;
          const entry = data[meta.id] ?? EMPTY_DATA;
          const entryDecimals = LIVE_RANGE_FOR_LETTER[meta.letter].decimals;

          return (
            <View key={meta.id} style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}>
              <PressSurface
                onPress={() => setFocusedId(meta.id)}
                selected={isFocused}
                accent={meta.colour}
                accessibilityLabel={`Read ${meta.label}, ${meta.code}, on the chart`}
                className="flex-row items-center gap-3 px-4 py-2.5"
                style={{
                  backgroundColor: isFocused ? alpha(meta.colour, 0.08) : palette.panel,
                  opacity: isHidden ? 0.45 : 1,
                }}
              >
                <View style={{ width: 14, height: 2.5, borderRadius: 2, backgroundColor: meta.colour }} />
                <Text
                  className="font-mono text-[9.5px] uppercase tracking-[0.12em]"
                  style={{ color: palette.inkFaint, width: 46 }}
                >
                  {meta.code}
                </Text>
                <Text
                  numberOfLines={1}
                  className="min-w-0 flex-1 font-body text-[12px]"
                  style={{ color: palette.ink, textDecorationLine: isHidden ? 'line-through' : 'none' }}
                >
                  {meta.label}
                </Text>
                <Text
                  className="font-mono text-[11.5px]"
                  style={{ color: entry.latest === undefined ? palette.inkFaint : palette.ink, fontVariant: ['tabular-nums'] }}
                >
                  {entry.latest === undefined ? '—' : `${entry.latest.toFixed(entryDecimals)} ${meta.unit}`}
                </Text>
                <Pressable
                  onPress={(event: GestureResponderEvent) => {
                    // The row underneath is a focus control; without this the
                    // eye would hide the series and focus it in one click.
                    event.stopPropagation?.();
                    setHidden((previous) => ({ ...previous, [meta.id]: !previous[meta.id] }));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={isHidden ? `Show ${meta.label} on the chart` : `Hide ${meta.label} from the chart`}
                  hitSlop={6}
                  className="h-6 w-6 items-center justify-center rounded-lg"
                >
                  <MaterialCommunityIcons
                    name={isHidden ? 'eye-off-outline' : 'eye-outline'}
                    size={14}
                    color={palette.inkFaint}
                  />
                </Pressable>
              </PressSurface>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
