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
  channelCountForCardType,
  decimalsForPrecision,
  precisionForDecimals,
  syncProcessLegacyAlarms,
  type CardConfig,
  type CardNode,
  type CardType,
  type ProcessConfig,
} from './rack';

// Card families the simulator can stand in for. Kinds map onto the real card
// types, so a simulated channel occupies a rack slot exactly like its physical
// counterpart and inherits that card's channel count.
export const SIMULATED_CHANNEL_KINDS = [
  'Vibration',
  'RTD / Temperature',
  'Universal Voltage / Current',
  'Speed / RPM',
  'Pressure',
] as const;
export type SimulatedChannelKind = (typeof SIMULATED_CHANNEL_KINDS)[number];

export function cardTypeForKind(kind: SimulatedChannelKind): CardType {
  switch (kind) {
    case 'Vibration':
      return 'Vibration Card';
    case 'Speed / RPM':
      return 'Speed Card';
    case 'RTD / Temperature':
    case 'Universal Voltage / Current':
    case 'Pressure':
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
  'Ramp To Alert',
  'Ramp To Danger',
  'Spikes',
] as const;
export type SimulationBehaviour = (typeof SIMULATION_BEHAVIOURS)[number];

export function isFaultInjection(behaviour: SimulationBehaviour): boolean {
  return behaviour === 'Ramp To Alert' || behaviour === 'Ramp To Danger' || behaviour === 'Spikes';
}

/**
 * `Manual` is the operator-driven behaviour: the channel publishes exactly the
 * value on its knob, with no walk, no noise and no pull toward a target. It is
 * the only behaviour whose published number is decided outside the generator,
 * which is what makes a knob turn land on the machine view as the same figure
 * rather than a plausible neighbour of it.
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
  // Declared healthy band, reported alongside the value so status and analysis
  // can call out "outside normal operating range" independently of the alarm
  // thresholds. Null means "no separate normal band declared".
  normalMin: number | null;
  normalMax: number | null;
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
    | 'normalMin'
    | 'normalMax'
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

  if (channel.normalMin !== null && !Number.isFinite(channel.normalMin)) errors.normalMin = 'Enter a valid number or leave blank.';
  if (channel.normalMax !== null && !Number.isFinite(channel.normalMax)) errors.normalMax = 'Enter a valid number or leave blank.';
  if (channel.normalMin === null && channel.normalMax !== null) errors.normalMin = 'Enter the lower normal limit.';
  if (channel.normalMin !== null && channel.normalMax === null) errors.normalMax = 'Enter the upper normal limit.';
  if (
    channel.normalMin !== null &&
    channel.normalMax !== null &&
    Number.isFinite(channel.normalMin) &&
    Number.isFinite(channel.normalMax) &&
    channel.normalMax <= channel.normalMin
  ) {
    errors.normalMax = 'Normal maximum must be greater than normal minimum.';
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
    normalMin: 0,
    normalMax: 4.5,
    alertLimit: 5,
    dangerLimit: 7,
    samplesPerSecond: 10,
    decimals: 2,
    sensor: 'Vibration',
  },
  'RTD / Temperature': {
    unit: '°C',
    min: 45,
    max: 72,
    normalMin: 20,
    normalMax: 80,
    alertLimit: 85,
    dangerLimit: 95,
    samplesPerSecond: 1,
    decimals: 1,
    sensor: 'RTD',
  },
  'Universal Voltage / Current': {
    unit: 'A',
    min: 8,
    max: 32,
    normalMin: 5,
    normalMax: 35,
    alertLimit: 38,
    dangerLimit: 45,
    samplesPerSecond: 1,
    decimals: 2,
    sensor: 'Universal Input',
  },
  'Speed / RPM': {
    unit: 'rpm',
    min: 1440,
    max: 1480,
    normalMin: 1400,
    normalMax: 1520,
    alertLimit: 1600,
    dangerLimit: 1750,
    samplesPerSecond: 1,
    decimals: 0,
    sensor: 'Speed',
  },
  Pressure: {
    unit: 'bar',
    min: 1.5,
    max: 6.2,
    normalMin: 1,
    normalMax: 7,
    alertLimit: 8,
    dangerLimit: 10,
    samplesPerSecond: 1,
    decimals: 2,
    sensor: 'Pressure',
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
  // The Universal V/I card is configured through the knob-driven channel page,
  // where an operator sets a value and expects to see exactly that value. A
  // random walk would immediately move off whatever they dialled in, so this
  // card family starts Manual; the generated behaviours are still one chip away.
  const behaviour: SimulationBehaviour = type === 'Process Card' ? 'Manual' : 'Steady';
  return Array.from({ length: channelCountForCardType(type) }, () => ({ ...defaultSimulatedChannel(kind), behaviour }));
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
    return channel.manualValue === undefined || channel.manualValue === null
      ? { ...channel, manualValue: restingValue(channel) }
      : channel;
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

export function channelRuntimeKey(rackId: string, slot: number, channel: number): string {
  return `${rackId}|${slot}|${channel}`;
}

// Reseed the walk when the operator changes the shape of the signal, so a new
// range takes effect immediately instead of being merely clamped on later ticks.
function configSignature(channel: SimulatedChannel): string {
  // `manualValue` is part of the signature so that turning the knob reseeds the
  // channel on the very next tick instead of being walked toward over several
  // — and so `simulationFramesForGateway` can recognise the change and publish
  // it immediately rather than waiting out the channel's sample interval.
  return [channel.kind, channel.min, channel.max, channel.behaviour, channel.alertLimit, channel.dangerLimit, channel.manualValue].join('|');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function midpoint(channel: SimulatedChannel): number {
  return (channel.min + channel.max) / 2;
}

/**
 * Where a channel sits when nothing is driving it — the centre of the declared
 * normal band when there is one, otherwise the centre of the range.
 *
 * Used to seed a knob that has never been set, so switching a channel to Manual
 * starts it at a healthy reading rather than at a range edge or at zero.
 */
export function restingValue(channel: Pick<SimulatedChannel, 'min' | 'max' | 'normalMin' | 'normalMax'>): number {
  const min = Number.isFinite(channel.min) ? channel.min : 0;
  const max = Number.isFinite(channel.max) && channel.max > min ? channel.max : min + 1;
  if (channel.normalMin !== null && channel.normalMax !== null && Number.isFinite(channel.normalMin) && Number.isFinite(channel.normalMax)) {
    return clamp((channel.normalMin + channel.normalMax) / 2, min, max);
  }
  return (min + max) / 2;
}

/**
 * The exact number a Manual channel publishes: the knob position, clamped into
 * the engineering range, or the resting value when the knob has never been set.
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

// Where the walk is being pulled toward, and how far it may roam, for this
// behaviour at this point in its cycle. `phase` advances one unit per sample.
function targetFor(channel: SimulatedChannel, phase: number): { target: number; low: number; high: number } {
  const span = Math.max(channel.max - channel.min, Number.EPSILON);
  const cycle = Math.sin(phase / Math.max(channel.samplesPerSecond * 12, 1));

  switch (channel.behaviour) {
    case 'Manual': {
      // Pinned: the target is the value itself and the band collapses onto it,
      // so even a caller that walks toward the target lands exactly on it.
      const value = manualChannelValue(channel);
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
      const target = spiking ? limit + Math.max(span, Math.abs(limit)) * 0.05 : midpoint(channel);
      return { target, low: channel.min, high: Math.max(channel.max, target) };
    }
    case 'Steady':
    default: {
      // Centre on the declared normal band when it sits inside the range, so a
      // "normal" channel reads normal rather than hovering at a range edge.
      const normalCentre =
        channel.normalMin !== null && channel.normalMax !== null
          ? clamp((channel.normalMin + channel.normalMax) / 2, channel.min, channel.max)
          : midpoint(channel);
      return { target: normalCentre, low: channel.min, high: channel.max };
    }
  }
}

// How often a simulated gateway re-announces itself and its racks. Well inside
// the freshness windows the UI judges liveness by.
const GATEWAY_HEARTBEAT_MS = 1000;

const PULL = 0.12;
const NOISE = 0.09;
// One tick never advances more than this many samples, so a high sample rate
// after a long tab-suspend can't stall the engine catching up.
const MAX_STEPS_PER_TICK = 240;

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
  elapsedMs: number,
): number {
  const signature = configSignature(channel);
  let state = runtime.channels.get(key);
  if (!state || state.signature !== signature) {
    state = { value: seedValue(channel), phase: 0, signature, lastPublishMs: 0 };
    runtime.channels.set(key, state);
  }
  // A manual channel is not walked at all. Running it through `advance` would
  // add the noise term and return the knob's value ± a fraction of the span,
  // which is precisely the discrepancy the knob exists to remove.
  if (isManual(channel.behaviour)) {
    state.value = manualChannelValue(channel);
    return state.value;
  }

  const steps = clamp(Math.round((channel.samplesPerSecond * elapsedMs) / 1000), 1, MAX_STEPS_PER_TICK);
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

export function isOutsideNormalRange(value: number, channel: SimulatedChannel): boolean {
  if (channel.normalMin !== null && value < channel.normalMin) return true;
  return channel.normalMax !== null && value > channel.normalMax;
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
    value_formatted: Number(display),
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
    normal_min: channel.normalMin,
    normal_max: channel.normalMax,
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
  elapsedMs: number,
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
        const key = channelRuntimeKey(rack.rackId, card.slot, channelNumber);

        // Publish no faster than the channel's own sample rate — a 1 sample/sec
        // channel must not appear to update ten times a second just because a
        // faster channel shares the rack.
        const state = runtime.channels.get(key);
        const publishIntervalMs = 1000 / clamp(channel.samplesPerSecond, 0.1, 50);
        // A changed signal definition publishes on the very next tick whatever
        // the cadence says. A 1 sample/sec channel would otherwise hold the
        // previous number for up to a second after the knob moved — and a 0.1
        // sample/sec one for ten — which reads as the machine view disagreeing
        // with the configuration page rather than as it simply being due.
        const reconfigured = !!state && state.signature !== configSignature(channel);
        if (state && !reconfigured && nowMs - state.lastPublishMs < publishIntervalMs - 1) continue;

        const value = nextChannelValue(key, channel, runtime, elapsedMs);
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

function limitText(value: number | null): string {
  return value === null ? '' : String(value);
}

/**
 * Mirrors a simulated channel's unit, range and limits into the card's own
 * configuration.
 *
 * The rest of the app reads engineering units and alarm limits off the card
 * (that is where a real commissioning engineer enters them) — `listChannels`
 * derives a mapped point's unit and V/T/S/P/C letter from them, and the
 * analysis layer reads its thresholds from them. For a simulated card the
 * signal definition is the source of truth, so the two are kept in step
 * instead of asking the operator to type the same numbers twice.
 *
 * Channel 1 decides the card-level values, since a card carries one unit and
 * one threshold pair for all of its channels.
 */
/**
 * Push a card-level edit back into the signal definition.
 *
 * The unit, range and alarm pair exist in two places for a simulated card: on
 * the card (where a commissioning engineer expects to type them) and on the
 * signal definition (which is what the generator actually publishes). Previously
 * the signal definition won unconditionally on save, so editing the card's Unit
 * field appeared to do nothing — the value snapped straight back.
 *
 * The two are now kept in step in BOTH directions: edit either side and the
 * other follows. This is the reverse of `cardConfigWithSimulation`.
 */
export function simulationWithCardConfig(
  type: CardType,
  config: CardConfig,
  channels: SimulatedChannel[],
): SimulatedChannel[] {
  const primary = channels[0];
  if (!primary) return channels;

  const numeric = (text: string | undefined, fallback: number): number => {
    const parsed = Number.parseFloat(String(text ?? '').trim());
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const limit = (text: string | undefined, fallback: number | null): number | null => {
    const raw = String(text ?? '').trim();
    if (!raw) return null;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  let next: Partial<SimulatedChannel> = {};
  if (type === 'Vibration Card' && 'engineeringUnit' in config) {
    next = {
      unit: config.engineeringUnit || primary.unit,
      min: numeric(config.measurementRangeMin, primary.min),
      max: numeric(config.measurementRangeMax, primary.max),
      // Accept both "10" and the persisted card representation "10 Hz" so a
      // configuration round-trip keeps the requested cadence.
      samplesPerSecond: numeric(config.samplingRate, primary.samplesPerSecond),
    };
  } else if (type === 'Process Card' && 'engineeringMin' in config) {
    next = {
      unit: config.unit || primary.unit,
      min: numeric(config.engineeringMin, primary.min),
      max: numeric(config.engineeringMax, primary.max),
      // Section 5 of the card specification makes display precision the single
      // place decimals are chosen, so the generator follows it rather than
      // asking for the same number twice.
      decimals: decimalsForPrecision(config.displayPrecision),
    };
  } else if (type === 'Speed Card' && 'minSpeed' in config) {
    next = {
      unit: config.unit || primary.unit,
      min: numeric(config.minSpeed, primary.min),
      max: numeric(config.maxSpeed, primary.max),
    };
  } else {
    return channels;
  }

  if ('alarmWarning' in config) next.alertLimit = limit(config.alarmWarning, primary.alertLimit);
  if ('alarmCritical' in config) next.dangerLimit = limit(config.alarmCritical, primary.dangerLimit);
  // A range that ends up inverted would stall the generator; keep the stored one.
  if (next.min !== undefined && next.max !== undefined && next.max <= next.min) {
    next.min = primary.min;
    next.max = primary.max;
  }

  // Narrowing the engineering range must not leave the knob parked outside it —
  // the generator clamps on publish, so an unclamped knob would show one number
  // on the configuration page and publish another to the machine view.
  const merged = { ...primary, ...next };
  next.manualValue = manualChannelValue(merged);

  return channels.map((channel, index) => (index === 0 ? { ...channel, ...next } : channel));
}

export function cardConfigWithSimulation(type: CardType, config: CardConfig, channels: SimulatedChannel[]): CardConfig {
  const primary = channels[0];
  if (!primary) return config;
  const alarmWarning = limitText(primary.alertLimit);
  const alarmCritical = limitText(primary.dangerLimit);

  if (type === 'Vibration Card' && 'engineeringUnit' in config) {
    return {
      ...config,
      engineeringUnit: primary.unit,
      measurementRangeMin: String(primary.min),
      measurementRangeMax: String(primary.max),
      samplingRate: `${primary.samplesPerSecond} Hz`,
      alarmWarning,
      alarmCritical,
    };
  }
  if (type === 'Process Card' && 'engineeringMin' in config) {
    const next: ProcessConfig = {
      ...config,
      unit: primary.unit,
      engineeringMin: String(primary.min),
      engineeringMax: String(primary.max),
      displayPrecision: precisionForDecimals(primary.decimals),
      alarmWarning,
      alarmCritical,
    };
    // The card specification's alarm block is richer than a signal definition,
    // which carries only a warning/critical pair. Seeding H and HH from that
    // pair when the card has none of its own keeps the two descriptions of the
    // same limits together: without it, `syncProcessLegacyAlarms` recomputes
    // the pair from the (empty) H/HH fields on the very first edit and the
    // generator quietly loses the thresholds it was publishing against.
    if (!next.alarmHigh.trim() && primary.alertLimit !== null) {
      next.alarmHigh = String(primary.alertLimit);
      next.alarmHighEnabled = true;
    }
    if (!next.alarmHighHigh.trim() && primary.dangerLimit !== null) {
      next.alarmHighHigh = String(primary.dangerLimit);
      next.alarmHighHighEnabled = true;
    }
    return syncProcessLegacyAlarms(next);
  }
  if (type === 'Speed Card' && 'minSpeed' in config) {
    return {
      ...config,
      unit: primary.unit,
      minSpeed: String(primary.min),
      maxSpeed: String(primary.max),
      alarmWarning,
      alarmCritical,
    };
  }
  return config;
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
            key: channelRuntimeKey(rackId, card.slot, index + 1),
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
