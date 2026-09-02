import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_POINT_REGISTRY,
} from '../../../lib/twinScrewExtruderPoints';

type TwinScrewExtruderProps = {
  className?: string;
  style?: StyleProp<ViewStyle>;

  /**
   * How each connection point is currently wired, keyed by point code.
   *
   * Every point renders as the same green dot whatever its state — this layer
   * draws the machine and its connection points and nothing else. A point whose
   * channel is reporting gains a brighter ring; the trail and its card, drawn by
   * the board above this component, carry the rest of the wiring story.
   */
  connectorState?: Record<string, 'idle' | 'linked' | 'live'>;

  /**
   * Advance the screw flights along the barrel.
   * One full turn (360) shifts both screws by exactly one pitch.
   */
  screwRotation?: number;

  /**
   * Draw the panel and the engineering grid.
   *
   * Left false on the machine canvas: the workspace already paints its own grid
   * behind the stage, and a second grid inside the artwork would beat against
   * it. Set true when the drawing is shown on its own.
   */
  showBackground?: boolean;
};

/* Stage -------------------------------------------------------------------- */

export const TWIN_SCREW_VIEWBOX_WIDTH = TWIN_SCREW_ARTWORK_WIDTH;
export const TWIN_SCREW_VIEWBOX_HEIGHT = TWIN_SCREW_ARTWORK_HEIGHT;
const VIEWBOX_WIDTH = TWIN_SCREW_VIEWBOX_WIDTH;
const VIEWBOX_HEIGHT = TWIN_SCREW_VIEWBOX_HEIGHT;

/**
 * The screw envelope, declared once and shared by both screws.
 *
 * Both shafts start at `SCREW_START_X`, end at `SCREW_END_X`, and use the same
 * pitch, flight size and shaft diameter. Nothing downstream may scale, shorten
 * or re-space one screw independently of the other — that is exactly the defect
 * a raster illustration produces, and the reason this drawing is deterministic
 * geometry rather than an image.
 */
const SCREW_START_X = 640;
const SCREW_END_X = 1322;
const SCREW_PITCH = 38;
/**
 * Flight size and lean.
 *
 * A flight seen side-on is an ellipse leaning by the helix angle. The lean is
 * what decides both readings that matter, and both were checked rather than
 * guessed: at this size and tilt the ellipse projects 26.7 tall, so the two
 * screws 46 apart overlap by 7.4 and genuinely intermesh; and it projects 30.8
 * wide against a 38 pitch, so consecutive flights stay 7.2 apart instead of
 * merging into one continuous rope. Change any of the three and re-check both.
 */
const FLIGHT_RX = 7;
const FLIGHT_RY = 30;
const FLIGHT_TILT = 28;
const SHAFT_HALF_HEIGHT = 12;

/** The two centrelines. They stay parallel; only phase and helix hand differ. */
const SCREW_1_Y = 448;
const SCREW_2_Y = 494;
/** Half a pitch, so the two helices interlock rather than mirror each other. */
const SCREW_2_PHASE = SCREW_PITCH / 2;

/** One shared barrel window — neither screw may escape it. */
const BARREL_CLIP = { x: 638, y: 417, width: 686, height: 108 };

/** Clamped heater / cooling shells along the barrel. */
const TOP_SHELL_COUNT = 11;
const BOTTOM_SHELL_COUNT = 11;

const MOTOR_FIN_COUNT = 13;

const GRID_MINOR = 32;
const GRID_MAJOR = 160;

const FLIGHT_OFFSETS: number[] = [];
for (let x = SCREW_START_X - SCREW_PITCH; x < SCREW_END_X + SCREW_PITCH; x += SCREW_PITCH) {
  FLIGHT_OFFSETS.push(x);
}

/**
 * Every point this machine can report, at the spot on the drawing where the
 * instrument physically sits.
 *
 * The canvas snaps trail endpoints to this list and the default trail layout
 * places its cards from it, so a card can never attach to a place the artwork
 * does not actually have an instrument.
 */
export type TwinScrewConnector = (typeof TWIN_SCREW_POINT_REGISTRY)[number];

export const TWIN_SCREW_CONNECTORS: readonly TwinScrewConnector[] = TWIN_SCREW_POINT_REGISTRY;

export function TwinScrewExtruder({
  className,
  style,
  screwRotation = 0,
  showBackground = false,
  connectorState,
}: TwinScrewExtruderProps) {
  const { isDark } = useAppTheme();

  // Light values are the technical-drawing palette the template targets; the
  // dark column is the same drawing on the console's dark surface.
  const c = useMemo(
    () => ({
      panel: isDark ? '#111318' : '#f7f8f8',
      gridMinor: isDark ? '#1B1F26' : '#e7e9eb',
      gridMajor: isDark ? '#242932' : '#d8dcdf',
      stroke: isDark ? '#767C85' : '#686e72',
      strokeSoft: isDark ? '#5A606A' : '#7b8185',
      fin: isDark ? '#565C64' : '#697075',
      fill: isDark ? '#1D2128' : '#e5e7e8',
      fillDeep: isDark ? '#14171D' : '#d9dcdd',
      fillSoft: isDark ? '#22262E' : '#e8eaea',
      fillSofter: isDark ? '#1A1E25' : '#e0e3e4',
      glass: isDark ? '#0E1116' : '#f4f5f5',
      accent: '#16c84a',
      accentEdge: isDark ? '#0B2915' : '#123b1f',
      brass: isDark ? '#A8863F' : '#c9a451',
      brassEdge: isDark ? '#6B5527' : '#8a733b',
      metal: isDark
        ? ['#2A2F38', '#1B1F26', '#333944', '#12151A']
        : ['#f3f4f4', '#d5d8da', '#fafafa', '#b7bcc0'],
      darkMetal: isDark ? ['#242932', '#39404B', '#171B21'] : ['#9ca2a6', '#e1e3e4', '#7e858a'],
      shaft: isDark ? ['#2E343D', '#4A515B', '#171B21'] : ['#f2f3f3', '#aeb4b7', '#737a7f'],
      flight: isDark
        ? ['#3A414B', '#5D6470', '#2C323A', '#15181D']
        : ['#747b80', '#eceeef', '#9ca2a6', '#555b60'],
      flightStroke: isDark ? '#7A818B' : '#51575c',
      shaftStroke: isDark ? '#8A919B' : '#74797e',
    }),
    [isDark],
  );

  /**
   * Flights are clipped to the barrel and spaced exactly one pitch apart, so
   * shifting them by one pitch is a seamless loop. Both screws take the same
   * offset — they are driven by the same gearbox.
   */
  const flightOffset = ((((screwRotation % 360) + 360) % 360) / 360) * SCREW_PITCH;

  /**
   * One screw.
   *
   * Length, pitch, shaft diameter and flight size all come from the shared
   * constants above; only the helix hand and the phase are per-screw arguments.
   */
  const screw = (axisY: number, reverse: boolean, phase: number) => (
    <G>
      <Rect
        x={SCREW_START_X}
        y={axisY - SHAFT_HALF_HEIGHT}
        width={SCREW_END_X - SCREW_START_X}
        height={SHAFT_HALF_HEIGHT * 2}
        rx={SHAFT_HALF_HEIGHT}
        fill="url(#twinShaftGradient)"
        stroke={c.shaftStroke}
        strokeWidth={1.5}
      />

      {FLIGHT_OFFSETS.map((base) => {
        const x = base + phase + flightOffset;
        return (
          <Ellipse
            key={`flight-${axisY}-${base}`}
            cx={x}
            cy={axisY}
            rx={FLIGHT_RX}
            ry={FLIGHT_RY}
            // A `rotate(deg cx cy)` string rather than `rotation`/`originX`:
            // the latter pair emits a kebab-case `transform-origin`, which
            // react-dom rejects when this drawing is server-rendered.
            transform={`rotate(${reverse ? FLIGHT_TILT : -FLIGHT_TILT} ${x} ${axisY})`}
            fill="url(#twinFlightGradient)"
            stroke={c.flightStroke}
            strokeWidth={1.6}
          />
        );
      })}

      <Line
        x1={SCREW_START_X + 4}
        y1={axisY - 3}
        x2={SCREW_END_X - 4}
        y2={axisY - 3}
        stroke={isDark ? '#AEB6C2' : '#ffffff'}
        strokeOpacity={0.45}
        strokeWidth={2}
      />
    </G>
  );

  const gridLines = () => {
    const lines = [];
    for (let x = GRID_MINOR; x < VIEWBOX_WIDTH; x += GRID_MINOR) {
      const major = x % GRID_MAJOR === 0;
      lines.push(
        <Line
          key={`gx-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={VIEWBOX_HEIGHT}
          stroke={major ? c.gridMajor : c.gridMinor}
          strokeWidth={major ? 1.2 : 1}
        />,
      );
    }
    for (let y = GRID_MINOR; y < VIEWBOX_HEIGHT; y += GRID_MINOR) {
      const major = y % GRID_MAJOR === 0;
      lines.push(
        <Line
          key={`gy-${y}`}
          x1={0}
          y1={y}
          x2={VIEWBOX_WIDTH}
          y2={y}
          stroke={major ? c.gridMajor : c.gridMinor}
          strokeWidth={major ? 1.2 : 1}
        />,
      );
    }
    return lines;
  };

  return (
    <View
      className={cn('w-full overflow-hidden', showBackground && 'rounded-2xl', className)}
      style={[
        {
          aspectRatio: VIEWBOX_WIDTH / VIEWBOX_HEIGHT,
          backgroundColor: showBackground ? c.panel : 'transparent',
        },
        style,
      ]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          <LinearGradient id="twinMetal" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={c.metal[0]} />
            <Stop offset="0.35" stopColor={c.metal[1]} />
            <Stop offset="0.6" stopColor={c.metal[2]} />
            <Stop offset="1" stopColor={c.metal[3]} />
          </LinearGradient>

          <LinearGradient id="twinDarkMetal" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={c.darkMetal[0]} />
            <Stop offset="0.5" stopColor={c.darkMetal[1]} />
            <Stop offset="1" stopColor={c.darkMetal[2]} />
          </LinearGradient>

          <LinearGradient id="twinShaftGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.shaft[0]} />
            <Stop offset="0.45" stopColor={c.shaft[1]} />
            <Stop offset="1" stopColor={c.shaft[2]} />
          </LinearGradient>

          <LinearGradient id="twinFlightGradient" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={c.flight[0]} />
            <Stop offset="0.45" stopColor={c.flight[1]} />
            <Stop offset="0.7" stopColor={c.flight[2]} />
            <Stop offset="1" stopColor={c.flight[3]} />
          </LinearGradient>

          {/* Both screws are clipped by this one rect. */}
          <ClipPath id="twinScrewBarrelClip">
            <Rect x={BARREL_CLIP.x} y={BARREL_CLIP.y} width={BARREL_CLIP.width} height={BARREL_CLIP.height} rx={3} />
          </ClipPath>
        </Defs>

        {showBackground && (
          <G>
            <Rect x={0} y={0} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill={c.panel} />
            {gridLines()}
          </G>
        )}

        {/* ================= MOTOR ================= */}
        <G>
          <Rect x={83} y={405} width={220} height={135} rx={50} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
          {Array.from({ length: MOTOR_FIN_COUNT }).map((_, i) => (
            <Line key={`fin-${i}`} x1={115} x2={270} y1={418 + i * 8} y2={418 + i * 8} stroke={c.fin} strokeWidth={3} />
          ))}
          {/* terminal box */}
          <Rect x={160} y={354} width={95} height={52} rx={6} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          {/* Drive-end bearing bracket, then the shaft over it. The bracket is
              what the drive-end accelerometer is mounted on. */}
          <Rect x={290} y={426} width={34} height={38} rx={5} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          {/* motor shaft */}
          <Rect x={295} y={448} width={85} height={28} rx={10} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          {/* base */}
          <Rect x={104} y={540} width={176} height={31} rx={2} fill="url(#twinMetal)" stroke={c.strokeSoft} strokeWidth={2} />
          <Rect x={78} y={569} width={225} height={27} rx={3} fill={c.fill} stroke={c.strokeSoft} strokeWidth={2} />
        </G>

        {/* ================= COUPLING ================= */}
        <G>
          <Rect x={355} y={436} width={34} height={52} rx={10} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={386} y={430} width={36} height={64} rx={8} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
        </G>

        {/* ================= GEARBOX ================= */}
        <G>
          {/* Input bearing cover, bridging the coupling into the case. It is
              what the input-side accelerometer is bolted to. */}
          <Rect x={370} y={356} width={62} height={44} rx={6} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />

          <Path
            d="M425 330 Q425 310 445 310 H552 Q570 310 570 330 V548 H425 Z"
            fill={c.fill}
            stroke={c.strokeSoft}
            strokeWidth={2}
          />
          <Rect x={454} y={355} width={82} height={155} rx={6} fill={c.fillDeep} stroke={c.strokeSoft} strokeWidth={1} />
          <Circle cx={495} cy={428} r={11} fill={c.glass} stroke={c.strokeSoft} strokeWidth={2} />
          <Circle cx={495} cy={486} r={11} fill={c.glass} stroke={c.strokeSoft} strokeWidth={2} />
          {/* Oil-temperature boss, ringed by the lifting eye. The boss is
              filled so the temperature point has metal under it rather than
              the hollow centre of the eye. */}
          <Circle cx={470} cy={300} r={10} fill="url(#twinMetal)" stroke={c.strokeSoft} strokeWidth={1.5} />
          <Circle cx={470} cy={300} r={14} fill="none" stroke={c.stroke} strokeWidth={5} />

          {/* output housing, then the twin-shaft thrust block */}
          <Rect x={568} y={366} width={62} height={170} rx={7} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={620} y={400} width={34} height={118} rx={5} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />

          {/* base */}
          <Rect x={407} y={547} width={190} height={27} fill={c.fillDeep} stroke={c.strokeSoft} strokeWidth={2} />
          <Rect x={390} y={572} width={225} height={25} fill={c.fill} stroke={c.strokeSoft} strokeWidth={2} />
        </G>

        {/* ================= MAIN HOPPER ================= */}
        <G>
          <Rect x={652} y={105} width={153} height={18} rx={5} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Path d="M660 123 H797 V205 H660 Z" fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Path d="M660 205 H797 L758 321 H697 Z" fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          {/* throat */}
          <Rect x={700} y={319} width={55} height={98} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={688} y={312} width={78} height={15} rx={3} fill={c.fillDeep} stroke={c.stroke} strokeWidth={2} />
          {/* feed-throat thermocouple boss on the upstream shoulder */}
          <Rect x={672} y={352} width={32} height={28} rx={3} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
        </G>

        {/* ================= BARREL ================= */}
        <G>
          <Rect x={638} y={397} width={690} height={145} rx={5} fill={c.fillDeep} stroke={c.stroke} strokeWidth={2} />
          <Rect x={645} y={415} width={675} height={112} rx={3} fill={c.glass} stroke={c.strokeSoft} strokeWidth={1.5} />

          {Array.from({ length: TOP_SHELL_COUNT }).map((_, i) => (
            <Rect
              key={`shell-top-${i}`}
              x={686 + i * 59}
              y={386}
              width={47}
              height={25}
              rx={3}
              fill={c.fillSoft}
              stroke={c.strokeSoft}
              strokeWidth={1.3}
            />
          ))}

          {Array.from({ length: BOTTOM_SHELL_COUNT }).map((_, i) => (
            <Rect
              key={`shell-bottom-${i}`}
              x={665 + i * 57}
              y={531}
              width={47}
              height={26}
              rx={2}
              fill={c.fillSofter}
              stroke={c.strokeSoft}
              strokeWidth={1.3}
            />
          ))}
        </G>

        {/* ================= TWIN SCREWS ================= */}
        <G clipPath="url(#twinScrewBarrelClip)">
          {screw(SCREW_1_Y, false, 0)}
          {screw(SCREW_2_Y, true, SCREW_2_PHASE)}
        </G>

        <Line x1={640} y1={471} x2={1320} y2={471} stroke={c.flightStroke} strokeOpacity={0.32} strokeWidth={1} />

        {/* ================= SIDE FEEDER ================= */}
        <G>
          <Path d="M943 290 H995 L982 330 H955 Z" fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={954} y={328} width={33} height={61} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={938} y={384} width={67} height={21} rx={3} fill={c.fillDeep} stroke={c.stroke} strokeWidth={2} />
        </G>

        {/* ================= VENT ================= */}
        <G>
          <Rect x={1220} y={335} width={38} height={62} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={1214} y={326} width={50} height={14} rx={3} fill={c.fillDeep} stroke={c.stroke} strokeWidth={2} />
          <Rect x={1227} y={286} width={24} height={42} rx={6} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
        </G>

        {/* ================= DIE / OUTPUT ================= */}
        <G>
          <Rect x={1320} y={403} width={27} height={132} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
          <Path d="M1347 414 L1390 440 V500 L1347 525 Z" fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Circle cx={1374} cy={470} r={6} fill={c.fillSoft} stroke={c.stroke} strokeWidth={2} />
          <Rect x={1389} y={459} width={35} height={22} rx={3} fill={c.brass} stroke={c.brassEdge} strokeWidth={1.5} />
          {/* Screen-changer pressure tappings, one either side of the breaker
              plate, on the underside of the head. */}
          <Rect x={1296} y={535} width={24} height={35} rx={3} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={1352} y={535} width={24} height={35} rx={3} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
          <Line x1={1364} y1={525} x2={1364} y2={537} stroke={c.stroke} strokeWidth={2} />
        </G>

        {/* ================= CONNECTION POINTS =================
            Green dots only: no names, no cards, no leader lines. Each one sits
            at its declared SVG coordinate, so it scales with the machine. */}
        <G>
          {TWIN_SCREW_CONNECTORS.map((point) => {
            const live = connectorState?.[point.code] === 'live';
            return (
              <G key={point.code}>
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={11}
                  fill="none"
                  stroke={c.accent}
                  strokeOpacity={live ? 0.55 : 0.16}
                  strokeWidth={3}
                />
                <Circle cx={point.x} cy={point.y} r={7} fill={c.accent} stroke={c.accentEdge} strokeWidth={2} />
              </G>
            );
          })}
        </G>
      </Svg>
    </View>
  );
}
