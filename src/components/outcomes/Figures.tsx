// Figures — the four outcome ranges, drawn against the baseline each moved off.
//
// The landing page prints these as numbers. Here each is a bar: the grey mark
// is the twelve-month baseline, the white band is the observed range after
// cutover. Where lower is better the band sits left of the mark; where higher
// is better it sits right. The same four figures as the landing page, so the
// two never disagree.

import styles from './Figures.module.css';
import { useInView } from '../home/primitives';
import { InnerHead, innerStyles } from '../pages/inner';

type Figure = {
  label: string;
  value: string;
  unit: string;
  from: string;
  /** Position of the baseline and range on a 0–100 scale. */
  baseline: number;
  range: [number, number];
  better: 'lower' | 'higher';
  note: string;
};

const FIGURES: Figure[] = [
  {
    label: 'Unplanned downtime',
    value: '210–265',
    unit: 'hrs / yr',
    from: '380 hrs / yr',
    baseline: 88,
    range: [46, 60],
    better: 'lower',
    note: 'Hours the plant did not plan to lose, over twelve months, per site.',
  },
  {
    label: 'Mean time between failures',
    value: '9–14',
    unit: 'months',
    from: '4.5 months',
    baseline: 28,
    range: [56, 88],
    better: 'higher',
    note: 'Per monitored asset, counting only failures inside the monitored envelope.',
  },
  {
    label: 'Warning before failure',
    value: '7–14',
    unit: 'days',
    from: 'none · reactive',
    baseline: 4,
    range: [44, 88],
    better: 'higher',
    note: 'Time between the first finding and the window in which the asset was taken out.',
  },
  {
    label: 'Findings confirmed on inspection',
    value: '95',
    unit: 'per cent',
    from: '~40 per cent',
    baseline: 40,
    range: [93, 97],
    better: 'higher',
    note: 'A finding is confirmed only when inspection found the named component in the predicted state.',
  },
];

export default function Figures() {
  const { ref, inView } = useInView<HTMLOListElement>('0px 0px -10% 0px');
  return (
    <section id="figures" className={innerStyles.section}>
      <div className={innerStyles.inner}>
        <InnerHead
          eyebrow="Four figures"
          title="A range sitting on the *baseline* it moved off"
          lead="A range on its own is a claim. A range drawn against the number it replaced is a measurement. Sixty-two assets, twelve months either side of cutover, each site against its own record."
        />

        <ol ref={ref} className={`${styles.list} ${inView ? styles.shown : ''}`}>
          {FIGURES.map((figure, index) => (
            <li
              key={figure.label}
              className={styles.figure}
              style={{ ['--delay' as string]: `${index * 110}ms` }}
            >
              <div className={styles.copy}>
                <p className={styles.label}>
                  <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
                  {figure.label}
                </p>
                <p className={styles.value}>
                  {figure.value}
                  <span className={styles.unit}>{figure.unit}</span>
                </p>
                <p className={styles.from}>
                  From <b>{figure.from}</b>
                </p>
              </div>

              <div className={styles.track} aria-hidden="true">
                <span className={styles.trackLine} />
                <span
                  className={styles.band}
                  style={{
                    left: `${figure.range[0]}%`,
                    width: `${figure.range[1] - figure.range[0]}%`,
                  }}
                />
                <span className={styles.mark} style={{ left: `${figure.baseline}%` }}>
                  <span className={styles.markLabel}>baseline</span>
                </span>
                <span className={styles.arrow} data-better={figure.better}>
                  {figure.better === 'lower' ? '← lower is better' : 'higher is better →'}
                </span>
              </div>

              <p className={styles.note}>{figure.note}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
