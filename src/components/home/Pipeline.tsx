// How it works — the actual path a reading takes, and what it costs in time.
//
// A pinned section: the copy on the left changes as you scroll, while the chain
// on the right stays put and lights the hop being described. Packets fall down
// the chain continuously regardless of scroll, so the diagram is alive even
// when the page is still.
//
// The latency figures are a budget, not decoration — they add up to the
// sub-second claim made everywhere else on the site, and the bar at the foot of
// the chain shows how much of the second each hop actually spends.

import { useEffect, useRef, useState } from 'react';

import styles from './Pipeline.module.css';
import { Eyebrow, Reveal, SplitText, clamp01 } from './primitives';

type Hop = {
  name: string;
  spec: string;
  /** Milliseconds this hop adds. */
  cost: number;
  body: string;
  /** Drawn on the connector *below* this node. */
  transport?: string;
};

const HOPS: Hop[] = [
  {
    name: 'Sensor head',
    spec: 'IEPE · 4–20 mA · PT100',
    cost: 0,
    body: 'Vibration, temperature, current and speed, taken off the machine itself. Existing instrumentation counts — if it already produces a signal, it is already a source.',
    transport: 'Analogue / digital',
  },
  {
    name: 'Edge microcontroller',
    spec: 'ESP32-S3 · 10 Hz · TLS',
    cost: 8,
    body: 'The board samples, timestamps against its own clock and batches. It publishes upward on its own schedule — nothing on the network ever has to poll a machine to find out what it is doing.',
    transport: 'MQTT publish · QoS 1',
  },
  {
    name: 'MQTT broker',
    spec: 'One topic per channel',
    cost: 21,
    body: 'Fan-out, back-pressure and replay live here rather than in the application. A console that was offline for an hour catches up from the broker instead of asking the plant to repeat itself.',
    transport: 'Subscribe · persistent session',
  },
  {
    name: 'Ingest & scoring',
    spec: 'Normalise · flag · score',
    cost: 180,
    body: 'Every sample is reconciled into one measurement model, quality-flagged, written to history and folded into the asset score — all before it is allowed to leave the server.',
    transport: 'WebSocket push',
  },
  {
    name: 'Console',
    spec: 'Repaints in place',
    cost: 310,
    body: 'Pushed to every open console. No refresh, no polling loop, no "last updated" caveat — the trend you are looking at is the trend the machine is currently producing.',
  },
];

const TOTAL = HOPS.reduce((sum, hop) => sum + hop.cost, 0);

/** Cumulative milliseconds at each hop, for the ledger column. */
const CUMULATIVE = HOPS.reduce<number[]>((acc, hop, index) => {
  acc.push((index === 0 ? 0 : acc[index - 1]) + hop.cost);
  return acc;
}, []);

export default function Pipeline() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const pinned = () => window.matchMedia('(min-width: 941px)').matches;
    let frame = 0;
    let last = -1;

    const measure = () => {
      frame = 0;
      if (!pinned()) {
        if (last !== HOPS.length - 1) {
          last = HOPS.length - 1;
          setActive(HOPS.length - 1);
        }
        return;
      }
      const rect = wrap.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const p = travel <= 0 ? 0 : clamp01(-rect.top / travel);
      // A small lead-in and run-out so the first and last hops each get a beat
      // of their own rather than flicking past at the very edges of the pin.
      const index = Math.min(
        HOPS.length - 1,
        Math.max(0, Math.floor(clamp01((p - 0.06) / 0.86) * HOPS.length)),
      );
      if (index !== last) {
        last = index;
        setActive(index);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section id="signal" className={styles.section}>
      <div className={styles.wrap} ref={wrapRef}>
        <div className={styles.stage}>
          <div className={styles.inner}>
            {/* ------------------------------------------------ copy column */}
            <div className={styles.copy}>
              <Reveal>
                <Eyebrow>How it works</Eyebrow>
              </Reveal>

              <h2 className={styles.title}>
                <SplitText text="From the machine to your screen" step={44} />
              </h2>

              <div className={styles.readout}>
                <span className={styles.readoutIndex}>
                  {String(active + 1).padStart(2, '0')}
                  <span className={styles.readoutOf}>/ {String(HOPS.length).padStart(2, '0')}</span>
                </span>
                <h3 className={styles.readoutName}>{HOPS[active].name}</h3>
                {/* Keyed so the paragraph re-enters on every change instead of
                    swapping its text in place. */}
                <p key={active} className={styles.readoutBody}>
                  {HOPS[active].body}
                </p>
                <div className={styles.readoutMeta}>
                  <span className={styles.chip}>{HOPS[active].spec}</span>
                  <span className={styles.elapsed}>
                    {CUMULATIVE[active]}
                    <span className={styles.elapsedUnit}> ms elapsed</span>
                  </span>
                </div>
              </div>
            </div>

            {/* ----------------------------------------------- chain column */}
            <div className={styles.chain}>
              <ol className={styles.hops}>
                {HOPS.map((hop, index) => (
                  <li
                    key={hop.name}
                    className={`${styles.hop} ${index === active ? styles.hopOn : ''} ${
                      index < active ? styles.hopPast : ''
                    }`}
                  >
                    <div className={styles.node}>
                      <span className={styles.nodeIndex}>{String(index + 1).padStart(2, '0')}</span>
                      <span className={styles.nodeName}>{hop.name}</span>
                      <span className={styles.nodeSpec}>{hop.spec}</span>
                      <span className={styles.nodeCost}>
                        {index === 0 ? 't₀' : `+${hop.cost} ms`}
                      </span>
                    </div>

                    {hop.transport && (
                      <div className={styles.link}>
                        <span className={styles.wire} aria-hidden="true" />
                        {/* Three packets per leg, offset so the wire is never
                            empty and never evenly spaced. */}
                        {[0, 1, 2].map((packet) => (
                          <span
                            key={packet}
                            className={styles.packet}
                            aria-hidden="true"
                            style={{
                              ['--delay' as string]: `${index * 0.32 + packet * 0.62}s`,
                            }}
                          />
                        ))}
                        <span className={styles.transport}>{hop.transport}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ol>

              {/* The second, spent hop by hop. */}
              <div className={styles.budget}>
                <div className={styles.budgetBar}>
                  {HOPS.slice(1).map((hop, index) => (
                    <span
                      key={hop.name}
                      className={`${styles.budgetSeg} ${
                        index + 1 <= active ? styles.budgetSegOn : ''
                      }`}
                      style={{ ['--w' as string]: `${(hop.cost / 1000) * 100}%` }}
                    />
                  ))}
                  <span className={styles.budgetRest} />
                </div>
                <div className={styles.budgetScale}>
                  <span>
                    {TOTAL} ms end to end
                  </span>
                  <span>1 000 ms budget</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
