import { View } from 'react-native';

import Home from '../../app/index';
import { AccountBar } from '../components/web/AccountBar';
import { AuthGate } from '../components/web/AuthGate';

export default function StudioScreen() {
  return (
    <AuthGate>
      <View className="flex-1 bg-surface-dark">
        <Home sidebarFooter={<AccountBar />} />
      </View>
    </AuthGate>
  );
}
