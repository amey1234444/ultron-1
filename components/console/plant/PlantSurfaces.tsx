/**
 * The Plant Overview's surface and type system.
 *
 * One card, one label, one value, one bar — every panel on the overview is
 * assembled from these, so density and alignment are decided once here rather
 * than negotiated per component. Nothing in this file introduces a colour: it
 * all resolves out of `ConsolePalette`, which is the console's existing token
 * source shared with `global.css` and `tailwind.config.js`.
 *
 * The surface is deliberately flat — a hairline border, a very soft shadow and
 * a solid panel fill. The overview is read for eight hours at a stretch against
 * a live 3D scene; translucency and blur would put moving geometry behind every
 * number on the page.
 */
import type { ReactNode } from 'react';
import { Text, View, type ViewStyle } from 'react-native';

import { alpha, type ConsolePalette } from '../../../lib/consoleTheme';

/** Card corner radius. Small: this is instrumentation, not a marketing card. */
export const CARD_RADIUS = 5;
/** The overview's spacing step. Every gap and pad is a multiple of it. */
export const STEP = 4;

export function cardSurface(palette: ConsolePalette, isDark: boolean): ViewStyle {
  return {
    backgroundColor: palette.panel,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: CARD_RADIUS,
    // Just enough to lift the card off the canvas. Any more and six of them
    // stacked read as a pile of objects instead of one instrument panel.
    shadowColor: palette.shadow,
    shadowOpacity: isDark ? 0.3 : 0.05,
    shadowRadius: isDark ? 10 : 6,
    shadowOffset: { width: 0, height: isDark ? 3 : 2 },
  };
}

export function PlantCard({
  palette,
  isDark,
  children,
  style,
}: {
  palette: ConsolePalette;
  isDark: boolean;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[cardSurface(palette, isDark), { minWidth: 0, minHeight: 0 }, style]}>{children}</View>;
}

/**
 * Uppercase technical micro-label. The overview's smallest type size.
 *
 * The whole scale in this file was set for panels that floated over the 3D
 * plant, where every pixel of type was a pixel of the yard obscured. Those
 * panels now have their own columns, and the constraint that justified 8px
 * labels is gone — at the viewing distance a control room is actually read
 * from, they were not legible at all.
 */
export function MicroLabel({
  children,
  palette,
  color,
  size = 10,
}: {
  children: ReactNode;
  palette: ConsolePalette;
  color?: string;
  size?: number;
}) {
  return (
    <Text
      numberOfLines={1}
      className="font-mono"
      style={{
        fontSize: size,
        letterSpacing: size * 0.16,
        textTransform: 'uppercase',
        color: color ?? palette.inkFaint,
      }}
    >
      {children}
    </Text>
  );
}

export function StatusDot({ color, size = 5 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />;
}

/**
 * Card header: status pip, label, optional right-hand meta.
 *
 * The pip is what makes a wall of identical cards scannable — it states which
 * measure is off plan before any number is read.
 */
export function CardHeader({
  label,
  palette,
  tone,
  meta,
  metaColor,
}: {
  label: string;
  palette: ConsolePalette;
  tone?: string;
  meta?: string;
  metaColor?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: STEP * 1.5 }}>
      {tone ? <StatusDot color={tone} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <MicroLabel palette={palette}>{label}</MicroLabel>
      </View>
      {meta ? (
        <Text className="font-mono" style={{ fontSize: 10.5, color: metaColor ?? palette.inkFaint }} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A measurement: large light numeral with a smaller unit riding the baseline.
 *
 * Light weight on purpose — a reading is a fact, and a bold 28px number reads as
 * a claim about that fact.
 */
export function MetricValue({
  value,
  unit,
  palette,
  size = 27,
  color,
}: {
  value: string;
  unit?: string;
  palette: ConsolePalette;
  size?: number;
  color?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text
        className="font-body"
        style={{
          fontSize: size,
          lineHeight: size * 1.06,
          fontWeight: '300',
          letterSpacing: -size * 0.025,
          color: color ?? palette.ink,
        }}
      >
        {value}
      </Text>
      {unit ? (
        <Text className="font-mono" style={{ fontSize: Math.max(11, size * 0.42), color: palette.inkMuted }}>
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Hairline progress meter with an optional stable plan marker.
 *
 * The marker is the whole point: a bar without one says "68", a bar with one
 * says "68 against a plan of 90", which is the question the operator has.
 */
export function Meter({
  value,
  target,
  tone,
  palette,
  height = 3,
}: {
  /** 0-1. */
  value: number;
  /** 0-1. */
  target?: number;
  tone: string;
  palette: ConsolePalette;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      style={{
        position: 'relative',
        height,
        borderRadius: height,
        backgroundColor: alpha(palette.ink, 0.09),
        overflow: 'visible',
      }}
    >
      <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: height, backgroundColor: tone }} />
      {target !== undefined ? (
        <View
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(1, target)) * 100}%`,
            top: -1.5,
            width: 1,
            height: height + 3,
            backgroundColor: palette.ink,
          }}
        />
      ) : null}
    </View>
  );
}

/** Section heading inside the right analytics panel. */
export function PanelSection({
  title,
  unit,
  palette,
  children,
  first = false,
}: {
  title: string;
  unit?: string;
  palette: ConsolePalette;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <View
      style={{
        paddingTop: first ? 0 : STEP * 3,
        marginTop: first ? 0 : STEP * 3,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: STEP * 2 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <MicroLabel palette={palette} color={palette.inkMuted} size={11}>
            {title}
          </MicroLabel>
        </View>
        {unit ? (
          <Text className="font-mono" style={{ fontSize: 10, color: palette.inkFaint }}>
            {unit}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Labelled horizontal bar with a right-aligned figure.
 *
 * Used by both Energy Consumption (with an index) and Plant Performance
 * (without) — same row, same alignment, so the panel reads as one column of
 * measurements rather than two lists that happen to be stacked.
 */
export function BarRow({
  index,
  label,
  value,
  share,
  tone,
  palette,
}: {
  index?: string;
  label: string;
  value: string;
  /** 0-1 bar length. */
  share: number;
  tone: string;
  palette: ConsolePalette;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: STEP * 2, paddingVertical: 3.5 }}>
      {index ? (
        <Text className="font-mono" style={{ fontSize: 10, color: palette.inkFaint, width: 18 }}>
          {index}
        </Text>
      ) : null}
      <Text
        numberOfLines={1}
        className="font-body"
        style={{ fontSize: 12.5, color: palette.inkMuted, width: index ? 118 : 86, minWidth: 0 }}
      >
        {label}
      </Text>
      <View style={{ flex: 1, minWidth: 20, height: 4, borderRadius: 4, backgroundColor: alpha(palette.ink, 0.08) }}>
        <View
          style={{
            width: `${Math.max(0, Math.min(1, share)) * 100}%`,
            height: '100%',
            borderRadius: 4,
            backgroundColor: tone,
          }}
        />
      </View>
      <Text
        className="font-mono tabular-nums"
        style={{ fontSize: 11.5, color: palette.ink, textAlign: 'right', minWidth: 58 }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/** Two-column key/value block used by System Telemetry. */
export function TelemetryCell({
  label,
  value,
  unit,
  palette,
}: {
  label: string;
  value: string;
  unit?: string;
  palette: ConsolePalette;
}) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <MicroLabel palette={palette} size={9.5}>
        {label}
      </MicroLabel>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <Text
          className="font-body tabular-nums"
          style={{ fontSize: 22, fontWeight: '300', letterSpacing: -0.5, color: palette.ink }}
          numberOfLines={1}
        >
          {value}
        </Text>
        {unit ? (
          <Text className="font-mono" style={{ fontSize: 11, color: palette.inkMuted }}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Compact legend. Dot plus label, never a boxed key. */
export function Legend({ items, palette }: { items: { color: string; label: string }[]; palette: ConsolePalette }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: STEP * 2.5 }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: STEP }}>
          <StatusDot color={item.color} size={5.5} />
          <Text className="font-body" style={{ fontSize: 10.5, color: palette.inkMuted }}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The LIVE pill. The one place the accent is allowed to be a background. */
export function LivePill({ palette, live }: { palette: ConsolePalette; live: boolean }) {
  const color = live ? palette.accent : palette.neutral;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: STEP * 1.5,
        paddingHorizontal: STEP * 2,
        paddingVertical: 2.5,
        borderRadius: 999,
        backgroundColor: alpha(color, 0.12),
        borderWidth: 1,
        borderColor: alpha(color, 0.3),
      }}
    >
      <StatusDot color={color} size={5.5} />
      <Text className="font-mono" style={{ fontSize: 9.5, letterSpacing: 1.3, color }}>
        {live ? 'LIVE' : 'DEMO'}
      </Text>
    </View>
  );
}
