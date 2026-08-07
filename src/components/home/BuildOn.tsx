// Build on ULTRON — the developer band.
//
// A drafting sheet: dashed construction grid, a framed copy box on the left,
// and an isometric mark on the right built out of real projected geometry
// rather than a traced path. The beams are generated from the two isometric
// basis vectors, so the faces meet exactly and the hatching runs true.

import Link from 'next/link';

import styles from './BuildOn.module.css';
import { useInView } from './primitives';

/* Isometric basis: one step "down-right", one step "up-right". */
const U: [number, number] = [0.866, 0.5];
const V: [number, number] = [0.866, -0.5];

type Point = [number, number];
const fmt = (points: Point[]) => points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/**
 * One extruded beam.
 *
 * `along` runs up-right (the V axis), `wide` runs down-right (U), and `deep`
 * is the vertical extrusion that gives the beam its two shaded faces.
 */
function beam(ox: number, oy: number, along: number, wide: number, deep: number) {
  const p = (a: number, b: number, dz = 0): Point => [
    ox + a * U[0] + b * V[0],
    oy + a * U[1] + b * V[1] + dz,
  ];
  return {
    top: [p(0, 0), p(0, along), p(wide, along), p(wide, 0)] as Point[],
    // The face you see looking up the beam.
    front: [p(wide, 0), p(wide, along), p(wide, along, deep), p(wide, 0, deep)] as Point[],
    // The short end cap nearest the viewer.
    cap: [p(0, 0), p(wide, 0), p(wide, 0, deep), p(0, 0, deep)] as Point[],
  };
}

const BEAMS = [beam(96, 300, 250, 74, 34), beam(232, 372, 150, 62, 30)];

/* The construction diamond the beams are set out against. */
const GUIDE: Point[] = [
  [300, 60],
  [532, 194],
  [532, 396],
  [300, 530],
  [68, 396],
  [68, 194],
];

export default function BuildOn() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -14% 0px');

  return (
    <section className={styles.section}>
      <div className={styles.grid} aria-hidden="true" />

      <div ref={ref} className={`${styles.inner} ${inView ? styles.shown : ''}`}>
        <div className={styles.copy}>
          <h2 className={styles.title}>
            REST. WebSocket. MQTT.
            <br />
            <span className={styles.titleMuted}>Build anything on ULTRON.</span>
          </h2>
          <p className={styles.body}>
            The console has no privileged back door. Every channel, window and asset it reads is
            available to you over the same interfaces — and an agent can query the plant directly
            over MCP.
          </p>
          <Link href="/about" className={styles.link}>
            View docs
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h13" />
              <path d="m12 6 6 6-6 6" />
            </svg>
          </Link>
        </div>

        <div className={styles.markWrap}>
          <svg className={styles.mark} viewBox="0 0 600 580" role="img" aria-label="ULTRON mark">
            <defs>
              {/* The hatch that fills the lit faces. */}
              <pattern id="bo-hatch" width="8" height="6" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0.5" x2="8" y2="0.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
              </pattern>
              <pattern id="bo-hatch-dim" width="8" height="8" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0.5" x2="8" y2="0.5" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
              </pattern>
            </defs>

            <polygon className={styles.guide} points={fmt(GUIDE)} />
            {GUIDE.map(([x, y]) => (
              <rect key={`${x}-${y}`} className={styles.vertex} x={x - 3} y={y - 3} width="6" height="6" />
            ))}

            {/* Construction lines through the centre of the diamond. */}
            <line className={styles.guide} x1="300" y1="60" x2="300" y2="530" />
            <line className={styles.guide} x1="68" y1="194" x2="532" y2="396" />
            <line className={styles.guide} x1="532" y1="194" x2="68" y2="396" />

            {BEAMS.map((shape, index) => (
              <g
                key={index}
                className={styles.beam}
                style={{ ['--delay' as string]: `${index * 180}ms` }}
              >
                <polygon points={fmt(shape.cap)} fill="url(#bo-hatch-dim)" />
                <polygon points={fmt(shape.front)} fill="url(#bo-hatch-dim)" />
                <polygon points={fmt(shape.top)} fill="url(#bo-hatch)" />
                {[shape.top, shape.front, shape.cap].map((face, faceIndex) => (
                  <polygon key={faceIndex} className={styles.edge} points={fmt(face)} />
                ))}
              </g>
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
}
