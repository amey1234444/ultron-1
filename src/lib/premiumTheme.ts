// Design tokens for the public (non-console) pages.
//
// The landing surface is styled almost entirely through CSS modules reading the
// `--u-*` custom properties declared in global.css. This module mirrors that
// palette for the places that genuinely need values in JS — SVG `stroke`/`fill`
// attributes and canvas-style computed colours in the product visuals, which
// cannot take a CSS variable through a React prop reliably.
//
// Keep the two in sync: global.css is the source of truth, this is the mirror.

export const COLOR = {
  /** Page background — near-black with a faint cool cast. */
  bg: '#08090B',
  bgSoft: '#0B0C10',
  /** Panel background. */
  panel: '#0E1015',
  /** Second-level panel, used for nested cards and inputs. */
  panelRaised: '#13151B',

  ink: '#F4F5F7',
  inkMuted: '#A6ACB8',
  inkFaint: '#6E7480',

  line: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.13)',

  /** Brand light. Used for glow, active state and the primary CTA. */
  violet: '#6E5BF2',
  violetSoft: '#9C8CFF',
  /** Secondary highlight. */
  cyan: '#35D6C6',
  /** Telemetry / alarm signal, shared with the console and the hero render. */
  amber: '#E8B465',
  green: '#3FB950',
  red: '#F0563F',
  blue: '#58A6FF',
} as const;

export const FONT = {
  /** Inter carries both display and UI text; weight and tracking separate them. */
  display: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  heading: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  /** Eyebrows, engineering values, metadata. */
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export const RADIUS = {
  card: 18,
  panel: 24,
  control: 12,
  pill: 999,
} as const;

export const SHADOW = {
  card: '0 24px 60px rgba(0,0,0,0.5)',
  float: '0 40px 110px rgba(0,0,0,0.62)',
  violet: '0 18px 44px rgba(110,91,242,0.34)',
} as const;

/** The one easing every landing transition uses. */
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Standard horizontal page gutter. */
export const GUTTER = 'clamp(20px, 5vw, 64px)';

/** Max content width. */
export const MAX_WIDTH = 1200;
