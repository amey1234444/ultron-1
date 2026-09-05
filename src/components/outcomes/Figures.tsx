// Figures — the four outcome ranges, each with the baseline it moved off.
//
// Four cards, and the numbers are the whole of it: the range after cutover, the
// twelve-month baseline under it, and one line saying what was counted. The
// schematic bar this used to draw was an axis without a scale — it looked like
// a measurement and carried none, so the measurement is now only the figures.

import styles from './Figures.module.css';
import { useInView } from '../home/primitives';
import { InnerHead, innerStyles } from '../pages/inner';

type Figure = {
  label: string;
  value: string;
  unit: string;
  from: string;
  note: string;
};

const FIGURES: Figure[] = [
  {
    label: 'Unplanned downtime',
    value: '210–265',
    unit: 'hrs / yr',
    from: '380 hrs / yr',
    note: 'Hours the plant did not plan to lose, over twelve months, per site.',
  },
  {
    label: 'Mean time between failures',
    value: '9–14',
    unit: 'months',
    from: '4.5 months',
    note: 'Per monitored asset, counting only failures inside the monitored envelope.',
  },
  {
    label: 'Warning before failure',
    value: '7–14',
    unit: 'days',
    from: 'none · reactive',
    note: 'Time between the first finding and the window in which the asset was taken out.',
  },
  {
    label: 'Findings confirmed on inspection',
    value: '95',
    unit: 'per cent',
    from: '~40 per cent',
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
          title="The difference, *in numbers.*"
          lead="Each result includes its baseline and measurement scope."
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
                  Baseline <b>{figure.from}</b>
                </p>
              </div>

              <p className={styles.note}>{figure.note}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
