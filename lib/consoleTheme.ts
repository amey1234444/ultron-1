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
//
// Two themes, one language, different physical values
// ---------------------------------------------------
// The dark console is the product's identity and is left alone. Light mode is
// NOT the dark palette on a white page: a luminous #3FBF6A that reads as "live"
// against #08090C reads as highlighter against #FFFFFF, and a screen with a
// green outline round every healthy card is a screen where colour has stopped
// carrying information. So the light theme has its own status ramp — deeper
// primaries, separate live-value and status-dot steps, and very low-saturation
// soft fills and tinted borders — expressing the same three meanings.
//
// Practical rule for anything drawn in light mode: the surface is white or a
// near-white grey, the border is neutral, and the colour appears on the live
// number, the status dot and the status word. Nothing else.

export type ConsolePalette = {
  /** Page canvas. */
  bg: string;
  /** A subtly distinct page region — a band or gutter behind cards. */
  bgSoft: string;
  /** Card and panel fill. */
  panel: string;
  /** Nested surface inside a panel (inputs, table headers, wells). */
  panelRaised: string;
  /** Hovered row or tile. */
  hover: string;
  /** Selected row, tile or menu option. */
  selected: string;
  /** Hairline border. */
  line: string;
  /** A divider quieter than `line` — inside a card, between rows. */
  lineSubtle: string;
  /** Border for a hovered/active/selected edge. */
  lineStrong: string;

  ink: string;
  /** A heading that has to out-weigh `ink` beside it. */
  inkStrong: string;
  inkMuted: string;
  /**
   * The third and last ink step — small print, scope notes, column headers.
   *
   * It is a step below `inkMuted`, not a different kind of thing: everything
   * set in it is still text a reader is expected to read. Both steps clear
   * 4.5:1 against `panel`, which is what the analysis layer's 9–11px captions
   * need and what the old value (3.2:1 dark, 3.5:1 light) did not give them.
   */
  inkFaint: string;
  /** Text that is present but not currently actionable. Never used for data. */
  inkDisabled: string;

  /** Live, healthy, on-target, active control. */
  accent: string;
  /** The healthy live *number*. A step brighter than `accent` in light mode. */
  accentValue: string;
  /** The healthy status *dot*. Small and round, so it can carry more chroma. */
  accentDot: string;
  /** Tinted accent fill, for pills and icon wells. */
  accentSoft: string;
  /** Accent-tinted border, for a card that is actively selected. */
  accentBorder: string;
  /** Accent at chart-fill strength. */
  accentDim: string;

  /** Signals. Only these three ever carry hue besides the accent. */
  critical: string;
  criticalValue: string;
  criticalDot: string;
  criticalSoft: string;
  criticalBorder: string;

  warning: string;
  warningValue: string;
  warningDot: string;
  warningSoft: string;
  warningBorder: string;

  /** Informational / acknowledged / offline — intentionally achromatic. */
  neutral: string;
  /**
   * The one non-status hue in the system: analysis and information accents.
   * Restrained on purpose — it must never be mistaken for a health state.
   */
  info: string;

  /** Secondary chart series. Grey, so the primary green always reads first. */
  series2: string;
  /** Chart gridlines and axis rules. */
  grid: string;
  /** Shadow colour for elevated cards. */
  shadow: string;

  // --- Analytical chart surface --------------------------------------------
  // The trends workspace is chart-first, so the chart's own furniture gets
  // named tokens rather than borrowing panel tokens at an opacity. A grid that
  // is a percentage of a card border is a grid nobody chose.
  /** The plot's own ground. */
  chartBg: string;
  /** Major gridline — the one a value is read against. */
  chartGridMajor: string;
  /** Minor gridline — subdivision only, must not compete with the series. */
  chartGridMinor: string;
  /** Axis rule at the plot edge. */
  chartAxis: string;
  /** Axis tick labels. */
  chartAxisText: string;
  /** Chart labels that are read rather than scanned. */
  chartText: string;
  /** Crosshair guides. Neutral — never the status hue. */
  chartCrosshair: string;
  /** Tooltip / floating readout fill. */
  chartTooltipBg: string;
  /** Series colour while the signal is within limits. */
  chartNormal: string;
  /** Series colour while the signal is over the alert limit. */
  chartAlert: string;
  /** Series colour while the signal is over the danger limit. */
  chartDanger: string;

  // --- Panel gauge ----------------------------------------------------------
  /** The gauge tube's outer frame. */
  gaugeBorder: string;
  /** The hollow track above the reading. */
  gaugeTrack: string;
  /** Scale tick marks. */
  gaugeTick: string;
  gaugeNormal: string;
  gaugeWarning: string;
  gaugeDanger: string;
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
  bgSoft: '#0B0C10',
  panel: '#111318',
  panelRaised: '#171A20',
  hover: '#1A1D23',
  selected: '#1E222A',
  line: 'rgba(255,255,255,0.075)',
  lineSubtle: 'rgba(255,255,255,0.045)',
  lineStrong: 'rgba(255,255,255,0.15)',

  ink: '#F7F6F2',
  inkStrong: '#FFFFFF',
  inkMuted: '#8B8D93',
  inkFaint: '#7C8189',
  inkDisabled: '#5A5E66',

  // Dark mode keeps the luminous accents. A dark ground supports them, and
  // dimming them here to match light mode would flatten the product's identity
  // for no legibility gain — so value, dot and word are all the one green.
  accent: '#3FBF6A',
  accentValue: '#3FBF6A',
  accentDot: '#3FBF6A',
  accentSoft: 'rgba(63,191,106,0.13)',
  accentBorder: 'rgba(63,191,106,0.32)',
  accentDim: '#2A7A48',

  critical: '#D64545',
  criticalValue: '#D64545',
  criticalDot: '#D64545',
  criticalSoft: 'rgba(214,69,69,0.12)',
  criticalBorder: 'rgba(214,69,69,0.34)',

  warning: '#D9962B',
  warningValue: '#D9962B',
  warningDot: '#D9962B',
  warningSoft: 'rgba(217,150,43,0.12)',
  warningBorder: 'rgba(217,150,43,0.32)',

  neutral: '#7A7E86',
  info: '#4FA6AD',

  series2: '#C3C6CC',
  grid: 'rgba(255,255,255,0.055)',
  shadow: '#000000',

  chartBg: '#111318',
  // 8-12% and 4-7%: visible enough to read a value against, quiet enough that
  // the series stays the strongest object on the plot.
  chartGridMajor: 'rgba(255,255,255,0.10)',
  chartGridMinor: 'rgba(255,255,255,0.05)',
  chartAxis: 'rgba(255,255,255,0.14)',
  chartAxisText: '#7C8189',
  chartText: '#C7CAD0',
  chartCrosshair: 'rgba(226,230,236,0.36)',
  chartTooltipBg: '#171A20',
  chartNormal: '#3FBF6A',
  chartAlert: '#D9962B',
  chartDanger: '#D64545',

  gaugeBorder: '#55565A',
  gaugeTrack: '#0B0B0C',
  gaugeTick: '#BEBEBE',
  gaugeNormal: '#3FBF6A',
  gaugeWarning: '#D9962B',
  gaugeDanger: '#D64545',
};

// Light mode is the same *system*, not the same values. Surfaces step
// page -> section -> card -> nested panel through near-white greys; borders are
// neutral by default and only pick up a hue when a card is actually in an alarm
// state; and the status ramp is darkened until it holds its contrast against
// white, which is what makes the screen read as an engineering workstation
// rather than a dashboard with the highlighter left on.
const LIGHT: ConsolePalette = {
  bg: '#F5F6F8',
  bgSoft: '#F8F9FA',
  panel: '#FFFFFF',
  panelRaised: '#FAFBFC',
  hover: '#F3F5F7',
  selected: '#EEF2F6',
  line: '#DFE3E8',
  lineSubtle: '#ECEEF1',
  lineStrong: '#C9CED6',

  ink: '#171A1F',
  inkStrong: '#101318',
  inkMuted: '#5E6673',
  inkFaint: '#7A828E',
  inkDisabled: '#9CA3AD',

  accent: '#15804A',
  accentValue: '#169B56',
  accentDot: '#22A866',
  accentSoft: '#ECF8F1',
  accentBorder: '#B9E4CA',
  accentDim: '#8FD0A8',

  critical: '#C63C3C',
  criticalValue: '#D14343',
  criticalDot: '#D84A4A',
  criticalSoft: '#FDEEEE',
  criticalBorder: '#EAB7B7',

  warning: '#B86800',
  warningValue: '#C77700',
  warningDot: '#D88A12',
  warningSoft: '#FFF6E6',
  warningBorder: '#EACB91',

  neutral: '#878B92',
  info: '#167C80',

  series2: '#6A6E76',
  grid: 'rgba(10,11,13,0.07)',
  shadow: '#101828',

  chartBg: '#FFFFFF',
  chartGridMajor: '#E2E5E9',
  chartGridMinor: '#F1F2F4',
  chartAxis: '#D7DBE0',
  chartAxisText: '#6B7280',
  chartText: '#262B33',
  chartCrosshair: 'rgba(55,60,70,0.34)',
  chartTooltipBg: '#FFFFFF',
  // A shade brighter than the card's `accent`/`warning`/`critical`: a 2px
  // stroke on white needs a little more chroma than a word does to read as the
  // same colour.
  chartNormal: '#15965A',
  chartAlert: '#C77B0A',
  chartDanger: '#D14343',

  gaugeBorder: '#C9CED4',
  gaugeTrack: '#EEF0F2',
  gaugeTick: '#747B84',
  gaugeNormal: '#29B765',
  gaugeWarning: '#D99017',
  gaugeDanger: '#D64A4A',
};

export function consolePalette(isDark: boolean): ConsolePalette {
  return isDark ? DARK : LIGHT;
}

/**
 * Card elevation.
 *
 * Light mode is border-first with the faintest possible lift — the generic SaaS
 * drop shadow is most of what makes a light dashboard look like a template.
 * Dark mode relies on surface difference and carries no shadow at rest.
 */
export function cardElevation(isDark: boolean) {
  return isDark
    ? { shadowColor: DARK.shadow, shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } }
    : { shadowColor: LIGHT.shadow, shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } };
}

/** Elevation for a floating element — a dropdown, a tooltip, a popover. */
export function floatingElevation(isDark: boolean) {
  return isDark
    ? { shadowColor: DARK.shadow, shadowOpacity: 0.55, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }
    : { shadowColor: LIGHT.shadow, shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } };
}

/**
 * The full set of colours one health state carries.
 *
 * A state is never just a hex. It is a word, a dot, a number and — sometimes —
 * a surface, and each of those wants a different amount of chroma to read as
 * the same colour. Components ask for the tone and use the member they need
 * rather than tinting one hex four ways at the call site.
 */
export type StatusTone = {
  /** The status word, an icon, a threshold label. */
  fg: string;
  /** A live reading. */
  value: string;
  /** The status dot. */
  dot: string;
  /** A soft surface — a pill, a callout, a zone shading. */
  soft: string;
  /** A tinted border. Use ONLY when the state is actually alert or danger. */
  border: string;
};

export type ToneName = 'normal' | 'alert' | 'danger' | 'offline';

export function statusTone(palette: ConsolePalette, tone: ToneName): StatusTone {
  switch (tone) {
    case 'alert':
      return {
        fg: palette.warning,
        value: palette.warningValue,
        dot: palette.warningDot,
        soft: palette.warningSoft,
        border: palette.warningBorder,
      };
    case 'danger':
      return {
        fg: palette.critical,
        value: palette.criticalValue,
        dot: palette.criticalDot,
        soft: palette.criticalSoft,
        border: palette.criticalBorder,
      };
    case 'offline':
      return {
        fg: palette.neutral,
        value: palette.inkMuted,
        dot: palette.neutral,
        soft: alpha(palette.neutral, 0.1),
        border: palette.line,
      };
    default:
      return {
        fg: palette.accent,
        value: palette.accentValue,
        dot: palette.accentDot,
        soft: palette.accentSoft,
        border: palette.accentBorder,
      };
  }
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
