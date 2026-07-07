import React, { useState } from 'react';
import {
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { RotaryAirlockValve } from './RotaryAirlockValve';

const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 820;

const CARD_WIDTH = 215;
const CARD_HEIGHT = 88;

type Point = {
  x: number;
  y: number;
};

type CardStatus = 'normal' | 'warning' | 'critical' | 'offline';

type PointCard = {
  id: string;
  side: 'left' | 'right';

  x: number;
  y: number;

  tag: string;
  channel: string;
  title: string;
  value: string;
  unit: string;

  status: CardStatus;
};

type TrailTone = 'neutral' | 'normal' | 'warning' | 'critical';

type TrailDefinition = {
  id: string;
  cardId: string;
  tone: TrailTone;

  /**
   * First point: card-side endpoint
   * Last point: machine-side endpoint
   *
   * Add, remove or reposition intermediate points
   * to change the trail arrangement.
   */
  points: Point[];
};

type RotaryAirlockMappingProps = {
  style?: StyleProp<ViewStyle>;
};

/**
 * Adjust only x and y values here to reposition boxes.
 */
const CARDS: PointCard[] = [
  // Left column
  {
    id: 'left-t1',
    side: 'left',
    x: 40,
    y: 80,
    tag: 'T1',
    channel: 'T1',
    title: 'RAV-01 Rotor Bearing Temp',
    value: '63.2',
    unit: '°C',
    status: 'normal',
  },
  {
    id: 'left-v1',
    side: 'left',
    x: 40,
    y: 250,
    tag: 'V1',
    channel: 'V1',
    title: 'RAV-01 DE Vibration H',
    value: '5.00',
    unit: 'mm/s',
    status: 'critical',
  },
  {
    id: 'left-v2-mid',
    side: 'left',
    x: 40,
    y: 420,
    tag: 'V2',
    channel: 'V2',
    title: 'RAV-01 DE Vibration V',
    value: '5.37',
    unit: 'mm/s',
    status: 'critical',
  },
  {
    id: 'left-v2-bottom',
    side: 'left',
    x: 40,
    y: 590,
    tag: 'V2',
    channel: 'V2',
    title: 'RAV-01 DE Vibration V',
    value: '1.86',
    unit: 'mm/s',
    status: 'normal',
  },

  // Right column
  {
    id: 'right-v1-top',
    side: 'right',
    x: 1185,
    y: 35,
    tag: 'V1',
    channel: 'V1',
    title: 'RAV-01 DE Vibration H',
    value: '1.79',
    unit: 'mm/s',
    status: 'normal',
  },
  {
    id: 'right-v1-second',
    side: 'right',
    x: 1185,
    y: 140,
    tag: 'V1',
    channel: 'V1',
    title: 'RAV-01 DE Vibration H',
    value: '3.09',
    unit: 'mm/s',
    status: 'normal',
  },
  {
    id: 'right-t2',
    side: 'right',
    x: 1185,
    y: 245,
    tag: 'T2',
    channel: 'T2',
    title: 'Process Card CH2',
    value: '70.1',
    unit: '°C',
    status: 'warning',
  },
  {
    id: 'right-v2',
    side: 'right',
    x: 1185,
    y: 350,
    tag: 'V2',
    channel: 'V2',
    title: 'RAV-01 DE Vibration V',
    value: '3.19',
    unit: 'mm/s',
    status: 'normal',
  },
  {
    id: 'right-v1-middle',
    side: 'right',
    x: 1185,
    y: 455,
    tag: 'V1',
    channel: 'V1',
    title: 'RAV-01 DE Vibration H',
    value: '3.44',
    unit: 'mm/s',
    status: 'normal',
  },
  {
    id: 'right-t1',
    side: 'right',
    x: 1185,
    y: 560,
    tag: 'T1',
    channel: 'T1',
    title: 'RAV-01 Rotor Bearing Temp',
    value: '76.0',
    unit: '°C',
    status: 'warning',
  },
  {
    id: 'right-v1-bottom',
    side: 'right',
    x: 1185,
    y: 665,
    tag: 'V1',
    channel: 'V1',
    title: 'RAV-01 DE Vibration H',
    value: '3.69',
    unit: 'mm/s',
    status: 'normal',
  },
];

/**
 * Adjust the trail points here.
 *
 * The first point sits at the box.
 * The last point sits on the machine.
 * Intermediate points control the bends.
 */
const TRAILS: TrailDefinition[] = [
  // Left trails
  {
    id: 'trail-left-t1',
    cardId: 'left-t1',
    tone: 'neutral',
    points: [
      { x: 255, y: 124 },
      { x: 415, y: 124 },
      { x: 455, y: 160 },
      { x: 495, y: 230 },
    ],
  },
  {
    id: 'trail-left-v1',
    cardId: 'left-v1',
    tone: 'critical',
    points: [
      { x: 255, y: 294 },
      { x: 355, y: 294 },
      { x: 395, y: 330 },
      { x: 395, y: 365 },
    ],
  },
  {
    id: 'trail-left-v2-mid',
    cardId: 'left-v2-mid',
    tone: 'critical',
    points: [
      { x: 255, y: 464 },
      { x: 355, y: 464 },
      { x: 395, y: 425 },
      { x: 395, y: 400 },
    ],
  },
  {
    id: 'trail-left-v2-bottom',
    cardId: 'left-v2-bottom',
    tone: 'neutral',
    points: [
      { x: 255, y: 634 },
      { x: 410, y: 634 },
      { x: 455, y: 600 },
      { x: 495, y: 570 },
    ],
  },

  // Right trails
  {
    id: 'trail-right-v1-top',
    cardId: 'right-v1-top',
    tone: 'neutral',
    points: [
      { x: 1185, y: 79 },
      { x: 1035, y: 79 },
      { x: 995, y: 118 },
      { x: 925, y: 230 },
    ],
  },
  {
    id: 'trail-right-v1-second',
    cardId: 'right-v1-second',
    tone: 'neutral',
    points: [
      { x: 1185, y: 184 },
      { x: 1040, y: 184 },
      { x: 1005, y: 220 },
      { x: 965, y: 305 },
    ],
  },
  {
    id: 'trail-right-t2',
    cardId: 'right-t2',
    tone: 'warning',
    points: [
      { x: 1185, y: 289 },
      { x: 1045, y: 289 },
      { x: 1005, y: 330 },
      { x: 965, y: 375 },
    ],
  },
  {
    id: 'trail-right-v2',
    cardId: 'right-v2',
    tone: 'neutral',
    points: [
      { x: 1185, y: 394 },
      { x: 1090, y: 394 },
    ],
  },
  {
    id: 'trail-right-v1-middle',
    cardId: 'right-v1-middle',
    tone: 'neutral',
    points: [
      { x: 1185, y: 499 },
      { x: 1045, y: 499 },
      { x: 1005, y: 460 },
      { x: 965, y: 430 },
    ],
  },
  {
    id: 'trail-right-t1',
    cardId: 'right-t1',
    tone: 'warning',
    points: [
      { x: 1185, y: 604 },
      { x: 1040, y: 604 },
      { x: 1000, y: 565 },
      { x: 965, y: 530 },
    ],
  },
  {
    id: 'trail-right-v1-bottom',
    cardId: 'right-v1-bottom',
    tone: 'warning',
    points: [
      { x: 1185, y: 709 },
      { x: 1035, y: 709 },
      { x: 980, y: 650 },
      { x: 910, y: 565 },
    ],
  },
];

const STATUS_COLOURS: Record<CardStatus, string> = {
  normal: '#3FB950',
  warning: '#F2A93B',
  critical: '#EF4444',
  offline: '#737373',
};

const TRAIL_COLOURS: Record<TrailTone, string> = {
  neutral: '#E6E6E6',
  normal: '#3FB950',
  warning: '#F2A93B',
  critical: '#EF4444',
};

function createRoundedTrailPath(points: Point[], radius = 12) {
  if (points.length < 2) return '';

  let result = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];

    const previousDistance = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
    );

    const nextDistance = Math.hypot(
      next.x - current.x,
      next.y - current.y,
    );

    if (previousDistance === 0 || nextDistance === 0) {
      result += ` L ${current.x} ${current.y}`;
      continue;
    }

    const cornerRadius = Math.min(
      radius,
      previousDistance / 2,
      nextDistance / 2,
    );

    const beforeCorner = {
      x:
        current.x -
        ((current.x - previous.x) / previousDistance) *
          cornerRadius,
      y:
        current.y -
        ((current.y - previous.y) / previousDistance) *
          cornerRadius,
    };

    const afterCorner = {
      x:
        current.x +
        ((next.x - current.x) / nextDistance) *
          cornerRadius,
      y:
        current.y +
        ((next.y - current.y) / nextDistance) *
          cornerRadius,
    };

    result += ` L ${beforeCorner.x} ${beforeCorner.y}`;
    result += ` Q ${current.x} ${current.y} ${afterCorner.x} ${afterCorner.y}`;
  }

  const lastPoint = points[points.length - 1];

  result += ` L ${lastPoint.x} ${lastPoint.y}`;

  return result;
}

function MappingCard({ card }: { card: PointCard }) {
  const statusColour = STATUS_COLOURS[card.status];

  return (
    <View
      style={{
        position: 'absolute',
        left: card.x,
        top: card.y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        overflow: 'hidden',
        borderRadius: 11,
        borderWidth: 1,
        borderColor: 'rgba(63,185,80,0.26)',
        backgroundColor: '#121313',
        shadowColor: '#000000',
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: {
          width: 0,
          height: 4,
        },
      }}
    >
      <View
        style={{
          height: 22,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.05)',
          paddingHorizontal: 10,
        }}
      >
        <Text
          style={{
            color: '#777777',
            fontFamily: 'Inter',
            fontSize: 9,
          }}
        >
          point
        </Text>

        <View
          style={{
            minWidth: 21,
            height: 17,
            paddingHorizontal: 5,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <Text
            style={{
              color: '#777777',
              fontFamily: 'IBM Plex Mono',
              fontSize: 8,
            }}
          >
            {card.channel}
          </Text>
        </View>
      </View>

      <View
        style={{
          flex: 1,
          paddingHorizontal: 11,
          paddingTop: 6,
          paddingBottom: 8,
        }}
      >
        <Text
          style={{
            color: statusColour,
            fontFamily: 'Space Grotesk',
            fontSize: 14,
            fontWeight: '600',
          }}
        >
          {card.tag}
        </Text>

        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            marginTop: 3,
            color: '#818181',
            fontFamily: 'Inter',
            fontSize: 10,
          }}
        >
          {card.title}
        </Text>

        <View
          style={{
            marginTop: 'auto',
            flexDirection: 'row',
            alignItems: 'baseline',
          }}
        >
          <Text
            style={{
              color: statusColour,
              fontFamily: 'IBM Plex Mono',
              fontSize: 14,
              fontWeight: '600',
            }}
          >
            {card.value}
          </Text>

          <Text
            style={{
              marginLeft: 5,
              color: statusColour,
              fontFamily: 'IBM Plex Mono',
              fontSize: 11,
              fontWeight: '600',
            }}
          >
            {card.unit}
          </Text>
        </View>
      </View>
    </View>
  );
}

function TrailsLayer() {
  return (
    <Svg
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
      }}
      pointerEvents="none"
    >
      {TRAILS.map((trail) => {
        const colour = TRAIL_COLOURS[trail.tone];
        const path = createRoundedTrailPath(trail.points);

        const firstPoint = trail.points[0];
        const lastPoint = trail.points[trail.points.length - 1];

        return (
          <React.Fragment key={trail.id}>
            <Path
              d={path}
              fill="none"
              stroke="rgba(0,0,0,0.7)"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <Path
              d={path}
              fill="none"
              stroke={colour}
              strokeWidth={1.7}
              strokeDasharray="7 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Card endpoint */}
            <Circle
              cx={firstPoint.x}
              cy={firstPoint.y}
              r={8}
              fill="#0A0A0A"
              stroke={colour}
              strokeWidth={2}
            />

            <Circle
              cx={firstPoint.x}
              cy={firstPoint.y}
              r={3.5}
              fill={colour}
            />

            {/* Machine endpoint */}
            <Circle
              cx={lastPoint.x}
              cy={lastPoint.y}
              r={9}
              fill="#0A0A0A"
              stroke={colour}
              strokeWidth={2}
            />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

export function RotaryAirlockMapping({
  style,
}: RotaryAirlockMappingProps) {
  // Measures the *actual* parent container (the workspace canvas area, already
  // net of the sidebar/toolbar chrome) instead of the raw window width, so this
  // sizes correctly wherever it's embedded rather than assuming it owns the
  // whole browser window.
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  const availableWidth = Math.max(320, (containerWidth ?? CANVAS_WIDTH) - 24);

  const renderedWidth = Math.min(
    CANVAS_WIDTH,
    availableWidth,
  );

  const scale = renderedWidth / CANVAS_WIDTH;
  const renderedHeight = CANVAS_HEIGHT * scale;

  /**
   * React Native scales from the component centre.
   * These offsets keep the scaled canvas aligned to the top-left.
   */
  const offsetX =
    -(CANVAS_WIDTH - renderedWidth) / 2;

  const offsetY =
    -(CANVAS_HEIGHT - renderedHeight) / 2;

  return (
    <View
      style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <View
        style={[
          {
            width: renderedWidth,
            height: renderedHeight,
            alignSelf: 'center',
            overflow: 'hidden',
            borderRadius: 16,
            backgroundColor: '#0A0A0A',
          },
          style,
        ]}
      >
        <View
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            transform: [{ scale }],
          }}
        >
          {/* Keep your existing machine design unchanged */}
          <View
            style={{
              position: 'absolute',
              left: 315,
              top: 130,
              width: 800,
              height: 560,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RotaryAirlockValve
              showBackground={false}
              rotorRotation={0}
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          </View>

          {/* Trails behind cards */}
          <TrailsLayer />

          {/* Mapping cards */}
          {CARDS.map((card) => (
            <MappingCard
              key={card.id}
              card={card}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
