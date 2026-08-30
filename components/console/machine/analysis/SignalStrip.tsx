import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { SIGNAL_STATE_HEX, SIGNAL_STATE_LABEL, type AnalysisSignal } from '../../../../lib/analysisDiagnosis';
import { getPercent } from '../overview/BarGauge';

// One live signal, with the things that make its number mean something drawn in
// place: the commissioned reference band it should sit inside, and the hard limit
// it must not cross.
//
// The design this replaces drew a full-width thin bar with a value above it and no
// markers at all, so "428 bar" with a bar filled to roughly 40% said nothing about
// how close 428 was to anything. A strip that cannot show proximity to a limit is
// costing a full row of screen to display a number that would fit in a label.
export function SignalStrip({
  signal,
  unverified,
  width,
}: {
  signal: AnalysisSignal;
  // Set when a measurement-chain rule has fired on this signal. The value is then
  // shown as suspect rather than as a fact about the process.
  unverified?: boolean;
  width?: number;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const track = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  const colour = unverified ? '#8A8A8A' : SIGNAL_STATE_HEX[signal.state];
  const pct = (v: number) => getPercent(v, signal.range.min, signal.range.max);

  const band = signal.reference
    ? { from: pct(signal.reference.target - signal.reference.tolerance), to: pct(signal.reference.target + signal.reference.tolerance) }
    : null;

  return (
    <View
      style={{ width, borderColor: hairline }}
      className={cn('flex-1 gap-2 rounded-xl border px-3.5 py-3', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text numberOfLines={1} className={cn('flex-1 font-body-medium text-[13.5px]', inkClass)}>
          {signal.label}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colour }} />
          <Text style={{ color: colour }} className="font-mono text-[10.5px] font-bold tracking-wider">
            {unverified ? 'UNVERIFIED' : SIGNAL_STATE_LABEL[signal.state]}
          </Text>
        </View>
      </View>

      <View className="flex-row items-baseline gap-1.5">
        <Text style={{ color: colour }} className="font-mono text-[26px] font-bold tabular-nums">
          {signal.value.toFixed(signal.decimals)}
        </Text>
        <Text className={cn('font-mono text-[12.5px]', mutedClass)}>{signal.unit}</Text>
      </View>

      <View style={{ height: 8, borderRadius: 4, backgroundColor: track }} className="relative w-full">
        {/* Reference band: where the signal is meant to live. */}
        {band ? (
          <View
            style={{
              position: 'absolute',
              left: `${band.from}%`,
              width: `${Math.max(1, band.to - band.from)}%`,
              top: 0,
              bottom: 0,
              backgroundColor: isDark ? 'rgba(63,185,80,0.20)' : 'rgba(63,185,80,0.22)',
              borderRadius: 4,
            }}
          />
        ) : null}

        {/* The reading itself: a marker, not a fill. A fill implies an amount,
            and a process value is a position. */}
        <View
          style={{
            position: 'absolute',
            left: `${pct(signal.value)}%`,
            top: -2,
            bottom: -2,
            width: 3,
            marginLeft: -1.5,
            borderRadius: 2,
            backgroundColor: colour,
          }}
        />

        {/* Hard limit last, so the reading never paints over the line it crossed. */}
        {signal.limit !== undefined ? (
          <View
            style={{
              position: 'absolute',
              left: `${pct(signal.limit)}%`,
              top: -3,
              bottom: -3,
              width: 2,
              backgroundColor: SIGNAL_STATE_HEX.limit,
            }}
          />
        ) : null}
      </View>

      <View className="flex-row items-center justify-between gap-2">
        <Text numberOfLines={1} className={cn('flex-1 font-mono text-[10.5px]', mutedClass)}>
          {signal.qualifier ?? (signal.reference ? `ref ${signal.reference.target} ±${signal.reference.tolerance}` : '')}
        </Text>
        <Text className={cn('font-mono text-[10.5px]', mutedClass)}>{signal.code}</Text>
      </View>
    </View>
  );
}
