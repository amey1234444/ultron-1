// Shared design tokens for the public (non-console) pages.
//
// The visual system mirrors the OSWAR/teck house style: an editorial condensed
// display face over generous whitespace, tabular mono micro-labels, hairline
// borders and a single warm metallic accent. Every marketing surface imports
// from here so the landing page, auth screens and future pages cannot drift.

export const COLOR = {
  /** Page background — warm near-black so gold reads as metal, not yellow. */
  bg: '#07080B',
  /** Slightly lifted panel background. */
  panel: '#0E1014',
  /** Second-level panel, used for nested cards and inputs. */
  panelRaised: '#14161C',
  ink: '#F7F6F2',
  inkMuted: '#93938E',
  inkFaint: '#61636A',
  line: 'rgba(255,255,255,0.09)',
  lineStrong: 'rgba(255,255,255,0.16)',
  gold: '#DFAE63',
  goldDim: '#8A6C3A',
  goldSoft: 'rgba(223,174,99,0.12)',
  green: '#3FB950',
  blue: '#58A6FF',
  red: '#EF4444',
} as const;

export const FONT = {
  /** Anton — the tall condensed face used for hero and section headlines. */
  display: "'Anton', 'Bebas Neue', 'Space Grotesk', system-ui, sans-serif",
  /** Bebas Neue — subheads, nav links, buttons, KPI values. */
  heading: "'Bebas Neue', 'Space Grotesk', system-ui, sans-serif",
  body: "'DM Sans', 'Sora', Inter_400Regular, system-ui, sans-serif",
  /** JetBrains Mono — eyebrows, engineering values, metadata. */
  mono: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace",
} as const;

export const RADIUS = {
  card: 20,
  panel: 16,
  control: 12,
  pill: 999,
} as const;

export const SHADOW = {
  card: '0 26px 70px rgba(0,0,0,0.45)',
  float: '0 30px 90px rgba(0,0,0,0.55)',
  gold: '0 18px 44px rgba(223,174,99,0.22)',
} as const;

/** Wide-tracked uppercase mono eyebrow shared by every section header. */
export const EYEBROW = {
  fontFamily: FONT.mono,
  fontSize: 11,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: COLOR.gold,
};

/** Standard horizontal page gutter. */
export const GUTTER = 'clamp(20px, 5vw, 72px)';

/** Max content width — matches the reference site's roomy 1200px column. */
export const MAX_WIDTH = 1200;
