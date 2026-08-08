// The closer — everything collapses to one point, and you go through it.
//
// The section is one scroll-scrubbed sequence in four beats:
//
//   1. An orbiting field. Each body is a plant system, on its own period.
//   2. The orbits decay. Radii collapse and the whole field takes on a swirl
//      that is driven by scroll rather than by time — so it is *your* scrolling
//      that pulls it in, which is the only reason the beat lands.
//   3. An event horizon opens: a dark core, a photon ring, an accretion disc.
//   4. You fall through it. The horizon scales past the viewport, the field
//      goes, and the closing statement is on the other side.
//
// The metaphor is the site's own argument — eleven systems collapsing into one
// point you can actually see through — so this is the last section rather than a
// piece of decoration bolted to the end.
//
// Performance: React renders this once. The scroll handler writes six custom
// properties onto one element inside rAF and every moving part is a CSS
// transform derived from them, so scrubbing never re-renders the tree and never
// leaves the compositor. That is the same approach ProductStage uses.

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import styles from './Singularity.module.css';
import { Arrow, clamp01, useReducedMotion } from './primitives';

const VIEW = 900;
const C = VIEW / 2;

/** Deterministic scatter, so server and client agree. */
function noise(seed: number) {
  const x = Math.sin(seed * 91.7 + 47.3) * 43758.5453;
  return x - Math.floor(x);
}

type Body = {
  /** Orbit radius at rest. */
  r: number;
  /** Seconds for one revolution — inner bodies run faster, as they should. */
  period: number;
  size: number;
  label?: string;
  tone?: 'live' | 'forecast';
};

const BODIES: Body[] = [
  { r: 96, period: 14, size: 3.4, label: 'KILN', tone: 'live' },
  { r: 138, period: 21, size: 2.6, label: 'RAW MILL' },
  { r: 138, period: 21, size: 2, tone: 'forecast' },
  { r: 186, period: 30, size: 4.2, label: 'COOLER' },
  { r: 238, period: 41, size: 2.8, label: 'ID FAN' },
  { r: 238, period: 41, size: 1.8 },
  { r: 292, period: 55, size: 3.6, label: 'CONVEYOR' },
  { r: 348, period: 72, size: 2.4, label: 'PACKING', tone: 'forecast' },
  { r: 348, period: 72, size: 1.6 },
];

/** Background stars — the estate beyond the plant. */
const STARS = Array.from({ length: 120 }, (_, i) => ({
  x: noise(i * 3 + 1) * VIEW,
  y: noise(i * 7 + 2) * VIEW,
  r: 0.4 + noise(i * 11 + 3) * 1.1,
  o: 0.16 + noise(i * 13 + 5) * 0.5,
}));

export default function Singularity() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!section || !stage) return;

    // Reduced motion gets the composed final frame: the horizon open and the
    // statement legible, with nothing moving and nothing to scrub.
    if (reduced) {
      stage.style.setProperty('--collapse', '1');
      stage.style.setProperty('--swirl', '0deg');
      stage.style.setProperty('--hole', '1');
      stage.style.setProperty('--disc', '1');
      stage.style.setProperty('--dive', '0');
      stage.style.setProperty('--reveal', '1');
      stage.style.setProperty('--field', '1');
      stage.classList.add(styles.through);
      return;
    }

    let frame = 0;

    const apply = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const p = travel <= 0 ? 0 : clamp01(-rect.top / travel);

      const span = (from: number, to: number) => clamp01((p - from) / (to - from));

      // Orbits decay first, and the swirl is scroll-driven so the pull tracks
      // the hand on the wheel.
      const collapse = span(0.08, 0.54);
      const hole = span(0.28, 0.66);
      const disc = span(0.38, 0.7);
      // Cubed, so the fall is slow to start and then very fast — the whole point
      // of an event horizon.
      const dive = Math.pow(span(0.72, 1), 3);
      const reveal = span(0.86, 0.99);

      stage.style.setProperty('--collapse', collapse.toFixed(4));
      stage.style.setProperty('--swirl', `${(p * 900).toFixed(2)}deg`);
      stage.style.setProperty('--hole', hole.toFixed(4));
      stage.style.setProperty('--disc', disc.toFixed(4));
      stage.style.setProperty('--dive', dive.toFixed(4));
      stage.style.setProperty('--reveal', reveal.toFixed(4));
      // The field is gone by the time the statement arrives.
      stage.style.setProperty('--field', (1 - span(0.8, 0.93)).toFixed(4));

      // Gate interaction on the statement actually being on screen. Done with a
      // class rather than React state so the scrub still never re-renders.
      stage.classList.toggle(styles.through, reveal > 0.25);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced]);

  return (
    <section ref={sectionRef} className={styles.section}>
      <div ref={stageRef} className={styles.stage}>
        {/* ------------------------------------------------ the field */}
        <div className={styles.field} aria-hidden="true">
          <svg className={styles.svg} viewBox={`0 0 ${VIEW} ${VIEW}`}>
            <defs>
              <radialGradient id="sg-disc" cx="50%" cy="50%" r="50%">
                <stop offset="52%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="66%" stopColor="#ffffff" stopOpacity="0.5" />
                <stop offset="78%" stopColor="#9fd8ff" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="sg-halo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
              {/* The core is a true void — a fill, not a blur, so the ring has a
                  hard edge to sit against. */}
              <radialGradient id="sg-core" cx="50%" cy="50%" r="50%">
                <stop offset="72%" stopColor="#000000" stopOpacity="1" />
                <stop offset="100%" stopColor="#000000" stopOpacity="0.86" />
              </radialGradient>
            </defs>

            <g className={styles.stars}>
              {STARS.map((star, i) => (
                <circle key={i} cx={star.x} cy={star.y} r={star.r} opacity={star.o} />
              ))}
            </g>

            {/* Everything that orbits, swirling as a single body. */}
            <g className={styles.system}>
              {/* Orbit rings, collapsing with their bodies. */}
              {[96, 138, 186, 238, 292, 348].map((r) => (
                <circle key={r} className={styles.orbit} cx={C} cy={C} r={r} />
              ))}

              {BODIES.map((body, i) => (
                <g
                  key={i}
                  className={styles.orbiter}
                  style={{
                    ['--period' as string]: `${body.period}s`,
                    ['--spin' as string]: `${(noise(i * 17) * 360).toFixed(1)}deg`,
                  }}
                >
                  <g className={styles.arm} style={{ ['--r0' as string]: body.r }}>
                    <circle
                      className={`${styles.body} ${
                        body.tone === 'live'
                          ? styles.bodyLive
                          : body.tone === 'forecast'
                            ? styles.bodyForecast
                            : ''
                      }`}
                      r={body.size}
                    />
                    {body.label && (
                      <text className={styles.bodyLabel} x={body.size + 8} y="3">
                        {body.label}
                      </text>
                    )}
                  </g>
                </g>
              ))}
            </g>

            {/* --------------------------------------- the horizon */}
            <g className={styles.hole}>
              <circle className={styles.halo} cx={C} cy={C} r="250" fill="url(#sg-halo)" />
              {/* The disc is squashed and tilted, which is what stops the whole
                  thing reading as a flat target. */}
              <ellipse className={styles.disc} cx={C} cy={C} rx="230" ry="66" fill="url(#sg-disc)" />
              <circle className={styles.core} cx={C} cy={C} r="86" fill="url(#sg-core)" />
              <circle className={styles.photon} cx={C} cy={C} r="86" />
            </g>
          </svg>
        </div>

        {/* ------------------------------------------ the other side */}
        <div className={styles.closing}>
          <p className={styles.eyebrow}>On the other side of it</p>
          <h2 className={styles.title}>
            Eleven systems, one point
            <br />
            <span className={styles.titleMuted}>you can see straight through.</span>
          </h2>
          <p className={styles.lead}>
            Every channel, every asset, every site — collapsed into a single auditable score and the
            one instruction that follows from it.
          </p>
          <div className={styles.actions}>
            <Link href="/contact" className={styles.primary}>
              Request access
              <Arrow size={15} />
            </Link>
            <Link href="/how-it-works" className={styles.ghost}>
              See how it works
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
