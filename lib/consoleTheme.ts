// Console palette.
//
// The console renders through react-native-svg and inline styles as well as
// nativewind classes, so a good deal of it needs colours as JS values rather
// than utility classes. Before this module those values were scattered as
// literals across a dozen components, which is how the console ended up with
// three different greens and two different blues.
//
// Everything visual now resolves through here. The values mirror the `--u-*`
// tokens in global.css and the `colors` block in tailwind.config.js — those
// three are the whole design system, and they must agree.
//
// The palette is deliberately narrow: black, grey and white carry the layout,
// green means live/healthy, amber means watch, red means act. A chart series
// that is not one of those is grey. Colour is information here, not decoration.

export type ConsolePalette = {
  /** Page canvas. */
  bg: string;
  /** Card and panel fill. */
  panel: string;
  /** Nested surface inside a panel (inputs, table headers, wells). */
  panelRaised: string;
  /** Hairline border. */
  line: string;
  /** Border for a hovered/active/selected edge. */
  lineStrong: string;

  ink: string;
  inkMuted: string;
  inkFaint: string;

  /** Live, healthy, on-target, active control. */
  accent: string;
  /** Tinted accent fill, for pills and icon wells. */
  accentSoft: string;
  /** Accent at chart-fill strength. */
  accentDim: string;

  /** Signals. Only these three ever carry hue besides the accent. */
  critical: string;
  warning: string;
  /** Informational / acknowledged / offline — intentionally achromatic. */
  neutral: string;

  /** Secondary chart series. Grey, so the primary green always reads first. */
  series2: string;
  /** Chart gridlines and axis rules. */
  grid: string;
  /** Shadow colour for elevated cards. */
  shadow: string;
};

// The greys are cool rather than neutral-black: a plant console is looked at
// for eight hours at a stretch, and a slightly blue near-black sits back behind
// the data instead of vibrating against it.
//
// The green is the one the Online pill on racks and gateways already used. It
// was the odd one out — the console carried a brighter mint that read as a
// different state at a glance — so the whole system now speaks with that one.
const DARK: ConsolePalette = {
  bg: '#08090C',
  panel: '#111318',
  panelRaised: '#171A20',
  line: 'rgba(255,255,255,0.075)',
  lineStrong: 'rgba(255,255,255,0.15)',

  ink: '#F7F6F2',
  inkMuted: '#8B8D93',
  inkFaint: '#62666E',

  accent: '#3FBF6A',
  accentSoft: 'rgba(63,191,106,0.13)',
  accentDim: '#2A7A48',

  critical: '#D64545',
  warning: '#D9962B',
  neutral: '#7A7E86',

  series2: '#C3C6CC',
  grid: 'rgba(255,255,255,0.055)',
  shadow: '#000000',
};

// Light mode is the same system inverted. The accent is darkened because
// #3FBF6A on white fails contrast for text and thin strokes; the dark variant
// reads as the same colour while staying legible.
const LIGHT: ConsolePalette = {
  bg: '#F6F6F4',
  panel: '#FFFFFF',
  panelRaised: '#F0F0ED',
  line: '#E6E5E1',
  lineStrong: '#D3D2CC',

  ink: '#0A0B0D',
  inkMuted: '#5C6068',
  inkFaint: '#878B92',

  accent: '#1F8A4C',
  accentSoft: 'rgba(31,138,76,0.1)',
  accentDim: '#8FD0A8',

  critical: '#C03A3A',
  warning: '#A9761B',
  neutral: '#878B92',

  series2: '#6A6E76',
  grid: 'rgba(10,11,13,0.07)',
  shadow: '#0A0B0D',
};

export function consolePalette(isDark: boolean): ConsolePalette {
  return isDark ? DARK : LIGHT;
}

/** Status colour for an area, machine or service. */
export function statusColor(
  palette: ConsolePalette,
  status: 'healthy' | 'warning' | 'critical' | 'offline' | 'degraded' | 'down',
) {
  switch (status) {
    case 'healthy':
      return palette.accent;
    case 'warning':
    case 'degraded':
      return palette.warning;
    case 'critical':
    case 'down':
      return palette.critical;
    default:
      return palette.neutral;
  }
}

/** Alarm severity colour. Info is achromatic on purpose — it is not a signal. */
export function severityColor(palette: ConsolePalette, severity: 'Critical' | 'Warning' | 'Info') {
  return severity === 'Critical'
    ? palette.critical
    : severity === 'Warning'
      ? palette.warning
      : palette.neutral;
}

/**
 * Colour for a health/percentage score.
 *
 * The thresholds match the ones the health model itself uses, so the colour a
 * number is painted always agrees with the label next to it.
 */
export function scoreColor(palette: ConsolePalette, score: number) {
  if (score >= 85) return palette.accent;
  if (score >= 60) return palette.warning;
  return palette.critical;
}

/** Colour for a delta figure: improvement, regression or unchanged. */
export function deltaColor(palette: ConsolePalette, direction: 'up' | 'down' | 'flat') {
  return direction === 'down'
    ? palette.critical
    : direction === 'flat'
      ? palette.inkFaint
      : palette.accent;
}

/** Appends an 8-bit alpha to a 6-digit hex, for tinted fills. */
export function alpha(hex: string, value: number) {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const byte = Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${byte}`;
}
