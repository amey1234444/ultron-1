import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { consolePalette, floatingElevation } from '../../../../lib/consoleTheme';
import { text } from '../../../ui';

// The trends toolbar's one popover.
//
// It is a `Modal` rather than an absolutely-positioned view for the same reason
// the asset hierarchy's context menu is: this app renders react-native views,
// there is no portal, and a menu nested inside a scrolling card gets clipped by
// the card. The modal is transparent, the backdrop closes it, and the panel is
// positioned from the trigger's measured window rect — so it opens against the
// control, not against the page.

const EDGE = 12;

export type DropdownRenderProps = { close: () => void };

export function Dropdown({
  /** What the closed control names — "Window", "Sensor". */
  label,
  /** The current selection, shown beside the label. */
  value,
  /** Accent for the value text; defaults to ink. */
  valueColour,
  menuWidth = 240,
  menuMaxHeight = 520,
  disabled = false,
  accessibilityLabel,
  children,
}: {
  label: string;
  value: string;
  valueColour?: string;
  menuWidth?: number;
  menuMaxHeight?: number;
  disabled?: boolean;
  accessibilityLabel: string;
  children: (props: DropdownRenderProps) => ReactNode;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const anchor = useRef<View | null>(null);
  const [rect, setRect] = useState<{ x: number; y: number; height: number } | null>(null);
  const [hovered, setHovered] = useState(false);

  const open = useCallback(() => {
    anchor.current?.measureInWindow((x, y, _width, height) => setRect({ x, y, height }));
  }, []);
  const close = useCallback(() => setRect(null), []);

  // Right-aligned to the trigger when the menu would otherwise run off screen,
  // and flipped above it when there is no room below — a window menu that opens
  // past the bottom of a laptop screen cannot be scrolled to.
  const left = rect ? Math.max(EDGE, Math.min(rect.x, screenWidth - menuWidth - EDGE)) : 0;
  const spaceBelow = rect ? screenHeight - (rect.y + rect.height) - EDGE : 0;
  const flip = rect ? spaceBelow < 220 && rect.y > spaceBelow : false;
  const height = rect ? Math.min(menuMaxHeight, Math.max(180, flip ? rect.y - EDGE * 2 : spaceBelow)) : menuMaxHeight;
  const top = rect ? (flip ? Math.max(EDGE, rect.y - height - 6) : rect.y + rect.height + 6) : 0;

  return (
    <>
      <View ref={anchor} collapsable={false}>
        <Pressable
          onPress={disabled ? undefined : open}
          disabled={disabled}
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ expanded: rect !== null, disabled }}
          className="flex-row items-center gap-2 rounded-lg border px-2.5 py-[5px]"
          style={{
            borderColor: rect || hovered ? palette.lineStrong : palette.line,
            backgroundColor: rect ? palette.selected : hovered ? palette.hover : palette.panel,
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <Text className={text.meta} style={{ color: palette.inkFaint }}>
            {label}
          </Text>
          <Text className={text.chip} style={{ color: valueColour ?? palette.ink }}>
            {value}
          </Text>
          <Text className={text.meta} style={{ color: palette.inkFaint }}>
            ▾
          </Text>
        </Pressable>
      </View>

      {rect ? (
        <Modal visible transparent animationType="none" onRequestClose={close}>
          <Pressable className="flex-1" onPress={close} accessibilityLabel="Close menu">
            {/* The panel swallows presses so a click inside it does not close
                the menu through the backdrop underneath. */}
            <Pressable
              onPress={() => {}}
              style={{
                position: 'absolute',
                left,
                top,
                width: menuWidth,
                maxHeight: height,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: isDark ? palette.lineStrong : '#D9DDE3',
                backgroundColor: palette.panel,
                overflow: 'hidden',
                ...floatingElevation(isDark),
              }}
            >
              <ScrollView
                style={{ maxHeight: height }}
                contentContainerStyle={{ paddingVertical: 4 }}
                showsVerticalScrollIndicator
              >
                {children({ close })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

/** A group heading inside a dropdown. */
export function DropdownGroupLabel({ children, first }: { children: string; first?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className={cn('px-3 pb-1', first ? 'pt-1.5' : 'pt-2.5')}
      style={first ? undefined : { borderTopWidth: 1, borderTopColor: palette.lineSubtle, marginTop: 4 }}
    >
      <Text className={text.label} style={{ color: palette.inkFaint }}>
        {children}
      </Text>
    </View>
  );
}

/** One selectable row. */
export function DropdownItem({
  label,
  detail,
  selected = false,
  disabled = false,
  onPress,
  accent,
}: {
  label: string;
  /** Right-hand note: a live value, or why the row is unavailable. */
  detail?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  accent?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="menuitem"
      accessibilityState={{ selected, disabled }}
      className="mx-1 flex-row items-center justify-between gap-3 rounded-[7px] px-2 py-[6px]"
      style={{
        backgroundColor: selected ? palette.selected : hovered && !disabled ? palette.hover : 'transparent',
      }}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        {accent ? <View style={{ width: 10, height: 2.5, borderRadius: 2, backgroundColor: accent }} /> : null}
        <Text
          numberOfLines={1}
          className={cn('min-w-0 flex-1', text.body)}
          style={{ color: disabled ? palette.inkDisabled : selected ? palette.ink : palette.inkMuted }}
        >
          {label}
        </Text>
      </View>
      {detail ? (
        <Text className={text.meta} style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}
