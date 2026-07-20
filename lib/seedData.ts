import type { DeviceNode } from './devices';
import type { FolderNode, ProjectNode } from './hierarchy';
import { componentsForTemplate, type MachineComponent, type MachineNode, type MeasurementPointStatus } from './machines';
import type { CardNode } from './rack';

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

  const ravComponents = markLive(componentsForTemplate('Rotary Airlock Valve', makeId), 'Winding Temperature');
  const pumpComponents = markLive(componentsForTemplate('Centrifugal Pump', makeId), 'Bearing Temperature');
  const fanComponents = markLive(componentsForTemplate('Fan', makeId));
  const compressorComponents = markLive(componentsForTemplate('Compressor', makeId), 'Discharge Pressure');

  const machines: MachineNode[] = [
    { id: 'seed-machine-rav', projectId: plantNorth.id, folderId: areaNorth.id, name: 'RAV-01', template: 'Rotary Airlock Valve', components: ravComponents },
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
      ip: '192.168.10',
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

  const cards: CardNode[] = [
    {
      id: 'seed-card-1',
      deviceId: 'seed-rack-north-1',
      slot: 1,
      type: 'Vibration Card',
      enabled: true,
      config: {
        channelNames: ['RAV-01 DE Vibration H', 'RAV-01 DE Vibration V'],
        sensorType: 'Accelerometer',
        sensitivity: '100 mV/g',
        engineeringUnit: 'mm/s',
        measurementRangeMin: '0',
        measurementRangeMax: '20',
        samplingRate: '1000',
        alarmWarning: '3.5',
        alarmCritical: '4.8',
      },
    },
    {
      id: 'seed-card-2',
      deviceId: 'seed-rack-north-1',
      slot: 2,
      type: 'Process Card',
      enabled: true,
      config: {
        channelNames: ['RAV-01 Rotor Bearing Temp', '', '', ''],
        inputType: 'RTD 3-wire',
        engineeringMin: '0',
        engineeringMax: '150',
        unit: '°C',
        scaling: '1',
        offset: '0',
        filter: '',
        alarmWarning: '65',
        alarmCritical: '78',
      },
    },
    {
      id: 'seed-card-3',
      deviceId: 'seed-rack-north-2',
      slot: 1,
      type: 'Speed Card',
      enabled: true,
      config: {
        channelNames: ['PUMP-01 Shaft Speed', ''],
        inputType: 'RPM',
        pulsesPerRevolution: '60',
        trigger: 'Rising',
        hysteresis: '5',
        minSpeed: '0',
        maxSpeed: '3600',
        alarmWarning: '1465',
        alarmCritical: '1475',
      },
    },
    {
      id: 'seed-card-4',
      deviceId: 'seed-rack-south-1',
      slot: 1,
      type: 'Vibration Card',
      enabled: true,
      config: {
        channelNames: ['FAN-01 DE Vibration H', 'FAN-01 NDE Vibration H'],
        sensorType: 'Accelerometer',
        sensitivity: '100 mV/g',
        engineeringUnit: 'mm/s',
        measurementRangeMin: '0',
        measurementRangeMax: '20',
        samplingRate: '1000',
        alarmWarning: '3.5',
        alarmCritical: '4.8',
      },
    },
    {
      id: 'seed-card-5',
      deviceId: 'seed-rack-south-2',
      slot: 1,
      type: 'Process Card',
      enabled: true,
      config: {
        channelNames: ['COMP-01 Discharge Pressure', '', '', ''],
        inputType: '4-20 mA',
        engineeringMin: '0',
        engineeringMax: '10',
        unit: 'bar',
        scaling: '1',
        offset: '0',
        filter: '',
        alarmWarning: '4.5',
        alarmCritical: '5.8',
      },
    },
  ];

  return {
    projects: [plantNorth, plantSouth],
    folders: [areaNorth, areaSouth],
    machines,
    devices,
    cards,
  };
}
