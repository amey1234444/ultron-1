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
import Svg, { Circle, G } from 'react-native-svg';

import { consolePalette } from '../../../ui';
import { padStateLabel, type MeasurementPadState } from '../MeasurementPad';
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

function markerAria(label: string | undefined): Record<string, string> {
  return label ? { 'aria-label': label, role: 'img' } : { 'aria-hidden': 'true' };
}

/**
 * The wiring state of one instrument, drawn over its physical port.
 *
 * The port itself is 3D -- a socket, a stem and a green ring bolted to the
 * component -- and it is what the operator reads as "there is an instrument
 * here". This layer only says what the console knows about that instrument:
 * whether it is unmapped, linked, or carrying live data. It is therefore
 * deliberately slight. The old marker was a 12 px halo around a 6 px filled
 * disc, which is what made the set look like map pins scattered over a render;
 * at this weight the machine keeps its own hardware and the overlay adds a
 * state, not a second marker.
 */
function InstrumentMarker3D({
  x,
  y,
  state,
  accent,
  dark,
  label,
}: {
  x: number;
  y: number;
  state: MeasurementPadState;
  accent: string;
  dark: boolean;
  label?: string;
}) {
  const wired = state !== 'idle';
  const live = state === 'live';
  // A hairline of the opposite value, so the ring survives both a bright hopper
  // and a near-black cavity without needing a heavy halo to do it.
  const under = dark ? 'rgba(6,10,13,0.55)' : 'rgba(248,250,251,0.60)';
  const radius = wired ? 5.4 : 4.8;

  return (
    <G {...markerAria(label)}>
      {live ? <Circle cx={x} cy={y} r={8.2} fill={accent} opacity={0.13} /> : null}
      <Circle cx={x} cy={y} r={radius} fill="none" stroke={under} strokeWidth={2.2} opacity={0.7} />
      <Circle
        cx={x}
        cy={y}
        r={radius}
        fill="none"
        stroke={accent}
        strokeWidth={wired ? 1.5 : 1.0}
        opacity={wired ? 1 : 0.62}
      />
      {wired ? <Circle cx={x} cy={y} r={1.7} fill={accent} opacity={0.95} /> : null}
    </G>
  );
}

export type MachineStage3DProps = {
  modelUrl: string;
  anchors: Readonly<Record<string, readonly [number, number, number]>>;
  /** Spoken name per point code, for the pad's accessible label. */
  labels?: Readonly<Record<string, string>>;
  connectorState?: Record<string, MeasurementPadState>;
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
  const palette = consolePalette(dark);
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
    if (Platform.OS !== 'web' || !mounted || contextLost) return null;
    return (
      <CanvasBoundary onFailed={handleFailed}>
        <Suspense fallback={null}>
          <LazyCanvas
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

      {/* Instrument pads, placed from the live projection. Pointer events stay
          off: the trail board above this layer owns hit-testing and wiring, the
          same way it does for the flat drawings. */}
      {size && shown ? (
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${Math.max(size.width, 1)} ${Math.max(size.height, 1)}`}
          style={FILL}
          pointerEvents="none"
        >
          <G>
            {points.map((point) => {
              const state = connectorState?.[point.code] ?? 'idle';
              const name = labels?.[point.code] ?? point.code;
              const visible = point.onScreen && !point.occluded;
              return (
                <G key={point.code} opacity={visible ? 1 : 0}>
                  <InstrumentMarker3D
                    x={point.rx * size.width}
                    y={point.ry * size.height}
                    state={state}
                    accent={palette.accent}
                    dark={dark}
                    label={visible ? `${name} — ${padStateLabel(state)}` : undefined}
                  />
                </G>
              );
            })}
          </G>
        </Svg>
      ) : null}
    </View>
  );
}
