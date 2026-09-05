// Method — how the outcome figures were arrived at.
//
// The figures above are ranges against baselines. This section answers the
// only question that matters about them: measured how, over what, and with
// what left out. Set as definition rows rather than prose: each row is a
// decision someone made when the study was designed, and a reader checking
// our arithmetic wants to scan for the one they doubt.

import styles from './Method.module.css';
import { InnerHead, Rows, innerStyles } from '../pages/inner';
import { useInView } from '../home/primitives';

const DESIGN = [
  {
    term: 'Baseline window',
    detail:
      'The twelve months immediately before monitoring went live on that asset, taken from the site\'s own maintenance record rather than from a survey. Sites without a complete twelve months are excluded rather than pro-rated.',
  },
  {
    term: 'Comparison window',
    detail:
      'The twelve months after commissioning, starting at the first full month — the commissioning month itself is dropped, because it contains the shutdown the install needed.',
  },
  {
    term: 'Population',
    detail:
      'Sixty-two assets across rotating equipment: extruders, gearboxes, pumps and their drives. Each contributes once. An asset that failed for a reason outside the monitored envelope stays in the population; removing it would flatter the figure.',
  },
  {
    term: 'Confirmed finding',
    detail:
      'A finding is confirmed only when the inspection that followed it found the component the model named, in the condition it predicted. A finding that was right about the machine and wrong about the part counts as unconfirmed.',
  },
];

const EXCLUSIONS: string[] = [
  'Downtime from causes the instrumentation cannot see — utilities, feedstock, upstream process.',
  'Assets where fewer than eighty per cent of expected points were mapped at cutover.',
  'Any period where the feed was stale for more than four hours, at either end of the comparison.',
];

export default function Method() {
  const { ref, inView } = useInView<HTMLElement>('0px 0px -12% 0px');

  return (
    <section id="method" className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
      <div className={innerStyles.inner}>
        <InnerHead
          eyebrow="Method"
          title="How those numbers were *taken*"
          lead="Ranges rather than point estimates, measured against each site's own record. The design of the study, and what it leaves out — declared before it ran, not chosen after the figures were in."
        />

        <div className={styles.grid}>
          <Rows items={DESIGN} />

          <aside ref={ref} className={`${styles.aside} ${inView ? styles.shown : ''}`}>
            <p className={styles.asideEyebrow}>Excluded</p>
            <ul className={styles.exclusions}>
              {EXCLUSIONS.map((line, index) => (
                <li
                  key={line}
                  className={styles.exclusion}
                  style={{ ['--delay' as string]: `${200 + index * 90}ms` }}
                >
                  {line}
                </li>
              ))}
            </ul>
            <p className={styles.asideFoot}>
              Exclusions are declared before a study runs, not chosen after the figures are in.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
