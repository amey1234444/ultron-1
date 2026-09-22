import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G } from 'react-native-svg';

import { cn } from '../../../lib/cn';
import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_POINT_REGISTRY,
} from '../../../lib/twinScrewExtruderPoints';
import { MeasurementPad, padStateLabel, type MeasurementPadState } from './MeasurementPad';
import { TwinScrewArtwork } from './TwinScrewArtwork';

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
   * Retained for call-site compatibility. It controls rounded clipping only;
   * the machine layer stays transparent so the workspace owns the one visible
   * background and grid.
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
 * does not actually have an instrument. Each entry is mapped to exactly one of
 * the 35 marker centers supplied with the reference image.
 */
export type TwinScrewConnector = (typeof TWIN_SCREW_POINT_REGISTRY)[number];

export const TWIN_SCREW_CONNECTORS: readonly TwinScrewConnector[] = TWIN_SCREW_POINT_REGISTRY;

/** Canvas-toned separator used only inside active measurement pads. */
const PAD_PANEL = '#080b0d';

/**
 * The pad's status colour, and the ground its hollow centre is cut out of.
 *
 * The transparent machine layer exposes the console surface. This small dark
 * separator is retained inside an active pad so its green state remains legible
 * over both machine metal and a grid line without painting a background panel.
 */
const PAD_ACCENT = '#16c84a';

export function TwinScrewExtruder({
  className,
  style,
  showBackground = false,
  connectorState,
}: TwinScrewExtruderProps) {
  return (
    <View
      className={cn('w-full overflow-hidden', showBackground && 'rounded-2xl', className)}
      style={[
        {
          aspectRatio: VIEWBOX_WIDTH / VIEWBOX_HEIGHT,
          backgroundColor: 'transparent',
        },
        style,
      ]}
    >
      <TwinScrewArtwork />

      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        {/* The PNG owns idle rings. Only active states are over-painted. */}
        <G>
          {TWIN_SCREW_CONNECTORS.map((point) => {
            const state = connectorState?.[point.code] ?? 'idle';
            if (state === 'idle') return null;
            return (
              <MeasurementPad
                key={point.code}
                x={point.x}
                y={point.y}
                state={state}
                accent={PAD_ACCENT}
                panel={PAD_PANEL}
                label={`${point.label} — ${padStateLabel(state)}`}
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
}
