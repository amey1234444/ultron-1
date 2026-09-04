// TEMPORARY verification harness for the machine Overview and Analysis pages.
// Delete before commit.
//
// This is deliberately NOT a mock. It builds a simulated gateway and rack in the
// ordinary workspace shape, configures one signal per channel exactly the way the
// Simulation Mode screen does, and runs the real `useSimulationEngine`. The
// engine publishes through `publishLiveMeasurements` onto the same measurement
// bus that MQTT ingest publishes to, so what these pages read here is what they
// read against a physical gateway.
//
// Three channels carry fault-injection behaviours, so the pages have something
// they are supposed to report:
//
//   V1 DE Vibration H   Ramp To Danger  alert 3.5  danger 4.8  -> DANGER
//   V2 DE Vibration V   Ramp To Alert   alert 3.5  danger 4.8  -> ALERT
//   T1 DE Bearing Temp  Ramp To Alert   alert 65   danger 78   -> ALERT
//   T2 NDE Bearing Temp Steady                                 -> NORMAL
//   P1 Inlet Pressure   Steady                                 -> NORMAL
//   C1 Motor Current    Steady                                 -> NORMAL
//   S1 Rotor Speed      Steady                                 -> NORMAL
//
// Vibration and temperature elevated together on one component is the
// bearing-wear signature, so a correct Analysis page reports that rule rather
// than three unrelated limit breaches.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useColorScheme } from 'nativewind';

import { MachineAnalysisWorkspace } from '../../components/console/machine/MachineAnalysisWorkspace';
import { MachineOverviewPage } from '../../components/console/machine/MachineOverviewPage';
import { RackOccupancyView } from '../../components/console/machine/RackOccupancyView';
import { TrendView } from '../../components/console/machine/TrendView';
import type { MappedChannel } from '../../components/console/machine/RackOccupancyView';
import { useSimulationEngine } from '../../hooks/useSimulationEngine';
import { consolePalette } from '../../lib/consoleTheme';
import type { DeviceNode } from '../../lib/devices';
import { componentsForTemplate, expectedPointsForTemplate, type MachineNode } from '../../lib/machines';
import { listChannels, type CardNode } from '../../lib/rack';
import {
  defaultSimulatedChannel,
  type SimulatedChannel,
  type SimulatedChannelKind,
  type SimulationBehaviour,
} from '../../lib/simulation';

const GATEWAY_ID = 'sim-gw-qa';
const RACK_REAL_ID = 1;

const GATEWAY: DeviceNode = {
  id: 'qa-sim-gateway',
  name: 'QA Simulated Gateway',
  type: 'Gateway',
  model: 'BlackGATE-GW',
  ip: '10.99.1.1',
  port: '1883',
  protocol: 'Modbus TCP',
  description: 'Virtual gateway for the QA harness',
  status: 'Online',
  projectId: 'qa-plant',
  realGatewayId: GATEWAY_ID,
  simulated: true,
  archived: false,
};

const RACK: DeviceNode = {
  id: 'qa-sim-rack',
  name: 'Rack-QA-1',
  type: 'Rack',
  model: 'RACK-12-R',
  ip: '10.99.1.11',
  port: '502',
  protocol: 'Modbus TCP',
  description: 'Virtual rack for the QA harness',
  status: 'Online',
  projectId: 'qa-plant',
  gatewayId: GATEWAY.id,
  realGatewayId: GATEWAY_ID,
  realRackId: RACK_REAL_ID,
  simulated: true,
  archived: false,
};

// One signal per channel, in the shape the Simulation Mode screen stores.
function signal(
  kind: SimulatedChannelKind,
  behaviour: SimulationBehaviour,
  over: Partial<SimulatedChannel>,
): SimulatedChannel {
  return { ...defaultSimulatedChannel(kind), behaviour, ...over };
}

type SlotSpec = {
  slot: number;
  label: string;
  type: CardNode['type'];
  channel: SimulatedChannel;
};

const SLOTS: SlotSpec[] = [
  {
    slot: 1,
    label: 'DE Vibration H',
    type: 'Vibration Card',
    channel: signal('Vibration', 'Ramp To Danger', {
      unit: 'mm/s',
      min: 1.2,
      max: 5.5,
      alertLimit: 3.5,
      dangerLimit: 4.8,
      samplesPerSecond: 4,
      decimals: 2,
    }),
  },
  {
    slot: 2,
    label: 'DE Vibration V',
    type: 'Vibration Card',
    channel: signal('Vibration', 'Ramp To Alert', {
      unit: 'mm/s',
      min: 1.2,
      max: 5.5,
      alertLimit: 3.5,
      dangerLimit: 4.8,
      samplesPerSecond: 4,
      decimals: 2,
    }),
  },
  {
    slot: 3,
    label: 'DE Bearing Temp',
    type: 'Process Card',
    channel: signal('RTD / Temperature', 'Ramp To Alert', {
      unit: '°C',
      min: 40,
      max: 90,
      alertLimit: 65,
      dangerLimit: 78,
      samplesPerSecond: 2,
      decimals: 1,
    }),
  },
  {
    slot: 4,
    label: 'NDE Bearing Temp',
    type: 'Process Card',
    channel: signal('RTD / Temperature', 'Steady', {
      unit: '°C',
      min: 40,
      max: 90,
      alertLimit: 65,
      dangerLimit: 78,
      samplesPerSecond: 2,
      decimals: 1,
    }),
  },
  {
    slot: 5,
    label: 'Inlet Pressure',
    type: 'Process Card',
    channel: signal('Pressure', 'Cycle', {
      unit: 'bar',
      min: 0.6,
      max: 1.1,
      alertLimit: 1.5,
      dangerLimit: 1.9,
      samplesPerSecond: 2,
      decimals: 2,
    }),
  },
  {
    slot: 6,
    label: 'Motor Current',
    type: 'Process Card',
    channel: signal('Universal Voltage / Current', 'Steady', {
      unit: 'A',
      min: 14,
      max: 22,
      alertLimit: 30,
      dangerLimit: 36,
      samplesPerSecond: 2,
      decimals: 1,
    }),
  },
  {
    slot: 7,
    label: 'Rotor Speed',
    type: 'Speed Card',
    channel: signal('Speed / RPM', 'Steady', {
      unit: 'rpm',
      min: 1440,
      max: 1480,
      alertLimit: 1600,
      dangerLimit: 1750,
      samplesPerSecond: 1,
      decimals: 0,
    }),
  },
];

// A simulated card carries its signal definition per channel; the card config
// mirrors channel 1, which is what a commissioning engineer would have typed.
function cardFor(spec: SlotSpec): CardNode {
  const { channel } = spec;
  const alarmWarning = channel.alertLimit === null ? '' : String(channel.alertLimit);
  const alarmCritical = channel.dangerLimit === null ? '' : String(channel.dangerLimit);

  const config =
    spec.type === 'Vibration Card'
      ? {
          channelNames: [spec.label],
          sensorType: 'Accelerometer',
          sensitivity: '100 mV/g',
          engineeringUnit: channel.unit,
          measurementRangeMin: String(channel.min),
          measurementRangeMax: String(channel.max),
          samplingRate: String(channel.samplesPerSecond),
          alarmWarning,
          alarmCritical,
        }
      : spec.type === 'Speed Card'
        ? {
            channelNames: [spec.label],
            inputType: 'RPM',
            pulsesPerRevolution: '60',
            trigger: 'Rising',
            hysteresis: '5',
            minSpeed: String(channel.min),
            maxSpeed: String(channel.max),
            alarmWarning,
            alarmCritical,
          }
        : {
            channelNames: [spec.label],
            tag: '',
            inputType: '4-20 mA',
            engineeringMin: String(channel.min),
            engineeringMax: String(channel.max),
            unit: channel.unit,
            scaling: '1',
            offset: '0',
            filter: '',
            alarmLowLowEnabled: false,
            alarmLowEnabled: false,
            alarmHighEnabled: !!alarmWarning,
            alarmHighHighEnabled: !!alarmCritical,
            alarmLowLow: '',
            alarmLow: '',
            alarmHigh: alarmWarning,
            alarmHighHigh: alarmCritical,
            hysteresis: String((channel.max - channel.min) * 0.01),
            alarmDelay: '0',
            displayPrecision: '0.00',
            alarmWarning,
            alarmCritical,
          };

  return {
    id: `qa-card-${spec.slot}`,
    deviceId: RACK.id,
    slot: spec.slot,
    type: spec.type,
    enabled: true,
    config: config as CardNode['config'],
    simulation: [spec.channel],
  };
}

function Harness() {
  const { setColorScheme } = useColorScheme();
  const [dark, setDark] = useState(true);
  const [view, setView] = useState<'overview' | 'analysis' | 'rack' | 'trend'>('overview');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isDark = params.get('theme') !== 'light';
    setDark(isDark);
    setColorScheme(isDark ? 'dark' : 'light');
    const requested = params.get('view');
    setView(requested === 'analysis' || requested === 'rack' || requested === 'trend' ? requested : 'overview');
  }, [setColorScheme]);

  const devices = useMemo<DeviceNode[]>(() => [GATEWAY, RACK], []);
  const cards = useMemo<CardNode[]>(() => SLOTS.map(cardFor), []);

  // The real engine. Everything the pages show below comes from what this
  // publishes — onto the measurement bus, and as the LiveState the pages take as
  // a prop, exactly as the console wires it.
  const live = useSimulationEngine(devices, cards, true);

  const machine = useMemo<MachineNode>(() => {
    let counter = 0;
    return {
      id: 'qa-machine-rav',
      projectId: 'qa-plant',
      folderId: 'qa-area',
      name: 'RAV-01',
      template: 'Rotary Airlock Valve',
      components: componentsForTemplate('Rotary Airlock Valve', () => `qa-c-${counter++}`),
    };
  }, []);

  const mappedChannels = useMemo<MappedChannel[]>(
    () =>
      listChannels(devices, cards).map((channel) => ({
        id: `qa-box-${channel.id}`,
        channel,
        label: channel.label,
      })),
    [devices, cards],
  );

  const palette = consolePalette(dark);

  return (
    <View style={{ flex: 1, height: '100vh' as never, backgroundColor: palette.bg }}>
      {view === 'overview' ? (
        <MachineOverviewPage
          machine={machine}
          mappedChannels={mappedChannels}
          devices={devices}
          cards={cards}
          live={live}
          expectedPoints={expectedPointsForTemplate(machine.template)}
        />
      ) : view === 'rack' ? (
        <RackOccupancyView devices={devices} cards={cards} live={live} mappedChannels={mappedChannels} />
      ) : view === 'trend' ? (
        <TrendView mappedChannels={mappedChannels} devices={devices} machineId={machine.id} />
      ) : (
        <MachineAnalysisWorkspace
          machine={machine}
          mappedChannels={mappedChannels}
          devices={devices}
          cards={cards}
          live={live}
          hierarchyPath="QA Plant → Area 1"
        />
      )}
    </View>
  );
}

const ClientHarness = dynamic(() => Promise.resolve(Harness), { ssr: false });

export default function MachineQaPage() {
  return <ClientHarness />;
}
