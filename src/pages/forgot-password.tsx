import dynamic from 'next/dynamic';

const ForgotPasswordScreen = dynamic(() => import('../screens/ForgotPasswordScreen'), { ssr: false });

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
