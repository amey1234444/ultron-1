// Boundaries — the four things this deliberately does not do.
//
// The page above makes four capability claims. A page that only makes claims is
// a brochure, and the reader this site is written for has read a lot of those:
// the question they arrive with is not "what can it do" but "where does it stop
// pretending". So each limit is stated first and flatly, and what the system
// does instead is stated under it.
//
// No artwork. The argument here is candour, and candour with a diagram on it
// looks like a sales technique — so this is the one section on the page that is
// only sentences, set on a paper band so the change of register is visible.

import styles from './Boundaries.module.css';
import { Reveal, useInView } from '../home/primitives';
import { innerStyles } from '../pages/inner';

type Limit = {
  /** The claim we decline to make, in the reader's own words. */
  limit: string;
  /** What is done instead — always something checkable. */
  instead: string;
};

const LIMITS: Limit[] = [
  {
    limit: 'It does not diagnose a machine it has never seen running well.',
    instead:
      'A baseline is learned from the asset\'s own healthy period before any rule is armed. Until that exists the console reports CONFIGURATION_REQUIRED and names what is missing, rather than comparing the machine against someone else\'s.',
  },
  {
    limit: 'It does not put a failure date on evidence that cannot carry one.',
    instead:
      'A remaining-life figure appears only where a trend is monotonic, long enough to fit, and consistent across the points that would move together. Everywhere else the finding is published without a date instead of with a confident one.',
  },
  {
    limit: 'It does not convert between quantities to make a signal fit.',
    instead:
      'A channel locks onto an instrument only when it measures what that instrument measures. A vibration in g stays in acceleration; it is never quietly integrated to mm/s so a velocity limit can be applied to it.',
  },
  {
    limit: 'It does not hide the reading behind the conclusion.',
    instead:
      'Every finding carries the points it was drawn from, their values at the time, and the limit each was compared against — so a plant engineer can disagree with the model using the same numbers the model used.',
  },
];

export default function Boundaries() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -12% 0px');

  return (
    <section id="boundaries" className={styles.section}>
      <div className={innerStyles.inner}>
        <div className={styles.head}>
          <div>
            <p className={styles.eyebrow}>Boundaries</p>
            <h2 className={styles.title}>What it will not tell you</h2>
          </div>
          <p className={styles.lead}>
            Four claims the system declines to make, and what it does in place of each. These
            are enforced in the analysis layer, not in the copy.
          </p>
        </div>

        <div ref={ref} className={`${styles.list} ${inView ? styles.shown : ''}`}>
          {LIMITS.map((entry, index) => (
            <article
              key={entry.limit}
              className={styles.item}
              style={{ ['--delay' as string]: `${index * 80}ms` }}
            >
              <span className={styles.index} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className={styles.body}>
                <h3 className={styles.limit}>{entry.limit}</h3>
                <p className={styles.instead}>{entry.instead}</p>
              </div>
            </article>
          ))}
        </div>

        <Reveal delay={120}>
          <p className={styles.foot}>
            Each of these is a check in the analysis layer, and each fails loudly rather than
            silently: a rule with nothing behind it reports that it has nothing behind it.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
