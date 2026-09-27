import React, { useId, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Rect, Line, Path, Polygon, Circle, Text as SvgText,
  Defs, ClipPath, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { buildConditionerScene, CONDITIONER_VIEWBOX_WIDTH, CONDITIONER_VIEWBOX_HEIGHT,
  type ConditionerNode, type ConditionerPartId } from './conditionerScene';
import { useAppTheme } from '../../../../hooks/useAppTheme';
export * from './conditionerScene';

export interface ConditionerProps {
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
  /** Projected stirrer phase, in degrees. */
  agitatorRotation?: number;
  fanRotation?: number;
  /** Six normalized decorative fill levels. */
  deckLevels?: readonly number[];
  onPartPress?: (part: ConditionerPartId) => void;
  accessibilityLabel?: string;
}
const primitives = { g: G, rect: Rect, line: Line, path: Path, polygon: Polygon,
  circle: Circle, text: SvgText, defs: Defs, clipPath: ClipPath,
  linearGradient: LinearGradient, radialGradient: RadialGradient };
function renderNode(node: ConditionerNode, key: string, onPartPress?: (part: ConditionerPartId) => void): React.ReactElement {
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
export function Conditioner({ className, style, theme = 'system', showBackground = true,
  showGrid = true, showLabels = true, agitatorRotation = 0, fanRotation = 0, deckLevels, onPartPress,
  accessibilityLabel = 'Conditioner E-102: six steam-heated decks, central agitator, exhaust fan, condensate return and bottom discharge',
}: ConditionerProps) {
  // The app's scheme, not the device's: the console has its own toggle and the
  // drawing must follow that, or a light console renders a dark machine.
  const { isDark } = useAppTheme();
  const dark = theme === 'dark' || (theme === 'system' && isDark);
  const instanceId = useId();
  const idPrefix = `conditioner-${instanceId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scene = useMemo(() => buildConditionerScene({ idPrefix, dark, showGrid,
    showLabels, agitatorRotation, fanRotation, deckLevels }),
  [idPrefix, dark, showGrid, showLabels, agitatorRotation, fanRotation, deckLevels]);
  const classProps = className ? { className } : {};
  return <View {...classProps} style={[{ width: '100%', overflow: 'hidden',
    aspectRatio: CONDITIONER_VIEWBOX_WIDTH / CONDITIONER_VIEWBOX_HEIGHT,
    backgroundColor: showBackground ? (dark ? '#090B0D' : '#F8FAFC') : 'transparent',
  }, style]}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${CONDITIONER_VIEWBOX_WIDTH} ${CONDITIONER_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet" accessibilityLabel={accessibilityLabel}>
      {scene.map((node, i) => renderNode(node, `scene-${i}`, onPartPress))}
    </Svg>
  </View>;
}
export default Conditioner;
