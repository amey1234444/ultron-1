# Ultron channel value control correction

## Objective

Correct Section 06 of the acquisition-card configuration page so its channel
value control faithfully ports the working control from `F:\Downloads2\Part.zip`
(`ui components/Part1/src/components/MeasurementControl.tsx`, `RotaryKnob.tsx`,
`RangeGauge.tsx`, and `styles.css`). Correct the light-mode page-height bug shown
in `F:\tmp\Screenshot 2026-08-27 170218.png`.

## Audience and context

Plant commissioning engineers use this authenticated Next.js + Expo / React
Native Web console. The control must be precise, dense, obvious, and usable with
mouse, touch, wheel, and keyboard. Existing NativeWind tokens and project
components must be retained.

## Direction

Instrument panel, matching the working ZIP control. Section 06 is one complete
measurement station: channel identity and condition, a large external numeric
readout, a compact 118px physical-looking dark knob with the gold pointer, min
and max below it, alarm range track and marker, exact numeric input, reset, then
source/output/acquisition configuration. Do not place the reading inside the
knob. Do not add a coloured condition-progress arc to the knob bezel. Do not
make the knob oversized. Gold belongs only to the physical knob pointer/bezel;
existing semantic green/amber/red remain condition indicators.

## Interaction contract

On web, port the ZIP's actual pointer-capture behavior: pointer down stores
clientY/value and captures the pointer; pointer move changes the value using a
full-range travel of 220px; pointer up/cancel clears capture. Wheel adjusts one
step. Arrow keys adjust one step, Shift+arrow ten steps, Home/End choose bounds.
The entire knob/pointer surface is interactive and visibly uses an ns-resize
cursor. Preserve a PanResponder fallback for native targets, but do not let it
replace the web pointer contract. All interaction paths clamp and quantize and
switch the channel to Manual through the existing `drive` callback.

## Black-background correction

The screenshot's black begins at one common horizontal boundary across both the
sidebar and detail area: the app root is ending at intrinsic content height and
overflow is painting over the global dark body. Add a robust full-height web
root contract in `global.css` for html, body, `#__next`, `#root`, and the direct
root mount as appropriate. Preserve `body`'s dark landing-page background while
ensuring the console's SafeAreaView fills the viewport. Also give both
`CardOverviewPage` and `CardConfigPage` explicit page/panel/footer backgrounds
for the active theme.

## Files and framework

- Existing design system: `tailwind.config.js`, `global.css`.
- Main implementation: `components/console/rack/ChannelValueKnob.tsx`.
- Section integration: `components/console/rack/CardConfigFields.tsx`.
- Page surfaces: `components/console/rack/CardOverviewPage.tsx`,
  `components/console/rack/CardConfigPage.tsx`, and `global.css`.
- Expo SDK is 57; repository instructions require the exact SDK 57 docs.

## Verification

Run `npm run typecheck`. Keep edits tightly scoped and preserve all existing
channel simulation persistence, alarm semantics, exact input, reset, source,
output, measurement type, and samples-per-second behavior.
