import { useEffect, useRef } from 'react';
import { PanResponder, Platform, Pressable, Text, TextInput, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { ChannelAlarmLimits } from '../../../lib/rack';

// The knob sweeps 270° with its dead zone at the bottom, the way a panel
// potentiometer does, so "straight up" reads as mid-range at a glance.
const SWEEP_DEGREES = 270;
const START_DEGREES = -135;
// Pixels of vertical drag that traverse the whole range. Taken from the
// reference simulator's knob so the two feel identical under the hand.
const DRAG_PIXELS_FOR_FULL_RANGE = 220;

/**
 * The instrument palette, lifted from the reference simulator so the knob reads
 * as the same physical control in both places: a brushed gold bezel over a dark
 * body, with green/amber/red reserved for condition.
 */
const KNOB = {
  gold: '#C9A15C',
  goldGlow: 'rgba(201,161,92,0.7)',
  bezelMid: '#393734',
  bezelEnd: '#1D1D1C',
  bezelGap: 'rgba(255,255,255,0.05)',
  bodyHighlight: '#373735',
  bodyMid: '#171716',
  bodyEdge: '#090909',
  bodyRim: '#48453F',
  healthy: '#59C990',
  alert: '#E4AD50',
  danger: '#EF655F',
  track: '#222222',
  marker: '#FFFFFF',
} as const;

export type AlarmLimits = ChannelAlarmLimits;
export type ProcessCondition = 'normal' | 'warning' | 'critical';

const CONDITION_COLOUR: Record<ProcessCondition, string> = {
  normal: KNOB.healthy,
  warning: KNOB.alert,
  critical: KNOB.danger,
};

/**
 * The alarm state a value would raise: a high level triggers at or above its
 * threshold, a low level at or below it, and only enabled levels take part.
 *
 * Hysteresis and delay deliberately play no part — both describe how an alarm
 * clears or how long it must persist, which belong to the alarm engine. This is
 * the instantaneous reading of the configured limits, which is what a
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

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mixHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const channel = (a: number, b: number) => Math.round(a + (b - a) * clamp(t, 0, 1));
  return `rgb(${channel(r1, r2)},${channel(g1, g2)},${channel(b1, b2)})`;
}

/**
 * The bezel, drawn as a run of short arcs.
 *
 * The reference knob's bezel is a CSS conic gradient — gold at the start of the
 * sweep, fading through #393734 at 110° to #1D1D1C at 270°, with the bottom 90°
 * cut away. SVG has no conic gradient, so the same ramp is drawn as a series of
 * segments with the colour interpolated across them; at this size the joins are
 * invisible and the result is indistinguishable from the original.
 */
function Bezel({ centre, radius, width, segments = 72 }: { centre: number; radius: number; width: number; segments?: number }) {
  const step = SWEEP_DEGREES / segments;
  // The gradient's own stops, as fractions of the 270° sweep.
  const MID_STOP = 110 / 270;
  return (
    <G>
      {Array.from({ length: segments }, (_, index) => {
        const from = START_DEGREES + index * step;
        // Overlap by a hair so no background shows through the joins.
        const to = from + step + 0.6;
        const t = index / (segments - 1);
        const colour = t <= MID_STOP ? mixHex(KNOB.gold, KNOB.bezelMid, t / MID_STOP) : mixHex(KNOB.bezelMid, KNOB.bezelEnd, (t - MID_STOP) / (1 - MID_STOP));
        return <Path key={index} d={arcPath(centre, centre, radius, from, to)} stroke={colour} strokeWidth={width} fill="none" />;
      })}
    </G>
  );
}

/**
 * A rotary control for one channel's value.
 *
 * Drag vertically for coarse movement, wheel or arrow keys for one step,
 * Home/End for the range ends. Every path funnels through `commit`, so all of
 * them clamp to the range and land on the same step grid — the knob cannot
 * produce a value the card would then have to round.
 */
export function RotaryKnob({
  label,
  value,
  min,
  max,
  step,
  size = 118,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  size?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const { isDark } = useAppTheme();

  const span = max > min ? max - min : 1;
  const ratio = clamp((value - min) / span, 0, 1);
  const angle = START_DEGREES + ratio * SWEEP_DEGREES;

  // Read by the responder, which is created exactly once: rebuilding it while a
  // pointer is down swaps the DOM node's handlers mid-gesture and stalls the
  // drag (the same trap AdjustableTrail documents).
  const live = useRef({ value, min, max, span, step, disabled, onChange });
  live.current = { value, min, max, span, step, disabled, onChange };
  const grabbedAt = useRef(value);
  const pointerDrag = useRef<{ pointerId: number; y: number; value: number } | null>(null);

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
      onPanResponderRelease: () => {
        grabbedAt.current = live.current.value;
      },
      onPanResponderTerminate: () => {
        grabbedAt.current = live.current.value;
      },
    }),
  ).current;

  // Web follows the reference control's pointer-capture contract. Capture keeps
  // a fast vertical drag alive after the cursor leaves the compact knob.
  const surface = useRef<View | null>(null);
  useEffect(() => {
    const node = surface.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    node.tabIndex = live.current.disabled ? -1 : 0;

    const onPointerDown = (event: PointerEvent) => {
      if (live.current.disabled) return;
      pointerDrag.current = { pointerId: event.pointerId, y: event.clientY, value: live.current.value };
      node.focus();
      node.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      const drag = pointerDrag.current;
      if (!drag || drag.pointerId !== event.pointerId || live.current.disabled) return;
      const unitsPerPixel = live.current.span / DRAG_PIXELS_FOR_FULL_RANGE;
      commit(drag.value + (drag.y - event.clientY) * unitsPerPixel);
      event.preventDefault();
    };
    const finishPointer = (event: PointerEvent) => {
      if (pointerDrag.current?.pointerId !== event.pointerId) return;
      pointerDrag.current = null;
      if (typeof node.hasPointerCapture !== 'function' || node.hasPointerCapture(event.pointerId)) {
        node.releasePointerCapture(event.pointerId);
      }
    };
    const onLostPointerCapture = () => {
      pointerDrag.current = null;
    };

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

    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', finishPointer);
    node.addEventListener('pointercancel', finishPointer);
    node.addEventListener('lostpointercapture', onLostPointerCapture);
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('keydown', onKeyDown);
    return () => {
      pointerDrag.current = null;
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', finishPointer);
      node.removeEventListener('pointercancel', finishPointer);
      node.removeEventListener('lostpointercapture', onLostPointerCapture);
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('keydown', onKeyDown);
    };
    // Every handler reads through `live`, so the listeners are attached once
    // and never need replacing as the value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const centre = size / 2;
  const bezelWidth = Math.max(7, size * 0.055);
  const bezelRadius = centre - bezelWidth / 2 - 1;
  const bodyRadius = bezelRadius - bezelWidth / 2 - 2;
  // The reference indicator runs from just off the centre to just short of the
  // rim; these fractions reproduce its proportions at any size.
  const indicatorOuter = polar(centre, centre, bodyRadius * 0.86, angle);
  const indicatorInner = polar(centre, centre, bodyRadius * 0.12, angle);

  return (
    <View className="items-center" style={{ width: 148 }}>
      <View
        ref={surface}
        {...(Platform.OS === 'web' ? {} : responder.panHandlers)}
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
          <Defs>
            {/* The body's off-centre highlight, exactly as the reference sets it. */}
            <RadialGradient id="knobBody" cx="42%" cy="35%" r="72%">
              <Stop offset="0%" stopColor={KNOB.bodyHighlight} />
              <Stop offset="58%" stopColor={KNOB.bodyMid} />
              <Stop offset="100%" stopColor={KNOB.bodyEdge} />
            </RadialGradient>
          </Defs>

          {/* The 90° cut-away at the bottom of the sweep, kept faintly visible
              so the knob still reads as a full circle of hardware. */}
          <Circle cx={centre} cy={centre} r={bezelRadius} stroke={KNOB.bezelGap} strokeWidth={bezelWidth} fill="none" />
          <Bezel centre={centre} radius={bezelRadius} width={bezelWidth} />

          <Circle cx={centre} cy={centre} r={bodyRadius} fill="url(#knobBody)" stroke={KNOB.bodyRim} strokeWidth={1} />

          {/* Glow, then the indicator itself — the SVG stand-in for the
              reference's box-shadow on the pointer. */}
          <Path
            d={`M ${indicatorInner.x} ${indicatorInner.y} L ${indicatorOuter.x} ${indicatorOuter.y}`}
            stroke={disabled ? KNOB.bezelMid : KNOB.goldGlow}
            strokeWidth={7}
            strokeLinecap="round"
            opacity={disabled ? 0.25 : 0.45}
          />
          <Path
            d={`M ${indicatorInner.x} ${indicatorInner.y} L ${indicatorOuter.x} ${indicatorOuter.y}`}
            stroke={disabled ? '#6B6862' : KNOB.gold}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <Circle cx={centre} cy={centre} r={4} fill={disabled ? '#6B6862' : KNOB.gold} />
        </Svg>

      </View>

      <View className="mt-1 flex-row justify-between" style={{ width: 148 }}>
        <Text className={cn('font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{min}</Text>
        <Text className={cn('font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{max}</Text>
      </View>
    </View>
  );
}

type Band = { from: number; to: number; level: ProcessCondition };

/**
 * The operating range split into its alarm bands.
 *
 * Built by cutting the range at every enabled threshold and classifying each
 * resulting slice by its own midpoint — the same construction the reference
 * simulator's range gauge uses, and it means the picture can never disagree
 * with `processConditionFor`: one rule decides both the colour of a band and
 * the state of the reading sitting on it.
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

/** The banded track beneath the knob, with the reading marked on it. */
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
  const bands = alarmBands(min, max, limits);
  const span = max > min ? max - min : 1;

  if (bands.length === 0) {
    return (
      <Text className={cn('font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        Enable an alarm level to see the operating bands.
      </Text>
    );
  }

  const HEIGHT = 16;
  const TRACK = 7;
  const marker = clamp((value - min) / span, 0, 1);

  return (
    <View className="gap-2">
      <View style={{ height: HEIGHT }}>
        <Svg width="100%" height={HEIGHT}>
          <Rect x={0} y={(HEIGHT - TRACK) / 2} width="100%" height={TRACK} fill={KNOB.track} />
          {bands.map((band) => (
            <Rect
              key={`${band.from}-${band.to}`}
              x={`${((band.from - min) / span) * 100}%`}
              y={(HEIGHT - TRACK) / 2}
              width={`${((band.to - band.from) / span) * 100}%`}
              height={TRACK}
              fill={CONDITION_COLOUR[band.level]}
              opacity={0.75}
            />
          ))}
          <Rect x={`${marker * 100}%`} y={0} width={2} height={HEIGHT} fill={KNOB.marker} />
        </Svg>
      </View>
      <View className="flex-row items-center justify-between">
        {(
          [
            ['Healthy', KNOB.healthy],
            ['Alert', KNOB.alert],
            ['Danger', KNOB.danger],
          ] as const
        ).map(([legend, colour]) => (
          <View key={legend} className="flex-row items-center gap-1.5">
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colour }} />
            <Text className={cn('font-mono text-[8px] uppercase tracking-[0.1em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{legend}</Text>
          </View>
        ))}
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
