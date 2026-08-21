// The console's type scale.
//
// Why this file exists
// --------------------
// The analysis screens had grown twenty distinct font sizes — 8, 8.5, 9, 9.5,
// 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15, 17, 19, 20, 22, 26, 30, 34 — most
// of them a half-pixel apart from a neighbour and chosen to make one particular
// row fit. That is the difference between a screen that reads as *designed* and
// one that reads as *assembled*: a reader cannot learn a hierarchy with twenty
// levels in it, so every level stops meaning anything and the whole surface
// flattens into noise no matter how carefully each piece is spaced.
//
// There are eight roles here, on six sizes. Every one of them earns its place by
// answering a different question about the text it sets:
//
//   display   the one number or word a screen exists to show
//   dataLg    a number that has been singled out but is not the subject
//   title     what a region is
//   lede      the sentence directly under a title, explaining the region
//   body      ordinary prose
//   data      a number in a table or a fact cell
//   micro     small print: caveats, provenance, axis captions
//   label     the name of a field, never the value
//
// Rules that go with the scale:
//
//  - `label` is the ONLY uppercase style. Uppercase is how this console marks
//    "this is a name, not a value", and it stops working the moment a second
//    style borrows it.
//  - Every number that can change wears `tabular`. A digit that changes width
//    reflows the layout around it, and on a live console that is a shimmer.
//  - `display` is set light. At 26px the body weight is a shout, and a plant
//    console that shouts on a normal day has nothing left for a bad one.
//  - Nothing outside this file may declare a font size. If a size is needed
//    that is not here, the right change is to this file.
import type { TextStyle } from 'react-native';

export const text = {
  /** The one number or word a screen exists to show. Pair with `displayWeight`. */
  display: 'font-body text-[26px] leading-[30px] tracking-[-0.03em]',
  /** A number singled out inside a panel — a tooltip's value, a stat's figure. */
  dataLg: 'font-mono text-[17px] leading-[21px] tracking-[-0.02em]',
  /** What a region is. */
  title: 'font-body-bold text-[14px] leading-[19px] tracking-[-0.02em]',
  /** The sentence under a title. */
  lede: 'font-body text-[12.5px] leading-[18px]',
  /** Ordinary prose. */
  body: 'font-body text-[11.5px] leading-[16px]',
  /** Emphasised prose at body size — a finding's headline, a row's subject. */
  bodyStrong: 'font-body-bold text-[11.5px] leading-[16px]',
  /** A number in a table or a fact cell. Pair with `tabular`. */
  data: 'font-mono text-[11.5px] leading-[16px]',
  /** Small print: caveats, provenance, axis captions. */
  micro: 'font-body text-[10.5px] leading-[14px]',
  /** The name of a field. The only uppercase style in the console. */
  label: 'font-mono text-[9px] leading-[12px] uppercase tracking-[0.16em]',
} as const;

/**
 * Tabular figures.
 *
 * Proportional digits are different widths, so a live reading counting from 9
 * to 10 shifts everything after it. Every changing number in this console is
 * set with this.
 */
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

/** `display` is set light — see the note above on not shouting. */
export const displayWeight: TextStyle = { fontWeight: '300' };

/**
 * The corner radii, also down to three.
 *
 * `sm` is for things inside a row — a pill, a tick, a swatch. `md` is a card
 * inside a region. `lg` is a region itself. Anything rounder than `lg` is a
 * pill and uses `pill`.
 */
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;
