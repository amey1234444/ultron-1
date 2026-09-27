import React, { useId, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Polygon, Rect, Text as SvgText, LinearGradient, Stop } from 'react-native-svg';
import {
  buildExpanderScene, buildPadScene, clampConePosition, EXPANDER_CONNECTORS, EXPANDER_VIEWBOX_WIDTH,
  EXPANDER_VIEWBOX_HEIGHT, type ExpanderConnector, type PadState,
  type PartId, type SceneNode,
} from './expanderScene';
import { useAppTheme } from '../../../../hooks/useAppTheme';
export * from './expanderScene';

export interface ExpanderProps {
  /** Forwarded to View for projects using NativeWind; not required. */
  className?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * Defaults to `system`, which follows the console's own theme toggle rather
   * than the OS. The template shipped defaulting to `dark`; on this canvas the
   * machine has to change with the surface it is drawn on.
   */
  theme?: 'light' | 'dark' | 'system';
  showBackground?: boolean;
  showLabels?: boolean;
  showGrid?: boolean;
  /** Optional connecting-point overlay. Hidden by default; the exported artwork has no connection dots. */
  showConnectors?: boolean;
  connectorState?: Readonly<Record<string, PadState>>;
  /** Override the suggested tags with your real expander point registry. */
  connectors?: readonly ExpanderConnector[];
  /** Degrees. Parent controls timing; no internal interval is created. */
  screwRotation?: number;
  feederRotation?: number;
  /** 0 = reference position, 1 = maximum illustrative opening. */
  conePosition?: number;
  onConnectorPress?: (connector: ExpanderConnector) => void;
  onPartPress?: (part: PartId) => void;
  accessibilityLabel?: string;
}

// Explicit map keeps the same react-native-svg primitives as your extruder.
const primitives = { g: G, rect: Rect, line: Line, path: Path, polygon: Polygon,
  circle: Circle, text: SvgText, defs: Defs, clipPath: ClipPath, linearGradient: LinearGradient, stop: Stop };
function renderNode(node: SceneNode, key: string, onPartPress?: (part: PartId) => void): React.ReactElement {
  if (node.tag === 'stop') {
    return <Stop key={key} offset={node.attrs.offset} stopColor={String(node.attrs.stopColor)} />;
  }
  const Element = primitives[node.tag];
  const part = node.part;
  // These attributes are produced by the typed scene builder, not user HTML.
  return <Element key={key} {...node.attrs}
    {...(part && onPartPress ? { onPress: () => onPartPress(part), accessibilityLabel: part } : {})}>
    {node.text}
    {node.children?.map((child, i) => renderNode(child, `${key}-${i}`, onPartPress))}
  </Element>;
}

function MeasurementPad({ connector, state, dark, onPress }: {
  connector: ExpanderConnector; state: PadState; dark: boolean;
  onPress?: (connector: ExpanderConnector) => void;
}) {
  const description = state === 'live' ? 'receiving data' : state === 'linked' ? 'card linked' : 'not connected';
  return <G accessible accessibilityRole={onPress ? 'button' : 'image'}
    accessibilityLabel={`${connector.label}: ${description}`}
    onPress={onPress ? () => onPress(connector) : undefined}>
    {buildPadScene(connector, state, dark).map((n, i) => renderNode(n, `pad-${connector.code}-${i}`))}
  </G>;
}

/** Self-contained native/web machine template; no image embedding or app hooks. */
export function Expander({
  className, style, theme = 'system', showBackground = true, showLabels = true, showGrid = true,
  showConnectors = false, connectorState, connectors = EXPANDER_CONNECTORS,
  screwRotation = 0, feederRotation = 0, conePosition = 0,
  onConnectorPress, onPartPress,
  accessibilityLabel = 'Expander X-101: hopper, feeder, main motor, gearbox, barrel screw, injection manifold and cone discharge',
}: ExpanderProps) {
  // The app's scheme, not the device's: the console has its own toggle and the
  // drawing must follow that, or a light console renders a dark machine.
  const { isDark } = useAppTheme();
  const dark = theme === 'dark' || (theme === 'system' && isDark);
  const instanceId = useId();
  const idPrefix = `expander-${instanceId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scene = useMemo(() => buildExpanderScene({ idPrefix, dark, showLabels, showGrid,
    screwRotation, feederRotation, conePosition }),
  [idPrefix, dark, showLabels, showGrid, screwRotation, feederRotation, conePosition]);
  // Spread preserves compatibility with both stock RN and NativeWind projects.
  const classProps = className ? { className } : {};
  return <View {...classProps} style={[{ width: '100%', overflow: 'hidden',
    aspectRatio: EXPANDER_VIEWBOX_WIDTH / EXPANDER_VIEWBOX_HEIGHT,
    backgroundColor: showBackground ? (dark ? '#090B0D' : '#F8FAFC') : 'transparent',
  }, style]}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${EXPANDER_VIEWBOX_WIDTH} ${EXPANDER_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet" accessibilityLabel={accessibilityLabel}>
      {scene.map((node, i) => renderNode(node, `scene-${i}`, onPartPress))}
      {showConnectors && connectors.map(connector => <MeasurementPad key={connector.code}
        connector={connector.code === 'EX_CONE_POSITION' && connectors === EXPANDER_CONNECTORS
          ? { ...connector, x: connector.x + clampConePosition(conePosition) * 14 } : connector} dark={dark} state={connectorState?.[connector.code] ?? 'idle'}
        onPress={onConnectorPress} />)}
    </Svg>
  </View>;
}
export default Expander;
