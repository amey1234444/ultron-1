import dynamic from 'next/dynamic';

// The console uses react-native-web + client-only state (random seed data), so it
// renders on the client to avoid SSR/hydration mismatches.
const ConsoleScreen = dynamic(() => import('../screens/ConsoleScreen'), { ssr: false });

export default function IndexPage() {
  return <ConsoleScreen />;
}
