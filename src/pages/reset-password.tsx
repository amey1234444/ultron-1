import dynamic from 'next/dynamic';

const ResetPasswordScreen = dynamic(() => import('../screens/ResetPasswordScreen'), { ssr: false });

export default function ResetPasswordPage() {
  return <ResetPasswordScreen />;
}
