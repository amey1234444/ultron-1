// In the room — who actually opens a finding, and what each of them checks.
//
// A 74/26 split. The photograph takes the wide track and bleeds off the left
// edge of the viewport at full colour — no frame, no rounding, no wash. It is
// the only warm, fully saturated thing on the page, and it is carrying the
// claim: the section is about people agreeing in a room, so the room has to be
// a real one rather than a console screenshot standing in for one.
//
// The narrow track is a hairline-ruled list of the three people who open a
// finding, bottom-aligned against the image so the last role and the base of
// the photograph land on the same line.

import Link from 'next/link';

import styles from './InTheRoom.module.css';
import { Arrow, useInView } from './primitives';

const ROLES = [
  { role: 'Reliability engineer', checks: 'Checks the signal and the contributing factors' },
  { role: 'Maintenance planner', checks: 'Checks the window against the shutdown calendar' },
  { role: 'Plant director', checks: 'Reads the morning list, nothing else' },
];

export default function InTheRoom() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -14% 0px');

  return (
    <section className={styles.section}>
      <p className={styles.eyebrow}>
        <span className={styles.eyebrowRule} aria-hidden="true" />
        In the room
      </p>

      <div ref={ref} className={`${styles.grid} ${inView ? styles.shown : ''}`}>
        <figure className={styles.media}>
          <img
            className={styles.shot}
            src="/images/in-the-room.png"
            alt="Two colleagues at a table reviewing a printed condition report."
            loading="lazy"
            decoding="async"
          />

          {/* Bottom-weighted only. The top two thirds of the frame stay clear so
              the faces are never washed out — the scrim exists to hold the
              headline, not to darken the photograph. */}
          <span className={styles.scrim} aria-hidden="true" />

          <figcaption className={styles.copy}>
            <span className={styles.copyRule} aria-hidden="true" />
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

          {ROLES.map((entry) => (
            <div key={entry.role} className={styles.role}>
              <b className={styles.roleName}>{entry.role}</b>
              <small className={styles.roleChecks}>{entry.checks}</small>
            </div>
          ))}

          <Link href="/about" className={styles.meet}>
            Meet the team
            <Arrow size={13} />
          </Link>
        </div>
      </div>
    </section>
  );
}
