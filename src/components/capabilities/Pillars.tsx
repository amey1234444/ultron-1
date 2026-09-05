// Pillars — the four capability claims, each with the artefact that proves it.
//
// Four equal plates, two by two: one paper, one raised, two dark. The sentence
// on each is short enough to take in at a glance; the drawing under it is the
// argument — a baseline that re-learns, a finding with its evidence, a forecast
// drawn as a cone, an instruction with a window. A capability without its
// artefact is a slogan, so the artefact is the part that stayed.

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
      <text className={styles.labelBronze} x="192" y="14">
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
      <text className={styles.labelBronzeStrong} x="148" y="48">
        TAKE OUT
      </text>
      <text className={styles.labelBronze} x="148" y="62">
        THU 22:00
      </text>
      <text className={styles.labelBronze} x="148" y="74">
        → FRI 06:00
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
    <section id="pillars" className={`${innerStyles.section} ${innerStyles.sectionTight}`}>
      <div className={innerStyles.inner}>
        <InnerHead eyebrow="Four capabilities" title="From signal to *action*" />

        <PlateWall>
          <Plate
            tone="paper"
            span={6}
            index={1}
            eyebrow="Adaptive"
            title="Learns your normal"
            body="Healthy running defines the baseline for each asset, and it is re-fitted as the plant drifts — so a rule is armed against what the machine does now."
            mark={<WaveMark />}
          >
            <div className={innerStyles.plateArt}>
              <BaselineArt />
            </div>
          </Plate>

          <Plate
            tone="dark"
            span={6}
            index={2}
            eyebrow="Explainable"
            title="Shows its reasoning"
            body="Every finding carries the points it was drawn from, their values at the time, and the limit each one crossed."
            delay={80}
            mark={<RingsMark />}
          >
            <div className={innerStyles.plateArt}>
              <EvidenceArt />
            </div>
          </Plate>

          <Plate
            tone="dark"
            span={6}
            index={3}
            eyebrow="Predictive"
            title="Forecasts a range"
            body="Where the trend supports one, the model reports a window rather than a date. The spread is the honest part."
            delay={160}
          >
            <div className={innerStyles.plateArt}>
              <ForecastArt />
            </div>
          </Plate>

          <Plate
            tone="bronze"
            span={6}
            index={4}
            eyebrow="Actionable"
            title="Makes the next step clear"
            body="One line per asset: which component, how sure, and a maintenance window the production plan can actually take."
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
