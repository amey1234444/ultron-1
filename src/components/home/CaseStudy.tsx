// The deployment band — one plant, stated as a result.
//
// This is the only light surface on the site. That inversion is doing real work:
// it lifts the section clean out of the page without any decoration, and it is
// the reason it can be the most confident thing here while still being the
// quietest. A second light panel anywhere else would spend the effect.
//
// The reference layouts for this kind of band put a photograph on the right. We
// do not have one, and a stock kiln would have undercut the claim rather than
// supported it — so the right half is the commissioning chart instead. It is a
// better argument anyway: the interesting thing about the cutover is not that
// the mean moved a little, it is that the *spread* collapsed. A photograph
// cannot say that, and the envelope says it without a caption.
//
// NOTE: Ballyconnell is the same reference site the console preview uses, and
// the figures below are illustrative. Swap them for measured numbers before
// this goes in front of customers.

import Link from 'next/link';

import styles from './CaseStudy.module.css';
import { Arrow, useCountUp, useInView } from './primitives';

const CHART = { w: 560, h: 300 };
const WEEKS = 16;
/** The week the controller took over. */
const CUTOVER = 6;

const PAD = { left: 34, right: 14, top: 20, bottom: 30 };
const PLOT = {
  w: CHART.w - PAD.left - PAD.right,
  h: CHART.h - PAD.top - PAD.bottom,
};

/** Specific heat consumption, kcal/kg. The band is the weekly min/max. */
const RANGE = { min: 730, max: 800 };

const y = (value: number) =>
  PAD.top + (1 - (value - RANGE.min) / (RANGE.max - RANGE.min)) * PLOT.h;
const x = (week: number) => PAD.left + (week / (WEEKS - 1)) * PLOT.w;

/**
 * Weekly mean and spread.
 *
 * Deterministic, and shaped to say one thing: before cutover the mean wanders
 * inside a wide band; after it, the band closes to about a third of its width
 * and the mean settles. Both halves are drawn from the same generator so the
 * transition is a change in one parameter rather than two separate curves.
 */
const SERIES = Array.from({ length: WEEKS }, (_, week) => {
  const settled = Math.max(0, Math.min(1, (week - CUTOVER) / 5));
  const spread = 26 - settled * 18;
  const mean =
    772 - settled * 14 + Math.sin(week * 1.7) * (5 - settled * 3.4) + Math.sin(week * 0.7) * 3;
  return { week, mean, upper: mean + spread / 2, lower: mean - spread / 2 };
});

const line = (key: 'mean' | 'upper' | 'lower') =>
  SERIES.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.week).toFixed(1)} ${y(d[key]).toFixed(1)}`).join(
    ' ',
  );

/** The band, as one closed path: upper left-to-right, lower back again. */
const ENVELOPE = `${SERIES.map(
  (d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.week).toFixed(1)} ${y(d.upper).toFixed(1)}`,
).join(' ')} ${[...SERIES]
  .reverse()
  .map((d) => `L ${x(d.week).toFixed(1)} ${y(d.lower).toFixed(1)}`)
  .join(' ')} Z`;

const STATS = [
  { value: 2.2, suffix: '%', decimals: 1, label: 'lower specific heat consumption' },
  { value: 31, suffix: '%', decimals: 0, label: 'less week-to-week variability in free lime' },
  { value: 1.8, suffix: '%', decimals: 1, label: 'lower fuel-derived CO₂ per tonne' },
  { value: 7, suffix: '', decimals: 0, label: 'weeks from first sensor to live control' },
];

function Stat({ stat, active }: { stat: (typeof STATS)[number]; active: boolean }) {
  const value = useCountUp(stat.value, active, 1700);
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>
        {value.toFixed(stat.decimals)}
        <span className={styles.statSuffix}>{stat.suffix}</span>
      </span>
      <span className={styles.statLabel}>{stat.label}</span>
    </div>
  );
}

export default function CaseStudy() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -18% 0px');

  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <div ref={ref} className={`${styles.panel} ${inView ? styles.panelIn : ''}`}>
          <div className={styles.top}>
            {/* ------------------------------------------------ copy */}
            <div className={styles.copy}>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowRule} aria-hidden="true" />
                Cement · Ballyconnell · Kiln line 2
              </p>

              <h2 className={styles.title}>
                A kiln that stopped being tuned by whoever was on shift
              </h2>

              <p className={styles.body}>
                The line was already well run. What it did not have was a baseline that moved with
                the raw mix — so every change in feed chemistry was absorbed by an operator, and the
                result depended on which operator. ULTRON took the burning zone, and the spread
                closed within five weeks of cutover.
              </p>

              <Link href="/contact" className={styles.cta}>
                Take a deeper dive
                <Arrow size={15} />
              </Link>
            </div>

            {/* ----------------------------------------------- chart */}
            <figure className={styles.chartWrap}>
              <figcaption className={styles.chartHead}>
                <span className={styles.chartTitle}>Specific heat consumption</span>
                <span className={styles.chartUnit}>kcal/kg · weekly min–max</span>
              </figcaption>

              <svg
                className={styles.chart}
                viewBox={`0 0 ${CHART.w} ${CHART.h}`}
                role="img"
                aria-label="Weekly specific heat consumption over sixteen weeks. The min-max band narrows to about a third of its width and the mean settles lower after the controller takes over in week six."
              >
                {[740, 760, 780, 800].map((value) => (
                  <g key={value}>
                    <line
                      className={styles.gridline}
                      x1={PAD.left}
                      y1={y(value)}
                      x2={CHART.w - PAD.right}
                      y2={y(value)}
                    />
                    <text className={styles.tickLabel} x={PAD.left - 8} y={y(value) + 3}>
                      {value}
                    </text>
                  </g>
                ))}

                {/* The band. This is the finding. */}
                <path className={styles.envelope} d={ENVELOPE} />
                <path className={styles.bound} d={line('upper')} />
                <path className={styles.bound} d={line('lower')} />
                <path className={styles.mean} d={line('mean')} />

                {/* Cutover. */}
                <line
                  className={styles.cutover}
                  x1={x(CUTOVER)}
                  y1={PAD.top - 8}
                  x2={x(CUTOVER)}
                  y2={CHART.h - PAD.bottom}
                />
                <text className={styles.cutoverLabel} x={x(CUTOVER) + 6} y={PAD.top - 10}>
                  CONTROLLER LIVE
                </text>

                {['Week 0', 'Week 8', 'Week 16'].map((label, i) => (
                  <text
                    key={label}
                    className={styles.axisLabel}
                    x={PAD.left + (i / 2) * PLOT.w}
                    y={CHART.h - 10}
                    textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
                  >
                    {label}
                  </text>
                ))}
              </svg>
            </figure>
          </div>

          {/* ------------------------------------------------ stats */}
          <div className={styles.stats}>
            {STATS.map((stat) => (
              <Stat key={stat.label} stat={stat} active={inView} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
