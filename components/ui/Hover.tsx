// Pointer hover, as one primitive.
//
// Why this file exists
// --------------------
// The console had hover in eleven places and no two of them agreed. Some rows
// brightened their border, some swapped a background, some revealed a hidden
// affordance, and most had no hover at all — including the ones that most look
// like they should, the long vertical lists of evidence and the KPI bands. On a
// desktop console that is a real loss: hover is how a reader keeps their place
// in a list of twelve near-identical rows while their eye travels between the
// row and the chart it explains. Without it, a wall of statements gives the
// pointer nothing to hold on to.
//
// So: one component, one feel. A hovered surface lifts by exactly one step —
// the palette's own `hover` ground, plus (optionally) a brightened edge. It
// never moves, never scales and never animates size, because a row that shifts
// under the pointer is a row you then have to re-find.
//
// `onHoverIn`/`onHoverOut` are Pressable-only props. On react-native-web they
// become mouseenter/mouseleave; on iOS and Android they simply never fire, so
// every one of these renders as a plain static row on a touch device, which is
// the correct behaviour there.
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

export type HoverState = {
  hovered: boolean;
  pressed: boolean;
};

type HoverableProps = Omit<PressableProps, 'style' | 'children'> & {
  className?: string;
  /** Resolved on every hover and press transition. */
  style?: (state: HoverState) => StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * A surface that knows whether the pointer is over it.
 *
 * Renders a Pressable because that is the only React Native primitive carrying
 * hover callbacks — but when no `onPress` is given it is explicitly taken out
 * of the tab order and given no button role, so decorating a list row with
 * hover does not quietly add twelve fake buttons to the keyboard path.
 */
export function Hoverable({ className, style, children, onHoverIn, onHoverOut, ...rest }: HoverableProps) {
  const [hovered, setHovered] = useState(false);
  const interactive = Boolean(rest.onPress || rest.onLongPress);

  return (
    <Pressable
      {...rest}
      accessibilityRole={rest.accessibilityRole ?? (interactive ? 'button' : undefined)}
      focusable={interactive ? rest.focusable : false}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      className={className}
      style={({ pressed }) => style?.({ hovered, pressed })}
    >
      {children}
    </Pressable>
  );
}

/**
 * The hover ground for a row inside a list or a cell inside a strip.
 *
 * One step of lift and nothing else. Returns `undefined` rather than a
 * transparent colour when the pointer is elsewhere, so a row that already has a
 * background of its own is not overpainted with one.
 */
export function hoverGround(hovered: boolean, hoverColour: string, restColour?: string): string | undefined {
  return hovered ? hoverColour : restColour;
}
