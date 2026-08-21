/**
 * TRENDS — every mapped channel on one time chart.
 *
 * The rebuild is mostly about answering one question the old screen did not:
 * *which line am I supposed to be reading?* Twelve equally-weighted strokes
 * over a five-line grid is a picture of a machine, not a reading of one, and a
 * legend of pills underneath tells you which colour is which without ever
 * telling you which one matters.
 *
 * So the screen has a subject. One series is focused at a time: it is drawn
 * thick with a filled area under it, the value axis is labelled in *its* real
 * engineering units, and its current reading, direction and session range are
 * stated above the plot. Everything else drops to a hairline — still there for
 * comparison, no longer competing for the eye. Pressing a row in the table
 * moves the subject; pressing the focused row again puts every series back on
 * equal footing.
 *
 * The chart itself speaks the same language as the analyzer's trend plot — a
 * ruled matrix, a value scale in the left gutter, corner brackets, a marked
 * latest sample — because two charts in one product that are drawn to different
 * conventions is two things for a reader to learn.
 *
 * The series are real. There is no historian behind this: each one plots the
 * samples its channel has actually reported, accumulated from live frames and
 * persisted per channel, so a series begins at the moment the channel first
 * reports and fills from there. A channel that has never reported draws nothing
 * at all — a flat line would read as a genuine measurement of zero.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, Text, View, type GestureResponderEvent } from 'react-native';
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

const CHART_HEIGHT = 288;
const PAD = { left: 54, right: 16, top: 18, bottom: 24 };
const GRID = { rows: 4, cols: 8 };
const HISTORY_POINTS = 40; // matches useLiveChannelHistory's rolling buffer length

type Pt = { x: number; y: number };

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

/**
 * What the table and the read-out need to know about a series.
 *
 * Scalars only, never the sample array. The history lives inside the series
 * component that subscribes to it, and lifting a fresh array to the parent on
 * every live frame would re-render the whole screen twelve times a second for
 * numbers that mostly have not changed. Five numbers can be compared cheaply,
 * so the parent only re-renders when one of them actually moves.
 */
type SeriesStats = { latest?: number; first?: number; min?: number; max?: number; mean?: number; count: number };

const EMPTY_STATS: SeriesStats = { count: 0 };

type Emphasis = 'focused' | 'dimmed' | 'even';

/** One overlaid line, plotting the real samples this channel has reported. */
function SeriesLine({
  meta,
  devices,
  machineId,
  visible,
  emphasis,
  chartWidth,
  gradientId,
  onStats,
}: {
  meta: SeriesMeta;
  devices: DeviceNode[];
  machineId: string;
  visible: boolean;
  emphasis: Emphasis;
  chartWidth: number;
  gradientId: string;
  onStats: (id: string, stats: SeriesStats) => void;
}) {
  const key = useMemo(
    () => liveMeasurementKeyForChannel(meta.channel, channelNumberFor(meta.channel), devices),
    [devices, meta.channel],
  );
  const history = useLiveChannelHistory(key, `ultron.trendhistory.${machineId}.${meta.id}`);

  const stats = useMemo<SeriesStats>(() => {
    if (history.length === 0) return EMPTY_STATS;
    return {
      latest: history[history.length - 1],
      first: history[0],
      min: Math.min(...history),
      max: Math.max(...history),
      mean: history.reduce((sum, value) => sum + value, 0) / history.length,
      count: history.length,
    };
  }, [history]);

  // Reported up in an effect, not during render, so the parent is never set
  // mid-render. `stats` only changes identity when the sample buffer does, and
  // the parent drops the update if every number in it is unchanged.
  useEffect(() => {
    onStats(meta.id, stats);
  }, [onStats, meta.id, stats]);

  const range = LIVE_RANGE_FOR_LETTER[meta.letter];
  const plotW = chartWidth - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const stepX = plotW / (HISTORY_POINTS - 1);
  const span = range.max - range.min || 1;
  const floor = PAD.top + plotH;

  // Right-align the most recent sample; shorter buffers grow in from the right.
  const points = history.map((value, index) => {
    const fromRight = history.length - 1 - index;
    return {
      x: PAD.left + plotW - fromRight * stepX,
      y: PAD.top + (1 - (value - range.min) / span) * plotH,
    };
  });

  if (!visible || points.length < 2) return null;

  const d = smoothPath(points);
  const last = points[points.length - 1];
  const focused = emphasis === 'focused';

  return (
    <>
      {focused ? (
        <Path d={`${d} L ${last.x} ${floor} L ${points[0].x} ${floor} Z`} fill={`url(#${gradientId})`} />
      ) : null}
      <Path
        d={d}
        fill="none"
        stroke={meta.colour}
        strokeWidth={focused ? 2.4 : emphasis === 'dimmed' ? 1.1 : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={emphasis === 'dimmed' ? 0.3 : 1}
      />
      {focused ? (
        <>
          <Line
            x1={last.x}
            y1={last.y}
            x2={last.x}
            y2={floor}
            stroke={meta.colour}
            strokeWidth={1}
            strokeDasharray="2 3"
            opacity={0.5}
          />
          <Circle cx={last.x} cy={last.y} r={7} fill={meta.colour} opacity={0.16} />
        </>
      ) : null}
      <Circle
        cx={last.x}
        cy={last.y}
        r={focused ? 3.4 : 2.6}
        fill={meta.colour}
        opacity={emphasis === 'dimmed' ? 0.35 : 1}
      />
    </>
  );
}

export type TrendViewProps = {
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  machineId: string;
  expectedPoints: number;
};

export function TrendView({ mappedChannels, devices, machineId, expectedPoints }: TrendViewProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ramp = isDark ? SERIES_RAMP_DARK : SERIES_RAMP_LIGHT;

  const [kindFilter, setKindFilter] = useState<'all' | LiveKindLetter>('all');
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, SeriesStats>>({});
  const [chartWidth, setChartWidth] = useState(0);

  const onStats = useCallback((id: string, next: SeriesStats) => {
    setStats((previous) => {
      const current = previous[id];
      if (
        current &&
        current.latest === next.latest &&
        current.first === next.first &&
        current.min === next.min &&
        current.max === next.max &&
        current.count === next.count
      ) {
        return previous;
      }
      return { ...previous, [id]: next };
    });
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

  const filtered = useMemo(
    () => (kindFilter === 'all' ? series : series.filter((entry) => entry.letter === kindFilter)),
    [series, kindFilter],
  );

  const focused = filtered.find((entry) => entry.id === focusedId && !hidden[entry.id]) ?? null;
  const focusedStats = focused ? (stats[focused.id] ?? EMPTY_STATS) : EMPTY_STATS;
  const shownCount = filtered.filter((entry) => !hidden[entry.id]).length;
  // Paint order: the subject last, so it sits over everything it is being
  // compared against.
  const ordered = useMemo(
    () => (focused ? [...filtered.filter((entry) => entry.id !== focused.id), focused] : filtered),
    [filtered, focused],
  );

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

  /**
   * The value scale.
   *
   * Every series is normalised to its own measurement band so a temperature and
   * a vibration line stay visually comparable. That leaves the axis with a
   * choice: real units for one series, or a normalised percentage for all of
   * them. Whenever there is a subject, the axis belongs to the subject — a
   * percentage axis is a scale nobody can act on — and the caption under the
   * plot says plainly that the other lines are on their own bands.
   */
  const axisBand = focused
    ? LIVE_RANGE_FOR_LETTER[focused.letter]
    : kindFilter === 'all'
      ? null
      : LIVE_RANGE_FOR_LETTER[kindFilter];
  const axisUnit = focused ? focused.unit : kindFilter === 'all' ? '%' : (filtered[0]?.unit ?? '');
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const plotW = Math.max(0, chartWidth - PAD.left - PAD.right);
  const floor = PAD.top + plotH;
  const gradientId = 'trendviewfill';

  const axisLabel = (fraction: number) => {
    if (!axisBand) return `${Math.round((1 - fraction) * 100)}`;
    const value = axisBand.min + (1 - fraction) * (axisBand.max - axisBand.min);
    return value.toFixed(axisBand.decimals);
  };

  const delta =
    focusedStats.latest !== undefined && focusedStats.first !== undefined
      ? focusedStats.latest - focusedStats.first
      : null;
  const decimals = focused ? LIVE_RANGE_FOR_LETTER[focused.letter].decimals : 1;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 12 }}>
      {/* What this screen is, and which measurements it is showing. */}
      <View className="flex-row flex-wrap items-end justify-between gap-x-4 gap-y-2.5">
        <View className="min-w-0 flex-1">
          <Text className="font-body-bold text-[15px] tracking-[-0.02em]" style={{ color: palette.ink }}>
            Live trends
          </Text>
          <Text className="mt-1 font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
            {expectedPoints > 0
              ? `${mappedChannels.length} of ${expectedPoints} expected points mapped · `
              : `${mappedChannels.length} point${mappedChannels.length === 1 ? '' : 's'} mapped · `}
            samples accumulate live; there is no historian behind this chart.
          </Text>
        </View>
        <FilterChips label="Filter by measurement kind" options={kindOptions} value={kindFilter} onChange={setKindFilter} />
      </View>

      {/* The plot, with its subject stated above it. */}
      <View
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: palette.line, backgroundColor: palette.panel }}
      >
        <View
          className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
          style={{ borderBottomWidth: 1, borderBottomColor: palette.line }}
        >
          {focused ? (
            <>
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
                  {focusedStats.latest === undefined ? '—' : focusedStats.latest.toFixed(decimals)}
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
                      over {focusedStats.count}
                    </Text>
                  </View>
                ) : null}

                <PressSurface
                  onPress={() => setFocusedId(null)}
                  accessibilityLabel="Show every series on equal footing"
                  className="rounded-full border px-2.5 py-1"
                  style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
                >
                  <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkMuted }}>
                    Show all
                  </Text>
                </PressSurface>
              </View>
            </>
          ) : (
            <View className="min-w-0 flex-1">
              <Text className="font-body-bold text-[13px]" style={{ color: palette.ink }}>
                {shownCount} series overlaid
              </Text>
              <Text className="mt-0.5 font-body text-[11px]" style={{ color: palette.inkMuted }}>
                Select one below to read it against a real unit scale.
              </Text>
            </View>
          )}
        </View>

        <View className="px-3 pb-1 pt-2">
          <View onLayout={onLayout} style={{ height: CHART_HEIGHT }}>
            {chartWidth > 0 ? (
              <Svg width={chartWidth} height={CHART_HEIGHT}>
                <Defs>
                  <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={focused?.colour ?? palette.accent} stopOpacity={isDark ? 0.32 : 0.2} />
                    <Stop offset="1" stopColor={focused?.colour ?? palette.accent} stopOpacity={0} />
                  </LinearGradient>
                </Defs>

                {/* The matrix: verticals are the sampling grid, horizontals the
                    value grid. Under everything, so no series is ever mistaken
                    for one of them. */}
                {Array.from({ length: GRID.cols + 1 }, (_, index) => {
                  const x = PAD.left + (index / GRID.cols) * plotW;
                  const edge = index === 0 || index === GRID.cols;
                  return (
                    <Line
                      key={`v${index}`}
                      x1={x}
                      y1={PAD.top}
                      x2={x}
                      y2={floor}
                      stroke={palette.line}
                      strokeWidth={1}
                      opacity={edge ? 0.95 : 0.5}
                    />
                  );
                })}
                {Array.from({ length: GRID.rows + 1 }, (_, index) => {
                  const y = PAD.top + (index / GRID.rows) * plotH;
                  const edge = index === 0 || index === GRID.rows;
                  return (
                    <Line
                      key={`h${index}`}
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
                })}

                {/* One list, with the subject moved to the end so it paints
                    over the dimmed lines. Reordering a keyed list moves the
                    element rather than replacing it, so the focused series
                    keeps the sample buffer it has been accumulating — pulling
                    it out into a second render slot would unmount it and
                    restart its history on every click. */}
                {ordered.map((meta) => (
                  <SeriesLine
                    key={meta.id}
                    meta={meta}
                    devices={devices}
                    machineId={machineId}
                    visible={!hidden[meta.id]}
                    emphasis={!focused ? 'even' : meta.id === focused.id ? 'focused' : 'dimmed'}
                    chartWidth={chartWidth}
                    gradientId={gradientId}
                    onStats={onStats}
                  />
                ))}

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
            ) : null}

            {/* Scale and time as real text: the console's mono face is loaded
                for the DOM, and naming it again inside the SVG would mean
                maintaining the same type in two systems. */}
            {chartWidth > 0 ? (
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
                {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
                  <Text
                    key={fraction}
                    className="absolute font-mono text-[8.5px]"
                    style={{
                      color: palette.inkFaint,
                      left: 0,
                      width: PAD.left - 8,
                      textAlign: 'right',
                      top: PAD.top + fraction * plotH - 5,
                      fontVariant: ['tabular-nums'],
                    }}
                    numberOfLines={1}
                  >
                    {axisLabel(fraction)}
                  </Text>
                ))}
                <Text
                  className="absolute font-mono text-[8px] uppercase tracking-[0.14em]"
                  style={{ color: palette.inkFaint, left: 0, width: PAD.left - 8, textAlign: 'right', top: 2 }}
                  numberOfLines={1}
                >
                  {axisUnit || 'value'}
                </Text>
                <Text
                  className="absolute font-mono text-[8.5px] uppercase tracking-[0.14em]"
                  style={{ color: palette.inkFaint, left: PAD.left, bottom: 4 }}
                >
                  {HISTORY_POINTS} samples
                </Text>
                <Text
                  className="absolute font-mono text-[8.5px] uppercase tracking-[0.14em]"
                  style={{ color: palette.inkFaint, right: PAD.right, bottom: 4 }}
                >
                  latest
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Where the subject currently sits inside everything this session has
            seen, plus the one caveat the axis needs. */}
        <View className="px-4 pb-3 pt-2" style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
          {focused && focusedStats.min !== undefined && focusedStats.max !== undefined && focusedStats.max > focusedStats.min ? (
            <>
              <RangeRail
                min={focusedStats.min}
                max={focusedStats.max}
                mean={focusedStats.mean ?? focusedStats.min}
                value={focusedStats.latest ?? null}
                colour={focused.colour}
              />
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="font-mono text-[8.5px]" style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
                  {focusedStats.min.toFixed(decimals)} {focused.unit}
                </Text>
                <Text className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                  session range
                </Text>
                <Text className="font-mono text-[8.5px]" style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
                  {focusedStats.max.toFixed(decimals)} {focused.unit}
                </Text>
              </View>
            </>
          ) : null}
          <Text className="mt-1.5 font-body text-[10px] leading-[14px]" style={{ color: palette.inkFaint }}>
            {focused
              ? `Axis in ${focused.unit || 'the channel band'} for ${focused.label}. Every other series is drawn against its own measurement band, so heights are comparable in shape but not in value.`
              : 'Axis normalised to each channel band, so heights are comparable in shape but not in value. Select a series to read it in real units.'}
          </Text>
        </View>
      </View>

      {/* The series table. Pressing a row makes it the subject; the eye keeps a
          noisy channel out of the picture without losing its place in the list. */}
      <View
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: palette.line, backgroundColor: palette.panel }}
      >
        <View className="flex-row items-center justify-between px-4 py-2.5" style={{ borderBottomWidth: 1, borderBottomColor: palette.line }}>
          <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
            Series
          </Text>
          <Text className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
            {shownCount} of {filtered.length} shown
          </Text>
        </View>

        {filtered.map((meta, index) => {
          const isHidden = Boolean(hidden[meta.id]);
          const isFocused = focused?.id === meta.id;
          const entry = stats[meta.id] ?? EMPTY_STATS;
          const entryDecimals = LIVE_RANGE_FOR_LETTER[meta.letter].decimals;

          return (
            <View key={meta.id} style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}>
              <PressSurface
                onPress={() => setFocusedId(isFocused ? null : meta.id)}
                selected={isFocused}
                accent={meta.colour}
                accessibilityLabel={`${meta.label}, ${meta.code}`}
                className="flex-row items-center gap-3 px-4 py-2.5"
                style={{
                  backgroundColor: isFocused ? alpha(meta.colour, 0.08) : palette.panel,
                  opacity: isHidden ? 0.45 : 1,
                }}
              >
                <View style={{ width: 14, height: 2.5, borderRadius: 2, backgroundColor: meta.colour }} />
                <Text className="font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: palette.inkFaint, width: 46 }}>
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
