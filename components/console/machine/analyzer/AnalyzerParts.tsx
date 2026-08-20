/**
 * Shared furniture for the Analyzer workspace.
 *
 * These are the pieces every analysis screen builds from, so Diagnosis, Advance
 * Diagnosis and Signal read as one instrument rather than three pages that
 * happen to share a tab bar.
 *
 * Nothing here introduces a colour or a size that is not already in the console
 * kit — they resolve out of `ConsolePalette` exactly like `components/ui`.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type React from 'react';
import { useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { alpha, consolePalette, variantStyle, type Variant } from '../../../ui';

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * A surface that answers when you touch it.
 *
 * Everything selectable in this layer — a part chip, a finding row, a signal, a
 * tool — is one of these, so the whole screen responds the same way instead of
 * each control inventing its own feedback. Three states, and only three:
 *
 *   hover     lifts a little, so what is under the cursor is obvious
 *   press     grows very slightly and casts a shadow, so the tap lands
 *   selected  holds the lift with a ring, so the choice stays visible
 *
 * The scale is deliberately small. A control that jumps reads as a bug on a
 * plant console; 2% and a shadow is enough to feel deliberate at arm's length
 * without moving the numbers next to it. Both values run on the JS driver:
 * shadow cannot be driven natively, and mixing drivers on one node buys nothing
 * on a web-first console.
 */
export function PressSurface({
  onPress,
  selected = false,
  disabled = false,
  accessibilityLabel,
  accessibilityRole = 'button',
  /** Ring colour when selected or pressed. Defaults to the palette's strong line. */
  accent,
  style,
  className,
  children,
}: {
  onPress?: () => void;
  selected?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'tab';
  accent?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
  children: React.ReactNode;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const [hovered, setHovered] = useState(false);

  const animate = (toScale: number, toLift: number) => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: toScale,
        duration: 130,
        easing: Easing.bezier(0.2, 0, 0, 1),
        useNativeDriver: false,
      }),
      Animated.timing(lift, {
        toValue: toLift,
        duration: 130,
        easing: Easing.bezier(0.2, 0, 0, 1),
        useNativeDriver: false,
      }),
    ]).start();
  };

  const ring = accent ?? palette.lineStrong;
  const active = selected || hovered;

  return (
    <Animated.View
      style={[
        { transform: [{ scale }] },
        {
          shadowColor: palette.shadow,
          shadowOpacity: lift.interpolate({ inputRange: [0, 1], outputRange: [0, isDark ? 0.5 : 0.14] }),
          shadowRadius: lift.interpolate({ inputRange: [0, 1], outputRange: [0, 14] }),
          shadowOffset: { width: 0, height: 4 },
        } as never,
      ]}
    >
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled || !onPress}
        accessibilityRole={onPress ? accessibilityRole : undefined}
        accessibilityState={accessibilityRole === 'tab' ? { selected } : undefined}
        accessibilityLabel={accessibilityLabel}
        onHoverIn={() => {
          setHovered(true);
          if (!disabled) animate(1.01, 0.55);
        }}
        onHoverOut={() => {
          setHovered(false);
          animate(1, selected ? 0.4 : 0);
        }}
        onPressIn={() => animate(1.02, 1)}
        onPressOut={() => animate(1, selected || hovered ? 0.5 : 0)}
        className={className}
        style={[style, active || selected ? { borderColor: ring } : null]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/**
 * One region inside a screen's card.
 *
 * The analyzer used to build every region as its own bordered card, which meant
 * a screen was six cards stacked on a page and, once each screen moved inside
 * one card of its own, cards nested inside cards. A region is a rule and a
 * heading, not a box: `Block` draws the hairline, the heading and the padding,
 * and nothing else.
 *
 * `accent` is a dot beside the title rather than a tinted border. Inside a card
 * a coloured edge reads as a second card; a dot reads as a state.
 */
export function Block({
  title,
  meta,
  actions,
  accent,
  footnote,
  children,
  padded = true,
  first = false,
}: {
  title?: string;
  /** One short line under the title. */
  meta?: string;
  /** Filters, counts, toggles — anything that operates on the content. */
  actions?: React.ReactNode;
  accent?: Variant;
  /** Small print at the foot of the region: caveats, provenance, advisory. */
  footnote?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
  /** Suppresses the top hairline for the first region in a card. */
  first?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const dot = accent ? variantStyle(palette, accent).accent : undefined;

  return (
    <View style={first ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}>
      {title ? (
        <View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-1 pt-3.5">
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-2">
              {dot ? <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: dot }} /> : null}
              <Text className="min-w-0 font-body-bold text-[14px] tracking-[-0.015em]" style={{ color: palette.ink }}>
                {title}
              </Text>
            </View>
            {meta ? (
              <Text className="mt-1 font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
                {meta}
              </Text>
            ) : null}
          </View>
          {actions ? <View className="flex-row flex-wrap items-center gap-1.5">{actions}</View> : null}
        </View>
      ) : null}

      <View className={cn(padded && 'px-4 pb-4 pt-2.5')}>{children}</View>

      {footnote ? (
        <View className="px-4 pb-3.5">
          {typeof footnote === 'string' ? (
            <Text className="font-body text-[10px] leading-[14px]" style={{ color: palette.inkFaint }}>
              {footnote}
            </Text>
          ) : (
            footnote
          )}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/** Search box sized for a toolbar rather than a form. */
export function SearchField({
  value,
  onChange,
  placeholder,
  width = 200,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  width?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className="min-w-[150px] flex-row items-center gap-1.5 rounded-lg border px-2 py-1"
      style={{ borderColor: palette.line, backgroundColor: palette.panelRaised, width }}
    >
      <MaterialCommunityIcons name="magnify" size={13} color={palette.inkFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.inkFaint}
        accessibilityLabel={placeholder}
        className="min-w-0 flex-1 font-body text-[11px]"
        style={{ color: palette.ink, outlineStyle: 'none' } as never}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Clear search">
          <MaterialCommunityIcons name="close-circle" size={13} color={palette.inkFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

export type FilterOption<T extends string> = { value: T; label: string; count?: number; variant?: Variant };

/**
 * A segmented filter.
 *
 * Counts live inside the chip rather than in a legend beside it: "3 crossed" is
 * the reason to press the chip, so it belongs on the thing you press.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Screen-reader name for the group. */
  label: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      className="flex-row items-center gap-0.5 rounded-lg border p-0.5"
      style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
    >
      {options.map((option) => {
        const active = option.value === value;
        const style = option.variant ? variantStyle(palette, option.variant) : null;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.count === undefined ? option.label : `${option.label}, ${option.count}`}
            className="flex-row items-center gap-1 rounded-md px-2 py-[3px]"
            style={active ? { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.lineStrong } : undefined}
          >
            {option.variant && !active ? (
              <View style={{ width: 4.5, height: 4.5, borderRadius: 5, backgroundColor: style?.accent }} />
            ) : null}
            <Text
              className="font-mono text-[9.5px] uppercase tracking-[0.12em]"
              style={{ color: active ? palette.ink : palette.inkMuted }}
            >
              {option.label}
            </Text>
            {option.count !== undefined ? (
              <Text
                className="font-mono text-[9.5px]"
                style={{ color: active ? (style?.accent ?? palette.inkMuted) : palette.inkFaint, fontVariant: ['tabular-nums'] }}
              >
                {option.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A tag's recent samples, drawn at the height of a line of text.
 *
 * The rolling history the pipeline already keeps for its temporal features
 * costs nothing to draw and turns a bare number into a number with a direction.
 * Nulls break the line rather than being interpolated across — a gap in the
 * data is information, and joining over it would draw a measurement that was
 * never taken.
 */
export function TagTrend({
  values,
  colour,
  width = 62,
  height = 22,
}: {
  values: (number | null)[];
  colour: string;
  width?: number;
  height?: number;
}) {
  const path = useMemo(() => {
    const samples = values.slice(-24);
    const finite = samples.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (finite.length < 2) return null;
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const span = max - min || Math.abs(max) || 1;
    const stepX = samples.length > 1 ? width / (samples.length - 1) : width;

    let d = '';
    let pen = false;
    samples.forEach((value, index) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        pen = false;
        return;
      }
      const x = index * stepX;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      d += `${pen ? ' L' : ' M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      pen = true;
    });
    return d.trim() || null;
  }, [height, values, width]);

  if (!path) {
    return (
      <View style={{ width, height }} className="justify-center">
        <View style={{ height: 1, backgroundColor: alpha(colour, 0.25) }} />
      </View>
    );
  }

  return (
    <Svg width={width} height={height}>
      <Path d={path} fill="none" stroke={colour} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * A dense record row that expands in place.
 *
 * Used by the Signal table so a row behaves the same way everywhere it appears,
 * and so a narrow viewport gets a card without a second implementation of the
 * same content.
 */
export function ExpandableRow({
  expanded,
  onToggle,
  accessibilityLabel,
  summary,
  detail,
  tone,
  first = false,
}: {
  expanded: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  summary: React.ReactNode;
  detail?: React.ReactNode;
  /** Paints a 2px status edge on the leading side. */
  tone?: string;
  first?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  // Hover is held in state rather than read from Pressable's render callback:
  // NativeWind compiles `className` into `style`, and a function-form style is
  // dropped, so the callback form never paints.
  const [hover, setHover] = useState(false);

  return (
    <View style={first ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}>
      <Pressable
        onPress={detail ? onToggle : undefined}
        disabled={!detail}
        accessibilityRole={detail ? 'button' : undefined}
        accessibilityState={detail ? { expanded } : undefined}
        accessibilityLabel={accessibilityLabel}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        className="flex-row items-center gap-2.5 px-3.5 py-2"
        style={[
          hover || expanded ? { backgroundColor: palette.panelRaised } : null,
          tone ? { borderLeftWidth: 2, borderLeftColor: tone, paddingLeft: 10 } : null,
        ]}
      >
        <View className="min-w-0 flex-1">{summary}</View>
        {detail ? (
          <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={palette.inkFaint} />
        ) : null}
      </Pressable>
      {expanded && detail ? (
        <View className="px-3.5 pb-3 pt-0.5" style={{ backgroundColor: palette.panelRaised }}>
          {detail}
        </View>
      ) : null}
    </View>
  );
}

/** Label above value, aligned in a wrapping grid. The console's fact cell. */
export function Fact({
  label,
  value,
  mono = true,
  tone,
  width = 96,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: string;
  width?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View style={{ minWidth: width }}>
      <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn('mt-0.5', mono ? 'font-mono text-[11px]' : 'font-body text-[11.5px]')}
        style={{ color: tone ?? palette.ink, fontVariant: mono ? ['tabular-nums'] : undefined }}
      >
        {value}
      </Text>
    </View>
  );
}

/** A numbered instruction step. Ordered work reads as a list, not a paragraph. */
export function StepRow({ index, text, muted = false }: { index: number; text: string; muted?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className="flex-row items-start gap-2.5">
      <View
        className="mt-[1px] h-[18px] w-[22px] items-center justify-center rounded"
        style={{ backgroundColor: palette.panelRaised }}
      >
        <Text className="font-mono text-[9.5px]" style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}>
          {String(index).padStart(2, '0')}
        </Text>
      </View>
      <Text className="min-w-0 flex-1 font-body text-[12px] leading-[17px]" style={{ color: muted ? palette.inkMuted : palette.ink }}>
        {text}
      </Text>
    </View>
  );
}

/** Empty state inside a section. One sentence, no illustration. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <Text className="py-4 text-center font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
      {children}
    </Text>
  );
}

