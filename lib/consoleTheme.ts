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

const DARK: ConsolePalette = {
  bg: '#0A0A0A',
  panel: '#131413',
  panelRaised: '#1A1B1A',
  line: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.14)',

  ink: '#F2F2F0',
  inkMuted: '#A1A3A0',
  inkFaint: '#6B6D6B',

  accent: '#6EF08A',
  accentSoft: 'rgba(110,240,138,0.12)',
  accentDim: '#2F7A48',

  critical: '#F2624A',
  warning: '#E3B341',
  neutral: '#7C7F7C',

  series2: '#C9CCC9',
  grid: 'rgba(255,255,255,0.06)',
  shadow: '#000000',
};

// Light mode is the same system inverted. The accent is darkened because
// #6EF08A on white fails contrast for text and thin strokes; the dark variant
// reads as the same colour while staying legible.
const LIGHT: ConsolePalette = {
  bg: '#F7F7F5',
  panel: '#FFFFFF',
  panelRaised: '#F2F2EF',
  line: '#E7E7E3',
  lineStrong: '#D2D2CC',

  ink: '#0A0A0A',
  inkMuted: '#5F625F',
  inkFaint: '#8B8E8B',

  accent: '#14874A',
  accentSoft: 'rgba(20,135,74,0.1)',
  accentDim: '#8FD6A9',

  critical: '#C8402A',
  warning: '#9A7212',
  neutral: '#8B8E8B',

  series2: '#6B6E6B',
  grid: 'rgba(10,10,10,0.07)',
  shadow: '#0A0A0A',
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
