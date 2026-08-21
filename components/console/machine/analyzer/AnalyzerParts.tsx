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
import { useId, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { alpha, consolePalette, tabular, text, variantStyle, type Variant } from '../../../ui';

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
              <Text className={cn('min-w-0', text.title)} style={{ color: palette.ink }}>
                {title}
              </Text>
            </View>
            {meta ? (
              <Text className={cn('mt-1', text.body)} style={{ color: palette.inkMuted }}>
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
            <Text className={text.micro} style={{ color: palette.inkFaint }}>
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
      className="min-w-[150px] flex-row items-center gap-1.5 rounded-[6px] border px-2 py-1"
      style={{ borderColor: palette.line, backgroundColor: palette.panelRaised, width }}
    >
      <MaterialCommunityIcons name="magnify" size={13} color={palette.inkFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.inkFaint}
        accessibilityLabel={placeholder}
        className={cn('min-w-0 flex-1', text.body)}
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
      className="flex-row items-center gap-0.5 rounded-[6px] border p-0.5"
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
            className="flex-row items-center gap-1 rounded-[6px] px-2 py-[3px]"
            style={active ? { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.lineStrong } : undefined}
          >
            {option.variant && !active ? (
              <View style={{ width: 4.5, height: 4.5, borderRadius: 6, backgroundColor: style?.accent }} />
            ) : null}
            <Text
              className={text.label}
              style={{ color: active ? palette.ink : palette.inkMuted }}
            >
              {option.label}
            </Text>
            {option.count !== undefined ? (
              <Text
                className={text.label}
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
      <Text className={text.label} style={{ color: palette.inkFaint }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn('mt-0.5', mono ? text.data : text.body)}
        style={{ color: tone ?? palette.ink, fontVariant: mono ? ['tabular-nums'] : undefined }}
      >
        {value}
      </Text>
    </View>
  );
}




// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

/**
 * A card that answers to the cursor without being a control.
 *
 * `PressSurface` is for things you can choose. This is for things you only
 * read — a status tile, a ranked cause — where the lift exists to say "this
 * one, under your cursor" while you scan a row of near-identical cards, not to
 * promise a click.
 *
 * The two must not be confused, so the motion is deliberately different in
 * kind: `PressSurface` scales, this one rises and warms. A card that rises
 * without scaling reads as paper lifting off the page; a card that scales reads
 * as a button under a finger. Only the second one would be a lie here.
 *
 * `react-native-web` routes hover through `useHover`, which it switches off
 * whenever the `Pressable` is disabled — so this never sets `disabled`, and
 * simply omits `onPress` when there is nothing to press.
 */
export function HoverLift({
  onPress,
  accessibilityLabel,
  /** Border and glow colour at full hover. Defaults to the palette's strong line. */
  accent,
  /** How far the card rises, in px. */
  rise = 3,
  /** Corner radius of the glow ring. Must match the child's own radius. */
  radius = 16,
  style,
  className,
  children,
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
  accent?: string;
  rise?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
  children: React.ReactNode;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const hover = useRef(new Animated.Value(0)).current;

  const to = (value: number) =>
    Animated.timing(hover, {
      toValue: value,
      duration: value === 0 ? 220 : 160,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: false,
    }).start();

  const glow = accent ?? palette.lineStrong;

  return (
    <Animated.View
      style={[
        style as never,
        { transform: [{ translateY: hover.interpolate({ inputRange: [0, 1], outputRange: [0, -rise] }) }] },
        {
          shadowColor: palette.shadow,
          shadowOpacity: hover.interpolate({ inputRange: [0, 1], outputRange: [0, isDark ? 0.55 : 0.13] }),
          shadowRadius: hover.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }),
          shadowOffset: { width: 0, height: 6 },
        } as never,
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        onHoverIn={() => to(1)}
        onHoverOut={() => to(0)}
        onPressIn={() => to(1)}
        className={className}
        style={{ flex: 1 }}
      >
        {children}
        {/* The warm edge. A separate absolutely-positioned ring rather than an
            animated `borderColor`: the card underneath already owns its border,
            and animating that one would make the resting state depend on which
            card last had the cursor. */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: glow,
            opacity: hover.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
          }}
        />
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Charting
// ---------------------------------------------------------------------------

/** Plot geometry. The left gutter holds the value scale, the foot holds time. */
const PLOT = { left: 48, right: 14, top: 16, bottom: 20, rows: 4, cols: 8 };

type Guide = { y: number; colour: string; label: string };

/**
 * A measurement over its session history, drawn the way an instrument reads it.
 *
 * The analyzer used to draw this as a bare polyline in a box — a shape with no
 * scale, no baseline and no reference, which tells a reader that something
 * changed but never how much, or whether it mattered. A trend is only worth
 * drawing if it can be *measured* off the page, so this one carries:
 *
 *   - a ruled matrix, so a slope can be read as a rate rather than a mood;
 *   - a value scale in the left gutter, so a height is a number;
 *   - the reference and the configured limits as their own lines, so "high"
 *     is a position relative to something rather than an adjective;
 *   - a filled area under the trace, which is what makes the direction of
 *     travel legible at a glance instead of on inspection;
 *   - a marked latest sample, because that is the value the reader came for
 *     and it is otherwise just the right-hand end of a line.
 *
 * Gaps stay gaps. A null is a sample that was never taken, and interpolating
 * across it would draw a measurement this machine never made — so the trace and
 * the fill both break and resume.
 *
 * The domain comes from the data, then admits a reference or a limit only when
 * it is near enough to sit inside the frame. A critical limit an order of
 * magnitude above the reading would otherwise flatten the whole trace into the
 * bottom pixel row to make space for a line nothing is near.
 */
export function TrendChart({
  values,
  colour,
  unit,
  reference = null,
  warningLimit = null,
  criticalLimit = null,
  height = 158,
  footLeft = 'oldest',
  footRight = 'latest',
}: {
  values: (number | null)[];
  colour: string;
  unit: string;
  reference?: number | null;
  warningLimit?: number | null;
  criticalLimit?: number | null;
  height?: number;
  footLeft?: string;
  footRight?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const gradientId = useId().replace(/:/g, '');
  const [width, setWidth] = useState(0);

  const model = useMemo(() => {
    if (width <= PLOT.left + PLOT.right + 40) return null;
    const samples = values.slice(-72);
    const finite = samples.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (finite.length < 2) return null;

    const plotW = width - PLOT.left - PLOT.right;
    const plotH = height - PLOT.top - PLOT.bottom;

    let low = Math.min(...finite);
    let high = Math.max(...finite);
    const dataSpan = high - low || Math.abs(high) || 1;

    // A guide is admitted to the domain only if it is within one data-span of
    // the data. Anything further away is a line the reading is nowhere near,
    // and letting it set the scale would cost the trace all of its resolution.
    const admit = (guide: number | null) => {
      if (guide === null || !Number.isFinite(guide)) return;
      if (guide < low - dataSpan || guide > high + dataSpan) return;
      low = Math.min(low, guide);
      high = Math.max(high, guide);
    };
    admit(reference);
    admit(warningLimit);
    admit(criticalLimit);

    const pad = (high - low || Math.abs(high) || 1) * 0.12;
    const min = low - pad;
    const max = high + pad;
    const span = max - min || 1;

    const xAt = (index: number) =>
      PLOT.left + (samples.length > 1 ? (index / (samples.length - 1)) * plotW : plotW / 2);
    const yAt = (value: number) => PLOT.top + plotH - ((value - min) / span) * plotH;

    // Contiguous runs of real samples. One path per run keeps the gaps honest.
    const runs: { x: number; y: number }[][] = [];
    let run: { x: number; y: number }[] = [];
    samples.forEach((value, index) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        if (run.length > 0) runs.push(run);
        run = [];
        return;
      }
      run.push({ x: xAt(index), y: yAt(value) });
    });
    if (run.length > 0) runs.push(run);

    const floor = PLOT.top + plotH;
    const line = runs.map((points) =>
      points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' '),
    );
    const area = runs
      .filter((points) => points.length > 1)
      .map(
        (points) =>
          `M ${points[0].x.toFixed(1)} ${floor.toFixed(1)} ` +
          points.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ') +
          ` L ${points[points.length - 1].x.toFixed(1)} ${floor.toFixed(1)} Z`,
      );

    const guides: Guide[] = [];
    const push = (value: number | null, guideColour: string, label: string) => {
      if (value === null || !Number.isFinite(value) || value < min || value > max) return;
      guides.push({ y: yAt(value), colour: guideColour, label });
    };
    push(reference, palette.neutral, 'ref');
    push(warningLimit, palette.warning, 'warn');
    push(criticalLimit, palette.critical, 'alarm');

    const lastRun = runs[runs.length - 1];
    const latest = lastRun && lastRun.length > 0 ? lastRun[lastRun.length - 1] : null;

    return { min, max, plotW, plotH, line, area, guides, latest, floor };
  }, [criticalLimit, height, palette.critical, palette.neutral, palette.warning, reference, values, warningLimit, width]);

  const tick = (value: number) => {
    const magnitude = Math.abs(value);
    return value.toFixed(magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2);
  };

  return (
    <View onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))} style={{ height, width: '100%' }}>
      {model ? (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id={`trend${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colour} stopOpacity={isDark ? 0.36 : 0.24} />
                <Stop offset="1" stopColor={colour} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* The matrix. Verticals are the sampling grid, horizontals the
                value grid; both sit under everything else so the trace can
                never be mistaken for one of them. */}
            {Array.from({ length: PLOT.cols + 1 }, (_, index) => {
              const gx = PLOT.left + (index / PLOT.cols) * model.plotW;
              const edge = index === 0 || index === PLOT.cols;
              return (
                <Line
                  key={`v${index}`}
                  x1={gx}
                  y1={PLOT.top}
                  x2={gx}
                  y2={model.floor}
                  stroke={palette.line}
                  strokeWidth={1}
                  opacity={edge ? 0.95 : 0.5}
                />
              );
            })}
            {Array.from({ length: PLOT.rows + 1 }, (_, index) => {
              const gy = PLOT.top + (index / PLOT.rows) * model.plotH;
              const edge = index === 0 || index === PLOT.rows;
              return (
                <Line
                  key={`h${index}`}
                  x1={PLOT.left}
                  y1={gy}
                  x2={PLOT.left + model.plotW}
                  y2={gy}
                  stroke={palette.line}
                  strokeWidth={1}
                  strokeDasharray={edge ? undefined : '2 5'}
                  opacity={edge ? 0.95 : 0.7}
                />
              );
            })}

            {/* Reference and limits, each in the colour of what it means. */}
            {model.guides.map((guide) => (
              <Line
                key={guide.label}
                x1={PLOT.left}
                y1={guide.y}
                x2={PLOT.left + model.plotW}
                y2={guide.y}
                stroke={guide.colour}
                strokeWidth={1}
                strokeDasharray="5 4"
                opacity={0.8}
              />
            ))}

            {model.area.map((path, index) => (
              <Path key={`a${index}`} d={path} fill={`url(#trend${gradientId})`} />
            ))}
            {model.line.map((path, index) => (
              <Path
                key={`l${index}`}
                d={path}
                fill="none"
                stroke={colour}
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* The latest sample: a dropline to the floor, a halo, and a ring
                in the panel colour so the dot never merges with the trace. */}
            {model.latest ? (
              <>
                <Line
                  x1={model.latest.x}
                  y1={model.latest.y}
                  x2={model.latest.x}
                  y2={model.floor}
                  stroke={colour}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  opacity={0.5}
                />
                <Circle cx={model.latest.x} cy={model.latest.y} r={7} fill={colour} opacity={0.16} />
                <Circle cx={model.latest.x} cy={model.latest.y} r={4.2} fill={palette.panel} />
                <Circle cx={model.latest.x} cy={model.latest.y} r={2.6} fill={colour} />
              </>
            ) : null}

            {/* Corner brackets. An instrument frames its window; a plain
                rectangle reads as a text box that happens to hold a line. */}
            {[
              [PLOT.left, PLOT.top, 1],
              [PLOT.left + model.plotW - 9, PLOT.top, 1],
              [PLOT.left, model.floor - 1, -1],
              [PLOT.left + model.plotW - 9, model.floor - 1, -1],
            ].map(([bx, by], index) => (
              <Rect key={`c${index}`} x={bx} y={by} width={9} height={1.4} fill={palette.lineStrong} />
            ))}
          </Svg>

          {/* Scale and time as real text rather than SVG glyphs: the console's
              mono face is loaded for the DOM, and naming the family again
              inside the SVG would mean maintaining it in two type systems. */}
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
            {[0, 0.5, 1].map((fraction) => (
              <Text
                key={fraction}
                className={cn('absolute', text.label)}
                style={{
                  color: palette.inkFaint,
                  left: 0,
                  width: PLOT.left - 8,
                  textAlign: 'right',
                  top: PLOT.top + fraction * model.plotH - 5,
                  fontVariant: ['tabular-nums'],
                }}
                numberOfLines={1}
              >
                {tick(model.max - fraction * (model.max - model.min))}
              </Text>
            ))}
            <Text
              className={cn('absolute', text.label)}
              style={{ color: palette.inkFaint, left: 0, width: PLOT.left - 8, textAlign: 'right', top: 1 }}
              numberOfLines={1}
            >
              {unit || 'value'}
            </Text>

            <Text
              className={cn('absolute', text.label)}
              style={{ color: palette.inkFaint, left: PLOT.left, bottom: 2 }}
            >
              {footLeft}
            </Text>
            <Text
              className={cn('absolute', text.label)}
              style={{ color: palette.inkFaint, right: PLOT.right, bottom: 2 }}
            >
              {footRight}
            </Text>

            {/* A legend appears only for the guides that were actually drawn. */}
            {model.guides.length > 0 ? (
              <View className="absolute flex-row items-center gap-2.5" style={{ right: PLOT.right, top: 1 }}>
                {model.guides.map((guide) => (
                  <View key={guide.label} className="flex-row items-center gap-1">
                    <View style={{ width: 9, height: 1.5, backgroundColor: guide.colour, opacity: 0.85 }} />
                    <Text className={text.label} style={{ color: palette.inkFaint }}>
                      {guide.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </>
      ) : (
        <View className="flex-1 items-center justify-center">
          <Text className={text.body} style={{ color: palette.inkFaint }}>
            At least two samples are needed before a trend can be drawn.
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Where the current reading sits inside the range this session has seen.
 *
 * The min/max/mean facts under a chart are three numbers a reader has to hold
 * in their head to answer one question — "is this reading high for today?".
 * The rail answers it as a position instead: the span is the track, the marker
 * is now, and the mean is a tick the marker sits visibly one side of.
 */
export function RangeRail({
  min,
  max,
  mean,
  value,
  colour,
}: {
  min: number;
  max: number;
  mean: number;
  value: number | null;
  colour: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const span = max - min || 1;
  const at = (point: number) => `${Math.min(100, Math.max(0, ((point - min) / span) * 100))}%` as `${number}%`;

  return (
    <View className="h-[14px] justify-center">
      <View className="h-[4px] rounded-full" style={{ backgroundColor: palette.panelRaised }}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: value === null ? 0 : at(value),
            borderRadius: 6,
            backgroundColor: alpha(colour, 0.4),
          }}
        />
      </View>
      <View
        style={{
          position: 'absolute',
          left: at(mean),
          width: 1,
          height: 11,
          marginLeft: -0.5,
          backgroundColor: palette.lineStrong,
        }}
      />
      {value !== null ? (
        <View
          style={{
            position: 'absolute',
            left: at(value),
            width: 9,
            height: 9,
            marginLeft: -4.5,
            borderRadius: 10,
            backgroundColor: colour,
            borderWidth: 2,
            borderColor: palette.panel,
          }}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

/**
 * A section with nothing in it, said properly.
 *
 * This replaced a bare grey sentence centred in the region, which across half
 * of a two-column screen reads as a panel that failed to load rather than as an
 * answer. An empty result here is a real finding — "nothing matched" is what
 * the model concluded — so it gets a frame, a glyph, and where the caller has
 * one, the count of what was checked to reach it.
 */
export function EmptyState({
  icon,
  title,
  detail,
  meta,
  variant = 'muted',
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  detail: string;
  meta?: string;
  variant?: Variant;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, variant);

  return (
    <View
      className="items-center gap-2 rounded-[14px] border px-5 py-6"
      style={{ borderColor: palette.line, borderStyle: 'dashed', backgroundColor: palette.panelRaised }}
    >
      <View className="h-9 w-9 items-center justify-center rounded-[10px]" style={{ backgroundColor: style.tint }}>
        <MaterialCommunityIcons name={icon} size={18} color={style.accent} />
      </View>
      <Text className={cn('text-center', text.bodyStrong)} style={{ color: palette.ink }}>
        {title}
      </Text>
      <Text className={cn('max-w-[420px] text-center', text.body)} style={{ color: palette.inkMuted }}>
        {detail}
      </Text>
      {meta ? (
        <View
          className="mt-0.5 rounded-full border px-2.5 py-[3px]"
          style={{ borderColor: palette.line, backgroundColor: palette.panel }}
        >
          <Text className={text.label} style={{ color: palette.inkFaint }}>
            {meta}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Where a reading sits between where it has been and where it must not go.
 *
 * This is the one thing a monitoring table cannot say in numbers. Two columns
 * of limits tell a reader that vibration is 3.2 and the warning is 4.5, and
 * leave them to do the arithmetic on every row, for every row, every time they
 * scan the table. The bar does it once and draws the answer: the track is the
 * span the session has actually seen extended to include the limits, the ticks
 * are the limits themselves, and the marker is now. A row whose marker is
 * crowding its ticks is visible from across the table without a single number
 * being read.
 *
 * The domain is the signal's own history, not a fixed scale. A fixed scale
 * would put a 200 °C reading with a 210 °C limit at 95% of the track on a
 * perfectly healthy machine, which is exactly the false alarm this is meant to
 * prevent.
 *
 * A channel with no limits configured gets a track and a marker but no ticks,
 * drawn faint: it still says where the reading sits in its own range, and it
 * says plainly that nothing is judging it. That distinction is the whole reason
 * the Signals table has a "no limit" filter.
 */
export function MarginBar({
  value,
  history,
  warningLimit,
  criticalLimit,
  variant,
}: {
  value: number | null;
  /** Session samples, which set the domain along with the limits. */
  history: (number | null)[];
  warningLimit: number | null;
  criticalLimit: number | null;
  /** Drives the marker and fill colour — the row's own status. */
  variant: Variant;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent = variantStyle(palette, variant).accent;
  const graded = warningLimit !== null || criticalLimit !== null;

  const domain = useMemo(() => {
    const seen = history.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry));
    const anchors = [...seen, ...(value !== null ? [value] : [])];
    if (anchors.length === 0) return null;
    let lo = Math.min(...anchors);
    let hi = Math.max(...anchors);
    for (const limit of [warningLimit, criticalLimit]) {
      if (limit !== null && Number.isFinite(limit)) hi = Math.max(hi, limit);
    }
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.08;
    lo -= pad;
    hi += pad;
    return { lo, hi, span: hi - lo || 1 };
  }, [criticalLimit, history, value, warningLimit]);

  if (!domain || value === null) {
    return (
      <View className="h-[14px] justify-center">
        <View style={{ height: 2, borderRadius: 2, backgroundColor: palette.line }} />
      </View>
    );
  }

  const at = (point: number) =>
    `${Math.min(100, Math.max(0, ((point - domain.lo) / domain.span) * 100))}%` as `${number}%`;

  return (
    <View className="h-[14px] justify-center">
      {/* The track: the whole domain, quiet. */}
      <View
        style={{
          height: 3,
          borderRadius: 3,
          backgroundColor: graded ? palette.panelRaised : 'transparent',
          borderWidth: graded ? 0 : 1,
          borderColor: palette.line,
          borderStyle: graded ? 'solid' : 'dashed',
        }}
      />
      {/* Filled to the reading, so the eye lands on length before position. */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          width: at(value),
          height: 3,
          borderRadius: 3,
          backgroundColor: alpha(accent, 0.4),
        }}
      />
      {/* The limits, each in its own meaning's colour. */}
      {warningLimit !== null && Number.isFinite(warningLimit) ? (
        <View
          style={{
            position: 'absolute',
            left: at(warningLimit),
            marginLeft: -0.5,
            width: 1,
            height: 10,
            backgroundColor: palette.warning,
          }}
        />
      ) : null}
      {criticalLimit !== null && Number.isFinite(criticalLimit) ? (
        <View
          style={{
            position: 'absolute',
            left: at(criticalLimit),
            marginLeft: -0.5,
            width: 1,
            height: 10,
            backgroundColor: palette.critical,
          }}
        />
      ) : null}
      {/* Now. Ringed in the panel colour so it never merges with a tick. */}
      <View
        style={{
          position: 'absolute',
          left: at(value),
          marginLeft: -4,
          width: 8,
          height: 8,
          borderRadius: 6,
          backgroundColor: accent,
          borderWidth: 1.5,
          borderColor: palette.panel,
        }}
      />
    </View>
  );
}
