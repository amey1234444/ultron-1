import React, {
  type ReactNode,
  useMemo,
  useState,
} from 'react';

import {
  LayoutChangeEvent,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import Svg, {
  Circle,
  Path,
} from 'react-native-svg';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type CanvasPoint = {
  x: number;
  y: number;
};

type MeasurementPointLike = {
  id: string;
  status?: string;
  label?: string;
};

type PointArrangement = {
  card: CanvasPoint;
  machineAnchor: CanvasPoint;

  /**
   * Intermediate trail bend points.
   * Edit these to change the trail route without changing the machine.
   */
  bends: CanvasPoint[];
};

type Rav01LayoutCanvasProps<TPoint extends MeasurementPointLike> = {
  points: TPoint[];

  /**
   * Render your existing RotaryAirlockValve component here.
   */
  renderMachine: () => ReactNode;

  /**
   * Render your existing PointCard component here.
   */
  renderPointCard: (
    point: TPoint,
    index: number,
  ) => ReactNode;

  /**
   * Optional custom colour selector.
   */
  getTrailColour?: (
    point: TPoint,
    index: number,
  ) => string;

  style?: StyleProp<ViewStyle>;
};

/* -------------------------------------------------------------------------- */
/* Fixed design coordinate system                                             */
/* -------------------------------------------------------------------------- */

const SCENE_WIDTH = 1200;
const SCENE_HEIGHT = 680;

const POINT_CARD_WIDTH = 160;
const POINT_CARD_HEIGHT = 92;

const MACHINE_FRAME = {
  left: 345,
  top: 108,
  width: 520,
  height: 455,
};

/**
 * Visual order:
 *
 * 0–3   = left cards
 * 4–10  = right cards
 *
 * Only edit the coordinates below when you want to improve the arrangement.
 */
const RAV01_ARRANGEMENT: PointArrangement[] = [
  /* ---------------------------------------------------------------------- */
  /* Left column                                                           */
  /* ---------------------------------------------------------------------- */

  // T1 — upper hopper/bearing point
  {
    card: { x: 32, y: 56 },

    machineAnchor: {
      x: 456,
      y: 210,
    },

    bends: [
      { x: 250, y: 102 },
      { x: 330, y: 102 },
      { x: 390, y: 155 },
    ],
  },

  // V1 — upper left bearing
  {
    card: { x: 32, y: 210 },

    machineAnchor: {
      x: 380,
      y: 320,
    },

    bends: [
      { x: 250, y: 256 },
      { x: 320, y: 256 },
      { x: 350, y: 300 },
    ],
  },

  // V2 — lower left bearing
  {
    card: { x: 32, y: 362 },

    machineAnchor: {
      x: 380,
      y: 364,
    },

    bends: [
      { x: 250, y: 408 },
      { x: 320, y: 408 },
      { x: 350, y: 380 },
    ],
  },

  // V2 — lower housing/discharge
  {
    card: { x: 32, y: 514 },

    machineAnchor: {
      x: 456,
      y: 490,
    },

    bends: [
      { x: 250, y: 560 },
      { x: 335, y: 560 },
      { x: 395, y: 515 },
    ],
  },

  /* ---------------------------------------------------------------------- */
  /* Right column                                                          */
  /* ---------------------------------------------------------------------- */

  // V1 — upper hopper point
  {
    card: { x: 1008, y: 20 },

    machineAnchor: {
      x: 740,
      y: 210,
    },

    bends: [
      { x: 930, y: 66 },
      { x: 860, y: 66 },
      { x: 800, y: 145 },
    ],
  },

  // V1 — upper drive-side bearing
  {
    card: { x: 1008, y: 112 },

    machineAnchor: {
      x: 780,
      y: 290,
    },

    bends: [
      { x: 940, y: 158 },
      { x: 880, y: 158 },
      { x: 825, y: 230 },
    ],
  },

  // T2 — gearbox/process point
  {
    card: { x: 1008, y: 204 },

    machineAnchor: {
      x: 810,
      y: 320,
    },

    bends: [
      { x: 950, y: 250 },
      { x: 895, y: 250 },
      { x: 850, y: 290 },
    ],
  },

  // V2 — motor-side point
  {
    card: { x: 1008, y: 296 },

    machineAnchor: {
      x: 885,
      y: 340,
    },

    bends: [
      { x: 955, y: 342 },
      { x: 920, y: 342 },
    ],
  },

  // V1 — lower gearbox point
  {
    card: { x: 1008, y: 388 },

    machineAnchor: {
      x: 810,
      y: 370,
    },

    bends: [
      { x: 950, y: 434 },
      { x: 895, y: 434 },
      { x: 850, y: 395 },
    ],
  },

  // T1 — lower drive-side bearing
  {
    card: { x: 1008, y: 480 },

    machineAnchor: {
      x: 780,
      y: 430,
    },

    bends: [
      { x: 940, y: 526 },
      { x: 880, y: 526 },
      { x: 825, y: 455 },
    ],
  },

  // V1 — lower housing/discharge
  {
    card: { x: 1008, y: 572 },

    machineAnchor: {
      x: 740,
      y: 490,
    },

    bends: [
      { x: 930, y: 618 },
      { x: 860, y: 618 },
      { x: 800, y: 545 },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Trail utilities                                                            */
/* -------------------------------------------------------------------------- */

const TRAIL_COLOURS = {
  normal: '#E5E7EB',
  warning: '#E3B341',
  critical: '#F2624A',
  offline: '#737373',
};

function getDefaultTrailColour(
  status?: string,
) {
  const normalizedStatus =
    status?.trim().toLowerCase() ?? '';

  if (
    normalizedStatus.includes('critical') ||
    normalizedStatus.includes('alarm')
  ) {
    return TRAIL_COLOURS.critical;
  }

  if (normalizedStatus.includes('warning')) {
    return TRAIL_COLOURS.warning;
  }

  if (
    normalizedStatus.includes('offline') ||
    normalizedStatus.includes('not connected')
  ) {
    return TRAIL_COLOURS.offline;
  }

  return TRAIL_COLOURS.normal;
}

function createRoundedPath(
  points: CanvasPoint[],
  radius = 12,
) {
  if (points.length < 2) {
    return '';
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (
    let index = 1;
    index < points.length - 1;
    index += 1
  ) {
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

    if (
      previousDistance === 0 ||
      nextDistance === 0
    ) {
      path += ` L ${current.x} ${current.y}`;
      continue;
    }

    const appliedRadius = Math.min(
      radius,
      previousDistance / 2,
      nextDistance / 2,
    );

    const beforeCorner = {
      x:
        current.x -
        ((current.x - previous.x) /
          previousDistance) *
          appliedRadius,

      y:
        current.y -
        ((current.y - previous.y) /
          previousDistance) *
          appliedRadius,
    };

    const afterCorner = {
      x:
        current.x +
        ((next.x - current.x) /
          nextDistance) *
          appliedRadius,

      y:
        current.y +
        ((next.y - current.y) /
          nextDistance) *
          appliedRadius,
    };

    path += ` L ${beforeCorner.x} ${beforeCorner.y}`;

    path +=
      ` Q ${current.x} ${current.y}` +
      ` ${afterCorner.x} ${afterCorner.y}`;
  }

  const finalPoint =
    points[points.length - 1];

  path += ` L ${finalPoint.x} ${finalPoint.y}`;

  return path;
}

/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export function Rav01LayoutCanvas<
  TPoint extends MeasurementPointLike,
>({
  points,
  renderMachine,
  renderPointCard,
  getTrailColour,
  style,
}: Rav01LayoutCanvasProps<TPoint>) {
  const [container, setContainer] = useState({
    width: 1,
    height: 1,
  });

  const handleLayout = (
    event: LayoutChangeEvent,
  ) => {
    const { width, height } =
      event.nativeEvent.layout;

    setContainer({
      width: Math.max(width, 1),
      height: Math.max(height, 1),
    });
  };

  /**
   * Important:
   *
   * Fit by both width and height.
   * This prevents Actual View from becoming too large or cropped.
   */
  const scale = Math.min(
    container.width / SCENE_WIDTH,
    container.height / SCENE_HEIGHT,
  );

  const renderedSceneWidth =
    SCENE_WIDTH * scale;

  const renderedSceneHeight =
    SCENE_HEIGHT * scale;

  const desiredLeft =
    (container.width - renderedSceneWidth) / 2;

  const desiredTop =
    (container.height - renderedSceneHeight) / 2;

  /**
   * React Native applies scale from the centre.
   * These corrections make the scaled scene align properly.
   */
  const scaleCorrectionX =
    (SCENE_WIDTH - renderedSceneWidth) / 2;

  const scaleCorrectionY =
    (SCENE_HEIGHT - renderedSceneHeight) / 2;

  const visiblePoints = useMemo(
    () =>
      points
        .slice(0, RAV01_ARRANGEMENT.length)
        .map((point, index) => ({
          point,
          index,
          arrangement:
            RAV01_ARRANGEMENT[index],
        })),
    [points],
  );

  return (
    <View
      onLayout={handleLayout}
      style={[
        {
          flex: 1,
          minHeight: 500,
          overflow: 'hidden',
          backgroundColor: '#0A0A0A',
        },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',

          left:
            desiredLeft -
            scaleCorrectionX,

          top:
            desiredTop -
            scaleCorrectionY,

          width: SCENE_WIDTH,
          height: SCENE_HEIGHT,

          transform: [
            {
              scale,
            },
          ],
        }}
      >
        {/* Grid stays subtle and does not compete with the machine. */}
        <View
          pointerEvents="none"
          style={
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: 0.55,

              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',

              backgroundSize: '48px 48px',
            } as unknown as ViewStyle
          }
        />

        {/* Trails are rendered first so they sit behind the machine and cards. */}
        <Svg
          width={SCENE_WIDTH}
          height={SCENE_HEIGHT}
          viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
          }}
          pointerEvents="none"
        >
          {visiblePoints.map(
            ({
              point,
              index,
              arrangement,
            }) => {
              const isLeft =
                arrangement.card.x <
                SCENE_WIDTH / 2;

              const cardEndpoint = {
                x: isLeft
                  ? arrangement.card.x +
                    POINT_CARD_WIDTH
                  : arrangement.card.x,

                y:
                  arrangement.card.y +
                  POINT_CARD_HEIGHT / 2,
              };

              const pathPoints = [
                cardEndpoint,
                ...arrangement.bends,
                arrangement.machineAnchor,
              ];

              const colour =
                getTrailColour?.(
                  point,
                  index,
                ) ??
                getDefaultTrailColour(
                  point.status,
                );

              const path =
                createRoundedPath(
                  pathPoints,
                  11,
                );

              return (
                <React.Fragment
                  key={`trail-${point.id}`}
                >
                  {/* Dark underlay keeps trails readable over the machine. */}
                  <Path
                    d={path}
                    fill="none"
                    stroke="#0A0A0A"
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

                  {/* Point-card connection */}
                  <Circle
                    cx={cardEndpoint.x}
                    cy={cardEndpoint.y}
                    r={7}
                    fill="#0A0A0A"
                    stroke={colour}
                    strokeWidth={2}
                  />

                  <Circle
                    cx={cardEndpoint.x}
                    cy={cardEndpoint.y}
                    r={3}
                    fill={colour}
                  />

                  {/* Machine connection */}
                  <Circle
                    cx={
                      arrangement.machineAnchor.x
                    }
                    cy={
                      arrangement.machineAnchor.y
                    }
                    r={8}
                    fill="#0A0A0A"
                    stroke={colour}
                    strokeWidth={2}
                  />
                </React.Fragment>
              );
            },
          )}
        </Svg>

        {/* Existing machine design remains unchanged. */}
        <View
          style={{
            position: 'absolute',
            left: MACHINE_FRAME.left,
            top: MACHINE_FRAME.top,
            width: MACHINE_FRAME.width,
            height: MACHINE_FRAME.height,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {renderMachine()}
        </View>

        {/* Existing point cards remain unchanged. */}
        {visiblePoints.map(
          ({
            point,
            index,
            arrangement,
          }) => (
            <View
              key={`point-card-${point.id}`}
              style={{
                position: 'absolute',
                left: arrangement.card.x,
                top: arrangement.card.y,
                width: POINT_CARD_WIDTH,
                height: POINT_CARD_HEIGHT,
              }}
            >
              {renderPointCard(
                point,
                index,
              )}
            </View>
          ),
        )}
      </View>
    </View>
  );
}
