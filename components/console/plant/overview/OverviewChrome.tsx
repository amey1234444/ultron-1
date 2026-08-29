/**
 * Shared chrome for the Plant Overview's instrument panels.
 *
 * The four panels on this page — Plant Health, Findings, Health Score History
 * and Needs Attention — are one instrument cluster, not four cards that happen
 * to sit near each other. Padding, the section mark, the subtitle step, the
 * hairline divider and the link affordance are decided once here so the cluster
 * aligns across the rail and the strip rather than drifting per file.
 *
 * Nothing here introduces a colour or a font family. Colour resolves out of
 * `ConsolePalette`; type uses the same three faces the asset hierarchy sets —
 * `font-mono` for the uppercase section mark and every figure, `font-body` and
 * `font-body-bold` for prose and names.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { alpha, type ConsolePalette } from '../../../../lib/consoleTheme';
import { cardSurface, STEP } from '../PlantSurfaces';

/** Panel padding. One value, so the rail and the strip share a left edge. */
export const PAD = STEP * 4;
/** The gutter between panels, and between a panel and the page edge. */
export const GAP = STEP * 3;

export function Panel({
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
  return (
    <View style={[cardSurface(palette, isDark), { minWidth: 0, minHeight: 0, overflow: 'hidden' }, style]}>
      {children}
    </View>
  );
}

/**
 * The section mark: uppercase mono, tracked open.
 *
 * This is the mark the asset hierarchy sets its section headers in, and it is
 * the console's "this is the name of a thing" style. On the overview it names a
 * panel and nothing else — the moment it starts appearing on chips and values
 * it stops marking anything.
 */
export function Kicker({
  children,
  palette,
  color,
  size = 11,
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
        lineHeight: size * 1.3,
        letterSpacing: size * 0.14,
        textTransform: 'uppercase',
        color: color ?? palette.inkMuted,
      }}
    >
      {children}
    </Text>
  );
}

/** The sentence under a section mark, explaining what the panel is for. */
export function PanelSubtitle({ children, palette }: { children: ReactNode; palette: ConsolePalette }) {
  return (
    <Text
      numberOfLines={1}
      className="font-body"
      style={{ marginTop: 3, fontSize: 11.5, lineHeight: 15, color: palette.inkFaint }}
    >
      {children}
    </Text>
  );
}

/** Section mark and subtitle on the left, one control or count on the right. */
export function PanelHeader({
  label,
  subtitle,
  palette,
  right,
}: {
  label: string;
  subtitle?: string;
  palette: ConsolePalette;
  right?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: STEP * 3 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Kicker palette={palette}>{label}</Kicker>
        {subtitle ? <PanelSubtitle palette={palette}>{subtitle}</PanelSubtitle> : null}
      </View>
      {right ? <View style={{ flexShrink: 0 }}>{right}</View> : null}
    </View>
  );
}

/** A divider quieter than the card's own border — it separates, it does not frame. */
export function Divider({ palette, style }: { palette: ConsolePalette; style?: ViewStyle }) {
  return <View style={[{ height: 1, backgroundColor: palette.lineSubtle }, style]} />;
}

/** A text action. The accent is allowed here because it is a control, not data. */
export function LinkButton({
  label,
  onPress,
  palette,
  trailing = false,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  palette: ConsolePalette;
  /** Adds the chevron used when the link opens a longer list. */
  trailing?: boolean;
  accessibilityHint?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={{ flexDirection: 'row', alignItems: 'center', gap: STEP, opacity: hovered ? 0.72 : 1 }}
    >
      <Text className="font-body-bold" style={{ fontSize: 11.5, color: palette.accent }}>
        {label}
      </Text>
      {trailing ? <ChevronRightIcon color={palette.accent} size={12} /> : null}
    </Pressable>
  );
}

/**
 * A control that reads as a control: hairline border, raised fill, sentence case.
 *
 * Used by the chart's window selector. Deliberately not the tracked capitals of
 * a section mark — a reader presses this, they do not read it as a sign.
 */
export function ChipButton({
  label,
  onPress,
  palette,
  chevron = true,
}: {
  label: string;
  onPress?: () => void;
  palette: ConsolePalette;
  chevron?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        height: 28,
        flexDirection: 'row',
        alignItems: 'center',
        gap: STEP * 1.5,
        paddingHorizontal: STEP * 2.5,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: hovered ? palette.lineStrong : palette.line,
        backgroundColor: hovered ? palette.hover : palette.panelRaised,
      }}
    >
      <Text className="font-body" style={{ fontSize: 11.5, color: palette.inkMuted }}>
        {label}
      </Text>
      {chevron ? <ChevronDownIcon color={palette.inkFaint} size={12} /> : null}
    </Pressable>
  );
}

// --- icons -------------------------------------------------------------------
// Line icons at a single stroke weight. They identify the kind of asset a row is
// about; they never carry status, which is the status word's job.

type IconProps = { color: string; size?: number };

function stroke(color: string) {
  return {
    fill: 'none' as const,
    stroke: color,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
}

export function UtilityIcon({ color, size = 16 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7 21v-7" {...s} />
      <Path d="M17 21v-7" {...s} />
      <Path d="M5 8h4" {...s} />
      <Path d="M15 8h4" {...s} />
      <Path d="M7 3v11" {...s} />
      <Path d="M17 3v11" {...s} />
      <Circle cx={7} cy={6} r={2} {...s} />
      <Circle cx={17} cy={6} r={2} {...s} />
    </Svg>
  );
}

export function PowerIcon({ color, size = 16 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" {...s} />
    </Svg>
  );
}

export function ProcessIcon({ color, size = 16 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 20h14" {...s} />
      <Path d="M7 20v-8l3-2v10" {...s} />
      <Path d="M10 10V6l3-2v16" {...s} />
      <Path d="M13 8h4v12" {...s} />
    </Svg>
  );
}

export function MachineIcon({ color, size = 16 }: IconProps) {
  const s = stroke(color);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5Z"
        {...s}
      />
      <Path d="M8 9h8" {...s} />
      <Path d="M8 13h3" {...s} />
      <Path d="M15 13h1" {...s} />
    </Svg>
  );
}

export function ChevronRightIcon({ color, size = 14 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m9 18 6-6-6-6" {...stroke(color)} />
    </Svg>
  );
}

export function ChevronDownIcon({ color, size = 14 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m6 9 6 6 6-6" {...stroke(color)} />
    </Svg>
  );
}

/** The icon well behind an asset icon. Tinted, never filled. */
export function IconWell({
  children,
  palette,
  size = 30,
}: {
  children: ReactNode;
  palette: ConsolePalette;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.accentSoft,
        borderWidth: 1,
        borderColor: alpha(palette.accent, 0.16),
      }}
    >
      {children}
    </View>
  );
}
