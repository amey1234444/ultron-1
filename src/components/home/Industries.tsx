// The five materials ULTRON runs on, drawn as specimens.
//
// The reference for this section is the way a materials company photographs its
// own inputs: one object per industry, lit the same way, shot on the same
// baseline, so the set reads as a collection rather than as five illustrations.
// We have no photography, and a row of stock plant images would have been worse
// than nothing — so the specimens are generated instead.
//
// Each one is a faceted solid: a deterministic silhouette, shaded as a triangle
// fan from a single light direction that is identical across all five. That
// shared light is what makes the row feel like one photograph rather than five
// drawings, and it is the reason the shading is computed rather than authored.
//
// Every specimen is fractured. A crack runs through the body, and shards break
// away from it — they sit at rest on the server and push outward when the row
// scrolls into view. The fracture is the argument: these are materials that are
// being broken, milled and burned, and the variance that comes out of that is
// exactly what the platform is for.

import Link from 'next/link';

import styles from './Industries.module.css';
import { Arrow, Reveal, SectionHead, useInView } from './primitives';

const VIEW = 200;
const C = VIEW / 2;

/** One light for the whole row. */
const LIGHT = -2.36;

/** Deterministic noise — server and client must draw the identical specimen. */
function noise(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Specimen = {
  seed: number;
  /** Vertices around the silhouette. Fewer reads blockier, more reads granular. */
  facets: number;
  radius: number;
  /** How far each vertex is allowed off the base radius, 0–1. */
  rough: number;
  /** Bearing the shards fly off along, in radians. */
  fracture: number;
  shards: number;
};

type Industry = {
  name: string;
  claim: string;
  body: string;
  tags: string[];
  specimen: Specimen;
};

const INDUSTRIES: Industry[] = [
  {
    name: 'Cement',
    claim: 'Kiln stability under a moving raw mix',
    body: 'Burning zone, free lime and specific heat held against a feed whose chemistry changes hour to hour.',
    tags: ['Kiln feed', 'Raw mill', 'Vertical roller mill', 'Preheater'],
    // Limestone: blocky, chalky, few large faces.
    specimen: { seed: 3, facets: 9, radius: 66, rough: 0.16, fracture: -0.6, shards: 4 },
  },
  {
    name: 'Power',
    claim: 'Continuous duty on plant that cannot stop',
    body: 'Coal feed, fly ash and FGD limestone handling scored continuously, with failures forecast a shift ahead.',
    tags: ['Coal feeding', 'Fly ash', 'Bottom ash', 'FGD limestone'],
    // Coal: sharp, high-contrast, conchoidal.
    specimen: { seed: 11, facets: 11, radius: 63, rough: 0.3, fracture: 2.3, shards: 5 },
  },
  {
    name: 'Boilers',
    claim: 'Feed accuracy across every fuel you burn',
    body: 'Pulverised coal, CFBC and waste-derived fuel metered to the same tolerance as the day it was commissioned.',
    tags: ['Pulverised coal', 'CFBC', 'Biomass', 'Waste to energy'],
    // Granular fuel: many small faces, low relief.
    specimen: { seed: 23, facets: 14, radius: 60, rough: 0.22, fracture: 0.9, shards: 6 },
  },
  {
    name: 'Mining',
    claim: 'Abrasive throughput without surprise downtime',
    body: 'Ore processing, coal washery and dust collection monitored where wear, not load, decides the maintenance date.',
    tags: ['Ore processing', 'Mineral processing', 'Coal washery', 'Dust collection'],
    // Ore: irregular, veined, heaviest relief in the set.
    specimen: { seed: 41, facets: 12, radius: 65, rough: 0.34, fracture: -2.0, shards: 5 },
  },
  {
    name: 'Steel',
    claim: 'High-temperature handling that holds its baseline',
    body: 'Lime handling, sinter plant and DRI systems re-baselined as duty cycles and charge mix move.',
    tags: ['Lime handling', 'Sinter plant', 'DRI systems', 'Blast furnace'],
    // Sinter: crystalline, sharp cleave.
    specimen: { seed: 59, facets: 10, radius: 64, rough: 0.27, fracture: 1.6, shards: 4 },
  },
];

/** Silhouette vertices, as [x, y] in view space. */
function outline({ seed, facets, radius, rough }: Specimen) {
  return Array.from({ length: facets }, (_, i) => {
    const angle = (i / facets) * Math.PI * 2;
    // Two octaves so the silhouette has both large faces and small chips.
    const r =
      radius *
      (1 - rough * 0.5 + noise(seed + i) * rough + noise(seed * 2 + i * 3) * rough * 0.35);
    return [C + Math.cos(angle) * r, C + Math.sin(angle) * r * 0.92] as const;
  });
}

/**
 * Facet shading.
 *
 * Each triangle runs from the centre to one edge, and takes its brightness from
 * how squarely it faces the shared light. This is the whole reason the set reads
 * as photographed: the same light lands on five different solids.
 */
function facetTone(i: number, count: number) {
  const angle = ((i + 0.5) / count) * Math.PI * 2;
  const facing = Math.cos(angle - LIGHT);
  return 0.05 + Math.max(0, facing) * 0.3;
}

function Specimen({ industry, index }: { industry: Industry; index: number }) {
  const spec = industry.specimen;
  const points = outline(spec);

  // The crack runs across the body on the fracture bearing.
  const fx = Math.cos(spec.fracture);
  const fy = Math.sin(spec.fracture);
  const crack = Array.from({ length: 5 }, (_, i) => {
    const t = -1 + (i / 4) * 2;
    // A slight lateral wander, so the break is not a ruled line.
    const wander = (noise(spec.seed + i * 7) - 0.5) * 14;
    return [
      C + fx * t * spec.radius * 0.9 - fy * wander,
      C + fy * t * spec.radius * 0.85 + fx * wander,
    ];
  });

  return (
    <svg
      className={styles.specimen}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role="img"
      aria-label={`${industry.name} — a fractured material specimen`}
    >
      <defs>
        <radialGradient id={`spec-glow-${index}`} cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The pool of light the specimen sits in. */}
      <circle cx={C} cy={C} r={VIEW / 2} fill={`url(#spec-glow-${index})`} />

      {/* Faceted body. */}
      <g className={styles.body}>
        {points.map((point, i) => {
          const next = points[(i + 1) % points.length];
          return (
            <polygon
              key={i}
              points={`${C},${C} ${point[0].toFixed(1)},${point[1].toFixed(1)} ${next[0].toFixed(
                1,
              )},${next[1].toFixed(1)}`}
              fill={`rgba(255,255,255,${facetTone(i, points.length).toFixed(3)})`}
            />
          );
        })}

        {/* Edges last, so they sit over the shading. */}
        <polygon
          className={styles.edge}
          points={points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
        />
      </g>

      {/* The break. */}
      <polyline
        className={styles.crack}
        points={crack.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}
      />

      {/* Shards, leaving along the fracture bearing. */}
      {Array.from({ length: spec.shards }, (_, i) => {
        const t = (i + 1) / spec.shards;
        const drift = 16 + t * 46;
        const size = 7 - t * 3.4;
        const spread = (noise(spec.seed + i * 13) - 0.5) * 46;
        const x = C + fx * drift - fy * spread;
        const y = C + fy * drift + fx * spread;
        const spin = noise(spec.seed + i * 5) * 90;
        return (
          <polygon
            key={i}
            className={styles.shard}
            points={`${x},${y - size} ${x + size},${y + size * 0.7} ${x - size * 0.85},${y + size}`}
            transform={`rotate(${spin.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})`}
            style={{
              ['--dx' as string]: `${(fx * drift * 0.42).toFixed(1)}px`,
              ['--dy' as string]: `${(fy * drift * 0.42).toFixed(1)}px`,
              ['--delay' as string]: `${index * 90 + i * 70}ms`,
            }}
          />
        );
      })}
    </svg>
  );
}

export default function Industries() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -18% 0px');

  return (
    <section id="industries" className={styles.section}>
      <div className={styles.inner}>
        <SectionHead
          eyebrow="Where it runs"
          title="Five materials, one control problem"
          lead="Every one of these lines is a mill, a kiln or a feeder handling something abrasive, hot or inconsistent — and every one of them drifts away from its commissioning baseline. That drift is the thing ULTRON measures."
          align="center"
        />

        <div ref={ref} className={`${styles.row} ${inView ? styles.rowIn : ''}`}>
          {INDUSTRIES.map((industry, index) => (
            <article
              key={industry.name}
              className={styles.card}
              style={{ ['--delay' as string]: `${index * 90}ms` }}
            >
              <div className={styles.stage}>
                <Specimen industry={industry} index={index} />
                {/* The baseline every specimen is stood on — the detail that
                    makes five separate objects read as one shoot. */}
                <span className={styles.baseline} aria-hidden="true" />
              </div>

              <h3 className={styles.name}>{industry.name}</h3>
              <p className={styles.claim}>{industry.claim}</p>
              <p className={styles.body}>{industry.body}</p>

              <ul className={styles.tags}>
                {industry.tags.map((tag) => (
                  <li key={tag} className={styles.tag}>
                    {tag}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <Reveal delay={120}>
          <div className={styles.foot}>
            <p className={styles.footNote}>
              Not listed? The platform is instrument-agnostic — if the asset already produces a
              signal, it is already a source.
            </p>
            <Link href="/contact" className={styles.footLink}>
              Talk to us about your line
              <Arrow size={14} />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
