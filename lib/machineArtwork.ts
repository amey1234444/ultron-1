// Native/Metro asset resolution.
//
// `require` of an image returns an asset id that React Native's Image resolves
// through the AssetRegistry, so it is already a valid `source` and is handed
// over as-is.
//
// The web build takes `machineArtwork.web.ts` instead, because Next's webpack
// turns the same import into a `StaticImageData` object — `{ src, width,
// height, blurDataURL }` — which react-native-web's Image cannot read. This is
// the same split `brandLogos.ts` already uses, for the same reason: one
// `require` cannot satisfy both bundlers.
//
// The symptom when the split is missing is a quiet one, and worth recording
// because it does not look like an asset problem: the Image renders nothing, no
// error is thrown, no warning is logged, and the container's own background
// shows through as a solid dark slab. It reads as a broken drawing rather than
// a broken import.
import type { ImageSourcePropType } from 'react-native';

/** The twin-screw elevation, ready to hand to an `Image`. */
export const TWIN_SCREW_ARTWORK_SOURCE: ImageSourcePropType = require('../assets/machines/twin-screw-extruder.png');

/**
 * The artwork's own pixel size.
 *
 * The pad registry places instruments in this space, so it is the sheet the
 * drawing and the markers share. It is declared rather than read off the asset
 * because on this platform there are no dimensions to read until the asset
 * loads, and a pad cannot wait for that.
 */
export const TWIN_SCREW_ARTWORK_PIXEL_WIDTH = 1700;
export const TWIN_SCREW_ARTWORK_PIXEL_HEIGHT = 670;
