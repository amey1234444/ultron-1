import { View } from 'react-native';

import Home from '../../app/index';
import { AccountBar } from '../components/web/AccountBar';
import { AuthGate } from '../components/web/AuthGate';
import { useAuth } from '../context/AuthContext';

export default function StudioScreen() {
  const { user } = useAuth();

  return (
    <AuthGate>
      <View className="flex-1 bg-surface-dark">
        <Home sidebarFooter={<AccountBar />} currentUser={user} />
      </View>
    </AuthGate>
  );
}
