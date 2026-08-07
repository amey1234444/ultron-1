// Rules — the column architecture that sits behind every public page.
//
// A fixed layer of vertical hairlines pinned to the same measure the content
// uses, so headings, panels and figures all visibly land on a shared grid. It
// is fixed rather than scrolled on purpose: the lines staying put while the
// content moves past them is what reads as a drafting sheet rather than as a
// background image.
//
// Purely decorative and pointer-transparent — it never intercepts a click and
// is hidden from assistive tech.

import styles from './Rules.module.css';

export default function Rules({
  /** Number of columns the measure is divided into. 4 gives 5 rules. */
  columns = 4,
  /** Adds a second, fainter pair just inside the viewport edges. */
  bleed = true,
}: {
  columns?: number;
  bleed?: boolean;
}) {
  return (
    <div className={styles.rules} aria-hidden="true">
      {bleed && (
        <>
          <span className={`${styles.rule} ${styles.ruleBleed} ${styles.ruleLeft}`} />
          <span className={`${styles.rule} ${styles.ruleBleed} ${styles.ruleRight}`} />
        </>
      )}
      <div className={styles.track}>
        {Array.from({ length: columns + 1 }, (_, index) => (
          <span
            key={index}
            className={`${styles.rule} ${
              // The centre rule is the axis every symmetric section is built
              // around, so it carries slightly more weight than its neighbours.
              index * 2 === columns ? styles.ruleAxis : ''
            }`}
          />
        ))}
      </div>
    </div>
  );
}
