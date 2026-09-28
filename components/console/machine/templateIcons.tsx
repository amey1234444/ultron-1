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

/**
 * Shared frame, so every drawn icon lines up with the glyphs beside it.
 *
 * `strokeWidth` is a parameter because the two archives chose differently:
 * the oilseed set is drawn at 1.8 and the meal set at 1.4. That is not an
 * inconsistency to flatten — the meal icons carry more detail in the same
 * 32-unit box (the bagger has a gantry, a hopper, a stitcher and a
 * check-weigher in it), and at 1.8 those strokes start to merge. Each icon
 * keeps the weight it was drawn for.
 */
function IconFrame({
  size,
  color,
  strokeWidth = 1.8,
  children,
}: TemplateIconProps & { strokeWidth?: number; children: React.ReactNode }) {
  return (
    <Svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

/** The meal archive's lighter weight, for the four icons drawn at it. */
const MEAL_STROKE = 1.4;

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

/** Gantry, weigh hopper on load cells, stitcher column and check-weigher. */
export function AutoBaggerIcon({ size = 18, color }: TemplateIconProps) {
  return (
    <IconFrame size={size} color={color} strokeWidth={MEAL_STROKE}>
      <Path d="M3 3H16L12 8H7ZM7 8V10H12V8M4 11H16V29M5 11V29M7 12H13L11 17H9ZM9 17V20M7 20H13V27H7ZM2 28H30M20 16H25V20H20ZM21 21H26V27H21M28 18V27" />
    </IconFrame>
  );
}

/** Feed hopper, grinding chamber and the coupled motor beside it. */
export function HammerMillIcon({ size = 18, color }: TemplateIconProps) {
  return (
    <IconFrame size={size} color={color} strokeWidth={MEAL_STROKE}>
      <Path d="M10 3H22L19 9H13ZM13 9V12H19V9M9 12H23V25H9ZM11 15H21V22H11ZM3 20H9M23 20H28M3 18V23M26 17H30V23H26M12 25L15 29H18L21 25" />
    </IconFrame>
  );
}

/** Screw conveyor, elevator leg and the bin it discharges into. */
export function MealConveyingStorageIcon({ size = 18, color }: TemplateIconProps) {
  return (
    <IconFrame size={size} color={color} strokeWidth={MEAL_STROKE}>
      <Path d="M2 25H13V29H2ZM10 25V5Q13 1 16 5V28M12 7V25M16 6L25 10M20 12Q25 8 30 12V24L26 28H24L20 24ZM20 17H30M20 22H30M22 26V30M28 26V30" />
    </IconFrame>
  );
}

/** The inclined screen deck, on its isolation mounts. */
export function MealSifterIcon({ size = 18, color }: TemplateIconProps) {
  return (
    <IconFrame size={size} color={color} strokeWidth={MEAL_STROKE}>
      <Path d="M5 10L27 14V19L5 15ZM8 15L13 23H21L26 19M16 23V28M6 16L5 20L7 22L5 24V28M26 20L25 23L27 25V28M8 10V4H12V11M12 15V18M20 17V20" />
    </IconFrame>
  );
}

/** Two evaporator bodies and the stripper column beside them. */
export function MiscellaDistillationIcon({ size = 18, color }: TemplateIconProps) {
  return (
    <IconFrame size={size} color={color} strokeWidth={MEAL_STROKE}>
      <Path d="M2 5H30M7 5V11M17 5V11M26 5V8M4 12Q7 9 10 12V25Q7 28 4 25ZM14 12Q17 9 20 12V25Q17 28 14 25ZM23 9Q26 6 29 9V27H23ZM25 13H27M25 17H27M25 21H27M3 29H30" />
    </IconFrame>
  );
}

/** The condenser bank over the separator, with the absorber column at right. */
export function SolventRecoveryIcon({ size = 18, color }: TemplateIconProps) {
  return (
    <IconFrame size={size} color={color} strokeWidth={MEAL_STROKE}>
      <Path d="M2 4H20M5 4V8M12 4V8M19 4V8M2 8H8V12H2ZM9 8H15V12H9ZM16 8H22V12H16ZM5 12V17H17V12M3 20H16V26H3ZM6 22H13M24 10Q27 7 30 10V27H24ZM26 13H28M26 17H28M26 21H28M27 8V3" />
    </IconFrame>
  );
}
