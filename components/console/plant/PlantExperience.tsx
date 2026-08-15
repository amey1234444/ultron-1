/**
 * Native stub for the plant experience.
 *
 * The digital twin is a WebGL surface, so the native bundle resolves this and
 * says so plainly rather than shipping an empty rectangle. Props live in
 * `./plantExperienceTypes`, shared with the web implementation.
 */
import { Text, View } from 'react-native';

import type { PlantExperienceProps } from './plantExperienceTypes';

export type { PlantExperienceProps };

export default function PlantExperience({ palette }: PlantExperienceProps) {
  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 5,
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.panel,
        padding: 24,
      }}
    >
      <Text style={{ fontSize: 11.5, textAlign: 'center', color: palette.inkMuted }}>
        The 3D plant map is available in the web console.
      </Text>
    </View>
  );
}
