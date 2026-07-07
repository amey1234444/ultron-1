import dynamic from 'next/dynamic';

const UsersScreen = dynamic(() => import('../../screens/UsersScreen'), { ssr: false });

export default function AdminUsersPage() {
  return <UsersScreen />;
}
