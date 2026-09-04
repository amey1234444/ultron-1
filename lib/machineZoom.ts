/**
 * How large a machine is drawn on its canvas.
 *
 * This is a saved property of a layout, not a viewing preference. A super admin
 * sizes the machine once and saves it to the template; every machine created
 * from that template afterwards opens at that size, and every viewer sees the
 * same one. That is the whole reason it lives here rather than in component
 * state: a size that only existed in the browser that set it would put two
 * users in front of the same machine at different scales, and every trail
 * anchor is a fraction of the machine rect, so the cards would sit differently
 * too.
 *
 * The bounds are shared with the server on purpose. The canvas clamps what a
 * person can reach with the zoom control, and the server clamps what it will
 * store, so a payload that has been edited by hand cannot leave a machine at a
 * size no one can undo through the UI.
 */

export const MIN_MACHINE_ZOOM = 0.5;
export const MAX_MACHINE_ZOOM = 2;
export const MACHINE_ZOOM_STEP = 0.1;

/** What a machine is drawn at when neither it nor its template has a size. */
export const DEFAULT_MACHINE_ZOOM = 1;

/** Two decimal places, which is the granularity the zoom control moves in. */
export function roundMachineZoom(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A stored zoom, or `null` when there isn't a usable one.
 *
 * `null` and `1` are different answers and are kept apart deliberately: `null`
 * means no size has been saved, so the next one up the chain — the template,
 * then the default — decides. Collapsing them would make a machine saved at
 * 100% silently ignore a template that was later resized, which is the case
 * this whole mechanism exists to serve.
 */
export function clampMachineZoom(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return roundMachineZoom(Math.min(MAX_MACHINE_ZOOM, Math.max(MIN_MACHINE_ZOOM, value)));
}

/**
 * The size a machine opens at: its own saved size, else its template's, else
 * the default. One function so the canvas and the checks cannot disagree about
 * precedence.
 */
export function resolveMachineZoom(
  saved: { machineZoom?: number | null } | null | undefined,
  template: { machineZoom?: number | null } | null | undefined,
): number {
  return clampMachineZoom(saved?.machineZoom) ?? clampMachineZoom(template?.machineZoom) ?? DEFAULT_MACHINE_ZOOM;
}
