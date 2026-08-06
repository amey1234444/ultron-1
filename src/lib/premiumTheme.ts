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
  /** Page background — true black with the faintest green cast. */
  bg: '#0A0A0A',
  bgSoft: '#0F100F',
  /** Panel background. */
  panel: '#131413',
  /** Second-level panel, used for nested cards and inputs. */
  panelRaised: '#1A1B1A',

  ink: '#F2F2F0',
  inkMuted: '#A1A3A0',
  inkFaint: '#6B6D6B',

  line: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.13)',

  /** The one accent. Live state, active controls, positive movement. */
  accent: '#6EF08A',
  accentInk: '#8FF0A8',
  accentDim: '#2F7A48',

  /** Signals — used only where a reading genuinely warrants a colour. */
  red: '#F2624A',
  amber: '#E3B341',
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
  accent: '0 18px 44px rgba(110,240,138,0.18)',
} as const;

/** The one easing every landing transition uses. */
export const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Standard horizontal page gutter. */
export const GUTTER = 'clamp(20px, 5vw, 64px)';

/** Max content width. */
export const MAX_WIDTH = 1200;
