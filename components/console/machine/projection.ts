/**
 * Projecting instrument anchors onto the flat trail canvas.
 *
 * This was `machine3d/types.ts`, and the name outlived its subsystem: the 3D
 * machine viewer was removed once its root had no importers, leaving a
 * directory named for a renderer that no longer exists holding one file. What
 * survives is the projection maths the flat canvas still uses, so it is named
 * for that and sits beside the workspace that consumes it.
 *
 * The camera and canvas-prop types went with the renderer; nothing imported
 * them, and `projectionIsOnScreen` was never called.
 */
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

/** Full viewport expressed in the saved 1600×900 trail coordinate system. */
export function viewportMachineRect(bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  return { x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

export function clampProjectionFraction(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
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
