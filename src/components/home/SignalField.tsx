// "Raw telemetry → signal → decision" — the pinned centrepiece.
//
// A field of sample points morphs through three arrangements as you scroll: a
// noise cloud (what the plant actually emits), an ordered waveform (what the
// gateway resolves it into), and a ring around the health score it produces
// (what a maintenance engineer acts on). It is one continuous morph rather than
// three separate animations, which is what makes the argument land.
//
// Performance note: nothing in the field goes through React. The scroll handler
// writes `cx`/`cy`/`opacity` straight onto the SVG nodes it holds refs to, so a
// full scroll of this section costs zero re-renders. React state is used only
// for the active phase in the copy column, which changes three times.

import { useEffect, useRef, useState } from 'react';

import styles from './SignalField.module.css';
import { Eyebrow, Reveal, SplitText, clamp01, easeInOut, mapRange } from './primitives';

const PHASES = [
  {
    index: '01 / Noise',
    title: 'What the plant emits',
    body: 'Thousands of samples a second from sensors that disagree about units, scaling and what "good" looks like. On its own it is exhaust, not information.',
  },
  {
    index: '02 / Signal',
    title: 'What the gateway resolves',
    body: 'Every channel is reconciled into one measurement model at the edge — normalised, quality-flagged and directly comparable across the whole site.',
  },
  {
    index: '03 / Decision',
    title: 'What your team acts on',
    body: 'The signal collapses into a single auditable score per asset, and the one instruction that follows from it: which machine to touch, and when.',
  },
];

const COUNT = 96;
const VIEW = { w: 640, h: 420 };
const CENTER = { x: 330, y: 208 };
const RING_R = 132;

/**
 * Small deterministic PRNG (mulberry32).
 *
 * The cloud has to be identical on the server and the client — `Math.random()`
 * here would produce a hydration mismatch on every load.
 */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The waveform the samples resolve into — two harmonics, so it reads as real. */
const waveY = (x: number) =>
  CENTER.y + Math.sin(x / 46) * 62 + Math.sin(x / 19 + 1.2) * 17 + Math.sin(x / 9) * 5;

type Point = { cloud: [number, number]; wave: [number, number]; ring: [number, number]; r: number };

const POINTS: Point[] = (() => {
  const random = mulberry32(0x5eed);
  return Array.from({ length: COUNT }, (_, i) => {
    const t = i / (COUNT - 1);
    const waveX = 44 + t * (VIEW.w - 128);
    // Ring angle starts at the top so the arc and the points share an origin.
    const angle = -Math.PI / 2 + t * Math.PI * 2;
    return {
      cloud: [44 + random() * (VIEW.w - 128), 48 + random() * (VIEW.h - 96)],
      wave: [waveX, waveY(waveX)],
      ring: [CENTER.x + Math.cos(angle) * RING_R, CENTER.y + Math.sin(angle) * RING_R],
      r: 1.3 + random() * 1.5,
    };
  });
})();

const WAVE_PATH = (() => {
  const points = POINTS.map((p) => p.wave);
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    d += ` Q ${a[0].toFixed(1)} ${a[1].toFixed(1)} ${((a[0] + b[0]) / 2).toFixed(1)} ${(
      (a[1] + b[1]) /
      2
    ).toFixed(1)}`;
  }
  return d;
})();

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;
const SCORE = 96;

export default function SignalField() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dotsRef = useRef<(SVGCircleElement | null)[]>([]);
  const waveRef = useRef<SVGPathElement | null>(null);
  const scanRef = useRef<SVGLineElement | null>(null);
  const ringRef = useRef<SVGCircleElement | null>(null);
  const scoreRef = useRef<SVGTextElement | null>(null);
  const scoreGroupRef = useRef<SVGGElement | null>(null);
  const verdictRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLSpanElement | null>(null);

  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pinned = () => window.matchMedia('(min-width: 941px)').matches;

    let frame = 0;
    let lastPhase = -1;

    const render = () => {
      frame = 0;

      // Below the pin breakpoint the wrapper is normal height, so there is no
      // scroll budget to read — the field renders in its final arrangement.
      let p = 1;
      if (pinned() && !reduced) {
        const rect = wrap.getBoundingClientRect();
        const travel = rect.height - window.innerHeight;
        p = travel <= 0 ? 0 : clamp01(-rect.top / travel);
      }

      // Overlapping envelopes: the ring begins gathering while the waveform is
      // still settling, so the three states read as one movement.
      const appear = easeInOut(mapRange(p, 0, 0.1));
      const toWave = easeInOut(mapRange(p, 0.16, 0.5));
      const toRing = easeInOut(mapRange(p, 0.56, 0.85));
      const scoreIn = easeInOut(mapRange(p, 0.66, 0.9));
      const verdictIn = mapRange(p, 0.86, 0.97);

      for (let i = 0; i < POINTS.length; i += 1) {
        const node = dotsRef.current[i];
        if (!node) continue;
        const point = POINTS[i];
        const x = lerp(lerp(point.cloud[0], point.wave[0], toWave), point.ring[0], toRing);
        const y = lerp(lerp(point.cloud[1], point.wave[1], toWave), point.ring[1], toRing);
        node.setAttribute('cx', x.toFixed(2));
        node.setAttribute('cy', y.toFixed(2));
        // Points dim as the waveform stroke takes over the job of showing the
        // shape, then come back as the ring.
        node.setAttribute(
          'opacity',
          (appear * (0.5 - toWave * 0.28 + toRing * 0.45)).toFixed(3),
        );
      }

      if (waveRef.current) {
        waveRef.current.setAttribute('stroke-dashoffset', String(1 - toWave));
        waveRef.current.setAttribute('opacity', ((1 - toRing) * toWave).toFixed(3));
      }

      if (scanRef.current) {
        // A read head sweeping the waveform while it forms.
        const sweep = mapRange(p, 0.2, 0.52);
        const on = sweep > 0.02 && sweep < 0.98 ? 1 : 0;
        scanRef.current.setAttribute('x1', String(44 + sweep * (VIEW.w - 128)));
        scanRef.current.setAttribute('x2', String(44 + sweep * (VIEW.w - 128)));
        scanRef.current.setAttribute('opacity', String(on * 0.5));
      }

      if (ringRef.current) {
        ringRef.current.setAttribute(
          'stroke-dashoffset',
          String(RING_CIRCUMFERENCE * (1 - (SCORE / 100) * scoreIn)),
        );
        ringRef.current.setAttribute('opacity', scoreIn.toFixed(3));
      }

      if (scoreGroupRef.current) {
        scoreGroupRef.current.setAttribute('opacity', scoreIn.toFixed(3));
      }
      if (scoreRef.current) {
        scoreRef.current.textContent = String(Math.round(SCORE * scoreIn));
      }

      glowRef.current?.classList.toggle(styles.fieldGlowOn, toWave > 0.3);
      verdictRef.current?.classList.toggle(styles.verdictOn, verdictIn > 0.5);

      const nextPhase = p >= 0.62 ? 2 : p >= 0.26 ? 1 : 0;
      if (nextPhase !== lastPhase) {
        lastPhase = nextPhase;
        setPhase(nextPhase);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(render);
    };

    render();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section id="signal">
      <div className={styles.wrap} ref={wrapRef}>
        <div className={styles.stage}>
          <div className={styles.inner}>
            <div className={styles.copy}>
              <Reveal>
                <Eyebrow>How it works</Eyebrow>
              </Reveal>
              <h2 className={styles.title}>
                <SplitText text="From noise to a decision" accentFrom={2} step={44} />
              </h2>

              <ol className={styles.phases}>
                {PHASES.map((item, index) => (
                  <li
                    key={item.index}
                    className={`${styles.phase} ${index === phase ? styles.phaseActive : ''}`}
                  >
                    <span className={styles.phaseIndex}>{item.index}</span>
                    <h3 className={styles.phaseTitle}>{item.title}</h3>
                    <p className={styles.phaseBody}>
                      <span>{item.body}</span>
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldGlow} ref={glowRef} aria-hidden="true" />

              <svg
                className={styles.svg}
                viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
                role="img"
                aria-label="A cloud of raw telemetry samples resolving into a waveform and then into a health score of 96"
              >
                <line
                  ref={scanRef}
                  x1="44"
                  y1="40"
                  x2="44"
                  y2={VIEW.h - 40}
                  stroke="var(--u-accent)"
                  strokeWidth="1"
                  opacity="0"
                />

                <path
                  ref={waveRef}
                  d={WAVE_PATH}
                  pathLength={1}
                  fill="none"
                  stroke="var(--u-accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeDasharray="1"
                  strokeDashoffset="1"
                  opacity="0"
                />

                {POINTS.map((point, index) => (
                  <circle
                    key={index}
                    ref={(node) => {
                      dotsRef.current[index] = node;
                    }}
                    cx={point.cloud[0]}
                    cy={point.cloud[1]}
                    r={point.r}
                    fill="#ffffff"
                    opacity="0"
                  />
                ))}

                <circle
                  cx={CENTER.x}
                  cy={CENTER.y}
                  r={RING_R - 18}
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="1"
                />
                <circle
                  ref={ringRef}
                  cx={CENTER.x}
                  cy={CENTER.y}
                  r={RING_R}
                  fill="none"
                  stroke="var(--u-accent)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE}
                  transform={`rotate(-90 ${CENTER.x} ${CENTER.y})`}
                  opacity="0"
                />

                <g ref={scoreGroupRef} opacity="0">
                  <text ref={scoreRef} className={styles.scoreValue} x={CENTER.x} y={CENTER.y + 10}>
                    0
                  </text>
                  <text className={styles.scoreCaption} x={CENTER.x} y={CENTER.y + 34}>
                    HEALTH SCORE
                  </text>
                </g>
              </svg>

              <div className={styles.verdict} ref={verdictRef}>
                <span className={styles.verdictGlyph} aria-hidden="true">
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 4.5 3 20h18L12 4.5Z" />
                    <path d="M12 10v4" />
                    <path d="M12 17.2h.01" />
                  </svg>
                </span>
                <span>
                  <span className={styles.verdictLabel}>Next action</span>
                  <span className={styles.verdictTitle}>Replace bearing DE · RAV-01</span>
                  <span className={styles.verdictMeta}>Predicted alarm in 11 days</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
