// Results — the outcome figures, drawn as an annotated dimension rail.
//
// Rather than four cards in a row, the figures hang off a single measurement
// baseline on drop-lines, the way a dimension is called out on an engineering
// drawing. The rail is the argument: these are readings taken off one shared
// scale, not four unrelated boasts.
//
// Underneath it, the two specifications that actually constrain everything else
// — how often the platform samples, and how long it takes to answer. They are
// mirrored about the page axis and carry their own small instrument.

import styles from './Results.module.css';
import { SectionHead, useInView } from './primitives';

const MARKS = [
  { value: '30–45', unit: '%', label: 'Unplanned downtime removed in the first two quarters' },
  { value: '2–3', unit: '×', label: 'Improvement in mean time between failures' },
  { value: '7–14', unit: ' days', label: 'Typical warning ahead of the alarm that would have fired' },
  { value: '6', unit: ' wks', label: 'From gateway on the network to first actioned insight' },
];

/** Sixteen ticks — one for each of the sixteen samples drawn per rendered frame. */
const COMB = Array.from({ length: 16 }, (_, i) => i);

export default function Results() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -15% 0px');

  return (
    <section id="results" className={styles.section}>
      <div className={styles.inner}>
        <SectionHead
          eyebrow="Outcomes"
          title="What changes after cutover"
          align="center"
          lead="Ranges observed across rotating-equipment deployments. Where your plant lands inside them depends on asset mix and how noisy the baseline was to begin with."
        />

        <div ref={ref} className={`${styles.figure} ${inView ? styles.figureShown : ''}`}>
          <div className={styles.plot}>
            {MARKS.map((mark, index) => (
              <div
                key={mark.label}
                className={styles.mark}
                style={{ ['--delay' as string]: `${420 + index * 130}ms` }}
              >
                <div className={styles.value}>
                  <span className={styles.valueNumber}>{mark.value}</span>
                  <span className={styles.valueUnit}>{mark.unit}</span>
                </div>
                <span className={styles.drop} aria-hidden="true" />
                <span className={styles.node} aria-hidden="true" />
              </div>
            ))}
          </div>

          {/* The baseline every figure is measured from. Draws left to right. */}
          <div className={styles.railWrap} aria-hidden="true">
            <span className={styles.rail} />
            <span className={styles.railTicks} />
          </div>

          <div className={styles.captions}>
            {MARKS.map((mark, index) => (
              <p
                key={mark.label}
                className={styles.caption}
                style={{ ['--delay' as string]: `${620 + index * 130}ms` }}
              >
                {mark.label}
              </p>
            ))}
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}

        <div className={styles.specs}>
          <span className={styles.specsAxis} aria-hidden="true" />

          <div className={styles.spec}>
            <span className={styles.specLabel}>Sampling</span>
            <div className={styles.specValue}>
              10<span className={styles.specUnit}>Hz</span>
            </div>
            <p className={styles.specBody}>
              Every mapped channel, continuously — not on a poll, and not only while someone has the
              trend open.
            </p>
            <div className={styles.comb} aria-hidden="true">
              {COMB.map((tick) => (
                <span
                  key={tick}
                  className={styles.combTick}
                  style={{ ['--delay' as string]: `${tick * 0.09}s` }}
                />
              ))}
            </div>
          </div>

          <div className={styles.spec}>
            <span className={styles.specLabel}>Latency</span>
            <div className={styles.specValue}>
              <span className={styles.specLt}>&lt;</span>1<span className={styles.specUnit}>s</span>
            </div>
            <p className={styles.specBody}>
              Question to painted trend, across any window in the history — the console never makes
              you wait to look.
            </p>
            <div className={styles.latency} aria-hidden="true">
              <span className={styles.latencyTrack}>
                <span className={styles.latencyFill} />
              </span>
              <span className={styles.latencyScale}>
                <span>0</span>
                <span>250</span>
                <span>500</span>
                <span>750</span>
                <span>1000 ms</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
