// Ambience — the animated field behind every public page.
//
// The page used to sit on nothing but a set of static column hairlines. This
// keeps that drafting grid (it is what makes headings and panels visibly share
// a measure) and builds the rest of the environment around it, so the ground
// reads as a live instrument rather than as ruled paper:
//
//   aurora   three very low-alpha white fields, drifting on long periods
//   mesh     a fine dot matrix that gives the plane texture beyond lines
//   rules    the existing column grid
//   pulses   light traces running down individual rules, like data on a bus
//   waves    two telemetry traces scrolling at different speeds
//   scan     one slow instrument sweep down the viewport
//   grain    noise, purely to stop the gradients banding on wide displays
//
// Everything animates on transform/opacity only, so the whole field stays on
// the compositor and costs nothing per frame on the main thread. The single
// exception is the scroll parallax, which writes one custom property per frame
// and lets CSS do the work — the same approach the hero already uses.
//
// Decorative throughout: pointer-transparent and hidden from assistive tech.

import { useEffect, useRef } from 'react';

import { useReducedMotion } from './primitives';
import Rules from './Rules';
import styles from './Ambience.module.css';

/** Column indices that carry a travelling pulse, with their timing offsets. */
const PULSES = [
  { column: 0, delay: '0s', duration: '11s' },
  { column: 1, delay: '4.5s', duration: '14s' },
  { column: 2, delay: '2s', duration: '9.5s' },
  { column: 3, delay: '7.5s', duration: '13s' },
  { column: 4, delay: '5.5s', duration: '10.5s' },
];

const WAVE_WIDTH = 1200;
const WAVE_HEIGHT = 120;

/**
 * One period-aligned telemetry trace, emitted twice end to end.
 *
 * Because the sampled function is periodic over `WAVE_WIDTH`, the second copy
 * starts exactly where the first ends — so translating the pair by one width
 * loops seamlessly with no visible seam and no JS per frame.
 */
function wavePath(amplitude: number, periods: number, phase: number, detail = 96): string {
  const mid = WAVE_HEIGHT / 2;
  const points: string[] = [];
  for (let index = 0; index <= detail * 2; index += 1) {
    const x = (index / detail) * WAVE_WIDTH;
    const t = (index / detail) * periods * Math.PI * 2 + phase;
    // Three harmonics, so the line reads as a signal rather than a pure sine.
    const y = mid + Math.sin(t) * amplitude + Math.sin(t * 2.7 + 1.1) * amplitude * 0.32 + Math.sin(t * 5.3 + 0.4) * amplitude * 0.12;
    points.push(`${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return points.join(' ');
}

/** Writes normalised scroll depth onto the field so CSS can parallax against it. */
function useScrollDepth(reduced: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.style.setProperty('--depth', '0');
      return;
    }

    let frame = 0;
    const apply = () => {
      frame = 0;
      const travel = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      el.style.setProperty('--depth', (window.scrollY / travel).toFixed(4));
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

  return ref;
}

export default function Ambience({
  /** Number of columns the measure is divided into. 4 gives 5 rules. */
  columns = 4,
}: {
  columns?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useScrollDepth(reduced);

  return (
    <div
      className={`${styles.field} ${reduced ? styles.still : ''}`}
      ref={ref}
      aria-hidden="true"
    >
      <div className={styles.aurora}>
        <span className={`${styles.glow} ${styles.glowHigh}`} />
        <span className={`${styles.glow} ${styles.glowMid}`} />
        <span className={`${styles.glow} ${styles.glowLow}`} />
      </div>

      <div className={styles.mesh} />

      <Rules columns={columns} />

      {/* Pulses ride the same measure as the rules, so each one runs exactly
          down a hairline instead of near it. */}
      <div className={styles.track}>
        {Array.from({ length: columns + 1 }, (_, index) => {
          const pulse = PULSES.find((candidate) => candidate.column === index);
          return (
            <span key={index} className={styles.lane}>
              {pulse && (
                <span
                  className={styles.pulse}
                  style={{ animationDelay: pulse.delay, animationDuration: pulse.duration }}
                />
              )}
            </span>
          );
        })}
      </div>

      <div className={styles.waves}>
        <svg
          className={`${styles.wave} ${styles.waveFar}`}
          viewBox={`0 0 ${WAVE_WIDTH * 2} ${WAVE_HEIGHT}`}
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d={wavePath(21, 3, 0)} />
        </svg>
        <svg
          className={`${styles.wave} ${styles.waveNear}`}
          viewBox={`0 0 ${WAVE_WIDTH * 2} ${WAVE_HEIGHT}`}
          preserveAspectRatio="none"
          focusable="false"
        >
          <path d={wavePath(30, 2, 2.2)} />
        </svg>
      </div>

      <span className={styles.scan} />
      <div className={styles.grain} />
      <div className={styles.vignette} />
    </div>
  );
}
