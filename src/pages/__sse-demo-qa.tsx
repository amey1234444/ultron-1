// TEMPORARY verification harness for the three single-screw-extruder demo
// scenarios. Delete before commit.
//
// Same discipline as `__machine-qa.tsx`: nothing here is a mock. The devices and
// cards come from `ensureSseSimulationWorkspace`, which is the same function the
// console runs at startup, so the fifteen channels carry exactly the ranges,
// alarm limits and demo values the demo scripts specify. The real
// `useSimulationEngine` publishes them onto the measurement bus, and the pages
// below read them through the ordinary live path.
//
//   /__sse-demo-qa?profile=healthy|faulty|prediction&view=analysis|overview|trend
//
// The canvas mapping a commissioning engineer would draw is declared once, in
// PAD_FOR_CHANNEL_LABEL, so each rack channel lands on the extruder pad it
// physically belongs to — the same mapping the demo scenario checks use.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useColorScheme } from 'nativewind';

import { MachineAnalysisWorkspace } from '../../components/console/machine/MachineAnalysisWorkspace';
import { MachineOverviewPage } from '../../components/console/machine/MachineOverviewPage';
import { TrendView } from '../../components/console/machine/TrendView';
import type { MappedChannel } from '../../components/console/machine/RackOccupancyView';
import { useSimulationEngine } from '../../hooks/useSimulationEngine';
import { attributeToComponent } from '../../lib/condition';
import { consolePalette } from '../../lib/consoleTheme';
import type { DeviceNode } from '../../lib/devices';
import { componentsForTemplate, expectedPointsForTemplate, type MachineNode } from '../../lib/machines';
import { listChannels, type CardNode } from '../../lib/rack';
import { ensureSseSimulationWorkspace } from '../../lib/sseSimulationProfile';

type Profile = 'healthy' | 'faulty' | 'prediction';

const RACK_IDS: Record<Profile, string[]> = {
  healthy: ['sim-sse-healthy-r1', 'sim-sse-healthy-r2'],
  faulty: ['sim-sse-faulty-r1', 'sim-sse-faulty-r2'],
  prediction: ['sim-sse-prediction-r1', 'sim-sse-prediction-r2'],
};

const MACHINE_NAME: Record<Profile, string> = {
  healthy: 'Healthy SSE Demo',
  faulty: 'Faulty SSE Demo',
  prediction: 'SSE Prediction Demo',
};

const PAD_FOR_CHANNEL_LABEL: Record<string, { code: string; label: string }> = {
  'Motor DE Vibration': { code: 'MOTOR_DE_VIB', label: 'Motor Driving End Vibration' },
  'Motor NDE Vibration': { code: 'MOTOR_NDE_VIB', label: 'Motor Non Driving End Vibration' },
  'Motor Temperature': { code: 'MOTOR_TEMP', label: 'Motor Temperature' },
  'Motor RPM': { code: 'MOTOR_RPM', label: 'Motor RPM' },
  'Motor Power': { code: 'MOTOR_POWER', label: 'Motor Power' },
  'Gearbox Input Vibration': { code: 'GEARBOX_VIB_IN', label: 'Gearbox Vibration at In' },
  'Gearbox Output Vibration': { code: 'GEARBOX_VIB', label: 'Gearbox Vibration at Out' },
  'Gearbox Temperature': { code: 'GEARBOX_TEMP', label: 'Gearbox Temperature' },
  'Hopper Level': { code: 'HOPPER_LEVEL', label: 'Hopper Level' },
  'Zone 1 Temperature': { code: 'BARREL_Z1_TEMP', label: 'Barrel Zone 1 Temperature' },
  'Zone 2 Temperature': { code: 'BARREL_Z2_TEMP', label: 'Barrel Zone 2 Temperature' },
  'Zone 3 Temperature': { code: 'BARREL_Z3_TEMP', label: 'Barrel Zone 3 Temperature' },
  'Melt Temperature': { code: 'MELT_TEMP', label: 'Melt Temperature' },
  'Melt Pressure': { code: 'MELT_PRESSURE', label: 'Melt Pressure' },
  'Screw RPM': { code: 'SCREW_RPM', label: 'Screw RPM' },
};

const WORKSPACE = ensureSseSimulationWorkspace([], []);

function Harness() {
  const { setColorScheme } = useColorScheme();
  const [dark, setDark] = useState(true);
  const [profile, setProfile] = useState<Profile>('healthy');
  const [view, setView] = useState<'analysis' | 'overview' | 'trend'>('analysis');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isDark = params.get('theme') !== 'light';
    setDark(isDark);
    setColorScheme(isDark ? 'dark' : 'light');
    const wantedProfile = params.get('profile');
    if (wantedProfile === 'faulty' || wantedProfile === 'prediction' || wantedProfile === 'healthy') {
      setProfile(wantedProfile);
    }
    const wantedView = params.get('view');
    setView(wantedView === 'overview' || wantedView === 'trend' ? wantedView : 'analysis');
  }, [setColorScheme]);

  const devices = useMemo<DeviceNode[]>(() => {
    const rackIds = new Set(RACK_IDS[profile]);
    return WORKSPACE.devices.filter((device) => device.type !== 'Rack' || rackIds.has(device.id));
  }, [profile]);

  const cards = useMemo<CardNode[]>(() => {
    const rackIds = new Set(RACK_IDS[profile]);
    return WORKSPACE.cards.filter((card) => rackIds.has(card.deviceId));
  }, [profile]);

  const live = useSimulationEngine(devices, cards, true);

  const machine = useMemo<MachineNode>(() => {
    let counter = 0;
    return {
      id: `sse-demo-${profile}`,
      projectId: 'sse-demo',
      folderId: 'sse-demo-area',
      name: MACHINE_NAME[profile],
      template: 'Single Screw Extruder',
      components: componentsForTemplate('Single Screw Extruder', () => `sse-c-${profile}-${counter++}`),
    };
  }, [profile]);

  const mappedChannels = useMemo<MappedChannel[]>(
    () =>
      listChannels(devices, cards).flatMap((channel) => {
        const pad = PAD_FOR_CHANNEL_LABEL[channel.label];
        if (!pad) return [];
        return [{ id: `sse-box-${profile}-${pad.code}`, channel, label: pad.label, templatePointCode: pad.code }];
      }),
    [devices, cards, profile],
  );

  const componentIdFor = useMemo(
    () => (mapped: MappedChannel) => attributeToComponent(mapped.label, machine.components) ?? undefined,
    [machine.components],
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
          componentIdFor={componentIdFor}
        />
      ) : view === 'trend' ? (
        <TrendView mappedChannels={mappedChannels} devices={devices} machineId={machine.id} />
      ) : (
        <MachineAnalysisWorkspace
          machine={machine}
          mappedChannels={mappedChannels}
          devices={devices}
          cards={cards}
          live={live}
          hierarchyPath="SSE Demo → Extrusion"
        />
      )}
    </View>
  );
}

const ClientHarness = dynamic(() => Promise.resolve(Harness), { ssr: false });

export default function SseDemoQaPage() {
  return <ClientHarness />;
}
