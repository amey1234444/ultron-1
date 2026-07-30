import type { ChannelRef } from '../../../lib/rack';
import type { Anchor, Box, SavedLayout, Trail } from './TrailBoard';

// Pre-built instrumentation layout for the Rotary Airlock Valve template —
// eleven labelled points wired to the machine's physical features (bearings,
// coupling, gearbox, motor, hopper, discharge) with clean routing: a horizontal
// run out of each card, one 45° bend into the machine. Applied automatically
// the first time a RAV machine is opened with no saved layout, and re-appliable
// any time via the "⟲ Template" toolbar button. Everything stays ordinary
// trails/boxes afterwards — fully editable, removable, and saveable.

// The machine's on-stage content rect at zoom = 1 (stage is the fixed 1600×900
// design space; the RAV wrapper is max-w-4xl = 896 wide with p-8 padding, so the
// SVG artwork spans 832×526.93 centred on the stage). Used only as the fallback
// when no live rect is supplied (auto-seed at mount, where zoom is always 1);
// the "⟲ Template" button passes the live rect so the layout is generated for
// the machine exactly as currently rendered, at any zoom.
const REFERENCE_MACHINE_RECT = { x: 384, y: 186.53, width: 832, height: 526.93 };
const SVG_W = 1200;
const SVG_H = 760;

export type MachineRect = { x: number; y: number; width: number; height: number };

function machineAnchor(sx: number, sy: number): Anchor {
  return { rx: sx / SVG_W, ry: sy / SVG_H };
}

// Where the trail meets the card, expressed against boxHitRect's geometry:
// rx 0/1 = left/right edge; ry 0.25 sits just below the card's title row and
// keeps the endpoint nearly still when the card's measured height replaces the
// nominal one (the closer to the rect top, the smaller that correction jog).
const BOX_ANCHOR_RY = 0.25;
const boxRightEnd = (boxX: number, boxY: number) => ({ x: boxX + 190, y: boxY - 2.5 });
const boxLeftEnd = (boxX: number, boxY: number) => ({ x: boxX - 10, y: boxY - 2.5 });

type TemplatePoint = {
  // Channel code to link at apply time (matched against the live rack channel
  // list); if absent, the box is left unlinked with `label` as its text.
  code: string;
  label: string;
  // Machine attachment feature, in the RAV SVG's own viewBox coordinates.
  sx: number;
  sy: number;
  // Box connector origin in stage units (card renders at x+12, y-30).
  boxX: number;
  boxY: number;
  // left/right = horizontal run + one 45° bend; vertical = straight drop
  // (used for the hopper-top and discharge-bottom boxes that sit in line with
  // their attachment points).
  side: 'left' | 'right' | 'vertical';
};

// Derived from RotaryAirlockMapping.tsx's own CARDS/TRAILS arrays (the
// hand-tuned Actual View replica), so Design mode's editable template matches
// that exact arrangement. That component's canvas is 1440×820 with the machine
// occupying the box {x:315, y:130, w:800, h:560}; converting each trail's
// machine-side endpoint through that box's own coordinate space (independent of
// our stage) gives the SVG-viewBox fraction, and converting each trail's
// card-side endpoint through a uniform 1440×820→1600×900 fit (scale 1.0976,
// centred) gives the box connector origin, solved back through
// boxRightEnd/boxLeftEnd above. See conversion math in PR notes — do not hand-tune
// further; regenerate from RotaryAirlockMapping.tsx if that reference changes.
const TEMPLATE_POINTS: TemplatePoint[] = [
  // Left column, top to bottom
  { code: 'T1', label: 'RAV-01 Rotor Bearing Temp', sx: 270, sy: 135.71, boxX: 99.63, boxY: 138.6, side: 'left' },
  { code: 'V1', label: 'RAV-01 DE Vibration H', sx: 120, sy: 319.11, boxX: 99.63, boxY: 325.19, side: 'left' },
  { code: 'V2', label: 'RAV-01 DE Vibration V', sx: 120, sy: 366.43, boxX: 99.63, boxY: 511.79, side: 'left' },
  { code: 'V2', label: 'RAV-01 DE Vibration V', sx: 270, sy: 597.14, boxX: 99.63, boxY: 698.37, side: 'left' },
  // Right column, top to bottom
  { code: 'V1', label: 'RAV-01 DE Vibration H', sx: 915, sy: 135.71, boxX: 1320.37, boxY: 89.21, side: 'right' },
  { code: 'V1', label: 'RAV-01 DE Vibration H', sx: 975, sy: 237.5, boxX: 1320.37, boxY: 204.45, side: 'right' },
  { code: 'T2', label: 'Process Card CH2', sx: 975, sy: 332.5, boxX: 1320.37, boxY: 319.7, side: 'right' },
  // Short straight stub (no bend) — mirrors the reference's 2-point trail-right-v2
  { code: 'V2', label: 'RAV-01 DE Vibration V', sx: 1162.5, sy: 358.29, boxX: 1320.37, boxY: 434.94, side: 'vertical' },
  { code: 'V1', label: 'RAV-01 DE Vibration H', sx: 975, sy: 407.14, boxX: 1320.37, boxY: 550.18, side: 'right' },
  { code: 'T1', label: 'RAV-01 Rotor Bearing Temp', sx: 975, sy: 542.86, boxX: 1320.37, boxY: 665.43, side: 'right' },
  { code: 'V1', label: 'RAV-01 DE Vibration H', sx: 892.5, sy: 590.36, boxX: 1320.37, boxY: 780.67, side: 'right' },
];

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function hasDefaultLayout(machineTemplate: string) {
  return machineTemplate === 'Rotary Airlock Valve';
}

export function createRavDefaultLayout(_channels: ChannelRef[], machineRect?: MachineRect | null): SavedLayout {
  const rect = machineRect ?? REFERENCE_MACHINE_RECT;
  const svgToStage = (sx: number, sy: number) => ({
    x: rect.x + (sx / SVG_W) * rect.width,
    y: rect.y + (sy / SVG_H) * rect.height,
  });

  const trails: Trail[] = [];
  const boxes: Box[] = [];

  for (const p of TEMPLATE_POINTS) {
    const box: Box = {
      id: makeId('box'),
      x: p.boxX,
      y: p.boxY,
      label: p.label,
    };
    boxes.push(box);

    const machineEnd = svgToStage(p.sx, p.sy);
    const boxEnd = p.side === 'left' ? boxRightEnd(p.boxX, p.boxY) : boxLeftEnd(p.boxX, p.boxY);

    // One horizontal run out of the card, then a 45° segment into the machine —
    // the bend sits where those two meet. Vertical points connect straight.
    // 3-point trails are marked autoRoute so TrailBoard re-derives the bend
    // with this same rule whenever either endpoint re-anchors (zoom, box move).
    const points =
      p.side === 'vertical'
        ? [machineEnd, boxEnd]
        : [
            machineEnd,
            {
              x: p.side === 'left' ? machineEnd.x - Math.abs(machineEnd.y - boxEnd.y) : machineEnd.x + Math.abs(machineEnd.y - boxEnd.y),
              y: boxEnd.y,
            },
            boxEnd,
          ];

    trails.push({
      id: makeId('trail'),
      points,
      startMachineAnchor: machineAnchor(p.sx, p.sy),
      endBoxId: box.id,
      endBoxAnchor: { rx: p.side === 'left' ? 1 : 0, ry: BOX_ANCHOR_RY },
      autoRoute: p.side !== 'vertical',
    });
  }

  return { trails, boxes };
}
