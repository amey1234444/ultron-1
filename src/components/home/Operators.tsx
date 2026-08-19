// Operators, in their words.
//
// Two quotes set straight on the page — no cards. Testimonial cards read as
// marketing furniture; a sentence on black with a short rule and an attribution
// under it reads as something someone said.
//
// The second quote is deliberately short, hangs a long way lower and is set
// right. The asymmetry is what stops the pair reading as a two-column grid of
// equivalent claims: the long one is the argument, the short one is the line
// you remember. Its rule is white rather than lime, because only the first
// quote is a first-hand account from a named plant.

import Link from 'next/link';

import styles from './Operators.module.css';
import { Arrow } from './primitives';

export default function Operators() {
  return (
    <section className={styles.section}>
      <p className={styles.eyebrow}>Operators, in their words</p>

      <figure className={styles.lead}>
        <blockquote className={styles.quote}>
          <p className={styles.quoteText}>
            &ldquo;We had condition data for years and no way to act on it. Now every finding names
            the component and carries its evidence.&rdquo;
          </p>
        </blockquote>
        <figcaption className={styles.attribution}>
          <span className={`${styles.rule} ${styles.ruleAccent}`} aria-hidden="true" />
          Priya Raman · Maintenance manager, Northfield
        </figcaption>
      </figure>

      <figure className={styles.second}>
        <blockquote className={styles.quote}>
          <p className={styles.secondText}>
            &ldquo;A range we can trust beats a date we can&rsquo;t.&rdquo;
          </p>
        </blockquote>
        <figcaption className={styles.attribution}>
          Reliability lead · Cement, 2 plants
          <span className={styles.rule} aria-hidden="true" />
        </figcaption>
      </figure>

      <div className={styles.actions}>
        <Link href="/#industries" className={styles.industries}>
          See the industries we serve
          <Arrow size={14} />
        </Link>
      </div>
    </section>
  );
}
