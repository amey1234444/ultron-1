import { useMemo } from 'react';
import {
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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

/* Barrel + screw ---------------------------------------------------------- */

const BARREL_AXIS_Y = 380;
const BARREL_LEFT = 400;
const BARREL_RIGHT = 1000;
const BARREL_TOP = 338;
const BARREL_BOTTOM = 422;

const BORE_LEFT = 414;
const BORE_RIGHT = 986;
const BORE_TOP = 350;
const BORE_BOTTOM = 410;

const FLIGHT_PITCH = 40;
const FLIGHT_THICKNESS = 11;

const SCREW_FLIGHTS = Array.from(
  { length: 16 },
  (_, index) =>
    BORE_LEFT - FLIGHT_PITCH + index * FLIGHT_PITCH,
);

/** Five heating zones clamped around the barrel. */
const HEATING_ZONES = [
  545,
  625,
  705,
  785,
  865,
];

const HEATING_ZONE_WIDTH = 32;

/** How far a heater band stands proud of the barrel wall. */
const HEATING_ZONE_OVERHANG = 12;

const MOTOR_FINS = Array.from(
  { length: 8 },
  (_, index) => index,
);

const GEARBOX_BOLTS = [
  [276, 314],
  [388, 314],
  [276, 578],
  [388, 578],
];

/** Support legs carrying the barrel over the base beam. */
const SUPPORT_LEGS = [470, 690, 910];

export function SingleScrewExtruder({
  className,
  style,
  screwRotation = 0,
  showBackground = false,
}: SingleScrewExtruderProps) {
  const { isDark } = useAppTheme();

  const colours = useMemo(
    () => ({
      background: isDark
        ? '#0A0A0A'
        : '#FAFAFA',

      panel: isDark
        ? '#131313'
        : '#FFFFFF',

      machine: isDark
        ? '#171717'
        : '#EDEDED',

      machineRaised: isDark
        ? '#202020'
        : '#FFFFFF',

      machineDeep: isDark
        ? '#0D0D0D'
        : '#D8D8D8',

      machineStroke: isDark
        ? '#777777'
        : '#414141',

      fineStroke: isDark
        ? '#444444'
        : '#A1A3A0',

      muted: isDark
        ? '#9A9A9A'
        : '#666666',

      accent: '#6EF08A',

      screw: isDark
        ? '#555555'
        : '#9D9D9D',
    }),
    [isDark],
  );

  /**
   * The flights are clipped to the bore, so shifting them by one pitch is a
   * seamless loop — 360° of screw rotation moves material forward by one flight.
   */
  const flightOffset =
    (((screwRotation % 360) + 360) % 360) /
    360 *
    FLIGHT_PITCH;

  return (
    <View
      className={cn(
        'w-full overflow-hidden',
        showBackground && 'rounded-2xl',
        className,
      )}
      style={[
        {
          aspectRatio:
            VIEWBOX_WIDTH / VIEWBOX_HEIGHT,

          backgroundColor: showBackground
            ? colours.panel
            : 'transparent',
        },
        style,
      ]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      >
        <Defs>
          <LinearGradient
            id="extruderBody"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <Stop
              offset="0"
              stopColor={colours.machineRaised}
            />
            <Stop
              offset="1"
              stopColor={colours.machine}
            />
          </LinearGradient>

          <LinearGradient
            id="extruderBore"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <Stop
              offset="0"
              stopColor={
                isDark ? '#090909' : '#D1D1D1'
              }
            />
            <Stop
              offset="0.5"
              stopColor={
                isDark ? '#1D1D1D' : '#F4F4F4'
              }
            />
            <Stop
              offset="1"
              stopColor={
                isDark ? '#090909' : '#D1D1D1'
              }
            />
          </LinearGradient>

          <LinearGradient
            id="extruderMotor"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            <Stop
              offset="0"
              stopColor={colours.machineRaised}
            />
            <Stop
              offset="1"
              stopColor={colours.machineDeep}
            />
          </LinearGradient>

          <LinearGradient
            id="extruderMaterial"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <Stop
              offset="0"
              stopColor={
                isDark ? '#D8A544' : '#E9BE5C'
              }
            />
            <Stop
              offset="1"
              stopColor={
                isDark ? '#8A6415' : '#C48F22'
              }
            />
          </LinearGradient>

          <ClipPath id="extruderBoreClip">
            <Rect
              x={BORE_LEFT}
              y={BORE_TOP}
              width={BORE_RIGHT - BORE_LEFT}
              height={BORE_BOTTOM - BORE_TOP}
              rx={6}
            />
          </ClipPath>
        </Defs>

        {showBackground && (
          <Rect
            x={0}
            y={0}
            width={VIEWBOX_WIDTH}
            height={VIEWBOX_HEIGHT}
            fill={colours.panel}
          />
        )}

        {/* Feeder label */}
        <SvgText
          x={518}
          y={46}
          fill={colours.muted}
          fontFamily="SpaceGrotesk_600SemiBold"
          fontSize={18}
          fontWeight="600"
          letterSpacing={5}
          textAnchor="middle"
        >
          FEEDER
        </SvgText>

        <Polygon
          points="508,58 528,58 518,72"
          fill={colours.accent}
        />

        {/* Foundation */}
        <Rect
          x={40}
          y={640}
          width={1120}
          height={54}
          rx={8}
          fill={colours.machine}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Line
          x1={52}
          y1={652}
          x2={1148}
          y2={652}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        {/* Barrel support frame */}
        <Rect
          x={430}
          y={470}
          width={560}
          height={18}
          rx={3}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        {SUPPORT_LEGS.map((x) => (
          <Rect
            key={`leg-${x}`}
            x={x}
            y={488}
            width={24}
            height={152}
            rx={3}
            fill="url(#extruderBody)"
            stroke={colours.machineStroke}
            strokeWidth={2}
          />
        ))}

        {/* Motor */}
        <Rect
          x={100}
          y={446}
          width={56}
          height={22}
          rx={4}
          fill={colours.machineRaised}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={60}
          y={466}
          width={140}
          height={100}
          rx={16}
          fill="url(#extruderMotor)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        {MOTOR_FINS.map((index) => (
          <Line
            key={`fin-${index}`}
            x1={78}
            y1={482 + index * 10}
            x2={182}
            y2={482 + index * 10}
            stroke={colours.fineStroke}
            strokeWidth={2}
          />
        ))}

        <Rect
          x={70}
          y={566}
          width={130}
          height={14}
          rx={3}
          fill={colours.machineDeep}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={86}
          y={580}
          width={98}
          height={60}
          rx={4}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <SvgText
          x={130}
          y={618}
          fill={colours.muted}
          fontFamily="Inter_600SemiBold"
          fontSize={12}
          fontWeight="600"
          letterSpacing={2}
          textAnchor="middle"
        >
          MOTOR
        </SvgText>

        {/* Input shaft and coupling */}
        <Rect
          x={198}
          y={508}
          width={28}
          height={12}
          rx={2}
          fill={colours.machineDeep}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        <Rect
          x={224}
          y={494}
          width={34}
          height={40}
          rx={6}
          fill={colours.machineRaised}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Line
          x1={235}
          y1={497}
          x2={235}
          y2={531}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        <Line
          x1={247}
          y1={497}
          x2={247}
          y2={531}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        {/* Output shaft */}
        <Rect
          x={150}
          y={372}
          width={110}
          height={16}
          rx={3}
          fill={colours.machineDeep}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        <Rect
          x={176}
          y={364}
          width={18}
          height={32}
          rx={3}
          fill={colours.machineRaised}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        {/* Gear box */}
        <Rect
          x={258}
          y={296}
          width={148}
          height={300}
          rx={12}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2.5}
        />

        <Rect
          x={272}
          y={310}
          width={120}
          height={272}
          rx={8}
          fill="none"
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        {GEARBOX_BOLTS.map(([x, y]) => (
          <Circle
            key={`gearbox-bolt-${x}-${y}`}
            cx={x}
            cy={y}
            r={6}
            fill={colours.machineDeep}
            stroke={colours.fineStroke}
            strokeWidth={1}
          />
        ))}

        <SvgText
          x={332}
          y={470}
          fill={colours.muted}
          fontFamily="Inter_600SemiBold"
          fontSize={13}
          fontWeight="600"
          letterSpacing={2}
          textAnchor="middle"
        >
          GEAR BOX
        </SvgText>

        <Rect
          x={286}
          y={596}
          width={92}
          height={44}
          rx={4}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        {/* Barrel */}
        <Rect
          x={BARREL_LEFT}
          y={BARREL_TOP}
          width={BARREL_RIGHT - BARREL_LEFT}
          height={BARREL_BOTTOM - BARREL_TOP}
          rx={10}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2.5}
        />

        {/* Heating zones — drawn under the bore so only the jacket shows. */}
        {HEATING_ZONES.map((centre, index) => (
          <G key={`zone-${centre}`}>
            <Rect
              x={centre - HEATING_ZONE_WIDTH / 2}
              y={BARREL_TOP - HEATING_ZONE_OVERHANG}
              width={HEATING_ZONE_WIDTH}
              height={
                BARREL_BOTTOM -
                BARREL_TOP +
                HEATING_ZONE_OVERHANG * 2
              }
              rx={3}
              fill={colours.machineDeep}
              stroke={colours.machineStroke}
              strokeWidth={1.5}
            />

            <Line
              x1={centre - 10}
              y1={BARREL_TOP - 5}
              x2={centre + 10}
              y2={BARREL_TOP - 5}
              stroke={colours.fineStroke}
              strokeWidth={1}
            />

            <Line
              x1={centre - 10}
              y1={BARREL_BOTTOM + 5}
              x2={centre + 10}
              y2={BARREL_BOTTOM + 5}
              stroke={colours.fineStroke}
              strokeWidth={1}
            />

            <SvgText
              x={centre}
              y={454}
              fill={colours.muted}
              fontFamily="Inter_600SemiBold"
              fontSize={11}
              fontWeight="600"
              letterSpacing={1}
              textAnchor="middle"
            >
              {`Z${index + 1}`}
            </SvgText>
          </G>
        ))}

        <SvgText
          x={705}
          y={300}
          fill={colours.muted}
          fontFamily="Inter_600SemiBold"
          fontSize={12}
          fontWeight="600"
          letterSpacing={3}
          textAnchor="middle"
        >
          HEATING ZONES
        </SvgText>

        {/* Barrel end flanges */}
        <Rect
          x={390}
          y={BARREL_TOP - 12}
          width={24}
          height={
            BARREL_BOTTOM - BARREL_TOP + 24
          }
          rx={4}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={986}
          y={BARREL_TOP - 12}
          width={24}
          height={
            BARREL_BOTTOM - BARREL_TOP + 24
          }
          rx={4}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        {/* Bore cut-away */}
        <Rect
          x={BORE_LEFT}
          y={BORE_TOP}
          width={BORE_RIGHT - BORE_LEFT}
          height={BORE_BOTTOM - BORE_TOP}
          rx={6}
          fill="url(#extruderBore)"
          stroke={colours.accent}
          strokeWidth={1.5}
        />

        {/* Screw */}
        <G clipPath="url(#extruderBoreClip)">
          <Path
            d={`
              M ${BORE_LEFT} 368
              L ${BORE_RIGHT} 360
              L ${BORE_RIGHT} 400
              L ${BORE_LEFT} 392
              Z
            `}
            fill={colours.machineDeep}
            stroke={colours.fineStroke}
            strokeWidth={1}
          />

          {SCREW_FLIGHTS.map((x) => {
            const start = x + flightOffset;

            return (
              <Path
                key={`flight-${x}`}
                d={`
                  M ${start} ${BORE_TOP}
                  C ${start + 9} ${BORE_TOP + 11}
                    ${start + 9} ${BORE_BOTTOM - 11}
                    ${start} ${BORE_BOTTOM}
                  L ${start + FLIGHT_THICKNESS} ${BORE_BOTTOM}
                  C ${start + FLIGHT_THICKNESS + 9} ${BORE_BOTTOM - 11}
                    ${start + FLIGHT_THICKNESS + 9} ${BORE_TOP + 11}
                    ${start + FLIGHT_THICKNESS} ${BORE_TOP}
                  Z
                `}
                fill={colours.screw}
                stroke={colours.machineStroke}
                strokeWidth={1}
              />
            );
          })}
        </G>

        <SvgText
          x={946}
          y={322}
          fill={colours.muted}
          fontFamily="Inter_600SemiBold"
          fontSize={12}
          fontWeight="600"
          letterSpacing={2}
          textAnchor="middle"
        >
          SCREW
        </SvgText>

        <SvgText
          x={452}
          y={322}
          fill={colours.muted}
          fontFamily="Inter_600SemiBold"
          fontSize={12}
          fontWeight="600"
          letterSpacing={2}
          textAnchor="middle"
        >
          BARREL
        </SvgText>

        {/* Feeder hopper */}
        <Rect
          x={452}
          y={74}
          width={132}
          height={26}
          rx={12}
          fill={colours.machineRaised}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={458}
          y={92}
          width={120}
          height={104}
          rx={4}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Path
          d="
            M 458 196
            L 578 196
            L 540 262
            L 496 262
            Z
          "
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={496}
          y={256}
          width={44}
          height={86}
          rx={3}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        {/* Material column */}
        <Path
          d="
            M 464 140
            Q 518 122 572 140
            L 572 194
            L 537 259
            L 499 259
            L 464 194
            Z
          "
          fill="url(#extruderMaterial)"
          opacity={0.9}
        />

        <Rect
          x={502}
          y={256}
          width={32}
          height={54}
          fill="url(#extruderMaterial)"
          opacity={0.75}
        />

        <Line
          x1={470}
          y1={110}
          x2={470}
          y2={132}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        <Line
          x1={566}
          y1={110}
          x2={566}
          y2={132}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        {/* Die */}
        <Path
          d={`
            M ${BARREL_RIGHT + 10} ${BARREL_TOP - 12}
            L 1064 352
            L 1084 366
            L 1120 366
            L 1120 394
            L 1084 394
            L 1064 408
            L ${BARREL_RIGHT + 10} ${BARREL_BOTTOM + 12}
            Z
          `}
          fill="url(#extruderBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={1118}
          y={362}
          width={22}
          height={36}
          rx={4}
          fill={colours.machineDeep}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Polygon
          points={`1150,${BARREL_AXIS_Y - 8} 1150,${BARREL_AXIS_Y + 8} 1166,${BARREL_AXIS_Y}`}
          fill={colours.accent}
        />

        <SvgText
          x={1086}
          y={452}
          fill={colours.muted}
          fontFamily="SpaceGrotesk_600SemiBold"
          fontSize={16}
          fontWeight="600"
          letterSpacing={4}
          textAnchor="middle"
        >
          DIE
        </SvgText>

        <SvgText
          x={1100}
          y={330}
          fill={colours.muted}
          fontFamily="Inter_600SemiBold"
          fontSize={12}
          fontWeight="600"
          letterSpacing={2}
          textAnchor="middle"
        >
          EXTRUDATE
        </SvgText>
      </Svg>
    </View>
  );
}
