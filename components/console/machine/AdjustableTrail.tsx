import { useMemo, useRef } from 'react';
import { PanResponder, Pressable, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';

export type Point = { x: number; y: number };

export type TrailStatus = 'normal' | 'warning' | 'critical' | 'offline';

// 'normal' is the one status colour that has to flip with the theme — a
// near-white trail is legible on the dark canvas but nearly invisible against
// the light one, which defeats the whole point of a status colour.
function statusColourFor(status: TrailStatus, isDark: boolean): string {
  if (status === 'normal') return isDark ? '#F5F5F5' : '#1A1A1A';
  const rest: Record<Exclude<TrailStatus, 'normal'>, string> = {
    warning: '#D9962B',
    critical: '#D64545',
    offline: '#737373',
  };
  return rest[status];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createRoundedPath(points: Point[], radius = 10) {
  if (points.length < 2) return '';

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];

    const previousDistance = Math.hypot(current.x - previous.x, current.y - previous.y);
    const nextDistance = Math.hypot(next.x - current.x, next.y - current.y);
    const cornerRadius = Math.min(radius, previousDistance / 2, nextDistance / 2);

    const pointBeforeCorner = {
      x: current.x - ((current.x - previous.x) / previousDistance) * cornerRadius,
      y: current.y - ((current.y - previous.y) / previousDistance) * cornerRadius,
    };

    const pointAfterCorner = {
      x: current.x + ((next.x - current.x) / nextDistance) * cornerRadius,
      y: current.y + ((next.y - current.y) / nextDistance) * cornerRadius,
    };

    path += ` L ${pointBeforeCorner.x} ${pointBeforeCorner.y}`;
    path += ` Q ${current.x} ${current.y} ${pointAfterCorner.x} ${pointAfterCorner.y}`;
  }

  const lastPoint = points[points.length - 1];
  path += ` L ${lastPoint.x} ${lastPoint.y}`;

  return path;
}

const LINE_HIT_WIDTH = 20;

// A rotated invisible Pressable spanning A→B — react-native-svg's Path doesn't
// translate onPress/onPressIn to a working web click handler (it just forwards the
// prop as a raw, unrecognised DOM attribute), so tap-to-select on the line itself
// has to be a plain RN touch target instead of an SVG one.
function LineSegmentHit({ a, b, onPress }: { a: Point; b: Point; onPress: () => void }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;

  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  return (
    <Pressable
      onPress={onPress}
      style={{
        position: 'absolute',
        left: midX - length / 2,
        top: midY - LINE_HIT_WIDTH / 2,
        width: length,
        height: LINE_HIT_WIDTH,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

function DraggablePoint({
  point,
  index,
  isEndpoint,
  colour,
  selected,
  canvasWidth,
  canvasHeight,
  stageScale,
  onMove,
  onGrab,
  onRelease,
}: {
  point: Point;
  index: number;
  isEndpoint: boolean;
  colour: string;
  selected: boolean;
  canvasWidth: number;
  canvasHeight: number;
  stageScale: number;
  onMove: (index: number, point: Point) => void;
  onGrab: () => void;
  onRelease?: (point: Point) => void;
}) {
  const size = isEndpoint ? 26 : 18;

  // Kept in sync every render so the responder (created exactly once, below) always
  // reads the endpoint's current position/bounds/callbacks. Recreating the
  // PanResponder mid-gesture (e.g. via useMemo keyed on `point`) swaps the DOM
  // element's responder handlers while a touch is still down, which resets the
  // web responder system's gesture tracking and stalls the drag after ~1 frame.
  const pointRef = useRef(point);
  pointRef.current = point;
  const boundsRef = useRef({ canvasWidth, canvasHeight, size });
  boundsRef.current = { canvasWidth, canvasHeight, size };
  // Gesture dx/dy arrive in screen pixels; point coordinates live in stage units
  // under a scale transform, so deltas must be divided by the current stage scale.
  const scaleRef = useRef(stageScale);
  scaleRef.current = stageScale;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onGrabRef = useRef(onGrab);
  onGrabRef.current = onGrab;
  const onReleaseRef = useRef(onRelease);
  onReleaseRef.current = onRelease;

  const dragOrigin = useRef(point);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragOrigin.current = pointRef.current;
        onGrabRef.current();
      },
      onPanResponderMove: (_evt, gesture) => {
        const { canvasWidth: cw, canvasHeight: ch, size: sz } = boundsRef.current;
        const s = scaleRef.current || 1;
        onMoveRef.current(index, {
          x: clamp(dragOrigin.current.x + gesture.dx / s, sz / 2, cw - sz / 2),
          y: clamp(dragOrigin.current.y + gesture.dy / s, sz / 2, ch - sz / 2),
        });
      },
      onPanResponderRelease: (_evt, gesture) => {
        const { canvasWidth: cw, canvasHeight: ch, size: sz } = boundsRef.current;
        const s = scaleRef.current || 1;
        onReleaseRef.current?.({
          x: clamp(dragOrigin.current.x + gesture.dx / s, sz / 2, cw - sz / 2),
          y: clamp(dragOrigin.current.y + gesture.dy / s, sz / 2, ch - sz / 2),
        });
      },
    }),
  ).current;

  return (
    <View
      {...panResponder.panHandlers}
      style={
        {
          position: 'absolute',
          left: point.x - size / 2,
          top: point.y - size / 2,
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          // web-only: userSelect stops dragging from picking up a native text
          // selection on nearby labels; 'grab' is a web CSS cursor outside RN's
          // typed 'auto' | 'pointer' union, hence the cast.
          userSelect: 'none',
          cursor: 'grab',
        } as unknown as ViewStyle
      }
    >
      {selected && (
        <View
          style={{
            position: 'absolute',
            width: size + 8,
            height: size + 8,
            borderRadius: isEndpoint ? 20 : 6,
            borderWidth: 1,
            borderColor: 'rgba(110,240,138,0.45)',
            backgroundColor: 'rgba(110,240,138,0.10)',
          }}
        />
      )}

      <View
        style={{
          width: isEndpoint ? 18 : 10,
          height: isEndpoint ? 18 : 10,
          borderRadius: isEndpoint ? 9 : 3,
          borderWidth: isEndpoint ? 2 : 1,
          borderColor: isEndpoint ? colour : '#3FBF6A',
          backgroundColor: '#0A0A0A',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isEndpoint && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colour }} />}
      </View>
    </View>
  );
}

export type AdjustableTrailProps = {
  points: Point[];
  status?: TrailStatus;
  selected?: boolean;
  showControlPoints?: boolean;
  canvasWidth: number;
  canvasHeight: number;
  // Current stage scale — converts screen-pixel gesture deltas to stage units.
  stageScale?: number;
  // false = display-only (Actual View): path + endpoint/bend nodes, no drag
  // handles, no tap-to-select.
  interactive?: boolean;
  onPointsChange: (points: Point[]) => void;
  onSelect?: () => void;
  onEndpointGrab?: (which: 'start' | 'end') => void;
  onEndpointRelease?: (which: 'start' | 'end', point: Point) => void;
};

export function AdjustableTrail({
  points,
  status = 'normal',
  selected = false,
  showControlPoints = true,
  canvasWidth,
  canvasHeight,
  stageScale = 1,
  interactive = true,
  onPointsChange,
  onSelect,
  onEndpointGrab,
  onEndpointRelease,
}: AdjustableTrailProps) {
  const { isDark } = useAppTheme();
  const statusColour = statusColourFor(status, isDark);
  const trailColour = selected ? '#3FBF6A' : statusColour;
  const showBendMarkers = showControlPoints;
  const showDraggableControls = interactive && showControlPoints;

  const path = useMemo(() => createRoundedPath(points, 12), [points]);

  const movePoint = (index: number, nextPoint: Point) => {
    onPointsChange(points.map((point, pointIndex) => (pointIndex === index ? nextPoint : point)));
  };

  return (
    <>
      <Svg pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width: canvasWidth, height: canvasHeight }}>
        {selected && <Path d={path} fill="none" stroke="rgba(110,240,138,0.15)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />}

        <Path d={path} fill="none" stroke={trailColour} strokeWidth={2} strokeDasharray="7 6" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((point, index) => {
          const isEndpoint = index === 0 || index === points.length - 1;
          if (!isEndpoint && !showBendMarkers) return null;

          return (
            <Circle
              key={`svg-point-${index}`}
              cx={point.x}
              cy={point.y}
              r={isEndpoint ? 9 : 4}
              // Matches the page background per theme, so the ring reads as a
              // clean "cut-out" dot rather than a fixed dark blob on a light page.
              fill={isEndpoint ? (isDark ? '#0A0A0A' : '#FAFAFA') : '#0A0A0A'}
              stroke={isEndpoint ? trailColour : '#0A0A0A'}
              strokeWidth={isEndpoint ? 2 : 1}
            />
          );
        })}
      </Svg>

      {interactive &&
        onSelect &&
        points.slice(0, -1).map((point, index) => (
          <LineSegmentHit key={`hit-${index}`} a={point} b={points[index + 1]} onPress={onSelect} />
        ))}

      {interactive &&
        points.map((point, index) => {
          const isEndpoint = index === 0 || index === points.length - 1;
          if (!isEndpoint && !showDraggableControls) return null;

          const which: 'start' | 'end' | null = index === 0 ? 'start' : index === points.length - 1 ? 'end' : null;

          return (
            <DraggablePoint
              key={`handle-${index}`}
              point={point}
              index={index}
              isEndpoint={isEndpoint}
              colour={trailColour}
              selected={selected}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
              stageScale={stageScale}
              onMove={movePoint}
              onGrab={() => {
                onSelect?.();
                if (which) onEndpointGrab?.(which);
              }}
              onRelease={which ? (p) => onEndpointRelease?.(which, p) : undefined}
            />
          );
        })}
    </>
  );
}
