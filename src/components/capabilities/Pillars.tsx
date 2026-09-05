// Pillars — the four capability claims, each with the artefact that proves it.
//
// Four plates on the wall: one paper, one raised, two dark. Each carries a small
// drawing of the thing the claim is about — a baseline that re-learns, a finding
// with its evidence, a forecast drawn as a cone, an instruction with a window —
// because a capability without its artefact is a slogan.

import styles from './Pillars.module.css';
import { GateMark, InnerHead, Plate, PlateWall, RingsMark, WaveMark, innerStyles } from '../pages/inner';

function BaselineArt() {
  // A drifting signal with the baseline re-fitting under it: the dashed line
  // follows the mean of the last stretch rather than the first.
  return (
    <svg viewBox="0 0 320 120" className={styles.art} aria-hidden="true">
      <defs>
        <linearGradient id="pl-fade" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0" />
          <stop offset="0.25" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      <g className={styles.gridLines}>
        <path d="M0 30h320M0 60h320M0 90h320" />
      </g>
      <path
        className={styles.baseOld}
        d="M0 62h140"
        strokeDasharray="4 5"
      />
      <path className={styles.baseNew} d="M140 62 L200 52 L320 46" strokeDasharray="4 5" />
      <path
        className={styles.signal}
        stroke="url(#pl-fade)"
        d="M0 64c10-6 14 8 24 2s12-12 22-6 10 14 20 8 12-10 22-4 10 12 20 6 12-14 22-8 10 10 20 4 12-12 22-8 10 8 20 2 12-10 22-6 10 8 20 2 12-8 22-6 10 6 22 2"
      />
      <circle className={styles.dotHot} cx="140" cy="62" r="3.5" />
      <text className={styles.label} x="146" y="80">
        re-baseline
      </text>
      <text className={styles.label} x="0" y="14">
        vib · mm/s
      </text>
    </svg>
  );
}

function EvidenceArt() {
  // A finding and the three points it was drawn from, each with its value and
  // the limit it crossed. Ink on paper.
  return (
    <svg viewBox="0 0 320 130" className={styles.art} aria-hidden="true">
      <rect className={styles.paperCard} x="0.5" y="0.5" width="319" height="129" rx="10" />
      <text className={styles.paperLabel} x="16" y="24">
        FINDING · GEARBOX 02 · OUTPUT BEARING
      </text>
      <path className={styles.paperRule} d="M16 34h288" />
      {[
        ['DE bearing temp', '78.4 °C', '> 72', 52],
        ['Vibration 1×', '4.9 mm/s', '> 4.5', 76],
        ['Envelope BPFO', '2.1 g', '> 1.4', 100],
      ].map(([name, value, limit, y]) => (
        <g key={String(name)}>
          <circle className={styles.paperDot} cx="22" cy={Number(y) - 4} r="3" />
          <text className={styles.paperText} x="34" y={y}>
            {name}
          </text>
          <text className={styles.paperValue} x="196" y={y}>
            {value}
          </text>
          <text className={styles.paperLimit} x="266" y={y}>
            {limit}
          </text>
        </g>
      ))}
      <path className={styles.paperRule} d="M16 112h288" />
      <text className={styles.paperLabel} x="16" y="124">
        3 OF 3 POINTS MOVED TOGETHER
      </text>
    </svg>
  );
}

function ForecastArt() {
  // A trend drawn into a cone rather than a line: the spread widens with the
  // horizon, and the limit sits where the cone meets it.
  return (
    <svg viewBox="0 0 320 120" className={styles.art} aria-hidden="true">
      <g className={styles.gridLines}>
        <path d="M0 30h320M0 60h320M0 90h320" />
      </g>
      <path className={styles.limitLine} d="M0 24h320" strokeDasharray="3 5" />
      <path className={styles.cone} d="M180 60 L320 18 L320 70 Z" />
      <path className={styles.signal} d="M0 96c30-6 60-4 90-10s50-12 90-26" />
      <path className={styles.coneCentre} d="M180 60 L320 42" strokeDasharray="3 4" />
      <line className={styles.today} x1="180" y1="6" x2="180" y2="112" />
      <text className={styles.label} x="184" y="112">
        today
      </text>
      <text className={styles.labelBronze} x="240" y="14">
        limit · 19–26 d
      </text>
    </svg>
  );
}

function WindowArt() {
  // The instruction: a maintenance window laid over a run schedule, drawn where
  // the forecast and the production plan agree.
  return (
    <svg viewBox="0 0 320 120" className={styles.art} aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <g key={i}>
          <rect
            className={styles.dayCell}
            x={4 + i * 45}
            y="34"
            width="40"
            height="44"
            rx="6"
          />
          <text className={styles.label} x={8 + i * 45} y="26">
            {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][i]}
          </text>
        </g>
      ))}
      <rect className={styles.windowCell} x="139" y="30" width="85" height="52" rx="8" />
      <text className={styles.labelBronzeStrong} x="148" y="52">
        TAKE OUT
      </text>
      <text className={styles.labelBronze} x="148" y="68">
        THU 22:00 → FRI 06:00
      </text>
      <path className={styles.runLine} d="M4 100h130" />
      <path className={styles.runLineBronze} d="M139 100h85" />
      <path className={styles.runLine} d="M229 100h87" />
      <text className={styles.label} x="4" y="116">
        line 2 · scheduled run
      </text>
    </svg>
  );
}

export default function Pillars() {
  return (
    <section id="pillars" className={innerStyles.section}>
      <div className={innerStyles.inner}>
        <InnerHead
          eyebrow="Four capabilities"
          title="Each claim, with the *artefact* behind it"
          lead="What the platform does is easy to list. What it produces at each step is the part worth reading — so every capability here is shown as the object it puts in front of an engineer."
        />

        <PlateWall>
          <Plate
            tone="paper"
            span={7}
            index={1}
            eyebrow="Adaptive"
            title="A baseline the plant teaches, and keeps teaching"
            body="Normal is learned from each asset's own healthy running and re-fitted as the plant drifts — a new feedstock, a rebuilt bearing, a summer. Rules are armed against what the machine does now, not what it did at commissioning."
            mark={<WaveMark />}
          >
            <div className={innerStyles.plateArt}>
              <BaselineArt />
            </div>
          </Plate>

          <Plate
            tone="dark"
            span={5}
            index={2}
            eyebrow="Explainable"
            title="Findings carry their evidence"
            body="Every finding names the component and lists the points it was drawn from, their values at the time and the limit each crossed. An engineer can disagree with the model using the same numbers."
            delay={80}
            mark={<RingsMark />}
          >
            <div className={innerStyles.plateArt}>
              <EvidenceArt />
            </div>
          </Plate>

          <Plate
            tone="dark"
            span={5}
            index={3}
            eyebrow="Predictive"
            title="A range, never a date"
            body="Where a trend is monotonic and long enough to fit, the model draws it forward as a cone and reports where the cone meets the limit. The spread is the honesty; a line would be the marketing."
            delay={160}
          >
            <div className={innerStyles.plateArt}>
              <ForecastArt />
            </div>
          </Plate>

          <Plate
            tone="bronze"
            span={7}
            index={4}
            eyebrow="Actionable"
            title="One instruction, in a window the plant can take"
            body="The output of all of it is a single line per asset: which component, how sure, and when to take the machine out — placed against the production schedule so the window is one the plant can actually use."
            delay={240}
            mark={<GateMark />}
          >
            <div className={innerStyles.plateArt}>
              <WindowArt />
            </div>
          </Plate>
        </PlateWall>
      </div>
    </section>
  );
}
