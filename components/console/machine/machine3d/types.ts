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

/** Where the camera is asked to stand. */
export type MachineCameraMode = 'elevation' | 'free';

/** Imperative camera command, applied once per `id`. */
export type MachineCameraCommand = {
  id: number;
  kind: 'zoom-in' | 'zoom-out' | 'fit' | 'reset' | 'elevation';
};

export type MachineScene3DCanvasProps = {
  /** The asset to render, served from `public/`. */
  modelUrl: string;
  /**
   * Instrument anchors in model space, keyed by point code. Projected every
   * frame and published through `onProjectPoints`.
   */
  anchors: Readonly<Record<string, readonly [number, number, number]>>;
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
};
