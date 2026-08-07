// Signals — a mirrored pair of bands, plus the capability triptych.
//
// Band one gathers: every channel on the floor pulls inward to one context.
// Band two emits: the decision that context produced is pushed back out to the
// systems that act on it. Same geometry, same cadence, opposite direction —
// they are meant to be read as a matched pair rather than as two sections that
// happen to sit next to each other.

import styles from './Signals.module.css';
import { Arrow, Reveal } from './primitives';

const VIEW = 400;
const CENTER = VIEW / 2;
const RADIUS = 158;

type Spoke = { label: string; angle: number };

/** Evenly spaced spokes, starting at the top and running clockwise. */
function layout(labels: string[]): Spoke[] {
  return labels.map((label, index) => ({
    label,
    angle: -Math.PI / 2 + (index / labels.length) * Math.PI * 2,
  }));
}

const INPUTS = layout([
  'VIBRATION',
  'TEMP',
  'PRESSURE',
  'SPEED',
  'CURRENT',
  'FLOW',
  'PLC',
  'MANUAL',
]);

/**
 * The radial field.
 *
 * `direction` only flips which way the travelling dash runs — the geometry is
 * identical in both bands, which is what makes the pair read as symmetric.
 */
function RadialField({
  spokes,
  direction,
  hub,
}: {
  spokes: Spoke[];
  direction: 'in' | 'out';
  hub: string;
}) {
  return (
    <div className={styles.visual}>
      <span className={styles.visualGlow} aria-hidden="true" />
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="img"
        aria-label={
          direction === 'in'
            ? 'Every channel on the plant floor converging on one context'
            : 'One context emitting decisions to the systems that act on them'
        }
      >
        <circle className={styles.orbit} cx={CENTER} cy={CENTER} r={RADIUS} />
        <circle
          className={`${styles.orbit} ${styles.orbitDashed} ${
            direction === 'out' ? styles.orbitReverse : ''
          }`}
          cx={CENTER}
          cy={CENTER}
          r={RADIUS - 34}
        />

        {spokes.map((spoke, index) => {
          // Spokes stop short of both the hub and the endpoint so the line never
          // runs underneath a label.
          const x1 = CENTER + Math.cos(spoke.angle) * 38;
          const y1 = CENTER + Math.sin(spoke.angle) * 38;
          const x2 = CENTER + Math.cos(spoke.angle) * (RADIUS - 12);
          const y2 = CENTER + Math.sin(spoke.angle) * (RADIUS - 12);
          // The dash animation always runs from the path's start; drawing the
          // path outward-to-inward is what makes it converge.
          const from = direction === 'in' ? [x2, y2] : [x1, y1];
          const to = direction === 'in' ? [x1, y1] : [x2, y2];
          const ex = CENTER + Math.cos(spoke.angle) * RADIUS;
          const ey = CENTER + Math.sin(spoke.angle) * RADIUS;

          return (
            <g key={spoke.label}>
              <line className={styles.spoke} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={1} />
              <line
                className={`${styles.pulse} ${direction === 'out' ? styles.pulseOut : ''}`}
                style={{ ['--delay' as string]: `${index * 0.34}s` }}
                x1={from[0]}
                y1={from[1]}
                x2={to[0]}
                y2={to[1]}
                pathLength={1}
              />
              <circle className={styles.endpoint} cx={ex} cy={ey} r={4.5} strokeWidth={1} />
              <text
                className={styles.endpointLabel}
                x={CENTER + Math.cos(spoke.angle) * (RADIUS + 22)}
                y={CENTER + Math.sin(spoke.angle) * (RADIUS + 22) + 3}
              >
                {spoke.label}
              </text>
            </g>
          );
        })}

        <circle className={styles.hubHalo} cx={CENTER} cy={CENTER} r={42} />
        <circle className={styles.hub} cx={CENTER} cy={CENTER} r={32} />
        <text className={styles.hubLabel} x={CENTER} y={CENTER + 3}>
          {hub}
        </text>
      </svg>
    </div>
  );
}

function Band({
  mirrored,
  tag,
  title,
  muted,
  lead,
  href,
  cta,
  field,
}: {
  mirrored?: boolean;
  tag: string;
  title: string;
  muted: string;
  lead: string;
  href: string;
  cta: string;
  field: React.ReactNode;
}) {
  return (
    <div className={`${styles.band} ${mirrored ? styles.bandMirrored : ''}`}>
      <Reveal className={styles.copy}>
        <span className={styles.tag}>{tag}</span>
        <h2 className={styles.title}>
          {title} <span className={styles.titleMuted}>{muted}</span>
        </h2>
        <p className={styles.lead}>{lead}</p>
        <a className={styles.action} href={href}>
          {cta}
          <Arrow size={14} />
        </a>
      </Reveal>
      <Reveal delay={120}>{field}</Reveal>
    </div>
  );
}

export default function Signals() {
  return (
    <Band
      tag="Signals"
      title="All of the signals,"
      muted="none of the noise."
      lead="Every channel on the floor converges on one context — reconciled, quality-flagged and comparable — so the whole plant is legible from a single surface instead of eleven."
      href="#signal"
      cta="See the pipeline"
      field={<RadialField spokes={INPUTS} direction="in" hub="CORE" />}
    />
  );
}
