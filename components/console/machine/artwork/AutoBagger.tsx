import React, { useId, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  G, Rect, Path, Line, Circle, Text as SvgText, Defs, LinearGradient, Stop, Pattern,
} from 'react-native-svg';

import {
  AUTOBAGGER_SCENE,
  AUTOBAGGER_SENSORS,
  AUTOBAGGER_PARTS,
  AUTOBAGGER_WIDTH,
  AUTOBAGGER_HEIGHT,
  type AutoBaggerNode,
  type AutoBaggerSensor,
} from './autoBaggerScene';

export * from './autoBaggerScene';

/**
 * Auto Bagger & Stitcher artwork.
 *
 * The geometry is the supplied export, rendered rather than redrawn. This file
 * is only the bridge between that data and `react-native-svg`, which is what
 * lets one component serve both the Expo target and the web build — the
 * template also ships a web-only variant that emits React DOM, and that one
 * cannot be used here for exactly that reason.
 *
 * **Pads are off by default.** `showSensors` defaults to false because the
 * workspace canvas owns pad rendering for every machine; two overlays would
 * draw every point twice and fire two selection events for one tap. A caller
 * that wants the drawing standalone — a preview, a check — can turn them on.
 */
export interface AutoBaggerProps {
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** The artwork's own charcoal panel. Off when the console supplies one. */
  showBackground?: boolean;
  showGrid?: boolean;
  /** The artwork's own connection pads. See the note above before enabling. */
  showSensors?: boolean;
  selectedSensorId?: string;
  onSensorPress?: (point: AutoBaggerSensor) => void;
  onPartPress?: (part: { id: string; label: string }) => void;
  accessibilityLabel?: string;
}

/**
 * The scene's `tag` is a plain string, so the lookup cannot narrow to one
 * component and TypeScript intersects every primitive's props — which leaves
 * `children` as `never` and rejects the recursion below. The cast says what is
 * actually true of all of them: each takes SVG attributes and children. The
 * tag vocabulary itself is checked at runtime, by the `if (!Element)` guard.
 */
type SvgPrimitive = React.ComponentType<Record<string, unknown> & { children?: React.ReactNode }>;

const PRIMITIVES = {
  g: G, rect: Rect, path: Path, line: Line, circle: Circle, text: SvgText,
  defs: Defs, linearGradient: LinearGradient, stop: Stop, pattern: Pattern,
} as unknown as Record<string, SvgPrimitive>;

/** Groups the console can switch off, by the id the export gives them. */
const TOGGLEABLE = { background: 'background', grid: 'engineering-grid', sensors: 'sensor-points' };

export function AutoBagger({
  className,
  style,
  showBackground = true,
  showGrid = true,
  showSensors = false,
  selectedSensorId,
  onSensorPress,
  onPartPress,
  accessibilityLabel = 'Auto Bagger and Stitcher: gantry over a weigh hopper on load cells, fill spout with pneumatic bag clamp, stitcher column, and a check-weigher on the outbound transport',
}: AutoBaggerProps) {
  // Gradient and pattern ids are global to the document, so two instances of
  // this machine on one screen would collide and the second would paint with
  // the first's fills. Every id is namespaced per instance, and every
  // `url(#...)` reference is rewritten to match.
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const scene = useMemo(() => AUTOBAGGER_SCENE, []);

  function renderNode(node: AutoBaggerNode, key: string): React.ReactNode {
    const id = node.attrs.id;
    if (!showBackground && id === TOGGLEABLE.background) return null;
    if (!showGrid && id === TOGGLEABLE.grid) return null;
    if (!showSensors && id === TOGGLEABLE.sensors) return null;

    const Element = PRIMITIVES[node.tag];
    if (!Element) return null;

    const attrs: Record<string, string> = { ...node.attrs };
    if (attrs.id) attrs.id = `${instanceId}-${attrs.id}`;
    for (const key of Object.keys(attrs)) {
      attrs[key] = attrs[key].replace(/url\(#([^)]+)\)/g, (_match, ref: string) => `url(#${instanceId}-${ref})`);
    }

    const point = node.sensorId ? AUTOBAGGER_SENSORS.find((entry) => entry.id === node.sensorId) : undefined;
    const part = node.partId ? AUTOBAGGER_PARTS.find((entry) => entry.id === node.partId) : undefined;
    // A pad inside a part would otherwise fire both callbacks from one tap, so
    // the pad wins and the part is only offered where there is no pad.
    const press = point && onSensorPress
      ? () => onSensorPress(point)
      : part && onPartPress
        ? () => onPartPress(part)
        : undefined;

    return (
      <Element
        key={key}
        {...attrs}
        {...(press ? { onPress: press, accessibilityRole: 'button' as const, accessibilityLabel: point?.label ?? part?.label } : {})}
      >
        {node.text}
        {node.children?.map((child, index) => renderNode(child, `${key}-${index}`))}
        {point && point.id === selectedSensorId ? (
          <Circle cx={point.x} cy={point.y} r={12} fill="none" stroke="#FFFFFF" strokeWidth={1.5} />
        ) : null}
      </Element>
    );
  }

  const classProps = className ? { className } : {};
  return (
    <View
      {...classProps}
      style={[{ width: '100%', overflow: 'hidden', aspectRatio: AUTOBAGGER_WIDTH / AUTOBAGGER_HEIGHT }, style]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${AUTOBAGGER_WIDTH} ${AUTOBAGGER_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        accessibilityLabel={accessibilityLabel}
      >
        {scene.map((node, index) => renderNode(node, `scene-${index}`))}
      </Svg>
    </View>
  );
}

export default AutoBagger;
