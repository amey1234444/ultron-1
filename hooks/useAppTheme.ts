import { useColorScheme } from 'nativewind';

export type ThemePreference = 'light' | 'dark' | 'system';

export function useAppTheme() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return {
    isDark,
    colorScheme: colorScheme ?? 'dark',
    setPreference: (pref: ThemePreference) => setColorScheme(pref),
  };
}
