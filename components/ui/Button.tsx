import { MaterialCommunityIcons } from '@expo/vector-icons';
import type React from 'react';
import { useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { alpha, consolePalette, variantStyle, type IconName, type Variant } from './tokens';

/**
 * Button — the console's action primitive.
 *
 * Same API shape as shadcn's Button (`variant` + `size` + optional icon),
 * rendered with React Native views. Every colour resolves out of the console
 * palette, so an action's weight is a token choice rather than a per-screen
 * literal.
 *
 * Weights:
 *  - `primary`   one per surface: the ink-filled commit action.
 *  - `secondary` bordered, the default for everything reversible.
 *  - `ghost`     no chrome until pressed, for dense rails.
 *  - `accent` / `success` / `warning` / `destructive` tinted, for actions whose
 *    status is part of their meaning (save, apply, delete).
 */
export type ButtonTone = 'primary' | 'secondary' | 'ghost' | Extract<Variant, 'success' | 'warning' | 'destructive' | 'info'> | 'accent';

export type ButtonSize = 'xs' | 'sm' | 'md';

const SIZING: Record<ButtonSize, { pad: string; text: string; icon: number; gap: string; radius: string }> = {
  xs: { pad: 'px-2 py-1', text: 'text-[10px]', icon: 11, gap: 'gap-1', radius: 'rounded-md' },
  sm: { pad: 'px-2.5 py-1.5', text: 'text-[11px]', icon: 12, gap: 'gap-1.5', radius: 'rounded-lg' },
  md: { pad: 'px-3.5 py-2', text: 'text-[12px]', icon: 14, gap: 'gap-2', radius: 'rounded-lg' },
};

export function Button({
  children,
  onPress,
  tone = 'secondary',
  size = 'sm',
  icon,
  iconRight,
  disabled = false,
  /** Fills the available row width instead of hugging its label. */
  block = false,
  accessibilityLabel,
  className,
  style,
}: {
  children?: React.ReactNode;
  onPress?: () => void;
  tone?: ButtonTone;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  disabled?: boolean;
  block?: boolean;
  accessibilityLabel?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const sizing = SIZING[size];
  // Pressed state is held rather than read from Pressable's render callback:
  // NativeWind replaces `style` with the compiled `className` output, and a
  // function-form style is dropped on the floor — which is how a filled button
  // ends up as white text on a white background.
  const [pressed, setPressed] = useState(false);

  // Resolved once so the icon, the label and the chrome can never disagree.
  const skin = (() => {
    if (tone === 'primary') {
      return { background: palette.ink, border: palette.ink, ink: palette.panel, accent: palette.panel };
    }
    if (tone === 'ghost') {
      return { background: 'transparent', border: 'transparent', ink: palette.inkMuted, accent: palette.inkMuted };
    }
    if (tone === 'secondary') {
      return { background: palette.panel, border: palette.line, ink: palette.ink, accent: palette.inkMuted };
    }
    const variant = variantStyle(palette, tone === 'accent' ? 'success' : tone);
    return { background: variant.tint, border: variant.border, ink: palette.ink, accent: variant.accent };
  })();

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      accessibilityState={{ disabled }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      className={cn('flex-row items-center justify-center', sizing.pad, sizing.gap, sizing.radius, block && 'flex-1', className)}
      style={[
        {
          backgroundColor: skin.background,
          borderWidth: 1,
          borderColor: skin.border,
          opacity: disabled ? 0.42 : pressed ? 0.78 : 1,
          // web-only: a pointer makes a bordered pill read as pressable.
          cursor: disabled ? 'default' : 'pointer',
        } as ViewStyle,
        style,
      ]}
    >
      {icon ? <MaterialCommunityIcons name={icon} size={sizing.icon} color={skin.accent} /> : null}
      {children !== undefined && children !== null ? (
        <Text
          numberOfLines={1}
          className={cn('font-body-bold tracking-[-0.005em]', sizing.text)}
          style={{ color: skin.ink }}
        >
          {children}
        </Text>
      ) : null}
      {iconRight ? <MaterialCommunityIcons name={iconRight} size={sizing.icon} color={skin.accent} /> : null}
    </Pressable>
  );
}

/** A square, label-less button. Always give it an `accessibilityLabel`. */
export function IconButton({
  icon,
  onPress,
  tone = 'secondary',
  size = 28,
  disabled = false,
  accessibilityLabel,
  className,
}: {
  icon: IconName;
  onPress?: () => void;
  tone?: ButtonTone;
  size?: number;
  disabled?: boolean;
  accessibilityLabel: string;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const variant = tone === 'primary' || tone === 'secondary' || tone === 'ghost' ? null : variantStyle(palette, tone === 'accent' ? 'success' : tone);
  const background = tone === 'ghost' ? 'transparent' : tone === 'primary' ? palette.ink : (variant?.tint ?? palette.panel);
  const border = tone === 'ghost' ? 'transparent' : tone === 'primary' ? palette.ink : (variant?.border ?? palette.line);
  const glyph = tone === 'primary' ? palette.panel : (variant?.accent ?? palette.inkMuted);
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      className={cn('items-center justify-center rounded-lg', className)}
      style={{
        width: size,
        height: size,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: border,
        opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        cursor: disabled ? 'default' : 'pointer',
      } as ViewStyle}
    >
      <MaterialCommunityIcons name={icon} size={Math.round(size * 0.52)} color={glyph} />
    </Pressable>
  );
}

/**
 * Toolbar — a hairline rail that groups actions into one instrument.
 *
 * Separate `ToolbarGroup`s inside it read as related sets (create / template /
 * persist) instead of a loose row of pills.
 */
export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className={cn('flex-row flex-wrap items-center gap-1 rounded-xl border p-1', className)}
      style={{ borderColor: palette.line, backgroundColor: isDark ? alpha('#FFFFFF', 0.03) : palette.panel }}
    >
      {children}
    </View>
  );
}

export function ToolbarGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn('flex-row items-center gap-1', className)}>{children}</View>;
}

/** Vertical hairline between toolbar groups. */
export function ToolbarDivider() {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return <View className="mx-1 h-5 w-px" style={{ backgroundColor: palette.line }} />;
}
