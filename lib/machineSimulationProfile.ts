// Simulation hardware generated from a machine's own instrument registry.
//
// Why this file exists
// --------------------
// `sseSimulationProfile.ts` builds three gateways, six racks and their cards
// for one machine — the single screw extruder — from a hand-written list of
// fifteen channels. It is the right shape and the wrong scope: every channel,
// limit and fault value in it is typed out by hand, so it covers exactly one
// template and nothing else.
//
// A plant built from these templates has one folder per machine and three
// machines in it — healthy, faulty, predictive — and wiring each of those by
// hand means creating a gateway, sizing racks, configuring a card per
// instrument, and then dragging a trail from every pad to the channel that
// matches it. On a twenty-point extractor that is twenty deliberate acts for
// one of three variants of one of a dozen machines.
//
// None of it is a judgement call. The machine's registry already says what
// every instrument measures; a vibration point needs a vibration card
// reporting mm/s, and there is no second sensible answer. So this generates
// the hardware from the registry rather than from a list somebody maintains
// alongside it, which also means a template gaining a point gains its channel
// with no further work.
//
// What it deliberately does not do
// --------------------------------
// It does not invent process values. Ranges and limits come from the kind of
// quantity, not from the machine: a bearing runs warm at 70 C whatever it is
// bolted to. Where a real commissioning number is needed — this bearing's
// actual alarm point — the generated channel carries the generic one and the
// operator edits it, which is the same position they would be in having
// created the card by hand.
import type { DeviceNode } from './devices';
import type { MachineTemplate } from './machines';
import { normalizeChannelConfig, type CardConfig, type CardNode, type CardType } from './rack';
import { restingValue, type SimulatedChannel, type SimulatedChannelKind, type SimulationBehaviour } from './simulation';

/** Which of the three demo machines a name describes. */
export type SimulationProfile = 'healthy' | 'faulty' | 'prediction';

/** A machine to generate hardware for. */
export type SimulationTarget = {
  id: string;
  name: string;
  template: MachineTemplate;
  projectId: string | null;
};

/** One instrument pad, reduced to what the generator needs. */
export type SimulationPoint = {
  code: string;
  label: string;
  /** The registry's `MeasurementPointKind`, as a plain string. */
  kind?: string;
};

/** Slots on a `RACK-12-R`. A machine with more points gets more racks. */
export const SLOTS_PER_RACK = 12;

/**
 * Which demo a machine is, from what it is called.
 *
 * The names are the operator's — "Seed Dryer Healthy", "SSE Faulty R1",
 * "Conditioner Predictive" — and the word in them is the only statement
 * anywhere of which demo a machine is meant to be. Read rather than guessed:
 * a machine whose name says none of the three is healthy, because a machine
 * nobody has declared faulty is not faulty.
 */
export function profileFromName(name: string): SimulationProfile {
  const lower = name.toLowerCase();
  if (/(fault|faulty|failure|alarm)/.test(lower)) return 'faulty';
  if (/(predict|prognos|drift|trend)/.test(lower)) return 'prediction';
  return 'healthy';
}

type KindSpec = {
  kind: SimulatedChannelKind;
  cardType: CardType;
  unit: string;
  min: number;
  max: number;
  healthy: number;
  /** Alert and danger, where the quantity has conventional ones. */
  high?: number;
  highHigh?: number;
  low?: number;
  lowLow?: number;
  decimals: number;
  precision: '0' | '0.0' | '0.00' | '0.000';
  inputType?: '0-1 V' | '0-5 V' | '0-10 V' | '4-20 mA' | '0-20 mA';
};

/**
 * What each kind of instrument is, as hardware.
 *
 * The unit is not decorative: `connectorFitForUnit` matches a channel to a pad
 * by unit, so a generated channel whose unit the matcher does not recognise
 * would be refused by the very pad it was generated for. Every unit here is
 * one `parameterKindForUnit` knows.
 *
 * Moisture and Leak are the two the matcher cannot verify — per cent reads as
 * a level, and a leak has no engineering unit at all — so their channels bind
 * with fit 'unknown', which is permissive by design.
 */
const BY_KIND: Record<string, KindSpec> = {
  Vibration: { kind: 'Vibration', cardType: 'Vibration Card', unit: 'mm/s RMS', min: 0, max: 15, healthy: 1.5, high: 2.8, highHigh: 7.1, decimals: 2, precision: '0.00' },
  Temperature: { kind: 'RTD / Temperature', cardType: 'RTD Card', unit: 'C', min: 0, max: 300, healthy: 65, high: 85, highHigh: 100, decimals: 1, precision: '0.0' },
  Speed: { kind: 'Speed / RPM', cardType: 'Speed Card', unit: 'RPM', min: 0, max: 3000, healthy: 1500, lowLow: 50, low: 200, decimals: 0, precision: '0' },
  Pressure: { kind: 'Pressure', cardType: 'Universal V/I Card', unit: 'bar', min: 0, max: 20, healthy: 8, low: 4, high: 12, highHigh: 15, decimals: 2, precision: '0.00', inputType: '4-20 mA' },
  Current: { kind: 'Universal Voltage / Current', cardType: 'Universal V/I Card', unit: 'A', min: 0, max: 200, healthy: 85, high: 140, highHigh: 170, decimals: 1, precision: '0.0', inputType: '4-20 mA' },
  Power: { kind: 'Power', cardType: 'Universal V/I Card', unit: 'kW', min: 0, max: 200, healthy: 90, high: 150, highHigh: 180, decimals: 1, precision: '0.0', inputType: '4-20 mA' },
  Level: { kind: 'Level', cardType: 'Universal V/I Card', unit: '%', min: 0, max: 100, healthy: 70, lowLow: 10, low: 20, high: 90, highHigh: 95, decimals: 1, precision: '0.0', inputType: '4-20 mA' },
  Flow: { kind: 'Process Value', cardType: 'Process Card', unit: 'kg/h', min: 0, max: 5000, healthy: 2000, low: 800, lowLow: 400, decimals: 0, precision: '0', inputType: '4-20 mA' },
  Moisture: { kind: 'Process Value', cardType: 'Process Card', unit: '%', min: 0, max: 25, healthy: 11, high: 14, highHigh: 16, decimals: 2, precision: '0.00', inputType: '4-20 mA' },
  // A gas detector's limits are the whole instrument, so they are not left off.
  Gas: { kind: 'Process Value', cardType: 'Process Card', unit: 'ppm', min: 0, max: 500, healthy: 2, high: 35, highHigh: 100, decimals: 1, precision: '0.0', inputType: '4-20 mA' },
  // Discrete: dry is 0 and wet is 1, so the alert sits between them.
  Leak: { kind: 'Process Value', cardType: 'Process Card', unit: '', min: 0, max: 1, healthy: 0, high: 0.5, decimals: 0, precision: '0', inputType: '4-20 mA' },
  Position: { kind: 'Process Value', cardType: 'Process Card', unit: 'mm', min: 0, max: 300, healthy: 150, low: 40, lowLow: 15, decimals: 1, precision: '0.0', inputType: '4-20 mA' },
  Weight: { kind: 'Process Value', cardType: 'Process Card', unit: 'kg', min: 0, max: 100, healthy: 50, low: 48, lowLow: 45, high: 52, highHigh: 55, decimals: 2, precision: '0.00', inputType: '4-20 mA' },
};

/** Anything the registry types with a kind this file does not know. */
const FALLBACK: KindSpec = {
  kind: 'Process Value', cardType: 'Process Card', unit: '', min: 0, max: 100, healthy: 50,
  decimals: 2, precision: '0.00', inputType: '4-20 mA',
};

export function specForKind(kind: string | undefined): KindSpec {
  return (kind && BY_KIND[kind]) || FALLBACK;
}

/**
 * The value a channel sits at for a given demo.
 *
 * Faulty puts every channel past its alert limit but short of danger, so the
 * machine reads as degrading rather than tripped — a plant where every point
 * is in danger at once is not a fault anybody diagnoses, it is a wiring
 * error. Where a quantity has only a low limit, faulty goes low.
 *
 * Predictive leaves the value healthy and lets the *behaviour* carry the
 * story, which is the distinction the third demo exists to make: a point that
 * reads fine today and has been climbing for a fortnight.
 */
function valueFor(spec: KindSpec, profile: SimulationProfile): number | null {
  if (profile === 'healthy') return null;
  if (profile === 'prediction') return null;
  if (spec.high !== undefined) {
    const danger = spec.highHigh ?? spec.max;
    return Number((spec.high + (danger - spec.high) * 0.35).toFixed(spec.decimals));
  }
  if (spec.low !== undefined) {
    const danger = spec.lowLow ?? spec.min;
    return Number((spec.low - (spec.low - danger) * 0.35).toFixed(spec.decimals));
  }
  return null;
}

function behaviourFor(profile: SimulationProfile): SimulationBehaviour {
  return profile === 'prediction' ? 'Predictive Drift' : 'Steady';
}

function simulatedChannel(spec: KindSpec, profile: SimulationProfile): SimulatedChannel {
  const base: SimulatedChannel = {
    enabled: true,
    kind: spec.kind,
    unit: spec.unit,
    min: spec.min,
    max: spec.max,
    healthyValue: spec.healthy,
    alertLimit: spec.high ?? null,
    dangerLimit: spec.highHigh ?? null,
    samplesPerSecond: 1,
    behaviour: behaviourFor(profile),
    decimals: spec.decimals,
    manualValue: null,
  };
  const value = valueFor(spec, profile);
  return { ...base, manualValue: value ?? restingValue(base) };
}

function configFor(spec: KindSpec, label: string): CardConfig {
  const common = {
    channelNames: [label],
    unit: spec.unit,
    rangeMin: String(spec.min),
    rangeMax: String(spec.max),
    healthyValue: String(spec.healthy),
    alarmLowLowEnabled: spec.lowLow !== undefined,
    alarmLowLow: spec.lowLow !== undefined ? String(spec.lowLow) : '',
    alarmLowEnabled: spec.low !== undefined,
    alarmLow: spec.low !== undefined ? String(spec.low) : '',
    alarmHighEnabled: spec.high !== undefined,
    alarmHigh: spec.high !== undefined ? String(spec.high) : '',
    alarmHighHighEnabled: spec.highHigh !== undefined,
    alarmHighHigh: spec.highHigh !== undefined ? String(spec.highHigh) : '',
    displayPrecision: spec.precision,
  };
  if (spec.cardType === 'Vibration Card') {
    return normalizeChannelConfig('Vibration Card', {
      ...common, sensorType: 'Accelerometer', sensitivity: '100 mV/g', samplingRate: '1 Hz',
    });
  }
  if (spec.cardType === 'Speed Card') {
    return normalizeChannelConfig('Speed Card', {
      ...common, inputType: 'RPM', pulsesPerRevolution: '1', trigger: 'Rising', triggerHysteresis: '0.2 V',
    });
  }
  return normalizeChannelConfig(spec.cardType, { ...common, inputType: spec.inputType ?? '4-20 mA' });
}

/** Where one instrument's channel ended up, so a canvas can bind to it. */
export type PlacedPoint = {
  code: string;
  label: string;
  rackId: string;
  slot: number;
  /** The id `listChannels` will give this channel. Deterministic, so a layout
   *  can be generated without building the channel list first. */
  channelId: string;
};

export type MachinePlan = {
  machineId: string;
  machineName: string;
  template: MachineTemplate;
  profile: SimulationProfile;
  gateway: DeviceNode;
  racks: DeviceNode[];
  cards: CardNode[];
  points: PlacedPoint[];
};

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'machine';
}

/**
 * Hardware for one machine.
 *
 * `index` only picks the IP block, so two machines never collide on an
 * address — the device list refuses duplicate configured IPs, and two
 * generated gateways sharing one would archive each other.
 */
export function planMachine(
  target: SimulationTarget,
  points: readonly SimulationPoint[],
  index: number,
): MachinePlan | null {
  if (points.length === 0) return null;

  const profile = profileFromName(target.name);
  const key = `${slug(target.name)}-${target.id.slice(-6)}`;
  const gatewayId = `sim-${key}-gw`;
  // 10.80.x.y, stepping the third octet per machine. 254 machines before a
  // collision, which is more than a plant this canvas can draw.
  const block = 10 + (index % 240);
  const ipPrefix = `10.80.${block}`;

  const rackCount = Math.max(1, Math.ceil(points.length / SLOTS_PER_RACK));
  const racks: DeviceNode[] = Array.from({ length: rackCount }, (_, i) => ({
    id: `${gatewayId}-r${i + 1}`,
    name: `${target.name} R${i + 1}`,
    type: 'Rack' as const,
    model: 'RACK-12-R',
    ip: `${ipPrefix}.${11 + i}`,
    port: '1883',
    protocol: 'Modbus TCP' as const,
    description: `Generated for ${target.name}`,
    status: 'Online' as const,
    projectId: target.projectId,
    gatewayId,
    realGatewayId: `${gatewayId}-real`,
    realRackId: i + 1,
    archived: false,
    simulated: true,
  }));

  const gateway: DeviceNode = {
    id: gatewayId,
    name: `GW ${target.name}`,
    type: 'Gateway',
    model: 'GW-100',
    ip: `${ipPrefix}.1`,
    port: '1883',
    protocol: 'Modbus TCP',
    description: `Generated for ${target.name}`,
    status: 'Online',
    projectId: target.projectId,
    realGatewayId: `${gatewayId}-real`,
    realRackId: null,
    archived: false,
    simulated: true,
  };

  const cards: CardNode[] = [];
  const placed: PlacedPoint[] = [];
  points.forEach((point, i) => {
    const rack = racks[Math.floor(i / SLOTS_PER_RACK)];
    const slot = (i % SLOTS_PER_RACK) + 1;
    const spec = specForKind(point.kind);
    cards.push({
      id: `${rack.id}-slot-${slot}`,
      deviceId: rack.id,
      slot,
      type: spec.cardType,
      enabled: true,
      config: configFor(spec, point.label),
      simulation: [simulatedChannel(spec, profile)],
    });
    placed.push({
      code: point.code,
      label: point.label,
      rackId: rack.id,
      slot,
      // Mirrors `listChannels`: one channel per card, so always CH1.
      channelId: `${rack.id}.S${String(slot).padStart(2, '0')}.CH1`,
    });
  });

  return { machineId: target.id, machineName: target.name, template: target.template, profile, gateway, racks, cards, points: placed };
}
