import { useMemo } from 'react';

import {
  DEFAULT_ISO_GROUP,
  isoZone,
  KIND_FOR_LETTER,
  levelFor,
  pointHealth,
  NO_PROGNOSIS,
  projectToDanger,
  resolveThresholds,
  sensorState,
  type ConditionLevel,
  type IsoGroup,
  type IsoZone,
  type MeasurementBand,
  type Prognosis,
  type ResolvedThresholds,
  type SensorState,
} from '../../../../lib/condition';
import type { DeviceNode } from '../../../../lib/devices';
import type { LiveState } from '../../../../lib/liveTelemetry';
import type { MeasurementPointKind } from '../../../../lib/machines';
import { channelEngineeringRange, type CardNode } from '../../../../lib/rack';
import { channelNumberFor, useMappedChannelReading } from '../../../../lib/liveChannelValue';
import { LIVE_RANGE_FOR_LETTER, type LiveKindLetter } from '../liveValue';
import type { MappedChannel } from '../RackOccupancyView';
import { conditionHistoryStorageKey, useConditionHistory, type ConditionHistory, type ConditionSource } from './useConditionHistory';

// Everything the overview knows about one measurement point, assembled in one
// place so the cards, the component roll-up, the diagnosis banner and the alarm
// summary are all reading the same numbers rather than each recomputing a
// slightly different version of them.
export type PointCondition = {
  id: string;
  code: string;
  label: string;
  kind: MeasurementPointKind | 'Unknown';
  letter: LiveKindLetter;
  unit: string;
  // Null until the gateway has reported this channel. There is no generator
  // behind this page, so "no reading" is a real state rather than a zero, and
  // every consumer has to decide what to show for it instead of quietly
  // averaging a number nobody measured.
  value: number | null;
  band: MeasurementBand;
  thresholds: ResolvedThresholds;
  level: ConditionLevel;
  // The measurement condition combined with reachability. `level` is what the
  // reading says; `state` is what the tile should show, because a stale value
  // from an unreachable rack must not be presented as a live one.
  state: SensorState;
  online: boolean;
  // Null alongside a null value: a point with no reading has no health, and
  // scoring it as 100 would let unreported channels flatter the machine.
  health: number | null;
  prognosis: Prognosis;
  samples: number[];
  windowHours: number;
  // Measured spacing of this channel's own samples, which is what any slope over
  // them has to be divided by. Carried here so a trend drawn from this buffer
  // cannot be labelled with a different cadence than it was fitted at.
  sampleIntervalHours: number;
  // Change across the whole buffer as a fraction of where it started, which is
  // the "up 38% over two days" line an operator actually reacts to.
  changeFraction: number;
  rising: boolean;
  // ISO 10816-3 zone, and only for velocity readings in mm/s RMS — the standard
  // is defined in those units, so applying its boundaries to acceleration or to
  // in/s would be a units error wearing a standard's name.
  isoZone: IsoZone | null;
  componentId: string | null;
  // Whether the feed behind this point is current, ageing, or has never
  // reported. Carried on the condition itself so no screen has to guess.
  source: ConditionSource;
};

function isVelocityInMillimetresPerSecond(letter: LiveKindLetter, unit: string) {
  return letter === 'V' && unit.replace(/\s/g, '').toLowerCase() === 'mm/s';
}

function predictionSseDemoSamples(start: number, end: number, count = 121): number[] {
  const span = end - start;
  return Array.from({ length: count }, (_, index) => {
    const t = count <= 1 ? 1 : index / (count - 1);
    const accelerated = t < 0.45 ? t * 0.35 : 0.1575 + ((t - 0.45) / 0.55) ** 1.55 * 0.8425;
    const ripple = index === 0 || index === count - 1 ? 0 : (Math.sin(index * 0.47) * 0.018 + Math.sin(index * 0.13 + 1.7) * 0.012) * span;
    const value = start + span * accelerated + ripple;
    return Math.min(end, Math.max(start, value));
  });
}

function configuredSimulationValue(mapped: MappedChannel, card: CardNode | null, channelIndex: number): number | null {
  const simulation = card?.simulation?.[channelIndex];
  if (!simulation?.enabled) return null;
  if (typeof simulation.manualValue === 'number' && Number.isFinite(simulation.manualValue)) return simulation.manualValue;
  if (typeof mapped.channel.healthyValue === 'number' && Number.isFinite(mapped.channel.healthyValue)) return mapped.channel.healthyValue;
  return null;
}

export function usePointCondition(
  mapped: MappedChannel,
  machineId: string,
  options?: {
    isoGroup?: IsoGroup;
    componentId?: string | null;
    online?: boolean;
    // The device list is what makes a channel addressable on the measurement
    // bus, and the card is what declares its engineering range and limits.
    // Without them this hook cannot resolve the channel at all, so every caller
    // that has them must pass them.
    devices?: DeviceNode[];
    cards?: CardNode[];
    // The live telemetry the host already holds. A rack that carries no
    // real gateway/rack ids is unreachable on the measurement bus and is only
    // resolvable through this, which is how the canvas reads it.
    live?: LiveState;
    machineName?: string;
  },
): PointCondition {
  const { channel, label } = mapped;
  const isoGroup = options?.isoGroup ?? DEFAULT_ISO_GROUP;
  const componentId = options?.componentId ?? null;
  const online = options?.online ?? true;
  const devices = options?.devices;
  const cards = options?.cards;
  const live = options?.live;

  const noDevices = useMemo<DeviceNode[]>(() => [], []);
  const noCards = useMemo<CardNode[]>(() => [], []);

  const history = useConditionHistory({
    channel,
    devices: devices ?? noDevices,
    cards: cards ?? noCards,
    live,
    key: conditionHistoryStorageKey(machineId, mapped.id),
  });
  const reading = useMappedChannelReading(channel, devices ?? noDevices, cards ?? noCards, live);

  // The card behind this channel, and which of its channels this is — a card
  // carries one signal definition per channel, so the index matters.
  const card = useMemo(
    () => cards?.find((c) => c.deviceId === channel.rackId && c.slot === channel.slot) ?? null,
    [cards, channel.rackId, channel.slot],
  );
  const channelIndex = channelNumberFor(channel) - 1;

  return useMemo(
    () =>
      derivePointCondition({
        machineId,
        machineName: options?.machineName,
        mapped,
        card,
        channelIndex,
        history,
        reading,
        isoGroup,
        componentId,
        online,
        label,
      }),
    [machineId, options?.machineName, mapped, card, channelIndex, history, reading, isoGroup, componentId, online, label],
  );
}

// The whole derivation, with the hooks lifted out: everything above this line
// only resolves the card, the reading and the buffer, and everything below turns
// those into the condition every screen reads. Kept separate so the demo
// scenario checks can drive the exact same code the console runs, rather than a
// re-implementation of it that could agree with the page while both are wrong.
export type DerivePointConditionInput = {
  machineId?: string;
  machineName?: string;
  mapped: MappedChannel;
  // The card behind the channel and which of its channels this is; null when the
  // caller has no card list, in which case the letter's display band is used.
  card: CardNode | null;
  channelIndex: number;
  history: ConditionHistory;
  reading: { value: number | null; status: ConditionSource };
  isoGroup?: IsoGroup;
  componentId?: string | null;
  online?: boolean;
  // Defaults to the mapped channel's own label, which is what the canvas shows.
  label?: string;
};

function hasPredictionSseDemoWords(value?: string): boolean {
  const words = new Set((value ?? '').toLocaleLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  return words.has('sse') && words.has('prediction') && words.has('demo');
}

function isPredictionSseDemoMachine(input: Pick<DerivePointConditionInput, 'machineId' | 'machineName'>): boolean {
  return hasPredictionSseDemoWords(input.machineName) || hasPredictionSseDemoWords(input.machineId);
}

export function derivePointCondition(input: DerivePointConditionInput): PointCondition {
  const { mapped, card, channelIndex, history, reading } = input;
  const { channel } = mapped;
  const isoGroup = input.isoGroup ?? DEFAULT_ISO_GROUP;
  const componentId = input.componentId ?? null;
  const online = input.online ?? true;
  const label = input.label ?? mapped.label;

  {
    const fallback = LIVE_RANGE_FOR_LETTER[channel.letter];
    // The range this channel is actually measured against, resolved with the
    // same precedence listChannels uses for its unit and limits. Decimals stay
    // with the letter: how precisely to print a reading is a display choice, and
    // a 4-20 mA range says nothing about it.
    const configured = card ? channelEngineeringRange(card, channelIndex) : null;
    const band = configured ? { ...configured, decimals: fallback.decimals } : fallback;
    const simulation = card?.simulation?.[channelIndex];
    const configuredValue = configuredSimulationValue(mapped, card, channelIndex);
    const configuredPredictiveValue =
      simulation?.behaviour === 'Predictive Drift' && typeof simulation.manualValue === 'number' && Number.isFinite(simulation.manualValue)
        ? simulation.manualValue
        : null;
    const liveValue = typeof reading.value === 'number' && Number.isFinite(reading.value) ? reading.value : null;
    const analysisValue = configuredPredictiveValue ?? liveValue ?? configuredValue;
    const thresholds = resolveThresholds(channel, band);
    const predictionSseDemoHistory =
      configuredPredictiveValue !== null && isPredictionSseDemoMachine(input)
        ? predictionSseDemoSamples(thresholds.healthy ?? configuredPredictiveValue, configuredPredictiveValue)
        : null;
    const samples =
      predictionSseDemoHistory ??
      (analysisValue !== null && history.samples[history.samples.length - 1] !== analysisValue
        ? [...history.samples, analysisValue]
        : history.samples);
    const hasReading = samples.length > 0 && Number.isFinite(samples[samples.length - 1]);
    const value = hasReading ? samples[samples.length - 1] : null;
    const first = samples[0];
    const sampleIntervalHours = predictionSseDemoHistory ? 24 : history.sampleIntervalHours;
    const windowHours = predictionSseDemoHistory ? (predictionSseDemoHistory.length - 1) * sampleIntervalHours : history.windowHours;
    // Nothing is judged without a reading. A channel the gateway has not
    // reported is not "normal" — it is unknown, and the difference is the whole
    // point of keeping `source` on the condition.
    const level = value === null ? 'normal' : levelFor(value, thresholds);
    const prognosis = hasReading
      ? projectToDanger(samples, thresholds, sampleIntervalHours)
      : NO_PROGNOSIS;

    return {
      id: mapped.id,
      code: mapped.templatePointCode ?? channel.code,
      label,
      kind: channel.kind ?? KIND_FOR_LETTER[channel.letter],
      letter: channel.letter,
      unit: channel.unit,
      value,
      band,
      thresholds,
      level,
      // A channel with no reading is unreachable as far as this page is
      // concerned, which is the state the tiles already render as OFFLINE.
      state: sensorState(level, online && hasReading),
      online: online && hasReading,
      health: value === null ? null : pointHealth(value, thresholds, band),
      prognosis,
      samples,
      windowHours,
      sampleIntervalHours,
      // Guard the divisor: a reading legitimately sitting at zero would make the
      // percentage meaningless rather than infinite.
      changeFraction:
        value !== null && samples.length > 1 && Math.abs(first) > 1e-6 ? (value - first) / Math.abs(first) : 0,
      rising: prognosis.slopePerDay > 0 && prognosis.confidence !== 'none',
      isoZone:
        value !== null && isVelocityInMillimetresPerSecond(channel.letter, channel.unit)
          ? isoZone(value, isoGroup)
          : null,
      componentId,
      source: liveValue !== null ? reading.status : history.source,
    };
  }
}
