import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { OverviewAnalysisInput, OverviewHistoryPoint } from '../../../lib/analysis/overviewSnapshot';
import { analyzeRotaryAirlock, type AnalysisReading, type AnalysisSignalCode, type RotaryAirlockAnalysisResult } from '../../../lib/analysis/rotaryAirlockAnalyzer';
import { cn } from '../../../lib/cn';
import { deviceWithGatewayConnectionState, type DeviceNode } from '../../../lib/devices';
import { latestMeasurementForChannel, type LiveMeasurement, type LiveState } from '../../../lib/liveTelemetry';
import type { CardNode, ChannelRef } from '../../../lib/rack';
import { apiFetch } from '../../../src/lib/apiClient';
import { LIVE_RANGE_FOR_LETTER, useLiveValue, type LiveKindLetter } from './liveValue';
import type { MappedChannel } from './RackOccupancyView';

const LIVE_COLOUR = '#3FB950';
const WARNING_COLOUR = '#F2A93B';
const CRITICAL_COLOUR = '#EF4444';
const INFO_COLOUR = '#58A6FF';
const MUTED_COLOUR = '#8B949E';
const ACCENT_COLOUR = '#C9A15C';

// How often the browser-side analysis is pushed to the server for durable
// history. Live values move continuously, so saving every render would flood the
// table; one row per interval keeps the trends readable.
const SAVE_INTERVAL_MS = 60_000;

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
type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

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

type DerivedMetrics = {
  vibrationSpread: number | null;
  rpmDeviationPercent: number | null;
  temperatureDelta: number | null;
  pressureDifferential: number | null;
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
  derived: { label: string; value: string; tone: Tone; detail: string; icon: IconName }[];
  metrics: DerivedMetrics;
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

function formatAgo(iso: string, nowMs: number) {
  const deltaS = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 1000));
  if (deltaS < 60) return `${deltaS}s ago`;
  if (deltaS < 3600) return `${Math.round(deltaS / 60)}m ago`;
  if (deltaS < 86_400) return `${Math.round(deltaS / 3600)}h ago`;
  return `${Math.round(deltaS / 86_400)}d ago`;
}

function formatDayLabel(iso: string) {
  return new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short' });
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
      detail: 'Essential signals mapped',
      icon: 'layers-triple-outline',
    },
    {
      label: 'Live samples',
      value: `${liveCount}/${mappedChannels.length}`,
      tone: liveCoverage < 1 ? 'warning' : 'live',
      detail: 'Recent samples received',
      icon: 'pulse',
    },
    ...(pressureSpread !== null
      ? [{
          label: 'Pressure differential',
          value: `${pressureSpread.toFixed(2)} ${maxPressure?.mapped.channel.unit ?? ''}`,
          tone: (pressureSpread > 2 ? 'warning' : 'live') as Tone,
          detail: 'Inlet to outlet spread',
          icon: 'gauge' as IconName,
        }]
      : []),
    ...(temperatureSpread !== null
      ? [{
          label: 'Bearing temp delta',
          value: `${temperatureSpread.toFixed(1)} ${maxTemperature?.mapped.channel.unit ?? ''}`,
          tone: (temperatureSpread > 12 ? 'warning' : 'live') as Tone,
          detail: 'DE to NDE difference',
          icon: 'thermometer' as IconName,
        }]
      : []),
    ...(vibrationSpread !== null
      ? [{
          label: 'Vibration spread',
          value: `${vibrationSpread.toFixed(2)} ${maxVibration?.mapped.channel.unit ?? ''}`,
          tone: (vibrationSpread > 1.6 ? 'warning' : 'live') as Tone,
          detail: 'Overall vibration range',
          icon: 'waveform' as IconName,
        }]
      : []),
    ...(speedDeviation !== null
      ? [{
          label: 'RPM deviation',
          value: formatPercent(speedDeviation * 100),
          tone: (speedDeviation > 0.015 ? 'warning' : 'live') as Tone,
          detail: 'From baseline expectation',
          icon: 'speedometer' as IconName,
        }]
      : []),
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
    metrics: {
      vibrationSpread,
      rpmDeviationPercent: speedDeviation === null ? null : speedDeviation * 100,
      temperatureDelta: temperatureSpread,
      pressureDifferential: pressureSpread,
    },
    findings: uniqueFindings,
    priorityFinding: uniqueFindings[0] ?? null,
    topChannels: [...signals].sort((a, b) => {
      const levelDelta = (b.level === 'critical' ? 2 : b.level === 'warning' ? 1 : 0) - (a.level === 'critical' ? 2 : a.level === 'warning' ? 1 : 0);
      return levelDelta || b.position - a.position;
    }),
  };
}

// --- presentation ----------------------------------------------------------

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isDark } = useAppTheme();
  return (
    <View
      className={cn(
        'rounded-2xl border px-4 py-3.5',
        isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel',
        className,
      )}
    >
      {children}
    </View>
  );
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  return (
    <View className="flex-row items-center justify-between">
      <Text className={cn('font-body-medium text-[11px] uppercase tracking-[1.6px]', mutedClass)}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button">
          <Text style={{ color: ACCENT_COLOUR }} className="font-body-medium text-[11px]">
            {action}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function StatusPanel({
  title,
  value,
  detail,
  tone,
  meta,
  icon,
  width,
}: {
  title: string;
  value: string;
  detail: string;
  tone: Tone;
  meta?: string;
  icon: IconName;
  width?: number;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const colour = TONE_COLOUR[tone];
  return (
    <View
      className={cn('min-w-[260px] flex-1 gap-2.5 rounded-2xl border px-4 py-3.5', isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel')}
      style={width ? { width } : undefined}
    >
      <View className="flex-row items-center gap-2.5">
        <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: `${colour}1F` }}>
          <MaterialCommunityIcons name={icon} size={19} color={colour} />
        </View>
        <Text className={cn('flex-1 font-body-medium text-[10px] uppercase tracking-[1.6px]', mutedClass)}>{title}</Text>
        {meta ? (
          <Text style={{ color: colour }} className="font-mono text-[11px] font-bold">
            {meta}
          </Text>
        ) : null}
      </View>
      <Text style={{ color: colour }} className="font-body-bold text-lg leading-6">
        {value}
      </Text>
      <Text className={cn('font-body text-[11px] leading-4', mutedClass)}>{detail}</Text>
    </View>
  );
}

function MetricTile({ label, value, detail, tone, icon }: { label: string; value: string; detail: string; tone: Tone; icon: IconName }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const colour = TONE_COLOUR[tone];
  return (
    <View
      className={cn('min-w-[180px] flex-1 gap-1.5 rounded-2xl border px-3.5 py-3', isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel')}
    >
      <View className="flex-row items-center gap-2">
        <MaterialCommunityIcons name={icon} size={15} color={colour} />
        <Text className={cn('flex-1 font-body-medium text-[10px] uppercase tracking-[1.4px]', mutedClass)}>{label}</Text>
      </View>
      <Text style={{ color: colour }} className="font-body-bold text-xl">
        {value}
      </Text>
      <Text className={cn('font-body text-[10px]', mutedClass)}>{detail}</Text>
    </View>
  );
}

// Machine health score: a 240° arc gauge over the frontend-calculated condition
// score, matching the reference overview layout.
function HealthGauge({ score, label, tone }: { score: number; label: string; tone: Tone }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const size = 168;
  const radius = 66;
  const centre = size / 2;
  const circumference = 2 * Math.PI * radius;
  const sweep = 0.72; // fraction of the circle drawn
  const arc = circumference * sweep;
  const colour = TONE_COLOUR[tone];

  return (
    <View className="items-center">
      <View style={{ width: size, height: size * 0.74 }}>
        <Svg width={size} height={size}>
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            stroke={isDark ? 'rgba(255,255,255,0.10)' : '#E9EDF3'}
            strokeWidth={14}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${arc} ${circumference}`}
            transform={`rotate(${90 + (1 - sweep) * 180} ${centre} ${centre})`}
          />
          <Circle
            cx={centre}
            cy={centre}
            r={radius}
            stroke={colour}
            strokeWidth={14}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${(arc * clamp(score, 0, 100)) / 100} ${circumference}`}
            transform={`rotate(${90 + (1 - sweep) * 180} ${centre} ${centre})`}
          />
          <SvgText x={centre} y={centre + 4} textAnchor="middle" fontSize={38} fontWeight="700" fill={isDark ? '#F5F5F5' : '#0A0A0A'}>
            {String(Math.round(score))}
          </SvgText>
          <SvgText x={centre} y={centre + 26} textAnchor="middle" fontSize={12} fill={isDark ? '#8A8A8A' : '#6B6B6B'}>
            /100
          </SvgText>
        </Svg>
      </View>
      <Text style={{ color: colour }} className="font-body-bold text-base">
        {label}
      </Text>
      <Text className={cn('font-body text-[11px]', score >= 88 ? mutedClass : textClass)}>
        {score >= 88 ? 'Continue monitoring' : score >= 72 ? 'Watch the flagged evidence' : 'Investigate the flagged evidence'}
      </Text>
    </View>
  );
}

function TrendChart({
  points,
  colour,
  suffix,
  height = 84,
}: {
  points: { at: string; value: number }[];
  colour: string;
  suffix?: string;
  height?: number;
}) {
  const { isDark } = useAppTheme();
  const width = 268;
  const padLeft = 30;
  const padBottom = 16;
  const plotWidth = width - padLeft - 8;
  const plotHeight = height - padBottom - 8;
  const values = points.map((point) => point.value);
  const max = values.length > 0 ? Math.max(...values) : 1;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const top = max === min ? max + 1 : max;
  const bottom = max === min ? Math.max(0, min - 1) : min;
  const spread = top - bottom || 1;
  const axis = isDark ? '#8A8A8A' : '#94A3B8';

  const coords = points.map((point, index) => {
    const x = padLeft + (points.length <= 1 ? plotWidth : (index / (points.length - 1)) * plotWidth);
    const y = 8 + plotHeight - ((point.value - bottom) / spread) * plotHeight;
    return { x, y };
  });
  const last = coords[coords.length - 1];

  return (
    <Svg width={width} height={height}>
      {[0, 0.5, 1].map((fraction) => {
        const y = 8 + plotHeight * fraction;
        return (
          <Line key={fraction} x1={padLeft} y1={y} x2={width - 8} y2={y} stroke={isDark ? 'rgba(255,255,255,0.07)' : '#EEF2F7'} strokeWidth={1} />
        );
      })}
      {[1, 0.5, 0].map((fraction, index) => (
        <SvgText key={index} x={padLeft - 6} y={12 + plotHeight * (1 - fraction)} textAnchor="end" fontSize={8} fill={axis}>
          {`${Math.round(bottom + spread * fraction)}${suffix ?? ''}`}
        </SvgText>
      ))}
      {coords.length > 1 ? (
        <Polyline
          points={coords.map((coord) => `${coord.x},${coord.y}`).join(' ')}
          fill="none"
          stroke={colour}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {last ? <Circle cx={last.x} cy={last.y} r={3.5} fill={colour} /> : null}
      {points.length > 1 ? (
        <>
          <SvgText x={padLeft} y={height - 3} fontSize={8} fill={axis}>
            {formatDayLabel(points[0].at)}
          </SvgText>
          <SvgText x={width - 8} y={height - 3} textAnchor="end" fontSize={8} fill={axis}>
            {formatDayLabel(points[points.length - 1].at)}
          </SvgText>
        </>
      ) : null}
    </Svg>
  );
}

function TrendPanel({
  title,
  points,
  colour,
  suffix,
  emptyHint,
}: {
  title: string;
  points: { at: string; value: number }[];
  colour: string;
  suffix?: string;
  emptyHint: string;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  return (
    <Panel>
      <SectionTitle title={title} />
      <View className="mt-2">
        {points.length === 0 ? (
          <Text className={cn('font-body text-[11px] leading-4', mutedClass)}>{emptyHint}</Text>
        ) : (
          <TrendChart points={points} colour={colour} suffix={suffix} />
        )}
      </View>
    </Panel>
  );
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
      className={cn('gap-1.5 rounded-2xl border px-3 py-2.5', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
      style={{ width: 200, borderColor: `${colour}55` }}
    >
      <View className="flex-row items-center justify-between">
        <Text style={{ color: colour }} className="font-body-bold text-sm">
          {channel.code}
        </Text>
        <View className={cn('rounded-full border px-1.5 py-0.5', lineClass)}>
          <Text className={cn('font-mono text-[10px]', mutedClass)}>{KIND_LABEL[channel.letter]}</Text>
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

function BulletList({ title, items, tone, emptyLabel }: { title: string; items: string[]; tone: Tone; emptyLabel: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  return (
    <Panel className="min-w-[260px] flex-1">
      <View className="flex-row items-center gap-2">
        <MaterialCommunityIcons
          name={items.length === 0 ? 'shield-check-outline' : 'alert-circle-outline'}
          size={15}
          color={items.length === 0 ? LIVE_COLOUR : TONE_COLOUR[tone]}
        />
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-[1.6px]', mutedClass)}>{title}</Text>
      </View>
      <View className="mt-2.5 gap-1.5">
        {items.length === 0 ? (
          <Text className={cn('font-body text-xs leading-4', mutedClass)}>{emptyLabel}</Text>
        ) : (
          items.map((item) => (
            <View key={item} className="flex-row gap-2">
              <Text style={{ color: TONE_COLOUR[tone] }} className="font-body-bold text-xs">
                •
              </Text>
              <Text className={cn('flex-1 font-body text-xs leading-4', textClass)}>{item}</Text>
            </View>
          ))
        )}
      </View>
    </Panel>
  );
}

function FindingPanel({ finding }: { finding: Finding }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const tone: Tone = finding.urgency === 'Critical' || finding.urgency === 'High' ? 'warning' : 'info';

  return (
    <Panel className="max-w-[720px] gap-3">
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
    </Panel>
  );
}

function DeepAnalyzerPanel({ analysis }: { analysis: RotaryAirlockAnalysisResult }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const anomalyTone: Tone =
    analysis.anomaly.severity === 'critical' || analysis.anomaly.severity === 'high'
      ? 'critical'
      : analysis.anomaly.severity === 'medium' || analysis.anomaly.severity === 'low'
        ? 'warning'
        : 'live';
  const maintenanceTone: Tone = analysis.maintenance.priority === 'critical' || analysis.maintenance.priority === 'high' ? 'critical' : analysis.maintenance.caseRequired ? 'warning' : 'live';
  const badQuality = analysis.quality.filter((item) => item.status === 'BAD' || item.status === 'DEGRADED');
  const baselines = analysis.baselines.filter((baseline) => baseline.maturity !== 'unavailable').slice(0, 4);

  return (
    <View className="gap-3">
      <SectionTitle title="Deep analyzer" />

      <View className="flex-row flex-wrap gap-3">
        <StatusPanel
          icon="radar"
          title="Anomaly"
          value={analysis.anomaly.severity === 'none' ? 'No active anomaly' : `${analysis.anomaly.severity} ${analysis.anomaly.state}`}
          detail={analysis.anomaly.contributors[0]?.description ?? analysis.anomaly.limitations[0] ?? 'Baseline comparison is quiet.'}
          tone={anomalyTone}
          meta={analysis.anomaly.score.toFixed(1)}
        />
        <StatusPanel
          icon="wrench-outline"
          title="Maintenance"
          value={analysis.maintenance.title}
          detail={analysis.maintenance.caseRequired ? analysis.maintenance.recommendedActions[0] : 'No maintenance case is required from current evidence.'}
          tone={maintenanceTone}
          meta={analysis.maintenance.priority}
        />
        <StatusPanel
          icon="clipboard-text-outline"
          title="Doctor report"
          value={analysis.doctorReport.summary}
          detail={analysis.doctorReport.nextChecks[0] ?? 'No immediate follow-up check.'}
          tone={maintenanceTone}
        />
      </View>

      <View className="flex-row flex-wrap gap-3">
        <Panel className="min-w-[320px] flex-1">
          <SectionTitle title="Signal quality engine" />
          <View className="mt-2 gap-1">
            {(badQuality.length > 0 ? badQuality : analysis.quality.slice(0, 3)).map((item) => (
              <Text key={item.code} className={cn('font-body text-xs leading-4', item.status === 'GOOD' ? mutedClass : textClass)}>
                - {item.code}: {item.status} ({item.checks.join(', ')})
              </Text>
            ))}
          </View>
        </Panel>
        <Panel className="min-w-[320px] flex-1">
          <SectionTitle title="Baseline lifecycle" />
          <View className="mt-2 gap-1">
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
        </Panel>
      </View>
    </View>
  );
}

function EvidenceRow({ rank, signal }: { rank: number; signal: SignalValue }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const tone: Tone = signal.level === 'critical' ? 'critical' : signal.level === 'warning' ? 'warning' : signal.position > 0.8 ? 'info' : 'live';
  return (
    <View
      className={cn('min-w-[190px] flex-1 flex-row items-center gap-2.5 rounded-2xl border px-3 py-2.5', isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel')}
    >
      <Text className={cn('font-mono text-[11px]', mutedClass)}>{rank}</Text>
      <View className="min-w-0 flex-1">
        <Text className={cn('font-body-bold text-xs', textClass)}>{signal.mapped.channel.code}</Text>
        <Text numberOfLines={1} className={cn('font-body text-[10px]', mutedClass)}>
          {signal.mapped.label}
        </Text>
        <Text style={{ color: TONE_COLOUR[tone] }} className="font-mono text-[11px] font-bold">
          {formatValue(signal.value, signal.mapped.channel.letter, signal.mapped.channel.unit)}
        </Text>
      </View>
    </View>
  );
}

function ActivityFeed({ history, nowMs }: { history: OverviewHistoryPoint[]; nowMs: number }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const entries = [...history]
    .reverse()
    .slice(0, 6)
    .map((point) => ({
      at: point.generatedAt,
      title: point.priorityFinding || `${point.conditionLabel} · ${point.operatingState}`,
      detail: `Health ${point.conditionScore}/100 · ${point.liveCount}/${point.mappedCount} channels reporting`,
      tone: (point.conditionScore < 45 ? 'critical' : point.conditionScore < 72 ? 'warning' : 'live') as Tone,
    }));

  return (
    <Panel>
      <SectionTitle title="Recent activity" />
      <View className="mt-2.5 gap-2.5">
        {entries.length === 0 ? (
          <Text className={cn('font-body text-[11px] leading-4', mutedClass)}>
            Saved analysis history will appear here once the first snapshot is stored.
          </Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.at} className="flex-row gap-2">
              <View className="mt-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: TONE_COLOUR[entry.tone] }} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={2} className={cn('font-body-medium text-[11px] leading-4', textClass)}>
                  {entry.title}
                </Text>
                <Text className={cn('font-body text-[10px]', mutedClass)}>
                  {entry.detail} · {formatAgo(entry.at, nowMs)}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </Panel>
  );
}

// --- durable persistence ---------------------------------------------------

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function useOverviewPersistence(machineId: string | undefined, build: () => OverviewAnalysisInput) {
  const [history, setHistory] = useState<OverviewHistoryPoint[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    if (!machineId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/analysis/machine/${encodeURIComponent(machineId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { overview?: OverviewHistoryPoint[] };
        if (!cancelled && Array.isArray(data.overview)) setHistory(data.overview);
      } catch {
        /* history is supplementary; the live analysis still renders */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [machineId]);

  const save = useCallback(async () => {
    if (!machineId) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      const res = await apiFetch(`/api/analysis/machine/${encodeURIComponent(machineId)}`, {
        method: 'POST',
        body: JSON.stringify(buildRef.current()),
      });
      const data = (await res.json()) as { overview?: OverviewHistoryPoint[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Could not save the analysis.');
      if (Array.isArray(data.overview)) setHistory(data.overview);
      setSavedAt(new Date().toISOString());
      setSaveState('saved');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the analysis.');
      setSaveState('error');
    }
  }, [machineId]);

  // Autosave on a fixed cadence so history accrues while the tab stays open.
  useEffect(() => {
    if (!machineId) return;
    const id = setInterval(() => void save(), SAVE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [machineId, save]);

  return { history, save, saveState, savedAt, saveError };
}

export type MachineOverviewProps = {
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  // Total measurement points defined on the machine template (e.g. RAV's Motor
  // component lists 6) compared against the saved box-to-channel mappings.
  expectedPoints: number;
  machineId?: string;
  machineTemplate?: string;
};

// Actual View -> Overview: the in-app analysis layer. The analysis is computed
// here in the browser from the saved rack mappings and the live signals, then
// posted to /api/analysis/machine/[id] so the durable history, trends and
// maintenance records are stored server-side.
export function MachineOverview({ mappedChannels, devices, cards, live, expectedPoints, machineId, machineTemplate }: MachineOverviewProps) {
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const stacked = width < 1180;
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const [samples, setSamples] = useState<SampleMap>({});
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  const buildPayload = useCallback(
    (): OverviewAnalysisInput => ({
      machineTemplate: machineTemplate ?? '',
      generatedAt: new Date().toISOString(),
      readinessPercent: analysis.readinessPercent,
      readinessLabel: analysis.readinessLabel,
      conditionScore: analysis.conditionScore,
      conditionLabel: analysis.conditionLabel,
      operatingState: analysis.operatingState,
      stateConfidence: analysis.stateConfidence,
      mappedCount: mappedChannels.length,
      expectedPoints,
      liveCount: analysis.liveCount,
      vibrationSpread: analysis.metrics.vibrationSpread,
      rpmDeviationPercent: analysis.metrics.rpmDeviationPercent,
      temperatureDelta: analysis.metrics.temperatureDelta,
      pressureDifferential: analysis.metrics.pressureDifferential,
      priorityFinding: analysis.priorityFinding?.title ?? '',
      blockers: analysis.blockers,
      weakSignals: analysis.weakSignals,
      findings: analysis.findings,
      topEvidence: analysis.topChannels.slice(0, 12).map((signal) => ({
        code: signal.mapped.channel.code,
        label: signal.mapped.label,
        value: signal.value,
        unit: signal.mapped.channel.unit,
        level: signal.level,
      })),
      deepAnalysis,
    }),
    [analysis, deepAnalysis, expectedPoints, machineTemplate, mappedChannels.length],
  );

  const { history, save, saveState, savedAt, saveError } = useOverviewPersistence(machineId, buildPayload);

  const healthTrend = useMemo(() => history.map((point) => ({ at: point.generatedAt, value: point.conditionScore })), [history]);
  const vibrationTrend = useMemo(
    () => history.filter((point) => point.vibrationSpread !== null).map((point) => ({ at: point.generatedAt, value: point.vibrationSpread as number })),
    [history],
  );
  const rpmTrend = useMemo(
    () => history.filter((point) => point.rpmDeviationPercent !== null).map((point) => ({ at: point.generatedAt, value: point.rpmDeviationPercent as number })),
    [history],
  );

  const healthChecks = useMemo(
    () => [
      {
        label: analysis.findings.length === 0 ? 'Stable trends' : 'Fault pattern detected',
        detail: analysis.priorityFinding?.title ?? 'No critical deviation',
        tone: (analysis.findings.length === 0 ? 'live' : 'warning') as Tone,
      },
      {
        label: analysis.weakSignals.length === 0 ? 'Signals healthy' : 'Signals outside limits',
        detail: analysis.weakSignals[0] ?? 'All within quality range',
        tone: (analysis.weakSignals.length === 0 ? 'live' : 'warning') as Tone,
      },
      {
        label: analysis.readinessPercent >= 100 ? 'Evidence strong' : 'Evidence partial',
        detail: expectedPoints > 0 ? `${mappedChannels.length}/${expectedPoints} mapped evidence` : `${mappedChannels.length} mapped points`,
        tone: analysis.readinessTone,
      },
    ],
    [analysis, expectedPoints, mappedChannels.length],
  );

  if (mappedChannels.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className={cn('font-body text-sm italic', mutedClass)}>
          No rack channels are mapped to this machine yet - link a box to a channel in Design mode.
        </Text>
      </View>
    );
  }

  const saveLabel =
    saveState === 'saving' ? 'Saving analysis...' : saveState === 'error' ? 'Retry save' : savedAt ? `Saved ${formatAgo(savedAt, nowMs)}` : 'Save analysis';

  const rightColumn = (
    <View className="gap-3" style={stacked ? undefined : { width: 316 }}>
      <Panel>
        <SectionTitle title="Machine health score" />
        <View className="mt-2 flex-row items-center gap-3">
          <HealthGauge score={analysis.conditionScore} label={analysis.conditionLabel} tone={analysis.conditionTone} />
          <View className="min-w-0 flex-1 gap-2.5">
            {healthChecks.map((check) => (
              <View key={check.label} className="flex-row gap-2">
                <MaterialCommunityIcons name="check-circle-outline" size={14} color={TONE_COLOUR[check.tone]} />
                <View className="min-w-0 flex-1">
                  <Text className={cn('font-body-medium text-[11px]', textClass)}>{check.label}</Text>
                  <Text numberOfLines={2} className={cn('font-body text-[10px] leading-3.5', mutedClass)}>
                    {check.detail}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </Panel>

      <TrendPanel
        title="Health trend"
        points={healthTrend}
        colour={INFO_COLOUR}
        emptyHint="Saved health snapshots build this trend; the first snapshot is stored automatically."
      />
      <TrendPanel title="Vibration spread trend" points={vibrationTrend} colour={WARNING_COLOUR} emptyHint="No vibration spread has been saved yet." />
      <TrendPanel title="RPM deviation trend" points={rpmTrend} colour="#A78BFA" suffix="%" emptyHint="No RPM deviation has been saved yet." />
      <ActivityFeed history={history} nowMs={nowMs} />
    </View>
  );

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 16 }}>
      {mappedChannels.map((mapped) => (
        <SampleCollector key={`collector.${mapped.id}`} mapped={mapped} onSample={onSample} />
      ))}

      <View className="flex-row flex-wrap items-end justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text className={cn('font-body-bold text-2xl', textClass)}>Machine analysis</Text>
            <MaterialCommunityIcons name="shimmer" size={17} color={ACCENT_COLOUR} />
          </View>
          <Text className={cn('font-body text-xs leading-5', mutedClass)}>
            Calculated in this view from saved rack mappings, {hasGatewaySamples ? 'gateway telemetry' : 'demo live values'}, configured thresholds and
            rotary-airlock operating rules, then saved to the analysis history.
          </Text>
          {expectedPoints > 0 && (
            <Text className={cn('font-body text-[11px]', mutedClass)}>
              {mappedChannels.length} of {expectedPoints} expected points mapped
            </Text>
          )}
          {saveError ? (
            <Text style={{ color: CRITICAL_COLOUR }} className="font-body text-[11px]">
              {saveError}
            </Text>
          ) : null}
        </View>
        {machineId ? (
          <Pressable
            onPress={() => void save()}
            disabled={saveState === 'saving'}
            accessibilityRole="button"
            className={cn('flex-row items-center gap-2 rounded-full border px-3.5 py-2', isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel')}
            style={{ opacity: saveState === 'saving' ? 0.6 : 1 }}
          >
            <MaterialCommunityIcons
              name={saveState === 'error' ? 'alert-circle-outline' : saveState === 'saving' ? 'progress-upload' : 'content-save-outline'}
              size={15}
              color={saveState === 'error' ? CRITICAL_COLOUR : ACCENT_COLOUR}
            />
            <Text className={cn('font-body-medium text-[11px]', textClass)}>{saveLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      <View className={cn('gap-3', stacked ? 'flex-col' : 'flex-row')}>
        <View className="min-w-0 flex-1 gap-3">
          <View className="flex-row flex-wrap gap-3">
            <StatusPanel
              icon="check-decagram-outline"
              title="Readiness"
              value={analysis.readinessLabel}
              detail={analysis.blockers.length > 0 ? analysis.blockers[0] : 'Mapped evidence is ready for live condition analysis.'}
              tone={analysis.readinessTone}
              meta={formatPercent(analysis.readinessPercent)}
            />
            <StatusPanel
              icon="help-circle-outline"
              title="Operating state"
              value={analysis.operatingState}
              detail={analysis.stateReason}
              tone={analysis.stateTone}
              meta={`${analysis.stateConfidence}%`}
            />
            <StatusPanel
              icon="eye-outline"
              title="Condition"
              value={analysis.conditionLabel}
              detail={analysis.priorityFinding?.title ?? 'No dominant fault pattern detected from the mapped live signals.'}
              tone={analysis.conditionTone}
              meta={`${analysis.conditionScore}/100`}
            />
          </View>

          <View className="flex-row flex-wrap gap-3">
            {analysis.derived.map((item) => (
              <MetricTile key={item.label} label={item.label} value={item.value} detail={item.detail} tone={item.tone} icon={item.icon} />
            ))}
          </View>

          <View className="flex-row flex-wrap gap-3">
            <BulletList
              title="Analysis limits"
              items={analysis.blockers}
              tone={analysis.readinessTone}
              emptyLabel="No mapping or sampling gaps limit this analysis."
            />
            <BulletList
              title="Signal quality"
              items={analysis.weakSignals}
              tone={analysis.weakSignals.length > 0 ? 'warning' : 'live'}
              emptyLabel="No issues detected from mapped live evidence. All signals within acceptable quality range."
            />
          </View>

          <DeepAnalyzerPanel analysis={deepAnalysis} />

          <View className="gap-3">
            <SectionTitle title="Probable condition" />
            {analysis.findings.length === 0 ? (
              <Panel>
                <Text className={cn('font-body text-xs leading-5', mutedClass)}>
                  No probable blockage, rubbing, bearing, overload, or drive-slip pattern is strong enough yet. This is not a clearance; it only means the
                  mapped live evidence does not currently support a dominant diagnosis.
                </Text>
              </Panel>
            ) : (
              analysis.findings.slice(0, 3).map((finding) => <FindingPanel key={finding.title} finding={finding} />)
            )}
          </View>

          {analysis.topChannels.length > 0 && (
            <View className="gap-3">
              <SectionTitle
                title="Top evidence ranking"
                action={showAllEvidence ? 'Show less' : 'View all'}
                onAction={() => setShowAllEvidence((value) => !value)}
              />
              <View className="flex-row flex-wrap gap-2.5">
                {(showAllEvidence ? analysis.topChannels : analysis.topChannels.slice(0, 6)).map((signal, index) => (
                  <EvidenceRow key={signal.mapped.id} rank={index + 1} signal={signal} />
                ))}
              </View>
            </View>
          )}

          {SECTION_ORDER.map((letter) => {
            const inSection = mappedChannels.filter((m) => m.channel.letter === letter);
            if (inSection.length === 0) return null;
            const expanded = expandedSections[letter] ?? false;
            const visible = expanded ? inSection : inSection.slice(0, 4);

            return (
              <View key={letter} className="gap-3">
                <SectionTitle
                  title={SECTION_FOR_LETTER[letter] ?? KIND_LABEL[letter]}
                  action={inSection.length > 4 ? (expanded ? 'Show less' : 'View all') : undefined}
                  onAction={inSection.length > 4 ? () => setExpandedSections((prev) => ({ ...prev, [letter]: !expanded })) : undefined}
                />
                <View className="flex-row flex-wrap gap-3">
                  {visible.map((mapped) => (
                    <OverviewCard key={mapped.id} mapped={mapped} value={effectiveSamples[mapped.id]} />
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        {rightColumn}
      </View>
    </ScrollView>
  );
}
