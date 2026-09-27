import React, { useId, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Rect, Line, Path, Polygon, Circle, Text as SvgText,
  Defs, ClipPath, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { buildCrackingMillScene, CRACKING_MILL_VIEWBOX_WIDTH, CRACKING_MILL_VIEWBOX_HEIGHT,
  type CrackingNode, type CrackingPartId } from './crackingMillScene';
import { useAppTheme } from '../../../hooks/useAppTheme';
export * from './crackingMillScene';

export interface CrackingMillProps {
  className?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * Defaults to `system`, which follows the console's own theme toggle rather
   * than the device. The template shipped defaulting to `dark`; on this canvas
   * the machine has to change with the surface it is drawn on.
   */
  theme?: 'dark' | 'light' | 'system';
  showBackground?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  /** Unwrapped fast-roll phases. Slow rolls derive the opposite phase / ratio. */
  topFastRotation?: number;
  bottomFastRotation?: number;
  feederRotation?: number;
  speedRatio?: number;
  hopperLevel?: number;
  topRelief?: number;
  bottomRelief?: number;
  onPartPress?: (part: CrackingPartId) => void;
  accessibilityLabel?: string;
}
const primitives = { g: G, rect: Rect, line: Line, path: Path, polygon: Polygon,
  circle: Circle, text: SvgText, defs: Defs, clipPath: ClipPath,
  linearGradient: LinearGradient, radialGradient: RadialGradient };
function renderNode(node: CrackingNode, key: string, onPartPress?: (part: CrackingPartId) => void): React.ReactElement {
  if (node.tag === 'stop') return <Stop key={key} offset={node.attrs.offset} stopColor={String(node.attrs.stopColor)} />;
  const Element = primitives[node.tag];
  const part = node.part;
  return <Element key={key} {...node.attrs}
    {...(part && onPartPress ? { onPress: () => onPartPress(part), accessibilityLabel: part } : {})}>
    {node.text}
    {node.children?.map((child, i) => renderNode(child, `${key}-${i}`, onPartPress))}
  </Element>;
}
/** Detailed, fully vector machine artwork. No sensor/connection dots. */
export function CrackingMill({ className, style, theme = 'system', showBackground = true,
  showGrid = true, showLabels = true, topFastRotation = 0, bottomFastRotation = 0,
  feederRotation = 0, speedRatio = 1.25, hopperLevel = .62, topRelief = 0, bottomRelief = 0, onPartPress,
  accessibilityLabel = 'Cracking Mill M-101: metering feed roll, coarse and fine corrugated roll pairs, belt drives, relief springs and discharge',
}: CrackingMillProps) {
  // The app's scheme, not the device's: the console has its own toggle and the
  // drawing must follow that, or a light console renders a dark machine.
  const { isDark } = useAppTheme();
  const dark = theme === 'dark' || (theme === 'system' && isDark);
  const instanceId = useId();
  const idPrefix = `cracking-mill-${instanceId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scene = useMemo(() => buildCrackingMillScene({ idPrefix, dark, showGrid,
    showLabels, topFastRotation, bottomFastRotation, feederRotation, speedRatio, hopperLevel, topRelief, bottomRelief }),
  [idPrefix, dark, showGrid, showLabels, topFastRotation, bottomFastRotation, feederRotation, speedRatio, hopperLevel, topRelief, bottomRelief]);
  const classProps = className ? { className } : {};
  return <View {...classProps} style={[{ width: '100%', overflow: 'hidden',
    aspectRatio: CRACKING_MILL_VIEWBOX_WIDTH / CRACKING_MILL_VIEWBOX_HEIGHT,
    backgroundColor: showBackground ? (dark ? '#090B0D' : '#F8FAFC') : 'transparent',
  }, style]}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${CRACKING_MILL_VIEWBOX_WIDTH} ${CRACKING_MILL_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet" accessibilityLabel={accessibilityLabel}>
      {scene.map((node, i) => renderNode(node, `scene-${i}`, onPartPress))}
    </Svg>
  </View>;
}
export default CrackingMill;
