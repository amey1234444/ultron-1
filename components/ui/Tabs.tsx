import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { consolePalette, variantStyle, type IconName, type Variant } from './tokens';
import { text } from './type';

export type TabItem<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
  /** Optional count shown as a trailing pill — e.g. how many findings a tab holds. */
  count?: number;
  /** Tints the count pill when the tab holds something that needs attention. */
  countVariant?: Variant;
};

/**
 * Tabs — a segmented control.
 *
 * Controlled, like shadcn's Tabs, but a single component rather than the
 * `Tabs`/`TabsList`/`TabsTrigger` split: Radix's context+portal machinery is what
 * that split exists to serve, and none of it is available in React Native.
 *
 * Horizontally scrollable so the control degrades on a narrow viewport instead
 * of wrapping into two rows or clipping the last tab.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ alignItems: 'center', paddingVertical: 2 }}
      className={className}
      style={{ flexGrow: 0 }}
    >
      <View
        accessibilityRole="tablist"
        className="flex-row items-center gap-1 rounded-full border p-1"
        style={{ borderColor: palette.line, backgroundColor: palette.panel }}
      >
        {items.map((item) => {
          const active = item.value === value;
          const countStyle = item.countVariant ? variantStyle(palette, item.countVariant) : null;
          return (
            <Pressable
              key={item.value}
              onPress={() => onChange(item.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.count === undefined ? item.label : `${item.label}, ${item.count}`}
              className="flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5"
              style={active ? { backgroundColor: isDark ? palette.ink : palette.ink } : undefined}
            >
              {item.icon ? (
                <MaterialCommunityIcons
                  name={item.icon}
                  size={12}
                  color={active ? palette.panel : palette.inkMuted}
                />
              ) : null}
              <Text
                className={text.chip}
                style={{ color: active ? palette.panel : palette.inkMuted }}
              >
                {item.label}
              </Text>
              {item.count !== undefined && item.count > 0 ? (
                <View
                  className="ml-0.5 rounded-full px-1.5 py-[1px]"
                  style={{
                    backgroundColor: active
                      ? isDark
                        ? 'rgba(0,0,0,0.14)'
                        : 'rgba(255,255,255,0.18)'
                      : (countStyle?.tint ?? palette.panelRaised),
                  }}
                >
                  <Text
                    className={text.meta}
                    style={{
                      color: active ? palette.panel : (countStyle?.accent ?? palette.inkMuted),
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {item.count}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
