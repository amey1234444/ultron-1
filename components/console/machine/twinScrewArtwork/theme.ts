/**
 * The machine, re-toned for a dark console.
 *
 * The drawing arrives as a light technical illustration: a pale machine, dark
 * outlines, lit from the top left. On a dark console that is a white slab, and
 * the single-screw drawing beside it does the honest thing and re-tones itself,
 * so this one has to as well.
 *
 * It is done by transforming the emitted colours rather than by keeping a second
 * palette. A second palette would mean roughly seven hundred literals held in
 * step by hand across two files, and the first gradient anyone forgot would be a
 * bright seam on a dark machine that nobody notices until it ships.
 *
 * The transform is a lightness inversion in HSL: hue and saturation are kept
 * exactly, and only L is flipped. That is what makes it a re-tone rather than a
 * negative — the gold heater seams stay gold and the amber pellets stay amber,
 * they simply sit at the lightness a dark ground wants. It also produces the
 * right structure automatically: a pale body becomes a dark body, and the dark
 * outlines drawn over it become the light ones a dark-mode line drawing needs.
 *
 * Alpha is never touched. Most of the modelling in this artwork is translucent
 * white over translucent black, and moving those opacities would flatten the
 * shading that makes it read as metal.
 */

/** `#abc`, `#aabbcc`, and the `rgba()` / `rgb()` forms the artwork actually uses. */
const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/g;

type Rgb = { r: number; g: number; b: number };

function parse(colour: string): { rgb: Rgb; alpha: number | null } | null {
  if (colour.startsWith('#')) {
    const hex = colour.slice(1);
    if (hex.length === 3) {
      return {
        rgb: {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
        },
        alpha: null,
      };
    }
    if (hex.length === 6) {
      return {
        rgb: {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        },
        alpha: null,
      };
    }
    // 4- and 8-digit hex carry alpha; left alone rather than half-handled.
    return null;
  }
  const parts = colour
    .slice(colour.indexOf('(') + 1, colour.lastIndexOf(')'))
    .split(',')
    .map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
  return { rgb: { r: parts[0], g: parts[1], b: parts[2] }, alpha: parts.length > 3 ? parts[3] : null };
}

function toHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
      : max === gn
        ? ((bn - rn) / d + 2) / 6
        : ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

function toRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return {
    r: Math.round(channel(h + 1 / 3) * 255),
    g: Math.round(channel(h) * 255),
    b: Math.round(channel(h - 1 / 3) * 255),
  };
}

/**
 * How far the inversion goes.
 *
 * A straight flip (1 - L) sends the machine's palest highlights to pure black,
 * which reads as holes punched in it. Compressing the inverted range keeps the
 * darkest body tone off the console's own background, so the machine still
 * sits on the page as an object rather than dissolving into it.
 */
const FLOOR = 0.06;
const CEILING = 0.92;

function invert(colour: string): string {
  const parsed = parse(colour);
  if (!parsed) return colour;
  const { h, s, l } = toHsl(parsed.rgb);
  const flipped = FLOOR + (1 - l) * (CEILING - FLOOR);
  const { r, g, b } = toRgb(h, s, flipped);
  if (parsed.alpha === null) {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${parsed.alpha})`;
}

/** The same drawing, toned for a dark surface. */
export function toDarkArtwork(svg: string): string {
  return svg.replace(COLOUR, invert);
}
