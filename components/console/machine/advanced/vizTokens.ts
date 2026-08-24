// Data-series colours for the analysis charts.
//
// These are deliberately NOT the status palette. ULTRON's success / warning /
// critical and the gold accent all mean something — a trace drawn in warning amber
// reads as an alarmed signal whether or not it is one. A chart needs a colour that
// means "this is data", and the app had no such token, so this is the gap being
// filled rather than a second theme.
//
// The single series hue was validated against ULTRON's own surfaces with the
// dataviz validator (lightness band, chroma floor, CVD separation, normal-vision
// floor, contrast) and passes all checks on #0A0A0A. It is one hue on purpose:
//
//   * Single trace  → this hue.
//   * Current vs reference → same hue for current, muted grey dashed for the
//     reference. Two categorical hues were tried and rejected — blue against
//     violet failed CVD separation at ΔE 1.9 for protanopia, and a reference
//     period is not a peer category anyway, it is a benchmark. Line style carries
//     that better than colour ever could.
//   * Magnitude over time (waterfall) → the sequential ramp below, one hue
//     light to dark, never a rainbow.
export const SERIES = {
  dark: '#3987e5',
  light: '#2a78d6',
};

export const SERIES_MUTED = {
  dark: '#7C838A',
  light: '#8A8A8A',
};

// Sequential ramp, light → dark, for continuous magnitude only.
export const SERIES_RAMP = {
  dark: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'],
  light: ['#cde2fb', '#9ec5f4', '#6da7ec', '#2a78d6', '#1c5cab', '#104281'],
};

export function seriesColour(isDark: boolean): string {
  return isDark ? SERIES.dark : SERIES.light;
}

export function seriesMutedColour(isDark: boolean): string {
  return isDark ? SERIES_MUTED.dark : SERIES_MUTED.light;
}

export function gridColour(isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
}

export function axisColour(isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.16)';
}
