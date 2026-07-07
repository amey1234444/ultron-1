// Load the design-system fonts on the web without pulling in expo-font (whose web
// build imports node:async_hooks and breaks the browser bundle). We import the TTFs
// bundled by @expo-google-fonts directly and register them under the exact family
// names the tailwind config references.
import IBMPlexMono_400Regular from '@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf';
import Inter_400Regular from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
import Inter_500Medium from '@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf';
import Inter_600SemiBold from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf';
import SpaceGrotesk_500Medium from '@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf';
import SpaceGrotesk_600SemiBold from '@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf';

const FONTS: Record<string, string> = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  IBMPlexMono_400Regular,
};

let loaded = false;

export function loadWebFonts(): void {
  if (loaded) return;
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  loaded = true;
  Object.entries(FONTS).forEach(([family, url]) => {
    try {
      const face = new FontFace(family, `url(${url})`);
      face
        .load()
        .then((f) => document.fonts.add(f))
        .catch(() => {});
    } catch {
      /* ignore */
    }
  });
}
