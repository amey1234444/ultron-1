import dynamic from 'next/dynamic';

// The studio uses react-native-web + client-only state (random seed data), so it
// renders on the client to avoid SSR/hydration mismatches.
const StudioScreen = dynamic(() => import('../screens/StudioScreen'), { ssr: false });

export default function IndexPage() {
  return <StudioScreen />;
}
