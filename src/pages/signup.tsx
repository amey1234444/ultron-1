import dynamic from 'next/dynamic';

const SignupScreen = dynamic(() => import('../screens/SignupScreen'), { ssr: false });

export default function SignupPage() {
  return <SignupScreen />;
}
