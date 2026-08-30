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
//  - `label` is the ONLY uppercase style, and it is RATIONED. Uppercase mono at
//    9px is the console's "this is the name of a thing" mark — it is the style
//    the asset hierarchy sets its section headers in, and it is the best thing
//    in the type system. It is also the easiest to spend, and this layer had
//    spent it: eighty-six call sites, on region eyebrows and column headers
//    (right) but also on chips, control labels, scope notes, tag identifiers
//    and bare values (wrong). A mark that appears on fifteen different roles
//    marks nothing, and a screen of stencilled capitals is a screen with no
//    quiet layer left to rest in.
//
//    So `label` now has exactly three jobs and no others:
//      1. the eyebrow above a region — "machine status", "severity mix";
//      2. a table's column headers;
//      3. a section band that says what everything under it is.
//    Everything that used to reach for it reaches for `chip`, `code` or `meta`.
//
//  - `chip`, `code` and `meta` exist to absorb those three misuses, and each is
//    sentence case on purpose. A control that reads as a word is a control; a
//    control set in tracked capitals is a sign.
//  - Every number that can change wears `tabular`. A digit that changes width
//    reflows the layout around it, and on a live console that is a shimmer.
//  - `display` is set light. At 26px the body weight is a shout, and a plant
//    console that shouts on a normal day has nothing left for a bad one.
//  - Nothing outside this file may declare a font size. If a size is needed
//    that is not here, the right change is to this file.
//
// Sizing note (the scale moved up one rung)
// -----------------------------------------
// Every size here is ~1px larger than the scale this layer shipped with. The
// original was drawn on a laptop panel and read as dense-but-precise there; on
// the 1600px+ displays the console is actually mounted on it read as small,
// and small is the one thing a plant console cannot be — the reader is often a
// metre back from the screen and not wearing their close-up glasses. The
// relationships between the rungs are unchanged, so nothing about the hierarchy
// moves; the whole system just stopped whispering.
import type { TextStyle } from 'react-native';

export const text = {
  /** The one number or word a screen exists to show. Pair with `displayWeight`. */
  display: 'font-body text-[28px] leading-[34px] tracking-[-0.03em]',
  /** A number singled out inside a panel — a tooltip's value, a stat's figure. */
  dataLg: 'font-mono text-[19px] leading-[24px] tracking-[-0.02em]',
  /**
   * The value in a KPI cell.
   *
   * The rung between `data` and `dataLg`, and it exists because the fact strips
   * needed one. At `data` a strip of eight cells has no figure in it — label and
   * value are the same weight and the same size, so the band reads as a block of
   * grey text rather than as eight readings. At `dataLg` the long ones
   * ("FORECAST_AVAILABLE", "EXPONENTIAL / 91%") break mid-word inside their cell,
   * which is worse than being small. This is the size at which the longest value
   * the analysis layer actually produces still fits one cell.
   */
  dataMd: 'font-mono text-[14px] leading-[19px] tracking-[-0.01em]',
  /** What a region is. */
  title: 'font-body-bold text-[15px] leading-[20px] tracking-[-0.02em]',
  /** The sentence under a title. */
  lede: 'font-body text-[13.5px] leading-[19px]',
  /** Ordinary prose. */
  body: 'font-body text-[12.5px] leading-[18px]',
  /** Emphasised prose at body size — a finding's headline, a row's subject. */
  bodyStrong: 'font-body-bold text-[12.5px] leading-[18px]',
  /** A number in a table or a fact cell. Pair with `tabular`. */
  data: 'font-mono text-[12.5px] leading-[18px]',
  /** Small print: caveats, provenance, axis captions. */
  micro: 'font-body text-[11.5px] leading-[15.5px]',
  /**
   * The name of a field. The only uppercase style in the console, and rationed
   * to the three jobs listed above.
   *
   * The tracking matches the asset hierarchy's section headers exactly, so the
   * tree in the sidebar and the eyebrow on a card are visibly the same mark
   * rather than two near-misses.
   */
  label: 'font-mono text-[10px] leading-[13px] uppercase tracking-[0.16em]',
  /**
   * A pill or a control: "Medium priority", "Scenario injection", "Normal".
   *
   * Sentence case, and sans rather than mono. These are words a reader says,
   * not codes they match, and setting them as capitals was most of why the
   * layer read as shouting — a screen can carry one stencilled voice, not six.
   */
  chip: 'font-body-bold text-[11px] leading-[14px] tracking-[0.005em]',
  /**
   * A machine identifier: a tag, a threshold id, a channel address.
   *
   * Mono, because these are matched character by character against a drawing
   * or a controller, and NOT uppercase — they arrive already cased and the
   * console has no business restyling somebody's tag name into a headline.
   */
  code: 'font-mono text-[10.5px] leading-[14px] tracking-[0.02em]',
  /**
   * A qualifier attached to a value: "this machine", "2 rules fired", "within
   * reference". Small and quiet, and deliberately not a label — it says
   * something *about* the number beside it rather than naming a field.
   */
  meta: 'font-body text-[11px] leading-[14px]',
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
