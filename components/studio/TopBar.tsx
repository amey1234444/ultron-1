import { LinearGradient } from 'expo-linear-gradient';
import { Image, Text, View, type ViewStyle } from 'react-native';

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

  // Frosted-glass bar: translucent surface + backdrop blur so anything behind
  // (menus, scrolling content) shows through softly. Web-only CSS keys are cast
  // through ViewStyle, matching the pattern used elsewhere in the studio.
  const glassStyle = {
    backgroundColor: isDark ? 'rgba(10,10,10,0.55)' : 'rgba(250,250,250,0.6)',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,10,10,0.08)',
  } as unknown as ViewStyle;

  return (
    <View className="relative z-10 flex-row items-center justify-between px-4 py-1.5" style={glassStyle}>
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
