import React, { useId, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Rect, Line, Path, Polygon, Circle, Text as SvgText,
  Defs, ClipPath, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { buildFlakingMillScene, FLAKING_MILL_VIEWBOX_WIDTH, FLAKING_MILL_VIEWBOX_HEIGHT,
  type MillNode, type MillPartId } from './flakingMillScene';
import { useAppTheme } from '../../../../hooks/useAppTheme';
export * from './flakingMillScene';

export interface FlakingMillProps {
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
  /** Degrees. Left roll clockwise, right roll opposite unless overridden. */
  rollRotation?: number;
  rightRollRotation?: number;
  feederRotation?: number;
  /** Decorative fill fraction, 0–1. Supply real data only after mapping it. */
  hopperLevel?: number;
  onPartPress?: (part: MillPartId) => void;
  accessibilityLabel?: string;
}
const primitives = { g: G, rect: Rect, line: Line, path: Path, polygon: Polygon,
  circle: Circle, text: SvgText, defs: Defs, clipPath: ClipPath,
  linearGradient: LinearGradient, radialGradient: RadialGradient };
function renderNode(node: MillNode, key: string, onPartPress?: (part: MillPartId) => void): React.ReactElement {
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
export function FlakingMill({ className, style, theme = 'system', showBackground = true,
  showGrid = true, showLabels = true, rollRotation = 0, rightRollRotation,
  feederRotation = 0, hopperLevel = .62, onPartPress,
  accessibilityLabel = 'Flaking Mill M-102: hopper, feeder rotor, two belt-driven rolls, actuator circuit and bottom discharge',
}: FlakingMillProps) {
  // The app's scheme, not the device's: the console has its own toggle and the
  // drawing must follow that, or a light console renders a dark machine.
  const { isDark } = useAppTheme();
  const dark = theme === 'dark' || (theme === 'system' && isDark);
  const instanceId = useId();
  const idPrefix = `flaking-mill-${instanceId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scene = useMemo(() => buildFlakingMillScene({ idPrefix, dark, showGrid,
    showLabels, rollRotation, rightRollRotation, feederRotation, hopperLevel }),
  [idPrefix, dark, showGrid, showLabels, rollRotation, rightRollRotation, feederRotation, hopperLevel]);
  const classProps = className ? { className } : {};
  return <View {...classProps} style={[{ width: '100%', overflow: 'hidden',
    aspectRatio: FLAKING_MILL_VIEWBOX_WIDTH / FLAKING_MILL_VIEWBOX_HEIGHT,
    backgroundColor: showBackground ? (dark ? '#090B0D' : '#F8FAFC') : 'transparent',
  }, style]}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${FLAKING_MILL_VIEWBOX_WIDTH} ${FLAKING_MILL_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet" accessibilityLabel={accessibilityLabel}>
      {scene.map((node, i) => renderNode(node, `scene-${i}`, onPartPress))}
    </Svg>
  </View>;
}
export default FlakingMill;
