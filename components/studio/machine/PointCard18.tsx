import type { GestureResponderHandlers } from 'react-native';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { TrailStatus } from './AdjustableTrail';

const STATUS_COLOUR: Record<TrailStatus, string> = {
  normal: '#3FB950',
  warning: '#F2A93B',
  critical: '#EF4444',
  offline: '#737373',
};

export type PointCard18Props = {
  tag: string; // Example: V1, T1, T2
  channel?: string; // Example: V1, T1
  title: string; // Example: RAV-01 DE Vibration H
  value: string; // Example: 4.64
  unit: string; // Example: mm/s, °C
  status?: TrailStatus;
  // Design mode: same visual as the read-only Actual View card, plus a drag
  // handle (the title row), a delete "×", and "Unlink" — so both modes show
  // one consistent card instead of two different designs.
  interactive?: boolean;
  dragHandlers?: GestureResponderHandlers;
  onDelete?: () => void;
  onUnlink?: () => void;
  hideUnlink?: boolean;
};

// The channel readout card, shared by Design mode (editable) and Actual View
// (read-only). A single vertical stack — title + code badge, then the big
// value — instead of a cramped two-column split, so titles get the full card
// width to breathe. Fonts/colours pull from the project's own tokens
// (font-body/font-wordmark/font-mono, ink/muted, accent, panel surfaces) so it
// holds up in both themes.
export function PointCard18({
  tag,
  channel,
  title,
  value,
  unit,
  status = 'normal',
  interactive = false,
  dragHandlers,
  onDelete,
  onUnlink,
  hideUnlink = false,
}: PointCard18Props) {
  const { isDark } = useAppTheme();
  const statusColour = STATUS_COLOUR[status];
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  // The shared `line` border token is only 8% white in dark mode — legible as
  // a hairline divider, not as a card outline. A clear, deliberate border
  // (light in dark mode, dark in light mode) reads as an actual frame instead.
  const borderColour = isDark ? 'rgba(245,245,245,0.32)' : 'rgba(10,10,10,0.28)';

  return (
    <View
      className={cn('overflow-hidden rounded-2xl border', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
      style={{
        width: 248,
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 10,
        borderColor: borderColour,
        shadowColor: '#000000',
        shadowOpacity: isDark ? 0.3 : 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
      }}
    >
      <View
        {...(interactive ? dragHandlers : undefined)}
        // @ts-expect-error web-only: userSelect/cursor aren't in RN's ViewStyle type.
        style={interactive ? { userSelect: 'none', cursor: 'grab' } : undefined}
        className="flex-row items-center gap-2"
      >
        <Text numberOfLines={1} className={cn('font-body-bold flex-1 text-base', inkClass)}>
          {title}
        </Text>
        <View className="rounded-md border border-accent/35 bg-accent/10 px-1.5 py-0.5">
          <Text className="font-body-bold text-[10px] text-accent">{channel ?? tag}</Text>
        </View>
        {interactive && onDelete && (
          <Pressable onPress={onDelete} hitSlop={6}>
            <Text className="font-body-bold text-xs text-status-critical">×</Text>
          </Pressable>
        )}
      </View>

      <View className="flex-row items-baseline gap-1.5">
        {/* Space Grotesk SemiBold — matches the app's own wordmark/heading
            font instead of introducing an unrelated serif; the unit stays in
            mono for a technical, label-like contrast beside it. */}
        <Text numberOfLines={1} style={{ color: statusColour }} className="font-wordmark text-[34px] leading-none">
          {value}
        </Text>
        <Text numberOfLines={1} style={{ color: statusColour }} className="font-mono text-sm">
          {unit}
        </Text>
      </View>

      {/* Left-aligned so it never collides with the status dot, which stays
          pinned to the bottom-right corner regardless of card height. The
          marginTop clears the big value text's rendered glyph box, which —
          with a large custom web font at line-height:1 — extends past its own
          layout row and otherwise intercepts clicks meant for this link.
          Inline style, not a NativeWind className: margin/z-index utilities
          here have repeatedly lost to React Native Web's own generated atomic
          classes on specificity, so inline style is the reliable option. */}
      {interactive && onUnlink && !hideUnlink && (
        <Pressable onPress={onUnlink} hitSlop={6} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
          <Text className={cn('font-body text-[10px] underline', mutedClass)}>Unlink</Text>
        </Pressable>
      )}

      {/* Status dot — inset from the corner rather than flush against it. */}
      <View
        style={{
          position: 'absolute',
          bottom: 12,
          right: 14,
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: statusColour,
        }}
      />
    </View>
  );
}
