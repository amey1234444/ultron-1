import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { analyzeRotaryAirlock, type AnalysisReading, type AnalysisSignalCode, type RotaryAirlockAnalysisResult } from '../../../lib/analysis/rotaryAirlockAnalyzer';
import { cn } from '../../../lib/cn';
import { deviceWithGatewayConnectionState, type DeviceNode } from '../../../lib/devices';
import { latestMeasurementForChannel, type LiveMeasurement, type LiveState } from '../../../lib/liveTelemetry';
import type { CardNode, ChannelRef } from '../../../lib/rack';
import { LIVE_RANGE_FOR_LETTER, useLiveValue, type LiveKindLetter } from './liveValue';
import type { MappedChannel } from './RackOccupancyView';

const LIVE_COLOUR = '#3FB950';
const WARNING_COLOUR = '#F2A93B';
const CRITICAL_COLOUR = '#EF4444';
const INFO_COLOUR = '#58A6FF';
const MUTED_COLOUR = '#8B949E';

const SECTION_FOR_LETTER: Partial<Record<LiveKindLetter, string>> = {
  V: 'Vibration Overview',
  T: 'Temperature Overview',
  S: 'Speed Overview',
  P: 'Pressure Overview',
  C: 'Current Overview',
  X: 'Mapped Signals',
};

const SECTION_ORDER: LiveKindLetter[] = ['P', 'T', 'V', 'S', 'C', 'X'];

const KIND_LABEL: Record<LiveKindLetter, string> = {
  V: 'Vibration',
  T: 'Temperature',
  S: 'Speed',
  P: 'Pressure',
  C: 'Current',
  X: 'Other',
};

type AlarmLevel = 'critical' | 'warning' | 'normal';
type Tone = 'critical' | 'warning' | 'live' | 'info' | 'muted';
type SampleMap = Record<string, number>;

type SignalValue = {
  mapped: MappedChannel;
  value: number;
  level: AlarmLevel;
  position: number;
};

type Finding = {
  title: string;
  urgency: 'Critical' | 'High' | 'Medium' | 'Low';
  confidence: number;
  evidence: string[];
  contradictions: string[];
};

type MachineAnalysis = {
  readinessPercent: number;
  readinessLabel: string;
  readinessTone: Tone;
  conditionLabel: string;
  conditionTone: Tone;
  conditionScore: number;
  operatingState: string;
  stateTone: Tone;
  stateConfidence: number;
  stateReason: string;
  liveCount: number;
  missingKinds: LiveKindLetter[];
  weakSignals: string[];
  blockers: string[];
  derived: { label: string; value: string; tone: Tone }[];
  findings: Finding[];
  priorityFinding: Finding | null;
  topChannels: SignalValue[];
};

const TONE_COLOUR: Record<Tone, string> = {
  critical: CRITICAL_COLOUR,
  warning: WARNING_COLOUR,
  live: LIVE_COLOUR,
  info: INFO_COLOUR,
  muted: MUTED_COLOUR,
};

const LABEL_TO_SIGNAL: { match: RegExp; code: AnalysisSignalCode }[] = [
  { match: /motor.*current|current/i, code: 'motor_current' },
  { match: /rotor.*speed|speed|rpm/i, code: 'rotor_speed' },
  { match: /de.*bearing.*temp|drive.*bearing.*temp/i, code: 'de_bearing_temperature' },
  { match: /nde.*bearing.*temp|non.*drive.*bearing.*temp/i, code: 'nde_bearing_temperature' },
  { match: /de.*vib|drive.*vib/i, code: 'de_vibration_acceleration_rms' },
  { match: /nde.*vib|non.*drive.*vib/i, code: 'nde_vibration_acceleration_rms' },
  { match: /inlet.*pressure/i, code: 'inlet_pressure' },
  { match: /outlet.*pressure|discharge.*pressure/i, code: 'outlet_pressure' },
  { match: /material.*temp/i, code: 'material_temperature' },
];

function signalCodeFor(label: string): AnalysisSignalCode | null {
  return LABEL_TO_SIGNAL.find((entry) => entry.match.test(label))?.code ?? null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function statusColour(channel: ChannelRef, value: number): string {
  if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) return CRITICAL_COLOUR;
  if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) return WARNING_COLOUR;
  return LIVE_COLOUR;
}

function alarmLevel(channel: ChannelRef, value: number): AlarmLevel {
  if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) return 'critical';
  if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) return 'warning';
  return 'normal';
}

function valuePosition(channel: ChannelRef, value: number): number {
  if (channel.letter === 'S') {
    const max = channel.alarmCritical ?? channel.alarmWarning ?? (value < 200 ? 45 : LIVE_RANGE_FOR_LETTER.S.max);
    return clamp(value / (max || 1), 0, 1);
  }
  if (channel.alarmCritical !== undefined || channel.alarmWarning !== undefined) {
    const max = channel.alarmCritical ?? (channel.alarmWarning ?? 1) * 1.5;
    return clamp(value / (max || 1), 0, 1);
  }
  const range = LIVE_RANGE_FOR_LETTER[channel.letter];
  return clamp((value - range.min) / (range.max - range.min || 1), 0, 1);
}

function formatValue(value: number, letter: LiveKindLetter, unit: string) {
  const range = LIVE_RANGE_FOR_LETTER[letter];
  return `${value.toFixed(range.decimals)} ${unit}`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function topByPosition(signals: SignalValue[], letter: LiveKindLetter) {
  return signals
    .filter((signal) => signal.mapped.channel.letter === letter)
    .sort((a, b) => b.position - a.position)[0];
}

function firstByLetter(signals: SignalValue[], letter: LiveKindLetter) {
  return signals.find((signal) => signal.mapped.channel.letter === letter);
}

function channelsWithLevel(signals: SignalValue[], level: AlarmLevel) {
  return signals.filter((signal) => signal.level === level);
}

function codeLabel(signal: SignalValue) {
  return `${signal.mapped.channel.code} ${signal.mapped.label}`;
}

function channelNumberFor(channel: ChannelRef): number {
  const match = channel.id.match(/\.CH(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function usableMeasurementValue(measurement: LiveMeasurement | undefined): number | undefined {
  if (!measurement) return undefined;
  if (measurement.measurementValid === false) return undefined;
  if (measurement.quality && measurement.quality !== 'GOOD') return undefined;
  return typeof measurement.value === 'number' ? measurement.value : undefined;
}

function liveMeasurementForChannel(channel: ChannelRef, devices: DeviceNode[], cards: CardNode[], live?: LiveState): LiveMeasurement | undefined {
  if (!live) return undefined;
  const rack = devices.find((device) => device.id === channel.rackId);
  const card = cards.find((candidate) => candidate.deviceId === channel.rackId && candidate.slot === channel.slot);
  if (!rack || !card) return undefined;
  return latestMeasurementForChannel(deviceWithGatewayConnectionState(rack, devices), card, channelNumberFor(channel), live);
}

function severityRank(finding: Finding) {
  const urgencyRank = { Critical: 4, High: 3, Medium: 2, Low: 1 }[finding.urgency];
  return urgencyRank * 100 + finding.confidence;
}

function analyseMachine(mappedChannels: MappedChannel[], samples: SampleMap, expectedPoints: number): MachineAnalysis {
  const signals = mappedChannels
    .map((mapped) => {
      const value = samples[mapped.id];
      if (value === undefined) return null;
      return {
        mapped,
        value,
        level: alarmLevel(mapped.channel, value),
        position: valuePosition(mapped.channel, value),
      };
    })
    .filter((signal): signal is SignalValue => signal !== null);

  const byLetter = (letter: LiveKindLetter) => signals.filter((signal) => signal.mapped.channel.letter === letter);
  const mappedLetters = new Set(mappedChannels.map((mapped) => mapped.channel.letter));
  const liveLetters = new Set(signals.map((signal) => signal.mapped.channel.letter));
  const required: LiveKindLetter[] = ['S', 'C'];
  const diagnostic: LiveKindLetter[] = ['P', 'V', 'T'];
  const missingKinds = required.filter((letter) => !mappedLetters.has(letter));
  const missingDiagnosticKinds = diagnostic.filter((letter) => !mappedLetters.has(letter));
  const liveMissingKinds = required.filter((letter) => mappedLetters.has(letter) && !liveLetters.has(letter));
  const liveCount = signals.length;
  const coverage = expectedPoints > 0 ? clamp(mappedChannels.length / expectedPoints, 0, 1) : mappedChannels.length > 0 ? 1 : 0;
  const liveCoverage = mappedChannels.length > 0 ? clamp(liveCount / mappedChannels.length, 0, 1) : 0;
  const readinessPercent = Math.round((coverage * 0.7 + liveCoverage * 0.3) * 100);

  const critical = channelsWithLevel(signals, 'critical');
  const warning = channelsWithLevel(signals, 'warning');
  const weakSignals: string[] = [];
  const blockers: string[] = [];

  if (expectedPoints > 0 && mappedChannels.length < expectedPoints) {
    blockers.push(`${expectedPoints - mappedChannels.length} expected point${expectedPoints - mappedChannels.length === 1 ? '' : 's'} not mapped`);
  }
  if (liveMissingKinds.length > 0) {
    blockers.push(`${liveMissingKinds.map((letter) => KIND_LABEL[letter]).join(', ')} mapped but not sampled yet`);
  }
  if (missingKinds.length > 0) {
    blockers.push(`${missingKinds.map((letter) => KIND_LABEL[letter]).join(', ')} essential state evidence missing`);
  }
  if (missingDiagnosticKinds.length > 0) {
    blockers.push(`${missingDiagnosticKinds.map((letter) => KIND_LABEL[letter]).join(', ')} diagnostic evidence missing`);
  }
  if (critical.length > 0) weakSignals.push(`${critical.length} channel${critical.length === 1 ? '' : 's'} above critical threshold`);
  if (warning.length > 0) weakSignals.push(`${warning.length} channel${warning.length === 1 ? '' : 's'} above warning threshold`);

  const current = topByPosition(signals, 'C');
  const speed = firstByLetter(signals, 'S');
  const maxVibration = topByPosition(signals, 'V');
  const maxTemperature = topByPosition(signals, 'T');
  const maxPressure = topByPosition(signals, 'P');
  const pressures = byLetter('P');
  const temperatures = byLetter('T');
  const vibrations = byLetter('V');

  const speedMid = speed ? (LIVE_RANGE_FOR_LETTER.S.min + LIVE_RANGE_FOR_LETTER.S.max) / 2 : null;
  const speedDeviation = speed && speedMid ? Math.abs(speed.value - speedMid) / speedMid : null;
  const pressureSpread =
    pressures.length >= 2 ? Math.max(...pressures.map((signal) => signal.value)) - Math.min(...pressures.map((signal) => signal.value)) : null;
  const temperatureSpread =
    temperatures.length >= 2 ? Math.max(...temperatures.map((signal) => signal.value)) - Math.min(...temperatures.map((signal) => signal.value)) : null;
  const vibrationSpread =
    vibrations.length >= 2 ? Math.max(...vibrations.map((signal) => signal.value)) - Math.min(...vibrations.map((signal) => signal.value)) : null;

  let operatingState = 'Unknown';
  let stateTone: Tone = 'muted';
  let stateConfidence = 35;
  let stateReason = 'Speed and current are both required before classifying operating state.';
  if (speed && current) {
    if (speed.position < 0.14 && current.position < 0.25) {
      operatingState = 'Stopped';
      stateTone = 'muted';
      stateConfidence = 82;
      stateReason = `${codeLabel(speed)} and ${codeLabel(current)} are both near the bottom of their bands.`;
    } else if (speed.position < 0.22 && current.position >= 0.35) {
      operatingState = 'Motor running, rotor not following';
      stateTone = 'critical';
      stateConfidence = 78;
      stateReason = 'Current is present while rotor speed is too low for a normal running condition.';
    } else if (speed.position < 0.45 && current.position >= 0.45) {
      operatingState = 'Unstable or starting load';
      stateTone = 'warning';
      stateConfidence = 68;
      stateReason = 'Rotor speed is below its normal band while motor load is already meaningful.';
    } else if (speed.position >= 0.35 && current.position < 0.35) {
      operatingState = 'Running with light/no load';
      stateTone = 'info';
      stateConfidence = 70;
      stateReason = 'Rotor speed is established but current remains low.';
    } else if (speed.position >= 0.35 && current.position >= 0.78) {
      operatingState = 'Running high load';
      stateTone = 'warning';
      stateConfidence = 76;
      stateReason = 'Rotor speed is established and motor current is in the upper load band.';
    } else {
      operatingState = 'Running normal load';
      stateTone = 'live';
      stateConfidence = 74;
      stateReason = 'Speed and current are inside the expected operating window.';
    }
  }

  const findings: Finding[] = [];
  const hasPressureEvidence = !!maxPressure || pressureSpread !== null;

  if (hasPressureEvidence && current && (maxPressure?.position ?? 0) > 0.74 && current.position > 0.65) {
    findings.push({
      title: 'Probable material restriction or blockage',
      urgency: speed && speed.position < 0.55 ? 'High' : 'Medium',
      confidence: speed && speed.position < 0.55 ? 82 : 68,
      evidence: [
        `${codeLabel(maxPressure!)} is elevated at ${formatValue(maxPressure!.value, 'P', maxPressure!.mapped.channel.unit)}`,
        `${codeLabel(current)} shows high motor load`,
        ...(pressureSpread !== null ? [`Pressure spread is ${pressureSpread.toFixed(2)} ${maxPressure?.mapped.channel.unit ?? ''}`] : []),
      ],
      contradictions: speed && speed.position > 0.65 ? ['Rotor speed is still holding its band, so restriction is not confirmed.'] : [],
    });
  }

  if (maxVibration && current && maxVibration.position > 0.78 && current.position > 0.58) {
    findings.push({
      title: 'Probable rotor rubbing or clearance issue',
      urgency: maxVibration.level === 'critical' || current.position > 0.82 ? 'High' : 'Medium',
      confidence: maxTemperature && maxTemperature.position > 0.65 ? 78 : 66,
      evidence: [
        `${codeLabel(maxVibration)} is the dominant vibration point`,
        `${codeLabel(current)} is above normal load`,
        ...(maxTemperature && maxTemperature.position > 0.65 ? [`${codeLabel(maxTemperature)} adds thermal support`] : []),
      ],
      contradictions: speed && speed.position > 0.72 ? ['Speed remains stable enough that rubbing is still a probable, not confirmed, condition.'] : [],
    });
  }

  if (maxVibration && maxTemperature && maxVibration.position > 0.7 && maxTemperature.position > 0.62) {
    findings.push({
      title: 'Probable bearing deterioration',
      urgency: maxVibration.level === 'critical' || maxTemperature.level === 'critical' ? 'High' : 'Medium',
      confidence: 72,
      evidence: [
        `${codeLabel(maxVibration)} is elevated`,
        `${codeLabel(maxTemperature)} is elevated at ${formatValue(maxTemperature.value, 'T', maxTemperature.mapped.channel.unit)}`,
        ...(temperatureSpread !== null ? [`Bearing temperature delta is ${temperatureSpread.toFixed(1)} ${maxTemperature.mapped.channel.unit}`] : []),
      ],
      contradictions: current && current.position < 0.45 ? ['Motor load is not high, so loading alone does not explain the vibration.'] : [],
    });
  }

  if (current && current.position > 0.84) {
    findings.push({
      title: 'Probable motor overload',
      urgency: current.level === 'critical' ? 'Critical' : 'High',
      confidence: maxTemperature && maxTemperature.position > 0.65 ? 80 : 68,
      evidence: [
        `${codeLabel(current)} is in the upper load band`,
        ...(maxTemperature && maxTemperature.position > 0.65 ? [`${codeLabel(maxTemperature)} supports load-related heating`] : []),
      ],
      contradictions: speed && speed.position > 0.68 ? ['Rotor speed has not collapsed, so this is not yet a stall signature.'] : [],
    });
  }

  if (speed && speed.position < 0.32 && current && current.position > 0.42) {
    findings.push({
      title: 'Probable drive slip or rotor speed loss',
      urgency: speed.position < 0.18 ? 'High' : 'Medium',
      confidence: 74,
      evidence: [`${codeLabel(speed)} is below the expected running band`, `${codeLabel(current)} confirms the motor is not simply off`],
      contradictions: maxVibration && maxVibration.position > 0.75 ? ['High vibration may indicate rubbing rather than pure drive slip.'] : [],
    });
  }

  const uniqueFindings = findings
    .sort((a, b) => severityRank(b) - severityRank(a))
    .filter((finding, index, list) => list.findIndex((item) => item.title === finding.title) === index);

  let conditionScore = 100;
  conditionScore -= Math.round((1 - coverage) * 28);
  conditionScore -= Math.round((1 - liveCoverage) * 18);
  conditionScore -= missingKinds.length * 5;
  conditionScore -= critical.length * 18;
  conditionScore -= warning.length * 9;
  if (maxVibration && maxVibration.position > 0.78) conditionScore -= 10;
  if (maxTemperature && maxTemperature.position > 0.78) conditionScore -= 8;
  if (current && current.position > 0.82) conditionScore -= 10;
  if (speed && speed.position < 0.35 && current && current.position > 0.42) conditionScore -= 14;
  if (uniqueFindings[0]) conditionScore -= uniqueFindings[0].urgency === 'Critical' ? 24 : uniqueFindings[0].urgency === 'High' ? 16 : 9;
  conditionScore = clamp(conditionScore, 0, 100);

  const conditionTone: Tone = conditionScore < 45 ? 'critical' : conditionScore < 72 ? 'warning' : conditionScore < 88 ? 'info' : 'live';
  const conditionLabel = conditionScore < 45 ? 'Critical attention' : conditionScore < 72 ? 'Attention required' : conditionScore < 88 ? 'Watch' : 'Healthy';
  const readinessTone: Tone = readinessPercent < 55 ? 'critical' : readinessPercent < 80 ? 'warning' : readinessPercent < 100 ? 'info' : 'live';
  const readinessLabel = readinessPercent < 55 ? 'Not analysis-ready' : readinessPercent < 80 ? 'Partial evidence' : readinessPercent < 100 ? 'Nearly ready' : 'Analysis-ready';

  const derived: MachineAnalysis['derived'] = [
    {
      label: 'Mapped evidence',
      value: expectedPoints > 0 ? `${mappedChannels.length}/${expectedPoints}` : String(mappedChannels.length),
      tone: readinessTone,
    },
    { label: 'Live samples', value: `${liveCount}/${mappedChannels.length}`, tone: liveCoverage < 1 ? 'warning' : 'live' },
    ...(pressureSpread !== null
      ? [{ label: 'Pressure differential', value: `${pressureSpread.toFixed(2)} ${maxPressure?.mapped.channel.unit ?? ''}`, tone: pressureSpread > 2 ? 'warning' : 'live' as Tone }]
      : []),
    ...(temperatureSpread !== null
      ? [{ label: 'Bearing temp delta', value: `${temperatureSpread.toFixed(1)} ${maxTemperature?.mapped.channel.unit ?? ''}`, tone: temperatureSpread > 12 ? 'warning' : 'live' as Tone }]
      : []),
    ...(vibrationSpread !== null
      ? [{ label: 'Vibration spread', value: `${vibrationSpread.toFixed(2)} ${maxVibration?.mapped.channel.unit ?? ''}`, tone: vibrationSpread > 1.6 ? 'warning' : 'live' as Tone }]
      : []),
    ...(speedDeviation !== null ? [{ label: 'RPM deviation', value: formatPercent(speedDeviation * 100), tone: speedDeviation > 0.015 ? 'warning' : 'live' as Tone }] : []),
  ];

  return {
    readinessPercent,
    readinessLabel,
    readinessTone,
    conditionLabel,
    conditionTone,
    conditionScore,
    operatingState,
    stateTone,
    stateConfidence,
    stateReason,
    liveCount,
    missingKinds,
    weakSignals,
    blockers,
    derived,
    findings: uniqueFindings,
    priorityFinding: uniqueFindings[0] ?? null,
    topChannels: [...signals].sort((a, b) => {
      const levelDelta = (b.level === 'critical' ? 2 : b.level === 'warning' ? 1 : 0) - (a.level === 'critical' ? 2 : a.level === 'warning' ? 1 : 0);
      return levelDelta || b.position - a.position;
    }),
  };
}

function OverviewCard({ mapped, value }: { mapped: MappedChannel; value: number | undefined }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const { channel, label } = mapped;
  const colour = value === undefined ? MUTED_COLOUR : statusColour(channel, value);
  const range = LIVE_RANGE_FOR_LETTER[channel.letter];

  return (
    <View
      className={cn('gap-1.5 rounded-xl border px-3 py-2.5', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
      style={{ width: 200, borderColor: `${colour}55` }}
    >
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colour }} className="font-body-bold text-sm">
          {channel.code}
        </Text>
        <View className={cn('rounded-full border px-1.5 py-0.5', lineClass)}>
          <Text className={cn('font-mono text-[10px]', mutedClass)}>{channel.code}</Text>
        </View>
      </View>

      <Text numberOfLines={1} className={cn('font-body text-xs', mutedClass)}>
        {label}
      </Text>

      <Text style={{ color: colour }} className="font-mono text-sm font-bold">
        {value === undefined ? 'Sampling...' : `${value.toFixed(range.decimals)} ${channel.unit}`}
      </Text>
    </View>
  );
}

function SampleCollector({ mapped, onSample }: { mapped: MappedChannel; onSample: (id: string, value: number) => void }) {
  const value = useLiveValue(mapped.channel.letter, true);

  useEffect(() => {
    onSample(mapped.id, value);
  }, [mapped.id, onSample, value]);

  return null;
}

function AnalysisStat({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  return (
    <View className={cn('gap-1 rounded-xl border px-3 py-2.5', isDark ? 'bg-surface-darkpanel border-line-dark' : 'bg-surface-lightpanel border-line-light')} style={{ width: 170 }}>
      <Text className={cn('font-body text-[10px] uppercase tracking-wider', mutedClass)}>{label}</Text>
      <Text style={{ color: TONE_COLOUR[tone] }} className="font-mono text-base font-bold">
        {value}
      </Text>
    </View>
  );
}

function SummaryPanel({
  title,
  value,
  detail,
  tone,
  meta,
}: {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  meta?: string;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  return (
    <View className={cn('gap-2 rounded-xl border px-4 py-3', isDark ? 'bg-surface-darkpanel border-line-dark' : 'bg-surface-lightpanel border-line-light')} style={{ width: 300 }}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className={cn('font-body text-[10px] uppercase tracking-wider', mutedClass)}>{title}</Text>
        {meta && (
          <Text style={{ color: TONE_COLOUR[tone] }} className="font-mono text-[10px] font-bold">
            {meta}
          </Text>
        )}
      </View>
      <Text style={{ color: TONE_COLOUR[tone] }} className="font-body-bold text-lg">
        {value}
      </Text>
      <Text className={cn('font-body text-[11px] leading-4', mutedClass)}>{detail}</Text>
    </View>
  );
}

function BulletList({ title, items, tone }: { title: string; items: string[]; tone: Tone }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  return (
    <View className="gap-2" style={{ width: 320 }}>
      <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>{title}</Text>
      <View className="gap-1.5">
        {items.length === 0 ? (
          <Text className={cn('font-body text-xs', mutedClass)}>No issues detected from mapped live evidence.</Text>
        ) : (
          items.map((item) => (
            <View key={item} className="flex-row gap-2">
              <Text style={{ color: TONE_COLOUR[tone] }} className="font-body-bold text-xs">
                -
              </Text>
              <Text className={cn('flex-1 font-body text-xs leading-4', textClass)}>{item}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function FindingPanel({ finding }: { finding: Finding }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const tone: Tone = finding.urgency === 'Critical' || finding.urgency === 'High' ? 'warning' : 'info';

  return (
    <View className={cn('gap-3 rounded-xl border px-4 py-3', isDark ? 'bg-surface-darkpanel border-line-dark' : 'bg-surface-lightpanel border-line-light')} style={{ maxWidth: 680 }}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className={cn('font-body-bold text-sm', textClass)}>{finding.title}</Text>
        <Text style={{ color: TONE_COLOUR[tone] }} className="font-body-bold text-[11px] uppercase tracking-wider">
          {finding.urgency} / {finding.confidence}%
        </Text>
      </View>
      <View className="gap-1">
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Supporting evidence</Text>
        {finding.evidence.map((item) => (
          <Text key={item} className={cn('font-body text-xs leading-4', textClass)}>
            - {item}
          </Text>
        ))}
      </View>
      {finding.contradictions.length > 0 && (
        <View className="gap-1">
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Contradictions</Text>
          {finding.contradictions.map((item) => (
            <Text key={item} className={cn('font-body text-xs leading-4', mutedClass)}>
              - {item}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function DeepAnalyzerPanel({ analysis }: { analysis: RotaryAirlockAnalysisResult }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const anomalyTone: Tone = analysis.anomaly.severity === 'critical' || analysis.anomaly.severity === 'high' ? 'critical' : analysis.anomaly.severity === 'medium' || analysis.anomaly.severity === 'low' ? 'warning' : 'live';
  const maintenanceTone: Tone = analysis.maintenance.priority === 'critical' || analysis.maintenance.priority === 'high' ? 'critical' : analysis.maintenance.caseRequired ? 'warning' : 'live';
  const badQuality = analysis.quality.filter((item) => item.status === 'BAD' || item.status === 'DEGRADED');
  const baselines = analysis.baselines.filter((baseline) => baseline.maturity !== 'unavailable').slice(0, 4);

  return (
    <View className="gap-4">
      <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Deep analyzer</Text>

      <View className="flex-row flex-wrap gap-3">
        <SummaryPanel
          title="Anomaly"
          value={analysis.anomaly.severity === 'none' ? 'No active anomaly' : `${analysis.anomaly.severity} ${analysis.anomaly.state}`}
          detail={analysis.anomaly.contributors[0]?.description ?? analysis.anomaly.limitations[0] ?? 'Baseline comparison is quiet.'}
          tone={anomalyTone}
          meta={analysis.anomaly.score.toFixed(1)}
        />
        <SummaryPanel
          title="Maintenance"
          value={analysis.maintenance.title}
          detail={analysis.maintenance.caseRequired ? analysis.maintenance.recommendedActions[0] : 'No maintenance case is required from current evidence.'}
          tone={maintenanceTone}
          meta={analysis.maintenance.priority}
        />
        <SummaryPanel
          title="Doctor Report"
          value={analysis.doctorReport.summary}
          detail={analysis.doctorReport.nextChecks[0] ?? 'No immediate follow-up check.'}
          tone={maintenanceTone}
        />
      </View>

      <View className="flex-row flex-wrap gap-6">
        <View className="gap-2" style={{ width: 360 }}>
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Signal quality engine</Text>
          {(badQuality.length > 0 ? badQuality : analysis.quality.slice(0, 3)).map((item) => (
            <Text key={item.code} className={cn('font-body text-xs leading-4', item.status === 'GOOD' ? mutedClass : textClass)}>
              - {item.code}: {item.status} ({item.checks.join(', ')})
            </Text>
          ))}
        </View>
        <View className="gap-2" style={{ width: 360 }}>
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Baseline lifecycle</Text>
          {baselines.length === 0 ? (
            <Text className={cn('font-body text-xs leading-4', mutedClass)}>- No mature baseline yet; analyzer will learn as history accumulates.</Text>
          ) : (
            baselines.map((baseline) => (
              <Text key={baseline.code} className={cn('font-body text-xs leading-4', textClass)}>
                - {baseline.code}: {baseline.maturity}, {baseline.sampleCount} samples
              </Text>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

export type MachineOverviewProps = {
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  // Total measurement points defined on the machine template (e.g. RAV's Motor
  // component lists 6) compared against the saved box-to-channel mappings.
  expectedPoints: number;
};

// Actual View -> Overview: the in-app analysis layer. It keeps the mapped live
// channel cards, then applies the analyzer-style RAV rules directly against the
// saved mappings so "missing" and "unavailable" never get treated as healthy.
export function MachineOverview({ mappedChannels, devices, cards, live, expectedPoints }: MachineOverviewProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const [samples, setSamples] = useState<SampleMap>({});

  const onSample = useCallback((id: string, value: number) => {
    setSamples((prev) => (prev[id] === value ? prev : { ...prev, [id]: value }));
  }, []);

  useEffect(() => {
    const activeIds = new Set(mappedChannels.map((mapped) => mapped.id));
    setSamples((prev) => {
      const next = Object.fromEntries(Object.entries(prev).filter(([id]) => activeIds.has(id)));
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [mappedChannels]);

  const effectiveSamples = useMemo<SampleMap>(() => {
    const next: SampleMap = { ...samples };
    for (const mapped of mappedChannels) {
      const value = usableMeasurementValue(liveMeasurementForChannel(mapped.channel, devices, cards, live));
      if (value !== undefined) next[mapped.id] = value;
    }
    return next;
  }, [cards, devices, live, mappedChannels, samples]);

  const hasGatewaySamples = useMemo(
    () => mappedChannels.some((mapped) => usableMeasurementValue(liveMeasurementForChannel(mapped.channel, devices, cards, live)) !== undefined),
    [cards, devices, live, mappedChannels],
  );

  const analysis = useMemo(() => analyseMachine(mappedChannels, effectiveSamples, expectedPoints), [effectiveSamples, expectedPoints, mappedChannels]);
  const deepAnalysis = useMemo(() => {
    const now = new Date().toISOString();
    const readings: AnalysisReading[] = mappedChannels.flatMap((mapped) => {
      const code = signalCodeFor(`${mapped.label} ${mapped.channel.label}`);
      const value = effectiveSamples[mapped.id];
      if (!code || value === undefined) return [];
      const measurement = liveMeasurementForChannel(mapped.channel, devices, cards, live);
      return [{
        code,
        value,
        unit: measurement?.unit ?? mapped.channel.unit,
        quality: measurement?.quality ?? 'GOOD',
        valid: measurement?.measurementValid ?? true,
        timestamp: measurement?.updatedAt ?? now,
        source: measurement ? 'gateway' as const : 'demo' as const,
      }];
    });
    return analyzeRotaryAirlock({ readings, now });
  }, [cards, devices, effectiveSamples, live, mappedChannels]);

  if (mappedChannels.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className={cn('font-body text-sm italic', mutedClass)}>
          No rack channels are mapped to this machine yet - link a box to a channel in Design mode.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 24 }}>
      <View className="gap-1">
        {mappedChannels.map((mapped) => (
          <SampleCollector key={`collector.${mapped.id}`} mapped={mapped} onSample={onSample} />
        ))}
        {expectedPoints > 0 && (
          <Text className={cn('font-body text-[11px]', mutedClass)}>
            {mappedChannels.length} of {expectedPoints} expected points mapped
          </Text>
        )}
        <Text className={cn('font-body-bold text-xl', textClass)}>Machine analysis</Text>
        <Text className={cn('font-body text-xs leading-5', mutedClass)}>
          Analyzer evidence is calculated from saved rack mappings, {hasGatewaySamples ? 'gateway telemetry' : 'demo live values'}, configured thresholds, and rotary-airlock operating rules.
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        <SummaryPanel
          title="Readiness"
          value={analysis.readinessLabel}
          detail={analysis.blockers.length > 0 ? analysis.blockers[0] : 'Mapped evidence is ready for live condition analysis.'}
          tone={analysis.readinessTone}
          meta={formatPercent(analysis.readinessPercent)}
        />
        <SummaryPanel
          title="Operating State"
          value={analysis.operatingState}
          detail={analysis.stateReason}
          tone={analysis.stateTone}
          meta={`${analysis.stateConfidence}%`}
        />
        <SummaryPanel
          title="Condition"
          value={analysis.conditionLabel}
          detail={analysis.priorityFinding?.title ?? 'No dominant fault pattern detected from the mapped live signals.'}
          tone={analysis.conditionTone}
          meta={`${analysis.conditionScore}/100`}
        />
      </View>

      <View className="flex-row flex-wrap gap-3">
        {analysis.derived.map((item) => (
          <AnalysisStat key={item.label} label={item.label} value={item.value} tone={item.tone} />
        ))}
      </View>

      <View className="flex-row flex-wrap gap-6">
        <BulletList title="Analysis limits" items={analysis.blockers} tone={analysis.readinessTone} />
        <BulletList title="Signal quality" items={analysis.weakSignals} tone={analysis.weakSignals.length > 0 ? 'warning' : 'live'} />
      </View>

      <DeepAnalyzerPanel analysis={deepAnalysis} />

      <View className="gap-3">
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Probable condition</Text>
        {analysis.findings.length === 0 ? (
          <View className={cn('rounded-xl border px-4 py-3', isDark ? 'bg-surface-darkpanel border-line-dark' : 'bg-surface-lightpanel border-line-light')}>
            <Text className={cn('font-body text-xs leading-5', mutedClass)}>
              No probable blockage, rubbing, bearing, overload, or drive-slip pattern is strong enough yet. This is not a clearance; it only means the mapped live evidence does not currently support a dominant diagnosis.
            </Text>
          </View>
        ) : (
          analysis.findings.slice(0, 3).map((finding) => <FindingPanel key={finding.title} finding={finding} />)
        )}
      </View>

      {analysis.topChannels.length > 0 && (
        <View className="gap-3">
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Evidence ranking</Text>
          <View className="flex-row flex-wrap gap-2">
            {analysis.topChannels.slice(0, 6).map((signal) => {
              const tone: Tone = signal.level === 'critical' ? 'critical' : signal.level === 'warning' ? 'warning' : signal.position > 0.8 ? 'info' : 'live';
              return (
                <View
                  key={signal.mapped.id}
                  className={cn('flex-row items-center gap-2 rounded-lg border px-2.5 py-1.5', isDark ? 'border-line-dark' : 'border-line-light')}
                >
                  <Text className={cn('font-mono text-[10px]', mutedClass)}>{signal.mapped.channel.code}</Text>
                  <Text numberOfLines={1} className={cn('font-body text-[11px]', textClass)} style={{ maxWidth: 170 }}>
                    {signal.mapped.label}
                  </Text>
                  <Text style={{ color: TONE_COLOUR[tone] }} className="font-mono text-[11px] font-bold">
                    {formatValue(signal.value, signal.mapped.channel.letter, signal.mapped.channel.unit)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {SECTION_ORDER.map((letter) => {
        const inSection = mappedChannels.filter((m) => m.channel.letter === letter);
        if (inSection.length === 0) return null;

        return (
          <View key={letter} className="gap-3">
            <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>{SECTION_FOR_LETTER[letter]}</Text>
            <View className="flex-row flex-wrap gap-3">
              {inSection.map((mapped) => (
                <OverviewCard key={mapped.id} mapped={mapped} value={effectiveSamples[mapped.id]} />
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
