// Variant tokens for the console UI kit.
//
// Why this file exists
// --------------------
// shadcn/ui is a React DOM library: it renders `<div>`/`<button>` and leans on
// Radix primitives that need `document`, DOM refs and `createPortal`. This app
// renders `react-native` views — aliased to `react-native-web` in the browser
// and compiled to real native views for the Expo iOS/Android targets — so Radix
// cannot mount here at all.
//
// What this kit takes from shadcn is the part that actually matters: a small set
// of composable primitives with a familiar API (`Card`/`CardHeader`/`CardTitle`,
// `Badge variant=…`, `Alert`, `Tabs`), driven entirely by design tokens rather
// than per-component colour literals.
//
// The tokens themselves are NOT new. They resolve out of `lib/consoleTheme.ts`,
// which is already the single source of truth shared with `global.css` and
// `tailwind.config.js`. Nothing here introduces a colour.
//
// Colour discipline (from the data-visualization guidance):
//  - Status colour is reserved for state — good / watch / act / neutral — and is
//    never reused as a categorical series colour.
//  - Status never travels as colour alone. Every variant carries an icon and a
//    text label, so the meaning survives colour-blindness, greyscale print and
//    forced-colors mode.
//  - Body text wears ink tokens, never the status hue. Identity comes from a
//    coloured icon or dot *beside* the text.

import type { MaterialCommunityIcons } from '@expo/vector-icons';

import { alpha, consolePalette, type ConsolePalette } from '../../lib/consoleTheme';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Semantic variants.
 *
 * `success` / `warning` / `destructive` are the three signal states the console
 * palette defines. `info` is deliberately achromatic — it is context, not a
 * signal. `muted` is for content that is present but inactive.
 */
export type Variant = 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'muted';

export type VariantStyle = {
  /** Icon and accent colour. Never applied to body text. */
  accent: string;
  /** Tinted fill for pills, icon wells and callout backgrounds. */
  tint: string;
  /** Border for callouts and outlined pills. */
  border: string;
  /** The icon that carries the meaning when colour is unavailable. */
  icon: IconName;
  /** Screen-reader / fallback wording for the state. */
  label: string;
};

export function variantStyle(palette: ConsolePalette, variant: Variant): VariantStyle {
  switch (variant) {
    case 'success':
      return {
        accent: palette.accent,
        tint: alpha(palette.accent, 0.12),
        border: alpha(palette.accent, 0.32),
        icon: 'check-circle-outline',
        label: 'Normal',
      };
    case 'warning':
      return {
        accent: palette.warning,
        tint: alpha(palette.warning, 0.12),
        border: alpha(palette.warning, 0.32),
        icon: 'alert-outline',
        label: 'Watch',
      };
    case 'destructive':
      return {
        accent: palette.critical,
        tint: alpha(palette.critical, 0.12),
        border: alpha(palette.critical, 0.34),
        icon: 'alert-octagon-outline',
        label: 'Act',
      };
    case 'info':
      return {
        accent: palette.neutral,
        tint: alpha(palette.neutral, 0.12),
        border: alpha(palette.neutral, 0.3),
        icon: 'information-outline',
        label: 'Information',
      };
    case 'muted':
      return {
        accent: palette.inkFaint,
        tint: alpha(palette.inkFaint, 0.1),
        border: palette.line,
        icon: 'minus-circle-outline',
        label: 'Not evaluated',
      };
    default:
      return {
        accent: palette.ink,
        tint: alpha(palette.inkFaint, 0.1),
        border: palette.line,
        icon: 'circle-small',
        label: '',
      };
  }
}

export { consolePalette, alpha };
export type { ConsolePalette };
