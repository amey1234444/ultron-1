/**
 * The plant floor.
 *
 * What this replaces
 * ------------------
 * A finite `lineSegments` grid: uniform lines, hard outer rim, a visible
 * origin. That reads as a 3D editor's construction grid — graph paper the plant
 * happens to be standing on — which is exactly the wrong impression for a
 * digital twin.
 *
 * What this is instead
 * --------------------
 * A physical slab that runs past the horizon, with faint bay markings on it.
 * Three things do the work:
 *
 *  - the lines are drawn in the fragment shader from world coordinates, so they
 *    are pixel-width at every distance and every zoom instead of aliasing into
 *    moire the moment the camera tilts;
 *  - they fade out radially, so there is no rim to notice and no origin to
 *    read as an axis crossing;
 *  - a separate shadow-catching slab sits underneath, tinted to the page
 *    background and dissolved by the scene fog, so the floor ends by becoming
 *    the page rather than by stopping.
 *
 * No axis lines. No centre marker. The floor states scale and nothing else.
 */
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/** Bay spacing in metres. Coarse on purpose — this is a floor, not a mesh. */
const MINOR_STEP = 5;
const MAJOR_STEP = 25;

const VERTEX = /* glsl */ `
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  precision highp float;

  varying vec2 vWorld;

  uniform vec3  uLine;
  uniform float uMinorOpacity;
  uniform float uMajorOpacity;
  uniform float uFadeStart;
  uniform float uFadeEnd;

  // Screen-space-derivative line: one pixel wide however far away it is, which
  // is what keeps a floor this large from turning into interference patterns.
  float bay(vec2 world, float step) {
    vec2 cell = world / step;
    vec2 d = abs(fract(cell - 0.5) - 0.5) / max(fwidth(cell), vec2(1e-5));
    return 1.0 - min(min(d.x, d.y), 1.0);
  }

  void main() {
    float minor = bay(vWorld, ${MINOR_STEP.toFixed(1)});
    float major = bay(vWorld, ${MAJOR_STEP.toFixed(1)});

    // Radial falloff, so the markings simply run out instead of ending.
    float distance = length(vWorld);
    float fade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance);

    float alpha = max(minor * uMinorOpacity, major * uMajorOpacity) * fade;
    if (alpha < 0.002) discard;

    gl_FragColor = vec4(uLine, alpha);
  }
`;

export function GroundPlane({ dark, extent }: { dark: boolean; extent: number }) {
  const material = useRef<THREE.ShaderMaterial>(null);

  // Markings reach a little past the plant and are gone well before the fog
  // takes over, so the two falloffs never fight each other.
  const fadeStart = Math.max(30, extent * 0.75);
  const fadeEnd = Math.max(70, extent * 2.1);

  const uniforms = useMemo(
    () => ({
      uLine: { value: new THREE.Color(dark ? '#66727E' : '#8C949E') },
      uMinorOpacity: { value: dark ? 0.1 : 0.14 },
      uMajorOpacity: { value: dark ? 0.22 : 0.26 },
      uFadeStart: { value: fadeStart },
      uFadeEnd: { value: fadeEnd },
    }),
    // Rebuilt on theme change only; the distances are pushed in below so a
    // resized plant does not throw away the compiled program.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dark],
  );

  if (material.current) {
    material.current.uniforms.uFadeStart.value = fadeStart;
    material.current.uniforms.uFadeEnd.value = fadeEnd;
  }

  return (
    <group raycast={() => undefined}>
      {/* Slab. Opaque, shadow-receiving, and tinted so the scene fog erases its
          edge against the page instead of leaving a horizon line. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[1400, 1400]} />
        <meshStandardMaterial
          // Lifted clear of the page background on both themes: a floor the
          // same value as the canvas behind it is not a floor, and the plant
          // ends up looking like it is floating in a void.
          color={dark ? '#13161B' : '#E7E8E5'}
          roughness={0.96}
          metalness={0.02}
          // Pushed back so the markings a couple of centimetres above never
          // z-fight with it — the classic cause of a shimmering floor.
          polygonOffset
          polygonOffsetFactor={4}
          polygonOffsetUnits={4}
        />
      </mesh>

      {/* Bay markings. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <planeGeometry args={[1400, 1400]} />
        <shaderMaterial
          ref={material}
          vertexShader={VERTEX}
          fragmentShader={FRAGMENT}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
