import type { Point } from './AdjustableTrail';
import type { MachineConnector } from './machineConnectors';
import type { Anchor, Box, Trail } from './TrailBoard';

export type MachineRect = { x: number; y: number; width: number; height: number };

// Saved machine anchors predate stable point codes. Comparing in the shared
// artwork coordinate system lets old layouts recover their instrument identity
// without importing the UI-heavy TrailBoard module into executable checks.
const ARTWORK_WIDTH = 1200;
const ARTWORK_HEIGHT = 760;
const ANCHOR_MATCH_TOLERANCE = 14;

export function connectorStagePoint(connector: MachineConnector, rect: MachineRect): Point {
  return { x: rect.x + connector.rx * rect.width, y: rect.y + connector.ry * rect.height };
}

// Recompute the derived bend of an auto-routed 3-point trail from its current
// endpoints. The machine-side segment stays at 45 degrees while the box-side
// segment remains horizontal.
export function rerouteBend(trail: Trail, points: Point[]): Point[] {
  if (!trail.autoRoute || points.length !== 3) return points;
  const machineEnd = trail.startMachineAnchor ? points[0] : points[2];
  const boxEnd = trail.startMachineAnchor ? points[2] : points[0];
  const direction = boxEnd.x >= machineEnd.x ? 1 : -1;
  const bend = { x: machineEnd.x + direction * Math.abs(machineEnd.y - boxEnd.y), y: boxEnd.y };
  return [points[0], bend, points[2]];
}

function connectorForAnchor(
  anchor: Anchor | undefined,
  connectors: MachineConnector[],
): MachineConnector | undefined {
  if (!anchor) return undefined;
  let best: { connector: MachineConnector; distance: number } | undefined;
  for (const connector of connectors) {
    const distance = Math.hypot(
      (anchor.rx - connector.rx) * ARTWORK_WIDTH,
      (anchor.ry - connector.ry) * ARTWORK_HEIGHT,
    );
    if (distance <= ANCHOR_MATCH_TOLERANCE && (!best || distance < best.distance)) {
      best = { connector, distance };
    }
  }
  return best?.connector;
}

/**
 * Restore saved trails' stable instrument identities and move each machine end
 * to the connector's current projection. Auto-routed bends are derived again
 * after the endpoint moves, so orbiting never leaves a stale elbow behind.
 */
export function withResolvedConnectors(
  trails: Trail[],
  boxes: Box[],
  connectors: MachineConnector[],
  machineRect: MachineRect | null,
): Trail[] {
  if (connectors.length === 0) return trails;
  const byCode = new Map(connectors.map((connector) => [connector.code, connector]));
  let changed = false;

  const next = trails.map((trail) => {
    let patched = trail;

    for (const which of ['start', 'end'] as const) {
      const codeKey = which === 'start' ? 'startMachinePointCode' : 'endMachinePointCode';
      const anchorKey = which === 'start' ? 'startMachineAnchor' : 'endMachineAnchor';
      const anchor = patched[anchorKey];
      if (!anchor) continue;

      const cardId = which === 'start' ? patched.endBoxId : patched.startBoxId;
      const cardCode = cardId ? boxes.find((box) => box.id === cardId)?.templatePointCode : undefined;
      const connector =
        byCode.get(patched[codeKey] ?? '') ??
        byCode.get(cardCode ?? '') ??
        connectorForAnchor(anchor, connectors);
      if (!connector) continue;

      const codeStale = patched[codeKey] !== connector.code;
      const anchorStale =
        Math.abs(anchor.rx - connector.rx) > 1e-4 || Math.abs(anchor.ry - connector.ry) > 1e-4;
      if (!codeStale && !anchorStale) continue;

      changed = true;
      const index = which === 'start' ? 0 : patched.points.length - 1;
      patched = {
        ...patched,
        [codeKey]: connector.code,
        [anchorKey]: { rx: connector.rx, ry: connector.ry },
        points: machineRect
          ? patched.points.map((point, pointIndex) =>
              pointIndex === index ? connectorStagePoint(connector, machineRect) : point,
            )
          : patched.points,
      };
    }

    return patched === trail ? trail : { ...patched, points: rerouteBend(patched, patched.points) };
  });

  return changed ? next : trails;
}
