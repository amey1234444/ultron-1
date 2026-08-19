// Operators, in their words.
//
// Two quotes, set on the page rather than in cards. Testimonial cards read as
// marketing furniture; a sentence sitting on black with a hairline and an
// attribution under it reads as something someone said.
//
// The second quote is deliberately short and hangs lower and to the right. The
// asymmetry is what stops the pair from reading as a two-column grid of
// equivalent claims — the long one is the argument, the short one is the line
// you remember.

import Link from 'next/link';

import styles from './Operators.module.css';
import { Arrow, useInView } from './primitives';

const QUOTES = [
  {
    quote:
      'We had condition data for years and no way to act on it. Now every finding names the component and carries its evidence.',
    attribution: 'Priya Raman · Maintenance manager, Northfield',
  },
  {
    quote: 'A range we can trust beats a date we can’t.',
    attribution: 'Reliability lead · Cement, 2 plants',
  },
];

export default function Operators() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -18% 0px');

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowRule} aria-hidden="true" />
          Operators, in their words
        </p>

        <div ref={ref} className={`${styles.grid} ${inView ? styles.gridShown : ''}`}>
          {QUOTES.map((entry, index) => (
            <figure
              key={entry.attribution}
              className={styles.item}
              style={{ ['--delay' as string]: `${index * 180}ms` }}
            >
              <blockquote className={styles.quote}>
                <p className={styles.quoteText}>&ldquo;{entry.quote}&rdquo;</p>
              </blockquote>

              <figcaption className={styles.attribution}>
                <span className={styles.attributionRule} aria-hidden="true" />
                {entry.attribution}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className={styles.actions}>
          <Link href="/#industries" className={styles.industries}>
            See the industries we serve
            <Arrow size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
