// Condition band — what measurably changes once monitoring is live.
//
// Four figures, each printed as a range against the number it replaced. The
// "from" line under every value is the whole argument: a range on its own is a
// claim; a range sitting on the baseline it moved off is a measurement. That is
// also why the ranges are ranges and not point estimates — a single figure
// would be the more confident-looking thing to print and the less honest one.
//
// The band is bronze rather than lime, and spends that colour twice: on the
// oversized word set behind the grid, and on the figure in whichever card the
// cursor is on. The hover colour is deliberately not decoration — at any moment
// exactly one number on the band is warm, and it is the one being read.
//
// That highlight is pure CSS. The design it comes from tracks the hovered card
// in component state; a `:hover` rule gets the same result without a re-render
// per pointer move, and keeps working before hydration.

import Link from 'next/link';

import styles from './Cutover.module.css';
import { Arrow, useInView } from './primitives';

type Metric = {
  /** What was measured. */
  label: string;
  /** The observed range after cutover — bronze under the cursor, white at rest. */
  value: string;
  unit: string;
  /** The twelve-month baseline the range is measured against. */
  from: string;
};

const METRICS: Metric[] = [
  { label: 'Unplanned downtime', value: '210–265', unit: 'hrs / yr', from: 'From 380 hrs / yr' },
  { label: 'Mean time between failures', value: '9–14', unit: 'months', from: 'From 4.5 months' },
  { label: 'Warning before failure', value: '7–14', unit: 'days', from: 'From none, reactive' },
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
      {/* Decorative: the warm cast the band sits in, and the section signing
          itself behind the figures. */}
      <div className={styles.glow} aria-hidden="true" />
      <span className={styles.ghost} aria-hidden="true">
        Cutover
      </span>

      <div className={styles.inner}>
        <header className={styles.head}>
          {/* The break is set rather than left to the measure: the headline is
              two lines of equal weight, and letting it wrap would put "after"
              on the first line at some widths and not others. */}
          <h2 className={styles.title}>
            What changes
            <br />
            after cutover
          </h2>

          {/* Holds the middle track open so the lead sits out at the right edge
              rather than under the headline. */}
          <div className={styles.spacer} aria-hidden="true" />

          <p className={styles.lead}>
            Measured against the twelve months before monitoring went live.
          </p>
        </header>

        <div ref={ref} className={`${styles.cards} ${inView ? styles.shown : ''}`}>
          {METRICS.map((metric, index) => (
            <article
              key={metric.label}
              className={styles.card}
              style={{ ['--delay' as string]: `${index * 90}ms` }}
            >
              <h3 className={styles.cardLabel}>{metric.label}</h3>

              {/* Pushed to the foot of the card so all four figures sit on one
                  line however long the label above them wraps. */}
              <div className={styles.cardFoot}>
                <p className={styles.cardFigure}>
                  <b className={styles.cardValue}>{metric.value}</b>
                  <span className={styles.cardUnit}>{metric.unit}</span>
                </p>
                <p className={styles.cardFrom}>{metric.from}</p>
              </div>
            </article>
          ))}
        </div>

        <footer className={styles.foot}>
          <p className={styles.note}>Ranges observed across 62 monitored sites</p>
          <Link href="/how-it-works" className={styles.method}>
            Read the method
            <Arrow size={17} />
          </Link>
        </footer>
      </div>
    </section>
  );
}
