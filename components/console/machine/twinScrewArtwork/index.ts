/**
 * Twin Screw Extruder artwork.
 *
 * The reference drawing ships as four passes that are meant to be painted in
 * order: the machine, its construction detail, a rebuilt drive train, and one
 * lighting pass over the whole thing. It bolts them together by splicing
 * strings into a finished document at a marker element. Vendored, they are
 * simply called in order, which is the same result with nothing to go wrong.
 *
 * The drawing carries no sensor markers. That is deliberate on both sides: the
 * reference calls this its marker-only channel-mapping build and leaves the
 * markers to the application, and `TwinScrewExtruder` draws one pad per
 * `TWIN_SCREW_POINT_REGISTRY` entry with that pad's wiring state. A dot on this
 * machine therefore always means a place a card can actually attach.
 */

import { buildMachineSvg, HEIGHT, WIDTH } from './geometry';
import { buildLightingOverlaySvg } from './lighting';
import { TSE_LIGHTING_DEFS } from './materials';
import { buildAssemblyRebuildSvg } from './rebuild';
import { buildProductionRefinementSvg } from './refinements';
import { toDarkArtwork } from './theme';

export { HEIGHT, WIDTH } from './geometry';

/** What the caller wants drawn, beyond the machine itself. */
export type TwinScrewArtworkOptions = {
  /**
   * Draw the sheet and its engineering grid.
   *
   * Off on the machine canvas: the workspace paints its own grid behind the
   * stage, and a second one inside the artwork beats against it. The drawing is
   * transparent without it — which is only true because the vendoring removed
   * the assemblies the reference had to hide behind an opaque patch.
   */
  showBackground?: boolean;
  /** Fill for the sheet, when `showBackground` is set. */
  sheet?: string;
  /**
   * Re-tone the drawing for a dark surface.
   *
   * The supplied artwork is a light illustration; on a dark console it is a
   * white slab. Colours are inverted in lightness, keeping hue and saturation —
   * see `./theme` for why that is a re-tone rather than a negative.
   */
  dark?: boolean;
};

/**
 * The machine, as SVG source.
 *
 * Deterministic for a given set of options: the same options always produce the
 * same string, which is what lets the template parse it once per option set and
 * hold on to the parsed nodes.
 */
export function buildTwinScrewExtruderArtwork({
  showBackground = false,
  sheet = 'url(#bg)',
  dark = false,
}: TwinScrewArtworkOptions = {}): string {
  // The sheet is the one colour the caller has already picked for the theme it
  // is asking for, so it must not be re-toned along with the drawing. It goes in
  // as a token and is substituted afterwards, which keeps it out of the
  // transform's way rather than relying on the transform to special-case it.
  const SHEET_TOKEN = '__sheet__';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
${TSE_LIGHTING_DEFS}
${buildMachineSvg({ showBackground, sheet: SHEET_TOKEN })}
${buildProductionRefinementSvg()}
${buildAssemblyRebuildSvg()}
${buildLightingOverlaySvg()}
</svg>`;

  // Toned last, over the finished document, so one rule covers every pass and a
  // layer added here later cannot be missed.
  return (dark ? toDarkArtwork(svg) : svg).split(SHEET_TOKEN).join(sheet);
}
