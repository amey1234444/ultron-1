// Ambience — the field behind every public page.
//
// Five fixed layers, painted once and never animated:
//
//   grid      a 56px line mesh at 3.2% white, radially masked so it fades out
//             from the centre and never reaches the edges of the frame
//   top       a soft white bloom entering from above the fold
//   bottom    a second, weaker bloom rising from below
//   vignette  darkens the outer frame so the centre reads as lit
//   grain     fractal noise at 5% on `overlay`, purely to stop the two blooms
//             banding into visible steps on wide displays
//
// This used to be a live instrument: drifting colour fields, light traces
// running down the column rules, two scrolling telemetry waves and a sweep. All
// of it is gone. On a page whose whole argument is "we only show you things
// that mean something", a background that is permanently in motion is the one
// element contradicting it — and at rest the type and the two photographs are
// the only things moving the eye, which is the point.
//
// Nothing here animates, so there is no reduced-motion branch to take and no
// per-frame work of any kind. Decorative: pointer-transparent, hidden from
// assistive tech.

import styles from './Ambience.module.css';

export default function Ambience() {
  return (
    <div className={styles.field} aria-hidden="true">
      <div className={`${styles.layer} ${styles.grid}`} />
      <div className={`${styles.layer} ${styles.top}`} />
      <div className={`${styles.layer} ${styles.bottom}`} />
      <div className={`${styles.layer} ${styles.vignette}`} />
      <div className={`${styles.layer} ${styles.grain}`} />
    </div>
  );
}
