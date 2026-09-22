import { Image, StyleSheet } from 'react-native';

/**
 * Native/Expo renderer for the twin-screw sheet.
 *
 * Metro resolves the static require to an AssetRegistry id. The web build uses
 * `TwinScrewArtwork.web.tsx` instead, because a browser needs a URL rather than
 * that native asset id.
 */
export function TwinScrewArtwork() {
  return (
    <Image
      source={require('../../../assets/machines/twin-screw-extruder.png')}
      resizeMode="stretch"
      accessible
      accessibilityLabel="Twin screw extruder machine visualization with sensor points"
      style={StyleSheet.absoluteFill}
    />
  );
}
