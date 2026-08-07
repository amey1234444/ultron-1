// Capabilities — four claims, each with the evidence next to it.
//
// The copy column scrolls normally; the panel column is pinned and swaps its
// contents in place as each block takes the middle of the viewport. That is the
// whole idea of the section: you move through the argument, and the artefact
// beside it changes without ever leaving the spot your eye is already on.
//
// Panels are stacked on top of each other and cross-faded rather than mounted
// and unmounted, so their internal animations are already settled when they
// come forward and nothing re-lays-out mid-scroll.
//
// Colour: the panels are the one place on the site where grey runs out of steps
// — a chart with four series needs four legible strokes. Violet and a very
// light blue carry that load here, alongside white and the green that means
// "live" everywhere else.

import { useEffect, useRef, useState, type ReactNode } from 'react';

import styles from './Capabilities.module.css';
import { SectionHead } from './primitives';

/* -------------------------------------------------------------------------- */
/* Panel chrome                                                               */
/* -------------------------------------------------------------------------- */

function PanelFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      {/* Corner ticks — the drafting mark that says "this is a measured area". */}
      {['tl', 'tr', 'bl', 'br'].map((corner) => (
        <span key={corner} className={`${styles.tick} ${styles[corner]}`} aria-hidden="true" />
      ))}
      <div className={styles.panelLabel}>{label}</div>
      <div className={styles.panelBody}>{children}</div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* 01 — Adaptive: model versions advancing on their own                       */
/* -------------------------------------------------------------------------- */

const LANES = [
  {
    name: 'Kiln controller',
    tone: 'var(--u-violet)',
    segments: [
      { w: 18, version: 'v8.0.1.82', note: '' },
      { w: 26, version: 'v8.0.1.92', note: 'Plant change · raw mix' },
      { w: 24, version: 'v8.0.1.93', note: 'Automated retraining' },
      { w: 32, version: 'v8.0.1.98', note: 'Improved burn-zone forecast', live: true },
    ],
  },
  {
    name: 'Feed optimiser',
    tone: 'var(--u-sky)',
    segments: [
      { w: 14, version: 'v5.0.0.4', note: '' },
      { w: 46, version: 'v5.0.0.6', note: 'Operating regime shift' },
      { w: 40, version: 'v5.0.0.13', note: 'Automated retraining', live: true },
    ],
  },
  {
    name: 'Cooler controller',
    tone: 'rgba(255,255,255,0.62)',
    segments: [
      { w: 30, version: 'v2.4.0.71', note: '' },
      { w: 34, version: 'v2.4.0.77', note: 'Alternative fuel mix' },
      { w: 36, version: 'v2.4.0.80', note: 'Model upgrade', live: true },
    ],
  },
];

function AdaptiveVisual() {
  return (
    <div className={styles.lanes}>
      {LANES.map((lane, laneIndex) => (
        <div key={lane.name} className={styles.lane}>
          <div className={styles.laneName}>{lane.name}</div>
          <div className={styles.laneTrack}>
            {lane.segments.map((segment, index) => (
              <div
                key={segment.version}
                className={styles.segment}
                style={{
                  ['--w' as string]: `${segment.w}%`,
                  ['--tone' as string]: lane.tone,
                  ['--delay' as string]: `${laneIndex * 180 + index * 110}ms`,
                }}
              >
                <span
                  className={`${styles.segmentBar} ${segment.live ? styles.segmentLive : ''}`}
                />
                <span className={styles.segmentVersion}>{segment.version}</span>
                {segment.note && <span className={styles.segmentNote}>{segment.note}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className={styles.laneAxis}>
        {['03/12', '03/18', '03/24', '03/30', '04/05'].map((stamp) => (
          <span key={stamp}>{stamp}</span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 02 — Explainable: what drove the recommendation                            */
/* -------------------------------------------------------------------------- */

const DRIVERS = [
  { name: 'Vibration RMS · DE', weight: 31.4, tone: 'var(--u-violet)' },
  { name: 'Bearing temperature', weight: 24.8, tone: 'var(--u-violet)' },
  { name: 'Load / speed ratio', weight: 18.1, tone: 'var(--u-sky)' },
  { name: 'Lubrication interval', weight: 12.6, tone: 'var(--u-sky)' },
  { name: 'Ambient drift', weight: 8.4, tone: 'rgba(255,255,255,0.55)' },
  { name: 'Harmonic sidebands', weight: 4.7, tone: 'rgba(255,255,255,0.55)' },
];

const TICK_COUNT = 20;

function ExplainableVisual() {
  return (
    <div className={styles.drivers}>
      {DRIVERS.map((driver, index) => {
        const lit = Math.max(1, Math.round((driver.weight / 32) * TICK_COUNT));
        return (
          <div key={driver.name} className={styles.driver} style={{ ['--tone' as string]: driver.tone }}>
            <span className={styles.driverName}>{driver.name}</span>
            <span className={styles.driverWeight}>{driver.weight.toFixed(1)}%</span>
            <span className={styles.driverMeter} aria-hidden="true">
              {Array.from({ length: TICK_COUNT }, (_, tick) => (
                <span
                  key={tick}
                  className={`${styles.driverTick} ${tick < lit ? styles.driverTickOn : ''}`}
                  style={{ ['--delay' as string]: `${index * 80 + tick * 18}ms` }}
                />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 03 — Predictive: measured now, forecast next                               */
/* -------------------------------------------------------------------------- */

const CHART = { w: 520, h: 224 };
const NOW_X = 296;

/** Measured history — a deterministic wobble, not random, so SSR and client agree. */
const MEASURED = Array.from({ length: 34 }, (_, i) => {
  const x = (i / 33) * NOW_X;
  const y = 132 + Math.sin(i / 3.1) * 20 + Math.sin(i / 1.4) * 6 - i * 0.9;
  return [x, y] as const;
});

const MEASURED_PATH = MEASURED.map(([x, y], i) =>
  `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`,
).join(' ');

/** Three forecast branches, spreading as they get further from the last reading. */
const FORECASTS = [-1, 0, 1].map((spread) => {
  const start = MEASURED[MEASURED.length - 1];
  return Array.from({ length: 18 }, (_, i) => {
    const t = i / 17;
    const x = NOW_X + t * (CHART.w - NOW_X - 12);
    const y = start[1] - t * 36 + spread * t * t * 32 + Math.sin(i / 2.4 + spread) * 3;
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
});

function PredictiveVisual() {
  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${CHART.w} ${CHART.h}`}
        role="img"
        aria-label="Measured bearing temperature to now, then three forecast branches spreading into the next shift"
      >
        {[44, 84, 124, 164].map((y) => (
          <line key={y} className={styles.gridline} x1="0" y1={y} x2={CHART.w} y2={y} />
        ))}

        {/* The alarm threshold the forecast is being read against. */}
        <line className={styles.threshold} x1="0" y1="54" x2={CHART.w} y2="54" />
        <text className={styles.chartNote} x="2" y="46">
          ALARM THRESHOLD
        </text>

        <line className={styles.nowLine} x1={NOW_X} y1="12" x2={NOW_X} y2={CHART.h - 30} />
        <text className={styles.chartNote} x={NOW_X + 6} y={CHART.h - 34}>
          NOW
        </text>

        {FORECASTS.map((d, index) => (
          <path
            key={index}
            className={styles.forecast}
            d={d}
            style={{ ['--delay' as string]: `${520 + index * 160}ms` }}
          />
        ))}

        <path className={styles.measured} d={MEASURED_PATH} />
        <circle className={styles.head} cx={NOW_X} cy={MEASURED[MEASURED.length - 1][1]} r="3.6" />
      </svg>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.legendMeasured}`} />
          Measured
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendSwatch} ${styles.legendForecast}`} />
          Forecast · 8 h
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 04 — Flexible: one switch changes what the plant optimises for             */
/* -------------------------------------------------------------------------- */

const STRATEGIES = [
  { name: 'Throughput', caption: 'Maximise output', angle: -46 },
  { name: 'Cost', caption: 'Minimise energy', angle: 4, active: true },
  { name: 'Quality', caption: 'Hold tight specs', angle: 44 },
];

function FlexibleVisual() {
  return (
    <div className={styles.strategies}>
      {STRATEGIES.map((strategy) => (
        <div
          key={strategy.name}
          className={`${styles.strategy} ${strategy.active ? styles.strategyActive : ''}`}
        >
          {strategy.active && <span className={styles.strategyBadge}>Active</span>}
          <span className={styles.strategyName}>{strategy.name}</span>
          <span className={styles.strategyCaption}>{strategy.caption}</span>

          <svg className={styles.gauge} viewBox="0 0 120 66" aria-hidden="true">
            <path className={styles.gaugeArc} d="M 8 60 A 52 52 0 0 1 112 60" />
            <line
              className={styles.gaugeNeedle}
              x1="60"
              y1="60"
              x2="60"
              y2="14"
              style={{ ['--angle' as string]: `${strategy.angle}deg` }}
            />
            <circle className={styles.gaugePivot} cx="60" cy="60" r="2.5" />
          </svg>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const ROWS = [
  {
    tag: 'Adaptive',
    heading: 'Most monitoring is accurate on day one, then quietly drifts. ULTRON re-baselines itself.',
    body: 'Every model retrains against the plant it is actually running on. When the feed, the fuel or the duty cycle changes, the baseline moves with it — you are never comparing today against a machine that no longer exists.',
    label: 'Models update autonomously',
    visual: <AdaptiveVisual />,
  },
  {
    tag: 'Explainable',
    heading: 'For a score to earn trust in a control room, accuracy is not enough. Operators need the why.',
    body: 'Every health figure ships with the channels that moved it, weighted and timestamped. The number is auditable down to the sample, so a maintenance argument ends in the data rather than in the meeting.',
    label: 'Reason for action · 15:40 – 16:10',
    visual: <ExplainableVisual />,
  },
  {
    tag: 'Predictive',
    heading: 'Most systems react to a breach. ULTRON tells you the shift before it happens.',
    body: 'Channels are forecast forward against their own alarm thresholds, with the spread shown rather than hidden. You get the window to act in, and an honest picture of how wide that window is.',
    label: 'Bearing temperature · DE · RAV-01',
    visual: <PredictiveVisual />,
  },
  {
    tag: 'Flexible',
    heading: 'Plant priorities change every quarter. Fixed thresholds do not change with them.',
    body: 'Shift the objective from throughput to cost to quality in one move. Scoring, alarm sensitivity and the recommended action all re-weight behind it — no re-commissioning, no spreadsheet of new limits.',
    label: 'Optimisation strategy',
    visual: <FlexibleVisual />,
  },
];

/**
 * Which copy block currently owns the middle of the viewport.
 *
 * A band collapsed to roughly the centre line: whichever block crosses it wins.
 * That matches what a reader is actually looking at far better than "topmost
 * visible", which flips a beat too early on tall blocks.
 */
function useActiveBlock(count: number) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const nodes = refs.current.filter((node): node is HTMLElement => node !== null);
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = nodes.indexOf(visible.target as HTMLElement);
        if (index >= 0) setActive(index);
      },
      { rootMargin: '-46% 0px -46% 0px', threshold: [0, 0.1, 0.5, 1] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [count]);

  return { refs, active };
}

export default function Capabilities() {
  const { refs, active } = useActiveBlock(ROWS.length);

  return (
    <section id="platform" className={styles.section}>
      <div className={styles.inner}>
        <SectionHead
          eyebrow="The platform"
          title="Built for the control room, not the demo"
          align="center"
        />

        <div className={styles.layout}>
          {/* ---------------------------------------------- copy, scrolling */}
          <div className={styles.copyCol}>
            {ROWS.map((row, index) => (
              <article
                key={row.tag}
                ref={(node) => {
                  refs.current[index] = node;
                }}
                className={`${styles.block} ${index === active ? styles.blockActive : ''}`}
              >
                <span className={styles.blockRule} aria-hidden="true" />
                <span className={styles.tag}>{row.tag}</span>
                <h3 className={styles.heading}>{row.heading}</h3>
                <p className={styles.body}>{row.body}</p>

                {/* The panel, inlined for narrow screens where nothing pins. */}
                <div className={styles.inlinePanel}>
                  <PanelFrame label={row.label}>{row.visual}</PanelFrame>
                </div>
              </article>
            ))}
          </div>

          {/* --------------------------------------------- panels, pinned */}
          <div className={styles.panelCol}>
            <div className={styles.pin}>
              <div className={styles.panelStack}>
                {ROWS.map((row, index) => (
                  <div
                    key={row.tag}
                    className={`${styles.panel} ${index === active ? styles.panelOn : ''}`}
                    aria-hidden={index !== active}
                  >
                    <PanelFrame label={row.label}>{row.visual}</PanelFrame>
                  </div>
                ))}
              </div>

              {/* Where you are in the four, and how far there is left to go. */}
              <div className={styles.steps} aria-hidden="true">
                {ROWS.map((row, index) => (
                  <span
                    key={row.tag}
                    className={`${styles.step} ${index === active ? styles.stepOn : ''}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
