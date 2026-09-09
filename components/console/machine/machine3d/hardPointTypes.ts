/**
 * Sensor hard points: the physical instrumentation ports on the machine.
 *
 * A marker used to be a circle drawn on top of the canvas at a projected
 * coordinate. That is a UI decoration that happens to sit near some metal, and
 * it reads as one: it floats, it does not turn with the surface, and nothing
 * about it says the machine was built to be instrumented.
 *
 * A hard point is the opposite. It is a small piece of real hardware -- a
 * socket bedded into a component, a machined boss, a short stem and a
 * connection face -- that exists in model space as a child of the component it
 * is bolted to. It therefore follows every translation, rotation and scale the
 * asset or the camera applies, for free, because it is part of the machine.
 *
 * The separation this file draws is the important one:
 *
 *   data identity   -- `code`, owned by the point registry and the channel map
 *   physical port   -- `parent` / `position` / `normal`, measured off the GLB
 *
 * A hard point never invents a `code`. It only says where the instrument the
 * console already knows about is physically installed, so renaming a channel
 * and moving a port stay two different operations.
 */

/** One measured instrumentation port, in its owning node's local frame. */
export type SensorHardPointSpec = {
  /** Registry point code. Stable data identity; never derived from geometry. */
  code: string;
  /** Authored GLB node the port is bolted to, by name. */
  parent: string;
  /** The node's authored part group, for grouping and debug output. */
  partGroup: string;
  /** Contact point on the component surface, in the parent node's local frame. */
  position: readonly [number, number, number];
  /** Outward surface normal at the contact point, same frame. */
  normal: readonly [number, number, number];
};

/**
 * Port dimensions, in metres on a machine roughly 3.05 m long.
 *
 * Deliberately small. At the default framing the connection face is about ten
 * pixels across -- the size of a real M12 instrument boss, not of a map pin.
 * Everything is measured from the contact point along the surface normal, so
 * the socket beds *into* the metal rather than resting on top of it.
 */
export const HARD_POINT = {
  /** Socket pad: dark graphite, sunk slightly below the surface. */
  padRadius: 0.0138,
  padBaseRadius: 0.0158,
  padHeight: 0.0058,
  /** How far the pad is let into the component, so it never looks stuck on. */
  padSink: 0.0016,
  /** Machined boss standing off the pad. */
  bossRadius: 0.0094,
  bossBaseRadius: 0.0108,
  bossHeight: 0.0056,
  /** Stem: the short metallic pin carrying the connection face. */
  stemRadius: 0.0042,
  stemHeight: 0.0110,
  /** Connection face and the green accent ring around it. */
  faceRadius: 0.0074,
  faceHeight: 0.0026,
  ringRadius: 0.0084,
  ringTube: 0.0023,
} as const;

/**
 * Height of the connection face above the contact point.
 *
 * This is the single number the projector cares about: it is where the port's
 * world position is read from, and therefore where every pad, trail endpoint
 * and snap target derives its screen position.
 */
export const HARD_POINT_FACE_HEIGHT =
  -HARD_POINT.padSink +
  HARD_POINT.padHeight +
  HARD_POINT.bossHeight +
  HARD_POINT.stemHeight +
  HARD_POINT.faceHeight / 2;

/**
 * Apparent-size clamp.
 *
 * A port that scaled purely with perspective would be a speck when the whole
 * machine is framed and a bollard when the operator zooms to a barrel zone.
 * Scale is therefore driven by camera distance but held inside a narrow band,
 * so a port always reads as machined hardware at CAD scale rather than as an
 * overlay pinned to the screen.
 */
export const HARD_POINT_SCALE = {
  /** Distance the authored dimensions are correct at, set from the framing. */
  reference: 3.4,
  min: 0.72,
  max: 1.85,
  /** How much of the distance ratio is followed; 1 would be pure screen-space. */
  follow: 0.72,
} as const;

/**
 * Port state.
 *
 * `MeasurementPadState` is the console's wiring state and stays the source of
 * truth for it. The extra members exist so a later diagnostic state can be
 * added without reopening the geometry: today everything renders green, and
 * only brightness and ring weight change.
 */
export type HardPointState = 'idle' | 'linked' | 'live' | 'selected' | 'offline';

/** Debug overlay is development-only and off unless explicitly switched on. */
export const HARD_POINT_DEBUG_FLAG = 'ultronHardPointDebug';

export function hardPointDebugEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (typeof window === 'undefined') return false;
  const flagged = (window as unknown as Record<string, unknown>)[HARD_POINT_DEBUG_FLAG];
  if (flagged === true) return true;
  try {
    return new URLSearchParams(window.location.search).get('hardpoints') === 'debug';
  } catch {
    return false;
  }
}
