import { Box3, MathUtils, Vector3 } from 'three';

/** Fit all eight corners in camera space, including their perspective depth. */
export function fitMachineCamera(box: Box3, direction: Vector3, fov: number, aspect: number, margin = 1.12) {
  const centre = box.getCenter(new Vector3());
  const backward = direction.clone().normalize();
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), backward).normalize();
  // Also support a nearly vertical inspection direction.
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  const up = new Vector3().crossVectors(backward, right).normalize();
  const tanV = Math.tan(MathUtils.degToRad(fov) / 2);
  const tanH = tanV * Math.max(aspect, 0.01);
  let distance = 0.2;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const corner = new Vector3(x, y, z).sub(centre);
        const depth = corner.dot(backward);
        distance = Math.max(distance,
          depth + Math.abs(corner.dot(right)) * margin / tanH,
          depth + Math.abs(corner.dot(up)) * margin / tanV);
      }
    }
  }
  return { centre, distance };
}
