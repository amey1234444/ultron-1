import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { TWIN_SCREW_POINT_REGISTRY } from '../../../lib/twinScrewExtruderPoints';

type TwinScrewExtruderProps = {
  className?: string;
  style?: StyleProp<ViewStyle>;

  /**
   * How each instrument pad is currently wired, keyed by point code.
   *
   * An empty pad is a hollow ring, a pad with a card attached is filled, and a
   * pad whose card is reporting gets a halo — the same three marks the single
   * screw uses, so one drawing convention covers both extruders.
   */
  connectorState?: Record<string, 'idle' | 'linked' | 'live'>;

  /**
   * Advance the screw flights along the barrel.
   * One full turn (360) shifts the flights by exactly one pitch.
   */
  screwRotation?: number;

  /** Set true when the component needs its own panel. */
  showBackground?: boolean;
};

/**
 * The same 1200 x 760 design canvas as the Single Screw Extruder and the Rotary
 * Airlock Valve, so all three machines share one stage geometry — trail anchors
 * are stored as fractions of this viewBox and stay valid across templates.
 */
export const TWIN_SCREW_VIEWBOX_WIDTH = 1200;
export const TWIN_SCREW_VIEWBOX_HEIGHT = 760;
const VIEWBOX_WIDTH = TWIN_SCREW_VIEWBOX_WIDTH;
const VIEWBOX_HEIGHT = TWIN_SCREW_VIEWBOX_HEIGHT;

/* Stage ------------------------------------------------------------------- */

/**
 * The two screws sit on two parallel axes, close enough that their flights
 * overlap. That overlap is the whole point of a twin screw — it is what makes
 * the pair self-wiping — so the centre distance is set to 52 against a screw
 * radius of 31, leaving a 10-unit intermesh band the front screw occludes. Real
 * co-rotating machines run a centre distance of roughly 0.85 of the diameter,
 * which is what those numbers are.
 */
const SCREW_A_Y = 422;
const SCREW_B_Y = 474;
const SCREW_HALF = 31;
const BARREL_AXIS_Y = (SCREW_A_Y + SCREW_B_Y) / 2;

const BARREL_LEFT = 486;
const BARREL_RIGHT = 1040;
const BARREL_TOP = 376;
const BARREL_BOTTOM = 520;

const BORE_LEFT = 500;
const BORE_RIGHT = 1026;
const BORE_TOP = 390;
const BORE_BOTTOM = 506;
const BORE_SPAN = BORE_RIGHT - BORE_LEFT;

const FLIGHT_PITCH = 44;
const FLIGHT_THICKNESS = 8;

/**
 * Motor, coupling and gearbox input share one centreline, below the screw axes
 * — the gearbox visibly steps the drive up and splits it into two shafts.
 */
const DRIVE_AXIS_Y = 545;

/** Eight barrel temperature zones, evenly spaced over the heated length. */
const ZONE_CENTRES = [580, 641, 703, 764, 826, 887, 949, 1010];
const ZONE_BLOCK_WIDTH = 46;
const ZONE_BLOCK_BOTTOM = BARREL_BOTTOM + 26;
/** Rail the zone thermocouple leads run down to. */
const WIRING_RAIL_Y = 590;

/** Barrel-segment joints, drawn where two zones meet. */
const SEGMENT_JOINTS = ZONE_CENTRES.slice(0, -1).map((centre, index) => (centre + ZONE_CENTRES[index + 1]) / 2);

/** Where a port or a transducer boss already occupies the barrel crown. */
const FEED_FLANGE: [number, number] = [498, 574];
const SIDE_FLANGE: [number, number] = [714, 786];
const VENT_FLANGE: [number, number] = [896, 964];
const P_INT_BOSSES = [700, 866];
const BOSS_HALF_WIDTH = 8;

/**
 * Top clamp blocks only where the crown is free. Drawing one under the feed
 * throat or the vent flange would be a block that could not physically be there.
 */
const OCCUPIED_CROWN: Array<[number, number]> = [
  FEED_FLANGE,
  SIDE_FLANGE,
  VENT_FLANGE,
  ...P_INT_BOSSES.map((x): [number, number] => [x - BOSS_HALF_WIDTH, x + BOSS_HALF_WIDTH]),
];
const TOP_BLOCK_CENTRES = ZONE_CENTRES.filter((centre) => {
  const left = centre - ZONE_BLOCK_WIDTH / 2;
  const right = centre + ZONE_BLOCK_WIDTH / 2;
  return !OCCUPIED_CROWN.some(([from, to]) => right > from && left < to);
});

/**
 * Kneading and mixing sections.
 *
 * A twin screw is built from elements slid onto a splined shaft, so its profile
 * changes along the barrel: conveying flights carry material, kneading blocks
 * melt and disperse it. Drawing that change is the one thing a twin-screw
 * schematic has to get right — a continuous helix all the way down the barrel
 * is a single-screw drawing with two shafts in it.
 */
const KNEAD_BLOCKS: Array<[number, number]> = [
  [614, 684], // melting section, ahead of the side feed port
  [800, 858], // distributive mixing, ahead of the vent
];
const KNEAD_DISC_PITCH = 14;
const KNEAD_DISC_WIDTH = 10;

/** The stretches of bore that still carry conveying flights. */
const CONVEYING_SPANS: Array<[number, number]> = (() => {
  const spans: Array<[number, number]> = [];
  let cursor = BORE_LEFT;
  for (const [from, to] of KNEAD_BLOCKS) {
    if (from > cursor) spans.push([cursor, from]);
    cursor = to;
  }
  if (BORE_RIGHT > cursor) spans.push([cursor, BORE_RIGHT]);
  return spans;
})();

const MOTOR_FINS = Array.from({ length: 8 }, (_, index) => index);
const COWL_SLOTS = [0, 1, 2, 3, 4];
const GEARBOX_BOLTS = [
  [322, 338],
  [428, 338],
  [322, 588],
  [428, 588],
];

/**
 * Every point this machine can report, at the spot on the drawing where the
 * instrument physically sits.
 *
 * The default trail layout imports this list, so a card can never attach to a
 * place the artwork does not actually have an instrument — move a pad in the
 * registry and the trail that lands on it moves with it.
 */
export type TwinScrewConnector = (typeof TWIN_SCREW_POINT_REGISTRY)[number];

export const TWIN_SCREW_CONNECTORS: readonly TwinScrewConnector[] = TWIN_SCREW_POINT_REGISTRY;

const SCREW_FLIGHTS: number[] = [];
for (let x = BORE_LEFT - FLIGHT_PITCH; x < BORE_RIGHT + FLIGHT_PITCH; x += FLIGHT_PITCH) {
  SCREW_FLIGHTS.push(x);
}

/** Diagonal section hatching across the cut barrel wall. */
const HATCH_LINES: number[] = [];
for (let x = BARREL_LEFT - 60; x < BARREL_RIGHT + 60; x += 9) HATCH_LINES.push(x);

/**
 * Root radius along a screw.
 *
 * A twin screw compresses far less than a single screw does — the segmented
 * elements do the work, not a tapering root — so the channel only shallows
 * mildly from the feed end to the metering end.
 */
function rootHalfHeight(x: number): number {
  const t = Math.max(0, Math.min(1, (x - BORE_LEFT) / BORE_SPAN));
  const deep = 13;
  const shallow = 19;
  return deep + (shallow - deep) * (t * t * (3 - 2 * t)); // smoothstep
}

/**
 * One flight of a helix, seen side-on.
 *
 * Projected onto the page a helix crest is a cosine: it leaves the top of the
 * screw horizontally, falls steepest as it crosses the axis, and arrives at the
 * bottom horizontally again. Half a turn advances half a pitch, which is why
 * the band lands `FLIGHT_PITCH / 2` downstream of where it started.
 */
function flightBand(x0: number, axisY: number, fromTop: boolean, thickness: number): string {
  const top = axisY - SCREW_HALF;
  const bottom = axisY + SCREW_HALF;
  const y1 = fromTop ? top : bottom;
  const y2 = fromTop ? bottom : top;
  const half = FLIGHT_PITCH / 2;
  return (
    `M ${x0} ${y1}` +
    ` C ${x0 + FLIGHT_PITCH * 0.19} ${y1} ${x0 + FLIGHT_PITCH * 0.31} ${y2} ${x0 + half} ${y2}` +
    ` L ${x0 + half + thickness} ${y2}` +
    ` C ${x0 + FLIGHT_PITCH * 0.31 + thickness} ${y2} ${x0 + FLIGHT_PITCH * 0.19 + thickness} ${y1} ${x0 + thickness} ${y1}` +
    ` Z`
  );
}

/** Edge of a flight — lit on the leading face, shadowed on the trailing one. */
function flightCrest(x0: number, axisY: number): string {
  const top = axisY - SCREW_HALF;
  const bottom = axisY + SCREW_HALF;
  const half = FLIGHT_PITCH / 2;
  return `M ${x0} ${top} C ${x0 + FLIGHT_PITCH * 0.19} ${top} ${x0 + FLIGHT_PITCH * 0.31} ${bottom} ${x0 + half} ${bottom}`;
}

/** The tapering root cylinder of one screw, sampled along its length. */
function rootPath(axisY: number): string {
  let top = '';
  let bottom = '';
  for (let x = BORE_LEFT - FLIGHT_PITCH; x <= BORE_RIGHT + FLIGHT_PITCH; x += 8) {
    const half = rootHalfHeight(x);
    top += `${top ? ' L' : 'M'} ${x} ${axisY - half}`;
    bottom = ` L ${x} ${axisY + half}` + bottom;
  }
  return `${top}${bottom} Z`;
}

/**
 * The discs of one kneading block.
 *
 * Each disc is staggered a few degrees from the one before it, so in projection
 * the stack fans: the tips sweep from one side of the block to the other. That
 * fan is what separates a kneading block from a run of conveying flights at a
 * glance.
 */
function kneadingDiscs(from: number, to: number): Array<{ x: number; lean: number; index: number }> {
  const count = Math.max(1, Math.floor((to - from) / KNEAD_DISC_PITCH));
  const start = from + ((to - from) - (count - 1) * KNEAD_DISC_PITCH - KNEAD_DISC_WIDTH) / 2;
  return Array.from({ length: count }, (_, index) => ({
    x: start + index * KNEAD_DISC_PITCH,
    lean: (index - (count - 1) / 2) * 1.4,
    index,
  }));
}

function kneadingDisc(x: number, axisY: number, lean: number): string {
  const top = axisY - SCREW_HALF;
  const bottom = axisY + SCREW_HALF;
  return (
    `M ${x - lean} ${top}` +
    ` L ${x - lean + KNEAD_DISC_WIDTH} ${top}` +
    ` L ${x + lean + KNEAD_DISC_WIDTH} ${bottom}` +
    ` L ${x + lean} ${bottom} Z`
  );
}

const ROOT_PATH_A = rootPath(SCREW_A_Y);
const ROOT_PATH_B = rootPath(SCREW_B_Y);

export function TwinScrewExtruder({
  className,
  style,
  screwRotation = 0,
  showBackground = false,
  connectorState,
}: TwinScrewExtruderProps) {
  const { isDark } = useAppTheme();

  const colours = useMemo(
    () => ({
      panel: isDark ? '#111318' : '#FFFFFF',
      machine: isDark ? '#191C22' : '#ECECEA',
      machineRaised: isDark ? '#232730' : '#FFFFFF',
      machineDeep: isDark ? '#0C0E12' : '#D6D7D4',
      machineStroke: isDark ? '#6E727C' : '#414141',
      fineStroke: isDark ? '#3A3E46' : '#A1A3A0',
      hatch: isDark ? '#8E939C' : '#6C7078',
      muted: isDark ? '#8B8D93' : '#5C6068',
      accent: '#3FBF6A',
      screw: isDark ? '#4A4F59' : '#B7BAC0',
      screwLit: isDark ? '#666C77' : '#DDDEE1',
      screwDark: isDark ? '#22262E' : '#8E9299',
      // The far screw is one step down the same ramp, so depth reads as depth
      // rather than as two differently coloured machines.
      screwBack: isDark ? '#383D46' : '#A4A8AF',
      screwBackDark: isDark ? '#191D24' : '#7C8087',
    }),
    [isDark],
  );

  /**
   * The flights are clipped to the bore and spaced exactly one pitch apart, so
   * shifting them by one pitch is a seamless loop.
   */
  const flightOffset = ((((screwRotation % 360) + 360) % 360) / 360) * FLIGHT_PITCH;

  const partLabel = (
    x: number,
    y: number,
    label: string,
    size = 13,
    letterSpacing = 2,
    anchor: 'start' | 'middle' | 'end' = 'middle',
  ) => (
    <SvgText
      x={x}
      y={y}
      fill={colours.muted}
      fontFamily="Inter_600SemiBold"
      fontSize={size}
      fontWeight="600"
      letterSpacing={letterSpacing}
      textAnchor={anchor}
    >
      {label}
    </SvgText>
  );

  /**
   * One screw: the far half of its helix, then the root, then the near half —
   * seeing the back flights behind the root is what makes a screw read as round
   * rather than flat. Conveying flights are clipped to the stretches of bore
   * that actually carry them, so a kneading block starts and ends on a clean
   * edge instead of a ragged gap between two dropped flights.
   */
  const screw = (
    axisY: number,
    phase: number,
    rootPathD: string,
    tone: { back: string; front: string; root: string },
  ) => (
    <G>
      <G clipPath="url(#twinScrewConveying)">
        {SCREW_FLIGHTS.map((x) => (
          <Path
            key={`back-${axisY}-${x}`}
            d={flightBand(x + flightOffset + phase + FLIGHT_PITCH / 2, axisY, false, FLIGHT_THICKNESS)}
            fill={tone.back}
            stroke={tone.back}
            strokeWidth={1}
          />
        ))}
      </G>

      <Path d={rootPathD} fill={tone.root} stroke={colours.fineStroke} strokeWidth={1} />

      <G clipPath="url(#twinScrewConveying)">
        {SCREW_FLIGHTS.map((x) => (
          <G key={`flight-${axisY}-${x}`}>
            <Path
              d={flightBand(x + flightOffset + phase, axisY, true, FLIGHT_THICKNESS)}
              fill={tone.front}
              stroke={colours.machineStroke}
              strokeWidth={1}
            />
            <Path
              d={flightCrest(x + flightOffset + phase, axisY)}
              fill="none"
              stroke={isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.8)'}
              strokeWidth={1.2}
            />
            <Path d={flightCrest(x + flightOffset + phase + FLIGHT_THICKNESS, axisY)} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
          </G>
        ))}
      </G>

      {KNEAD_BLOCKS.map(([from, to], blockIndex) => (
        <G key={`knead-${axisY}-${blockIndex}`}>
          {kneadingDiscs(from, to).map(({ x, lean, index }) => (
            <Path
              key={`disc-${axisY}-${blockIndex}-${index}`}
              d={kneadingDisc(x, axisY, lean)}
              fill={index % 2 === 0 ? tone.front : colours.screwLit}
              stroke={colours.machineStroke}
              strokeWidth={1}
            />
          ))}
        </G>
      ))}
    </G>
  );

  return (
    <View
      className={cn('w-full overflow-hidden', showBackground && 'rounded-2xl', className)}
      style={[
        {
          aspectRatio: VIEWBOX_WIDTH / VIEWBOX_HEIGHT,
          backgroundColor: showBackground ? colours.panel : 'transparent',
        },
        style,
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
        <Defs>
          <LinearGradient id="twinScrewBody" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colours.machineRaised} />
            <Stop offset="1" stopColor={colours.machine} />
          </LinearGradient>

          {/* Four stops, not two: a cylinder has a highlight band below its top
              edge and falls away to shadow underneath. */}
          <LinearGradient id="twinScrewBarrel" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colours.machine} />
            <Stop offset="0.16" stopColor={colours.machineRaised} />
            <Stop offset="0.55" stopColor={colours.machine} />
            <Stop offset="1" stopColor={colours.machineDeep} />
          </LinearGradient>

          <LinearGradient id="twinScrewBore" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={isDark ? '#07080B' : '#CFD0CE'} />
            <Stop offset="0.5" stopColor={isDark ? '#15181E' : '#F2F2F0'} />
            <Stop offset="1" stopColor={isDark ? '#07080B' : '#CFD0CE'} />
          </LinearGradient>

          <LinearGradient id="twinScrewMotor" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colours.machineRaised} />
            <Stop offset="0.5" stopColor={colours.machine} />
            <Stop offset="1" stopColor={colours.machineDeep} />
          </LinearGradient>

          <LinearGradient id="twinScrewRoot" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colours.screwDark} />
            <Stop offset="0.35" stopColor={colours.screwLit} />
            <Stop offset="1" stopColor={colours.screwDark} />
          </LinearGradient>

          <LinearGradient id="twinScrewRootBack" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colours.screwBackDark} />
            <Stop offset="0.35" stopColor={colours.screw} />
            <Stop offset="1" stopColor={colours.screwBackDark} />
          </LinearGradient>

          <LinearGradient id="twinScrewMaterial" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={isDark ? '#C9A15C' : '#E0B76A'} />
            <Stop offset="1" stopColor={isDark ? '#8A6415' : '#B98A22'} />
          </LinearGradient>

          <LinearGradient id="twinScrewMelt" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#8A6415" stopOpacity={0.06} />
            <Stop offset="1" stopColor="#C9A15C" stopOpacity={0.28} />
          </LinearGradient>

          <ClipPath id="twinScrewBoreClip">
            <Rect x={BORE_LEFT} y={BORE_TOP} width={BORE_SPAN} height={BORE_BOTTOM - BORE_TOP} rx={6} />
          </ClipPath>
          <ClipPath id="twinScrewConveying">
            {CONVEYING_SPANS.map(([from, to]) => (
              <Rect key={`conveying-${from}`} x={from} y={BORE_TOP} width={to - from} height={BORE_BOTTOM - BORE_TOP} />
            ))}
          </ClipPath>
          <ClipPath id="twinScrewWallTop">
            <Rect x={BARREL_LEFT} y={BARREL_TOP} width={BARREL_RIGHT - BARREL_LEFT} height={BORE_TOP - BARREL_TOP} />
          </ClipPath>
          <ClipPath id="twinScrewWallBottom">
            <Rect x={BARREL_LEFT} y={BORE_BOTTOM} width={BARREL_RIGHT - BARREL_LEFT} height={BARREL_BOTTOM - BORE_BOTTOM} />
          </ClipPath>
        </Defs>

        {showBackground && <Rect x={0} y={0} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill={colours.panel} />}

        {/* Centrelines: the drive train on one, the process on the other. */}
        <Line x1={40} y1={DRIVE_AXIS_Y} x2={330} y2={DRIVE_AXIS_Y} stroke={colours.fineStroke} strokeWidth={1} strokeDasharray="22 6 3 6" opacity={0.4} />
        <Line x1={440} y1={BARREL_AXIS_Y} x2={1196} y2={BARREL_AXIS_Y} stroke={colours.fineStroke} strokeWidth={1} strokeDasharray="22 6 3 6" opacity={0.35} />

        {/* --- Drive train, all on DRIVE_AXIS_Y ------------------------------ */}

        {/* Motor */}
        <Rect x={54} y={508} width={20} height={74} rx={6} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {COWL_SLOTS.map((index) => (
          <Line key={`cowl-${index}`} x1={58} y1={518 + index * 13} x2={70} y2={518 + index * 13} stroke={colours.fineStroke} strokeWidth={1.5} />
        ))}
        <Rect x={74} y={498} width={122} height={94} rx={16} fill="url(#twinScrewMotor)" stroke={colours.machineStroke} strokeWidth={2} />
        {MOTOR_FINS.map((index) => (
          <Line key={`fin-${index}`} x1={88} y1={510 + index * 10} x2={190} y2={510 + index * 10} stroke={colours.fineStroke} strokeWidth={1.5} />
        ))}
        {/* Terminal box and its gland — where the three-phase meter is taken. */}
        <Rect x={112} y={470} width={50} height={28} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={130} y={456} width={14} height={14} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={196} y={506} width={18} height={78} rx={4} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={80} y={592} width={110} height={14} rx={3} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={92} y={606} width={38} height={22} rx={2} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Rect x={152} y={606} width={38} height={22} rx={2} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Circle cx={111} cy={617} r={3} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={171} cy={617} r={3} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        {partLabel(135, 656, 'MOTOR')}

        {/* Shaft into the coupling and the coupling into the gearbox — one
            continuous line of drive, not three parts placed near each other. */}
        <Rect x={214} y={DRIVE_AXIS_Y - 6} width={34} height={12} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={246} y={524} width={18} height={42} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={264} y={531} width={26} height={28} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={290} y={524} width={16} height={42} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {partLabel(272, 600, 'COUPLING', 10, 1.4)}

        {/* Gear box — one input shaft in, two output shafts out. */}
        <Rect x={306} y={322} width={138} height={282} rx={14} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2.5} />
        <Rect x={320} y={336} width={110} height={254} rx={9} fill="none" stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={368} y={306} width={14} height={16} rx={2} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Circle cx={375} cy={300} r={11} fill="none" stroke={colours.machineStroke} strokeWidth={2.5} />
        <Rect x={402} y={300} width={28} height={22} rx={4} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={330} y={496} width={86} height={52} rx={3} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        {/* Input on the drive axis, the two outputs on the two screw axes. */}
        <Line x1={306} y1={DRIVE_AXIS_Y} x2={375} y2={DRIVE_AXIS_Y} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={375} y1={SCREW_A_Y} x2={490} y2={SCREW_A_Y} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={375} y1={SCREW_B_Y} x2={490} y2={SCREW_B_Y} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={375} y1={SCREW_A_Y} x2={375} y2={DRIVE_AXIS_Y} stroke={colours.fineStroke} strokeWidth={1} strokeDasharray="4 4" />
        <Circle cx={375} cy={SCREW_A_Y} r={13} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Circle cx={375} cy={SCREW_A_Y} r={5} fill={colours.machineRaised} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={375} cy={SCREW_B_Y} r={13} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Circle cx={375} cy={SCREW_B_Y} r={5} fill={colours.machineRaised} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={375} cy={DRIVE_AXIS_Y} r={10} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={1.5} />
        {GEARBOX_BOLTS.map(([x, y]) => (
          <Circle key={`gearbox-bolt-${x}-${y}`} cx={x} cy={y} r={5.5} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        ))}
        {/* Output bearing housings, one per screw shaft */}
        {[SCREW_A_Y, SCREW_B_Y].map((axisY) => (
          <Rect
            key={`out-housing-${axisY}`}
            x={420}
            y={axisY - 19}
            width={24}
            height={38}
            rx={3}
            fill="url(#twinScrewBody)"
            stroke={colours.machineStroke}
            strokeWidth={1.5}
          />
        ))}
        {/* Oil sight glass */}
        <Circle cx={350} cy={566} r={12} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Circle cx={350} cy={566} r={6} fill={colours.accent} opacity={0.3} />
        <Rect x={300} y={604} width={152} height={14} rx={3} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={312} y={618} width={40} height={24} rx={2} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Rect x={400} y={618} width={40} height={24} rx={2} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        {partLabel(375, 668, 'GEAR BOX')}

        {/* Thrust box — the block that takes the screws' axial load and carries
            the two speed pickups on their way into the barrel. */}
        <Rect x={446} y={352} width={44} height={186} rx={6} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={458} y={338} width={18} height={14} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1.2} />
        {[
          [454, 362],
          [482, 362],
          [454, 528],
          [482, 528],
        ].map(([cx, cy]) => (
          <Circle key={`thrust-bolt-${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        ))}
        {partLabel(468, 572, 'THRUST', 10, 1.4)}

        {/* --- Barrel -------------------------------------------------------- */}
        <Rect
          x={BARREL_LEFT}
          y={BARREL_TOP}
          width={BARREL_RIGHT - BARREL_LEFT}
          height={BARREL_BOTTOM - BARREL_TOP}
          rx={10}
          fill="url(#twinScrewBarrel)"
          stroke={colours.machineStroke}
          strokeWidth={2.5}
        />

        {/* Section hatching — the drawing convention for "cut through". */}
        {['twinScrewWallTop', 'twinScrewWallBottom'].map((clip) => (
          <G key={clip} clipPath={`url(#${clip})`}>
            {HATCH_LINES.map((x) => (
              <Line
                key={`${clip}-${x}`}
                x1={x}
                y1={BARREL_BOTTOM + 4}
                x2={x + 26}
                y2={BARREL_TOP - 4}
                stroke={colours.hatch}
                strokeWidth={1}
                opacity={0.3}
              />
            ))}
          </G>
        ))}

        {/* A twin-screw barrel is built from bolted segments, one per zone. */}
        {SEGMENT_JOINTS.map((x) => (
          <G key={`joint-${x}`}>
            <Line x1={x} y1={BARREL_TOP} x2={x} y2={BORE_TOP} stroke={colours.fineStroke} strokeWidth={1.4} />
            <Line x1={x} y1={BORE_BOTTOM} x2={x} y2={BARREL_BOTTOM} stroke={colours.fineStroke} strokeWidth={1.4} />
          </G>
        ))}

        {/* Feed opening cut down through the barrel crown */}
        <Rect x={506} y={BARREL_TOP} width={56} height={BORE_TOP - BARREL_TOP} fill={colours.machineDeep} />
        <Rect x={509} y={BARREL_TOP} width={50} height={BORE_TOP - BARREL_TOP} fill="url(#twinScrewMaterial)" opacity={0.8} />

        {/* Side feed port, cut in from the crown ahead of the melting section */}
        <Rect x={732} y={BARREL_TOP} width={36} height={BORE_TOP - BARREL_TOP} fill={colours.machineDeep} />
        <Rect x={735} y={BARREL_TOP} width={30} height={BORE_TOP - BARREL_TOP} fill="url(#twinScrewMaterial)" opacity={0.7} />

        {/* Vent port */}
        <Rect x={912} y={BARREL_TOP} width={36} height={BORE_TOP - BARREL_TOP} fill={colours.machineDeep} />

        {/* Zone blocks: the clamped heater / cooling shells, thermocouple leads
            running down to a common rail. */}
        <Line x1={557} y1={WIRING_RAIL_Y} x2={1033} y2={WIRING_RAIL_Y} stroke={colours.fineStroke} strokeWidth={1} />
        {ZONE_CENTRES.map((centre, index) => (
          <G key={`zone-${centre}`}>
            <Rect
              x={centre - ZONE_BLOCK_WIDTH / 2}
              y={BARREL_BOTTOM}
              width={ZONE_BLOCK_WIDTH}
              height={ZONE_BLOCK_BOTTOM - BARREL_BOTTOM}
              rx={2}
              fill="url(#twinScrewBody)"
              stroke={colours.machineStroke}
              strokeWidth={1.5}
            />
            {[-15, 15].map((dx) => (
              <Circle
                key={`zone-bolt-${centre}-${dx}`}
                cx={centre + dx}
                cy={ZONE_BLOCK_BOTTOM - 6}
                r={2}
                fill={colours.machineDeep}
                stroke={colours.fineStroke}
                strokeWidth={0.8}
              />
            ))}
            <Line x1={centre} y1={ZONE_BLOCK_BOTTOM} x2={centre} y2={WIRING_RAIL_Y} stroke={colours.fineStroke} strokeWidth={1} />
            {partLabel(centre, 538, `TZ${index + 1}`, 10, 0.8)}
          </G>
        ))}
        {TOP_BLOCK_CENTRES.map((centre) => (
          <Rect
            key={`top-block-${centre}`}
            x={centre - ZONE_BLOCK_WIDTH / 2}
            y={BARREL_TOP - 13}
            width={ZONE_BLOCK_WIDTH}
            height={13}
            rx={2}
            fill="url(#twinScrewBody)"
            stroke={colours.machineStroke}
            strokeWidth={1.5}
          />
        ))}
        {partLabel(760, 620, 'BARREL TEMPERATURE ZONES', 11, 2.4)}

        {/* Bore cut-away. The accent marks the process channel. */}
        <Rect
          x={BORE_LEFT}
          y={BORE_TOP}
          width={BORE_SPAN}
          height={BORE_BOTTOM - BORE_TOP}
          rx={6}
          fill="url(#twinScrewBore)"
          stroke={colours.accent}
          strokeWidth={1.3}
          strokeOpacity={0.55}
        />

        <G clipPath="url(#twinScrewBoreClip)">
          {/* Melt only where there is melt — downstream of the melting section. */}
          <Rect x={684} y={BORE_TOP} width={BORE_RIGHT - 684} height={BORE_BOTTOM - BORE_TOP} fill="url(#twinScrewMelt)" />

          {/* The far screw first, then the near one on top of it. The near
              screw occluding the far one across the intermesh band is what
              makes the pair read as two shafts rather than one wide one. */}
          {screw(SCREW_B_Y, FLIGHT_PITCH / 2, ROOT_PATH_B, {
            back: colours.screwBackDark,
            front: colours.screwBack,
            root: 'url(#twinScrewRootBack)',
          })}
          {screw(SCREW_A_Y, 0, ROOT_PATH_A, {
            back: colours.screwDark,
            front: colours.screw,
            root: 'url(#twinScrewRoot)',
          })}
        </G>

        {/* --- Main hopper and gravimetric feeder ---------------------------- */}
        <SvgText
          x={536}
          y={58}
          fill={colours.muted}
          fontFamily="SpaceGrotesk_600SemiBold"
          fontSize={17}
          fontWeight="600"
          letterSpacing={4.5}
          textAnchor="middle"
        >
          MAIN FEEDER
        </SvgText>
        <Polygon points="526,72 546,72 536,88" fill={colours.accent} />

        <Rect x={524} y={100} width={24} height={20} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Rect x={480} y={120} width={112} height={16} rx={8} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={486} y={136} width={100} height={108} rx={4} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Path d="M 486 244 L 586 244 L 558 312 L 514 312 Z" fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={514} y={312} width={44} height={50} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={498} y={362} width={76} height={14} rx={2} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Path d="M 492 176 Q 536 162 580 176 L 580 242 L 554 310 L 518 310 Z" fill="url(#twinScrewMaterial)" opacity={0.85} />
        <Rect x={520} y={312} width={32} height={50} fill="url(#twinScrewMaterial)" opacity={0.7} />
        {/* Continuous level transmitter, flanged onto the hopper wall */}
        <Rect x={586} y={172} width={8} height={16} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={594} y={166} width={22} height={28} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        {/* Loss-in-weight feeder: drive, weigh module and motor current tap,
            bracketed off the feed-screw tube it meters through. */}
        <Rect x={558} y={288} width={22} height={20} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={580} y={252} width={50} height={104} rx={6} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Line x1={580} y1={290} x2={630} y2={290} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={580} y1={322} x2={630} y2={322} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={605} cy={270} r={7} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        {/* Feed throat thermocouple boss */}
        <Rect x={494} y={346} width={18} height={22} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1.2} />

        {/* --- Side feeder / stuffer ---------------------------------------- */}
        {partLabel(750, 176, 'SIDE FEEDER', 11, 1.8)}
        <Rect x={702} y={188} width={96} height={12} rx={6} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={708} y={200} width={84} height={46} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Path d="M 708 246 L 792 246 L 768 290 L 732 290 Z" fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Path d="M 714 212 Q 750 204 786 212 L 786 244 L 764 288 L 736 288 Z" fill="url(#twinScrewMaterial)" opacity={0.8} />
        {/* Horizontal twin-screw stuffer, dropping into the barrel crown */}
        <Rect x={700} y={290} width={100} height={32} rx={5} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={732} y={322} width={36} height={40} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={714} y={362} width={72} height={14} rx={2} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {/* Its own gearmotor, weigh module and current tap */}
        <Rect x={644} y={250} width={56} height={90} rx={6} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Line x1={644} y1={282} x2={700} y2={282} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={644} y1={310} x2={700} y2={310} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={670} cy={266} r={7} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />

        {/* --- Intermediate melt-pressure transducers ------------------------ */}
        {P_INT_BOSSES.map((x) => (
          <Rect
            key={`p-int-${x}`}
            x={x - BOSS_HALF_WIDTH}
            y={352}
            width={BOSS_HALF_WIDTH * 2}
            height={BARREL_TOP - 352}
            rx={2}
            fill={colours.machineDeep}
            stroke={colours.fineStroke}
            strokeWidth={1.2}
          />
        ))}

        {/* --- Vent / devolatilisation stack --------------------------------- */}
        {partLabel(930, 172, 'VENT', 11, 2)}
        <Rect x={918} y={186} width={24} height={48} rx={3} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={1.5} />
        <Rect x={892} y={234} width={76} height={14} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={898} y={248} width={64} height={64} rx={5} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={912} y={312} width={36} height={50} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={896} y={362} width={68} height={14} rx={2} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {/* Vent-zone thermocouple boss, in the barrel wall beside the port */}
        <Rect x={948} y={322} width={22} height={18} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1.2} />

        {/* --- Adapter, screen changer and die ------------------------------- */}
        <Rect x={BARREL_RIGHT} y={364} width={24} height={168} rx={3} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {[372, BARREL_AXIS_Y, 524].map((cy) => (
          <Circle key={`adapter-bolt-${cy}`} cx={1052} cy={cy} r={3.5} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        ))}
        <Rect x={1064} y={372} width={54} height={152} rx={4} fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {/* Breaker plate and screen pack */}
        <Line x1={1086} y1={376} x2={1086} y2={520} stroke={colours.fineStroke} strokeWidth={1.4} />
        <Line x1={1093} y1={380} x2={1093} y2={516} stroke={colours.fineStroke} strokeWidth={1.4} />
        <Path d="M 1118 372 L 1156 402 L 1156 494 L 1118 524 Z" fill="url(#twinScrewBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={1156} y={434} width={24} height={28} rx={3} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={1158} y={440} width={20} height={16} rx={2} fill="url(#twinScrewMaterial)" opacity={0.75} />
        {/* Melt thermocouple, then the transducer either side of the screen */}
        {[1052, 1080, 1106].map((x) => (
          <Rect
            key={`head-boss-${x}`}
            x={x - BOSS_HALF_WIDTH}
            y={348}
            width={BOSS_HALF_WIDTH * 2}
            height={x === 1052 ? 16 : 24}
            rx={2}
            fill={colours.machineDeep}
            stroke={colours.fineStroke}
            strokeWidth={1.2}
          />
        ))}
        {partLabel(1096, 556, 'SCREEN & DIE', 11, 1.8)}

        {/* Instrument pads. Every card attaches to one of these, and the trail
            layout reads the same list, so a connection can never point at a
            place the machine has no instrument.

            Three states, drawn as three different marks rather than three
            shades of one: empty is a hollow ring, wired is a filled pad, and a
            pad whose card is reporting carries a halo. Shape does the work, so
            the states survive greyscale and colour-blindness. */}
        {TWIN_SCREW_CONNECTORS.map((connector) => {
          const state = connectorState?.[connector.code] ?? 'idle';
          const wired = state !== 'idle';
          const live = state === 'live';
          return (
            <G key={connector.code}>
              {live && <Circle cx={connector.x} cy={connector.y} r={12} fill={colours.accent} opacity={0.16} />}
              <Circle cx={connector.x} cy={connector.y} r={9} fill={colours.accent} opacity={wired ? 0.18 : 0.08} />
              <Circle
                cx={connector.x}
                cy={connector.y}
                r={5}
                fill={wired ? colours.accent : colours.panel}
                stroke={wired ? colours.panel : colours.accent}
                strokeWidth={wired ? 1.4 : 1.6}
                opacity={wired ? 1 : 0.75}
              />
              {wired && <Circle cx={connector.x} cy={connector.y} r={2} fill="#ffffff" opacity={0.82} />}
            </G>
          );
        })}

        {/* Process out */}
        <Polygon points={`1184,${BARREL_AXIS_Y - 10} 1184,${BARREL_AXIS_Y + 10} 1198,${BARREL_AXIS_Y}`} fill={colours.accent} />
        <SvgText
          x={1108}
          y={648}
          fill={colours.muted}
          fontFamily="SpaceGrotesk_600SemiBold"
          fontSize={17}
          fontWeight="600"
          letterSpacing={4.5}
          textAnchor="middle"
        >
          EXTRUDATE
        </SvgText>
      </Svg>
    </View>
  );
}
