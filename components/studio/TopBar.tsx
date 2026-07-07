import { LinearGradient } from 'expo-linear-gradient';
import { Image, Text, View } from 'react-native';

import { ThemeToggle } from '../ThemeToggle';
import { useAppTheme } from '../../hooks/useAppTheme';
import { LOGO_DARK, LOGO_LIGHT } from '../../lib/brandLogos';
import { cn } from '../../lib/cn';

const LOGO_ASPECT = 284 / 77;
const LOGO_HEIGHT = 24;

type TopBarProps = {
  projectName?: string | null;
};

export function TopBar({ projectName }: TopBarProps) {
  const { isDark } = useAppTheme();
  const fade = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(10,10,10,0.12)';

  return (
    <View className={cn('relative flex-row items-center justify-between px-4 py-1.5', isDark ? 'bg-surface-dark' : 'bg-surface-light')}>
      <View className="flex-row items-center gap-3">
        <Image
          source={isDark ? LOGO_DARK : LOGO_LIGHT}
          style={{ height: LOGO_HEIGHT, width: LOGO_HEIGHT * LOGO_ASPECT }}
          resizeMode="contain"
        />
        {projectName ? (
          <Text className={cn('font-body-medium text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {projectName}
          </Text>
        ) : null}
      </View>

      <ThemeToggle />

      <LinearGradient
        colors={['transparent', fade, fade, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1 }}
      />
    </View>
  );
}
