// Severity ramps for the analysis layer.
//
// Why this exists next to `consoleTheme`
// --------------------------------------
// The console palette carries three signal colours — accent, warning, critical
// — which is the right vocabulary for "is this thing healthy". It is the wrong
// vocabulary for a findings list, and the analysis layer had been paying for
// that: a crossed reference boundary and a breached hard process limit both
// resolved to amber, so a screen showing twelve crossed references read as
// twelve warnings. That is a misrepresentation, not a styling nit. A boundary
// is a registered reference being exceeded; a limit is a hard process bound
// being broken; a fault is a matched signature. Three different claims.
//
// So findings get four severities, and the fourth one is the point:
//
//   fault      a fault signature matched                      red
//   limit      above a hard registered process limit          amber
//   boundary   a registered reference exceeded                SLATE
//   advisory   watch only, no action indicated yet            green
//
// Boundary being slate rather than amber is what stops a wall of references
// from shouting. Amber is reserved for the case where something is actually
// out of bounds.
//
// Five tones per severity
// -----------------------
//   dot    saturated — the marker, the rail, the mix bar
//   wash   the fill behind an opened row
//   head   the section band, and the fill of a chip
//   edge   hairline for that section's borders
//   text   the only tone that may set type; AA on `panel`
//
// `text` is the floor for legibility: nothing else in the ramp is allowed to
// carry a glyph. Dark-mode values are not the light ones inverted — a wash has
// to be a tint ON the dark panel, and the text tone has to rise rather than
// fall, or the hue disappears into the surface.

export type Severity = 'fault' | 'limit' | 'boundary' | 'advisory';

export type SeverityTones = {
  dot: string;
  wash: string;
  head: string;
  edge: string;
  text: string;
};

export type SeverityRamp = Record<Severity, SeverityTones>;

/** Reading order, worst first. Every list and legend in the layer uses it. */
export const SEVERITY_ORDER: Severity[] = ['fault', 'limit', 'boundary', 'advisory'];

/** What each severity is called where it heads a section. */
export const SEVERITY_LABEL: Record<Severity, string> = {
  fault: 'Faults',
  limit: 'Breached limits',
  boundary: 'Boundaries crossed',
  advisory: 'Advisory',
};

/** The claim each severity is making, in one clause. */
export const SEVERITY_HINT: Record<Severity, string> = {
  fault: 'signature matched',
  limit: 'above a hard registered limit',
  boundary: 'registered reference exceeded',
  advisory: 'watch only, no action yet',
};

/** Short form, for a filter chip where the section heading is not repeated. */
export const SEVERITY_SHORT: Record<Severity, string> = {
  fault: 'Faults',
  limit: 'Limits',
  boundary: 'Boundaries',
  advisory: 'Advisory',
};

const LIGHT: SeverityRamp = {
  fault: { dot: '#B4372B', wash: '#FDF4F2', head: '#FBEFEC', edge: '#F0D8D2', text: '#94271C' },
  limit: { dot: '#B8820F', wash: '#FDFAF1', head: '#FCF6E7', edge: '#EDDFBA', text: '#8A5906' },
  boundary: { dot: '#52697A', wash: '#F7F9FA', head: '#EEF2F5', edge: '#D8E0E6', text: '#3B4F5C' },
  advisory: { dot: '#1F7A4A', wash: '#F6FAF7', head: '#EDF7F1', edge: '#CFE6DA', text: '#16653D' },
};

// On the dark console a "wash" cannot be a near-white paper tint — it has to be
// the hue laid over the panel at low alpha, and the text tone has to be the
// light end of the hue rather than the dark end.
const DARK: SeverityRamp = {
  fault: {
    dot: '#E05B4B',
    wash: 'rgba(224,91,75,0.055)',
    head: 'rgba(224,91,75,0.11)',
    edge: 'rgba(224,91,75,0.26)',
    text: '#F0897B',
  },
  limit: {
    dot: '#D9962B',
    wash: 'rgba(217,150,43,0.055)',
    head: 'rgba(217,150,43,0.11)',
    edge: 'rgba(217,150,43,0.26)',
    text: '#E8B45F',
  },
  boundary: {
    dot: '#7E97A8',
    wash: 'rgba(126,151,168,0.05)',
    head: 'rgba(126,151,168,0.10)',
    edge: 'rgba(126,151,168,0.24)',
    text: '#A6BCCB',
  },
  advisory: {
    dot: '#3FBF6A',
    wash: 'rgba(63,191,106,0.05)',
    head: 'rgba(63,191,106,0.10)',
    edge: 'rgba(63,191,106,0.24)',
    text: '#6FD693',
  },
};

export function severityRamp(isDark: boolean): SeverityRamp {
  return isDark ? DARK : LIGHT;
}

export function severityTones(isDark: boolean, severity: Severity): SeverityTones {
  return severityRamp(isDark)[severity];
}

/**
 * How far along the exceedance track a ratio sits.
 *
 * Log-compressed, because these ratios do not share an order of magnitude: a
 * frozen-sample run length can be 28× its reference while a pressure ratio is
 * 1.05×, and on a linear track the second one is invisible. Compressing means
 * both read, and the bar stays a comparison rather than becoming a picture of
 * one outlier.
 *
 * At or under the reference the bar is drawn short and grey — "within
 * reference" is a real result and it should not look like a small exceedance.
 */
export function exceedanceFill(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 6;
  if (ratio > 1) return Math.min(100, 20 + (Math.log(ratio) / Math.log(40)) * 80);
  return Math.max(6, ratio * 20);
}

/** The exceedance as a reader would say it out loud. */
export function exceedanceLabel(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return 'not comparable';
  if (ratio <= 1) return 'within reference';
  return `×${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(2)}`;
}
