/**
 * Canvas contract, shared by both platform builds.
 *
 * `MachineScene3DCanvas` exists twice — a real WebGL implementation in
 * `.web.tsx` and a null stub in `.tsx` so the native bundle never pulls in
 * three.js. Only one is ever bundled, but TypeScript resolves the plain
 * `.tsx`, so the props live here and both files import them.
 *
 * Mirrors `plant3d/types.ts`, which solves the same problem for the yard.
 */

/**
 * One instrument's screen position for the frame, produced by the in-canvas
 * projector and consumed by the pad overlay and the trail board.
 *
 * `rx`/`ry` are fractions of the canvas, which is what makes this drop into the
 * existing connector contract unchanged: `MachineConnector` already carries
 * `rx`/`ry` as fractions of the machine rect, and `TrailBoard` already maps
 * them onto the stage. The only thing that changes when the machine becomes a
 * 3D model is that those fractions are recomputed each frame instead of being
 * read off a fixed drawing.
 */
export type ProjectedPoint = {
  code: string;
  /** Fraction of the canvas, 0..1 from the left / top edge. */
  rx: number;
  ry: number;
  /** Distance from the camera, for front-to-back priority. */
  distance: number;
  /** False when the anchor is behind the camera or well off-screen. */
  onScreen: boolean;
  /** True when solid geometry stands between the camera and the anchor. */
  occluded: boolean;
};

export type ProjectedConnectorPosition = {
  rx: number;
  ry: number;
  /** False means retain the position for its trail, but do not offer a snap target. */
  visible: boolean;
};

export type ProjectedConnectorMap = Record<string, ProjectedConnectorPosition>;

export function clampProjectionFraction(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export function projectionIsOnScreen(
  ndc: Readonly<{ x: number; y: number; z: number }>,
  viewZ: number,
): boolean {
  return (
    Number.isFinite(ndc.x) &&
    Number.isFinite(ndc.y) &&
    Number.isFinite(ndc.z) &&
    Number.isFinite(viewZ) &&
    viewZ < 0 &&
    ndc.z >= -1 &&
    ndc.z <= 1 &&
    ndc.x >= -1 &&
    ndc.x <= 1 &&
    ndc.y >= -1 &&
    ndc.y <= 1
  );
}

/**
 * Merge a frame into the last valid connector positions.
 *
 * An orbit can take a point off-screen for a few frames. Its trail must stay at
 * the last real 3D projection instead of jumping back to the old artwork map.
 * Occluded points still update geometrically, but are disabled as snap targets.
 */
export function mergeProjectedConnectorPositions(
  current: ProjectedConnectorMap | null,
  points: readonly ProjectedPoint[],
): ProjectedConnectorMap {
  const next: ProjectedConnectorMap = current ? { ...current } : {};
  for (const point of points) {
    const previous = next[point.code];
    const finite = Number.isFinite(point.rx) && Number.isFinite(point.ry);
    if (point.onScreen && finite) {
      next[point.code] = {
        rx: clampProjectionFraction(point.rx),
        ry: clampProjectionFraction(point.ry),
        visible: !point.occluded,
      };
    } else if (previous) {
      next[point.code] = { ...previous, visible: false };
    }
  }
  return next;
}

/** Where the camera is asked to stand. */
export type MachineCameraMode = 'elevation' | 'free';

/** Imperative camera command, applied once per `id`. */
export type MachineCameraCommand = {
  id: number;
  kind: 'fit' | 'reset';
};

/**
 * Wiring state per point code, as the console already models it.
 *
 * Passed straight through to the hard points so a port's ring brightens when
 * its instrument is linked or live. The mapping between a `code` and a channel
 * is not this module's business and is never rewritten here.
 */
export type HardPointStateMap = Readonly<Record<string, 'idle' | 'linked' | 'live'>>;

export type MachineScene3DCanvasProps = {
  /** The asset to render, served from `public/`. */
  modelUrl: string;
  /**
   * Instrument anchors in model space, keyed by point code. Projected every
   * frame and published through `onProjectPoints`.
   */
  anchors: Readonly<Record<string, readonly [number, number, number]>>;
  /** Spoken name per point code, for the port's accessible description. */
  labels?: Readonly<Record<string, string>>;
  /** Wiring state per point code, which decides each port's ring brightness. */
  connectorState?: HardPointStateMap;
  dark: boolean;
  /** Draw the barrel closed instead of cut away. */
  closed?: boolean;
  /** Free orbit, or locked to the reference elevation. */
  cameraMode?: MachineCameraMode;
  cameraCommand?: MachineCameraCommand | null;
  /** Per-frame screen geometry for the pad overlay and the trail board. */
  onProjectPoints?: (points: ProjectedPoint[]) => void;
  /** Fired once the asset has loaded and the first frame has been projected. */
  onReady?: () => void;
  /** Pointer went down on the model rather than on empty space. */
  onSelectPart?: (partId: string) => void;
  /** Pointer went down on an instrumentation port, by point code. */
  onSelectHardPoint?: (code: string) => void;
  /** The GPU dropped the drawing buffer; the stage shows a notice, not a hole. */
  onContextLost?: () => void;
  /**
   * The drawing surface, in CSS pixels, measured by the stage.
   *
   * Passed explicitly rather than left to `width: 100%`. React Three Fiber sizes
   * its canvas from a `ResizeObserver` on the wrapper it renders, and a wrapper
   * whose height is a percentage of a percentage of a flex child does not always
   * resolve to a usable box before that observer first fires. When it does not,
   * the canvas settles at some smaller size and -- because the default alignment
   * is flex-start -- sits in the top-left corner of the space it was supposed to
   * fill. The machine then renders small and off-centre, its ground plane is
   * clipped at the canvas edge rather than fading, and every overlay that spans
   * the *container* (the pad markers, the trail board's machine rect) addresses a
   * box roughly twice the size of the one the projection fractions belong to --
   * which is the whole "flat markers scattered over a 3D scene" failure.
   *
   * A measured pixel size removes the ambiguity: the canvas is exactly the box
   * the stage measured, so the projection basis and every overlay share one rect
   * by construction.
   */
  width: number;
  height: number;
};
