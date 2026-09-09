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
import { ActivityIndicator, Platform, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { consolePalette } from '../../../ui';
import { padStateLabel, type MeasurementPadState } from '../MeasurementPad';
import type { MachineCameraCommand, MachineCameraMode, ProjectedPoint } from './types';

const LazyCanvas = lazy(() => import('./MachineScene3DCanvas'));

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

/** A depth-safe marker whose idle centre leaves the machine surface visible. */
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
  const under = dark ? 'rgba(250,252,252,0.78)' : 'rgba(7,12,16,0.72)';

  return (
    <G {...markerAria(label)}>
      {live ? <Circle cx={x} cy={y} r={12} fill={accent} opacity={0.18} /> : null}
      {wired ? <Circle cx={x} cy={y} r={8.5} fill={accent} opacity={0.2} /> : null}
      <Circle cx={x} cy={y} r={6.4} fill="none" stroke={under} strokeWidth={3.4} opacity={0.72} />
      <Circle
        cx={x}
        cy={y}
        r={6.1}
        fill={wired ? accent : 'none'}
        fillOpacity={wired ? 0.9 : 0}
        stroke={accent}
        strokeWidth={wired ? 1.4 : 1.8}
      />
      {wired ? <Circle cx={x} cy={y} r={1.8} fill="#FFFFFF" opacity={0.9} /> : null}
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

function Notice({ dark, message, spinner = false }: { dark: boolean; message: string; spinner?: boolean }) {
  return (
    <View style={{ ...FILL, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {spinner ? <ActivityIndicator size="small" color={dark ? '#F5F5F5' : '#111827'} /> : null}
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

class CanvasBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[machine-3d] stage failed to render', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
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

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setPoints([]);
    setContextLost(false);
  }, [anchors, modelUrl]);

  const handleContextLost = useCallback(() => setContextLost(true), []);

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

  const canvas = () => {
    if (Platform.OS !== 'web') {
      return <Notice dark={dark} message="The 3D machine is available in the web console." />;
    }
    if (!mounted) {
      return <Notice dark={dark} message="Preparing machine…" spinner />;
    }
    if (contextLost) {
      return <Notice dark={dark} message="The 3D view lost its graphics context. Reload to restore it." />;
    }
    return (
      <CanvasBoundary fallback={<Notice dark={dark} message="The 3D machine could not be displayed on this device." />}>
        <Suspense fallback={<Notice dark={dark} message="Loading machine…" spinner />}>
          <LazyCanvas
            modelUrl={modelUrl}
            anchors={anchors}
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
            ? ({ opacity: points.length > 0 ? 1 : 0, transition: 'opacity 320ms ease-out' } as object)
            : null,
        ]}
      >
        {canvas()}
      </View>

      {/* Instrument pads, placed from the live projection. Pointer events stay
          off: the trail board above this layer owns hit-testing and wiring, the
          same way it does for the flat drawings. */}
      {size && points.length > 0 ? (
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
