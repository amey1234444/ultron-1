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
const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 760;

/* Stage ------------------------------------------------------------------- */

const BARREL_AXIS_Y = 380;
const BARREL_LEFT = 436;
const BARREL_RIGHT = 1000;
const BARREL_TOP = 338;
const BARREL_BOTTOM = 422;

const BORE_LEFT = 450;
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

/** Five heater bands clamped around the barrel. */
const HEATING_ZONES = [566, 646, 726, 806, 886];
const HEATING_ZONE_WIDTH = 34;
const HEATING_ZONE_OVERHANG = 13;
/** Rail the zone leads run up to. */
const WIRING_RAIL_Y = 296;

const MOTOR_FINS = Array.from({ length: 9 }, (_, index) => index);
const COWL_SLOTS = [0, 1, 2, 3, 4];
const SHAFT_SPLINES = [0, 1, 2, 3, 4, 5];
const GEARBOX_BOLTS = [
  [292, 308],
  [404, 308],
  [292, 580],
  [404, 580],
];

const SCREW_FLIGHTS: number[] = [];
for (let x = BORE_LEFT - FLIGHT_PITCH; x < BORE_RIGHT + FLIGHT_PITCH; x += FLIGHT_PITCH) {
  SCREW_FLIGHTS.push(x);
}

/** Diagonal section hatching across the cut barrel wall. */
const HATCH_LINES: number[] = [];
for (let x = BARREL_LEFT - 60; x < BARREL_RIGHT + 60; x += 9) HATCH_LINES.push(x);

const SECTION_Y = 502;
const SECTION_BOUNDS = [
  BORE_LEFT,
  BORE_LEFT + BORE_SPAN * FEED_END,
  BORE_LEFT + BORE_SPAN * METER_START,
  BORE_RIGHT,
];
const SECTION_LABELS = ['FEED', 'COMPRESSION', 'METERING'];

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

  const partLabel = (x: number, y: number, label: string, size = 13, letterSpacing = 2, anchor: 'start' | 'middle' = 'middle') => (
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

        {/* Machine centreline, the way an elevation drawing carries one. */}
        <Line
          x1={120}
          y1={BARREL_AXIS_Y}
          x2={1180}
          y2={BARREL_AXIS_Y}
          stroke={colours.fineStroke}
          strokeWidth={1}
          strokeDasharray="22 6 3 6"
          opacity={0.45}
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

        {/* Motor */}
        <Rect x={56} y={470} width={20} height={88} rx={6} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {COWL_SLOTS.map((index) => (
          <Line key={`cowl-${index}`} x1={60} y1={482 + index * 14} x2={72} y2={482 + index * 14} stroke={colours.fineStroke} strokeWidth={1.5} />
        ))}
        <Rect x={104} y={438} width={62} height={26} rx={4} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Line x1={135} y1={438} x2={135} y2={464} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={74} y={462} width={138} height={104} rx={16} fill="url(#extruderMotor)" stroke={colours.machineStroke} strokeWidth={2} />
        {MOTOR_FINS.map((index) => (
          <Line key={`fin-${index}`} x1={88} y1={476 + index * 10} x2={198} y2={476 + index * 10} stroke={colours.fineStroke} strokeWidth={1.5} />
        ))}
        <Rect x={120} y={500} width={46} height={28} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={80} y={566} width={126} height={14} rx={3} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={94} y={580} width={38} height={20} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Rect x={154} y={580} width={38} height={20} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Circle cx={113} cy={590} r={3} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={173} cy={590} r={3} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={212} y={505} width={30} height={18} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        {partLabel(143, 626, 'MOTOR')}

        {/* Coupling */}
        <Rect x={238} y={486} width={40} height={56} rx={6} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={244} y={498} width={12} height={32} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={260} y={498} width={12} height={32} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={258} y1={494} x2={258} y2={534} stroke={colours.fineStroke} strokeWidth={1} />

        {/* Gear box */}
        <Rect x={272} y={288} width={152} height={312} rx={14} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2.5} />
        <Rect x={286} y={302} width={124} height={284} rx={9} fill="none" stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={286} y1={380} x2={410} y2={380} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={286} y1={494} x2={410} y2={494} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={348} cy={380} r={13} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Circle cx={348} cy={380} r={5} fill={colours.machineRaised} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={348} cy={494} r={10} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={1.5} />
        {GEARBOX_BOLTS.map(([x, y]) => (
          <Circle key={`gearbox-bolt-${x}-${y}`} cx={x} cy={y} r={5.5} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        ))}
        <Rect x={300} y={320} width={96} height={24} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        {/* Oil sight glass */}
        <Circle cx={348} cy={556} r={12} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Circle cx={348} cy={556} r={6} fill={colours.accent} opacity={0.35} />
        {/* Breather */}
        <Rect x={332} y={268} width={32} height={22} rx={4} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {partLabel(348, 440, 'GEAR BOX')}

        {/* Output shaft */}
        <Rect x={160} y={372} width={112} height={16} rx={3} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Rect x={186} y={362} width={18} height={36} rx={3} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {SHAFT_SPLINES.map((index) => (
          <Line key={`spline-${index}`} x1={212 + index * 10} y1={374} x2={212 + index * 10} y2={386} stroke={colours.fineStroke} strokeWidth={1} />
        ))}
        {partLabel(180, 344, 'OUTPUT SHAFT', 11, 1.6)}

        {/* Thrust bearing housing */}
        <Rect x={418} y={322} width={22} height={116} rx={4} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Circle cx={429} cy={338} r={3.5} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={429} cy={422} r={3.5} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />

        {/* Barrel */}
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

        {/* End flanges with bolt circles */}
        {[BARREL_LEFT - 12, BARREL_RIGHT - 10].map((fx) => (
          <G key={`flange-${fx}`}>
            <Rect
              x={fx}
              y={BARREL_TOP - 12}
              width={22}
              height={BARREL_BOTTOM - BARREL_TOP + 24}
              rx={4}
              fill="url(#extruderBody)"
              stroke={colours.machineStroke}
              strokeWidth={2}
            />
            {[BARREL_TOP - 4, BARREL_AXIS_Y, BARREL_BOTTOM + 4].map((cy) => (
              <Circle key={`${fx}-${cy}`} cx={fx + 11} cy={cy} r={3.5} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
            ))}
          </G>
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

        {/* Heater bands, their leads, and the thermocouple each zone reports */}
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
            <Circle cx={centre} cy={WIRING_RAIL_Y - 6} r={3.5} fill={colours.panel} stroke={colours.accent} strokeWidth={1.5} />
            {partLabel(centre, 452, `Z${index + 1}`, 10.5, 1.2)}
          </G>
        ))}
        {partLabel(726, 272, 'HEATING ZONES', 11, 2)}

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
        {partLabel(945, 326, 'BARREL', 11, 1.6)}

        {/* Screw sections: what the tapering root above is actually doing. */}
        {SECTION_LABELS.map((label, index) => {
          const a = SECTION_BOUNDS[index];
          const b = SECTION_BOUNDS[index + 1];
          return (
            <G key={label}>
              <Line x1={a} y1={SECTION_Y} x2={b} y2={SECTION_Y} stroke={colours.fineStroke} strokeWidth={1} />
              <Line x1={a} y1={SECTION_Y - 5} x2={a} y2={SECTION_Y + 5} stroke={colours.fineStroke} strokeWidth={1} />
              <Line x1={b} y1={SECTION_Y - 5} x2={b} y2={SECTION_Y + 5} stroke={colours.fineStroke} strokeWidth={1} />
              {partLabel((a + b) / 2, SECTION_Y + 20, label, 10.5, 1.6)}
            </G>
          );
        })}
        {partLabel(BORE_RIGHT + 20, SECTION_Y + 4, 'SCREW', 12, 2, 'start')}

        {/* Feeder */}
        <Rect x={452} y={66} width={132} height={26} rx={12} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={458} y={84} width={120} height={112} rx={4} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Path d="M 458 196 L 578 196 L 540 258 L 496 258 Z" fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={496} y={252} width={44} height={90} rx={3} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        {/* Mounting flange onto the barrel */}
        <Rect x={488} y={330} width={60} height={12} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={2} />
        <Path d="M 466 138 Q 518 122 570 138 L 570 194 L 536 254 L 500 254 L 466 194 Z" fill="url(#extruderMaterial)" opacity={0.85} />
        <Rect x={502} y={252} width={32} height={80} fill="url(#extruderMaterial)" opacity={0.7} />
        {/* Level sight window */}
        <Rect x={566} y={104} width={8} height={74} rx={2} fill={colours.machineDeep} stroke={colours.fineStroke} strokeWidth={1} />
        {partLabel(592, 150, 'FEEDER', 11, 1.6, 'start')}

        {/* Die */}
        <Path
          d={`M ${BARREL_RIGHT + 12} ${BARREL_TOP - 12} L 1062 350 L 1086 364 L 1122 364 L 1122 396 L 1086 396 L 1062 410 L ${BARREL_RIGHT + 12} ${BARREL_BOTTOM + 12} Z`}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />
        {/* Breaker plate and screen pack */}
        <Line x1={1030} y1={344} x2={1030} y2={416} stroke={colours.fineStroke} strokeWidth={1} />
        <Line x1={1038} y1={346} x2={1038} y2={414} stroke={colours.fineStroke} strokeWidth={1} />
        {/* The die is heated too, and reports its own temperature */}
        <Rect x={1064} y={338} width={12} height={12} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Rect x={1064} y={410} width={12} height={12} rx={2} fill="url(#extruderBody)" stroke={colours.machineStroke} strokeWidth={1.5} />
        <Line x1={1070} y1={338} x2={1070} y2={306} stroke={colours.fineStroke} strokeWidth={1} />
        <Circle cx={1070} cy={300} r={3.5} fill={colours.panel} stroke={colours.accent} strokeWidth={1.5} />
        <Rect x={1120} y={360} width={20} height={40} rx={4} fill={colours.machineDeep} stroke={colours.machineStroke} strokeWidth={2} />
        <Rect x={1122} y={372} width={16} height={16} rx={2} fill="url(#extruderMaterial)" opacity={0.75} />
        {partLabel(1080, 452, 'DIE', 11, 1.6)}

        {/* Process out */}
        <Polygon points={`1152,${BARREL_AXIS_Y - 10} 1152,${BARREL_AXIS_Y + 10} 1172,${BARREL_AXIS_Y}`} fill={colours.accent} />
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
