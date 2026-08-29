import { useColorScheme } from 'nativewind';

export type ThemePreference = 'light' | 'dark' | 'system';

export function useAppTheme() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const effectiveScheme = colorScheme ?? 'dark';
  const isDark = effectiveScheme === 'dark';

  return {
    isDark,
    colorScheme: effectiveScheme,
    setPreference: (pref: ThemePreference) => setColorScheme(pref),
  };
}
