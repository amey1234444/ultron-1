// Evidence band — one plant, fourteen months, stated as what was found.
//
// Full-bleed: the photograph runs the whole width of the viewport with no
// frame, no rounding, no border and no desaturation, and every word in this
// section sits on top of it. That is the entire idea of the band. A framed,
// rounded photo reads as an illustration dropped into a layout; an unframed one
// running edge to edge reads as the place itself, which is what earns the
// headline the right to name a plant and a number.
//
// The four figures ride the top on hairline rules, the finding sits bottom
// left. Order matters: the numbers are what happened, the sentence is what it
// meant.

import Link from 'next/link';

import styles from './EvidenceCase.module.css';
import { Arrow, useInView } from './primitives';

const STATS = [
  { value: '4', label: 'bearings caught before they seized' },
  { value: '31%', label: 'fewer unplanned downtime hours' },
  { value: '14 d', label: 'median notice before the window closed' },
  { value: '6 wk', label: 'install to first finding' },
];

export default function EvidenceCase() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -14% 0px');

  return (
    <section id="evidence" className={styles.section}>
      <p className={styles.eyebrow}>
        <span className={styles.eyebrowRule} aria-hidden="true" />
        Case · Northfield · 14 months monitored
      </p>

      <div ref={ref} className={`${styles.media} ${inView ? styles.shown : ''}`}>
        <img
          className={styles.shot}
          src="/images/northfield-plant.png"
          alt="A cement plant preheater tower and stacks at sunset."
          loading="lazy"
          decoding="async"
        />

        {/* Dark at both ends, open through the middle: the top pass carries the
            figures, the bottom pass carries the finding, and the sky between
            them is left alone. */}
        <span className={styles.scrim} aria-hidden="true" />

        <div className={styles.metrics}>
          {STATS.map((stat) => (
            <div key={stat.label} className={styles.metric}>
              <b className={styles.metricValue}>{stat.value}</b>
              <small className={styles.metricLabel}>{stat.label}</small>
            </div>
          ))}
        </div>

        <div className={styles.copy}>
          <h2 className={styles.title}>
            Four bearings replaced on planned stops. None of them failed in service.
          </h2>
          <p className={styles.note}>
            Two of the four were flagged before any threshold was crossed, on trend alone. The plant
            kept its shutdown calendar unchanged.
          </p>
        </div>
      </div>

      <div className={styles.foot}>
        <Link href="/how-it-works" className={styles.trail}>
          See the evidence trail
          <Arrow size={14} />
        </Link>
      </div>
    </section>
  );
}
