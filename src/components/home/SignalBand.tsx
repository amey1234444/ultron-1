// The closer — all of the signals, none of the noise.
//
// This replaces a solar-system collapse that was doing the wrong job. That
// section was *heavy*: nine orbiting bodies, labels, an accretion disc, and
// three and a half viewport-heights of scrubbing to get through it. It was the
// loudest thing on a page whose whole argument is that BlackGATE is the quiet one.
//
// The reference works the opposite way — a lot of empty black, a field of very
// fine lines, and exactly one thing worth looking at. So this is a single
// static figure, symmetric about the page axis:
//
//   · Eighty-one hairline ticks across a band. Almost all of them are short and
//     grey. That is the plant talking — the raw channel count, drawn at a
//     density you are meant to feel rather than count.
//   · Three of them are tall and white. Those are the readings that actually
//     mean something today.
//
// Symmetry is load-bearing, not styling: tick heights are a function of
// *distance from the centre*, so the left half is the exact mirror of the right
// and the whole band balances on the same axis the headline is centred on.
//
// It settles once, on entry, and then holds still. No scrub, no loop, nothing
// asking for attention after the first read.

import Link from 'next/link';

import styles from './SignalBand.module.css';
import { Arrow, useInView } from './primitives';

/** Odd, so there is a true centre tick to hang the axis on. */
const TICKS = 81;
const MID = (TICKS - 1) / 2;

/** Distance from centre, in ticks, of the readings that matter. */
const SIGNAL_AT = new Set([0, 14, 28]);

/** Deterministic, so server and client agree. */
function noise(seed: number) {
  const x = Math.sin(seed * 51.3 + 19.7) * 43758.5453;
  return x - Math.floor(x);
}

const BARS = Array.from({ length: TICKS }, (_, i) => {
  // Everything keys off distance from the centre, which is what makes the two
  // halves mirror exactly.
  const d = Math.abs(i - MID);
  const signal = SIGNAL_AT.has(d);
  return {
    i,
    d,
    signal,
    // Signals are tall and fall off gently towards the edges; noise is short and
    // irregular. The gap between the two populations is the entire point, so it
    // is deliberately wide.
    height: signal ? 94 - d * 1.15 : 5 + noise(d) * 21,
  };
});

export default function SignalBand() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -18% 0px');

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Signals</p>
        <h2 className={styles.title}>
          All of the signals.
          <br />
          <span className={styles.titleMuted}>None of the noise.</span>
        </h2>
        <p className={styles.lead}>
          A mid-size line publishes tens of thousands of readings an hour. On any given morning three
          of them are worth your attention. BlackGATE&rsquo;s job is to be certain which three.
        </p>

        <div
          ref={ref}
          className={`${styles.band} ${inView ? styles.bandShown : ''}`}
          role="img"
          aria-label="A dense field of short grey ticks representing raw plant channels, with three tall white ticks standing out from it — the readings that warrant attention."
        >
          {/* The ticks get their own wrapper so the narrow-screen thinning rule
              can count them without also counting the baseline and the axis. */}
          <div className={styles.bars}>
            {BARS.map((bar) => (
              <span
                key={bar.i}
                className={`${styles.bar} ${bar.signal ? styles.barSignal : ''}`}
                style={{
                  ['--h' as string]: `${bar.height}%`,
                  // Settles outward from the centre, so the axis resolves first
                  // and the eye is already in the right place.
                  ['--delay' as string]: `${bar.d * 11}ms`,
                }}
              />
            ))}
          </div>
          <span className={styles.baseline} aria-hidden="true" />
          <span className={styles.axis} aria-hidden="true" />
        </div>

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
    </section>
  );
}
