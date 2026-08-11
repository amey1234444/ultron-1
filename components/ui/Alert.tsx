import { MaterialCommunityIcons } from '@expo/vector-icons';
import type React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { consolePalette, variantStyle, type IconName, type Variant } from './tokens';

/**
 * Alert — a callout that states a condition and what it means.
 *
 * Same shape as shadcn's Alert (icon + title + description), with the console's
 * status tokens. The title is ink-coloured rather than tinted: the icon and the
 * rail carry the state, and coloured body text at small sizes fails contrast in
 * light mode.
 */
export function Alert({
  variant = 'info',
  title,
  children,
  icon,
  action,
  className,
}: {
  variant?: Variant;
  title: string;
  children?: React.ReactNode;
  /** Defaults to the variant's own icon. */
  icon?: IconName;
  action?: React.ReactNode;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, variant);

  return (
    <View
      accessibilityRole={variant === 'destructive' ? 'alert' : undefined}
      className={cn('flex-row gap-3 rounded-xl border px-4 py-3', className)}
      style={{ backgroundColor: style.tint, borderColor: style.border }}
    >
      <View className="pt-[1px]">
        <MaterialCommunityIcons name={icon ?? style.icon} size={16} color={style.accent} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="font-body-bold text-[13px] tracking-[-0.01em]" style={{ color: palette.ink }}>
            {title}
          </Text>
          {action}
        </View>
        {typeof children === 'string' ? (
          <Text className="font-body text-xs leading-[17px]" style={{ color: palette.inkMuted }}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

/**
 * The view's lead verdict — one per screen.
 *
 * Larger than an Alert and carrying a secondary metadata row, for the single
 * statement the operator needs before anything else on the page.
 */
export function VerdictBanner({
  variant,
  eyebrow,
  title,
  detail,
  meta,
}: {
  variant: Variant;
  eyebrow: string;
  title: string;
  detail: string;
  meta?: React.ReactNode;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, variant);

  return (
    <View
      className="gap-3 rounded-2xl border px-5 py-4"
      style={{ backgroundColor: style.tint, borderColor: style.border }}
    >
      <View className="flex-row items-center gap-2">
        <MaterialCommunityIcons name={style.icon} size={14} color={style.accent} />
        <Text className="font-mono text-[9.5px] uppercase tracking-[0.16em]" style={{ color: palette.inkMuted }}>
          {eyebrow}
        </Text>
      </View>
      <Text className="font-body-bold text-2xl leading-7 tracking-[-0.03em]" style={{ color: palette.ink }}>
        {title}
      </Text>
      <Text className="font-body text-[13px] leading-[19px]" style={{ color: palette.inkMuted }}>
        {detail}
      </Text>
      {meta ? <View className="flex-row flex-wrap items-center gap-2 pt-0.5">{meta}</View> : null}
    </View>
  );
}
