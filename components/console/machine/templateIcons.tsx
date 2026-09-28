import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Picker icons for the oilseed templates, as the archive supplied them.
 *
 * Every other template's card icon is a MaterialCommunityIcons glyph, because
 * every other template is a generic machine that had a glyph to borrow. These
 * four are specific machines with no glyph that means them: there is no
 * "desolventiser-toaster" or "chain extractor" in an icon font, and the
 * nearest borrowings — a cylinder, a conveyor — would be wrong in a picker
 * whose whole job is telling machines apart.
 *
 * So these are the archive's own icons, in its own line vocabulary: a 32-unit
 * box, 1.8 stroke, round caps and joins, no fill. They are drawn with
 * `react-native-svg` rather than as PNGs so they inherit `color` from the card
 * exactly as the glyphs do, and stay sharp at any size on both targets. The
 * archive also ships 32/64/128 px PNGs, which are not used for that reason.
 *
 * They are category icons, not brand marks — the archive is explicit that they
 * are not corporate logos.
 */
export type TemplateIconProps = { size?: number; color: string };

/** Shared frame, so all four line up with the glyph icons beside them. */
function IconFrame({ size, color, children }: TemplateIconProps & { children: React.ReactNode }) {
  return (
    <Svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/** Domed vessel, collet bed, discharge and an offset cooling fan. */
export function ColletCoolerIcon({ size = 18, color }: TemplateIconProps) {
  return (
    <IconFrame size={size} color={color}>
      <Path d="M11 7Q16 3 21 7V25L17 29H15L11 25ZM15 5V2M10 24H22M21 10H27M7 22H11" />
      <Rect x="13.5" y="10" width="5" height="10" rx=".7" />
      <Circle cx="5" cy="24" r="3" />
    </IconFrame>
  );
}

/** The tray stack, which is what distinguishes a DTDC from any other column. */
export function DTDCIcon({ size = 18, color }: TemplateIconProps) {
  return (
    <IconFrame size={size} color={color}>
      <Path d="M10 6Q16 2 22 6V25L18 29H14L10 25Z" />
      <Path d="M9 9H23M9 13H23M9 17H23M9 21H23M9 25H23M13 4V2M20 4V2H28M22 19H27M5 20H10" />
      <Circle cx="5" cy="23" r="3" />
    </IconFrame>
  );
}

/** Rectangular column, zone divider and the air chevrons through both zones. */
export function SeedDryerCoolerIcon({ size = 18, color }: TemplateIconProps) {
  return (
    <IconFrame size={size} color={color}>
      <Rect x="9" y="4" width="14" height="23" rx="1" />
      <Path d="M8 19H24M12 27L15 30H17L20 27M16 4V1M12 10L14 8 16 10M17 14L19 12 21 14M12 17L14 15 16 17M12 24L14 22 16 24M23 12H28M23 22H28M4 9H9" />
    </IconFrame>
  );
}

/** The long low body with its hoppers above and pump legs below. */
export function SolventExtractorIcon({ size = 18, color }: TemplateIconProps) {
  return (
    <IconFrame size={size} color={color}>
      <Rect x="3" y="10" width="26" height="12" rx="3" />
      <Path d="M6 3H13L11 10H8ZM9 22L11 26 13 22M17 22L19 26 21 22M25 22L27 26 29 22M8 14V18M14 14V18M20 14V18M26 14V18M22 10V5H29" />
    </IconFrame>
  );
}
