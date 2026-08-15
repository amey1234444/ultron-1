/**
 * The dashboard chrome's half of the fullscreen move.
 *
 * While the canvas grows out to the viewport, the KPI row lifts and fades, the
 * analytics column slides right, and the bottom charts drop away. They keep
 * their layout space throughout — nothing reflows — so the plant expands *over*
 * a stationary dashboard and the return is the identical animation reversed.
 *
 * `Animated` rather than a CSS transition because this renders through
 * react-native primitives on both targets.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';

import { PLANT_TRANSITION_MS } from '../../../lib/plantViewState';

export function FadeLayer({
  visible,
  translateX = 0,
  translateY = 0,
  duration = PLANT_TRANSITION_MS * 0.55,
  children,
  style,
}: {
  visible: boolean;
  /** Offset held while hidden, in px. */
  translateX?: number;
  translateY?: number;
  duration?: number;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration,
      // The same curve the canvas bounds use, so the two halves of the move
      // stay in step instead of arriving separately.
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    }).start();
  }, [duration, progress, visible]);

  return (
    <Animated.View
      // Faded-out chrome must not eat clicks meant for the plant behind it.
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [translateX, 0] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [translateY, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
