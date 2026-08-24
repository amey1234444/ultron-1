// TEMPORARY visual-QA harness for the machine Overview and Analysis pages.
// Delete before commit.
//
// Renders the two new pages against seeded rack data with no AuthGate, so they
// can be looked at without a database or a session. `?view=analysis` switches.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useColorScheme } from 'nativewind';

import { MachineAnalysisWorkspace } from '../../components/console/machine/MachineAnalysisWorkspace';
import { MachineOverviewPage } from '../../components/console/machine/MachineOverviewPage';
import type { MappedChannel } from '../../components/console/machine/RackOccupancyView';
import { consolePalette } from '../../lib/consoleTheme';
import { expectedPointsForTemplate } from '../../lib/machines';
import { listChannels } from '../../lib/rack';
import { createSeedData } from '../../lib/seedData';

function Harness() {
  const { setColorScheme } = useColorScheme();
  const [dark, setDark] = useState(true);
  const [view, setView] = useState<'overview' | 'analysis'>('overview');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isDark = params.get('theme') !== 'light';
    setDark(isDark);
    setColorScheme(isDark ? 'dark' : 'light');
    setView(params.get('view') === 'analysis' ? 'analysis' : 'overview');
  }, [setColorScheme]);

  const seed = useMemo(() => {
    let counter = 0;
    return createSeedData(() => `qa-${counter++}`);
  }, []);

  const machine = seed.machines.find((m) => m.id === 'seed-machine-rav')!;
  const cards = seed.cards.filter((c) => c.deviceId === 'seed-rack-north-1');
  const devices = seed.devices.filter((d) => d.id === 'seed-rack-north-1' || d.type === 'Gateway');

  // Every channel on this machine's own rack that commissioning actually named,
  // mapped the way a saved TrailBoard layout would map it.
  const mappedChannels = useMemo<MappedChannel[]>(
    () =>
      listChannels(devices, cards)
        .filter((channel) => channel.label.startsWith('RAV-01 '))
        .map((channel) => ({ id: `qa-box-${channel.id}`, channel, label: channel.label.replace('RAV-01 ', '') })),
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
          expectedPoints={expectedPointsForTemplate(machine.template)}
        />
      ) : (
        <MachineAnalysisWorkspace
          machine={machine}
          mappedChannels={mappedChannels}
          devices={devices}
          cards={cards}
          hierarchyPath="Northfield Plant → Area 1"
        />
      )}
    </View>
  );
}

const ClientHarness = dynamic(() => Promise.resolve(Harness), { ssr: false });

export default function MachineQaPage() {
  return <ClientHarness />;
}
