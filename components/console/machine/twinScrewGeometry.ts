/**
 * Twin-screw element geometry.
 *
 * A twin screw is not a single screw with a second shaft drawn next to it. Its
 * defining feature is a *segmented* screw: conveying elements that transport,
 * kneading blocks that disperse, and occasionally a reverse element that builds
 * pressure — assembled onto a splined shaft in a configuration chosen per
 * recipe. The single-screw drawing models the opposite idea, one continuous
 * helix over a tapering root whose closing volume does the compression
 * (`rootHalfHeight` in `SingleScrewExtruder.tsx`). Reusing that here would draw
 * the wrong machine, so this module models element sequences instead.
 *
 * Everything is a pure function of the constants below and is evaluated once at
 * module load. No path string is rebuilt during a render.
 */

/** Which way a helix winds. Co-rotating screws share a hand; the pair is phased. */
export type ScrewDirection = 'left' | 'right';

export type ScrewElementKind = 'conveying' | 'kneading' | 'reverse';

export type ScrewElementDefinition = {
  /** Where the element starts, in artwork x. */
  startX: number;
  /** How far along the shaft it runs. */
  length: number;
  /** Axial advance of one full turn. Shorter pitch = tighter, slower conveying. */
  pitch: number;
  kind: ScrewElementKind;
};

export type ScrewFlight = {
  /** Filled body of the flight, as an SVG path. */
  band: string;
  /** Leading (lit) edge of the same flight. */
  crest: string;
  kind: ScrewElementKind;
  /** Left-to-right position, used only for stable React keys. */
  key: string;
};

export type ScrewTrain = {
  /** The root cylinder the flights are mounted on. */
  root: string;
  /** Highlight line along the top of the root. */
  rootHighlight: string;
  flights: ScrewFlight[];
  /** Kneading-block discs, drawn as staggered lobes rather than helices. */
  kneadingDiscs: { x: number; rx: number; ry: number; lean: number; key: string }[];
  axisY: number;
};

/* Shared envelope ---------------------------------------------------------- */

/**
 * Both screws share every one of these. Length, pitch, root and flight radius
 * are declared once and consumed twice, so the two trains cannot drift out of
 * step the way two independently drawn screws do.
 */
export const SCREW_START_X = 640;
export const SCREW_END_X = 1322;
export const SCREW_LENGTH = SCREW_END_X - SCREW_START_X;

/** Flight outer radius — half the screw diameter. */
export const FLIGHT_RADIUS = 27;
/** Root (shaft core) radius. Constant: a twin screw compresses by element, not by taper. */
export const ROOT_RADIUS = 11;
/** Thickness of a flight land, along the axis. */
export const FLIGHT_THICKNESS = 7;

/** Centrelines of the two shafts. */
export const SCREW_A_AXIS_Y = 448;
export const SCREW_B_AXIS_Y = 494;
/** Centre distance. Below 2 x FLIGHT_RADIUS, which is what makes them intermesh. */
export const CENTRE_DISTANCE = SCREW_B_AXIS_Y - SCREW_A_AXIS_Y;

/** The one barrel window both trains are clipped to. */
export const BARREL_CLIP = { x: 638, y: 417, width: 686, height: 108 };

/**
 * The screw configuration, feed end to discharge.
 *
 * Read against the barrel: a long conveying run under the main feed, a kneading
 * block once material is molten, more conveying past the side feeder, a second
 * kneading block to disperse the side-fed additive, a short reverse element to
 * seal the melt ahead of the vent, then metering conveying to the die. Pitch
 * shortens downstream, which is how a twin screw builds pressure toward the die.
 */
export const SCREW_ELEMENTS: readonly ScrewElementDefinition[] = [
  { startX: 640, length: 152, pitch: 40, kind: 'conveying' },
  { startX: 792, length: 76, pitch: 30, kind: 'kneading' },
  { startX: 868, length: 132, pitch: 38, kind: 'conveying' },
  { startX: 1000, length: 68, pitch: 28, kind: 'kneading' },
  { startX: 1068, length: 40, pitch: 26, kind: 'reverse' },
  { startX: 1108, length: 214, pitch: 34, kind: 'conveying' },
] as const;

/* Flight geometry ---------------------------------------------------------- */

/**
 * One flight of a helix, seen side-on.
 *
 * Projected onto the page, a helix crest is a cosine: it leaves the top of the
 * screw travelling horizontally, falls steepest as it crosses the centreline,
 * and arrives at the bottom horizontally again. These control points reproduce
 * that curve. A symmetric bulge — a rotated ellipse, say — reads as a row of
 * leaves rather than as a screw, which is the failure this shape avoids.
 *
 * Half a turn carries the crest from top to bottom, so the band lands half a
 * pitch downstream of where it started.
 */
export function createFlightBand(
  x0: number,
  axisY: number,
  pitch: number,
  direction: ScrewDirection,
  thickness = FLIGHT_THICKNESS,
): string {
  const top = axisY - FLIGHT_RADIUS;
  const bottom = axisY + FLIGHT_RADIUS;
  // A left-hand helix descends over the same half turn a right-hand one climbs,
  // so the two differ only in which edge of the screw the crest starts at.
  const y1 = direction === 'right' ? top : bottom;
  const y2 = direction === 'right' ? bottom : top;
  const half = pitch / 2;
  return (
    `M ${x0} ${y1}` +
    ` C ${x0 + pitch * 0.19} ${y1} ${x0 + pitch * 0.31} ${y2} ${x0 + half} ${y2}` +
    ` L ${x0 + half + thickness} ${y2}` +
    ` C ${x0 + pitch * 0.31 + thickness} ${y2} ${x0 + pitch * 0.19 + thickness} ${y1} ${x0 + thickness} ${y1}` +
    ' Z'
  );
}

/** The leading edge of a flight, drawn lit so the helix reads in greyscale. */
export function createFlightCrest(x0: number, axisY: number, pitch: number, direction: ScrewDirection): string {
  const top = axisY - FLIGHT_RADIUS;
  const bottom = axisY + FLIGHT_RADIUS;
  const y1 = direction === 'right' ? top : bottom;
  const y2 = direction === 'right' ? bottom : top;
  const half = pitch / 2;
  return `M ${x0} ${y1} C ${x0 + pitch * 0.19} ${y1} ${x0 + pitch * 0.31} ${y2} ${x0 + half} ${y2}`;
}

/** The root cylinder. Constant radius — element geometry, not taper, does the work. */
export function createScrewRootPath(axisY: number): string {
  const top = axisY - ROOT_RADIUS;
  const bottom = axisY + ROOT_RADIUS;
  return `M ${SCREW_START_X} ${top} L ${SCREW_END_X} ${top} L ${SCREW_END_X} ${bottom} L ${SCREW_START_X} ${bottom} Z`;
}

/* Element assembly --------------------------------------------------------- */

/**
 * Walk one element and emit its flights.
 *
 * `phase` carries across element boundaries so the helix stays continuous: a
 * flight never restarts mid-shaft, which is what would make the screw look
 * assembled from unrelated pieces.
 */
function flightsForElement(
  element: ScrewElementDefinition,
  axisY: number,
  direction: ScrewDirection,
  phase: number,
  keyPrefix: string,
): { flights: ScrewFlight[]; endPhase: number } {
  const flights: ScrewFlight[] = [];
  // A kneading block is a stack of discs, not a helix, so it emits no flights.
  if (element.kind === 'kneading') {
    return { flights, endPhase: (phase + element.length) % element.pitch };
  }
  // A reverse element winds the other way — that is what makes it push back.
  const hand: ScrewDirection = element.kind === 'reverse' ? (direction === 'right' ? 'left' : 'right') : direction;
  // The count is derived from the element, not from where the phase happens to
  // put the first flight. Deriving it from a `while (x < end)` walk instead lets
  // the phased screw fit one extra flight per element, and the two screws then
  // carry different flight counts — which is the "one screw is not the other"
  // defect this whole module exists to prevent. Flights that overhang the
  // element are clipped by the barrel.
  const count = Math.ceil(element.length / element.pitch) + 1;
  for (let index = 0; index < count; index += 1) {
    const x = element.startX - phase + index * element.pitch;
    flights.push({
      band: createFlightBand(x, axisY, element.pitch, hand),
      crest: createFlightCrest(x, axisY, element.pitch, hand),
      kind: element.kind,
      key: `${keyPrefix}-${element.startX}-${index}`,
    });
  }
  return { flights, endPhase: (phase + element.length) % element.pitch };
}

/** Staggered lobes of a kneading block, seen side-on. */
function kneadingDiscsForElement(
  element: ScrewElementDefinition,
  axisY: number,
  keyPrefix: string,
): ScrewTrain['kneadingDiscs'] {
  const discs: ScrewTrain['kneadingDiscs'] = [];
  const spacing = 15;
  const count = Math.max(2, Math.round(element.length / spacing));
  const step = element.length / count;
  for (let i = 0; i < count; i += 1) {
    discs.push({
      x: element.startX + step * (i + 0.5),
      rx: 5.5,
      ry: FLIGHT_RADIUS - 1,
      // Successive discs are offset around the shaft, which side-on reads as an
      // alternating lean. That stagger is what distinguishes a kneading block.
      lean: i % 2 === 0 ? 14 : -14,
      key: `${keyPrefix}-kd-${element.startX}-${i}`,
    });
  }
  return discs;
}

/**
 * Build one complete screw train.
 *
 * `phaseOffset` shifts the whole train along the axis. The pair is drawn half a
 * pitch apart so each screw's flight sits in the other's channel — the side-on
 * signature of an intermeshing pair.
 */
export function createScrewElementSequence(
  axisY: number,
  direction: ScrewDirection,
  phaseOffset: number,
  keyPrefix: string,
): ScrewTrain {
  const flights: ScrewFlight[] = [];
  const kneadingDiscs: ScrewTrain['kneadingDiscs'] = [];
  let phase = phaseOffset;
  for (const element of SCREW_ELEMENTS) {
    const result = flightsForElement(element, axisY, direction, phase, keyPrefix);
    flights.push(...result.flights);
    phase = result.endPhase;
    if (element.kind === 'kneading') kneadingDiscs.push(...kneadingDiscsForElement(element, axisY, keyPrefix));
  }
  return {
    root: createScrewRootPath(axisY),
    rootHighlight: `M ${SCREW_START_X + 6} ${axisY - ROOT_RADIUS + 3} L ${SCREW_END_X - 6} ${axisY - ROOT_RADIUS + 3}`,
    flights,
    kneadingDiscs,
    axisY,
  };
}

/**
 * The two trains, built once at module load.
 *
 * Co-rotating: both screws are right-handed, which is what a co-rotating twin
 * screw actually is. They are told apart by phase, not by winding the second one
 * backwards — mirrored screws would be a counter-rotating machine.
 */
export const SCREW_A_TRAIN = createScrewElementSequence(SCREW_A_AXIS_Y, 'right', 0, 'a');
export const SCREW_B_TRAIN = createScrewElementSequence(SCREW_B_AXIS_Y, 'right', SCREW_ELEMENTS[0].pitch / 2, 'b');

/** Barrel bore outline, used for the cutaway shading behind the screws. */
export const BARREL_BORE = {
  left: BARREL_CLIP.x + 7,
  right: BARREL_CLIP.x + BARREL_CLIP.width - 7,
  top: BARREL_CLIP.y,
  bottom: BARREL_CLIP.y + BARREL_CLIP.height,
};
