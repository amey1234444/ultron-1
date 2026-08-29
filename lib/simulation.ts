// Simulation Mode — a virtual Ultron gateway.
//
// A simulated gateway/rack/channel is stored in the ordinary workspace
// hierarchy (DeviceNode / CardNode), and the generator publishes the same
// `ultron.rack.telemetry` payload a real Communication Controller publishes.
// Those payloads are turned into live frames by `buildLiveFrame()` — the exact
// function the MQTT ingest path and the browser broker path use — so nothing
// downstream (device status, rack faceplate, machine points, alarm logic,
// analysis) needs to know whether a channel is physical or simulated.
//
// The only thing that differs from real hardware is where the bytes come from.

import { composeIp, ipPrefixFor, isValidIp, type DeviceNode } from './devices';
import { buildLiveFrame, type FrameEnvelope } from './liveFrame';
import type { LiveFrame } from './liveTelemetry';
import {
  channelAlarmLimits,
  channelCountForCardType,
  decimalsForPrecision,
  derivedChannelRangeFor,
  normalizeChannelConfig,
  precisionForDecimals,
  type CardConfig,
  type CardNode,
  type CardType,
  type ChannelCommonConfig,
  type VibrationConfig,
} from './rack';

const DEFAULT_SAMPLES_PER_SECOND = 1;

// Card families the simulator can stand in for. Kinds map onto the real card
// types, so a simulated channel occupies a rack slot exactly like its physical
// counterpart and inherits that card's channel count.
export const SIMULATED_CHANNEL_KINDS = [
  'Vibration',
  'RTD / Temperature',
  'Universal Voltage / Current',
  'Pressure',
  'Power',
  'Level',
  'Process Value',
  'Speed / RPM',
] as const;
export type SimulatedChannelKind = (typeof SIMULATED_CHANNEL_KINDS)[number];

export function cardTypeForKind(kind: SimulatedChannelKind): CardType {
  switch (kind) {
    case 'Vibration':
      return 'Vibration Card';
    case 'Speed / RPM':
      return 'Speed Card';
    case 'RTD / Temperature':
      return 'RTD Card';
    case 'Universal Voltage / Current':
    case 'Pressure':
    case 'Power':
    case 'Level':
      return 'Universal V/I Card';
    case 'Process Value':
      return 'Process Card';
  }
}

export function kindsForCardType(type: CardType): SimulatedChannelKind[] {
  return SIMULATED_CHANNEL_KINDS.filter((kind) => cardTypeForKind(kind) === type);
}

export function defaultKindForCardType(type: CardType): SimulatedChannelKind {
  return kindsForCardType(type)[0] ?? 'Vibration';
}

// How the generated value moves. "Steady" and the drift/cycle behaviours stay
// strictly inside the configured min/max. The Ramp/Spike behaviours are
// deliberate fault injection: they drive the value past the alert or danger
// limit so the alarm, dashboard and analysis path can actually be exercised
// with a narrow operating range configured.
export const SIMULATION_BEHAVIOURS = [
  'Manual',
  'Steady',
  'Drift Up',
  'Drift Down',
  'Cycle',
  'Predictive Drift',
  'Ramp To Alert',
  'Ramp To Danger',
  'Spikes',
] as const;
export type SimulationBehaviour = (typeof SIMULATION_BEHAVIOURS)[number];

export function isFaultInjection(behaviour: SimulationBehaviour): boolean {
  return behaviour === 'Predictive Drift' || behaviour === 'Ramp To Alert' || behaviour === 'Ramp To Danger' || behaviour === 'Spikes';
}

/**
 * `Manual` is the operator-driven behaviour: the channel publishes around the
 * value on its knob, with only a tiny deterministic dither. That keeps manual
 * simulation useful for fixed setpoints without looking like a frozen sensor.
 */
export function isManual(behaviour: SimulationBehaviour): boolean {
  return behaviour === 'Manual';
}

export type SimulatedChannel = {
  enabled: boolean;
  kind: SimulatedChannelKind;
  unit: string;
  // Hard bounds of generated values — a non-fault behaviour never leaves these.
  min: number;
  max: number;
  healthyValue: number | null;
  alertLimit: number | null;
  dangerLimit: number | null;
  samplesPerSecond: number;
  behaviour: SimulationBehaviour;
  decimals: number;
  /**
   * The exact value the channel publishes while `behaviour` is `Manual` — what
   * the configuration page's rotary knob writes.
   *
   * Null means "never set", and the channel falls back to the centre of its
   * declared normal band (or of its range). Stored rather than derived so a
   * saved rack reopens on the value the commissioning engineer dialled in.
   */
  manualValue: number | null;
};

export type SimulatedChannelValidationErrors = Partial<
  Record<
    | 'channelName'
    | 'min'
    | 'max'
    | 'samplesPerSecond'
    | 'decimals'
    | 'alertLimit'
    | 'dangerLimit'
    | 'manualValue',
    string
  >
>;

/** Shared save-time and field-level validation for the canonical signal form. */
export function validateSimulatedChannel(channel: SimulatedChannel, channelName: string): SimulatedChannelValidationErrors {
  const errors: SimulatedChannelValidationErrors = {};
  if (!channelName.trim()) errors.channelName = 'Enter a channel name.';

  if (!Number.isFinite(channel.min)) errors.min = 'Enter a valid minimum value.';
  if (!Number.isFinite(channel.max)) errors.max = 'Enter a valid maximum value.';
  if (Number.isFinite(channel.min) && Number.isFinite(channel.max) && channel.max <= channel.min) {
    errors.max = 'Maximum must be greater than minimum.';
  }

  if (!Number.isFinite(channel.samplesPerSecond) || channel.samplesPerSecond < 0.1 || channel.samplesPerSecond > 50) {
    errors.samplesPerSecond = 'Use a sampling rate from 0.1 to 50 samples/second.';
  }
  if (!Number.isInteger(channel.decimals) || channel.decimals < 0 || channel.decimals > 6) {
    errors.decimals = 'Use a whole number from 0 to 6.';
  }

  if (channel.alertLimit !== null && !Number.isFinite(channel.alertLimit)) errors.alertLimit = 'Enter a valid number or leave blank.';
  if (channel.dangerLimit !== null && !Number.isFinite(channel.dangerLimit)) errors.dangerLimit = 'Enter a valid number or leave blank.';
  if (
    channel.alertLimit !== null &&
    channel.dangerLimit !== null &&
    Number.isFinite(channel.alertLimit) &&
    Number.isFinite(channel.dangerLimit) &&
    channel.dangerLimit <= channel.alertLimit
  ) {
    errors.dangerLimit = 'Critical limit must be greater than warning limit.';
  }

  // Only enforced for Manual: every other behaviour ignores the stored knob
  // position, so a stale one must not block saving a drifting channel.
  if (isManual(channel.behaviour)) {
    if (channel.manualValue === null || !Number.isFinite(channel.manualValue)) {
      errors.manualValue = 'Set the channel value.';
    } else if (
      Number.isFinite(channel.min) &&
      Number.isFinite(channel.max) &&
      channel.max > channel.min &&
      (channel.manualValue < channel.min || channel.manualValue > channel.max)
    ) {
      errors.manualValue = 'Channel value must be inside the engineering range.';
    }
  }

  return errors;
}

type KindDefaults = Omit<SimulatedChannel, 'enabled' | 'kind' | 'behaviour' | 'manualValue'> & { sensor: string };

const KIND_DEFAULTS: Record<SimulatedChannelKind, KindDefaults> = {
  Vibration: {
    unit: 'mm/s',
    min: 1.2,
    max: 4.5,
    healthyValue: 1.5,
    alertLimit: 5,
    dangerLimit: 7,
    samplesPerSecond: DEFAULT_SAMPLES_PER_SECOND,
    decimals: 2,
    sensor: 'Vibration',
  },
  'RTD / Temperature': {
    unit: '°C',
    min: 45,
    max: 72,
    healthyValue: 52,
    alertLimit: 85,
    dangerLimit: 95,
    samplesPerSecond: 1,
    decimals: 1,
    sensor: 'RTD',
  },
  'Universal Voltage / Current': {
    unit: 'mA',
    min: 0,
    max: 20,
    healthyValue: 12,
    alertLimit: 18,
    dangerLimit: 20,
    samplesPerSecond: 1,
    decimals: 2,
    sensor: 'Universal Input',
  },
  'Speed / RPM': {
    unit: 'rpm',
    min: 1440,
    max: 1480,
    healthyValue: 1460,
    alertLimit: 1600,
    dangerLimit: 1750,
    samplesPerSecond: 1,
    decimals: 0,
    sensor: 'Speed',
  },
  Pressure: {
    unit: 'MPa',
    min: 0,
    max: 20,
    healthyValue: 8.1,
    alertLimit: 9.2,
    dangerLimit: 10.4,
    samplesPerSecond: 1,
    decimals: 2,
    sensor: 'Pressure',
  },
  Power: {
    unit: 'kW',
    min: 0,
    max: 40,
    healthyValue: 18.3,
    alertLimit: 24,
    dangerLimit: 30,
    samplesPerSecond: 1,
    decimals: 1,
    sensor: 'Power',
  },
  Level: {
    unit: '%',
    min: 0,
    max: 100,
    healthyValue: 68,
    alertLimit: 90,
    dangerLimit: 95,
    samplesPerSecond: 1,
    decimals: 1,
    sensor: 'Level',
  },
  'Process Value': {
    unit: '',
    min: 0,
    max: 100,
    healthyValue: 50,
    alertLimit: 80,
    dangerLimit: 90,
    samplesPerSecond: 1,
    decimals: 2,
    sensor: 'Process',
  },
};

export function sensorLabelForKind(kind: SimulatedChannelKind): string {
  return KIND_DEFAULTS[kind].sensor;
}

export function defaultSimulatedChannel(kind: SimulatedChannelKind): SimulatedChannel {
  const { sensor: _sensor, ...defaults } = KIND_DEFAULTS[kind];
  const channel: SimulatedChannel = { enabled: true, kind, behaviour: 'Steady', manualValue: null, ...defaults };
  return { ...channel, manualValue: restingValue(channel) };
}

export function defaultSimulationForCard(type: CardType): SimulatedChannel[] {
  const kind = defaultKindForCardType(type);
  // Every acquisition card is configured through the same knob-driven channel
  // page, where an operator sets a value and expects to see exactly that value.
  // A random walk would immediately move off whatever they dialled in, so a new
  // channel starts Manual; the generated behaviours are still one chip away.
  const behaviour: SimulationBehaviour = 'Manual';
  return Array.from({ length: channelCountForCardType(type) }, () => ({ ...defaultSimulatedChannel(kind), behaviour }));
}

function vibrationSamplingWasSetByOperator(config: CardConfig): boolean {
  return 'samplingRate' in config && (config as VibrationConfig).samplingRateSource === 'operator';
}

function normalizeStoredSimulationChannel(card: CardNode, channel: SimulatedChannel): SimulatedChannel {
  if (card.type !== 'Vibration Card') return channel;
  if (channel.samplesPerSecond === 10 && !vibrationSamplingWasSetByOperator(card.config)) {
    return { ...channel, samplesPerSecond: DEFAULT_SAMPLES_PER_SECOND };
  }
  return channel;
}

// A card's stored simulation array can be shorter than its channel count (card
// type changed, config saved by an older build) — pad rather than drop channels.
export function simulationForCard(card: CardNode): SimulatedChannel[] {
  const count = channelCountForCardType(card.type);
  if (count === 0) return [];
  const stored = card.simulation ?? [];
  const kind = defaultKindForCardType(card.type);
  return Array.from({ length: count }, (_, index) => {
    const channel = stored[index];
    if (!channel) return defaultSimulatedChannel(kind);
    // A rack saved before the knob existed carries no `manualValue`. Seeding it
    // from the channel's own resting point means switching to Manual starts
    // from where the signal already sits, rather than from zero.
    const hydrated = channel.manualValue === undefined || channel.manualValue === null
      ? { ...channel, manualValue: restingValue(channel) }
      : channel;
    return normalizeStoredSimulationChannel(card, hydrated);
  });
}

// --- Value generation -------------------------------------------------------

export type ChannelRuntime = { value: number; phase: number; signature: string; lastPublishMs: number };
export type SimulationRuntime = {
  channels: Map<string, ChannelRuntime>;
  /** Last gateway status/topology heartbeat, so it is not resent every tick. */
  gatewayHeartbeatMs: Map<string, number>;
};

export function createSimulationRuntime(): SimulationRuntime {
  return { channels: new Map(), gatewayHeartbeatMs: new Map() };
}

export function channelRuntimeKey(gatewayId: string, rackId: string, slot: number, channel: number): string {
  return `${gatewayId}|${rackId}|${slot}|${channel}`;
}

// Reseed the walk when the operator changes the shape of the signal, so a new
// range takes effect immediately instead of being merely clamped on later ticks.
function configSignature(channel: SimulatedChannel): string {
  // `manualValue` is part of the signature so that turning the knob reseeds the
  // channel on the very next tick instead of being walked toward over several
  // — and so `simulationFramesForGateway` can recognise the change and publish
  // it immediately rather than waiting out the channel's sample interval.
  return [channel.kind, channel.min, channel.max, channel.behaviour, channel.alertLimit, channel.dangerLimit, channel.samplesPerSecond, channel.decimals, channel.manualValue].join('|');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function midpoint(channel: Pick<SimulatedChannel, 'min' | 'max'>): number {
  return (channel.min + channel.max) / 2;
}

function nominalValue(channel: Pick<SimulatedChannel, 'min' | 'max' | 'healthyValue'>): number {
  const min = Number.isFinite(channel.min) ? channel.min : 0;
  const max = Number.isFinite(channel.max) && channel.max > min ? channel.max : min + 1;
  const healthy = channel.healthyValue;
  if (healthy !== null && healthy !== undefined && Number.isFinite(healthy)) return clamp(healthy, min, max);
  return midpoint({ min, max });
}

/**
 * Where a channel sits when nothing is driving it — the centre of the declared
 * normal band when there is one, otherwise the centre of the range.
 *
 * Used to seed a knob that has never been set, so switching a channel to Manual
 * starts it at a healthy reading rather than at a range edge or at zero.
 */
export function restingValue(channel: Pick<SimulatedChannel, 'min' | 'max'> & { healthyValue?: number | null }): number {
  const min = Number.isFinite(channel.min) ? channel.min : 0;
  const max = Number.isFinite(channel.max) && channel.max > min ? channel.max : min + 1;
  return nominalValue({ min, max, healthyValue: channel.healthyValue ?? null });
}

/**
 * The exact configured centre for a Manual channel: the knob position, clamped
 * into the engineering range, or the resting value when the knob has never been
 * set.
 *
 * Every surface that needs to say what a manual channel reads — the generator,
 * the configuration knob, the card overview — goes through here, so the figure
 * on the configuration page and the figure on the machine view are produced by
 * one function rather than by two that agree until they don't.
 */
export function manualChannelValue(channel: SimulatedChannel): number {
  const min = Number.isFinite(channel.min) ? channel.min : 0;
  const max = Number.isFinite(channel.max) && channel.max > min ? channel.max : min + 1;
  const requested = channel.manualValue;
  if (requested === null || !Number.isFinite(requested)) return restingValue(channel);
  return clamp(requested, min, max);
}

function fixedPublishedValue(channel: SimulatedChannel, phase: number): number {
  const min = Number.isFinite(channel.min) ? channel.min : 0;
  const max = Number.isFinite(channel.max) && channel.max > min ? channel.max : min + 1;
  const amplitude = Math.min(FIXED_FLUCTUATION_AMPLITUDE, Math.max(0, (max - min) / 4));
  return clamp(manualChannelValue(channel) + Math.sin(phase * 1.61803398875) * amplitude, min, max);
}

// Where the walk is being pulled toward, and how far it may roam, for this
// behaviour at this point in its cycle. `phase` advances one unit per sample.
function targetFor(channel: SimulatedChannel, phase: number): { target: number; low: number; high: number } {
  const span = Math.max(channel.max - channel.min, Number.EPSILON);
  const cycle = Math.sin(phase / Math.max(channel.samplesPerSecond * 12, 1));

  switch (channel.behaviour) {
    case 'Manual': {
      const value = fixedPublishedValue(channel, phase);
      return { target: value, low: value, high: value };
    }
    case 'Drift Up':
    case 'Drift Down': {
      // A slow sweep from one end of the range to the other and back, so the
      // trend charts show a real direction rather than noise.
      const position = (cycle + 1) / 2;
      const target = channel.behaviour === 'Drift Up' ? channel.min + span * position : channel.max - span * position;
      return { target, low: channel.min, high: channel.max };
    }
    case 'Cycle':
      return { target: midpoint(channel) + (span / 2) * cycle, low: channel.min, high: channel.max };
    case 'Predictive Drift': {
      const limit = channel.manualValue ?? channel.dangerLimit ?? channel.alertLimit ?? channel.max;
      const start = nominalValue(channel);
      const horizonSamples = Math.max(channel.samplesPerSecond * 180, 1);
      const progress = Math.min(1, Math.max(0, phase / horizonSamples));
      const target = start + (limit - start) * progress;
      return { target, low: Math.min(channel.min, start), high: Math.max(channel.max, limit) };
    }
    case 'Ramp To Alert': {
      const limit = channel.alertLimit ?? channel.max;
      // Settle just above the limit so the channel latches Alert but not Danger.
      const target = limit + Math.max(span, Math.abs(limit)) * 0.02;
      return { target, low: Math.min(channel.min, target), high: Math.max(channel.max, target) };
    }
    case 'Ramp To Danger': {
      const limit = channel.dangerLimit ?? channel.alertLimit ?? channel.max;
      const target = limit + Math.max(span, Math.abs(limit)) * 0.03;
      return { target, low: Math.min(channel.min, target), high: Math.max(channel.max, target) };
    }
    case 'Spikes': {
      // Mostly healthy, with a short excursion over the danger limit — the
      // intermittent-fault case that alarm latching and trends should catch.
      const spiking = cycle > 0.85;
      const limit = channel.dangerLimit ?? channel.alertLimit ?? channel.max;
      const target = spiking ? limit + Math.max(span, Math.abs(limit)) * 0.05 : nominalValue(channel);
      return { target, low: channel.min, high: Math.max(channel.max, target) };
    }
    case 'Steady':
    default:
      // Steady channels are still fixed around their configured value, but they
      // publish a tiny dither so healthy simulated points do not look frozen.
      const value = fixedPublishedValue(channel, phase);
      return { target: value, low: value, high: value };
  }
}

// How often a simulated gateway re-announces itself and its racks. Well inside
// the freshness windows the UI judges liveness by.
const GATEWAY_HEARTBEAT_MS = 1000;

const FIXED_FLUCTUATION_AMPLITUDE = 0.05;
const PULL = 0.12;
const NOISE = 0.09;
const MIN_SAMPLES_PER_SECOND = 0.1;
const MAX_SAMPLES_PER_SECOND = 50;
// One tick never advances more than this many samples, so a high sample rate
// after a long tab-suspend can't stall the engine catching up.
const MAX_STEPS_PER_TICK = 240;

function samplesPerSecondFor(channel: SimulatedChannel): number {
  return clamp(channel.samplesPerSecond, MIN_SAMPLES_PER_SECOND, MAX_SAMPLES_PER_SECOND);
}

function publishIntervalMsFor(channel: SimulatedChannel): number {
  return 1000 / samplesPerSecondFor(channel);
}

function advance(channel: SimulatedChannel, state: ChannelRuntime, steps: number): number {
  const span = Math.max(channel.max - channel.min, Number.EPSILON);
  let value = state.value;
  for (let step = 0; step < steps; step += 1) {
    state.phase += 1;
    const { target, low, high } = targetFor(channel, state.phase);
    value = clamp(value + (target - value) * PULL + (Math.random() - 0.5) * 2 * span * NOISE, low, high);
  }
  return value;
}

function seedValue(channel: SimulatedChannel): number {
  const { target, low, high } = targetFor(channel, 0);
  return clamp(target, low, high);
}

/** Next value for a channel, continuing its walk from the previous tick. */
export function nextChannelValue(
  key: string,
  channel: SimulatedChannel,
  runtime: SimulationRuntime,
  elapsedSincePublishMs: number,
): number {
  const signature = configSignature(channel);
  let state = runtime.channels.get(key);
  if (!state || state.signature !== signature) {
    state = { value: seedValue(channel), phase: 0, signature, lastPublishMs: 0 };
    runtime.channels.set(key, state);
  }
  if (isManual(channel.behaviour)) {
    const elapsedMs = Math.max(0, elapsedSincePublishMs);
    const elapsedSamples = Math.floor((samplesPerSecondFor(channel) * elapsedMs) / 1000 + Number.EPSILON);
    state.phase += clamp(Math.max(1, elapsedSamples), 1, MAX_STEPS_PER_TICK);
    state.value = fixedPublishedValue(channel, state.phase);
    return state.value;
  }

  const elapsedMs = Math.max(0, elapsedSincePublishMs);
  const elapsedSamples = Math.floor((samplesPerSecondFor(channel) * elapsedMs) / 1000 + Number.EPSILON);
  const steps = clamp(Math.max(1, elapsedSamples), 1, MAX_STEPS_PER_TICK);
  state.value = advance(channel, state, steps);
  return state.value;
}

// --- Threshold + status -----------------------------------------------------

/** Same rule the controller applies: at-or-over the limit latches that state. */
export function thresholdStates(
  value: number,
  alertLimit: number | null,
  dangerLimit: number | null,
): { alert: 'ACTIVE' | 'INACTIVE'; danger: 'ACTIVE' | 'INACTIVE' } {
  return {
    alert: alertLimit !== null && value >= alertLimit ? 'ACTIVE' : 'INACTIVE',
    danger: dangerLimit !== null && value >= dangerLimit ? 'ACTIVE' : 'INACTIVE',
  };
}

/**
 * Whether a reading has crossed one of the channel's own limits.
 *
 * There is no separate "normal band" any more: the alarm levels are the only
 * declaration of what normal means, so this is simply "is the warning or the
 * critical limit met".
 */
export function isOutsideNormalRange(value: number, channel: SimulatedChannel): boolean {
  const { alert, danger } = thresholdStates(value, channel.alertLimit, channel.dangerLimit);
  return alert === 'ACTIVE' || danger === 'ACTIVE';
}

export function formatSimulatedValue(value: number, decimals: number): string {
  return value.toFixed(clamp(Math.round(decimals), 0, 6));
}

// --- Telemetry payloads -----------------------------------------------------

// Reserved private block for simulated hardware. Real gateways are configured
// with the plant's own addressing, so a dedicated block keeps a simulated
// gateway from ever colliding with (or masking) a physical one.
export const SIMULATION_IP_BLOCK = '10.99';

export function isSimulatedIp(ip: string): boolean {
  return ipPrefixFor(ip).startsWith(`${SIMULATION_IP_BLOCK}.`);
}

/** Next free `10.99.N` /24 for a new simulated gateway. */
export function nextSimulatedGatewayIp(devices: DeviceNode[]): string {
  const used = new Set(
    devices
      .filter((device) => !device.archived)
      .map((device) => ipPrefixFor(device.ip))
      .filter((prefix) => prefix.startsWith(`${SIMULATION_IP_BLOCK}.`)),
  );
  for (let segment = 1; segment <= 254; segment += 1) {
    const prefix = `${SIMULATION_IP_BLOCK}.${segment}`;
    if (!used.has(prefix)) return composeIp(prefix, '1');
  }
  return composeIp(`${SIMULATION_IP_BLOCK}.254`, '1');
}

/** Next free host address inside a simulated gateway's /24 for a new rack. */
export function nextSimulatedRackIp(gateway: DeviceNode, devices: DeviceNode[]): string {
  const prefix = ipPrefixFor(gateway.ip);
  if (!prefix) return '';
  const used = new Set(devices.filter((device) => !device.archived).map((device) => device.ip.trim()));
  for (let host = 11; host <= 254; host += 1) {
    const candidate = composeIp(prefix, String(host));
    if (candidate && !used.has(candidate)) return candidate;
  }
  return composeIp(prefix, '254');
}

export function simulatedGatewayScriptId(deviceId: string): string {
  const cleaned = deviceId.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `sim-gw-${cleaned || Math.random().toString(36).slice(2, 8)}`;
}

type SlotPayload = Record<string, unknown>;

// One telemetry record, shaped exactly like a Communication Controller v3 slot
// record — `buildLiveFrame` reads these field names and nothing else.
function slotPayload(
  slot: number,
  channelNumber: number,
  cardType: CardType,
  label: string,
  channel: SimulatedChannel,
  value: number,
): SlotPayload {
  const display = formatSimulatedValue(value, channel.decimals);
  const { alert, danger } = thresholdStates(value, channel.alertLimit, channel.dangerLimit);
  return {
    slot_number: slot,
    channel_id: channelNumber,
    card_type: cardType,
    sensor: label || sensorLabelForKind(channel.kind),
    unit: channel.unit,
    value_raw: value,
    // The live parser reads `value_formatted` as the engineering value. Keep it
    // unrounded so diagnostics see the tiny simulated dither even when the
    // operator-facing display is intentionally rounded to 45.0 or 2000.
    value_formatted: value,
    value_display: display,
    value_with_unit: channel.unit ? `${display} ${channel.unit}` : display,
    measurement_valid: true,
    channel_status: 'ok',
    data_status: 'current',
    alert_value_formatted: channel.alertLimit,
    danger_value_formatted: channel.dangerLimit,
    alert_status: alert,
    danger_status: danger,
    // Extra context a physical card does not report; harmless to downstream
    // consumers and useful when inspecting the raw simulated payload.
    simulated: true,
    samples_per_second: channel.samplesPerSecond,
  };
}

function envelope(gatewayId: string, gatewayIp: string, rackId: string | undefined, payload: Record<string, unknown>, nowMs: number): FrameEnvelope {
  return {
    gateway_id: gatewayId,
    gateway_ip: gatewayIp,
    rack_id: rackId,
    created_at: new Date(nowMs).toISOString(),
    created_at_us: String(nowMs * 1000),
    payload,
  };
}

export type SimulatedRackInput = {
  rackId: string;
  cards: CardNode[];
  online: boolean;
};

/**
 * Every frame a simulated gateway would publish this tick: its status, its rack
 * topology, and one telemetry batch per rack carrying the channels that are due
 * a sample. Returns an empty list when the gateway has nothing to publish.
 */
export function simulationFramesForGateway(
  gateway: DeviceNode,
  racks: SimulatedRackInput[],
  runtime: SimulationRuntime,
  nowMs: number,
  _elapsedMs: number,
): LiveFrame[] {
  const gatewayId = gateway.realGatewayId;
  const gatewayIp = gateway.ip.trim();
  if (!gatewayId || !isValidIp(gatewayIp)) return [];

  const frames: LiveFrame[] = [];

  // Structure changes rarely, so it goes out on a heartbeat rather than on every
  // tick — resending it at the telemetry rate would replace the gateway and rack
  // entries (and so re-render every consumer) ten times a second for no news.
  const lastHeartbeatMs = runtime.gatewayHeartbeatMs.get(gatewayId) ?? 0;
  if (nowMs - lastHeartbeatMs >= GATEWAY_HEARTBEAT_MS) {
    runtime.gatewayHeartbeatMs.set(gatewayId, nowMs);
    const topology = buildLiveFrame(
      'topology',
      envelope(
        gatewayId,
        gatewayIp,
        undefined,
        {
          racks: racks.map((rack) => ({ rack_id: rack.rackId, status: rack.online ? 'connected' : 'disconnected', data_current: rack.online })),
        },
        nowMs,
      ),
      nowMs,
    );
    if (topology) frames.push(topology);
    // A gateway with no racks still has to report itself, or it never reads Online.
    if (racks.length === 0) {
      const status = buildLiveFrame('status', envelope(gatewayId, gatewayIp, undefined, { state: 'ONLINE' }, nowMs), nowMs);
      if (status) frames.push(status);
    }
  }

  if (racks.length === 0) return frames;

  for (const rack of racks) {
    if (!rack.online) continue;
    const slots: SlotPayload[] = [];

    for (const card of rack.cards) {
      const channelCount = channelCountForCardType(card.type);
      if (channelCount === 0 || !card.enabled) continue;
      const channels = simulationForCard(card);
      const names = 'channelNames' in card.config ? card.config.channelNames : [];

      for (let index = 0; index < channelCount; index += 1) {
        const channel = channels[index];
        if (!channel?.enabled) continue;
        const channelNumber = index + 1;
        const key = channelRuntimeKey(gatewayId, rack.rackId, card.slot, channelNumber);

        // Publish no faster than the channel's own sample rate — a 1 sample/sec
        // channel must not appear to update ten times a second just because a
        // faster channel shares the rack.
        const state = runtime.channels.get(key);
        const publishIntervalMs = publishIntervalMsFor(channel);
        // A changed signal definition publishes on the very next tick whatever
        // the cadence says. A 1 sample/sec channel would otherwise hold the
        // previous number for up to a second after the knob moved — and a 0.1
        // sample/sec one for ten — which reads as the machine view disagreeing
        // with the configuration page rather than as it simply being due.
        const reconfigured = !!state && state.signature !== configSignature(channel);
        const elapsedSincePublishMs = state ? Math.max(0, nowMs - state.lastPublishMs) : publishIntervalMs;
        if (state && !reconfigured && elapsedSincePublishMs < publishIntervalMs - 1) continue;

        const value = nextChannelValue(key, channel, runtime, reconfigured ? publishIntervalMs : elapsedSincePublishMs);
        const current = runtime.channels.get(key);
        if (current) current.lastPublishMs = nowMs;
        slots.push(slotPayload(card.slot, channelNumber, card.type, names[index]?.trim() ?? '', channel, value));
      }
    }

    if (slots.length === 0) continue;
    const telemetry = buildLiveFrame(
      'telemetry',
      envelope(gatewayId, gatewayIp, rack.rackId, { telemetry: { data_current: true }, slots }, nowMs),
      nowMs,
    );
    if (telemetry) frames.push(telemetry);
  }

  return frames;
}

function numericOr(text: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(String(text ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Push the card's configuration into the signal definition the generator runs.
 *
 * One direction, one rule, for every acquisition card: the card is where the
 * engineer types, and the signal definition is a projection of it. Unit,
 * operating range, decimals and limits are all read off the shared channel
 * block, so a vibration card, a process card and a speed card are handled by
 * the same four lines rather than by three near-identical branches.
 *
 * Only the high-side levels become the signal's alert/danger limits, because
 * the payload's threshold states are "value at or above the limit". Feeding a
 * low alarm in there would report a healthy reading as critical the moment it
 * rose past the low limit — the card's own alarm evaluation, which knows which
 * side each level guards, keeps handling those.
 */
export function simulationWithCardConfig(type: CardType, config: CardConfig, channels: SimulatedChannel[]): SimulatedChannel[] {
  const primary = channels[0];
  if (!primary || !('alarmHigh' in config)) return channels;

  const common = config as ChannelCommonConfig;
  const { min, max } = derivedChannelRangeFor(common);
  const limits = channelAlarmLimits(common);

  const next: Partial<SimulatedChannel> = {
    unit: common.unit || primary.unit,
    min,
    max,
    healthyValue: numericOr(common.healthyValue, primary.healthyValue ?? restingValue({ min, max })),
    decimals: decimalsForPrecision(common.displayPrecision),
    alertLimit: limits.high,
    dangerLimit: limits.highHigh,
  };
  // Older vibration configs carried a default hardware sampling-rate field.
  // Letting it overwrite the channel here is what kept reviving `10 Hz`.
  // Only rates written by the current channel-rate control carry the operator
  // marker and are allowed to flow back into the simulated signal.
  if (type === 'Vibration Card' && vibrationSamplingWasSetByOperator(config)) {
    next.samplesPerSecond = numericOr((config as VibrationConfig).samplingRate, primary.samplesPerSecond);
  }

  // Narrowing the alarm levels narrows the derived range, which must not leave
  // the knob parked outside it: the generator clamps on publish, so an
  // unclamped knob would show one number and publish another.
  next.manualValue = manualChannelValue({ ...primary, ...next } as SimulatedChannel);

  return channels.map((channel, index) => (index === 0 ? { ...channel, ...next } : channel));
}

/**
 * The reverse trip, used once when a card's editor opens.
 *
 * It carries only what the signal definition is the authority on — the unit it
 * was created with, its decimals, and the limits it has been publishing
 * against. It deliberately does NOT write a range back: the range is derived
 * from the alarm levels now, so writing one would immediately be overwritten
 * by the next normalisation and would look like the field ignoring the user.
 */
export function cardConfigWithSimulation(type: CardType, config: CardConfig, channels: SimulatedChannel[]): CardConfig {
  const primary = channels[0];
  if (!primary || !('alarmHigh' in config)) return config;

  const common = config as ChannelCommonConfig;
  const next: Record<string, unknown> = {
    ...common,
    unit: common.unit || primary.unit,
    healthyValue: common.healthyValue || (primary.healthyValue !== null ? String(primary.healthyValue) : ''),
    displayPrecision: precisionForDecimals(primary.decimals),
  };
  // Seed the card's H and HH from the pair the signal carries when the card has
  // none of its own — a card created before it had an alarm block, or one
  // installed straight from a signal default. Without this the first edit
  // recomputes the pair from empty fields and the generator silently loses the
  // thresholds it was publishing against.
  if (!common.alarmHigh.trim() && primary.alertLimit !== null) {
    next.alarmHigh = String(primary.alertLimit);
    next.alarmHighEnabled = true;
  }
  if (!common.alarmHighHigh.trim() && primary.dangerLimit !== null) {
    next.alarmHighHigh = String(primary.dangerLimit);
    next.alarmHighHighEnabled = true;
  }
  if (type === 'Vibration Card' && 'samplingRate' in config && Number.isFinite(primary.samplesPerSecond)) {
    next.samplingRate = `${primary.samplesPerSecond} Hz`;
    if (vibrationSamplingWasSetByOperator(config)) next.samplingRateSource = 'operator';
  }

  return normalizeChannelConfig(type, next);
}

// --- Workspace helpers ------------------------------------------------------

export function isSimulatedDevice(device: DeviceNode): boolean {
  return device.simulated === true;
}

export function simulatedGateways(devices: DeviceNode[]): DeviceNode[] {
  return devices.filter((device) => device.type === 'Gateway' && !device.archived && isSimulatedDevice(device));
}

export function simulatedRacksForGateway(gateway: DeviceNode, devices: DeviceNode[]): DeviceNode[] {
  return devices.filter(
    (device) =>
      device.type === 'Rack' &&
      !device.archived &&
      isSimulatedDevice(device) &&
      (device.gatewayId === gateway.id || (!!device.realGatewayId && device.realGatewayId === gateway.realGatewayId)),
  );
}

/** True when the workspace has at least one simulated gateway to run. */
export function hasSimulation(devices: DeviceNode[]): boolean {
  return simulatedGateways(devices).length > 0;
}

export type SimulatedChannelSummary = {
  key: string;
  gatewayId: string;
  gatewayName: string;
  rackDeviceId: string;
  rackName: string;
  rackId: string;
  slot: number;
  channelNumber: number;
  label: string;
  cardType: CardType;
  channel: SimulatedChannel;
};

/** Every simulated channel in the workspace, for the Simulation Mode listing. */
export function listSimulatedChannels(devices: DeviceNode[], cards: CardNode[]): SimulatedChannelSummary[] {
  return simulatedGateways(devices).flatMap((gateway) =>
    simulatedRacksForGateway(gateway, devices).flatMap((rack) => {
      const rackId = rack.realRackId === undefined || rack.realRackId === null ? '' : String(rack.realRackId);
      return cards
        .filter((card) => card.deviceId === rack.id && channelCountForCardType(card.type) > 0)
        .sort((a, b) => a.slot - b.slot)
        .flatMap((card) => {
          const channels = simulationForCard(card);
          const names = 'channelNames' in card.config ? card.config.channelNames : [];
          return channels.map((channel, index) => ({
            key: channelRuntimeKey(gateway.realGatewayId ?? gateway.id, rackId, card.slot, index + 1),
            gatewayId: gateway.id,
            gatewayName: gateway.name,
            rackDeviceId: rack.id,
            rackName: rack.name,
            rackId,
            slot: card.slot,
            channelNumber: index + 1,
            label: names[index]?.trim() || `${card.type} CH${index + 1}`,
            cardType: card.type,
            channel,
          }));
        });
    }),
  );
}
