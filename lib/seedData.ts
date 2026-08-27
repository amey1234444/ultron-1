import type { DeviceNode } from './devices';
import type { FolderNode, ProjectNode } from './hierarchy';
import { componentsForTemplate, type MachineComponent, type MachineNode, type MeasurementPointStatus } from './machines';
import { normalizeChannelConfig, type CardNode, type ProcessDisplayPrecision, type ProcessInputType } from './rack';

// Demo-only seed data: two plants each with a couple of machines, and a handful of
// online racks with named channels, so the app has something to look at on first
// load instead of every screen being empty. Marks most measurement points
// "Connected" so PointCard's live-value simulation has something to animate.

function markLive(components: MachineComponent[], warningLabel?: string): MachineComponent[] {
  return components.map((component) => ({
    ...component,
    points: component.points.map((point) => {
      const status: MeasurementPointStatus = point.label === warningLabel ? 'Warning' : 'Connected';
      return { ...point, status };
    }),
  }));
}

export function createSeedData(makeId: () => string): {
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices: DeviceNode[];
  cards: CardNode[];
} {
  const plantNorth: ProjectNode = { id: 'seed-plant-north', name: 'Northfield Plant', code: 'NFP', description: 'Seeded demo plant — north site' };
  const plantSouth: ProjectNode = { id: 'seed-plant-south', name: 'Southgate Plant', code: 'SGP', description: 'Seeded demo plant — south site' };

  const areaNorth: FolderNode = { id: 'seed-folder-north', projectId: plantNorth.id, name: 'Area 1', type: 'Area', code: '', description: '', parentId: null };
  const areaSouth: FolderNode = { id: 'seed-folder-south', projectId: plantSouth.id, name: 'Area 1', type: 'Area', code: '', description: '', parentId: null };

  const ravComponents = markLive(componentsForTemplate('Rotary Airlock Valve', makeId), 'DE Bearing Temperature');
  const extruderComponents = markLive(componentsForTemplate('Single Screw Extruder', makeId), 'Melt Pressure');
  const pumpComponents = markLive(componentsForTemplate('Centrifugal Pump', makeId), 'Bearing Temperature');
  const fanComponents = markLive(componentsForTemplate('Fan', makeId));
  const compressorComponents = markLive(componentsForTemplate('Compressor', makeId), 'Discharge Pressure');

  const machines: MachineNode[] = [
    { id: 'seed-machine-rav', projectId: plantNorth.id, folderId: areaNorth.id, name: 'RAV-01', template: 'Rotary Airlock Valve', components: ravComponents },
    { id: 'seed-machine-ext', projectId: plantNorth.id, folderId: areaNorth.id, name: 'EXT-01', template: 'Single Screw Extruder', components: extruderComponents },
    { id: 'seed-machine-pump', projectId: plantNorth.id, folderId: areaNorth.id, name: 'PUMP-01', template: 'Centrifugal Pump', components: pumpComponents },
    { id: 'seed-machine-fan', projectId: plantSouth.id, folderId: areaSouth.id, name: 'FAN-01', template: 'Fan', components: fanComponents },
    { id: 'seed-machine-comp', projectId: plantSouth.id, folderId: areaSouth.id, name: 'COMP-01', template: 'Compressor', components: compressorComponents },
  ];

  const devices: DeviceNode[] = [
    {
      id: 'seed-gateway-north',
      name: 'Gateway-North',
      type: 'Gateway',
      model: 'GW-100',
      ip: '192.168.10.10',
      port: '503',
      protocol: 'Modbus TCP',
      description: 'Seeded demo gateway',
      status: 'Online',
      projectId: plantNorth.id,
      realGatewayId: 'ultron-gw-demo-01',
      archived: false,
    },
    {
      id: 'seed-rack-north-1',
      name: 'Rack-North-1',
      type: 'Rack',
      model: 'RACK-12-R',
      ip: '192.168.10.11',
      port: '502',
      protocol: 'Modbus TCP',
      description: 'Seeded demo rack',
      status: 'Online',
      projectId: plantNorth.id,
      gatewayId: 'seed-gateway-north',
      realRackId: 1,
      archived: false,
    },
    {
      id: 'seed-rack-north-2',
      name: 'Rack-North-2',
      type: 'Rack',
      model: 'RACK-12-R',
      ip: '192.168.10.12',
      port: '502',
      protocol: 'Modbus TCP',
      description: 'Seeded demo rack',
      status: 'Online',
      projectId: plantNorth.id,
      gatewayId: 'seed-gateway-north',
      realRackId: 2,
      archived: false,
    },
    {
      id: 'seed-rack-south-1',
      name: 'Rack-South-1',
      type: 'Rack',
      model: 'RACK-12-R',
      ip: '192.168.10.13',
      port: '502',
      protocol: 'Modbus TCP',
      description: 'Seeded demo rack',
      status: 'Online',
      projectId: plantSouth.id,
      gatewayId: 'seed-gateway-north',
      realRackId: 3,
      archived: false,
    },
    {
      id: 'seed-rack-south-2',
      name: 'Rack-South-2',
      type: 'Rack',
      model: 'RACK-12-R',
      ip: '192.168.10.14',
      port: '502',
      protocol: 'Modbus TCP',
      description: 'Seeded demo rack',
      status: 'Online',
      projectId: plantSouth.id,
      gatewayId: 'seed-gateway-north',
      realRackId: 4,
      archived: false,
    },
  ];

  // One acquisition card carries one channel, so every measurement point below
  // occupies its own slot — the same demo points as before, spread across the
  // rack rather than sharing a card.
  // Every acquisition card is built through `normalizeChannelConfig`, so the
  // seed data is described the same way the editor describes it: alarm levels
  // and a unit, with the operating range derived from them.
  const vibrationCard = (id: string, deviceId: string, slot: number, name: string): CardNode => ({
    id,
    deviceId,
    slot,
    type: 'Vibration Card',
    enabled: true,
    config: normalizeChannelConfig('Vibration Card', {
      channelNames: [name],
      sensorType: 'Accelerometer',
      sensitivity: '100 mV/g',
      samplingRate: '1000 Hz',
      unit: 'mm/s',
      alarmHighEnabled: true,
      alarmHigh: '3.5',
      alarmHighHighEnabled: true,
      alarmHighHigh: '4.8',
      displayPrecision: '0.00',
    }),
  });

  const processCard = (
    id: string,
    deviceId: string,
    slot: number,
    name: string,
    input: ProcessInputType,
    unit: string,
    alarms: [string, string],
    precision: ProcessDisplayPrecision = '0.00',
  ): CardNode => ({
    id,
    deviceId,
    slot,
    type: 'Process Card',
    enabled: true,
    config: normalizeChannelConfig('Process Card', {
      channelNames: [name],
      inputType: input,
      unit,
      alarmHighEnabled: true,
      alarmHigh: alarms[0],
      alarmHighHighEnabled: true,
      alarmHighHigh: alarms[1],
      displayPrecision: precision,
    }),
  });

  const speedCard = (id: string, deviceId: string, slot: number, name: string, pulsesPerRevolution: string, alarms: [string, string]): CardNode => ({
    id,
    deviceId,
    slot,
    type: 'Speed Card',
    enabled: true,
    config: normalizeChannelConfig('Speed Card', {
      channelNames: [name],
      inputType: 'RPM',
      pulsesPerRevolution,
      trigger: 'Rising',
      triggerHysteresis: '0.2 V',
      unit: 'rpm',
      alarmHighEnabled: true,
      alarmHigh: alarms[0],
      alarmHighHighEnabled: true,
      alarmHighHigh: alarms[1],
      displayPrecision: '0',
    }),
  });

  const cards: CardNode[] = [
    vibrationCard('seed-card-1', 'seed-rack-north-1', 1, 'RAV-01 DE Vibration H'),
    vibrationCard('seed-card-rav-vib-v', 'seed-rack-north-1', 2, 'RAV-01 DE Vibration V'),
    processCard('seed-card-2', 'seed-rack-north-1', 3, 'RAV-01 DE Bearing Temp', '4-20 mA', '°C', ['65', '78'], '0.0'),
    processCard('seed-card-rav-nde-temp', 'seed-rack-north-1', 4, 'RAV-01 NDE Bearing Temp', '4-20 mA', '°C', ['65', '78'], '0.0'),
    processCard('seed-card-rav-material-temp', 'seed-rack-north-1', 5, 'RAV-01 Material Temp', '4-20 mA', '°C', ['65', '78'], '0.0'),
    processCard('seed-card-rav-pressure', 'seed-rack-north-1', 6, 'RAV-01 Inlet Pressure', '4-20 mA', 'bar', ['1.2', '1.6'], '0.00'),
    processCard('seed-card-rav-outlet-pressure', 'seed-rack-north-1', 7, 'RAV-01 Outlet Pressure', '4-20 mA', 'bar', ['1.2', '1.6'], '0.00'),
    processCard('seed-card-rav-current', 'seed-rack-north-1', 8, 'RAV-01 Motor Current', '4-20 mA', 'A', ['20', '30'], '0.00'),
    speedCard('seed-card-rav-speed', 'seed-rack-north-1', 9, 'RAV-01 Rotor Speed', '1', ['45', '55']),
    speedCard('seed-card-3', 'seed-rack-north-2', 1, 'PUMP-01 Shaft Speed', '60', ['1465', '1475']),
    vibrationCard('seed-card-4', 'seed-rack-south-1', 1, 'FAN-01 DE Vibration H'),
    vibrationCard('seed-card-fan-nde', 'seed-rack-south-1', 2, 'FAN-01 NDE Vibration H'),
    processCard('seed-card-5', 'seed-rack-south-2', 1, 'COMP-01 Discharge Pressure', '4-20 mA', 'bar', ['4.5', '5.8'], '0.00'),
  ];

  return {
    projects: [plantNorth, plantSouth],
    folders: [areaNorth, areaSouth],
    machines,
    devices,
    cards,
  };
}
