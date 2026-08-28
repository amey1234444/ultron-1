import type { DeviceNode } from './devices';
import { normalizeChannelConfig, type CardConfig, type CardNode, type CardType, type ProcessDisplayPrecision, type ProcessInputType } from './rack';
import { restingValue, type SimulatedChannel, type SimulatedChannelKind, type SimulationBehaviour } from './simulation';

type Profile = 'healthy' | 'faulty' | 'prediction';

type GatewayProfile = {
  profile: Profile;
  gatewayId: string;
  name: string;
  ipPrefix: string;
  realGatewayId: string;
  racks: Array<{ id: string; name: string; host: string; realRackId: number }>;
};

type SseChannelSpec = {
  key: string;
  rack: 1 | 2;
  slot: number;
  label: string;
  cardType: CardType;
  kind: SimulatedChannelKind;
  unit: string;
  rangeMin: number;
  rangeMax: number;
  lowLow?: number;
  low?: number;
  healthy: number;
  high?: number;
  highHigh?: number;
  decimals: number;
  samplesPerSecond: number;
  inputType?: ProcessInputType;
  precision?: ProcessDisplayPrecision;
};

const PROFILES: GatewayProfile[] = [
  {
    profile: 'healthy',
    gatewayId: 'sim-sse-gw-healthy',
    name: 'GATEWAY_SSE_HEALTHY',
    ipPrefix: '10.99.2',
    realGatewayId: 'sim-gw-sse-healthy',
    racks: [
      { id: 'sim-sse-healthy-r1', name: 'Healthy SSE R1', host: '11', realRackId: 1 },
      { id: 'sim-sse-healthy-r2', name: 'Healthy SSE R2', host: '12', realRackId: 2 },
    ],
  },
  {
    profile: 'faulty',
    gatewayId: 'sim-sse-gw-faulty',
    name: 'GATEWAT_SSE_FAULTY',
    ipPrefix: '10.99.3',
    realGatewayId: 'sim-gw-sse-faulty',
    racks: [
      { id: 'sim-sse-faulty-r1', name: 'SSE Faulty R1', host: '11', realRackId: 1 },
      { id: 'sim-sse-faulty-r2', name: 'SSE Faulty R2', host: '12', realRackId: 2 },
    ],
  },
  {
    profile: 'prediction',
    gatewayId: 'sim-sse-gw-prediction',
    name: 'GATEWAY_SSE_PREDICTION',
    ipPrefix: '10.99.4',
    realGatewayId: 'sim-gw-sse-prediction',
    racks: [
      { id: 'sim-sse-prediction-r1', name: 'SSE Prediction R1', host: '11', realRackId: 1 },
      { id: 'sim-sse-prediction-r2', name: 'SSE Prediction R2', host: '12', realRackId: 2 },
    ],
  },
];

const SSE_CHANNELS: SseChannelSpec[] = [
  { key: 'motor-de-vibration', rack: 1, slot: 1, label: 'Motor DE Vibration', cardType: 'Vibration Card', kind: 'Vibration', unit: 'mm/s RMS', rangeMin: 0, rangeMax: 15, healthy: 1.5, high: 2.8, highHigh: 7.1, decimals: 2, samplesPerSecond: 10 },
  { key: 'motor-nde-vibration', rack: 1, slot: 2, label: 'Motor NDE Vibration', cardType: 'Vibration Card', kind: 'Vibration', unit: 'mm/s RMS', rangeMin: 0, rangeMax: 15, healthy: 1.4, high: 2.8, highHigh: 7.1, decimals: 2, samplesPerSecond: 10 },
  { key: 'motor-temperature', rack: 1, slot: 3, label: 'Motor Temperature', cardType: 'RTD Card', kind: 'RTD / Temperature', unit: 'C', rangeMin: 0, rangeMax: 150, healthy: 45, high: 75, highHigh: 90, decimals: 1, samplesPerSecond: 1, precision: '0.0' },
  { key: 'motor-rpm', rack: 1, slot: 4, label: 'Motor RPM', cardType: 'Speed Card', kind: 'Speed / RPM', unit: 'RPM', rangeMin: 0, rangeMax: 3000, lowLow: 1800, low: 1900, healthy: 2000, high: 2100, highHigh: 2200, decimals: 0, samplesPerSecond: 1, precision: '0' },
  { key: 'motor-power', rack: 1, slot: 5, label: 'Motor Power', cardType: 'Universal V/I Card', kind: 'Universal Voltage / Current', unit: 'kW', rangeMin: 0, rangeMax: 40, healthy: 18, high: 24, highHigh: 30, decimals: 1, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0.0' },
  { key: 'gearbox-input-vibration', rack: 1, slot: 6, label: 'Gearbox Input Vibration', cardType: 'Vibration Card', kind: 'Vibration', unit: 'mm/s RMS', rangeMin: 0, rangeMax: 15, healthy: 1.5, high: 2.8, highHigh: 7.1, decimals: 2, samplesPerSecond: 10 },
  { key: 'gearbox-output-vibration', rack: 1, slot: 7, label: 'Gearbox Output Vibration', cardType: 'Vibration Card', kind: 'Vibration', unit: 'mm/s RMS', rangeMin: 0, rangeMax: 15, healthy: 1.6, high: 2.8, highHigh: 7.1, decimals: 2, samplesPerSecond: 10 },
  { key: 'gearbox-temperature', rack: 1, slot: 8, label: 'Gearbox Temperature', cardType: 'RTD Card', kind: 'RTD / Temperature', unit: 'C', rangeMin: 0, rangeMax: 150, healthy: 52, high: 70, highHigh: 85, decimals: 1, samplesPerSecond: 1, precision: '0.0' },
  { key: 'hopper-level', rack: 1, slot: 9, label: 'Hopper Level', cardType: 'Universal V/I Card', kind: 'Universal Voltage / Current', unit: '%', rangeMin: 0, rangeMax: 100, lowLow: 15, low: 30, healthy: 70, high: 90, highHigh: 95, decimals: 1, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0.0' },
  { key: 'zone-1-temperature', rack: 1, slot: 10, label: 'Zone 1 Temperature', cardType: 'RTD Card', kind: 'RTD / Temperature', unit: 'C', rangeMin: 0, rangeMax: 300, lowLow: 180, low: 190, healthy: 200, high: 210, highHigh: 220, decimals: 1, samplesPerSecond: 1, precision: '0.0' },
  { key: 'zone-2-temperature', rack: 1, slot: 11, label: 'Zone 2 Temperature', cardType: 'RTD Card', kind: 'RTD / Temperature', unit: 'C', rangeMin: 0, rangeMax: 300, lowLow: 180, low: 190, healthy: 200, high: 210, highHigh: 220, decimals: 1, samplesPerSecond: 1, precision: '0.0' },
  { key: 'zone-3-temperature', rack: 1, slot: 12, label: 'Zone 3 Temperature', cardType: 'RTD Card', kind: 'RTD / Temperature', unit: 'C', rangeMin: 0, rangeMax: 300, lowLow: 180, low: 190, healthy: 200, high: 210, highHigh: 220, decimals: 1, samplesPerSecond: 1, precision: '0.0' },
  { key: 'melt-temperature', rack: 2, slot: 1, label: 'Melt Temperature', cardType: 'RTD Card', kind: 'RTD / Temperature', unit: 'C', rangeMin: 0, rangeMax: 300, lowLow: 200, low: 210, healthy: 220, high: 230, highHigh: 240, decimals: 1, samplesPerSecond: 1, precision: '0.0' },
  { key: 'melt-pressure', rack: 2, slot: 2, label: 'Melt Pressure', cardType: 'Universal V/I Card', kind: 'Pressure', unit: 'MPa', rangeMin: 0, rangeMax: 20, lowLow: 5.6, low: 6.8, healthy: 8.0, high: 9.2, highHigh: 10.4, decimals: 2, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0.00' },
  { key: 'screw-rpm', rack: 2, slot: 3, label: 'Screw RPM', cardType: 'Speed Card', kind: 'Speed / RPM', unit: 'RPM', rangeMin: 0, rangeMax: 150, lowLow: 58.5, low: 61.75, healthy: 65, high: 68.25, highHigh: 71.5, decimals: 2, samplesPerSecond: 1, precision: '0.00' },
];

const FAULT_DANGER_KEYS = new Set(['motor-de-vibration', 'motor-temperature', 'gearbox-output-vibration', 'hopper-level', 'melt-pressure']);
const FAULT_ALERT_KEYS = new Set(['motor-power', 'zone-1-temperature']);
const PREDICTION_KEYS = new Set(['motor-de-vibration', 'motor-temperature', 'gearbox-temperature', 'hopper-level', 'zone-1-temperature', 'melt-temperature', 'melt-pressure']);
const SSE_PROFILE_NAMES = new Set(PROFILES.map((profile) => profile.name));
const WANTED_DEVICE_IDS = new Set(PROFILES.flatMap((profile) => [profile.gatewayId, ...profile.racks.map((rack) => rack.id)]));

function behaviourFor(profile: Profile, spec: SseChannelSpec): SimulationBehaviour {
  if (profile === 'healthy') return 'Steady';
  if (profile === 'prediction') return PREDICTION_KEYS.has(spec.key) ? 'Predictive Drift' : 'Steady';
  if (FAULT_DANGER_KEYS.has(spec.key)) return 'Ramp To Danger';
  if (FAULT_ALERT_KEYS.has(spec.key)) return 'Ramp To Alert';
  return 'Steady';
}

function channelFor(spec: SseChannelSpec, profile: Profile): SimulatedChannel {
  const base: SimulatedChannel = {
    enabled: true,
    kind: spec.kind,
    unit: spec.unit,
    min: spec.rangeMin,
    max: spec.rangeMax,
    healthyValue: spec.healthy,
    alertLimit: spec.high ?? null,
    dangerLimit: spec.highHigh ?? null,
    samplesPerSecond: spec.samplesPerSecond,
    behaviour: behaviourFor(profile, spec),
    decimals: spec.decimals,
    manualValue: null,
  };
  return { ...base, manualValue: restingValue(base) };
}

function configFor(spec: SseChannelSpec): CardConfig {
  const common = {
    channelNames: [spec.label],
    unit: spec.unit,
    rangeMin: String(spec.rangeMin),
    rangeMax: String(spec.rangeMax),
    healthyValue: String(spec.healthy),
    alarmLowLowEnabled: spec.lowLow !== undefined,
    alarmLowLow: spec.lowLow !== undefined ? String(spec.lowLow) : '',
    alarmLowEnabled: spec.low !== undefined,
    alarmLow: spec.low !== undefined ? String(spec.low) : '',
    alarmHighEnabled: spec.high !== undefined,
    alarmHigh: spec.high !== undefined ? String(spec.high) : '',
    alarmHighHighEnabled: spec.highHigh !== undefined,
    alarmHighHigh: spec.highHigh !== undefined ? String(spec.highHigh) : '',
    displayPrecision: spec.precision ?? '0.00',
  };
  if (spec.cardType === 'Vibration Card') {
    return normalizeChannelConfig('Vibration Card', {
      ...common,
      sensorType: 'Accelerometer',
      sensitivity: '100 mV/g',
      samplingRate: `${spec.samplesPerSecond} Hz`,
    });
  }
  if (spec.cardType === 'Speed Card') {
    return normalizeChannelConfig('Speed Card', {
      ...common,
      inputType: 'RPM',
      pulsesPerRevolution: '1',
      trigger: 'Rising',
      triggerHysteresis: '0.2 V',
    });
  }
  return normalizeChannelConfig(spec.cardType, {
    ...common,
    inputType: spec.inputType ?? '4-20 mA',
  });
}

function cardsForRack(rackId: string, profile: Profile, rackNumber: 1 | 2): CardNode[] {
  return SSE_CHANNELS.filter((spec) => spec.rack === rackNumber).map((spec) => {
    return {
      id: `${rackId}-slot-${spec.slot}`,
      deviceId: rackId,
      slot: spec.slot,
      type: spec.cardType,
      enabled: true,
      config: configFor(spec),
      simulation: [channelFor(spec, profile)],
    };
  });
}

function desiredDevices(projectId: string | null): DeviceNode[] {
  return PROFILES.flatMap((profile) => [
    {
      id: profile.gatewayId,
      name: profile.name,
      type: 'Gateway' as const,
      model: 'GW-100',
      ip: `${profile.ipPrefix}.1`,
      port: '1883',
      protocol: 'Modbus TCP' as const,
      description: 'Generated SSE simulation gateway',
      status: 'Online' as const,
      projectId,
      realGatewayId: profile.realGatewayId,
      realRackId: null,
      archived: false,
      simulated: true,
    },
    ...profile.racks.map((rack) => ({
      id: rack.id,
      name: rack.name,
      type: 'Rack' as const,
      model: 'RACK-12-R',
      ip: `${profile.ipPrefix}.${rack.host}`,
      port: '1883',
      protocol: 'Modbus TCP' as const,
      description: 'Generated SSE simulation rack',
      status: 'Online' as const,
      projectId,
      gatewayId: profile.gatewayId,
      realGatewayId: profile.realGatewayId,
      realRackId: rack.realRackId,
      archived: false,
      simulated: true,
    })),
  ]);
}

function desiredCards(): CardNode[] {
  return PROFILES.flatMap((profile) => profile.racks.flatMap((rack) => cardsForRack(rack.id, profile.profile, rack.realRackId === 1 ? 1 : 2)));
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isStaleSseSimulationDevice(device: DeviceNode): boolean {
  if (device.archived) return false;
  if (WANTED_DEVICE_IDS.has(device.id)) return false;
  const name = device.name.trim();
  const reservedSseAddress = device.simulated === true && PROFILES.some((profile) => device.ip.trim().startsWith(`${profile.ipPrefix}.`));
  return (
    SSE_PROFILE_NAMES.has(name) ||
    name.startsWith('Healthy SSE R') ||
    name.startsWith('SSE Faulty R') ||
    name.startsWith('SSE Prediction R') ||
    device.id.startsWith('sim-sse-') ||
    (device.realGatewayId?.startsWith('sim-gw-sse-') ?? false) ||
    reservedSseAddress
  );
}

export function ensureSseSimulationWorkspace(
  devices: DeviceNode[],
  cards: CardNode[],
): { devices: DeviceNode[]; cards: CardNode[]; changed: boolean } {
  const projectId = devices.find((device) => device.projectId)?.projectId ?? null;
  const wantedDevices = desiredDevices(projectId);
  const wantedCards = desiredCards();
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const staleDeviceIds = new Set(devices.filter(isStaleSseSimulationDevice).map((device) => device.id));
  let changed = false;

  for (const id of staleDeviceIds) {
    const current = deviceById.get(id);
    if (!current) continue;
    deviceById.set(id, { ...current, archived: true });
    changed = true;
  }

  for (const device of wantedDevices) {
    const current = deviceById.get(device.id);
    if (!current || !sameJson(current, device)) {
      deviceById.set(device.id, device);
      changed = true;
    }
  }

  for (const card of wantedCards) {
    const current = cardById.get(card.id);
    if (!current || !sameJson(current, card)) {
      cardById.set(card.id, card);
      changed = true;
    }
  }

  return { devices: [...deviceById.values()], cards: [...cardById.values()].filter((card) => !staleDeviceIds.has(card.deviceId)), changed };
}
