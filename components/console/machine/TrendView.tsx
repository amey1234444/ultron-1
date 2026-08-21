/**
 * TRENDS — one signal at true scale, against its own references.
 *
 * This is a port of the T36 Trend Focus panel: same card anatomy, same reading
 * order, same chart furniture. What changed in the port is where the numbers on
 * it come from, and that is worth stating precisely, because the difference
 * between the reference design and this screen is entirely a difference in what
 * this machine actually has configured.
 *
 * Ported as specified
 * -------------------
 *   card head        swatch, name, tag pill, verdict pill, subline, the reading
 *                    at display size with its unit, a direction tag and a
 *                    deviation tag
 *   stats bar        now / mean / min / max / range / std dev / samples, with
 *                    "now" carrying the series colour
 *   plot grid        a value gutter, the plot, and a flag column — one grid
 *                    shared by the plot row, the tick row and the brush row, so
 *                    all three stay in column
 *   plot             tinted reference band, dashed reference lines with edge
 *                    labels, event verticals with chips, gradient area, smooth
 *                    line, hollow labelled min and max dots, latest-sample
 *                    marker, right-edge value flag
 *   crosshair        snapped vertical, marker, a value bubble in the gutter and
 *                    a tooltip carrying value, deviation and band state; the
 *                    header label flips to "at cursor" so a scrubbed value is
 *                    never mistaken for live
 *   session strip    the whole session as an area, with the selected window
 *                    bracketed at the right
 *   legend           one key per drawn element, and the axis note
 *   maths            niceDomain / niceStep and the Catmull-Rom → cubic Bézier
 *                    smoothPath, lifted verbatim
 *
 * Changed, and why
 * ----------------
 *   setpoint         A channel has no setpoint in this system. Rather than draw
 *                    a green dashed line at an invented number, the slot is
 *                    filled by what a channel *does* carry: its configured
 *                    alarm limits. The deviation tag reports headroom to the
 *                    nearest one, and disappears entirely on a channel with no
 *                    limits configured rather than reporting a deviation from
 *                    nothing.
 *   band             `bandLow`/`bandHigh` become the measurement kind's
 *                    registered operating band from `liveValue.ts` — the band
 *                    this whole console already normalises against. It is
 *                    labelled as the expected band, not as an acceptance spec,
 *                    because that is what it is.
 *   boundary         The design has one; a channel here can have two, a warning
 *                    and an alarm. Both are drawn when set, each in its own
 *                    meaning's colour, and the verdict pill reads the higher one
 *                    that is crossed.
 *   events           There is no event stream behind this screen, so the three
 *                    demo events are replaced by the ones the samples
 *                    themselves prove: the moments the series crossed a
 *                    configured limit, up or down. A recipe change is not
 *                    something this screen can know about, so it is not shown.
 *   window           The design's 15m / 1h / 8h / 24h assume timestamps. These
 *                    buffers are sample counts with no clock behind them, so
 *                    the windows are counted in samples and the axis is
 *                    labelled in samples back from the newest. Inventing
 *                    minutes from a sample index would be a fabricated time
 *                    axis.
 *   theme            The `--tf-*` tokens resolve to `lib/consoleTheme.ts`
 *                    instead, and the series colour comes from the console's
 *                    lightness ramp, so the panel is theme-aware in both
 *                    directions. The README's own theming section is explicit
 *                    that the series colour is a per-instance token; this is
 *                    that, wired to the app's palette.
 *
 * The design is single-series and says so on the chart. That is kept: the table
 * below is the picker, not a legend, and nothing is overlaid at a false scale.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { DeviceNode } from '../../../lib/devices';
import {
  HISTORY_LENGTH,
  channelNumberFor,
  liveMeasurementKeyForChannel,
  useLiveChannelHistory,
} from '../../../lib/liveChannelValue';
import type { ChannelRef } from '../../../lib/rack';
import { alpha, consolePalette, type ConsolePalette } from '../../ui';
import { EmptyState, FilterChips, PressSurface } from './analyzer/AnalyzerParts';
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
 * The series colour, per instance.
 *
 * The reference panel sets one `--tf-series` token and lets the line, area,
 * flag, marker and brush all follow it. This is the same idea with the console's
 * own ramp behind it: a lightness scale rather than a hue wheel, so status
 * colour stays free to mean only status. Two ramps, because a stroke that reads
 * on the dark console is invisible on the light one.
 */
const SERIES_RAMP_DARK = [
  '#3FBF6A', '#E8EAE7', '#8FF0A8', '#A1A3A0', '#2F7A48', '#C9CCC9',
  '#4FA36A', '#6B6D6B', '#B8F5C6', '#87897F', '#1F8A4C', '#F2F2F0',
];
const SERIES_RAMP_LIGHT = [
  '#1F8A4C', '#2B2E33', '#3FBF6A', '#6B6D6B', '#14603A', '#9A9DA3',
  '#4FA36A', '#4A4D52', '#7ACF97', '#B0B3B8', '#0F4A2C', '#1A1C20',
];

/** Text that stays readable on a filled swatch, whichever end of the ramp it came from. */
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

// --- Geometry ---------------------------------------------------------------
// The design's three-column grid, shared by the plot row, the tick row and the
// brush row so a column never drifts between them.
const Y_COL = 62;
const FLAG_COL = 96;
const PLOT_H = 300;
const TOP = 14;
const BOT = PLOT_H - 14;
const BRUSH_H = 30;
const Y_TICKS = 6;
const X_TICKS = 6;
const MAX_EVENTS = 4;

type Pt = [number, number];

/* ── scale helpers, lifted from the reference panel ───────────────────────── */

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
}

/** Rounded, evenly spaced ticks that always contain the data AND the references. */
function niceDomain(low: number, high: number, count: number): { lo: number; hi: number; step: number } {
  let lo = low;
  let hi = high;
  if (!(hi > lo)) {
    const centre = (lo + hi) / 2 || 0;
    lo = centre - 1;
    hi = centre + 1;
  }
  const step = niceStep((hi - lo) / Math.max(1, count - 1));
  const domainLo = Math.floor(lo / step) * step;
  let domainHi = Math.ceil(hi / step) * step;
  while ((domainHi - domainLo) / step < count - 1) domainHi += step;
  return { lo: domainLo, hi: domainHi, step };
}

function smoothPath(points: Pt[]): string {
  if (points.length === 0) return '';
  let d = `M ${points[0][0].toFixed(2)} ${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    d +=
      ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(2)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(2)}` +
      ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(2)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(2)}` +
      ` ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/** Samples back from the newest. There is no clock behind these buffers. */
function samplesBack(count: number): string {
  return count < 1 ? 'latest' : `−${Math.round(count)}`;
}

// --- Types ------------------------------------------------------------------

type SeriesMeta = {
  id: string;
  letter: LiveKindLetter;
  colour: string;
  code: string;
  label: string;
  unit: string;
  decimals: number;
  channel: ChannelRef;
};

type SeriesData = { samples: number[]; latest?: number; count: number };
const EMPTY_DATA: SeriesData = { samples: [], count: 0 };

/** A configured limit, drawn as a dashed line and read by the verdict. */
type Reference = { value: number; colour: string; label: string; severity: 'warning' | 'alarm' };

/** A moment the series proved something: it crossed a configured limit. */
type CrossEvent = { index: number; label: string; colour: string; tint: string };

/**
 * A channel's live subscription, with nothing to show for itself.
 *
 * Every mapped channel needs its own `useLiveChannelHistory`, and hooks cannot
 * be called in a loop — so there is one of these per channel and it renders
 * nothing. The table below the chart shows every channel's current reading, so
 * every channel stays subscribed even though only one is plotted.
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

  const data = useMemo<SeriesData>(
    () =>
      history.length === 0
        ? EMPTY_DATA
        : { samples: history, latest: history[history.length - 1], count: history.length },
    [history],
  );

  useEffect(() => {
    onData(meta.id, data);
  }, [onData, meta.id, data]);

  return null;
}

// --- Card furniture ---------------------------------------------------------

/** The design's `.tf-pill` — a mono uppercase chip carrying an identity or a verdict. */
function Pill({
  children,
  accent,
  tint,
  palette,
}: {
  children: string;
  accent?: string;
  tint?: string;
  palette: ConsolePalette;
}) {
  return (
    <View className="rounded-md px-2 py-[3px]" style={{ backgroundColor: tint ?? palette.panelRaised }}>
      <Text className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: accent ?? palette.inkMuted }}>
        {children}
      </Text>
    </View>
  );
}

/** The design's `.tf-tag` — a mono chip carrying a movement or a margin. */
function Tag({
  children,
  accent,
  tint,
  palette,
}: {
  children: string;
  accent?: string;
  tint?: string;
  palette: ConsolePalette;
}) {
  return (
    <View className="rounded-md px-2.5 py-1" style={{ backgroundColor: tint ?? palette.panelRaised }}>
      <Text className="font-mono text-[10.5px]" style={{ color: accent ?? palette.inkMuted, fontVariant: ['tabular-nums'] }}>
        {children}
      </Text>
    </View>
  );
}

/** One cell of the stats strip. */
function Stat({
  label,
  value,
  accent,
  last,
  palette,
}: {
  label: string;
  value: string;
  accent?: string;
  last: boolean;
  palette: ConsolePalette;
}) {
  return (
    <View
      className="px-4 py-2.5"
      style={{
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 96,
        borderRightWidth: last ? 0 : 1,
        borderRightColor: palette.line,
      }}
    >
      <Text
        numberOfLines={1}
        className="font-mono text-[9px] uppercase tracking-[0.16em]"
        style={{ color: palette.inkFaint }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className="mt-1 font-mono text-[13px]"
        style={{ color: accent ?? palette.ink, fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
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
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<string>('w60');
  const [data, setData] = useState<Record<string, SeriesData>>({});
  const [plotWidth, setPlotWidth] = useState(0);
  /** Fraction across the window, 0 = oldest, 1 = newest. Null when not scrubbing. */
  const [cursor, setCursor] = useState<number | null>(null);

  const onData = useCallback((id: string, next: SeriesData) => {
    setData((previous) => (previous[id] === next ? previous : { ...previous, [id]: next }));
  }, []);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setPlotWidth(Math.round(event.nativeEvent.layout.width));
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
        decimals: LIVE_RANGE_FOR_LETTER[mapped.channel.letter].decimals,
        channel: mapped.channel,
      })),
    [mappedChannels, ramp],
  );

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

  /** The design's four window chips, counted in samples because that is what exists. */
  const windowOptions = useMemo(
    () => [
      { value: 'w30', label: '30', count: undefined },
      { value: 'w60', label: '60', count: undefined },
      { value: 'w120', label: '120', count: undefined },
      { value: 'all', label: 'Session', count: undefined },
    ],
    [],
  );
  const windowSize = windowKey === 'w30' ? 30 : windowKey === 'w60' ? 60 : windowKey === 'w120' ? 120 : HISTORY_LENGTH;

  const filtered = useMemo(
    () => (kindFilter === 'all' ? series : series.filter((entry) => entry.letter === kindFilter)),
    [series, kindFilter],
  );

  // Exactly one subject, and the default lands on a channel that has actually
  // reported — opening on a silent one shows a correct, fully-labelled, empty
  // plot, which reads as a broken screen rather than as a quiet channel.
  const focused =
    filtered.find((entry) => entry.id === focusedId) ??
    filtered.find((entry) => (data[entry.id]?.count ?? 0) > 1) ??
    filtered[0] ??
    null;

  const session = focused ? (data[focused.id] ?? EMPTY_DATA).samples : [];
  const win = useMemo(() => session.slice(Math.max(0, session.length - windowSize)), [session, windowSize]);
  const n = win.length;

  // --- scale -----------------------------------------------------------------
  const band = focused ? LIVE_RANGE_FOR_LETTER[focused.letter] : null;

  const references = useMemo<Reference[]>(() => {
    if (!focused) return [];
    const list: Reference[] = [];
    if (typeof focused.channel.alarmWarning === 'number') {
      list.push({ value: focused.channel.alarmWarning, colour: palette.warning, label: 'warning', severity: 'warning' });
    }
    if (typeof focused.channel.alarmCritical === 'number') {
      list.push({ value: focused.channel.alarmCritical, colour: palette.critical, label: 'alarm', severity: 'alarm' });
    }
    return list;
  }, [focused, palette.critical, palette.warning]);

  const domain = useMemo(() => {
    if (!band || n < 1) return niceDomain(0, 1, Y_TICKS);
    const dataLo = Math.min(...win);
    const dataHi = Math.max(...win);
    const lo = Math.min(dataLo, band.min);
    const hi = Math.max(dataHi, band.max, ...references.map((reference) => reference.value));
    return niceDomain(lo, hi, Y_TICKS);
  }, [band, n, win, references]);

  const span = domain.hi - domain.lo || 1;
  const y = useCallback((value: number) => BOT - ((value - domain.lo) / span) * (BOT - TOP), [domain.lo, span]);
  const xOf = useCallback((index: number) => (n > 1 ? (index / (n - 1)) * plotWidth : plotWidth / 2), [n, plotWidth]);

  const points = useMemo<Pt[]>(() => win.map((value, index) => [xOf(index), y(value)]), [win, xOf, y]);
  const linePath = useMemo(() => smoothPath(points), [points]);

  /** The whole session, decimated to at most 200 points for the strip below. */
  const brushPath = useMemo(() => {
    if (plotWidth <= 0 || session.length < 2) return '';
    const lo = Math.min(...session);
    const hi = Math.max(...session);
    const range = hi - lo || 1;
    const stride = Math.max(1, Math.floor(session.length / 200));
    const brush: Pt[] = [];
    for (let index = 0; index < session.length; index += stride) {
      brush.push([
        (index / (session.length - 1)) * plotWidth,
        BRUSH_H - 3 - ((session[index] - lo) / range) * (BRUSH_H - 6),
      ]);
    }
    return smoothPath(brush);
  }, [plotWidth, session]);

  // --- reading ---------------------------------------------------------------
  const cursorIndex = cursor === null ? n - 1 : Math.max(0, Math.min(n - 1, Math.round(cursor * (n - 1))));
  const shown = n > 0 ? win[cursorIndex] : null;
  const latest = n > 0 ? win[n - 1] : null;
  const first = n > 0 ? win[0] : null;
  const decimals = focused?.decimals ?? 1;
  const fmt = useCallback((value: number) => value.toFixed(decimals), [decimals]);

  const dataLo = n > 0 ? Math.min(...win) : 0;
  const dataHi = n > 0 ? Math.max(...win) : 0;
  const mean = n > 0 ? win.reduce((sum, value) => sum + value, 0) / n : 0;
  const sd = n > 0 ? Math.sqrt(win.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n) : 0;
  let minIndex = 0;
  let maxIndex = 0;
  win.forEach((value, index) => {
    if (value < win[minIndex]) minIndex = index;
    if (value > win[maxIndex]) maxIndex = index;
  });

  /**
   * The verdict, and the margin that justifies it.
   *
   * The reference panel reads one boundary; a channel here can carry two, so
   * the highest one crossed wins. With no limits configured the honest verdict
   * is about the expected band alone, and the margin tag disappears rather than
   * reporting a distance to nothing.
   */
  const crossed = shown === null ? null : references.filter((reference) => shown >= reference.value).pop() ?? null;
  const inBand = shown !== null && band !== null && shown >= band.min && shown <= band.max;
  const verdict = crossed
    ? { text: crossed.severity === 'alarm' ? 'Over alarm limit' : 'Over warning limit', accent: crossed.colour }
    : inBand
      ? { text: 'In band', accent: palette.accent }
      : { text: 'Outside band', accent: palette.warning };

  const nearest =
    shown === null || references.length === 0
      ? null
      : references.reduce((best, reference) =>
          Math.abs(reference.value - shown) < Math.abs(best.value - shown) ? reference : best,
        );
  const margin = nearest && shown !== null ? nearest.value - shown : null;
  const movement = shown !== null && first !== null ? shown - first : null;

  /** Every moment in the window the series crossed a configured limit. */
  const events = useMemo<CrossEvent[]>(() => {
    if (n < 2 || references.length === 0) return [];
    const found: CrossEvent[] = [];
    for (const reference of references) {
      for (let index = 1; index < n; index += 1) {
        const before = win[index - 1];
        const after = win[index];
        if (before < reference.value && after >= reference.value) {
          found.push({
            index,
            label: `${reference.label} crossed`,
            colour: reference.colour,
            tint: alpha(reference.colour, 0.12),
          });
        } else if (before >= reference.value && after < reference.value) {
          found.push({
            index,
            label: `back under ${reference.label}`,
            colour: palette.accent,
            tint: alpha(palette.accent, 0.12),
          });
        }
      }
    }
    return found.sort((a, b) => a.index - b.index).slice(-MAX_EVENTS);
  }, [n, references, win, palette.accent]);

  // --- crosshair -------------------------------------------------------------
  const onPointerMove = useCallback(
    (event: { nativeEvent: unknown }) => {
      if (plotWidth <= 0) return;
      const native = event.nativeEvent as { offsetX?: number; locationX?: number };
      const x = native.offsetX ?? native.locationX;
      if (typeof x !== 'number') return;
      setCursor(Math.max(0, Math.min(1, x / plotWidth)));
    },
    [plotWidth],
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

  const cursorX = n > 1 ? xOf(cursorIndex) : 0;
  const flagY = latest === null ? 0 : Math.min(BOT, Math.max(TOP, y(latest)));
  const ticks = Array.from({ length: Y_TICKS }, (_, index) => domain.hi - (span * index) / (Y_TICKS - 1));
  const ready = Boolean(focused) && plotWidth > 0 && n >= 2;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 12 }}>
      {/* Every subscription on the screen, drawing nothing. */}
      {series.map((meta) => (
        <SeriesFeed key={meta.id} meta={meta} devices={devices} machineId={machineId} onData={onData} />
      ))}

      {/* The chrome the reference panel tells you to replace with the host
          app's own: the window chips move into this toolbar and keep driving
          the same window state. */}
      <View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <Text className="font-body-bold text-[15px] tracking-[-0.02em]" style={{ color: palette.ink }}>
          Live trends
        </Text>
        <View className="flex-row flex-wrap items-center gap-2.5">
          <Text className="font-mono text-[9.5px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
            Window
          </Text>
          <FilterChips label="Window length in samples" options={windowOptions} value={windowKey} onChange={setWindowKey} />
          <FilterChips label="Filter by measurement kind" options={kindOptions} value={kindFilter} onChange={setKindFilter} />
        </View>
      </View>

      {focused ? (
        <View
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: palette.line, backgroundColor: palette.panel }}
        >
          {/* ── card head ─────────────────────────────────────────────── */}
          <View className="flex-row flex-wrap items-end gap-x-5 gap-y-3 px-5 pb-3.5 pt-4">
            <View className="min-w-[240px] flex-1">
              <View className="flex-row flex-wrap items-center gap-2.5">
                <View style={{ width: 18, height: 3, borderRadius: 2, backgroundColor: focused.colour }} />
                <Text className="font-body-bold text-[19px] tracking-[-0.025em]" style={{ color: palette.ink }} numberOfLines={1}>
                  {focused.label}
                </Text>
                <Pill palette={palette}>{`${focused.code} · ${KIND_LABEL[focused.letter]}`}</Pill>
                <Pill palette={palette} accent={verdict.accent} tint={alpha(verdict.accent, 0.12)}>
                  {verdict.text}
                </Pill>
              </View>
              <Text className="mt-[7px] font-body text-[12.5px] leading-[17px]" style={{ color: palette.inkMuted }}>
                {focused.channel.deviceName} · expected band {band ? `${fmt(band.min)} – ${fmt(band.max)} ${focused.unit}` : '—'}
                {references.length > 0
                  ? ` · ${references.map((reference) => `${reference.label} ${fmt(reference.value)}`).join(' · ')}`
                  : ' · no limits configured on this channel'}
              </Text>
            </View>

            <View className="items-end">
              <Text className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
                {cursor === null ? 'latest sample' : 'at cursor'}
              </Text>
              <View className="mt-[5px] flex-row items-baseline gap-[7px]">
                <Text
                  className="font-mono text-[34px] leading-[36px] tracking-[-0.04em]"
                  style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}
                >
                  {shown === null ? '—' : fmt(shown)}
                </Text>
                <Text className="font-mono text-[12px] uppercase tracking-[0.1em]" style={{ color: palette.inkMuted }}>
                  {focused.unit}
                </Text>
              </View>
            </View>

            <View className="items-end gap-1.5">
              {movement !== null ? (
                <Tag
                  palette={palette}
                  accent={movement >= 0 ? palette.warning : palette.neutral}
                  tint={alpha(movement >= 0 ? palette.warning : palette.neutral, 0.12)}
                >
                  {`${movement >= 0 ? '↑' : '↓'} ${Math.abs(movement).toFixed(decimals)} ${focused.unit} over window`}
                </Tag>
              ) : null}
              {margin !== null && nearest ? (
                <Tag palette={palette} accent={margin <= 0 ? nearest.colour : palette.inkMuted}>
                  {`${margin >= 0 ? '' : '−'}${Math.abs(margin).toFixed(decimals)} ${focused.unit} to ${nearest.label}`}
                </Tag>
              ) : null}
            </View>
          </View>

          {/* ── stats strip ───────────────────────────────────────────── */}
          <View
            className="flex-row flex-wrap"
            style={{
              borderTopWidth: 1,
              borderTopColor: palette.line,
              borderBottomWidth: 1,
              borderBottomColor: palette.line,
              backgroundColor: palette.panelRaised,
            }}
          >
            <Stat palette={palette} label="Now" value={shown === null ? '—' : `${fmt(shown)} ${focused.unit}`} accent={focused.colour} last={false} />
            <Stat palette={palette} label="Mean" value={n > 0 ? fmt(mean) : '—'} last={false} />
            <Stat palette={palette} label="Min" value={n > 0 ? fmt(dataLo) : '—'} last={false} />
            <Stat palette={palette} label="Max" value={n > 0 ? fmt(dataHi) : '—'} last={false} />
            <Stat palette={palette} label="Range" value={n > 0 ? fmt(dataHi - dataLo) : '—'} last={false} />
            <Stat palette={palette} label="Std dev" value={n > 0 ? sd.toFixed(2) : '—'} last={false} />
            <Stat palette={palette} label="Samples" value={String(n)} last />
          </View>

          {/* ── plot row: value gutter | plot | flag column ───────────── */}
          <View className="flex-row px-5 pt-[18px]">
            <View style={{ width: Y_COL, height: PLOT_H }}>
              <Text
                className="absolute font-mono text-[9px] uppercase tracking-[0.16em]"
                style={{ color: palette.inkFaint, right: 10, top: -14 }}
              >
                {focused.unit}
              </Text>
              {ready
                ? ticks.map((tick) => (
                    <Text
                      key={tick}
                      className="absolute font-mono text-[10px]"
                      style={{ color: palette.inkFaint, right: 10, top: y(tick) - 7, fontVariant: ['tabular-nums'] }}
                      numberOfLines={1}
                    >
                      {fmt(tick)}
                    </Text>
                  ))
                : null}
              {/* The cursor's own value, bubbled onto the axis it belongs to. */}
              {ready && cursor !== null && shown !== null ? (
                <View
                  className="absolute rounded px-1.5 py-[2px]"
                  style={{ right: 6, top: y(shown) - 9, backgroundColor: palette.ink }}
                >
                  <Text className="font-mono text-[10px]" style={{ color: palette.panel, fontVariant: ['tabular-nums'] }}>
                    {fmt(shown)}
                  </Text>
                </View>
              ) : null}
            </View>

            <View
              className="min-w-0 flex-1"
              onLayout={onLayout}
              onPointerMove={onPointerMove}
              onPointerLeave={() => setCursor(null)}
              style={{ height: PLOT_H }}
            >
              {ready && band ? (
                <>
                  <View pointerEvents="none">
                    <Svg width={plotWidth} height={PLOT_H}>
                      <Defs>
                        <LinearGradient id="tfFill" x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor={focused.colour} stopOpacity={isDark ? 0.26 : 0.16} />
                          <Stop offset="1" stopColor={focused.colour} stopOpacity={0.01} />
                        </LinearGradient>
                      </Defs>

                      {/* The registered band, tinted. */}
                      <Rect
                        x={0}
                        y={y(band.max)}
                        width={plotWidth}
                        height={Math.max(0, y(band.min) - y(band.max))}
                        fill={palette.accent}
                        fillOpacity={isDark ? 0.07 : 0.05}
                      />

                      {/* Grids. */}
                      {Array.from({ length: X_TICKS }, (_, index) => {
                        const x = Math.round((index / (X_TICKS - 1)) * plotWidth) + 0.5;
                        return (
                          <Line key={`v${index}`} x1={x} y1={0} x2={x} y2={PLOT_H} stroke={palette.line} strokeWidth={1} opacity={0.45} />
                        );
                      })}
                      {ticks.map((tick, index) => {
                        const py = Math.round(y(tick)) + 0.5;
                        const edge = index === 0 || index === ticks.length - 1;
                        return (
                          <Line
                            key={`h${tick}`}
                            x1={0}
                            y1={py}
                            x2={plotWidth}
                            y2={py}
                            stroke={palette.line}
                            strokeWidth={1}
                            opacity={edge ? 0.95 : 0.55}
                          />
                        );
                      })}

                      {/* Configured limits. */}
                      {references.map((reference) => (
                        <Line
                          key={reference.label}
                          x1={0}
                          y1={y(reference.value)}
                          x2={plotWidth}
                          y2={y(reference.value)}
                          stroke={reference.colour}
                          strokeWidth={1}
                          strokeDasharray="6 5"
                          opacity={0.6}
                        />
                      ))}

                      {/* What the samples proved. */}
                      {events.map((event, index) => (
                        <Line
                          key={`${event.label}${event.index}${index}`}
                          x1={xOf(event.index)}
                          y1={0}
                          x2={xOf(event.index)}
                          y2={PLOT_H}
                          stroke={event.colour}
                          strokeWidth={1}
                          strokeDasharray="3 4"
                          opacity={0.5}
                        />
                      ))}

                      <Path d={`${linePath} L ${plotWidth} ${BOT} L 0 ${BOT} Z`} fill="url(#tfFill)" />
                      <Path
                        d={linePath}
                        fill="none"
                        stroke={focused.colour}
                        strokeWidth={2}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />

                      {/* Window extremes, hollow so they read as annotations. */}
                      <Circle cx={xOf(minIndex)} cy={y(win[minIndex])} r={3} fill={palette.panel} stroke={focused.colour} strokeWidth={1.4} />
                      <Circle cx={xOf(maxIndex)} cy={y(win[maxIndex])} r={3} fill={palette.panel} stroke={focused.colour} strokeWidth={1.4} />

                      {cursor !== null ? (
                        <Line x1={cursorX} y1={0} x2={cursorX} y2={PLOT_H} stroke={palette.ink} strokeWidth={1} opacity={0.3} />
                      ) : null}
                    </Svg>
                  </View>

                  {/* Overlay: chips, reference labels, extremes, marker, tip. */}
                  <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
                    {events.map((event, index) => {
                      const x = xOf(event.index);
                      const flip = x > plotWidth * 0.6;
                      return (
                        <View
                          key={`chip${event.index}${index}`}
                          className="absolute rounded-[5px] px-2 py-[3px]"
                          style={{
                            top: 4 + (index % 2) * 20,
                            ...(flip ? { right: plotWidth - x + 4 } : { left: x + 4 }),
                            backgroundColor: event.tint,
                          }}
                        >
                          <Text className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: event.colour }}>
                            {event.label}
                          </Text>
                        </View>
                      );
                    })}

                    {/* The design splits its two reference labels across the two
                        edges so neither sits on top of the other. Same here: the
                        warning takes the left edge, the alarm the right. */}
                    {references.map((reference) => (
                      <View
                        key={`ref${reference.label}`}
                        className="absolute px-[5px]"
                        style={{
                          ...(reference.severity === 'alarm' ? { right: 6 } : { left: 6 }),
                          top: y(reference.value) - 15,
                          backgroundColor: palette.panel,
                        }}
                      >
                        <Text className="font-mono text-[9.5px]" style={{ color: reference.colour }}>
                          {reference.label} {fmt(reference.value)} {focused.unit}
                        </Text>
                      </View>
                    ))}

                    <View
                      className="absolute rounded-[5px] px-[7px] py-[2px]"
                      style={{
                        ...(xOf(minIndex) > plotWidth * 0.6
                          ? { right: plotWidth - xOf(minIndex) + 6 }
                          : { left: xOf(minIndex) + 6 }),
                        top: y(win[minIndex]) + 4,
                        backgroundColor: palette.panelRaised,
                      }}
                    >
                      <Text className="font-mono text-[9.5px]" style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}>
                        min {fmt(win[minIndex])}
                      </Text>
                    </View>
                    <View
                      className="absolute rounded-[5px] px-[7px] py-[2px]"
                      style={{
                        ...(xOf(maxIndex) > plotWidth * 0.6
                          ? { right: plotWidth - xOf(maxIndex) + 6 }
                          : { left: xOf(maxIndex) + 6 }),
                        top: y(win[maxIndex]) - 20,
                        backgroundColor: palette.panelRaised,
                      }}
                    >
                      <Text className="font-mono text-[9.5px]" style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}>
                        max {fmt(win[maxIndex])}
                      </Text>
                    </View>

                    {shown !== null ? (
                      <View
                        style={{
                          position: 'absolute',
                          left: cursorX - 4.5,
                          top: y(shown) - 4.5,
                          width: 9,
                          height: 9,
                          borderRadius: 9,
                          backgroundColor: focused.colour,
                          borderWidth: 2,
                          borderColor: palette.panel,
                        }}
                      />
                    ) : null}

                    {cursor !== null && shown !== null ? (
                      <View
                        className="absolute rounded-[9px] border px-3 py-2.5"
                        style={{
                          ...(cursorX > plotWidth * 0.6
                            ? { right: plotWidth - cursorX + 12 }
                            : { left: cursorX + 12 }),
                          top: 12,
                          minWidth: 150,
                          borderColor: palette.lineStrong,
                          backgroundColor: palette.panel,
                          shadowColor: palette.shadow,
                          shadowOpacity: isDark ? 0.6 : 0.14,
                          shadowRadius: 18,
                          shadowOffset: { width: 0, height: 8 },
                        }}
                      >
                        <Text className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
                          {samplesBack(n - 1 - cursorIndex)}
                        </Text>
                        <View className="mt-1.5 flex-row items-baseline gap-[5px]">
                          <Text
                            className="font-mono text-[17px] tracking-[-0.02em]"
                            style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}
                          >
                            {fmt(shown)}
                          </Text>
                          <Text className="font-mono text-[9.5px] uppercase tracking-[0.1em]" style={{ color: palette.inkMuted }}>
                            {focused.unit}
                          </Text>
                        </View>
                        <View className="mt-[7px]" style={{ gap: 4 }}>
                          {nearest && margin !== null ? (
                            <View className="flex-row items-center justify-between gap-2.5">
                              <Text className="font-mono text-[10px]" style={{ color: palette.inkMuted }}>
                                to {nearest.label}
                              </Text>
                              <Text
                                className="font-mono text-[10px]"
                                style={{ color: margin <= 0 ? nearest.colour : palette.ink, fontVariant: ['tabular-nums'] }}
                              >
                                {margin >= 0 ? '' : '−'}
                                {Math.abs(margin).toFixed(decimals)} {focused.unit}
                              </Text>
                            </View>
                          ) : null}
                          <View className="flex-row items-center justify-between gap-2.5">
                            <Text className="font-mono text-[10px]" style={{ color: palette.inkMuted }}>
                              state
                            </Text>
                            <Text className="font-mono text-[10px]" style={{ color: verdict.accent }}>
                              {verdict.text.toLowerCase()}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </>
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Text
                    className="font-mono text-[11px] uppercase tracking-[0.14em]"
                    style={{ color: palette.inkFaint }}
                  >
                    {n === 0 ? 'this channel has not reported yet' : n < 2 ? 'no samples in window' : 'sizing the plot'}
                  </Text>
                </View>
              )}
            </View>

            <View style={{ width: FLAG_COL, paddingLeft: 10 }}>
              {ready && latest !== null ? (
                <View
                  className="absolute rounded-[5px] px-2 py-[3px]"
                  style={{ left: 4, top: flagY - 10, backgroundColor: focused.colour }}
                >
                  <Text
                    className="font-mono text-[10.5px]"
                    style={{ color: inkOn(focused.colour), fontVariant: ['tabular-nums'] }}
                  >
                    {fmt(latest)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* ── sample axis, on the same three columns ────────────────── */}
          <View className="flex-row px-5 pb-3 pt-2">
            <View style={{ width: Y_COL }} />
            <View className="min-w-0 flex-1 flex-row items-center justify-between">
              {Array.from({ length: X_TICKS }, (_, index) => {
                const fraction = index / (X_TICKS - 1);
                return (
                  <Text
                    key={index}
                    className="font-mono text-[9.5px] uppercase tracking-[0.14em]"
                    style={{ color: palette.inkFaint }}
                  >
                    {samplesBack((1 - fraction) * Math.max(0, n - 1))}
                  </Text>
                );
              })}
            </View>
            <View style={{ width: FLAG_COL }} />
          </View>

          {/* ── session strip, window bracketed ───────────────────────── */}
          <View
            className="flex-row items-center px-5 pb-3 pt-2.5"
            style={{ borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.panelRaised }}
          >
            <View style={{ width: Y_COL, paddingRight: 10 }}>
              <Text className="text-right font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                Session
              </Text>
            </View>
            <View className="min-w-0 flex-1" style={{ height: BRUSH_H }}>
              {brushPath ? (
                <>
                  <Svg width={plotWidth} height={BRUSH_H}>
                    <Path
                      d={`${brushPath} L ${plotWidth} ${BRUSH_H} L 0 ${BRUSH_H} Z`}
                      fill={focused.colour}
                      fillOpacity={0.07}
                    />
                    <Path
                      d={brushPath}
                      fill="none"
                      stroke={focused.colour}
                      strokeWidth={1}
                      strokeOpacity={0.5}
                      strokeLinejoin="round"
                    />
                  </Svg>
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      right: 0,
                      width: (n / session.length) * plotWidth,
                      borderLeftWidth: 1,
                      borderRightWidth: 1,
                      borderColor: focused.colour,
                      backgroundColor: alpha(focused.colour, 0.08),
                    }}
                  />
                </>
              ) : null}
            </View>
            <View style={{ width: FLAG_COL }}>
              <Text className="text-right font-mono text-[9.5px] uppercase tracking-[0.1em]" style={{ color: palette.inkMuted }}>
                {session.length} · {n}
              </Text>
            </View>
          </View>

          {/* ── legend ────────────────────────────────────────────────── */}
          <View
            className="flex-row flex-wrap items-center gap-x-3.5 gap-y-2 px-5 pb-3 pt-2.5"
            style={{ borderTopWidth: 1, borderTopColor: palette.line }}
          >
            <Text className="font-mono text-[9.5px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
              Legend
            </Text>
            <View className="flex-row items-center gap-[7px]">
              <View style={{ width: 14, height: 2, backgroundColor: focused.colour }} />
              <Text className="font-body text-[11.5px]" style={{ color: palette.inkMuted }}>
                measured
              </Text>
            </View>
            <View className="flex-row items-center gap-[7px]">
              <View style={{ width: 14, height: 8, backgroundColor: alpha(palette.accent, 0.14) }} />
              <Text className="font-body text-[11.5px]" style={{ color: palette.inkMuted }}>
                expected band
              </Text>
            </View>
            {references.map((reference) => (
              <View key={`key${reference.label}`} className="flex-row items-center gap-[7px]">
                <View style={{ width: 14, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: reference.colour }} />
                <Text className="font-body text-[11.5px]" style={{ color: palette.inkMuted }}>
                  {reference.label}
                </Text>
              </View>
            ))}
            <View className="min-w-0 flex-1" />
            <Text className="font-body text-[11.5px]" style={{ color: palette.inkMuted }}>
              Axis in {focused.unit}, true scale — this chart plots one series only.
            </Text>
          </View>
        </View>
      ) : null}

      {/* The picker. Not a legend: only one series is ever on the chart, so a
          row here chooses the subject rather than toggling a line on and off. */}
      <View
        className="overflow-hidden rounded-xl border"
        style={{ borderColor: palette.line, backgroundColor: palette.panel }}
      >
        <View
          className="flex-row items-center justify-between px-5 py-2.5"
          style={{ borderBottomWidth: 1, borderBottomColor: palette.line }}
        >
          <Text className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
            Signals
          </Text>
          <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
            {filtered.length} mapped
          </Text>
        </View>

        {filtered.map((meta, index) => {
          const isFocused = focused?.id === meta.id;
          const entry = data[meta.id] ?? EMPTY_DATA;

          return (
            <View key={meta.id} style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}>
              <PressSurface
                onPress={() => {
                  setFocusedId(meta.id);
                  setCursor(null);
                }}
                selected={isFocused}
                accent={meta.colour}
                accessibilityLabel={`Plot ${meta.label}, ${meta.code}`}
                className="flex-row items-center gap-3 px-5 py-2.5"
                style={{ backgroundColor: isFocused ? alpha(meta.colour, 0.08) : palette.panel }}
              >
                <View style={{ width: 14, height: 2.5, borderRadius: 2, backgroundColor: meta.colour }} />
                <Text
                  className="font-mono text-[9.5px] uppercase tracking-[0.12em]"
                  style={{ color: palette.inkFaint, width: 46 }}
                >
                  {meta.code}
                </Text>
                <Text numberOfLines={1} className="min-w-0 flex-1 font-body text-[12px]" style={{ color: palette.ink }}>
                  {meta.label}
                </Text>
                <Text
                  className="font-mono text-[11.5px]"
                  style={{ color: entry.latest === undefined ? palette.inkFaint : palette.ink, fontVariant: ['tabular-nums'] }}
                >
                  {entry.latest === undefined ? '—' : `${entry.latest.toFixed(meta.decimals)} ${meta.unit}`}
                </Text>
                {isFocused ? (
                  <MaterialCommunityIcons name="chart-line" size={14} color={meta.colour} />
                ) : (
                  <View style={{ width: 14 }} />
                )}
              </PressSurface>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
