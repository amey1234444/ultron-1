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
import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_POINT_REGISTRY,
} from '../../../lib/twinScrewExtruderPoints';
import { MeasurementPad, padStateLabel, type MeasurementPadState } from './MeasurementPad';
import {
  BARREL_CLIP,
  SCREW_A_TRAIN,
  SCREW_B_TRAIN,
  SCREW_ELEMENTS,
  SCREW_END_X,
  SCREW_START_X,
  type ScrewTrain,
} from './twinScrewGeometry';

type TwinScrewExtruderProps = {
  className?: string;
  style?: StyleProp<ViewStyle>;

  /**
   * How each instrument pad is currently wired, keyed by point code.
   *
   * An empty pad is a hollow ring, a pad with a card attached is filled, and a
   * pad whose card is reporting gets a halo — the same three marks the
   * single-screw drawing uses, from the same component.
   */
  connectorState?: Record<string, MeasurementPadState>;

  /**
   * Draw the machine-part names on the artwork.
   *
   * Off by default: on the mapping canvas the cards and trails already name
   * every point, and a second set of names competes with them. On in the QA
   * surface and wherever the drawing is shown on its own.
   */
  showPartLabels?: boolean;

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

/** Clamped heater / cooling shells along the barrel. */
const TOP_SHELL_COUNT = 11;
const BOTTOM_SHELL_COUNT = 11;
const TOP_SHELL_X0 = 686;
const TOP_SHELL_STEP = 59;

const MOTOR_FIN_COUNT = 13;

const GRID_MINOR = 32;
const GRID_MAJOR = 160;

/**
 * Every point this machine can report, at the spot on the drawing where the
 * instrument physically sits.
 *
 * The canvas snaps trail endpoints to this list and the default trail layout
 * places its cards from it, so a card can never attach to a place the artwork
 * does not actually have an instrument. The drawing renders one pad per entry
 * and never a hard-coded circle of its own.
 */
export type TwinScrewConnector = (typeof TWIN_SCREW_POINT_REGISTRY)[number];

export const TWIN_SCREW_CONNECTORS: readonly TwinScrewConnector[] = TWIN_SCREW_POINT_REGISTRY;

/** Part names, each anchored to a part the drawing actually contains. */
const PART_LABELS: { x: number; y: number; text: string; size?: number; anchor?: 'start' | 'middle' | 'end' }[] = [
  { x: 193, y: 625, text: 'MOTOR' },
  { x: 388, y: 625, text: 'COUPLING', size: 11 },
  { x: 497, y: 625, text: 'GEARBOX' },
  { x: 728, y: 92, text: 'MAIN FEEDER' },
  { x: 664, y: 336, text: 'FEED THROAT', size: 10, anchor: 'end' },
  { x: 969, y: 268, text: 'SIDE FEEDER', size: 11 },
  { x: 1238, y: 264, text: 'VENT', size: 11 },
  { x: 880, y: 372, text: 'BARREL' },
  { x: 1374, y: 392, text: 'DIE', size: 11 },
  { x: 1300, y: 625, text: 'EXTRUDATE', size: 12 },
];

/** Screw-train names, on the barrel centre lines at the feed end. */
const SCREW_LABELS: { x: number; y: number; text: string }[] = [
  { x: 700, y: 443, text: 'SCREW A' },
  { x: 700, y: 489, text: 'SCREW B' },
];

export function TwinScrewExtruder({
  className,
  style,
  showPartLabels = false,
  showBackground = false,
  connectorState,
}: TwinScrewExtruderProps) {
  const { isDark } = useAppTheme();

  /**
   * Visual tokens, declared once.
   *
   * Light values are the technical-drawing palette this template targets; the
   * dark column is the same drawing on the console's dark surface. Nothing
   * below hard-codes a colour except the pure-white highlight and the status
   * accent, which is the one colour on the machine that carries meaning.
   */
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
      muted: isDark ? '#8B929C' : '#6E757C',
      accent: '#16c84a',
      brass: isDark ? '#A8863F' : '#c9a451',
      brassEdge: isDark ? '#6B5527' : '#8a733b',
      metal: isDark
        ? ['#2A2F38', '#1B1F26', '#333944', '#12151A']
        : ['#f3f4f4', '#d5d8da', '#fafafa', '#b7bcc0'],
      darkMetal: isDark ? ['#242932', '#39404B', '#171B21'] : ['#9ca2a6', '#e1e3e4', '#7e858a'],
      // Four stops, not two: a cylinder carries a highlight band below its top
      // edge and falls away to shadow underneath. Same treatment as the SSE barrel.
      root: isDark ? ['#2E343D', '#4A515B', '#3A414B', '#171B21'] : ['#9aa0a5', '#e8eaeb', '#b9bfc3', '#6f767b'],
      flight: isDark ? ['#4A515B', '#6E7682', '#2C323A'] : ['#c3c9cd', '#f2f3f4', '#848b90'],
      kneading: isDark ? ['#39404B', '#5A626D', '#22272E'] : ['#aab0b5', '#e2e4e6', '#767d82'],
      flightStroke: isDark ? '#8A919B' : '#51575c',
      crestLit: isDark ? '#C3CAD3' : '#ffffff',
      bore: isDark ? '#0B0D11' : '#eceded',
    }),
    [isDark],
  );

  const gridLines = useMemo(() => {
    if (!showBackground) return null;
    const lines = [];
    for (let x = GRID_MINOR; x < VIEWBOX_WIDTH; x += GRID_MINOR) {
      const major = x % GRID_MAJOR === 0;
      lines.push(
        <Line key={`gx-${x}`} x1={x} y1={0} x2={x} y2={VIEWBOX_HEIGHT} stroke={major ? c.gridMajor : c.gridMinor} strokeWidth={major ? 1.2 : 1} />,
      );
    }
    for (let y = GRID_MINOR; y < VIEWBOX_HEIGHT; y += GRID_MINOR) {
      const major = y % GRID_MAJOR === 0;
      lines.push(
        <Line key={`gy-${y}`} x1={0} y1={y} x2={VIEWBOX_WIDTH} y2={y} stroke={major ? c.gridMajor : c.gridMinor} strokeWidth={major ? 1.2 : 1} />,
      );
    }
    return lines;
  }, [showBackground, c.gridMajor, c.gridMinor]);

  /** One screw train: root, then flight bands, then lit crests, then kneading discs. */
  const screwTrain = (train: ScrewTrain, keyPrefix: string) => (
    <G key={keyPrefix}>
      <Path d={train.root} fill="url(#twinRootGradient)" stroke={c.flightStroke} strokeWidth={1.2} />
      <Path d={train.rootHighlight} stroke={c.crestLit} strokeOpacity={0.4} strokeWidth={2} fill="none" />
      {train.flights.map((flight) => (
        <Path
          key={flight.key}
          d={flight.band}
          fill={flight.kind === 'reverse' ? 'url(#twinKneadGradient)' : 'url(#twinFlightGradient)'}
          stroke={c.flightStroke}
          strokeWidth={1.3}
          strokeLinejoin="round"
        />
      ))}
      {train.flights.map((flight) => (
        <Path key={`${flight.key}-crest`} d={flight.crest} stroke={c.crestLit} strokeOpacity={0.55} strokeWidth={1.4} fill="none" />
      ))}
      {train.kneadingDiscs.map((disc) => (
        <G key={disc.key} transform={`rotate(${disc.lean} ${disc.x} ${train.axisY})`}>
          <Rect
            x={disc.x - disc.rx}
            y={train.axisY - disc.ry}
            width={disc.rx * 2}
            height={disc.ry * 2}
            rx={disc.rx}
            fill="url(#twinKneadGradient)"
            stroke={c.flightStroke}
            strokeWidth={1.3}
          />
        </G>
      ))}
    </G>
  );

  /**
   * A part name. `plate` draws a panel-coloured backing behind the text, which
   * is what keeps the two screw names readable where they sit directly over the
   * flights — the alternative is moving them off the part they name.
   */
  const label = (
    x: number,
    y: number,
    text: string,
    size = 13,
    anchor: 'start' | 'middle' | 'end' = 'middle',
    plate = false,
  ) => (
    <G key={`label-${text}-${x}-${y}`}>
    {plate && (
      <Rect
        x={x - (text.length * size * 0.34) - 6}
        y={y - size * 0.92}
        width={text.length * size * 0.68 + 12}
        height={size * 1.35}
        rx={3}
        fill={c.panel}
        opacity={0.86}
      />
    )}
    <SvgText
      x={x}
      y={y}
      fill={c.muted}
      fontFamily="Inter_600SemiBold"
      fontSize={size}
      fontWeight="600"
      letterSpacing={size >= 13 ? 2 : 1.4}
      textAnchor={anchor}
    >
      {text}
    </SvgText>
    </G>
  );

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

          {/* Cylinder shading for the barrel shells: highlight below the top
              edge, falling to shadow at the bottom. */}
          <LinearGradient id="twinBarrel" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.metal[1]} />
            <Stop offset="0.16" stopColor={c.metal[2]} />
            <Stop offset="0.55" stopColor={c.metal[0]} />
            <Stop offset="1" stopColor={c.metal[3]} />
          </LinearGradient>

          <LinearGradient id="twinRootGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.root[0]} />
            <Stop offset="0.22" stopColor={c.root[1]} />
            <Stop offset="0.62" stopColor={c.root[2]} />
            <Stop offset="1" stopColor={c.root[3]} />
          </LinearGradient>

          <LinearGradient id="twinFlightGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.flight[0]} />
            <Stop offset="0.4" stopColor={c.flight[1]} />
            <Stop offset="1" stopColor={c.flight[2]} />
          </LinearGradient>

          <LinearGradient id="twinKneadGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.kneading[0]} />
            <Stop offset="0.4" stopColor={c.kneading[1]} />
            <Stop offset="1" stopColor={c.kneading[2]} />
          </LinearGradient>

          {/* One clip for both trains. Neither screw can escape the barrel. */}
          <ClipPath id="twinScrewBarrelClip">
            <Rect x={BARREL_CLIP.x} y={BARREL_CLIP.y} width={BARREL_CLIP.width} height={BARREL_CLIP.height} rx={3} />
          </ClipPath>
        </Defs>

        {/* 1 — background and grid, only when the drawing stands alone */}
        {showBackground && (
          <G>
            <Rect x={0} y={0} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill={c.panel} />
            {gridLines}
          </G>
        )}

        {/* 2 — motor and its base */}
        <G>
          <Rect x={83} y={405} width={220} height={135} rx={50} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
          {Array.from({ length: MOTOR_FIN_COUNT }).map((_, i) => (
            <Line key={`fin-${i}`} x1={115} x2={270} y1={418 + i * 8} y2={418 + i * 8} stroke={c.fin} strokeWidth={3} />
          ))}
          {/* terminal box — where the electrical instrument lands */}
          <Rect x={160} y={354} width={95} height={52} rx={6} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          {/* drive-end bearing bracket, then the shaft over it */}
          <Rect x={290} y={426} width={34} height={38} rx={5} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={295} y={448} width={85} height={28} rx={10} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={104} y={540} width={176} height={31} rx={2} fill="url(#twinMetal)" stroke={c.strokeSoft} strokeWidth={2} />
          <Rect x={78} y={569} width={225} height={27} rx={3} fill={c.fill} stroke={c.strokeSoft} strokeWidth={2} />
        </G>

        {/* 3 — coupling */}
        <G>
          <Rect x={355} y={436} width={34} height={52} rx={10} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={386} y={430} width={36} height={64} rx={8} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
        </G>

        {/* 4 — gearbox */}
        <G>
          {/* input bearing cover, bridging the coupling into the case */}
          <Rect x={370} y={356} width={62} height={44} rx={6} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Path d="M425 330 Q425 310 445 310 H552 Q570 310 570 330 V548 H425 Z" fill={c.fill} stroke={c.strokeSoft} strokeWidth={2} />
          <Rect x={454} y={355} width={82} height={155} rx={6} fill={c.fillDeep} stroke={c.strokeSoft} strokeWidth={1} />
          <Circle cx={495} cy={428} r={11} fill={c.glass} stroke={c.strokeSoft} strokeWidth={2} />
          <Circle cx={495} cy={486} r={11} fill={c.glass} stroke={c.strokeSoft} strokeWidth={2} />
          {/* oil-temperature boss, ringed by the lifting eye */}
          <Circle cx={470} cy={300} r={10} fill="url(#twinMetal)" stroke={c.strokeSoft} strokeWidth={1.5} />
          <Circle cx={470} cy={300} r={14} fill="none" stroke={c.stroke} strokeWidth={5} />
          {/* output housing, then the twin-shaft thrust block */}
          <Rect x={568} y={366} width={62} height={170} rx={7} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={620} y={400} width={34} height={118} rx={5} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={407} y={547} width={190} height={27} fill={c.fillDeep} stroke={c.strokeSoft} strokeWidth={2} />
          <Rect x={390} y={572} width={225} height={25} fill={c.fill} stroke={c.strokeSoft} strokeWidth={2} />
        </G>

        {/* 5 — main hopper and feed throat */}
        <G>
          <Rect x={652} y={105} width={153} height={18} rx={5} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Path d="M660 123 H797 V205 H660 Z" fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Path d="M660 205 H797 L758 321 H697 Z" fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={700} y={319} width={55} height={98} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={688} y={312} width={78} height={15} rx={3} fill={c.fillDeep} stroke={c.stroke} strokeWidth={2} />
          {/* feed-throat thermocouple boss on the upstream shoulder */}
          <Rect x={672} y={352} width={32} height={28} rx={3} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
        </G>

        {/* 6 — barrel body and its cutaway bore */}
        <G>
          <Rect x={638} y={397} width={690} height={145} rx={5} fill={c.fillDeep} stroke={c.stroke} strokeWidth={2} />
          <Rect x={645} y={415} width={675} height={112} rx={3} fill={c.bore} stroke={c.strokeSoft} strokeWidth={1.5} />
        </G>

        {/* 7 — the two screw trains, clipped to one barrel window */}
        <G clipPath="url(#twinScrewBarrelClip)">
          {screwTrain(SCREW_A_TRAIN, 'screw-a')}
          {screwTrain(SCREW_B_TRAIN, 'screw-b')}
        </G>

        {/* 8 — heater / cooling shells, drawn over the bore edges */}
        <G>
          {Array.from({ length: TOP_SHELL_COUNT }).map((_, i) => (
            <Rect
              key={`shell-top-${i}`}
              x={TOP_SHELL_X0 + i * TOP_SHELL_STEP}
              y={386}
              width={47}
              height={25}
              rx={3}
              fill="url(#twinBarrel)"
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

        {/* 9 — side feeder and vent */}
        <G>
          <Path d="M943 290 H995 L982 330 H955 Z" fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={954} y={328} width={33} height={61} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={938} y={384} width={67} height={21} rx={3} fill={c.fillDeep} stroke={c.stroke} strokeWidth={2} />
        </G>
        <G>
          <Rect x={1220} y={335} width={38} height={62} fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={1214} y={326} width={50} height={14} rx={3} fill={c.fillDeep} stroke={c.stroke} strokeWidth={2} />
          <Rect x={1227} y={286} width={24} height={42} rx={6} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
        </G>

        {/* 10 — die head, screen pressure tappings and extrudate */}
        <G>
          <Rect x={1320} y={403} width={27} height={132} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
          <Path d="M1347 414 L1390 440 V500 L1347 525 Z" fill="url(#twinMetal)" stroke={c.stroke} strokeWidth={2} />
          <Circle cx={1374} cy={470} r={6} fill={c.fillSoft} stroke={c.stroke} strokeWidth={2} />
          <Rect x={1389} y={459} width={35} height={22} rx={3} fill={c.brass} stroke={c.brassEdge} strokeWidth={1.5} />
          {/* screen-changer pressure tappings, one either side of the breaker plate */}
          <Rect x={1296} y={535} width={24} height={35} rx={3} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
          <Rect x={1352} y={535} width={24} height={35} rx={3} fill="url(#twinDarkMetal)" stroke={c.stroke} strokeWidth={2} />
          <Line x1={1364} y1={525} x2={1364} y2={537} stroke={c.stroke} strokeWidth={2} />
          <Polygon points="1424,460 1424,480 1440,470" fill={c.accent} />
        </G>

        {/* 11 — part labels, when asked for */}
        {showPartLabels && (
          // The label layer never intercepts a drag; the trail board above owns
          // pointer input, and a name must not swallow a click meant for a pad.
          <G pointerEvents="none">
            {PART_LABELS.map((entry) => label(entry.x, entry.y, entry.text, entry.size, entry.anchor))}
            {SCREW_LABELS.map((entry) => label(entry.x, entry.y, entry.text, 10, 'middle', true))}
            {SCREW_ELEMENTS.filter((element) => element.kind === 'kneading').map((element) =>
              label(element.startX + element.length / 2, 592, 'KNEAD', 8.5, 'middle'),
            )}
          </G>
        )}

        {/* 12 — instrument pads. One per registry entry, and nothing else. */}
        <G>
          {TWIN_SCREW_CONNECTORS.map((point) => {
            const state = connectorState?.[point.code] ?? 'idle';
            return (
              <MeasurementPad
                key={point.code}
                x={point.x}
                y={point.y}
                state={state}
                accent={c.accent}
                panel={c.panel}
                label={`${point.label} — ${padStateLabel(state)}`}
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
}

/** Exported for the QA surface, which draws the screw envelope it verifies. */
export const TWIN_SCREW_ENVELOPE = { startX: SCREW_START_X, endX: SCREW_END_X, clip: BARREL_CLIP };
