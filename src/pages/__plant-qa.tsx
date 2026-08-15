// TEMPORARY visual-QA harness for the Plant Overview. Delete before commit.
//
// Renders the console shell with seeded data and no AuthGate, so the dashboard
// can be looked at without a database or a session.
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useColorScheme } from 'nativewind';

import { DashboardOverview } from '../../components/console/DashboardOverview';
import { TopBar } from '../../components/console/TopBar';
import { createSeedData } from '../../lib/seedData';
import { consolePalette } from '../../lib/consoleTheme';

function Harness() {
  const { setColorScheme } = useColorScheme();
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get('theme');
    const isDark = theme !== 'light';
    setDark(isDark);
    setColorScheme(isDark ? 'dark' : 'light');
  }, [setColorScheme]);

  let counter = 0;
  const seed = useMemo(() => createSeedData(() => `qa-${counter++}`), []);
  const palette = consolePalette(dark);

  return (
    <View style={{ flex: 1, height: '100vh' as never, backgroundColor: palette.bg }}>
      <TopBar
        authenticated
        view="overview"
        onViewChange={() => undefined}
        alarmCount={0}
        devices={seed.devices}
        canConfigure
        plants={seed.projects.map((p) => ({ id: p.id, name: p.name }))}
        plantId={seed.projects[0]?.id ?? null}
        onPlantChange={() => undefined}
      />
      <DashboardOverview
        projects={seed.projects}
        folders={seed.folders}
        machines={seed.machines}
        devices={seed.devices}
        cards={seed.cards}
        currentUser={{ id: 'qa', email: 'qa@ultron.test', name: 'QA', role: 'super_admin' } as never}
        onOpenDevices={() => undefined}
        onOpenMachine={() => undefined}
      />
    </View>
  );
}

const ClientHarness = dynamic(() => Promise.resolve(Harness), { ssr: false });

export default function PlantQaPage() {
  return <ClientHarness />;
}
