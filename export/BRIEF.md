# BlackGATE landing page — build brief

Reference implementation: `blackgate-landing.html` (19 KB, plain HTML + CSS, no framework).
Images: `assets/plant.png`, `assets/team.png` (referenced by relative path, not inlined).

## How to use this with an AI coding agent
Give it `blackgate-landing.html` only. Do NOT paste any bundled/standalone version —
those inline the images as base64 and blow the context limit.

## Design system
- Background `#070707`. Text `#fff`, muted `#8f8f8f`, dim `#5c5c5c`, soft `#c4c4c4`.
- Single accent `#b6f57e`, used sparingly: live dot, short 26px rules, figures, one node dot.
- Type: Schibsted Grotesk (display + body), DM Mono (uppercase labels, .09em tracking, 10px).
- Display headings: weight 500, letter-spacing -.028em to -.036em, line-height 1.02-1.06.
- Page padding 72px desktop / 24px under 900px.
- Buttons are pills: white fill for primary, 1px 28%-white border for secondary.

## Background atmosphere (five fixed layers, in order)
1. 56px line grid at 3.2% white, radially masked so it fades from centre out
2. Top glow — radial white 7% from above the fold
3. Bottom glow — radial white 5.5% from below
4. Corner vignette — darkens the outer frame so the centre reads as lit
5. Film grain — SVG fractalNoise at 5%, `mix-blend-mode: overlay` (stops banding)

## Section rhythm
No horizontal rules between sections. Alternating sections carry a vertical
gradient that starts and ends fully transparent (`.shade`), so tone rises and
falls with no visible edge.

## Sections, in order
1. **Hero** — centred. Mono eyebrow, two-line headline (second line in muted grey),
   ONE button, then a large ghost "BlackGATE" wordmark at 4.2% white in its own clear band.
   Extra cool-blue and violet radial tints at low opacity for colour depth.
2. **What changes after cutover** — four cards, each: mono label, new figure in green,
   "From X" reference line. Footer row: caveat + "Read the method".
3. **Northfield case** — full-bleed photo, no frame or rounding. Four metrics overlaid
   across the top on hairline rules; headline and supporting copy overlaid bottom-left.
4. **Next step** — mono kicker, oversized headline, hairline rule carrying the
   supporting line, response-time detail and primary button. A faint connector path
   sits in the right 34% only, masked so it never crosses type.
5. **In the room** — 74/26 split: photo bleeds the left edge at full colour; a roles
   column with hairline dividers and "Meet the team" bottom-aligns to the image.
6. **Operators, in their words** — one large quote top-left with a short green rule,
   then one shorter quote set lower and right-aligned. No cards.

## Rules to preserve
- Photos are never framed, rounded, bordered, or desaturated.
- Figures and units carry `white-space: nowrap`.
- Grids use `minmax(0, …)` tracks so they can shrink without clipping.
- Green is an accent only — never a fill, never a gradient wash.
