// The loom — what "all of the signals, none of the noise" actually means.
//
// The old version of this section was a hub with spokes running into it. It
// looked like convergence but it did not say anything: eight identical lines
// pointing at a circle is a logo, not a mechanism. This draws the real problem
// instead.
//
// A plant does not hand you eight tidy streams. It hands you a 10 Hz
// accelerometer, a 1 Hz thermocouple, a PLC tag that updates when it feels like
// it, and an operator typing a number into a form once a shift. They disagree
// about rate, about units, and about when "now" was.
//
// So the left half is deliberately ragged — every lane runs at its own true
// pitch, and you can read the rate difference straight off the spacing. The bar
// in the middle is the reconciliation step: resample onto one grid, quality-flag
// what arrived late or out of range, and merge. The right half is the single
// trace that comes out, evenly spaced, one sample per tick.
//
// Ragged in, uniform out. That is the whole claim of the section, and it is
// legible without reading a word of the copy.

import styles from './SignalLoom.module.css';
import { Eyebrow, Reveal, SplitText } from '../home/primitives';

const VIEW = { w: 880, h: 400 };

/** Where the raw lanes stop and reconciliation begins. */
const GATE_X = 470;
/** Where the fan-in finishes and the single merged trace runs. */
const MERGE_X = 596;
const LANE_X0 = 128;

const ROW_H = 44;
const ROW_Y0 = 34;

/** The centre line the merged trace runs along. */
const MID_Y = ROW_Y0 + (7 * ROW_H) / 2;

type Channel = {
  label: string;
  /** Shown as the channel's stated rate. */
  rate: string;
  /**
   * Samples drawn across the raw lane. This is the whole point of the drawing:
   * the spacing *is* the sample rate, so a 10 Hz channel is visibly denser than
   * a 1 Hz one rather than being labelled as such.
   */
  samples: number;
  /** Seconds for one dot to cross the lane. Faster channels arrive sooner. */
  period: number;
  tone?: 'flagged';
};

const CHANNELS: Channel[] = [
  { label: 'VIBRATION', rate: '10 Hz', samples: 22, period: 3.2 },
  { label: 'CURRENT', rate: '5 Hz', samples: 13, period: 3.8 },
  { label: 'SPEED', rate: '4 Hz', samples: 11, period: 4.1 },
  { label: 'PRESSURE', rate: '2 Hz', samples: 7, period: 4.9 },
  { label: 'FLOW', rate: '2 Hz', samples: 6, period: 5.2 },
  { label: 'TEMP', rate: '1 Hz', samples: 4, period: 6.0 },
  { label: 'PLC TAG', rate: 'on change', samples: 3, period: 6.8, tone: 'flagged' },
  { label: 'MANUAL', rate: '1 / shift', samples: 2, period: 7.6, tone: 'flagged' },
];

const rowY = (index: number) => ROW_Y0 + index * ROW_H;

/**
 * Sample offsets along a lane, as fractions of its length.
 *
 * Regular channels are evenly spaced. The two event-driven ones are pushed off
 * the grid by a fixed, deterministic wobble — they are irregular by nature, and
 * drawing them evenly would quietly undersell the problem the gate solves.
 * Deterministic because this renders on the server too.
 */
function offsets(channel: Channel, index: number) {
  return Array.from({ length: channel.samples }, (_, i) => {
    const even = i / channel.samples;
    if (!channel.tone) return even;
    return even + Math.sin(i * 2.7 + index) * 0.06;
  });
}

/** The merged output — evenly spaced, because that is the point. */
const MERGED = Array.from({ length: 9 }, (_, i) => i / 9);

export default function SignalLoom() {
  return (
    <section id="signals" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <Reveal>
            <Eyebrow>Reconciliation</Eyebrow>
          </Reveal>
          <h2 className={styles.title}>
            <SplitText text="All of the signals, none of the noise" step={44} />
          </h2>
          <Reveal delay={140}>
            <p className={styles.lead}>
              Eight channels, four sample rates and two of them event-driven. They disagree about
              rate, about units and about when &ldquo;now&rdquo; was. Everything below the gate is
              one measurement model — resampled onto a single grid, quality-flagged, and comparable
              across the whole plant.
            </p>
          </Reveal>
        </div>

        <Reveal delay={80}>
          <div className={styles.panel}>
            {['tl', 'tr', 'bl', 'br'].map((corner) => (
              <span key={corner} className={`${styles.tick} ${styles[corner]}`} aria-hidden="true" />
            ))}

            <svg
              className={styles.svg}
              viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
              role="img"
              aria-label="Eight plant channels arriving at different sample rates, resampled onto one time grid and merged into a single evenly spaced trace"
            >
              {/* ------------------------------------------- raw lanes */}
              {CHANNELS.map((channel, index) => {
                const y = rowY(index);
                return (
                  <g key={channel.label} className={styles.row}>
                    <text className={styles.label} x="0" y={y + 3}>
                      {channel.label}
                    </text>
                    <text className={styles.rate} x="0" y={y + 14}>
                      {channel.rate}
                    </text>

                    <line
                      className={styles.lane}
                      x1={LANE_X0}
                      y1={y}
                      x2={GATE_X}
                      y2={y}
                    />

                    {/* Sample marks at this channel's own pitch. */}
                    {offsets(channel, index).map((t, i) => (
                      <circle
                        key={i}
                        className={`${styles.sample} ${channel.tone ? styles.sampleFlagged : ''}`}
                        cx={LANE_X0 + t * (GATE_X - LANE_X0)}
                        cy={y}
                        r={channel.tone ? 2.6 : 2}
                      />
                    ))}

                    {/* One travelling packet per lane, at the channel's rate. */}
                    <circle
                      className={styles.packet}
                      cy={y}
                      r="3.2"
                      style={{
                        ['--period' as string]: `${channel.period}s`,
                        ['--from' as string]: `${LANE_X0}px`,
                        ['--to' as string]: `${GATE_X}px`,
                        ['--delay' as string]: `${index * 0.28}s`,
                      }}
                    />

                    {/* Fan-in: every lane bends onto the centre line at the gate. */}
                    <path
                      className={styles.fan}
                      d={`M ${GATE_X} ${y} C ${GATE_X + 58} ${y}, ${MERGE_X - 58} ${MID_Y}, ${MERGE_X} ${MID_Y}`}
                      style={{ ['--delay' as string]: `${index * 0.09}s` }}
                    />
                  </g>
                );
              })}

              {/* ------------------------------------------------ the gate */}
              <g className={styles.gate}>
                <line x1={GATE_X} y1={ROW_Y0 - 20} x2={GATE_X} y2={rowY(7) + 20} />
                <text className={styles.gateLabel} x={GATE_X} y={ROW_Y0 - 28}>
                  RESAMPLE · FLAG · MERGE
                </text>
              </g>

              {/* --------------------------------------- merged output */}
              <line
                className={styles.merged}
                x1={MERGE_X}
                y1={MID_Y}
                x2={VIEW.w - 96}
                y2={MID_Y}
              />

              {/* Evenly spaced, one per tick — the contrast with the left half. */}
              {MERGED.map((t, i) => (
                <circle
                  key={i}
                  className={styles.mergedSample}
                  cx={MERGE_X + t * (VIEW.w - 96 - MERGE_X)}
                  cy={MID_Y}
                  r="2.4"
                  style={{ ['--delay' as string]: `${i * 0.1}s` }}
                />
              ))}

              <circle
                className={styles.mergedPacket}
                cy={MID_Y}
                r="3.4"
                style={{
                  ['--period' as string]: '2.6s',
                  ['--from' as string]: `${MERGE_X}px`,
                  ['--to' as string]: `${VIEW.w - 96}px`,
                }}
              />

              <text className={styles.outLabel} x={VIEW.w - 88} y={MID_Y - 12}>
                ONE CONTEXT
              </text>
              <text className={styles.outRate} x={VIEW.w - 88} y={MID_Y + 4}>
                10 Hz grid
              </text>
              <text className={styles.outNote} x={VIEW.w - 88} y={MID_Y + 17}>
                quality-flagged
              </text>
            </svg>
          </div>
        </Reveal>

        {/* The claim, stated as a ledger rather than as marketing. */}
        <Reveal delay={160}>
          <dl className={styles.ledger}>
            {[
              ['Channels reconciled', '1,284'],
              ['Sample rates in', '4'],
              ['Rate out', '1'],
              ['Clock skew corrected', '± 40 ms'],
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
