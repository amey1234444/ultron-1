import { useRef } from 'react';
import { PanResponder, Pressable, View, type ViewStyle } from 'react-native';

import type { Point } from './AdjustableTrail';
import type { MachineConnector } from './machineConnectors';

/**
 * One instrument pad on the canvas.
 *
 * Extracted from `TrailBoard` because moving a pad needs a `PanResponder`,
 * and a responder has to be created exactly once per pad and then read its
 * inputs through refs. Created inside the connectors `.map()` it would be
 * rebuilt on every render — which, mid-gesture, swaps the DOM node's handlers
 * while a touch is still down and stalls the drag after about a frame.
 * `AdjustableTrail` learned that the hard way and its comment says so.
 *
 * Two gestures, and they are deliberately not on the same element at the same
 * time. Tapping a pad maps it, which is the common action and wants a large
 * forgiving target. Dragging a pad moves the instrument, which is a
 * commissioning decision and wants to be impossible to do by accident while
 * aiming for a tap. So `moving` switches the pad between a Pressable and a
 * drag handle rather than trying to tell a tap from a small drag.
 */
export type ConnectorPadProps = {
  connector: MachineConnector;
  /** Centre, in stage units. */
  at: Point;
  /** Stage units per artwork unit — the pad scales with the machine. */
  unitScale: number;
  /** Drag handle rather than a press target. */
  moving: boolean;
  /** True while an endpoint is in the air, when the pad is a drop target only. */
  wiring: boolean;
  /** Screen pixels per stage unit, for converting gesture deltas. */
  stageScale: number;
  /** This pad has been moved off its registry position. */
  overridden: boolean;
  accessibilityLabel: string;
  children: React.ReactNode;
  onPress: () => void;
  onHoverIn: () => void;
  onHoverOut: () => void;
  /** Live during the drag and again on release, in stage units. */
  onMove: (to: Point) => void;
  onMoveEnd: (to: Point) => void;
  /** Double-tapping a moved pad, in move mode, puts it back. */
  onReset: () => void;
};

/** A release that travelled less than this is a tap, not a drag. */
const TAP_SLOP = 3;
/** Two taps closer together than this are a double-tap. */
const DOUBLE_TAP_MS = 400;

export function ConnectorPad({
  connector,
  at,
  unitScale,
  moving,
  wiring,
  stageScale,
  overridden,
  accessibilityLabel,
  children,
  onPress,
  onHoverIn,
  onHoverOut,
  onMove,
  onMoveEnd,
  onReset,
}: ConnectorPadProps) {
  // The mark scales with the machine, so at a small zoom it falls below a
  // comfortable target. The hit area is padded out to meet it.
  const box = 24 * unitScale;
  const hitSlop = Math.max(0, 22 - box / 2);

  // Kept current every render so the responder, created once below, never
  // reads a stale position, scale or callback.
  const atRef = useRef(at);
  atRef.current = at;
  const scaleRef = useRef(stageScale);
  scaleRef.current = stageScale;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onMoveEndRef = useRef(onMoveEnd);
  onMoveEndRef.current = onMoveEnd;
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;
  const overriddenRef = useRef(overridden);
  overriddenRef.current = overridden;
  const origin = useRef(at);
  const lastTap = useRef(0);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        origin.current = atRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        // Gesture deltas are screen pixels; pad coordinates are stage units
        // under a scale transform, so they divide by the stage scale.
        const s = scaleRef.current || 1;
        onMoveRef.current({ x: origin.current.x + gesture.dx / s, y: origin.current.y + gesture.dy / s });
      },
      onPanResponderRelease: (_evt, gesture) => {
        const s = scaleRef.current || 1;
        // A release that barely travelled is a tap, not a drag. Two of them in
        // quick succession on a pad that has been moved puts it back — the
        // only way back otherwise is the toolbar's reset, which is all or
        // nothing, and a single tap would undo a careful placement by
        // accident.
        const travelled = Math.hypot(gesture.dx / s, gesture.dy / s);
        if (travelled < TAP_SLOP) {
          const now = Date.now();
          if (overriddenRef.current && now - lastTap.current < DOUBLE_TAP_MS) {
            lastTap.current = 0;
            onResetRef.current();
            return;
          }
          lastTap.current = now;
          return;
        }
        onMoveEndRef.current({ x: origin.current.x + gesture.dx / s, y: origin.current.y + gesture.dy / s });
      },
    }),
  ).current;

  const frame: ViewStyle = {
    position: 'absolute',
    left: at.x - box / 2,
    top: at.y - box / 2,
    width: box,
    height: box,
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (moving) {
    return (
      <View
        {...pan.panHandlers}
        accessibilityLabel={`${connector.label} — drag to move this instrument${overridden ? ', moved from its template position' : ''}`}
        style={
          {
            ...frame,
            // web-only: stops the drag from selecting nearby text, and says
            // what the pad now is. Outside RN's typed cursor union.
            userSelect: 'none',
            cursor: 'grab',
          } as unknown as ViewStyle
        }
      >
        {children}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      style={{
        // Not a press target while an endpoint is being dragged: the drag owns
        // the gesture, and a Pressable swallowing it would break the magnet.
        // In the style rather than the `pointerEvents` prop, which
        // react-native-web has deprecated and newer versions ignore.
        pointerEvents: wiring ? 'none' : 'auto',
        ...frame,
      }}
    >
      {children}
    </Pressable>
  );
}
