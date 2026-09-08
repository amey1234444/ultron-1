import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  TWIN_SCREW_ARTWORK_HEIGHT,
  TWIN_SCREW_ARTWORK_WIDTH,
  TWIN_SCREW_POINT_REGISTRY,
} from '../../../lib/twinScrewExtruderPoints';
import { MeasurementPad, padStateLabel, type MeasurementPadState } from './MeasurementPad';
import TwinScrewExtruder3D from './TwinScrewExtruder3D';

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
   * Draw the drawing sheet behind the machine.
   *
   * Left false on the machine canvas: the workspace already paints its own grid
   * behind the stage. Set true when the drawing is shown on its own.
   */
  showBackground?: boolean;

  /** Draw the barrel closed instead of cut away. */
  closed?: boolean;
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
 * places its cards from it, so a card can never attach to a place the machine
 * does not actually have an instrument.
 */
export type TwinScrewConnector = (typeof TWIN_SCREW_POINT_REGISTRY)[number];

export const TWIN_SCREW_CONNECTORS: readonly TwinScrewConnector[] = TWIN_SCREW_POINT_REGISTRY;

/**
 * The sheet the machine sits on, per theme.
 *
 * These also stand in for the ground behind a pad: an idle pad is a hole cut in
 * the machine, so its centre has to be the colour the machine sits on.
 */
const SHEET_LIGHT = '#fbfbfa';
const SHEET_DARK = '#0d0e10';

/** The pad's status colour. */
const PAD_ACCENT = '#16c84a';

/**
 * The twin-screw extruder.
 *
 * The machine is the 3D asset at `public/models/machines/twin-screw-extruder.glb`
 * — a modular nine-station barrel, a two-path feeding system, a devolatilisation
 * vent, a screen-pack/die discharge train, and two complete Erdmenger screw
 * shafts that genuinely self-wipe against one another. It is rendered through a
 * locked orthographic elevation framed so the machine lands on this component's
 * own 1648 x 928 sheet exactly where the point registry expects it.
 *
 * The pads are unchanged and still drawn here, in sheet coordinates, on top of
 * the render. That is what keeps `machineConnectors`, `TrailBoard` and every
 * saved card layout working across the swap: they all address instruments by
 * `rx`/`ry` fractions of this sheet, and those fractions did not move.
 *
 * On native the 3D canvas resolves to a stub — Metro has no WebGL surface — so
 * the pads draw over an empty stage rather than the bundle pulling three.js in.
 */
export function TwinScrewExtruder({
  className,
  style,
  showBackground = false,
  closed = false,
  connectorState,
}: TwinScrewExtruderProps) {
  const { isDark } = useAppTheme();
  const sheet = isDark ? SHEET_DARK : SHEET_LIGHT;

  return (
    <View
      className={cn('w-full overflow-hidden', showBackground && 'rounded-2xl', className)}
      style={[
        {
          aspectRatio: VIEWBOX_WIDTH / VIEWBOX_HEIGHT,
          backgroundColor: showBackground ? sheet : 'transparent',
        },
        style,
      ]}
    >
      {/* The machine. Fills the stage exactly, so a pad at sheet (x, y) lands on
          the feature at that spot in the render. */}
      {Platform.OS === 'web' ? (
        <View style={{ position: 'absolute', inset: 0 }} pointerEvents="none">
          <TwinScrewExtruder3D closed={closed} dark={isDark} />
        </View>
      ) : null}

      {/* Instrument pads. One per registry entry, and nothing else. */}
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        style={{ position: 'absolute', inset: 0 }}
      >
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
                panel={sheet}
                label={`${point.label} — ${padStateLabel(state)}`}
              />
            );
          })}
        </G>
      </Svg>
    </View>
  );
}
