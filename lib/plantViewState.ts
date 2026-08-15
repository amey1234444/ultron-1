// The Plant Overview's view state.
//
// Four states, not five booleans. `isOpen`/`isFull`/`isZoomed` can express
// combinations that are not real (open but not full? zoomed but closed?) and
// every one of them has to be handled somewhere. These four are exhaustive and
// mutually exclusive, so the transition is deterministic and the UI can be
// derived from the state rather than kept in sync with it.
//
//   overview  ──enter──▶  entering  ──(PLANT_TRANSITION_MS)──▶  immersive
//      ▲                                                            │
//      └──────(PLANT_TRANSITION_MS)──────  exiting  ◀─────exit──────┘
//
// `entering` and `exiting` exist because the move is animated: the camera, the
// canvas bounds and the dashboard chrome all have to be somewhere partway
// through, and that "partway" is a real state the UI is rendered from.

export type PlantViewMode = 'overview' | 'entering' | 'immersive' | 'exiting';

/**
 * One duration for the whole move.
 *
 * The canvas bounds, the chrome fade and the camera ease all run against this,
 * which is what makes them read as a single gesture instead of three animations
 * that happen to overlap.
 */
export const PLANT_TRANSITION_MS = 520;

/** The canvas is at full viewport in these states. */
export function isImmersive(mode: PlantViewMode): boolean {
  return mode === 'entering' || mode === 'immersive';
}

/** The dashboard's KPI row, analytics panel and bottom charts are shown. */
export function chromeVisible(mode: PlantViewMode): boolean {
  return mode === 'overview' || mode === 'exiting';
}

/** True while a transition is in flight — used to suppress input mid-move. */
export function isTransitioning(mode: PlantViewMode): boolean {
  return mode === 'entering' || mode === 'exiting';
}

/** Camera mode the scene should be framed for. */
export function cameraModeFor(mode: PlantViewMode): 'overview' | 'immersive' {
  return isImmersive(mode) ? 'immersive' : 'overview';
}
