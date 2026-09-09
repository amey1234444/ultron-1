/**
 * The floor the machine stands on.
 *
 * The Blender studio the asset is authored in has one -- `STUDIO_floor`, a
 * 26 x 14 m matte plane whose top face sits a millimetre under z = 0, with the
 * machine's bedplates resting on it. Every validation render in
 * `docs/validation/` is made against it. The console had no equivalent: the
 * machine floated in a void, its feet ended in nothing, and the key light's
 * shadow had no surface to land on, so the one cue that says "this object has
 * weight and is standing on something" was missing entirely.
 *
 * This is that plane, ported. Same height, same matte non-metallic response,
 * same job.
 *
 * Why it is not simply Blender's plane
 * ------------------------------------
 * Blender's studio is a bright cyclorama: a near-white floor *and* a near-white
 * backdrop wall. Dropping that onto the console would replace a near-black
 * dashboard with a grey room and lose the whole design language. So the floor
 * keeps Blender's geometry and material behaviour and takes the console's
 * values instead -- a couple of steps off the page colour, not a white sweep --
 * and the backdrop is not ported at all.
 *
 * It also fades. A hard-edged disc or quad in an empty scene draws its own
 * silhouette, and a horizon line across a dashboard panel reads as a seam in
 * the layout rather than as ground. The alpha map takes the plane from solid
 * under the machine to nothing well before its edge, so what the operator sees
 * is a pool of floor with the machine standing in it.
 *
 * It receives and never casts: it is under everything, so casting from it could
 * only ever shadow itself.
 *
 * What actually grounds the machine
 * ---------------------------------
 * Not the shadow map. The key light sits in front of and above the machine --
 * `(-2.4, 4.6, 5.2)`, which is Blender's own `KEY` at `(-1.6, -4.2, 4.6)` in
 * this coordinate frame -- and the default camera looks from that same front
 * side. A light and a camera on one side of an object put the cast shadow on
 * the other side of it, so at the inspection view the machine's shadow lands
 * behind the machine and the machine itself hides all of it. Turning the key
 * around to expose the shadow would trade the modelling on every casting for
 * a dark patch on a floor.
 *
 * Blender does not solve this with its key either. Its studio grounds the
 * machine with soft occlusion -- the floor simply darkens where the bedplates
 * and barrel supports sit on it -- and that is what reads as contact in the
 * reference renders. The same thing is baked here, into the floor's own colour
 * map: an elongated pool under the machine's footprint, strongest along the
 * centreline and falling off smoothly. It costs one texture and no second
 * pass, and unlike a shadow map it is visible from every orbit angle, because
 * ambient occlusion does not have a light direction.
 *
 * The shadow map still runs and still lands on this plane; it is simply not
 * what the default framing is relying on.
 */
'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/**
 * Floor tone per theme.
 *
 * Lifted off the page colour on purpose, and in the direction that makes the
 * shadow legible. The console's page is `#08090C` dark / `#F6F7F9` light; a
 * floor painted at the page value would be invisible, and -- worse -- a shadow
 * on it would have nowhere to go, because a shadow can only darken. Dark theme
 * therefore sits a few steps *above* the page so the shadow has room to fall
 * toward it; light theme sits a few steps *below* for the same reason.
 */
const GROUND_COLOR = { dark: '#0E1114', light: '#DEE2E5' } as const;

/** Matched to Blender's `MAT_backdrop`: matte, non-metallic, no reflection. */
const GROUND_ROUGHNESS = 0.62;

/**
 * How far the floor reaches, as a multiple of the machine's longest dimension.
 *
 * Blender's floor is eight times the machine and disappears off frame. Here the
 * fade does that job instead, so the plane only has to be big enough that the
 * fade completes inside it.
 */
const GROUND_EXTENT = 0.95;

/**
 * The contact pool.
 *
 * `depth` is how far the floor is darkened directly under the machine, as a
 * multiplier on its base colour -- occlusion, so it only ever darkens. `core`
 * is the half-size of the fully-occluded region and `falloff` how far past it
 * the darkening reaches, both as fractions of the machine's own footprint, so
 * the pool follows a re-exported machine rather than a fixed measurement.
 *
 * The pool is wider across the machine than the machine is, because a bedplate
 * 0.4 m across sitting on a floor occludes rather more than 0.4 m of it.
 */
const CONTACT = { depth: 0.42, coreX: 0.94, coreZ: 0.55, falloffX: 0.34, falloffZ: 2.4 } as const;

/**
 * Where the opaque centre ends, as a fraction of the radius.
 *
 * Sized so the solid part covers the machine's own footprint and the ramp runs
 * from just past its ends out to the rim. At `GROUND_EXTENT` the radius is
 * about 3.07 m on a 3.23 m machine, so the machine's half-length of 1.6 m is
 * almost exactly this fraction of it -- the floor is solid everywhere the
 * machine stands on it, and does all its fading in open ground.
 */
const FADE_START = 0.52;

/**
 * Radial alpha ramp, drawn once into a 256 px texture.
 *
 * Generated rather than shipped: it is a few lines of canvas, an image file
 * would be another request on the machine page's critical path, and nothing
 * about it needs to be art-directed.
 *
 * Painted in *greyscale*, white centre to black rim, and fully opaque
 * throughout. That is not a stylistic choice: three.js reads `alphaMap` from
 * the texture's **green channel**, not from its alpha channel. A ramp built the
 * obvious way -- white at falling `rgba(...)` alpha -- has green pinned at 255
 * across the whole disc, so it samples as a uniform 1.0 and the plane does not
 * fade at all. It shows up as a hard-edged grey disc laid across the stage with
 * its silhouette plainly visible, which is exactly the horizon line the fade
 * exists to prevent.
 *
 * `smoothstep`-shaped rather than linear -- a linear ramp leaves a visible ring
 * where the gradient starts, because the eye is very good at finding the
 * discontinuity in the first derivative.
 */
function createFadeTexture(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  const steps = 16;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (t <= FADE_START) {
      gradient.addColorStop(t, 'rgb(255,255,255)');
      continue;
    }
    const u = (t - FADE_START) / (1 - FADE_START);
    const eased = 1 - u * u * (3 - 2 * u);
    const level = Math.round(eased * 255);
    gradient.addColorStop(t, `rgb(${level},${level},${level})`);
  }
  // Black first, so the square's corners -- which the disc geometry never
  // reaches, but which bilinear sampling can still touch at the rim -- are
  // fully transparent rather than whatever the gradient left there.
  context.fillStyle = '#000000';
  context.fillRect(0, 0, size, size);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace; // an alpha ramp is data, not colour
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Baked contact occlusion, as a colour map the floor's base tone multiplies by.
 *
 * `CircleGeometry` lays its UVs across the disc's bounding square, so `u` runs
 * along world X -- the machine's long axis -- and `v` across world Z. The pool
 * is therefore an axis-aligned superellipse in UV, which is all the machine's
 * footprint is: long, narrow, and with squared-off ends where the motor
 * bedplate and the die housing sit rather than the tapered ends a plain
 * ellipse would give.
 *
 * Drawn per pixel over 256x256. That is 65k iterations once, at load, for a
 * shape no stack of canvas gradients produces cleanly.
 */
function createContactTexture(halfX: number, halfZ: number): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const image = context.createImageData(size, size);
  const data = image.data;
  const coreX = halfX * CONTACT.coreX;
  const coreZ = halfZ * CONTACT.coreZ;
  const edgeX = coreX + halfX * CONTACT.falloffX;
  const edgeZ = coreZ + halfZ * CONTACT.falloffZ;

  for (let py = 0; py < size; py += 1) {
    // UV centre is 0.5; work in units of the disc radius about the centre.
    const v = (py + 0.5) / size - 0.5;
    for (let px = 0; px < size; px += 1) {
      const u = (px + 0.5) / size - 0.5;

      // Distance in "pool units": 0 at the centre, 1 at the edge of the core,
      // and beyond 1 out in the falloff. Taking the larger of the two axes
      // rather than the euclidean length is what squares the ends off.
      const inner = Math.max(Math.abs(u) / coreX, Math.abs(v) / coreZ);
      const outer = Math.max(Math.abs(u) / edgeX, Math.abs(v) / edgeZ);

      let occlusion: number;
      if (inner <= 1) occlusion = 1;
      else if (outer >= 1) occlusion = 0;
      else {
        // Ramp from the core boundary to the falloff boundary, smoothstepped.
        const t = (inner - 1) / Math.max(edgeX / coreX - 1, 1e-6);
        const clamped = Math.min(Math.max(t, 0), 1);
        occlusion = 1 - clamped * clamped * (3 - 2 * clamped);
      }

      const level = Math.round(255 * (1 - occlusion * (1 - CONTACT.depth)));
      const i = (py * size + px) * 4;
      data[i] = level;
      data[i + 1] = level;
      data[i + 2] = level;
      data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  // This one *is* colour: it multiplies the base tone, so it has to be
  // interpreted in the same space the base tone is.
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * The plane, sized and placed from the machine's own bounding box.
 *
 * Nothing here is a fixed coordinate: the box comes from the loaded asset, so a
 * re-exported machine of a different size still lands on its floor.
 */
export function MachineGround({ box, dark }: { box: THREE.Box3 | null; dark: boolean }) {
  const ground = useMemo(() => {
    if (!box || box.isEmpty()) return null;

    const centre = box.getCenter(new THREE.Vector3());
    const extent = box.getSize(new THREE.Vector3());
    const radius = Math.max(extent.x, extent.z) * GROUND_EXTENT;

    // 64 segments on a disc this size is well under a pixel of chord error at
    // any framing the stage allows, and it is one draw either way.
    const geometry = new THREE.CircleGeometry(radius, 64);
    geometry.rotateX(-Math.PI / 2);

    const fade = createFadeTexture();
    // Machine footprint as a fraction of the disc's bounding square, which is
    // the space the geometry's UVs are laid out in.
    const contact = createContactTexture(
      extent.x / (4 * radius),
      Math.max(extent.z, 0.001) / (4 * radius),
    );
    const material = new THREE.MeshStandardMaterial({
      color: GROUND_COLOR[dark ? 'dark' : 'light'],
      roughness: GROUND_ROUGHNESS,
      metalness: 0,
      transparent: true,
      ...(contact ? { map: contact } : {}),
      // Off, deliberately. The floor is the only transparent surface on the
      // stage and everything else is opaque and already drawn, so it has
      // nothing to sort against -- and writing depth from a faded edge is what
      // would put a hard ring into the very gradient that exists to avoid one.
      depthWrite: false,
      ...(fade ? { alphaMap: fade } : {}),
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'MACHINE_GROUND';
    // Blender puts the floor's top face at z = -0.001 so it never z-fights the
    // bedplates resting on it. Same trick, same clearance.
    mesh.position.set(centre.x, box.min.y - 0.0015, centre.z);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    // Not a machine part: keeps it out of selection, and out of any pick that
    // walks up looking for a `partId`.
    mesh.userData.groundPlane = true;

    return { mesh, geometry, material, fade, contact };
  }, [box, dark]);

  useEffect(() => {
    if (!ground) return undefined;
    return () => {
      ground.geometry.dispose();
      ground.material.dispose();
      ground.fade?.dispose();
      ground.contact?.dispose();
    };
  }, [ground]);

  if (!ground) return null;
  return <primitive object={ground.mesh} />;
}
