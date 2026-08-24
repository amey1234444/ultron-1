/**
 * TRENDS — the analytical workspace.
 *
 * The screen is the chart. Everything above it is the smallest set of controls
 * needed to say *which* signal, over *what* window, and whether what is on
 * screen is live or a replay; everything below it is the legend and the state
 * of the feed behind it. There is no stack of cards around the plot, because a
 * card around a chart is a card that took height from the chart.
 *
 * Reading order, top to bottom:
 *
 *   toolbar   Sensor ▾  Window ▾  LIVE  Replay  Thresholds  Reset view
 *   header    the signal, where it is wired, what it reads now, its state, and
 *             the two limits that state was judged against
 *   chart     TrendChart — grid, zones, limits, state-coloured series,
 *             crosshair, live marker and the right-hand value axis
 *   footer    legend, buffer, and whether the feed is live, stale or silent
 *
 * Vocabulary is deliberately identical to the Overview and Analysis screens:
 * NORMAL / ALERT / DANGER, "Alert 2.50", "Danger 3.50", the unit as configured,
 * and green / amber / red meaning exactly what they mean on a sensor tile. A
 * reader moving between the three pages should never have to re-learn a word or
 * a colour.
 *
 * Honesty, unchanged from the screen this replaces: there is no history service
 * behind this app. The buffer is built from live frames as they arrive
 * (`useLiveChannelSamples`), so a window longer than the buffer's own span is
 * offered but disabled, with the reason stated, rather than drawn short and
 * presented as complete. Nothing on this screen recomputes a threshold, a unit
 * or a state — those come from the channel's configuration, exactly as the
 * sensor tiles read them.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { consolePalette, statusTone } from '../../../lib/consoleTheme';
import type { DeviceNode } from '../../../lib/devices';
import {
  channelNumberFor,
  liveMeasurementKeyForChannel,
  useLiveChannelReading,
  useLiveChannelSamples,
  type TrendSample,
} from '../../../lib/liveChannelValue';
import type { ChannelRef } from '../../../lib/rack';
import { text } from '../../ui';
import { EmptyState } from './analyzer/AnalyzerParts';
import { LIVE_RANGE_FOR_LETTER, type LiveKindLetter } from './liveValue';
import type { MappedChannel } from './RackOccupancyView';
import { TrendChart } from './trend/TrendChart';
import { formatSpan, stateOf, type Limits, type SignalState } from './trend/chartMath';
import { Dropdown, DropdownItem } from './trend/Dropdown';
import { WindowMenu } from './trend/WindowMenu';
import { DEFAULT_WINDOW_ID, windowById, type TrendWindow } from './trend/windowCatalog';

// Human labels for the V/T/S/P/C/X live-reading letter scheme (see liveValue.ts).
const KIND_LABEL: Record<LiveKindLetter, string> = {
  V: 'Vibration',
  T: 'Temperature',
  S: 'Speed',
  P: 'Pressure',
  C: 'Current',
  X: 'Other',
};

const STATE_WORD: Record<SignalState, string> = { normal: 'NORMAL', alert: 'ALERT', danger: 'DANGER' };

/** How much faster than real time Replay runs. Fast enough to be useful, slow enough to read. */
const REPLAY_RATE = 6;
const REPLAY_TICK_MS = 80;
/** How often the live axis advances between samples, so the window keeps sliding. */
const FOLLOW_TICK_MS = 500;

type SeriesMeta = {
  id: string;
  letter: LiveKindLetter;
  code: string;
  label: string;
  unit: string;
  decimals: number;
  channel: ChannelRef;
  limits: Limits;
};

const EMPTY: TrendSample[] = [];

/**
 * One channel's subscription, rendering nothing.
 *
 * Hooks cannot be called in a loop, so every channel needs its own component.
 * They all stay subscribed even though one is plotted, which is what makes
 * switching signals instant instead of starting a fresh buffer each time — and
 * what lets the sensor menu show every channel's current reading.
 */
function SeriesFeed({
  meta,
  devices,
  machineId,
  onSamples,
}: {
  meta: SeriesMeta;
  devices: DeviceNode[];
  machineId: string;
  onSamples: (id: string, samples: TrendSample[], status: 'live' | 'stale' | 'none') => void;
}) {
  const key = useMemo(
    () => liveMeasurementKeyForChannel(meta.channel, channelNumberFor(meta.channel), devices),
    [devices, meta.channel],
  );
  const samples = useLiveChannelSamples(key, `ultron.trendsamples.${machineId}.${meta.id}`);
  const reading = useLiveChannelReading(key);
  const status = reading.status;

  useEffect(() => {
    onSamples(meta.id, samples, status);
  }, [onSamples, meta.id, samples, status]);

  return null;
}

/** A toolbar control. Same height and weight as the dropdowns beside it. */
function ToolButton({
  label,
  onPress,
  active = false,
  disabled = false,
  accent,
  dot,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
  accent?: string;
  dot?: string;
  accessibilityLabel?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      className="flex-row items-center gap-1.5 rounded-lg border px-2.5 py-[5px]"
      style={{
        borderColor: active ? accent ?? palette.lineStrong : hovered && !disabled ? palette.lineStrong : palette.line,
        backgroundColor: active ? palette.selected : hovered && !disabled ? palette.hover : palette.panel,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text className={text.chip} style={{ color: active ? accent ?? palette.ink : palette.inkMuted }}>
        {label}
      </Text>
    </Pressable>
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

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [windowOption, setWindowOption] = useState<TrendWindow>(() => windowById(DEFAULT_WINDOW_ID));
  const [customWindows, setCustomWindows] = useState<TrendWindow[]>([]);
  const [showLimits, setShowLimits] = useState(true);
  const [mode, setMode] = useState<'live' | 'replay'>('live');
  /** Set only once the reader has panned or zoomed. Null means "follow the newest sample". */
  const [viewport, setViewport] = useState<{ from: number; to: number } | null>(null);
  const [replayEnd, setReplayEnd] = useState<number | null>(null);
  const [chartHeight, setChartHeight] = useState(0);
  const [feeds, setFeeds] = useState<Record<string, { samples: TrendSample[]; status: 'live' | 'stale' | 'none' }>>({});
  const [clock, setClock] = useState(0);

  const onSamples = useCallback(
    (id: string, samples: TrendSample[], status: 'live' | 'stale' | 'none') => {
      setFeeds((previous) => {
        const current = previous[id];
        if (current && current.samples === samples && current.status === status) return previous;
        return { ...previous, [id]: { samples, status } };
      });
    },
    [],
  );

  const series = useMemo<SeriesMeta[]>(
    () =>
      mappedChannels.map((mapped) => ({
        id: mapped.id,
        letter: mapped.channel.letter,
        code: mapped.channel.code,
        label: mapped.label,
        unit: mapped.channel.unit,
        decimals: LIVE_RANGE_FOR_LETTER[mapped.channel.letter].decimals,
        channel: mapped.channel,
        // Straight off the channel's configuration. Trends judges nothing of
        // its own — the limits it draws are the limits the rack was commissioned
        // with, which is why the state on this chart always agrees with the
        // state on the sensor tile for the same point.
        limits: { alert: mapped.channel.alarmWarning, danger: mapped.channel.alarmCritical },
      })),
    [mappedChannels],
  );

  // Opens on a channel that has actually reported: a correct, fully-labelled,
  // empty plot reads as a broken screen rather than as a quiet channel.
  const focused =
    series.find((entry) => entry.id === focusedId) ??
    series.find((entry) => (feeds[entry.id]?.samples.length ?? 0) > 1) ??
    series[0] ??
    null;

  const feed = focused ? feeds[focused.id] : undefined;
  const samples = feed?.samples ?? EMPTY;
  const feedStatus = feed?.status ?? 'none';
  const latest = samples.length > 0 ? samples[samples.length - 1] : null;

  const sessionFrom = samples.length > 0 ? samples[0].t : 0;
  const sessionTo = latest?.t ?? 0;
  const bufferSpan = Math.max(0, sessionTo - sessionFrom);

  // The window, in milliseconds. A tick window has no duration of its own — it
  // is "the last N samples" — so it is converted against the samples actually
  // held rather than against an assumed rate.
  const spanMs = useMemo(() => {
    if (windowOption.kind === 'duration') return windowOption.ms;
    if (samples.length < 2) return 30_000;
    const wanted = Math.min(windowOption.ticks, samples.length - 1);
    return Math.max(200, sessionTo - samples[samples.length - 1 - wanted].t);
  }, [windowOption, samples, sessionTo]);

  // Live keeps the newest sample pinned to the right edge and the axis moving
  // between samples; a manual pan or zoom takes over and stops the follow until
  // the reader asks for it back.
  const following = viewport === null && mode === 'live';
  useEffect(() => {
    if (!following) return;
    const id = setInterval(() => setClock((n) => n + 1), FOLLOW_TICK_MS);
    return () => clearInterval(id);
  }, [following]);

  // Replay walks the buffer forward from its oldest sample. It is the same data
  // as live, shown at a different point in time — so it gets a clearly different
  // label and nothing else, rather than a second chart mode to maintain.
  useEffect(() => {
    if (mode !== 'replay' || replayEnd === null) return;
    if (replayEnd >= sessionTo) return;
    const id = setInterval(() => {
      setReplayEnd((current) => {
        if (current === null) return current;
        const next = current + REPLAY_TICK_MS * REPLAY_RATE;
        return next >= sessionTo ? sessionTo : next;
      });
    }, REPLAY_TICK_MS);
    return () => clearInterval(id);
  }, [mode, replayEnd, sessionTo]);

  const range = useMemo(() => {
    if (viewport) return viewport;
    if (mode === 'replay' && replayEnd !== null) return { from: replayEnd - spanMs, to: replayEnd };
    const end = Math.max(sessionTo, Date.now());
    return { from: end - spanMs, to: end };
    // `clock` is never read in the body. It is in the dependency list on
    // purpose: it is the tick that re-evaluates `Date.now()` so the live axis
    // keeps sliding in the gaps between samples.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, mode, replayEnd, spanMs, sessionTo, clock]);

  const onViewport = useCallback((from: number, to: number) => setViewport({ from, to }), []);
  const returnToLive = useCallback(() => {
    setViewport(null);
    setReplayEnd(null);
    setMode('live');
  }, []);
  const resetView = useCallback(() => {
    setViewport(null);
    if (mode === 'replay') setReplayEnd(sessionFrom + spanMs);
  }, [mode, sessionFrom, spanMs]);

  const toggleReplay = useCallback(() => {
    setViewport(null);
    setMode((current) => {
      if (current === 'replay') {
        setReplayEnd(null);
        return 'live';
      }
      setReplayEnd(sessionFrom + spanMs);
      return 'replay';
    });
  }, [sessionFrom, spanMs]);

  // A new signal starts from live on its own buffer: carrying a viewport across
  // signals would open the next one on a window its samples never covered.
  const previousFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focused || previousFocus.current === focused.id) return;
    previousFocus.current = focused.id;
    setViewport(null);
    setReplayEnd(null);
    setMode('live');
  }, [focused]);

  const state: SignalState = latest && focused ? stateOf(latest.v, focused.limits) : 'normal';
  const tone = statusTone(palette, state === 'normal' ? 'normal' : state === 'alert' ? 'alert' : 'danger');
  const seriesColour =
    state === 'danger' ? palette.chartDanger : state === 'alert' ? palette.chartAlert : palette.chartNormal;
  const fmt = (value: number) => value.toFixed(focused?.decimals ?? 1);

  if (mappedChannels.length === 0) {
    return (
      <View className="flex-1 p-5">
        <EmptyState
          icon="chart-line-variant"
          title="No mapped channels"
          detail="Trends plot saved rack mappings. Link a box to a channel in Design mode, then save the canvas configuration."
        />
      </View>
    );
  }

  const feedWord = feedStatus === 'live' ? 'LIVE' : feedStatus === 'stale' ? 'STALE' : 'NO DATA';
  const feedColour = feedStatus === 'live' ? palette.accentDot : feedStatus === 'stale' ? palette.warningDot : palette.neutral;

  return (
    <View className="flex-1" style={{ backgroundColor: palette.bg }}>
      {/* Every channel's subscription, drawing nothing. */}
      {series.map((meta) => (
        <SeriesFeed key={meta.id} meta={meta} devices={devices} machineId={machineId} onSamples={onSamples} />
      ))}

      {/* ── toolbar ──────────────────────────────────────────────────── */}
      <View
        className="flex-row flex-wrap items-center gap-2 px-4 py-2"
        style={{ backgroundColor: palette.panel, borderBottomWidth: 1, borderBottomColor: palette.line }}
      >
        <Dropdown
          label="Sensor"
          value={focused ? focused.code : '—'}
          menuWidth={288}
          accessibilityLabel={`Trend signal, currently ${focused?.label ?? 'none'}`}
        >
          {({ close }) => (
            <>
              {series.map((meta) => {
                const entry = feeds[meta.id];
                const last = entry && entry.samples.length > 0 ? entry.samples[entry.samples.length - 1] : null;
                const metaState = last ? stateOf(last.v, meta.limits) : null;
                return (
                  <DropdownItem
                    key={meta.id}
                    label={`${meta.code} · ${meta.label}`}
                    detail={last ? `${last.v.toFixed(meta.decimals)} ${meta.unit}` : '—'}
                    selected={focused?.id === meta.id}
                    accent={
                      metaState === 'danger'
                        ? palette.chartDanger
                        : metaState === 'alert'
                          ? palette.chartAlert
                          : metaState === 'normal'
                            ? palette.chartNormal
                            : palette.neutral
                    }
                    onPress={() => {
                      setFocusedId(meta.id);
                      close();
                    }}
                  />
                );
              })}
            </>
          )}
        </Dropdown>

        <WindowMenu
          value={windowOption}
          onChange={(option) => {
            setWindowOption(option);
            setViewport(null);
          }}
          custom={customWindows}
          onAddCustom={(option) =>
            setCustomWindows((previous) =>
              previous.some((existing) => existing.id === option.id) ? previous : [...previous, option],
            )
          }
          sampleCount={samples.length}
          spanMs={bufferSpan}
        />

        <ToolButton
          label={following ? 'Live' : 'Return to live'}
          onPress={returnToLive}
          active={following}
          accent={palette.accent}
          dot={following ? palette.accentDot : palette.neutral}
          accessibilityLabel={following ? 'Following the newest sample' : 'Return to live'}
        />
        <ToolButton
          label="Replay"
          onPress={toggleReplay}
          active={mode === 'replay'}
          accent={palette.info}
          disabled={samples.length < 2}
        />
        <ToolButton label="Thresholds" onPress={() => setShowLimits((v) => !v)} active={showLimits} accent={palette.ink} />
        <ToolButton label="Reset view" onPress={resetView} disabled={viewport === null && mode === 'live'} />
      </View>

      {/* ── signal header ────────────────────────────────────────────── */}
      {focused ? (
        <View
          className="flex-row flex-wrap items-end gap-x-6 gap-y-2 px-4 py-2.5"
          style={{ backgroundColor: palette.panel, borderBottomWidth: 1, borderBottomColor: palette.line }}
        >
          <View className="min-w-[200px] flex-1">
            <Text numberOfLines={1} className={text.title} style={{ color: palette.ink }}>
              {focused.label}
            </Text>
            <Text numberOfLines={1} className={cn('mt-0.5', text.meta)} style={{ color: palette.inkMuted }}>
              {focused.code} · {KIND_LABEL[focused.letter]} · {focused.channel.deviceName} · slot{' '}
              {String(focused.channel.slot).padStart(2, '0')}
            </Text>
          </View>

          <View className="items-end">
            <View className="flex-row items-center gap-1.5">
              <View style={{ width: 6, height: 6, borderRadius: 4, backgroundColor: feedColour }} />
              <Text className={text.label} style={{ color: palette.inkFaint }}>
                {mode === 'replay' ? 'REPLAY' : feedWord}
              </Text>
            </View>
            <View className="mt-0.5 flex-row items-baseline gap-1.5">
              <Text
                className={text.display}
                style={{ color: latest ? tone.value : palette.inkFaint, fontVariant: ['tabular-nums'], fontWeight: '300' }}
              >
                {latest ? fmt(latest.v) : '—'}
              </Text>
              <Text className={text.meta} style={{ color: palette.inkMuted }}>
                {focused.unit}
              </Text>
            </View>
          </View>

          <View className="items-end gap-1">
            <View className="rounded-[6px] px-2 py-[3px]" style={{ backgroundColor: tone.soft }}>
              <Text className={text.label} style={{ color: tone.fg }}>
                {latest ? STATE_WORD[state] : 'NO READING'}
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <Text className={text.meta} style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}>
                Alert {focused.limits.alert === undefined ? '—' : fmt(focused.limits.alert)}
              </Text>
              <Text className={text.meta} style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}>
                Danger {focused.limits.danger === undefined ? '—' : fmt(focused.limits.danger)}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* ── the chart ────────────────────────────────────────────────── */}
      <View
        className="min-h-0 flex-1"
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.height);
          setChartHeight((previous) => (Math.abs(previous - next) < 1 ? previous : next));
        }}
      >
        {focused && chartHeight > 60 ? (
          samples.length >= 2 ? (
            <TrendChart
              samples={samples}
              from={range.from}
              to={range.to}
              limits={focused.limits}
              unit={focused.unit}
              decimals={focused.decimals}
              label={focused.label}
              showLimits={showLimits}
              height={chartHeight}
              onViewport={onViewport}
              onReset={resetView}
              stale={feedStatus !== 'live'}
            />
          ) : (
            <View className="flex-1 items-center justify-center gap-1.5" style={{ backgroundColor: palette.chartBg }}>
              <Text className={text.body} style={{ color: palette.inkMuted }}>
                {feedStatus === 'none'
                  ? 'This channel has not reported yet.'
                  : 'Collecting samples — the trend needs at least two.'}
              </Text>
              <Text className={text.meta} style={{ color: palette.inkFaint }}>
                {feedStatus === 'none'
                  ? 'Nothing has arrived on this channel since the console opened.'
                  : `${samples.length} sample${samples.length === 1 ? '' : 's'} held`}
              </Text>
            </View>
          )
        ) : (
          <View className="flex-1" style={{ backgroundColor: palette.chartBg }} />
        )}
      </View>

      {/* ── legend and feed state ────────────────────────────────────── */}
      <View
        className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2"
        style={{ backgroundColor: palette.panel, borderTopWidth: 1, borderTopColor: palette.line }}
      >
        <Text className={text.label} style={{ color: palette.inkFaint }}>
          Legend
        </Text>
        <LegendKey colour={palette.chartNormal} label="Normal" />
        <LegendKey colour={palette.chartAlert} label="Alert" dashed />
        <LegendKey colour={palette.chartDanger} label="Danger" dashed />

        <View className="min-w-0 flex-1" />

        <Text className={text.meta} style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
          Window {windowOption.label}
        </Text>
        <Text className={text.meta} style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
          Buffer {samples.length} samples · {bufferSpan > 0 ? formatSpan(bufferSpan) : '—'}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 6, height: 6, borderRadius: 4, backgroundColor: feedColour }} />
          <Text className={text.meta} style={{ color: palette.inkMuted }}>
            {feedStatus === 'live'
              ? 'Feed live'
              : feedStatus === 'stale'
                ? 'Feed stale — last values shown'
                : 'No frames received'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function LegendKey({ colour, label, dashed = false }: { colour: string; label: string; dashed?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className="flex-row items-center gap-1.5">
      <View
        style={
          dashed
            ? { width: 14, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: colour }
            : { width: 14, height: 2, borderRadius: 1, backgroundColor: colour }
        }
      />
      <Text className={text.meta} style={{ color: palette.inkMuted }}>
        {label}
      </Text>
    </View>
  );
}
