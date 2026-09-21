// Web/Next asset resolution — static image imports become a URL (StaticImageData
// under Next), which react-native-web's Image accepts as a string `source`.
import logoDark from '../assets/brand/logo-dark.png';
import logoLight from '../assets/brand/logo-light.png';

function toUri(img: unknown): string {
  if (typeof img === 'string') return img;
  if (img && typeof img === 'object' && 'src' in img) {
    return (img as { src: string }).src;
  }
  return img as string;
}

export const LOGO_DARK = toUri(logoDark);
export const LOGO_LIGHT = toUri(logoLight);

/**
 * The wordmark's own proportions.
 *
 * Every caller pins a height and needs a width, so the shape of the artwork has
 * to come from the artwork. It used to be written out at each call site, which
 * meant three separate numbers to find and change when the wordmark changed —
 * and a stretched logo on any that were missed.
 *
 * Next's static import already carries the real dimensions, so they are read off
 * it here rather than restated; the constants are the fallback for the plain
 * string case (a bundler configured to emit URLs instead of metadata) and match
 * the original ULTRON wordmark artwork restored in `assets/brand`.
 */
function dimension(img: unknown, key: 'width' | 'height', fallback: number): number {
  if (img && typeof img === 'object' && key in img) {
    const value = (img as Record<string, unknown>)[key];
    if (typeof value === 'number' && value > 0) return value;
  }
  return fallback;
}

export const LOGO_WIDTH = dimension(logoDark, 'width', 284);
export const LOGO_HEIGHT = dimension(logoDark, 'height', 77);
export const LOGO_ASPECT = LOGO_WIDTH / LOGO_HEIGHT;
