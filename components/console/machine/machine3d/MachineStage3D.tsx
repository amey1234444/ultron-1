/**
 * Shared entry point for the 3D machine stage.
 *
 * Isolates the rest of the console from three.js: the WebGL canvas is loaded
 * lazily *after mount* (so it never runs during Next's SSR pass) and only on
 * web. A WebGL failure or a missing/corrupt GLB degrades to a readable message
 * instead of taking the machine page down with it.
 *
 * Same shape as `plant3d/PlantScene3D`, which solves this for the yard.
 *
 * On top of the canvas it draws the instrument pads. They are the same
 * `MeasurementPad` the flat drawings use, in the same three states, but placed
 * from the per-frame projection instead of from a fixed sheet — so a pad stays
 * on the feature it measures while the operator orbits the machine.
 */
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { MachineLoadingRing } from './MachineLoadingRing';
import { markMachineReady, warmMachineAsset } from './machineAssetProgress';
import type { MachineCameraCommand, MachineCameraMode, ProjectedPoint } from './types';

const loadCanvas = () => import('./MachineScene3DCanvas');
const LazyCanvas = lazy(loadCanvas);

/**
 * Start the two downloads the stage needs, together.
 *
 * They used to run in series, and it was the single largest part of the wait.
 * `lazy` cannot ask for the asset until its chunk has arrived, because
 * `useGLTF.preload` lives *inside* that chunk -- so the browser fetched ~600 kB
 * of three.js, executed it, and only then discovered it wanted 3.6 MB of
 * machine. Kicking the asset off here overlaps the two, and with the model
 * route's cache header the loader's own request is then served from cache
 * rather than fetched twice.
 *
 * Deliberately fire-and-forget: this is a cache warm, not a data dependency.
 * If it fails, `useGLTF` still fetches the asset exactly as it did before.
 */
const warmed = new Set<string>();

function warmStage(modelUrl: string) {
  if (typeof window === 'undefined' || warmed.has(modelUrl)) return;
  warmed.add(modelUrl);
  void loadCanvas().catch(() => {});
  // Same single request as before; `warmMachineAsset` streams the body so the
  // loading ring can show real progress instead of an unlabelled wait.
  warmMachineAsset(modelUrl);
}

/** Absolute fill. Written out rather than `inset`, which RN styles do not take. */
const FILL = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;

/**
 * How often the projection is pushed into React.
 *
 * The projector runs every frame; the pads and the trail board do not need to.
 * 30 Hz keeps a pad visually glued to its feature during an orbit without
 * re-rendering three dozen of them sixty times a second.
 */
const PUBLISH_MS = 33;

/**
 * Why there is no flat marker layer here any more
 * ------------------------------------------------
 * There used to be one: an SVG ring per instrument, drawn over the canvas at
 * the projected coordinate, in three wiring states. It was the last piece of
 * the old flat-drawing console left on a stage that had since grown real
 * instrumentation ports -- so every instrument was being drawn twice, once as
 * a machined socket standing on the casting and once as a 2D circle floating
 * above it in a different visual language. On a 3D machine that reads exactly
 * as what it was: a drawing pasted over a render.
 *
 * The port carries the state now (`SensorHardPoints` grades its ring across
 * idle / linked / live), so nothing was lost by deleting the overlay -- the
 * information moved onto the hardware it describes, where it also inherits
 * depth testing, occlusion and the camera, none of which a screen-space circle
 * can have.
 *
 * The projection itself is untouched and still published through
 * `onProjectConnectors`: the trail board needs screen positions for its
 * endpoints and snap targets, and those still derive from the port's own world
 * position. What ended was drawing a second marker at that position.
 */

export type MachineStage3DProps = {
  modelUrl: string;
  anchors: Readonly<Record<string, readonly [number, number, number]>>;
  /** Spoken name per point code, for the pad's accessible label. */
  labels?: Readonly<Record<string, string>>;
  /** Wiring state per point code, forwarded to each 3D instrumentation port. */
  connectorState?: Record<string, 'idle' | 'linked' | 'live'>;
  dark: boolean;
  closed?: boolean;
  cameraMode?: MachineCameraMode;
  cameraCommand?: MachineCameraCommand | null;
  /**
   * Live instrument positions as fractions of this stage.
   *
   * `MachineWorkspace` folds these into the `MachineConnector` list it already
   * passes to `TrailBoard`, so trail endpoints snap to the projected pads
   * through the existing contract rather than a second one.
   */
  onProjectConnectors?: (points: ProjectedPoint[]) => void;
  onSelectPart?: (partId: string) => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * A terminal message: not-web, context lost, or a stage that threw.
 *
 * No spinner any more. Every state that is genuinely *waiting* now renders
 * `MachineLoadingRing` instead, so a `Notice` always means "this is as far as
 * it goes", and it no longer positions itself -- the status layer that mounts
 * it owns the centring for both.
 */
function Notice({ dark, message }: { dark: boolean; message: string }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Text
        style={{
          fontSize: 11.5,
          textAlign: 'center',
          paddingHorizontal: 24,
          color: dark ? 'rgba(245,245,245,0.62)' : 'rgba(17,24,39,0.55)',
        }}
      >
        {message}
      </Text>
    </View>
  );
}

/**
 * Catches a stage that throws, and tells the stage about it.
 *
 * `onFailed` is the important half. The boundary used to render its own
 * fallback in place of the canvas -- inside the layer the stage keeps at
 * `opacity: 0` until the first projection, which for a stage that never
 * projects is forever. The message existed and was invisible. Now the failure
 * is lifted into the stage, which draws it in a layer that is actually shown.
 */
class CanvasBoundary extends Component<
  { onFailed: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[machine-3d] stage failed to render', error);
    this.props.onFailed();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function MachineStage3D({
  modelUrl,
  anchors,
  labels,
  connectorState,
  dark,
  closed = false,
  cameraMode = 'free',
  cameraCommand = null,
  onProjectConnectors,
  onSelectPart,
  className,
  style,
}: MachineStage3DProps) {
  const [mounted, setMounted] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [points, setPoints] = useState<ProjectedPoint[]>([]);
  const [contextLost, setContextLost] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    warmStage(modelUrl);
    setMounted(true);
  }, [modelUrl]);
  useEffect(() => {
    setPoints([]);
    setContextLost(false);
    setFailed(false);
  }, [anchors, modelUrl]);

  const handleContextLost = useCallback(() => setContextLost(true), []);
  const handleFailed = useCallback(() => setFailed(true), []);

  // The canvas projects every frame; this coalesces to PUBLISH_MS.
  const latest = useRef<ProjectedPoint[] | null>(null);
  const lastPublished = useRef(0);

  const handleProject = useCallback(
    (next: ProjectedPoint[]) => {
      latest.current = next;
      const now = Date.now();
      if (now - lastPublished.current < PUBLISH_MS) return;
      lastPublished.current = now;
      setPoints(next);
      onProjectConnectors?.(next);
    },
    [onProjectConnectors],
  );

  // The first projection is the first frame in which the machine is provably
  // drawn, which is also the moment the loading ring has nothing left to say.
  const shown = points.length > 0;
  useEffect(() => {
    if (shown) markMachineReady(modelUrl);
  }, [shown, modelUrl]);

  /**
   * What the overlay layer has to say, or `null` when it should say nothing.
   *
   * Exactly one of these is true at a time, and none of them are the canvas --
   * which is why they are drawn in their own full-opacity layer rather than
   * inside the one that fades the machine in.
   */
  const overlay = (): ReactNode => {
    if (Platform.OS !== 'web') {
      return <Notice dark={dark} message="The 3D machine is available in the web console." />;
    }
    if (contextLost) {
      return <Notice dark={dark} message="The 3D view lost its graphics context. Reload to restore it." />;
    }
    if (failed) {
      return <Notice dark={dark} message="The 3D machine could not be displayed on this device." />;
    }
    if (!shown) {
      return <MachineLoadingRing dark={dark} modelUrl={modelUrl} />;
    }
    return null;
  };

  const canvas = () => {
    // `size` is a hard requirement, not a nicety: the canvas is given explicit
    // pixels so React Three Fiber cannot settle on a collapsed box. Until the
    // stage has been laid out there is no honest number to hand it, and
    // rendering with a guess is what produced a small machine in the corner of
    // an overlay that spanned the whole container.
    if (Platform.OS !== 'web' || !mounted || contextLost || !size) return null;
    if (size.width < 1 || size.height < 1) return null;
    return (
      <CanvasBoundary onFailed={handleFailed}>
        <Suspense fallback={null}>
          <LazyCanvas
            width={size.width}
            height={size.height}
            modelUrl={modelUrl}
            anchors={anchors}
            labels={labels}
            connectorState={connectorState}
            dark={dark}
            closed={closed}
            cameraMode={cameraMode}
            cameraCommand={cameraCommand}
            onProjectPoints={handleProject}
            onSelectPart={onSelectPart}
            onContextLost={handleContextLost}
          />
        </Suspense>
      </CanvasBoundary>
    );
  };

  return (
    <View
      className={className}
      style={[{ flex: 1 }, style]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize({ width, height });
      }}
    >
      {/* Faded in on the first real projection rather than on mount: that is
          the first moment the machine is known to be drawn, so the operator
          never sees an empty stage resolve into a populated one. */}
      <View
        style={[
          FILL,
          Platform.OS === 'web'
            ? ({ opacity: shown ? 1 : 0, transition: 'opacity 320ms ease-out' } as object)
            : null,
        ]}
      >
        {canvas()}
      </View>

      {/* Status layer. Deliberately a sibling of the fade above and never a
          child of it: everything here exists precisely for the window in which
          the machine is not yet drawn, so anything drawn inside that layer
          would be held at zero opacity for exactly as long as it had something
          to say. Pointer events are off so it never blocks the orbit controls
          during the fade-in. */}
      {(() => {
        const status = overlay();
        return status ? (
          <View
            style={[FILL, { alignItems: 'center', justifyContent: 'center' }]}
            pointerEvents="none"
          >
            {status}
          </View>
        ) : null;
      })()}

    </View>
  );
}
