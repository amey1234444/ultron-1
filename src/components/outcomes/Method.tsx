// Method — how the outcome figures were arrived at.
//
// The landing page prints four ranges against four baselines. This section
// answers the only question that matters about them: measured how, over what,
// and with what left out. It lives on /outcomes rather than under the figures
// because a landing page has nowhere to put a study.
//
// Set as a definition list rather than as prose. Each row is a decision someone
// made when the study was designed, and a reader checking our arithmetic wants
// to scan for the one they doubt, not read four paragraphs to find it.

import styles from './Method.module.css';
import { Reveal, SectionHead, useInView } from '../home/primitives';

type Entry = {
  term: string;
  detail: string;
};

const DESIGN: Entry[] = [
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
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -12% 0px');

  return (
    <section id="method" className={styles.section}>
      <div className={styles.inner}>
        <SectionHead
          eyebrow="Method"
          title="How those numbers were taken"
          lead="Ranges rather than point estimates, measured against each site's own record. The design of the study, and what it leaves out."
        />

        <div ref={ref} className={`${styles.grid} ${inView ? styles.shown : ''}`}>
          <dl className={styles.terms}>
            {DESIGN.map((entry, index) => (
              <div
                key={entry.term}
                className={styles.row}
                style={{ ['--delay' as string]: `${index * 80}ms` }}
              >
                <dt className={styles.term}>{entry.term}</dt>
                <dd className={styles.detail}>{entry.detail}</dd>
              </div>
            ))}
          </dl>

          <aside className={styles.aside} style={{ ['--delay' as string]: '320ms' }}>
            <h3 className={styles.asideTitle}>Excluded</h3>
            <ul className={styles.exclusions}>
              {EXCLUSIONS.map((line) => (
                <li key={line} className={styles.exclusion}>
                  {line}
                </li>
              ))}
            </ul>
            <Reveal delay={160}>
              <p className={styles.asideFoot}>
                Exclusions are declared before a study runs, not chosen after the figures are in.
              </p>
            </Reveal>
          </aside>
        </div>
      </div>
    </section>
  );
}
