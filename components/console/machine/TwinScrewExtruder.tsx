import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, parse } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_POINT_REGISTRY,
} from '../../../lib/twinScrewExtruderPoints';
import { MeasurementPad, padStateLabel, type MeasurementPadState } from './MeasurementPad';
import { buildTwinScrewExtruderArtwork } from './twinScrewArtwork';

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
   * Draw the drawing sheet and its engineering grid.
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
 * Every point this machine can report, at the spot on the drawing where the
 * instrument physically sits.
 *
 * The canvas snaps trail endpoints to this list and the default trail layout
 * places its cards from it, so a card can never attach to a place the artwork
 * does not actually have an instrument. The drawing renders one pad per entry
 * and never a hard-coded circle of its own — the marker dots the reference
 * drawing carried were dropped on the way in for exactly that reason.
 */
export type TwinScrewConnector = (typeof TWIN_SCREW_POINT_REGISTRY)[number];

export const TWIN_SCREW_CONNECTORS: readonly TwinScrewConnector[] = TWIN_SCREW_POINT_REGISTRY;

/**
 * The machine is one light drawing in both themes.
 *
 * It is a technical illustration — lit metal, cast shadows, a specular pass
 * over every housing — and the light it is lit by is part of the drawing rather
 * than a colour choice that can be inverted. Re-toning it for a dark console
 * would flatten the thing the reference does best, so it stays as drawn, the
 * way a drawing sheet on a desk stays white in a dark room.
 *
 * Only what sits *off* the machine follows the theme: the part names and their
 * leaders, which are read against the console rather than against the metal.
 */
const SHEET = '#fbfbfa';

/**
 * The pad's status colour, and the ground its hollow centre is cut out of.
 *
 * The ground is the sheet rather than the console surface because that is what
 * a pad is actually drawn on top of — an idle pad has to read as a hole in the
 * machine, not as a disc of console colour floating over it.
 */
const PAD_ACCENT = '#16c84a';

export function TwinScrewExtruder({
  className,
  style,
  showPartLabels = false,
  showBackground = false,
  connectorState,
}: TwinScrewExtruderProps) {
  const { isDark } = useAppTheme();

  const ink = isDark ? '#8B929C' : '#565c63';

  /**
   * The machine, parsed once per appearance.
   *
   * The artwork is emitted as SVG source and turned into react-native-svg nodes
   * here rather than being hand-transcribed into JSX. That is what keeps this
   * template honest about being the reference drawing: there is no second copy
   * of the geometry to drift, and the parse is exact — every gradient, pattern,
   * clip path and lighting filter in the source comes out the other side.
   *
   * Only three inputs can change the source, so this is at most a handful of
   * parses in a session, and none of them on a re-render that did not change
   * one of them.
   */
  const artwork = useMemo(
    () => parse(buildTwinScrewExtruderArtwork({ showBackground, showPartLabels, ink, sheet: SHEET })),
    [showBackground, showPartLabels, ink],
  );

  return (
    <View
      className={cn('w-full overflow-hidden', showBackground && 'rounded-2xl', className)}
      style={[
        {
          aspectRatio: VIEWBOX_WIDTH / VIEWBOX_HEIGHT,
          backgroundColor: showBackground ? SHEET : 'transparent',
        },
        style,
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
        {/* The machine. Its own <svg> wrapper is discarded and its children are
            mounted here instead, so the pads below share one coordinate space
            with it — a pad and the feature it measures scale together at every
            zoom, which is the whole reason the anchors are stored as fractions
            of this viewBox. */}
        {artwork?.children}

        {/* Instrument pads. One per registry entry, and nothing else. */}
        <G>
          {TWIN_SCREW_CONNECTORS.map((point) => {
            const state = connectorState?.[point.code] ?? 'idle';
            return (
              <MeasurementPad
                key={point.code}
                x={point.x}
                y={point.y}
                state={state}
                accent={PAD_ACCENT}
                panel={SHEET}
                label={`${point.label} — ${padStateLabel(state)}`}
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
}
