import React, { type CSSProperties } from 'react';

import artwork from '../../../assets/machines/twin-screw-extruder.png';

/**
 * Next represents a static image import as metadata, while other web bundlers
 * may emit a URL directly. Reduce both forms to the URL the browser consumes.
 */
function staticAssetUri(image: unknown): string {
  if (typeof image === 'string') return image;
  if (image && typeof image === 'object') {
    const record = image as { src?: string; default?: string | { src?: string } };
    if (typeof record.src === 'string') return record.src;
    if (typeof record.default === 'string') return record.default;
    if (record.default && typeof record.default.src === 'string') return record.default.src;
  }
  return '';
}

export const TWIN_SCREW_ARTWORK_URI = staticAssetUri(artwork);

const artworkStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'fill',
  pointerEvents: 'none',
  userSelect: 'none',
};

/**
 * Browser renderer for the twin-screw sheet.
 *
 * This deliberately uses a real img element. react-native-web's Image waits
 * for its JavaScript image loader before painting a CSS background; when that
 * loader fails or is interrupted, it silently leaves the component's dark
 * backing rectangle visible. A native img gives the browser the hashed Next
 * asset URL in the initial markup and paints it independently of that loader.
 */
export function TwinScrewArtwork() {
  return (
    <img
      src={TWIN_SCREW_ARTWORK_URI}
      width={1700}
      height={670}
      alt="Twin screw extruder machine visualization with sensor points"
      draggable={false}
      decoding="sync"
      loading="eager"
      style={artworkStyle}
    />
  );
}
