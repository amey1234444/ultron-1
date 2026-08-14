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
import { EXTRUDER_POINT_REGISTRY } from '../../../lib/extruderPoints';

type SingleScrewExtruderProps = {
  className?: string;
  style?: StyleProp<ViewStyle>;

  /**
   * Advance the screw flights along the barrel.
   * One full turn (360) shifts the flights by exactly one pitch.
   */
  screwRotation?: number;

  /**
   * Set true when the component needs its own panel.
   * Keep false when placing it on an existing machine canvas.
   */
  showBackground?: boolean;
};

/**
 * Same design canvas as the Rotary Airlock Valve so both machines share one
 * stage geometry — trail anchors are stored as fractions of this viewBox.
 */
export const EXTRUDER_VIEWBOX_WIDTH = 1200;
export const EXTRUDER_VIEWBOX_HEIGHT = 760;
const VIEWBOX_WIDTH = EXTRUDER_VIEWBOX_WIDTH;
const VIEWBOX_HEIGHT = EXTRUDER_VIEWBOX_HEIGHT;

/* Stage ------------------------------------------------------------------- */

const BARREL_AXIS_Y = 380;
const BARREL_LEFT = 478;
const BARREL_RIGHT = 1000;
const BARREL_TOP = 338;
const BARREL_BOTTOM = 422;

const BORE_LEFT = 492;
const BORE_RIGHT = 986;
const BORE_TOP = 350;
const BORE_BOTTOM = 410;
const BORE_CENTRE_Y = (BORE_TOP + BORE_BOTTOM) / 2;
const BORE_SPAN = BORE_RIGHT - BORE_LEFT;

const FLIGHT_PITCH = 46;
const FLIGHT_THICKNESS = 9;

/** Where the feed opening cuts down through the barrel wall. */
const THROAT_LEFT = 496;
const THROAT_RIGHT = 540;

/** Section boundaries along the screw, as fractions of the bore. */
const FEED_END = 0.34;
const METER_START = 0.72;

/**
 * The drive train sits on one line.
 *
 * Motor shaft, coupling and gearbox input share this centreline so the train
 * reads as connected rather than as three parts placed near each other.
 */
const DRIVE_AXIS_Y = 494;

/** Five heater bands clamped around the barrel. */
const HEATING_ZONES = [566, 646, 726, 806, 886];
const HEATING_ZONE_WIDTH = 34;
const HEATING_ZONE_OVERHANG = 13;
/** Rail the zone leads run up to. */
const WIRING_RAIL_Y = 296;
const ZONE_SENSOR_Y = WIRING_RAIL_Y - 6;

const MOTOR_FINS = Array.from({ length: 9 }, (_, index) => index);
const COWL_SLOTS = [0, 1, 2, 3, 4];
const SHAFT_SPLINES = [0, 1, 2, 3, 4, 5];
const GEARBOX_BOLTS = [
  [292, 308],
  [404, 308],
  [292, 580],
  [404, 580],
];

/**
 * Every point this machine can report, at the spot on the drawing where the
 * instrument physically sits.
 *
 * The default trail layout imports this list, so a card can never attach to a
 * place the artwork does not actually have an instrument — move a pad here and
 * the trail that lands on it moves with it.
 *
 * These are the ULTRON single-screw-extruder pilot tags, and the codes below
 * are the tag names the extruder analysis model reads (`lib/analysis/extruder`).
 * Two of them are easy to get wrong and are therefore worth stating:
 *
 * - **E1 is motor shaft speed**, not screw speed. The sensor is a
 *   one-pulse-per-revolution proximity switch on the motor *rear* shaft, so at
 *   the RD-001 screw speed of 100 rpm it reads 2000 rpm through the 20:1
 *   gearbox. Screw speed is derived from it.
 * - **V1 is on the motor housing and V2 on the gearbox housing.** The motor and
 *   gearbox mechanical hypotheses are separated by which channel carries the
 *   pattern, so the two pads are not interchangeable.
 */
export type ExtruderConnector = (typeof EXTRUDER_POINT_REGISTRY)[number];

export const EXTRUDER_CONNECTORS: readonly ExtruderConnector[] = EXTRUDER_POINT_REGISTRY;
/* Legacy point list retained below for historical context only.
const LEGACY_EXTRUDER_CONNECTORS: ExtruderConnector[] = [
  // Drive
  { code: 'E1', label: 'Motor Shaft Speed', side: 'left', x: 64, y: 494 },
  { code: 'PM1', label: 'Motor Current', side: 'left', x: 135, y: 429 },
  { code: 'V1', label: 'Motor Vibration', side: 'left', x: 198, y: 528 },
  { code: 'T4', label: 'Motor Temperature', side: 'left', x: 96, y: 522 },
  // Gear box — V2 on the housing, T5 at the oil sight glass
  { code: 'V2', label: 'Gearbox Vibration', side: 'left', x: 400, y: 356 },
  { code: 'T5', label: 'Gearbox Temperature', side: 'left', x: 348, y: 556 },
  // Feed
  { code: 'L1', label: 'Hopper Level', side: 'right', x: 518, y: 120 },
  // Barrel zones 1-3
  { code: 'T1', label: 'Barrel Zone 1 Temperature', side: 'right', x: 566, y: ZONE_SENSOR_Y },
  { code: 'T2', label: 'Barrel Zone 2 Temperature', side: 'right', x: 726, y: ZONE_SENSOR_Y },
  { code: 'T3', label: 'Barrel Zone 3 Temperature', side: 'right', x: 886, y: ZONE_SENSOR_Y },
  // Metering-zone melt pressure, lower side opposite zone 3
  { code: 'P1', label: 'Melt Pressure', side: 'right', x: 960, y: 428 },
]; */

const SCREW_FLIGHTS: number[] = [];
for (let x = BORE_LEFT - FLIGHT_PITCH; x < BORE_RIGHT + FLIGHT_PITCH; x += FLIGHT_PITCH) {
  SCREW_FLIGHTS.push(x);
}

/** Diagonal section hatching across the cut barrel wall. */
const HATCH_LINES: number[] = [];
for (let x = BARREL_LEFT - 60; x < BARREL_RIGHT + 60; x += 9) HATCH_LINES.push(x);

/**
 * Root radius along the screw.
 *
 * The channel is deep at the feed and shallow at the die: that closing volume
 * is what compresses the melt, so it is the one feature of a single screw that
 * has to be drawn correctly. Feed and metering sections are constant, the
 * compression section between them eases from one to the other.
 */
function rootHalfHeight(x: number): number {
  const t = (x - BORE_LEFT) / BORE_SPAN;
  const deep = 11;
  const shallow = 22;
  if (t <= FEED_END) return deep;
  if (t >= METER_START) return shallow;
  const k = (t - FEED_END) / (METER_START - FEED_END);
  return deep + (shallow - deep) * (k * k * (3 - 2 * k)); // smoothstep
}

/**
 * One flight of the helix, seen side-on.
 *
 * Projected onto the page a helix crest is a cosine, so it leaves the top of
 * the bore horizontally, falls steepest as it crosses the centreline, and
 * arrives at the bottom horizontally again. These control points reproduce that
 * curve — a symmetric bulge reads as a row of leaves rather than as a screw.
 * Half a turn advances half a pitch, which is why the band lands
 * `FLIGHT_PITCH / 2` downstream of where it started.
 */
function flightBand(x0: number, fromTop: boolean, thickness: number): string {
  const y1 = fromTop ? BORE_TOP : BORE_BOTTOM;
  const y2 = fromTop ? BORE_BOTTOM : BORE_TOP;
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
function flightCrest(x0: number): string {
  const half = FLIGHT_PITCH / 2;
  return (
    `M ${x0} ${BORE_TOP}` +
    ` C ${x0 + FLIGHT_PITCH * 0.19} ${BORE_TOP} ${x0 + FLIGHT_PITCH * 0.31} ${BORE_BOTTOM} ${x0 + half} ${BORE_BOTTOM}`
  );
}

/** The tapering root cylinder, sampled along its length. */
const ROOT_PATH = (() => {
  let top = '';
  let bottom = '';
  for (let x = BORE_LEFT - FLIGHT_PITCH; x <= BORE_RIGHT + FLIGHT_PITCH; x += 8) {
    const half = rootHalfHeight(x);
    top += `${top ? ' L' : 'M'} ${x} ${BORE_CENTRE_Y - half}`;
    bottom = ` L ${x} ${BORE_CENTRE_Y + half}` + bottom;
  }
  return `${top}${bottom} Z`;
})();

export function SingleScrewExtruder({
  className,
  style,
  screwRotation = 0,
  showBackground = false,
}: SingleScrewExtruderProps) {
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
    }),
    [isDark],
  );

  /**
   * The flights are clipped to the bore and spaced exactly one pitch apart, so
   * shifting them by one pitch is a seamless loop — 360° of screw rotation
   * moves material forward by one flight.
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
          <LinearGradient id="extruderBody" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colours.machineRaised} />
            <Stop offset="1" stopColor={colours.machine} />
          </LinearGradient>

          {/* Four stops, not two: a cylinder has a highlight band below its top
              edge and falls away to shadow underneath. */}
          <LinearGradient id="extruderBarrel" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colours.machine} />
            <Stop offset="0.16" stopColor={colours.machineRaised} />
            <Stop offset="0.55" stopColor={colours.machine} />
            <Stop offset="1" stopColor={colours.machineDeep} />
          </LinearGradient>

          <LinearGradient id="extruderBore" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={isDark ? '#07080B' : '#CFD0CE'} />
            <Stop offset="0.5" stopColor={isDark ? '#15181E' : '#F2F2F0'} />
            <Stop offset="1" stopColor={isDark ? '#07080B' : '#CFD0CE'} />
          </LinearGradient>

          <LinearGradient id="extruderMotor" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colours.machineRaised} />
            <Stop offset="0.5" stopColor={colours.machine} />
            <Stop offset="1" stopColor={colours.machineDeep} />
          </LinearGradient>

          <LinearGradient id="extruderRoot" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colours.screwDark} />
            <Stop offset="0.35" stopColor={colours.screwLit} />
            <Stop offset="1" stopColor={colours.screwDark} />
          </LinearGradient>

          <LinearGradient id="extruderMaterial" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={isDark ? '#C9A15C' : '#E0B76A'} />
            <Stop offset="1" stopColor={isDark ? '#8A6415' : '#B98A22'} />
          </LinearGradient>

          <LinearGradient id="extruderMelt" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#8A6415" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#C9A15C" stopOpacity={0.5} />
          </LinearGradient>

          <ClipPath id="extruderBoreClip">
            <Rect x={BORE_LEFT} y={BORE_TOP} width={BORE_SPAN} height={BORE_BOTTOM - BORE_TOP} rx={6} />
          </ClipPath>
          <ClipPath id="extruderWallTop">
            <Rect x={BARREL_LEFT} y={BARREL_TOP} width={BARREL_RIGHT - BARREL_LEFT} height={BORE_TOP - BARREL_TOP} />
          </ClipPath>
          <ClipPath id="extruderWallBottom">
            <Rect x={BARREL_LEFT} y={BORE_BOTTOM} width={BARREL_RIGHT - BARREL_LEFT} height={BARREL_BOTTOM - BORE_BOTTOM} />
          </ClipPath>
        </Defs>

        {showBackground && <Rect x={0} y={0} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill={colours.panel} />}

        {/* Process centreline through the barrel */}
        <Line
          x1={150}
          y1={BARREL_AXIS_Y}
          x2={1180}
          y2={BARREL_AXIS_Y}
          stroke={colours.fineStroke}
          strokeWidth={1}
          strokeDasharray="22 6 3 6"
          opacity={0.4}
        />

        {/* Process in */}
        <SvgText
          x={518}
          y={42}
          fill={colours.muted}
          fontFamily="SpaceGrotesk_600SemiBold"
          fontSize={18}
          fontWeight="600"
          letterSpacing={5}
          textAnchor="middle"
        >
          INLET / FEEDER
        </SvgText>
        <Polygon points="508,58 528,58 518,73" fill={colours.accent} />

        {/* --- Drive train, all on DRIVE_AXIS_Y ------------------------------ */}

        {/* Motor */}
        <Rect x={54} y={452} width={20} height={84} rx={6} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {COWL_SLOTS.map((index) => (
          <Line key={`cowl-${index}`} x1={58} y1={464 + index * 14} x2={70} y2={464 + index * 14} stroke={colours.fineStroke} strokeWidth={1.5} />
        ))}
        <Rect x={104} y={416} width={62} height={26} rx={4} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Line x1={135} y1={416} x2={135} y2={442} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={74} y={442} width={138} height={104} rx={16} fill="url(#extruderMotor)" stroke={colours.machineStroke} strokeWidth={2} />
        {MOTOR_FINS.map((index) => (
          <Line key={`fin-${index}`} x1={88} y1={456 + index * 10} x2={198} y2={456 + index * 10} stroke={colours.fineStroke} strokeWidth={1.5} />
        ))}
        <Rect x={120} y={480} width={46} height={28} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={80} y={546} width={126} height={14} rx={3} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={94} y={560} width={38} height={20} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Rect x={154} y={560} width={38} height={20} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Circle cx={113} cy={570} r={3} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={173} cy={570} r={3} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        {partLabel(143, 610, 'MOTOR')}

        {/* Motor shaft into the coupling, and the coupling into the gearbox —
            one continuous line of drive, not three parts placed near each
            other. */}
        <Rect x={212} y={DRIVE_AXIS_Y - 9} width={20} height={18} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={232} y={466} width={40} height={56} rx={6} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={238} y={478} width={14} height={32} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={254} y={478} width={14} height={32} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />

        {/* Gear box */}
        <Rect x={272} y={288} width={152} height={312} rx={14} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2.5} />
        <Rect x={286} y={302} width={124} height={284} rx={9} fill="none" stroke={colours.fineStroke} strokeWidth={1} />
        {/* Input shaft in at the drive axis, output shaft out at the barrel axis */}
        <Line x1={286} y1={DRIVE_AXIS_Y} x2={410} y2={DRIVE_AXIS_Y} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={286} y1={BARREL_AXIS_Y} x2={410} y2={BARREL_AXIS_Y} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={348} y1={BARREL_AXIS_Y} x2={348} y2={DRIVE_AXIS_Y} stroke={colours.fineStroke} strokeWidth={1} strokeDasharray="4 4" />
        <Circle cx={348} cy={BARREL_AXIS_Y} r={13} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Circle cx={348} cy={BARREL_AXIS_Y} r={5} fill={colours.machineRaised} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={348} cy={DRIVE_AXIS_Y} r={10} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={1.5} />
        {GEARBOX_BOLTS.map(([x, y]) => (
          <Circle key={`gearbox-bolt-${x}-${y}`} cx={x} cy={y} r={5.5} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        ))}
        <Rect x={300} y={320} width={96} height={24} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        {/* Oil sight glass */}
        <Circle cx={348} cy={556} r={12} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Circle cx={348} cy={556} r={6} fill={colours.accent} opacity={0.3} />
        {/* Breather */}
        <Rect x={332} y={268} width={32} height={22} rx={4} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {partLabel(348, 432, 'GEAR BOX')}

        {/* Output shaft, out of the gearbox on the barrel axis */}
        <Rect x={160} y={372} width={112} height={16} rx={3} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={186} y={362} width={18} height={36} rx={3} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {SHAFT_SPLINES.map((index) => (
          <Line key={`spline-${index}`} x1={212 + index * 10} y1={374} x2={212 + index * 10} y2={386} stroke={colours.fineStroke} strokeWidth={1} />
        ))}
        {partLabel(180, 344, 'OUTPUT SHAFT', 11, 1.6)}

        {/* Thrust housing — one block bridging the gearbox to the barrel, so
            the drive is visibly continuous into the screw. */}
        <Rect x={424} y={318} width={54} height={124} rx={5} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {[[436, 330], [466, 330], [436, 430], [466, 430]].map(([cx, cy]) => (
          <Circle key={`thrust-${cx}-${cy}`} cx={cx} cy={cy} r={3.5} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        ))}

        {/* --- Barrel -------------------------------------------------------- */}
        <Rect
          x={BARREL_LEFT}
          y={BARREL_TOP}
          width={BARREL_RIGHT - BARREL_LEFT}
          height={BARREL_BOTTOM - BARREL_TOP}
          rx={10}
          fill="url(#extruderBarrel)"
          stroke={colours.machineStroke}
          strokeWidth={2.5}
        />

        {/* Section hatching — the drawing convention for "cut through". */}
        {['extruderWallTop', 'extruderWallBottom'].map((clip) => (
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

        {/* Discharge flange */}
        <Rect
          x={BARREL_RIGHT}
          y={BARREL_TOP - 12}
          width={22}
          height={BARREL_BOTTOM - BARREL_TOP + 24}
          rx={4}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />
        {[BARREL_TOP - 4, BARREL_AXIS_Y, BARREL_BOTTOM + 4].map((cy) => (
          <Circle key={`flange-bolt-${cy}`} cx={BARREL_RIGHT + 11} cy={cy} r={3.5} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        ))}

        {/* Feed opening cut through the barrel wall */}
        <Rect x={THROAT_LEFT} y={BARREL_TOP} width={THROAT_RIGHT - THROAT_LEFT} height={BORE_TOP - BARREL_TOP} fill={colours.machineDeep} />
        <Rect
          x={THROAT_LEFT + 3}
          y={BARREL_TOP}
          width={THROAT_RIGHT - THROAT_LEFT - 6}
          height={BORE_TOP - BARREL_TOP}
          fill="url(#extruderMaterial)"
          opacity={0.8}
        />
        <Line x1={THROAT_LEFT} y1={BARREL_TOP} x2={THROAT_LEFT} y2={BORE_TOP} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={THROAT_RIGHT} y1={BARREL_TOP} x2={THROAT_RIGHT} y2={BORE_TOP} stroke={colours.fineStroke} strokeWidth={1} />

        {/* Melt pressure transducer boss, in the wall ahead of the breaker plate */}
        <Rect x={952} y={BARREL_BOTTOM} width={16} height={12} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={1.5} />

        {/* Heater bands and their leads */}
        <Line x1={560} y1={WIRING_RAIL_Y} x2={892} y2={WIRING_RAIL_Y} stroke={colours.fineStroke} strokeWidth={1} />
        {HEATING_ZONES.map((centre, index) => (
          <G key={`zone-${centre}`}>
            <Rect
              x={centre - HEATING_ZONE_WIDTH / 2}
              y={BARREL_TOP - HEATING_ZONE_OVERHANG}
              width={HEATING_ZONE_WIDTH}
              height={HEATING_ZONE_OVERHANG}
              rx={2}
              fill="url(#extruderBody)"
              stroke={colours.machineStroke}
              strokeWidth={1.5}
            />
            <Rect
              x={centre - HEATING_ZONE_WIDTH / 2}
              y={BARREL_BOTTOM}
              width={HEATING_ZONE_WIDTH}
              height={HEATING_ZONE_OVERHANG}
              rx={2}
              fill="url(#extruderBody)"
              stroke={colours.machineStroke}
              strokeWidth={1.5}
            />
            {[
              [-11, BARREL_TOP - 6.5],
              [11, BARREL_TOP - 6.5],
              [-11, BARREL_BOTTOM + 6.5],
              [11, BARREL_BOTTOM + 6.5],
            ].map(([dx, cy]) => (
              <Circle key={`${centre}-${dx}-${cy}`} cx={centre + dx} cy={cy} r={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={0.8} />
            ))}
            <Rect x={centre - 5} y={BARREL_TOP - 25} width={10} height={12} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
            <Line x1={centre} y1={BARREL_TOP - 25} x2={centre} y2={WIRING_RAIL_Y} stroke={colours.fineStroke} strokeWidth={1} />
            {partLabel(centre, 452, `Z${index + 1}`, 10.5, 1.2)}
          </G>
        ))}
        {partLabel(726, 262, 'HEATING', 13, 2)}

        {/* Bore cut-away. The accent marks the process channel, the way the
            Rotary Airlock Valve outlines its rotor. */}
        <Rect
          x={BORE_LEFT}
          y={BORE_TOP}
          width={BORE_SPAN}
          height={BORE_BOTTOM - BORE_TOP}
          rx={6}
          fill="url(#extruderBore)"
          stroke={colours.accent}
          strokeWidth={1.3}
          strokeOpacity={0.55}
        />

        <G clipPath="url(#extruderBoreClip)">
          {/* Melt only where there is melt — ahead of the compression section. */}
          <Rect
            x={BORE_LEFT + BORE_SPAN * 0.58}
            y={BORE_TOP}
            width={BORE_SPAN * 0.42}
            height={BORE_BOTTOM - BORE_TOP}
            fill="url(#extruderMelt)"
          />

          {/* Back half of the helix, drawn first. Seeing the far flights behind
              the root is what makes the screw read as round rather than flat. */}
          {SCREW_FLIGHTS.map((x) => (
            <Path
              key={`back-flight-${x}`}
              d={flightBand(x + flightOffset + FLIGHT_PITCH / 2, false, FLIGHT_THICKNESS)}
              fill={colours.screwDark}
              stroke={colours.screwDark}
              strokeWidth={1}
            />
          ))}

          <Path d={ROOT_PATH} fill="url(#extruderRoot)" stroke={colours.fineStroke} strokeWidth={1} />

          {SCREW_FLIGHTS.map((x) => (
            <G key={`flight-${x}`}>
              <Path d={flightBand(x + flightOffset, true, FLIGHT_THICKNESS)} fill={colours.screw} stroke={colours.machineStroke} strokeWidth={1} />
              <Path
                d={flightCrest(x + flightOffset)}
                fill="none"
                stroke={isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.8)'}
                strokeWidth={1.2}
              />
              <Path d={flightCrest(x + flightOffset + FLIGHT_THICKNESS)} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={1} />
            </G>
          ))}
        </G>
        {partLabel(520, 490, 'BARREL', 13, 2)}
        {partLabel(880, 490, 'SCREW', 13, 2)}

        {/* Feeder */}
        <Rect x={452} y={66} width={132} height={18} rx={9} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={458} y={84} width={120} height={112} rx={4} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Path d="M 458 196 L 578 196 L 540 252 L 496 252 Z" fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={496} y={252} width={44} height={74} rx={3} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {/* Mounting flange onto the barrel */}
        <Rect x={488} y={326} width={60} height={12} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Path d="M 466 138 Q 518 122 570 138 L 570 194 L 536 250 L 500 250 L 466 194 Z" fill="url(#extruderMaterial)" opacity={0.85} />
        <Rect x={502} y={252} width={32} height={74} fill="url(#extruderMaterial)" opacity={0.7} />
        {partLabel(602, 150, 'FEEDER', 13, 2, 'start')}

        {/* Die */}
        <Path
          d="M 1022 326 L 1072 350 L 1096 364 L 1132 364 L 1132 396 L 1096 396 L 1072 410 L 1022 434 Z"
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />
        {/* Breaker plate and screen pack */}
        <Line x1={1040} y1={338} x2={1040} y2={422} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={1048} y1={342} x2={1048} y2={418} stroke={colours.fineStroke} strokeWidth={1} />
        {/* The die is heated too */}
        <Rect x={1074} y={360} width={12} height={12} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Rect x={1074} y={390} width={12} height={12} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Line x1={1080} y1={360} x2={1080} y2={306} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={1132} y={360} width={20} height={40} rx={4} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={1134} y={372} width={16} height={16} rx={2} fill="url(#extruderMaterial)" opacity={0.75} />
        {partLabel(1076, 452, 'DIE', 13, 2)}

        {/* Instrument pads. Every card attaches to one of these, and the trail
            layout reads the same list, so a connection can never point at a
            place the machine has no instrument. */}
        {EXTRUDER_CONNECTORS.map((connector) => (
          <G key={connector.code}>
            <Circle cx={connector.x} cy={connector.y} r={9} fill={colours.accent} opacity={0.14} />
            <Circle cx={connector.x} cy={connector.y} r={5} fill={colours.accent} stroke={colours.panel} strokeWidth={1.4} />
            <Circle cx={connector.x} cy={connector.y} r={2} fill="#ffffff" opacity={0.82} />
          </G>
        ))}

        {/* Process out */}
        <Polygon points={`1164,${BARREL_AXIS_Y - 10} 1164,${BARREL_AXIS_Y + 10} 1184,${BARREL_AXIS_Y}`} fill={colours.accent} />
        <SvgText
          x={1064}
          y={552}
          fill={colours.muted}
          fontFamily="SpaceGrotesk_600SemiBold"
          fontSize={18}
          fontWeight="600"
          letterSpacing={5}
          textAnchor="middle"
        >
          EXTRUDATE
        </SvgText>
      </Svg>
    </View>
  );
}
