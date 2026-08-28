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
  label: string;
  cardType: CardType;
  kind: SimulatedChannelKind;
  unit: string;
  min: number;
  max: number;
  alert: number;
  danger: number;
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
  { key: 'gearbox-input-vib', label: 'Gearbox Input Vibration', cardType: 'Vibration Card', kind: 'Vibration', unit: 'mm/s', min: 1.1, max: 2.2, alert: 4.5, danger: 6.5, decimals: 2, samplesPerSecond: 4 },
  { key: 'gearbox-output-vib', label: 'Gearbox Output Vibration', cardType: 'Vibration Card', kind: 'Vibration', unit: 'mm/s', min: 1.0, max: 2.0, alert: 4.2, danger: 6.2, decimals: 2, samplesPerSecond: 4 },
  { key: 'motor-current', label: 'Motor Current', cardType: 'Process Card', kind: 'Universal Voltage / Current', unit: 'A', min: 18, max: 28, alert: 38, danger: 45, decimals: 2, samplesPerSecond: 1, inputType: '4-20 mA' },
  { key: 'screw-rpm', label: 'Screw RPM', cardType: 'Speed Card', kind: 'Speed / RPM', unit: 'rpm', min: 42, max: 48, alert: 55, danger: 65, decimals: 0, samplesPerSecond: 1 },
  { key: 'barrel-zone-1-temp', label: 'Barrel Zone 1 Temperature', cardType: 'Process Card', kind: 'RTD / Temperature', unit: 'C', min: 172, max: 184, alert: 210, danger: 230, decimals: 1, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0.0' },
  { key: 'barrel-zone-2-temp', label: 'Barrel Zone 2 Temperature', cardType: 'Process Card', kind: 'RTD / Temperature', unit: 'C', min: 182, max: 194, alert: 220, danger: 240, decimals: 1, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0.0' },
  { key: 'barrel-zone-3-temp', label: 'Barrel Zone 3 Temperature', cardType: 'Process Card', kind: 'RTD / Temperature', unit: 'C', min: 190, max: 202, alert: 230, danger: 250, decimals: 1, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0.0' },
  { key: 'melt-temp', label: 'Melt Temperature', cardType: 'Process Card', kind: 'RTD / Temperature', unit: 'C', min: 196, max: 206, alert: 235, danger: 255, decimals: 1, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0.0' },
  { key: 'melt-pressure', label: 'Melt Pressure', cardType: 'Process Card', kind: 'Pressure', unit: 'bar', min: 86, max: 110, alert: 145, danger: 170, decimals: 1, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0.0' },
  { key: 'die-pressure', label: 'Die Pressure', cardType: 'Process Card', kind: 'Pressure', unit: 'bar', min: 72, max: 94, alert: 130, danger: 155, decimals: 1, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0.0' },
  { key: 'feed-rate', label: 'Feed Rate', cardType: 'Process Card', kind: 'Universal Voltage / Current', unit: 'kg/h', min: 180, max: 230, alert: 280, danger: 325, decimals: 0, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0' },
  { key: 'heater-current', label: 'Heater Current', cardType: 'Process Card', kind: 'Universal Voltage / Current', unit: 'A', min: 9, max: 15, alert: 21, danger: 26, decimals: 1, samplesPerSecond: 1, inputType: '4-20 mA', precision: '0.0' },
];

function behaviourFor(profile: Profile, slot: number): SimulationBehaviour {
  if (profile === 'healthy') return 'Steady';
  if (profile === 'prediction') return [1, 3, 8, 9, 10].includes(slot) ? 'Predictive Drift' : 'Steady';
  return [1, 3, 7, 9].includes(slot) ? 'Ramp To Danger' : [5, 10].includes(slot) ? 'Ramp To Alert' : 'Steady';
}

function channelFor(spec: SseChannelSpec, profile: Profile, slot: number): SimulatedChannel {
  const base: SimulatedChannel = {
    enabled: true,
    kind: spec.kind,
    unit: spec.unit,
    min: spec.min,
    max: spec.max,
    alertLimit: spec.alert,
    dangerLimit: spec.danger,
    samplesPerSecond: spec.samplesPerSecond,
    behaviour: behaviourFor(profile, slot),
    decimals: spec.decimals,
    manualValue: null,
  };
  return { ...base, manualValue: restingValue(base) };
}

function configFor(spec: SseChannelSpec): CardConfig {
  if (spec.cardType === 'Vibration Card') {
    return normalizeChannelConfig('Vibration Card', {
      channelNames: [spec.label],
      sensorType: 'Accelerometer',
      sensitivity: '100 mV/g',
      samplingRate: `${spec.samplesPerSecond} Hz`,
      unit: spec.unit,
      alarmHighEnabled: true,
      alarmHigh: String(spec.alert),
      alarmHighHighEnabled: true,
      alarmHighHigh: String(spec.danger),
      displayPrecision: spec.precision ?? '0.00',
    });
  }
  if (spec.cardType === 'Speed Card') {
    return normalizeChannelConfig('Speed Card', {
      channelNames: [spec.label],
      inputType: 'RPM',
      pulsesPerRevolution: '1',
      trigger: 'Rising',
      triggerHysteresis: '0.2 V',
      unit: spec.unit,
      alarmHighEnabled: true,
      alarmHigh: String(spec.alert),
      alarmHighHighEnabled: true,
      alarmHighHigh: String(spec.danger),
      displayPrecision: spec.precision ?? '0',
    });
  }
  return normalizeChannelConfig('Process Card', {
    channelNames: [spec.label],
    inputType: spec.inputType ?? '4-20 mA',
    unit: spec.unit,
    alarmHighEnabled: true,
    alarmHigh: String(spec.alert),
    alarmHighHighEnabled: true,
    alarmHighHigh: String(spec.danger),
    displayPrecision: spec.precision ?? '0.00',
  });
}

function cardsForRack(rackId: string, profile: Profile): CardNode[] {
  return SSE_CHANNELS.map((spec, index) => {
    const slot = index + 1;
    return {
      id: `${rackId}-slot-${slot}`,
      deviceId: rackId,
      slot,
      type: spec.cardType,
      enabled: true,
      config: configFor(spec),
      simulation: [channelFor(spec, profile, slot)],
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
  return PROFILES.flatMap((profile) => profile.racks.flatMap((rack) => cardsForRack(rack.id, profile.profile)));
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
  let changed = false;

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

  return { devices: [...deviceById.values()], cards: [...cardById.values()], changed };
}
