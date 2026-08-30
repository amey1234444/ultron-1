// Console UI kit.
//
// A small, copy-in primitive kit in the spirit of shadcn/ui — same composable
// API shape, same "tokens not literals" discipline — but rendered with React
// Native views so it works in the browser (through react-native-web) and on the
// Expo iOS/Android targets from one source.
//
// shadcn itself cannot be used in this codebase: it emits React DOM and depends
// on Radix primitives that need `document`, DOM refs and `createPortal`, none of
// which exist in the native runtime. See `tokens.ts` for the full note.
//
// Every colour resolves out of `lib/consoleTheme.ts`, which is already shared
// with `global.css` and `tailwind.config.js`. No component here declares a
// colour of its own.

export { Body, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, SectionLabel, Separator } from './Card';
export { Badge, KeyValue, StatusDot } from './Badge';
export { Alert, VerdictBanner } from './Alert';
export { Button, IconButton, Toolbar, ToolbarDivider, ToolbarGroup, type ButtonSize, type ButtonTone } from './Button';
export { Toast } from './Toast';
export { Tabs, type TabItem } from './Tabs';
export { Collapsible } from './Collapsible';
export { LimitBar, MagnitudeBars, Meter, StatTile, type MagnitudeDatum } from './Metrics';
export { Cell, DataTable, type Column } from './DataTable';
export { alpha, consolePalette, variantStyle, type ConsolePalette, type IconName, type Variant } from './tokens';
export { text, tabular, displayWeight, radius } from './type';
export { Hoverable, hoverGround, type HoverState } from './Hover';
