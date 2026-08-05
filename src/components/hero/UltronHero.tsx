import type { ReactNode } from 'react';

import styles from './UltronHero.module.css';

export default function UltronHero({ narrowVisual }: { narrowVisual?: ReactNode }) {
  return (
    <section className={styles.hero}>
      <div className={styles.backgroundScene} aria-hidden="true" />
      <div className={styles.backgroundGrade} aria-hidden="true" />
      <div className={styles.backgroundPattern} aria-hidden="true" />

      <div className={styles.heroContent}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Predictive maintenance platform
            <span className={styles.eyebrowIndex}>/01</span>
          </div>

          <h1>
            MACHINE HEALTH,
            <span>IN REAL TIME</span>
          </h1>

          <div className={styles.headingDecoration} aria-hidden="true">
            <span />
          </div>

          <p>
            ULTRON turns raw sensor telemetry into live dashboards and AI-driven failure prediction - so you fix machines
            before they break, not after.
          </p>
        </div>

        {/* Wide viewports get the console render as a right-anchored backdrop
            (see `.backgroundScene`). Below that the render is dropped entirely
            and this column carries the animated live dashboard instead. */}
        <div className={styles.heroVisual}>{narrowVisual}</div>
      </div>

    </section>
  );
}
