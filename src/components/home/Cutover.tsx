// Condition band — what measurably changes once monitoring is live.
//
// Four figures, each printed as a range against the number it replaced. The
// "from" line under every value is the whole argument: a range on its own is a
// claim; a range sitting on the baseline it moved off is a measurement. That is
// also why the ranges are ranges and not point estimates — a single figure
// would be the more confident-looking thing to print and the less honest one.
//
// The word "Cutover" is set oversized and nearly black behind the grid. It is
// the section's own name used as ground rather than as a label, which is what
// lets the eyebrow stay small enough to read as an index entry.

import Link from 'next/link';

import styles from './Cutover.module.css';
import { Arrow, useInView } from './primitives';

type Metric = {
  /** What was measured. */
  label: string;
  /** The observed range after cutover — the only green thing in the card. */
  value: string;
  unit: string;
  /** The twelve-month baseline the range is measured against. */
  from: string;
};

const METRICS: Metric[] = [
  {
    label: 'Unplanned downtime',
    value: '210–265',
    unit: 'hrs / yr',
    from: 'From 380 hrs / yr',
  },
  {
    label: 'Mean time between failures',
    value: '9–14',
    unit: 'months',
    from: 'From 4.5 months',
  },
  {
    label: 'Warning before failure',
    value: '7–14',
    unit: 'days',
    from: 'From none reactive',
  },
  {
    label: 'Findings confirmed on inspection',
    value: '95',
    unit: 'per cent',
    from: 'From ~40 per cent',
  },
];

export default function Cutover() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -14% 0px');

  return (
    <section id="condition" className={styles.section}>
      {/* Decorative: the section signs itself behind the figures. */}
      <span className={styles.watermark} aria-hidden="true">
        Cutover
      </span>

      <div className={styles.inner}>
        <header className={styles.head}>
          <div className={styles.headLeft}>
            <p className={styles.eyebrow}>
              <span className={styles.eyebrowRule} aria-hidden="true" />
              Cutover
            </p>
            <h2 className={styles.title}>
              What changes
              <br />
              after cutover
            </h2>
          </div>

          <p className={styles.lead}>
            Measured against the twelve months before monitoring went live.
          </p>
        </header>

        <div ref={ref} className={`${styles.grid} ${inView ? styles.gridShown : ''}`}>
          {METRICS.map((metric, index) => (
            <article
              key={metric.label}
              className={styles.card}
              style={{ ['--delay' as string]: `${index * 110}ms` }}
            >
              <h3 className={styles.cardLabel}>{metric.label}</h3>

              <p className={styles.cardValue}>
                <span className={styles.cardNumber}>{metric.value}</span>
                <span className={styles.cardUnit}>{metric.unit}</span>
              </p>

              <p className={styles.cardFrom}>{metric.from}</p>

              {/* The step off the baseline, drawn once on entry. */}
              <span className={styles.cardBar} aria-hidden="true" />
            </article>
          ))}
        </div>

        <footer className={styles.foot}>
          <p className={styles.note}>Ranges observed across 62 monitored sites</p>
          <Link href="/how-it-works" className={styles.method}>
            Read the method
            <Arrow size={14} />
          </Link>
        </footer>
      </div>
    </section>
  );
}
