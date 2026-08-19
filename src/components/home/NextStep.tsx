// Next step — the ask, stated as an exchange rather than as a pitch.
//
// One sentence, one qualifier, one button. The turnaround commitment is set on
// the same line as the button because it is the part that makes the ask cheap
// to accept: what you get back, and when.

import Link from 'next/link';

import styles from './NextStep.module.css';
import { Arrow } from './primitives';

export default function NextStep() {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowRule} aria-hidden="true" />
          Next step
        </p>

        <h2 className={styles.title}>
          Send us one asset list. We&rsquo;ll send back the windows.
        </h2>

        <p className={styles.lead}>
          Fifteen minutes with your own data.
          <br />
          No slideware.
        </p>

        <span className={styles.rule} aria-hidden="true" />

        <div className={styles.foot}>
          <p className={styles.reply}>Reply within one working day</p>
          <Link href="/contact" className={styles.cta}>
            Request a demo
            <Arrow size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
