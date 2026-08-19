// In the room — who actually opens a finding, and what each of them checks.
//
// The reference frames this with a photograph of two people mid-conversation.
// We do not have that photograph and would not stage one, so the left plate
// carries the surface they are all looking at instead — which is closer to the
// point being made anyway: the reason the argument does not start is that
// everyone in the room is reading the same screen.

import Link from 'next/link';

import styles from './InTheRoom.module.css';
import { Arrow, useInView } from './primitives';

const ROLES = [
  {
    role: 'Reliability engineer',
    checks: 'Checks the signal and the contributing factors',
  },
  {
    role: 'Maintenance planner',
    checks: 'Checks the window against the shutdown calendar',
  },
  {
    role: 'Plant director',
    checks: 'Reads the morning list, nothing else',
  },
];

export default function InTheRoom() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -16% 0px');

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowRule} aria-hidden="true" />
          In the room
        </p>

        <div ref={ref} className={`${styles.grid} ${inView ? styles.gridShown : ''}`}>
          <figure className={styles.plate}>
            <img
              className={styles.shot}
              src="/images/ultron-hero-console.png"
              alt="The ULTRON console showing plant health, an active-alarm count and a health trend."
              loading="lazy"
              decoding="async"
            />
            <span className={styles.scrim} aria-hidden="true" />

            <figcaption className={styles.caption}>
              <h2 className={styles.title}>The report lands before the argument starts.</h2>
              <p className={styles.body}>
                Reliability engineers and maintenance planners open the same finding, see the same
                evidence, and spend the meeting deciding when to take the machine out — not whether
                the alert is real.
              </p>
            </figcaption>
          </figure>

          <div className={styles.roles}>
            <h3 className={styles.rolesTitle}>Who opens the finding</h3>

            <ul className={styles.rolesList}>
              {ROLES.map((entry, index) => (
                <li
                  key={entry.role}
                  className={styles.role}
                  style={{ ['--delay' as string]: `${220 + index * 120}ms` }}
                >
                  <span className={styles.roleName}>{entry.role}</span>
                  <span className={styles.roleChecks}>{entry.checks}</span>
                </li>
              ))}
            </ul>

            <Link href="/about" className={styles.meet}>
              Meet the team
              <Arrow size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
