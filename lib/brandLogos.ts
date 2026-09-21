// Native/Metro asset resolution — `require` returns an asset id that RN's Image
// resolves through the AssetRegistry.
export const LOGO_DARK = require('../assets/brand/logo-dark.png');
export const LOGO_LIGHT = require('../assets/brand/logo-light.png');

/**
 * The wordmark's own proportions.
 *
 * Every caller pins a height and needs a width, so the shape of the artwork has
 * to come from the artwork. It used to be written out at each call site, which
 * meant three separate numbers to find and change when the wordmark changed —
 * and a stretched logo on any that were missed. These dimensions match the
 * original ULTRON wordmark artwork restored in `assets/brand`.
 */
export const LOGO_WIDTH = 284;
export const LOGO_HEIGHT = 77;
export const LOGO_ASPECT = LOGO_WIDTH / LOGO_HEIGHT;
