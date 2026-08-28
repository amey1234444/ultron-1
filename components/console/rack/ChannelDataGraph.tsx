import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { readChannelHistoryRange } from '../../../lib/channelHistoryDb';
import { consolePalette, statusTone } from '../../../lib/consoleTheme';
import { gatewayForRack, type DeviceNode } from '../../../lib/devices';
import { liveMeasurementKey, useLiveMeasurement } from '../../../lib/liveMeasurementBus';
import { useLiveChannelReading, type TrendSample } from '../../../lib/liveChannelValue';
import type { LiveState } from '../../../lib/liveTelemetry';
import {
  channelAlarmLimits,
  decimalsForPrecision,
  formatProcessValue,
  normalizeChannelConfig,
  type CardNode,
  type ChannelCommonConfig,
} from '../../../lib/rack';
import { text } from '../../ui';
import { TrendChart } from '../machine/trend/TrendChart';
import { formatSpan, stateOf, type Limits, type SignalState } from '../machine/trend/chartMath';

const WINDOW_OPTIONS = [
  { id: '5m', label: '5 min', ms: 5 * 60 * 1000 },
  { id: '30m', label: '30 min', ms: 30 * 60 * 1000 },
  { id: '2h', label: '2 h', ms: 2 * 60 * 60 * 1000 },
  { id: '8h', label: '8 h', ms: 8 * 60 * 60 * 1000 },
] as const;

const MAX_CHART_SAMPLES = 8000;
const CHART_HEIGHT = 292;
const FOLLOW_TICK_MS = 1000;

type WindowId = (typeof WINDOW_OPTIONS)[number]['id'];

type ChannelDataGraphProps = {
  card: CardNode;
  rack: DeviceNode;
  devices: DeviceNode[];
  live?: LiveState;
  channelNumber?: number;
};

function mergeSamples(stored: TrendSample[], live: TrendSample[]): TrendSample[] {
  const byTimestamp = new Map<number, number>();
  for (const sample of stored) byTimestamp.set(sample.t, sample.v);
  for (const sample of live) byTimestamp.set(sample.t, sample.v);
  return [...byTimestamp.entries()]
    .map(([t, v]) => ({ t, v }))
    .sort((a, b) => a.t - b.t)
    .slice(-MAX_CHART_SAMPLES);
}

function liveFrameSample(
  live: LiveState | undefined,
  gatewayId: string | null,
  rackId: string | null,
  slot: number,
  channelNumber: number,
): TrendSample | null {
  if (!live || !gatewayId || !rackId) return null;
  const measurement = [...live.measurements]
    .reverse()
    .find(
      (entry) =>
        entry.gatewayId === gatewayId &&
        entry.rackId === rackId &&
        entry.slotId === slot &&
        entry.channelId === channelNumber &&
        typeof entry.value === 'number' &&
        Number.isFinite(entry.value),
    );
  if (!measurement || typeof measurement.value !== 'number') return null;
  const t = Date.parse(measurement.updatedAt);
  return Number.isFinite(t) ? { t, v: measurement.value } : null;
}

function WindowChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="rounded-lg border px-2.5 py-1.5"
      style={{
        borderColor: active ? palette.ink : palette.line,
        backgroundColor: active ? palette.selected : palette.panel,
      }}
    >
      <Text className={text.chip} style={{ color: active ? palette.ink : palette.inkMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChannelDataGraph({ card, rack, devices, live, channelNumber = 1 }: ChannelDataGraphProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [windowId, setWindowId] = useState<WindowId>('30m');
  const [storedSamples, setStoredSamples] = useState<TrendSample[]>([]);
  const [liveSamples, setLiveSamples] = useState<TrendSample[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewport, setViewport] = useState<{ from: number; to: number } | null>(null);
  const [clock, setClock] = useState(0);

  const gateway = gatewayForRack(rack, devices);
  const gatewayId = rack.realGatewayId ?? gateway?.realGatewayId ?? null;
  const rackId = rack.realRackId === undefined || rack.realRackId === null ? null : String(rack.realRackId);
  const measurementKey = gatewayId && rackId ? liveMeasurementKey(gatewayId, rackId, card.slot, channelNumber) : null;
  const busMeasurement = useLiveMeasurement(measurementKey);
  const reading = useLiveChannelReading(measurementKey);

  const config = useMemo(
    () => normalizeChannelConfig(card.type, card.config as unknown as Record<string, unknown>) as ChannelCommonConfig,
    [card.config, card.type],
  );
  const limits = useMemo(() => channelAlarmLimits(config), [config]);
  const trendLimits = useMemo<Limits>(
    () => ({
      alert: limits.high ?? undefined,
      danger: limits.highHigh ?? undefined,
    }),
    [limits.high, limits.highHigh],
  );
  const unit = config.unit.trim();
  const decimals = decimalsForPrecision(config.displayPrecision);
  const channelName = config.channelNames[channelNumber - 1]?.trim() || `Channel ${channelNumber}`;
  const windowOption = WINDOW_OPTIONS.find((option) => option.id === windowId) ?? WINDOW_OPTIONS[1];

  useEffect(() => {
    setViewport(null);
    setStoredSamples([]);
    setLiveSamples([]);
  }, [measurementKey, windowId]);

  useEffect(() => {
    const id = setInterval(() => setClock((n) => n + 1), FOLLOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!measurementKey) {
      setStoredSamples([]);
      setLiveSamples([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const to = Date.now();
    const from = to - windowOption.ms;
    setLoading(true);
    void readChannelHistoryRange(measurementKey, from, to, MAX_CHART_SAMPLES).then((samples) => {
      if (cancelled) return;
      setStoredSamples(samples);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [measurementKey, windowOption.ms]);

  const liveStamp = busMeasurement?.updatedAt;
  const liveValue = busMeasurement?.value;
  const liveFallback = useMemo(
    () => liveFrameSample(live, gatewayId, rackId, card.slot, channelNumber),
    [card.slot, channelNumber, gatewayId, live, rackId],
  );

  useEffect(() => {
    const parsed = liveStamp ? Date.parse(liveStamp) : NaN;
    const sample =
      Number.isFinite(parsed) && typeof liveValue === 'number' && Number.isFinite(liveValue)
        ? { t: parsed, v: liveValue }
        : liveFallback;
    if (!sample) return;
    setLiveSamples((previous) => {
      const last = previous[previous.length - 1];
      if (last && last.t === sample.t) return last.v === sample.v ? previous : [...previous.slice(0, -1), sample];
      if (last && sample.t < last.t) return previous;
      return [...previous, sample].slice(-MAX_CHART_SAMPLES);
    });
  }, [liveFallback, liveStamp, liveValue]);

  const samples = useMemo(() => mergeSamples(storedSamples, liveSamples), [storedSamples, liveSamples]);
  const latest = samples[samples.length - 1] ?? null;
  const state: SignalState = latest ? stateOf(latest.v, trendLimits) : 'normal';
  const tone = statusTone(palette, state === 'normal' ? 'normal' : state === 'alert' ? 'alert' : 'danger');
  const feedStatus = samples.length === 0 ? 'none' : reading.status === 'live' ? 'live' : 'stale';
  const feedColour = feedStatus === 'live' ? palette.accentDot : feedStatus === 'stale' ? palette.warningDot : palette.neutral;
  const sessionSpan = samples.length >= 2 ? samples[samples.length - 1].t - samples[0].t : 0;
  const chartRange = useMemo(() => {
    if (viewport) return viewport;
    const to = Math.max(Date.now(), latest?.t ?? 0);
    return { from: to - windowOption.ms, to };
    // `clock` keeps the live-follow window moving between samples.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport, windowOption.ms, latest?.t, clock]);

  const setChartViewport = useCallback((from: number, to: number) => setViewport({ from, to }), []);
  const resetView = useCallback(() => setViewport(null), []);

  return (
    <View
      className="mx-6 mt-4 overflow-hidden rounded-xl border"
      style={{ borderColor: palette.line, backgroundColor: palette.panel }}
    >
      <View
        className="flex-row flex-wrap items-end gap-x-4 gap-y-3 px-5 py-4"
        style={{ borderBottomWidth: 1, borderBottomColor: palette.line }}
      >
        <View className="min-w-[240px] flex-1">
          <Text className={text.label} style={{ color: palette.inkFaint }}>
            CHANNEL DATA
          </Text>
          <Text numberOfLines={1} className={cn('mt-1', text.title)} style={{ color: palette.ink }}>
            {channelName}
          </Text>
          <Text numberOfLines={1} className={cn('mt-0.5', text.meta)} style={{ color: palette.inkMuted }}>
            {measurementKey ? `${gatewayId} / rack ${rackId} / slot ${String(card.slot).padStart(2, '0')} / CH-${channelNumber}` : 'Channel is not addressable yet'}
          </Text>
        </View>

        <View className="items-end">
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 6, height: 6, borderRadius: 4, backgroundColor: feedColour }} />
            <Text className={text.label} style={{ color: palette.inkFaint }}>
              {feedStatus === 'live' ? 'LIVE' : feedStatus === 'stale' ? 'STALE' : loading ? 'LOADING HISTORY' : 'NO DATA'}
            </Text>
          </View>
          <View className="mt-0.5 flex-row items-baseline gap-1.5">
            <Text className={text.display} style={{ color: latest ? tone.value : palette.inkFaint, fontWeight: '300', fontVariant: ['tabular-nums'] }}>
              {latest ? formatProcessValue(latest.v, config.displayPrecision) : '--'}
            </Text>
            <Text className={text.meta} style={{ color: palette.inkMuted }}>
              {unit || '--'}
            </Text>
          </View>
        </View>

        <View className="flex-row flex-wrap justify-end gap-2">
          {WINDOW_OPTIONS.map((option) => (
            <WindowChip key={option.id} label={option.label} active={windowId === option.id} onPress={() => setWindowId(option.id)} />
          ))}
          <WindowChip label="Reset" active={viewport === null} onPress={resetView} />
        </View>
      </View>

      <TrendChart
        samples={samples}
        from={chartRange.from}
        to={chartRange.to}
        limits={trendLimits}
        unit={unit}
        decimals={decimals}
        label={channelName}
        showLimits
        height={CHART_HEIGHT}
        onViewport={setChartViewport}
        onReset={resetView}
        stale={feedStatus !== 'live'}
      />

      <View
        className="flex-row flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-3"
        style={{ borderTopWidth: 1, borderTopColor: palette.line }}
      >
        <Text className={text.meta} style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
          Stored + live {samples.length} samples
        </Text>
        <Text className={text.meta} style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
          Span {sessionSpan > 0 ? formatSpan(sessionSpan) : '--'}
        </Text>
        <Text className={text.meta} style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}>
          H {limits.high === null ? '--' : formatProcessValue(limits.high, config.displayPrecision)} / HH{' '}
          {limits.highHigh === null ? '--' : formatProcessValue(limits.highHigh, config.displayPrecision)}
        </Text>
      </View>
    </View>
  );
}
