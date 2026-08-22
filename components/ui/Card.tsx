import type React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { consolePalette, variantStyle, type Variant } from './tokens';
import { text } from './type';

/**
 * Card — the console's surface primitive.
 *
 * Same composition shape as shadcn's Card (`Card` / `CardHeader` / `CardTitle` /
 * `CardDescription` / `CardContent` / `CardFooter`), rendered with React Native
 * views so it works on web and native.
 *
 * Structure comes from the space between plates and a hairline border, not from
 * drop shadows: a view that stacks twenty of these reads as clutter the moment
 * elevation is involved.
 */
export function Card({
  children,
  className,
  style,
  /** Paints a 3px status rail down the leading edge. Pairs with an icon + label inside. */
  accent,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  accent?: Variant;
  padded?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const rail = accent ? variantStyle(palette, accent).accent : undefined;
  return (
    <View
      className={cn('overflow-hidden rounded-xl border', padded && 'px-4 py-3.5', className)}
      style={[
        { backgroundColor: palette.panel, borderColor: palette.line },
        rail ? { borderLeftWidth: 3, borderLeftColor: rail } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn('gap-1', className)}>{children}</View>;
}

export function CardTitle({
  children,
  className,
  size = 'md',
}: {
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const sizing = size === 'lg' ? 'text-lg' : size === 'sm' ? 'text-[13px]' : 'text-[15px]';
  return (
    <Text className={cn('font-body-bold tracking-[-0.02em]', sizing, className)} style={{ color: palette.ink }}>
      {children}
    </Text>
  );
}

export function CardDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <Text className={cn('font-body text-xs leading-[18px]', className)} style={{ color: palette.inkMuted }}>
      {children}
    </Text>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn('gap-2', className)}>{children}</View>;
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className={cn('mt-3 gap-2 pt-3', className)} style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
      {children}
    </View>
  );
}

/** Hairline. The only structural rule used inside a plate. */
export function Separator({ vertical = false, className }: { vertical?: boolean; className?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className={className}
      style={
        vertical
          ? { width: 1, alignSelf: 'stretch', backgroundColor: palette.line }
          : { height: 1, backgroundColor: palette.line }
      }
    />
  );
}

/** Small uppercase label chip. The console's section marker. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className={cn('self-start rounded-md px-2 py-[3px]', isDark ? 'bg-white/[0.055]' : 'bg-black/[0.045]', className)}
    >
      <Text className={text.label} style={{ color: palette.inkMuted }}>
        {children}
      </Text>
    </View>
  );
}

/** Body copy at the console's default reading size. */
export function Body({
  children,
  muted = false,
  mono = false,
  className,
  numberOfLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  mono?: boolean;
  className?: string;
  numberOfLines?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <Text
      numberOfLines={numberOfLines}
      className={cn(mono ? text.data : text.body, className)}
      style={{ color: muted ? palette.inkMuted : palette.ink }}
    >
      {children}
    </Text>
  );
}
