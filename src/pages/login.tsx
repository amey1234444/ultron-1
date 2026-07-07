import dynamic from 'next/dynamic';

const LoginScreen = dynamic(() => import('../screens/LoginScreen'), { ssr: false });

export default function LoginPage() {
  return <LoginScreen />;
}
