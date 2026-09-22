// Web/Next asset resolution. See `machineArtwork.ts` for why this split exists.
//
// A static image import under Next is a `StaticImageData` — `{ src, width,
// height, blurDataURL }` — not a URL. react-native-web's Image accepts a string
// or a `{ uri }` object and silently renders nothing for anything else, so the
// object is reduced to its `src` here rather than at the call site: which shape
// the bundler produced is this file's business, not the drawing's.
import type { ImageSourcePropType } from 'react-native';

import artwork from '../assets/machines/twin-screw-extruder.png';

function toUri(image: unknown): string {
  if (typeof image === 'string') return image;
  if (image && typeof image === 'object') {
    // `default` covers a bundler that hands back the module namespace rather
    // than the export, which is what a CommonJS `require` of an ES module
    // produces.
    const record = image as { src?: string; default?: { src?: string } };
    return record.src ?? record.default?.src ?? '';
  }
  return '';
}

function dimension(image: unknown, key: 'width' | 'height', fallback: number): number {
  if (image && typeof image === 'object') {
    const value = (image as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
}

/** The twin-screw elevation, ready to hand to an `Image`. */
export const TWIN_SCREW_ARTWORK_SOURCE: ImageSourcePropType = { uri: toUri(artwork) };

/**
 * The artwork's own pixel size.
 *
 * Read off the static import where the bundler supplies it, so the sheet the
 * pad registry places instruments in cannot drift from the image it is measured
 * against. The constants are the fallback for a bundler configured to emit
 * plain URLs, which carry no dimensions.
 */
export const TWIN_SCREW_ARTWORK_PIXEL_WIDTH = dimension(artwork, 'width', 1700);
export const TWIN_SCREW_ARTWORK_PIXEL_HEIGHT = dimension(artwork, 'height', 670);
