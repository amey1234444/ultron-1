// Next step — the ask, stated as an exchange rather than as a pitch.
//
// One sentence, one qualifier, one button. The turnaround commitment sits on
// the same line as the button because it is the part that makes the ask cheap
// to accept: what you get back, and when.

import Link from 'next/link';

import styles from './NextStep.module.css';

export default function NextStep() {
  return (
    <section className={styles.section}>
      {/* A single routed trace, the kind drawn on a P&ID. It lives in the right
          34% of the band and is masked to fade out before it reaches the
          headline, so it never crosses type. The lime node is the point the
          path turns — the moment something was decided. */}
      <svg
        className={styles.trace}
        viewBox="0 0 400 300"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M0,255 L120,255 Q160,255 160,215 L160,90 Q160,50 200,50 L400,50"
          fill="none"
          stroke="rgba(255,255,255,.13)"
          strokeWidth="1"
        />
        <circle cx="160" cy="215" r="3.5" fill="#b6f57e" />
        <circle cx="200" cy="50" r="3.5" fill="rgba(255,255,255,.22)" />
      </svg>

      <div className={styles.inner}>
        <p className={styles.eyebrow}>Next step</p>

        <h2 className={styles.title}>Send us one asset list. We&rsquo;ll send back the windows.</h2>

        <div className={styles.foot}>
          <p className={styles.lead}>Fifteen minutes with your own data. No slideware.</p>

          <div className={styles.actions}>
            <span className={styles.reply}>Reply within one working day</span>
            <Link href="/contact" className={styles.cta}>
              Request a demo
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
