import { MaterialCommunityIcons } from '@expo/vector-icons';
import type React from 'react';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { Card } from './Card';
import { consolePalette, variantStyle, type IconName, type Variant } from './tokens';
import { text } from './type';

/**
 * Collapsible — a disclosure section.
 *
 * The Analysis layer produces a great deal of legitimate detail: every threshold
 * crossed, every baseline's provenance, every eliminated hypothesis. All of it
 * has to remain reachable — the model's whole value is that it shows its
 * working — but none of it should be in the way of the answer. Detail therefore
 * ships collapsed with its own summary line, so the page opens at a readable
 * length and expands on demand.
 */
export function Collapsible({
  title,
  summary,
  icon,
  variant,
  count,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  /** One line describing what is inside, readable without expanding. */
  summary?: string;
  icon?: IconName;
  /** Tints the icon and count when the section holds something notable. */
  variant?: Variant;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [open, setOpen] = useState(defaultOpen);
  const style = variant ? variantStyle(palette, variant) : null;
  const accent = style?.accent ?? palette.inkMuted;

  return (
    <Card className={cn('p-0', className)} padded={false}>
      <Pressable
        onPress={() => setOpen((previous) => !previous)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}${count === undefined ? '' : `, ${count} items`}`}
        className="flex-row items-center gap-3 px-4 py-3"
      >
        {icon ? <MaterialCommunityIcons name={icon} size={15} color={accent} /> : null}
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-center gap-2">
            <Text className="font-body-bold text-[13px] tracking-[-0.01em]" style={{ color: palette.ink }}>
              {title}
            </Text>
            {count !== undefined && count > 0 ? (
              <View className="rounded-full px-1.5 py-[1px]" style={{ backgroundColor: style?.tint ?? palette.panelRaised }}>
                <Text
                  className={text.meta}
                  style={{ color: accent, fontVariant: ['tabular-nums'] }}
                >
                  {count}
                </Text>
              </View>
            ) : null}
          </View>
          {summary ? (
            <Text numberOfLines={open ? undefined : 1} className="font-body text-[11px] leading-4" style={{ color: palette.inkMuted }}>
              {summary}
            </Text>
          ) : null}
        </View>
        <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={palette.inkFaint} />
      </Pressable>
      {open ? (
        <View className="gap-2 px-4 pb-4 pt-1" style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
          {children}
        </View>
      ) : null}
    </Card>
  );
}
