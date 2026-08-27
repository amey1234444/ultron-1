import { useEffect, useRef } from 'react';
import { PanResponder, Pressable, Text, TextInput, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { consolePalette } from '../../../lib/consoleTheme';

// The knob sweeps 270° with its dead zone at the bottom, the way a panel
// potentiometer does, so "straight up" reads as mid-range at a glance.
const SWEEP_DEGREES = 270;
const START_DEGREES = -135;
// Pixels of vertical drag that traverse the whole engineering range. Matches
// the simulator's own knob, so an operator who has used one has used both.
const DRAG_PIXELS_FOR_FULL_RANGE = 220;

export type AlarmLimits = {
  lowLow: number | null;
  low: number | null;
  high: number | null;
  highHigh: number | null;
};

export type ProcessCondition = 'normal' | 'warning' | 'critical';

/**
 * The alarm state a value would raise, applying section 5 of the card
 * specification: a high alarm triggers at or above its threshold, a low alarm
 * at or below it, and only enabled levels take part.
 *
 * Hysteresis and delay deliberately play no part here — both describe how an
 * alarm *clears* or how long it must persist, which belong to the alarm engine.
 * This is the instantaneous reading of the configured limits, which is what a
 * commissioning meter shows.
 */
export function processConditionFor(value: number, limits: AlarmLimits): ProcessCondition {
  if (!Number.isFinite(value)) return 'normal';
  if (limits.highHigh !== null && value >= limits.highHigh) return 'critical';
  if (limits.lowLow !== null && value <= limits.lowLow) return 'critical';
  if (limits.high !== null && value >= limits.high) return 'warning';
  if (limits.low !== null && value <= limits.low) return 'warning';
  return 'normal';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Snap to the step grid the display precision implies.
 *
 * Without this a drag lands on 125.4327891 and the card shows 125.43 while the
 * generator publishes the full float — two numbers for one reading. Quantising
 * at the point of input means the value the operator sees is the value that is
 * stored, published and charted.
 */
export function quantize(value: number, step: number): number {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(step) || step <= 0) return value;
  const snapped = Math.round(value / step) * step;
  // Re-round to the step's own decimal count: 0.1 * 3 is 0.30000000000000004.
  const decimals = Math.min(6, Math.max(0, Math.ceil(-Math.log10(step))));
  return Number(snapped.toFixed(decimals));
}

function polar(cx: number, cy: number, radius: number, degrees: number): { x: number; y: number } {
  // 0° points straight up; the knob's own angles are measured from there.
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}

function arcPath(cx: number, cy: number, radius: number, fromDegrees: number, toDegrees: number): string {
  const start = polar(cx, cy, radius, fromDegrees);
  const end = polar(cx, cy, radius, toDegrees);
  const largeArc = Math.abs(toDegrees - fromDegrees) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * A rotary control for one channel's value.
 *
 * Drag vertically for coarse movement, wheel or arrow keys for one step, and
 * Home/End for the range ends. Every path funnels through `commit`, so all of
 * them clamp to the range and land on the same step grid.
 */
export function RotaryKnob({
  label,
  value,
  min,
  max,
  step,
  size = 148,
  tone = 'normal',
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  size?: number;
  tone?: ProcessCondition;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const colour = tone === 'critical' ? palette.criticalValue : tone === 'warning' ? palette.warningValue : palette.accentValue;

  const span = max > min ? max - min : 1;
  const ratio = clamp((value - min) / span, 0, 1);
  const angle = START_DEGREES + ratio * SWEEP_DEGREES;

  // Read by the responder, which is created exactly once: rebuilding it while a
  // pointer is down swaps the DOM node's handlers mid-gesture and stalls the
  // drag (the same trap AdjustableTrail documents).
  const live = useRef({ value, min, max, span, step, disabled, onChange });
  live.current = { value, min, max, span, step, disabled, onChange };
  const grabbedAt = useRef(value);

  const commit = (next: number) => {
    const current = live.current;
    if (current.disabled) return;
    current.onChange(clamp(quantize(next, current.step), current.min, current.max));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.disabled,
      onMoveShouldSetPanResponder: () => !live.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        grabbedAt.current = live.current.value;
      },
      onPanResponderMove: (_event, gesture) => {
        const current = live.current;
        const unitsPerPixel = current.span / DRAG_PIXELS_FOR_FULL_RANGE;
        // Dragging up must raise the value, and `dy` grows downward.
        commit(grabbedAt.current - gesture.dy * unitsPerPixel);
      },
    }),
  ).current;

  // Wheel and keyboard have no react-native equivalent, so they are attached to
  // the underlying DOM node where there is one. On a native target the guard
  // means neither exists and drag remains the whole interaction.
  const surface = useRef<View | null>(null);
  useEffect(() => {
    const node = surface.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    node.tabIndex = live.current.disabled ? -1 : 0;

    const onWheel = (event: WheelEvent) => {
      if (live.current.disabled) return;
      event.preventDefault();
      commit(live.current.value + (event.deltaY < 0 ? live.current.step : -live.current.step));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (live.current.disabled) return;
      const current = live.current;
      // Shift is the coarse modifier, so a 0–250 bar range is still crossable
      // from the keyboard without holding an arrow down for a minute.
      const multiplier = event.shiftKey ? 10 : 1;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') commit(current.value + current.step * multiplier);
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') commit(current.value - current.step * multiplier);
      else if (event.key === 'Home') commit(current.min);
      else if (event.key === 'End') commit(current.max);
      else if (event.key === 'PageUp') commit(current.value + current.span / 10);
      else if (event.key === 'PageDown') commit(current.value - current.span / 10);
      else return;
      event.preventDefault();
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('keydown', onKeyDown);
    };
    // Every handler reads through `live`, so the listeners are attached once
    // and never need replacing as the value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const centre = size / 2;
  const trackRadius = centre - 8;
  const bodyRadius = centre - 21;
  const indicator = polar(centre, centre, bodyRadius - 9, angle);
  const indicatorInner = polar(centre, centre, bodyRadius - 26, angle);

  return (
    <View className="items-center gap-2">
      <View
        ref={surface}
        {...responder.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value }}
        accessibilityState={{ disabled }}
        style={
          {
            width: size,
            height: size,
            cursor: disabled ? 'default' : 'ns-resize',
            userSelect: 'none',
            touchAction: 'none',
            outlineStyle: 'none',
          } as unknown as ViewStyle
        }
      >
        <Svg width={size} height={size}>
          <Path
            d={arcPath(centre, centre, trackRadius, START_DEGREES, START_DEGREES + SWEEP_DEGREES)}
            stroke={palette.line}
            strokeWidth={7}
            strokeLinecap="round"
            fill="none"
          />
          {ratio > 0 && (
            <Path
              d={arcPath(centre, centre, trackRadius, START_DEGREES, angle)}
              stroke={disabled ? palette.inkMuted : colour}
              strokeWidth={7}
              strokeLinecap="round"
              fill="none"
              opacity={disabled ? 0.4 : 1}
            />
          )}
          <Circle cx={centre} cy={centre} r={bodyRadius} fill={palette.panelRaised} stroke={palette.lineStrong} strokeWidth={1} />
          <Path
            d={`M ${indicatorInner.x} ${indicatorInner.y} L ${indicator.x} ${indicator.y}`}
            stroke={disabled ? palette.inkMuted : colour}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <Circle cx={centre} cy={centre} r={4} fill={disabled ? palette.inkMuted : colour} />
        </Svg>
      </View>
      <View className="flex-row justify-between" style={{ width: size }}>
        <Text className={cn('font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{min}</Text>
        <Text className={cn('font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{max}</Text>
      </View>
    </View>
  );
}

type Band = { from: number; to: number; level: ProcessCondition };

/**
 * The configured range split into its alarm bands.
 *
 * Built by cutting the range at every enabled threshold and classifying each
 * resulting slice by its own midpoint, so the picture can never disagree with
 * `processConditionFor` — one rule decides both the colour of a band and the
 * state of the reading sitting on it.
 */
export function alarmBands(min: number, max: number, limits: AlarmLimits): Band[] {
  if (!(max > min)) return [];
  const cuts = [min, max];
  for (const limit of [limits.lowLow, limits.low, limits.high, limits.highHigh]) {
    if (limit !== null && Number.isFinite(limit) && limit > min && limit < max) cuts.push(limit);
  }
  const sorted = Array.from(new Set(cuts)).sort((a, b) => a - b);
  const bands: Band[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const from = sorted[index - 1];
    const to = sorted[index];
    bands.push({ from, to, level: processConditionFor((from + to) / 2, limits) });
  }
  return bands;
}

/** The horizontal meter beneath the knob: alarm bands, with the reading on them. */
export function AlarmBandMeter({
  min,
  max,
  value,
  limits,
  unit,
}: {
  min: number;
  max: number;
  value: number;
  limits: AlarmLimits;
  unit: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const bands = alarmBands(min, max, limits);
  const span = max > min ? max - min : 1;
  const fill = (level: ProcessCondition) =>
    level === 'critical' ? palette.criticalSoft : level === 'warning' ? palette.warningSoft : palette.accentSoft;
  const edge = (level: ProcessCondition) =>
    level === 'critical' ? palette.criticalValue : level === 'warning' ? palette.warningValue : palette.accentValue;

  if (bands.length === 0) {
    return (
      <Text className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        Set a valid engineering range to see the alarm bands.
      </Text>
    );
  }

  const HEIGHT = 30;
  const marker = clamp((value - min) / span, 0, 1);

  return (
    <View className="gap-1.5">
      <View style={{ height: HEIGHT }}>
        <Svg width="100%" height={HEIGHT}>
          {bands.map((band) => (
            <Rect
              key={`${band.from}-${band.to}`}
              x={`${((band.from - min) / span) * 100}%`}
              y={6}
              width={`${((band.to - band.from) / span) * 100}%`}
              height={HEIGHT - 12}
              fill={fill(band.level)}
              stroke={edge(band.level)}
              strokeWidth={1}
            />
          ))}
          <Rect x={`${marker * 100}%`} y={0} width={2} height={HEIGHT} fill={palette.ink} />
        </Svg>
      </View>
      <View className="flex-row justify-between">
        <Text className={cn('font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {min} {unit}
        </Text>
        <Text className={cn('font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {max} {unit}
        </Text>
      </View>
    </View>
  );
}

/**
 * The exact-value field beside the knob.
 *
 * Kept as free text while it is being typed — committing on every keystroke
 * turns "1.5" into 1 the moment the dot is typed — and pushed upward only once
 * it parses to a finite number.
 */
export function ExactValueField({
  value,
  unit,
  disabled,
  error,
  onChange,
}: {
  value: string;
  unit: string;
  disabled?: boolean;
  error?: string;
  onChange: (text: string) => void;
}) {
  const { isDark } = useAppTheme();
  return (
    <View className="gap-1.5">
      <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Exact Value</Text>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={!disabled}
          keyboardType="numeric"
          accessibilityLabel="Exact channel value"
          placeholderTextColor={isDark ? '#5F625F' : '#A1A3A0'}
          className={cn(
            'h-10 flex-1 rounded-lg border px-3 font-mono text-sm',
            error ? 'border-status-critical' : isDark ? 'border-line-dark' : 'border-line-light',
            isDark ? 'bg-surface-dark text-ink' : 'bg-surface-light text-ink-inverse',
          )}
        />
        <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{unit || '—'}</Text>
      </View>
      {error && <Text className="font-body text-xs text-status-critical">{error}</Text>}
    </View>
  );
}

/** Small secondary button used for the knob's Reset action. */
export function KnobResetButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      className={cn(
        'h-10 items-center justify-center rounded-lg border px-4',
        isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light',
        disabled && 'opacity-50',
      )}
    >
      <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>{label}</Text>
    </Pressable>
  );
}
