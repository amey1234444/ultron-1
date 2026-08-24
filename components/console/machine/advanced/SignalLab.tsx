import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Line, Path, Polyline } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import {
  assessAll,
  assessCapability,
  MODE_LABEL,
  MODE_PURPOSE,
  PREREQUISITE_LABEL,
  PREREQUISITE_WHY,
  sampleRateVerdict,
  usableSpectrumSpanHz,
  type AnalysisMode,
  type CapabilityInputs,
} from '../../../../lib/analysisCapability';
import { CONDITION_HEX } from '../../../../lib/analysisOverview';
import { qualityHex, QUALITY_LABEL, type DataQuality } from '../../../../lib/advancedDiagnosis';
import { cn } from '../../../../lib/cn';
import { axisColour, gridColour, seriesColour, seriesMutedColour } from './vizTokens';

const CHART_HEIGHT = 260;
const PAD = { left: 8, right: 10, top: 12, bottom: 22 };

// The one analysis this layer can actually perform on the data that exists: a
// trended scalar over time, against its limits and an optional reference.
//
// Single series, so no legend box — the panel title names it. Reference is the
// same hue muted and dashed rather than a second categorical colour, because a
// benchmark is not a peer series.
function TrendPlot({
  samples,
  reference,
  alert,
  danger,
  unit,
  decimals,
}: {
  samples: number[];
  reference?: number;
  alert: number;
  danger: number;
  unit: string;
  decimals: number;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const [width, setWidth] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (width === null || samples.length < 2) return null;

    const values = [...samples, alert, danger, ...(reference === undefined ? [] : [reference])];
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const pad = (rawMax - rawMin) * 0.12 || 1;
    const min = rawMin - pad;
    const max = rawMax + pad;

    const innerW = width - PAD.left - PAD.right;
    const innerH = CHART_HEIGHT - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (i / (samples.length - 1)) * innerW;
    const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * innerH;

    return {
      points: samples.map((v, i) => `${x(i)},${y(v)}`).join(' '),
      area: `M ${x(0)} ${y(samples[0])} ${samples.map((v, i) => `L ${x(i)} ${y(v)}`).join(' ')} L ${x(
        samples.length - 1,
      )} ${PAD.top + innerH} L ${x(0)} ${PAD.top + innerH} Z`,
      yAlert: y(alert),
      yDanger: y(danger),
      yRef: reference === undefined ? null : y(reference),
      baseY: PAD.top + innerH,
      min,
      max,
    };
  }, [width, samples, alert, danger, reference]);

  const trace = seriesColour(isDark);

  return (
    <View className="gap-2">
      <View
        style={{ height: CHART_HEIGHT }}
        className="w-full"
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setWidth((prev) => (prev !== null && Math.abs(prev - w) < 1 ? prev : w));
        }}
      >
        {geometry && width !== null ? (
          <Svg width={width} height={CHART_HEIGHT}>
            {/* Recessive grid. */}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <Line
                key={f}
                x1={PAD.left}
                x2={width - PAD.right}
                y1={PAD.top + f * (CHART_HEIGHT - PAD.top - PAD.bottom)}
                y2={PAD.top + f * (CHART_HEIGHT - PAD.top - PAD.bottom)}
                stroke={gridColour(isDark)}
                strokeWidth={1}
              />
            ))}

            <Path d={geometry.area} fill={trace} fillOpacity={0.1} />
            <Polyline points={geometry.points} fill="none" stroke={trace} strokeWidth={2} strokeLinejoin="round" />

            {geometry.yRef !== null ? (
              <Line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={geometry.yRef}
                y2={geometry.yRef}
                stroke={seriesMutedColour(isDark)}
                strokeWidth={1.5}
                strokeDasharray="2 5"
              />
            ) : null}

            {/* Limits are status, not series — they keep the status palette. */}
            <Line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={geometry.yAlert}
              y2={geometry.yAlert}
              stroke={CONDITION_HEX.alert}
              strokeWidth={1.25}
              strokeDasharray="5 4"
            />
            <Line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={geometry.yDanger}
              y2={geometry.yDanger}
              stroke={CONDITION_HEX.danger}
              strokeWidth={1.25}
              strokeDasharray="5 4"
            />

            <Line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={geometry.baseY}
              y2={geometry.baseY}
              stroke={axisColour(isDark)}
              strokeWidth={1}
            />
          </Svg>
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className={cn('font-body text-[11px] italic', mutedClass)}>Not enough history to plot.</Text>
          </View>
        )}
      </View>

      {/* Identity by label, never colour alone. */}
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 12, height: 2, backgroundColor: trace }} />
          <Text className={cn('font-mono text-[9px]', mutedClass)}>measured {unit}</Text>
        </View>
        {reference !== undefined ? (
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 12, height: 1.5, backgroundColor: seriesMutedColour(isDark) }} />
            <Text className={cn('font-mono text-[9px]', mutedClass)}>reference {reference.toFixed(decimals)}</Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 12, height: 2, backgroundColor: CONDITION_HEX.alert }} />
          <Text className={cn('font-mono text-[9px]', mutedClass)}>alert {alert.toFixed(decimals)}</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 12, height: 2, backgroundColor: CONDITION_HEX.danger }} />
          <Text className={cn('font-mono text-[9px]', mutedClass)}>danger {danger.toFixed(decimals)}</Text>
        </View>
      </View>
    </View>
  );
}

// What an unavailable analysis shows instead of a chart.
//
// Naming the missing prerequisite and why it matters is the whole point. "No data"
// tells an analyst nothing; "no raw waveform is stored, and a trended RMS cannot be
// transformed back into one" tells them what to go and change.
function CapabilityNotice({ mode, missing }: { mode: AnalysisMode; missing: ReturnType<typeof assessAll>[number]['missing'] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="gap-3 rounded-xl border px-4 py-4" style={{ borderColor: hairline }}>
      <View className="flex-row items-center gap-2">
        <Text style={{ color: CONDITION_HEX.offline }} className="font-mono text-[10px] font-bold tracking-wider">
          NOT AVAILABLE
        </Text>
        <Text className={cn('font-body-medium text-[12px]', inkClass)}>{MODE_LABEL[mode]} analysis cannot be performed</Text>
      </View>

      <Text className={cn('font-body text-[11px] leading-[17px]', mutedClass)} style={{ maxWidth: 620 }}>
        {MODE_PURPOSE[mode]} This machine's configuration does not supply what that needs. Nothing is plotted here rather
        than a placeholder trace, because a fabricated spectrum is a number an analyst would act on.
      </Text>

      <View className="gap-2 pt-1" style={{ borderTopWidth: 1, borderTopColor: hairline }}>
        <Text className={cn('font-mono text-[9px] tracking-wider', mutedClass)}>MISSING</Text>
        {missing.map((prerequisite) => (
          <View key={prerequisite} className="flex-row gap-2.5">
            <Text style={{ width: 132 }} className={cn('font-mono text-[10px]', inkClass)}>
              {PREREQUISITE_LABEL[prerequisite]}
            </Text>
            <Text className={cn('flex-1 font-body text-[10px] leading-[15px]', mutedClass)}>
              {PREREQUISITE_WHY[prerequisite]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export type SignalLabProps = {
  pointLabel: string;
  pathLabel: string;
  unit: string;
  decimals: number;
  samples: number[];
  reference?: number;
  alert: number;
  danger: number;
  quality: DataQuality;
  sensorDescription: string;
  capability: CapabilityInputs;
  onAddEvidence?: (note: string) => void;
};

export function SignalLab({
  pointLabel,
  pathLabel,
  unit,
  decimals,
  samples,
  reference,
  alert,
  danger,
  quality,
  sensorDescription,
  capability,
  onAddEvidence,
}: SignalLabProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  const capabilities = useMemo(() => assessAll(capability), [capability]);
  const firstAvailable = capabilities.find((c) => c.available)?.mode ?? 'trend';
  const [mode, setMode] = useState<AnalysisMode>(firstAvailable);

  const current = assessCapability(mode, capability);
  const rateVerdict = sampleRateVerdict(capability);
  const span = usableSpectrumSpanHz(capability.sampleRateHz);
  const availableCount = capabilities.filter((c) => c.available).length;

  const fact = (label: string, value: string, tint?: string) => (
    <View className="gap-0.5" style={{ minWidth: 108 }}>
      <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{label}</Text>
      <Text style={tint ? { color: tint } : undefined} className={cn('font-mono text-[11px]', !tint && inkClass)}>
        {value}
      </Text>
    </View>
  );

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">SIGNAL LAB · VALIDATE</Text>
        <Text className={cn('font-heading-medium text-[17px]', inkClass)}>{pointLabel}</Text>
        <Text numberOfLines={1} className={cn('font-mono text-[9px]', mutedClass)}>
          {pathLabel}
        </Text>
      </View>

      {/* Acquisition facts first. Every analysis below stands or falls on these. */}
      <View className="flex-row flex-wrap gap-4 rounded-xl border px-3.5 py-3" style={{ borderColor: hairline }}>
        {fact('SENSOR', sensorDescription)}
        {fact('SAMPLE RATE', capability.sampleRateHz === null ? 'not configured' : `${capability.sampleRateHz} Hz`)}
        {fact('USABLE SPAN', span === null ? '--' : `${Math.round(span)} Hz`)}
        {fact('SHAFT SPEED', capability.shaftHz === null ? 'unknown' : `${capability.shaftHz.toFixed(1)} Hz`)}
        {fact('WAVEFORM', capability.hasRawWaveform ? 'stored' : 'not stored', CONDITION_HEX.offline)}
        {fact('SPEED REF', capability.hasTacho ? 'synchronised' : 'none', CONDITION_HEX.offline)}
        {fact('QUALITY', QUALITY_LABEL[quality], qualityHex(quality))}
      </View>

      {/* The concrete commissioning finding — invisible unless something states the
          configured rate against this machine's own speed. */}
      {rateVerdict ? (
        <View
          className="flex-row gap-2 rounded-lg px-3 py-2.5"
          style={{ backgroundColor: `${rateVerdict.ok ? CONDITION_HEX.healthy : CONDITION_HEX.alert}12` }}
        >
          <Text
            style={{ color: rateVerdict.ok ? CONDITION_HEX.healthy : CONDITION_HEX.alert }}
            className="font-mono text-[9px] font-bold tracking-wider"
          >
            {rateVerdict.ok ? 'RATE OK' : 'RATE LIMITS ANALYSIS'}
          </Text>
          <Text className={cn('flex-1 font-body text-[10px] leading-[15px]', inkClass)}>{rateVerdict.text}</Text>
        </View>
      ) : null}

      <View className="gap-2">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className={cn('font-mono text-[9px] tracking-wider', mutedClass)}>ANALYSIS</Text>
          <Text className={cn('font-mono text-[9px]', mutedClass)}>
            {availableCount} of {capabilities.length} available on this configuration
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-1.5">
          {capabilities.map((capabilityItem) => {
            const isActive = capabilityItem.mode === mode;
            return (
              <Pressable
                key={capabilityItem.mode}
                onPress={() => setMode(capabilityItem.mode)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive, disabled: !capabilityItem.available }}
                accessibilityLabel={`${MODE_LABEL[capabilityItem.mode]}${capabilityItem.available ? '' : ', not available'}`}
                className={cn(
                  'rounded border px-2 py-1',
                  isActive ? 'border-accent/50 bg-accent/10' : '',
                  !capabilityItem.available && 'opacity-45',
                )}
                style={isActive ? undefined : { borderColor: hairline }}
              >
                <Text className={cn('font-mono text-[9px] tracking-wider', isActive ? 'text-accent' : mutedClass)}>
                  {MODE_LABEL[capabilityItem.mode].toUpperCase()}
                  {capabilityItem.available ? '' : ' ·'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {current.available ? (
        <View className="gap-3">
          <View className="flex-row flex-wrap items-end justify-between gap-2">
            <Text className={cn('font-body-medium text-[12px]', inkClass)}>
              {MODE_LABEL[mode]} · {pointLabel}
            </Text>
            {onAddEvidence ? (
              <Pressable
                onPress={() => onAddEvidence(`${MODE_LABEL[mode]} of ${pointLabel}`)}
                accessibilityRole="button"
                accessibilityLabel="Add this view to the evidence tray"
                className="rounded border border-accent/35 bg-accent/10 px-2 py-1"
              >
                <Text className="font-mono text-[9px] text-accent">ADD TO EVIDENCE</Text>
              </Pressable>
            ) : null}
          </View>

          {mode === 'trend' || mode === 'compare' ? (
            <TrendPlot
              samples={samples}
              reference={mode === 'compare' ? reference : undefined}
              alert={alert}
              danger={danger}
              unit={unit}
              decimals={decimals}
            />
          ) : (
            /* Prerequisites met but no renderer wired yet — distinct from a
               capability gap, and labelled as such so the two are never
               conflated. */
            <View className="gap-2 rounded-xl border px-4 py-4" style={{ borderColor: hairline }}>
              <Text className={cn('font-mono text-[10px] font-bold tracking-wider', mutedClass)}>NOT IMPLEMENTED</Text>
              <Text className={cn('font-body text-[11px] leading-[17px]', mutedClass)}>
                The data for {MODE_LABEL[mode].toLowerCase()} analysis is available, but this view has not been built yet.
              </Text>
            </View>
          )}
        </View>
      ) : (
        <CapabilityNotice mode={mode} missing={current.missing} />
      )}
    </View>
  );
}
