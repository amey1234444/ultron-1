import { useMemo } from 'react';
import {
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
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

type RotaryAirlockValveProps = {
  className?: string;
  style?: StyleProp<ViewStyle>;

  /**
   * Rotate the visible rotor.
   * Example: 22.5
   */
  rotorRotation?: number;

  /**
   * Set true when the component needs its own panel.
   * Keep false when placing it on an existing machine canvas.
   */
  showBackground?: boolean;
};

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 760;

const ROTOR_CENTRE_X = 520;
const ROTOR_CENTRE_Y = 380;

const ROTOR_VANES = [
  0,
  45,
  90,
  135,
  180,
  225,
  270,
  315,
];

const MOTOR_FINS = Array.from(
  { length: 8 },
  (_, index) => index,
);

const BODY_BOLTS = [
  [340, 238],
  [700, 238],
  [340, 522],
  [700, 522],
];

export function RotaryAirlockValve({
  className,
  style,
  rotorRotation = 0,
  showBackground = false,
}: RotaryAirlockValveProps) {
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
    }),
    [isDark],
  );

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
            id="machineBody"
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
            id="rotorFace"
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <Stop
              offset="0"
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
            id="motorBody"
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

        {/* Inlet label */}
        <SvgText
          x={520}
          y={54}
          fill={colours.muted}
          fontFamily="SpaceGrotesk_600SemiBold"
          fontSize={18}
          fontWeight="600"
          letterSpacing={5}
          textAnchor="middle"
        >
          INLET / HOPPER
        </SvgText>

        <Polygon
          points="510,72 530,72 520,87"
          fill={colours.accent}
        />

        {/* Hopper */}
        <Path
          d="
            M 360 110
            L 680 110
            L 635 218
            L 405 218
            Z
          "
          fill="url(#machineBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={344}
          y={98}
          width={352}
          height={20}
          rx={4}
          fill={colours.machineRaised}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Line
          x1={380}
          y1={127}
          x2={420}
          y2={214}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        <Line
          x1={660}
          y1={127}
          x2={620}
          y2={214}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        {/* Main housing */}
        <Rect
          x={320}
          y={218}
          width={400}
          height={324}
          rx={10}
          fill="url(#machineBody)"
          stroke={colours.machineStroke}
          strokeWidth={2.5}
        />

        <Rect
          x={337}
          y={235}
          width={366}
          height={290}
          rx={7}
          fill="none"
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        {/* Housing bolts */}
        {BODY_BOLTS.map(([x, y]) => (
          <G key={`${x}-${y}`}>
            <Circle
              cx={x}
              cy={y}
              r={12}
              fill={colours.machineDeep}
              stroke={colours.machineStroke}
              strokeWidth={2}
            />

            <Circle
              cx={x}
              cy={y}
              r={5}
              fill="none"
              stroke={colours.fineStroke}
              strokeWidth={1}
            />
          </G>
        ))}

        {/* Left bearing and shaft */}
        <Rect
          x={196}
          y={342}
          width={74}
          height={76}
          rx={7}
          fill="url(#machineBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={260}
          y={328}
          width={62}
          height={104}
          rx={8}
          fill="url(#machineBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={136}
          y={367}
          width={62}
          height={26}
          rx={4}
          fill={colours.machineRaised}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={112}
          y={357}
          width={28}
          height={46}
          rx={4}
          fill={colours.machineDeep}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Circle
          cx={291}
          cy={380}
          r={22}
          fill={colours.machineDeep}
          stroke={colours.fineStroke}
          strokeWidth={1.5}
        />

        {/* Right bearing */}
        <Rect
          x={720}
          y={328}
          width={65}
          height={104}
          rx={8}
          fill="url(#machineBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Circle
          cx={752}
          cy={380}
          r={22}
          fill={colours.machineDeep}
          stroke={colours.fineStroke}
          strokeWidth={1.5}
        />

        {/* Coupling */}
        <Rect
          x={785}
          y={356}
          width={55}
          height={48}
          rx={7}
          fill={colours.machineRaised}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Line
          x1={800}
          y1={359}
          x2={800}
          y2={401}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        <Line
          x1={822}
          y1={359}
          x2={822}
          y2={401}
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        {/* Gearbox */}
        <Rect
          x={840}
          y={318}
          width={112}
          height={124}
          rx={9}
          fill="url(#machineBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={852}
          y={332}
          width={88}
          height={96}
          rx={6}
          fill="none"
          stroke={colours.fineStroke}
          strokeWidth={1}
        />

        <Circle
          cx={865}
          cy={345}
          r={5}
          fill={colours.machineDeep}
          stroke={colours.fineStroke}
        />

        <Circle
          cx={927}
          cy={345}
          r={5}
          fill={colours.machineDeep}
          stroke={colours.fineStroke}
        />

        <Circle
          cx={865}
          cy={415}
          r={5}
          fill={colours.machineDeep}
          stroke={colours.fineStroke}
        />

        <Circle
          cx={927}
          cy={415}
          r={5}
          fill={colours.machineDeep}
          stroke={colours.fineStroke}
        />

        <SvgText
          x={896}
          y={386}
          fill={colours.muted}
          fontFamily="Inter_600SemiBold"
          fontSize={13}
          fontWeight="600"
          letterSpacing={2}
          textAnchor="middle"
        >
          GEARBOX
        </SvgText>

        {/* Motor */}
        <Rect
          x={952}
          y={326}
          width={180}
          height={108}
          rx={14}
          fill="url(#motorBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        {MOTOR_FINS.map((index) => (
          <Line
            key={index}
            x1={970}
            y1={344 + index * 10}
            x2={1088}
            y2={344 + index * 10}
            stroke={colours.fineStroke}
            strokeWidth={2}
          />
        ))}

        <Path
          d="
            M 1132 338
            L 1165 347
            L 1175 360
            L 1175 400
            L 1165 413
            L 1132 422
            Z
          "
          fill={colours.machineDeep}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        {/* Rotor face */}
        <Circle
          cx={ROTOR_CENTRE_X}
          cy={ROTOR_CENTRE_Y}
          r={150}
          fill={colours.machineDeep}
          stroke={colours.fineStroke}
          strokeWidth={2}
        />

        <Circle
          cx={ROTOR_CENTRE_X}
          cy={ROTOR_CENTRE_Y}
          r={136}
          fill="url(#rotorFace)"
          stroke={colours.accent}
          strokeWidth={1.5}
        />

        <Circle
          cx={ROTOR_CENTRE_X}
          cy={ROTOR_CENTRE_Y}
          r={118}
          fill="none"
          stroke={colours.fineStroke}
          strokeWidth={1}
          strokeDasharray="5 7"
        />

        {/* Rotor */}
        <G
          transform={`rotate(
            ${rotorRotation}
            ${ROTOR_CENTRE_X}
            ${ROTOR_CENTRE_Y}
          )`}
        >
          {ROTOR_VANES.map((angle) => (
            <Rect
              key={angle}
              x={511}
              y={269}
              width={18}
              height={111}
              rx={3}
              fill={isDark ? '#555555' : '#9D9D9D'}
              stroke={colours.machineStroke}
              strokeWidth={1}
              transform={`rotate(
                ${angle}
                ${ROTOR_CENTRE_X}
                ${ROTOR_CENTRE_Y}
              )`}
            />
          ))}

          <Circle
            cx={ROTOR_CENTRE_X}
            cy={ROTOR_CENTRE_Y}
            r={43}
            fill={colours.machineRaised}
            stroke={colours.machineStroke}
            strokeWidth={2}
          />

          <Circle
            cx={ROTOR_CENTRE_X}
            cy={ROTOR_CENTRE_Y}
            r={16}
            fill={colours.machineDeep}
            stroke={colours.fineStroke}
            strokeWidth={1.5}
          />
        </G>

        {/* Discharge */}
        <Path
          d="
            M 405 542
            L 635 542
            L 680 650
            L 360 650
            Z
          "
          fill="url(#machineBody)"
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Rect
          x={344}
          y={642}
          width={352}
          height={20}
          rx={4}
          fill={colours.machineRaised}
          stroke={colours.machineStroke}
          strokeWidth={2}
        />

        <Polygon
          points="510,685 530,685 520,700"
          fill={colours.accent}
        />

        <SvgText
          x={520}
          y={730}
          fill={colours.muted}
          fontFamily="SpaceGrotesk_600SemiBold"
          fontSize={18}
          fontWeight="600"
          letterSpacing={5}
          textAnchor="middle"
        >
          DISCHARGE
        </SvgText>

      </Svg>
    </View>
  );
}
