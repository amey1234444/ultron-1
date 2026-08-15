/**
 * Projects each plant asset from world space into screen space, every frame.
 *
 * Why the labels are not `<Html>` any more
 * ----------------------------------------
 * drei's `<Html>` pins a card to a point and stops there. With six assets in a
 * yard that produced exactly what the screenshots showed: cards sitting on the
 * models they describe, and on each other. Neither is fixable at the anchor,
 * because avoiding a collision means knowing where the *other* cards ended up.
 *
 * So the geometry problem is solved here — anchor point, and the model's
 * screen-space footprint that a card must stay clear of — and the placement
 * problem is solved in the DOM overlay that consumes this, where all six
 * candidates can be considered together.
 *
 * Runs inside the Canvas; renders nothing.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';

import type { ProjectedAsset } from './types';

const corner = new THREE.Vector3();
const worldCentre = new THREE.Vector3();

export function LabelProjector({
  boxes,
  version,
  onProject,
}: {
  /** World-space bounds per component id, published by the placed models. */
  boxes: Map<string, THREE.Box3>;
  /** Bumped when `boxes` changes, since a Map identity never does. */
  version: number;
  onProject: (assets: ProjectedAsset[]) => void;
}) {
  const { camera, size } = useThree();
  const previous = useRef('');

  useFrame(() => {
    if (boxes.size === 0) return;
    const out: ProjectedAsset[] = [];

    for (const [id, box] of boxes) {
      if (box.isEmpty()) continue;

      // Project all eight corners: the screen-space footprint of a rotated box
      // is not the projection of its world-space AABB, and using the latter
      // leaves a card overlapping the model it is meant to sit clear of.
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let behind = 0;

      for (let i = 0; i < 8; i += 1) {
        corner.set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        );
        corner.project(camera);
        if (corner.z > 1) behind += 1;
        const x = (corner.x * 0.5 + 0.5) * size.width;
        const y = (-corner.y * 0.5 + 0.5) * size.height;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      box.getCenter(worldCentre);
      const distance = camera.position.distanceTo(worldCentre);

      // The connector attaches at the top of the model, horizontally centred:
      // the label hangs above the building rather than off one of its corners.
      const anchorX = (minX + maxX) / 2;
      const anchorY = minY;

      out.push({
        id,
        anchorX,
        anchorY,
        boxX: minX,
        boxY: minY,
        boxW: maxX - minX,
        boxH: maxY - minY,
        distance,
        onScreen:
          behind === 0 &&
          maxX > -160 &&
          minX < size.width + 160 &&
          maxY > -120 &&
          minY < size.height + 120,
      });
    }

    // Whole pixels only, and skipped entirely when nothing moved — otherwise an
    // idle scene still re-renders the overlay on every requested frame.
    const signature = out
      .map((a) => `${a.id}:${a.anchorX | 0},${a.anchorY | 0},${a.boxW | 0},${a.boxH | 0},${a.onScreen ? 1 : 0}`)
      .join('|');
    if (signature === previous.current) return;
    previous.current = signature;
    onProject(out);
  });

  // `version` is read so the effect of a bounds change is not optimised away by
  // an over-eager memo upstream; the projector itself is stateless.
  void version;
  return null;
}
