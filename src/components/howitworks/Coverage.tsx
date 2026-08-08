// Always on — the coverage record.
//
// This replaced a rotating radar sweep. A sweep is a nice shape and says almost
// nothing: it implies scanning happens *because* something is going round, and
// the honest version of this claim has no moving part in it at all. Worse, it
// quietly concedes the opposite of the argument — a sweep only knows about an
// asset for the instant the line is on it.
//
// The claim is "every asset, every second, whether anyone is watching or not".
// The proof of that is a complete record, so the record is what gets drawn: one
// row per asset, one cell per five-minute bucket, twenty-four hours across. You
// are meant to look for a hole and not find one.
//
// The argument is closed by the shaded band. That is the night shift, when the
// control room is unstaffed and nobody opened the console once. The record runs
// straight through it at exactly the same density as the rest of the day.
//
// The only live element is the counter and the leading edge. Everything else is
// deliberately still — a page that is always animating has no way left to say
// "this part is happening right now".

import { useEffect, useRef, useState } from 'react';

import styles from './Coverage.module.css';
import { Eyebrow, Reveal, SplitText, useInView } from '../home/primitives';

const ROWS = 12;
const COLS = 48;

const CELL_W = 15;
const CELL_H = 13;
const GAP_X = 3;
const GAP_Y = 5;

const GRID_X = 92;
const GRID_Y = 34;

const VIEW = {
  w: GRID_X + COLS * (CELL_W + GAP_X) + 96,
  h: GRID_Y + ROWS * (CELL_H + GAP_Y) + 54,
};

const ASSETS = [
  'KILN-2',
  'RAV-01',
  'MILL-04',
  'FAN-11',
  'PMP-07',
  'CNV-03',
  'SEP-02',
  'BLR-01',
  'GBX-09',
  'CMP-05',
  'DRV-12',
  'ELV-06',
];

/** The unstaffed window, in column indices — 02:00 to 06:00. */
const NIGHT_FROM = 4;
const NIGHT_TO = 12;

/**
 * Cell state.
 *
 * A hash rather than `Math.random`, so the server and the client draw the same
 * record — a mismatch here would be a hydration error, and a "record" that
 * changes on refresh would be self-defeating anyway.
 *
 * Roughly one cell in fourteen is flagged. Nothing is ever missing: a gap is
 * precisely the thing this drawing is claiming does not exist, so there is no
 * code path that can produce one.
 */
function cellState(row: number, col: number): 'ok' | 'flagged' {
  const hash = (row * 73856093) ^ (col * 19349663);
  return Math.abs(hash) % 14 === 3 ? 'flagged' : 'ok';
}

const cellX = (col: number) => GRID_X + col * (CELL_W + GAP_X);
const cellY = (row: number) => GRID_Y + row * (CELL_H + GAP_Y);

/** Counts upward from a base at a steady rate, for the samples-today figure. */
function useLiveCount(base: number, perSecond: number, active: boolean) {
  const [value, setValue] = useState(base);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = (now: number) => {
      if (startedAt.current === null) startedAt.current = now;
      setValue(base + Math.floor(((now - startedAt.current) / 1000) * perSecond));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, base, perSecond]);

  return value;
}

export default function Coverage() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -20% 0px');
  const samples = useLiveCount(1284402, 128, inView);

  return (
    <section id="always-on" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <Reveal>
            <Eyebrow>Always on</Eyebrow>
          </Reveal>
          <h2 className={styles.title}>
            <SplitText text="Every asset, every second, whether anyone is watching or not" step={38} />
          </h2>
          <Reveal delay={140}>
            <p className={styles.lead}>
              Twenty-four hours of coverage across twelve assets, one cell per five minutes. The
              shaded hours are the night shift — the control room was empty and the console was not
              open on a single screen. Look for a gap.
            </p>
          </Reveal>
        </div>

        <Reveal delay={80}>
          <div ref={ref} className={`${styles.panel} ${inView ? styles.panelIn : ''}`}>
            {['tl', 'tr', 'bl', 'br'].map((corner) => (
              <span key={corner} className={`${styles.tick} ${styles[corner]}`} aria-hidden="true" />
            ))}

            <div className={styles.panelHead}>
              <span className={styles.live}>
                <span className={styles.liveDot} aria-hidden="true" />
                Recording
              </span>
              <span className={styles.counter}>
                {samples.toLocaleString('en-US')}
                <span className={styles.counterUnit}>samples today</span>
              </span>
            </div>

            <div className={styles.scroller}>
              <svg
                className={styles.svg}
                viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
                role="img"
                aria-label="Twenty-four hours of sampling coverage across twelve assets, unbroken through the unstaffed night shift"
              >
                {/* ------------------------------------- unstaffed window */}
                <rect
                  className={styles.night}
                  x={cellX(NIGHT_FROM) - GAP_X / 2}
                  y={GRID_Y - 12}
                  width={(NIGHT_TO - NIGHT_FROM) * (CELL_W + GAP_X)}
                  height={ROWS * (CELL_H + GAP_Y) + 18}
                />
                <text
                  className={styles.nightLabel}
                  x={cellX(NIGHT_FROM) + ((NIGHT_TO - NIGHT_FROM) * (CELL_W + GAP_X)) / 2}
                  y={GRID_Y - 18}
                >
                  UNSTAFFED · 02:00–06:00
                </text>

                {/* ------------------------------------------- asset rows */}
                {ASSETS.map((asset, row) => (
                  <text key={asset} className={styles.asset} x="0" y={cellY(row) + CELL_H - 3}>
                    {asset}
                  </text>
                ))}

                {/* One group per column, so the record draws itself in left to
                    right rather than 576 cells appearing at once. */}
                {Array.from({ length: COLS }, (_, col) => (
                  <g
                    key={col}
                    className={styles.column}
                    style={{ ['--delay' as string]: `${col * 16}ms` }}
                  >
                    {ASSETS.map((asset, row) => {
                      const state = cellState(row, col);
                      return (
                        <rect
                          key={asset}
                          className={`${styles.cell} ${
                            state === 'flagged' ? styles.cellFlagged : ''
                          } ${col === COLS - 1 ? styles.cellEdge : ''}`}
                          x={cellX(col)}
                          y={cellY(row)}
                          width={CELL_W}
                          height={CELL_H}
                          rx="2"
                        />
                      );
                    })}
                  </g>
                ))}

                {/* --------------------------------------- the live edge */}
                <line
                  className={styles.edge}
                  x1={cellX(COLS - 1) + CELL_W + 5}
                  y1={GRID_Y - 12}
                  x2={cellX(COLS - 1) + CELL_W + 5}
                  y2={cellY(ROWS - 1) + CELL_H + 6}
                />
                <text
                  className={styles.edgeLabel}
                  x={cellX(COLS - 1) + CELL_W + 11}
                  y={GRID_Y - 14}
                >
                  NOW
                </text>

                {/* ------------------------------------------------- axis */}
                {['00:00', '06:00', '12:00', '18:00', '24:00'].map((stamp, i) => (
                  <text
                    key={stamp}
                    className={styles.axis}
                    x={GRID_X + (i / 4) * (COLS * (CELL_W + GAP_X) - CELL_W)}
                    y={cellY(ROWS - 1) + CELL_H + 24}
                  >
                    {stamp}
                  </text>
                ))}
              </svg>
            </div>

            <div className={styles.key}>
              <span className={styles.keyItem}>
                <span className={`${styles.keySwatch} ${styles.keyOk}`} aria-hidden="true" />
                Sampled
              </span>
              <span className={styles.keyItem}>
                <span className={`${styles.keySwatch} ${styles.keyFlag}`} aria-hidden="true" />
                Quality-flagged, retained
              </span>
              <span className={styles.keyItem}>
                <span className={`${styles.keySwatch} ${styles.keyGap}`} aria-hidden="true" />
                No data
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={160}>
          <dl className={styles.ledger}>
            {[
              ['Gaps in cover', 'None'],
              ['Longest unbroken run', '184 days'],
              ['Assets recorded', '96'],
              ['Retention', 'Full resolution'],
            ].map(([label, value]) => (
              <div key={label} className={styles.ledgerItem}>
                <dt className={styles.ledgerLabel}>{label}</dt>
                <dd className={styles.ledgerValue}>{value}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
