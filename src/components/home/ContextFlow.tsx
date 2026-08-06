// "Universal context" — the pinned, scroll-scrubbed centrepiece.
//
// The section is a tall wrapper with a sticky stage inside it. One 0→1 scroll
// value drives everything on the stage: sources fade in, edges draw themselves
// into the core, the core materialises, outputs fan out, and once the graph is
// complete the edges start carrying travelling dashes. The copy column tracks
// the same value, so the words and the picture are always describing the same
// moment.

import { useEffect, useState } from 'react';

import styles from './ContextFlow.module.css';
import { Eyebrow, Reveal, SplitText, mapRange, easeInOut, useScrollProgress } from './primitives';

type Stage = {
  index: string;
  title: string;
  body: string;
  /** Scroll progress at which this step takes over the copy column. */
  at: number;
};

const STAGES: Stage[] = [
  {
    index: '01 / Ingest',
    title: 'Every signal on one stream',
    body: 'Racks, cards and channels are described once, and the gateway starts publishing within minutes. A 1998 PLC on Modbus arrives on the same wire as the sensor you installed last week.',
    at: 0,
  },
  {
    index: '02 / Normalise',
    title: 'One measurement model',
    body: 'Units, scaling and quality flags are reconciled at the edge, so every reading is directly comparable — and every one of them has a home in the plant hierarchy.',
    at: 0.3,
  },
  {
    index: '03 / Reason',
    title: 'Context, not readings',
    body: 'Thresholds, drift and cross-channel correlation feed a single health score per asset, with the biggest detractors named next to it instead of buried in a log.',
    at: 0.56,
  },
  {
    index: '04 / Act',
    title: 'The next thing to touch',
    body: 'Ranked recommendations reach the console, the alert channel and the work-order queue at the same moment — with the evidence that produced them attached.',
    at: 0.8,
  },
];

// Diagram geometry. Kept as data so the edges and the nodes can never drift
// apart: every path is derived from the same coordinates the boxes use.
const VIEW = { w: 620, h: 500 };
const NODE = { w: 150, h: 44 };
const CORE = { x: 310, y: 250, r: 52 };

const SOURCES = [
  { label: 'Vibration', meta: 'MQTT', y: 92 },
  { label: 'Temperature', meta: 'Modbus', y: 176 },
  { label: 'Pressure', meta: 'OPC UA', y: 260 },
  { label: 'Shaft speed', meta: 'PLC', y: 344 },
];

const OUTPUTS = [
  { label: 'Health score', meta: 'Console', y: 132 },
  { label: 'Anomaly alert', meta: 'Realtime', y: 236 },
  { label: 'Work order', meta: 'Webhook', y: 340 },
];

const SOURCE_X = 8;
const OUTPUT_X = VIEW.w - NODE.w - 8;

/** Edge from a source's right edge into the left face of the core. */
const inPath = (y: number) =>
  `M ${SOURCE_X + NODE.w} ${y} C ${SOURCE_X + NODE.w + 62} ${y} ${CORE.x - CORE.r - 62} ${CORE.y} ${
    CORE.x - CORE.r
  } ${CORE.y}`;

/** Edge from the core's right face out to an output's left edge. */
const outPath = (y: number) =>
  `M ${CORE.x + CORE.r} ${CORE.y} C ${CORE.x + CORE.r + 62} ${CORE.y} ${OUTPUT_X - 62} ${y} ${OUTPUT_X} ${y}`;

function Node({
  x,
  y,
  label,
  meta,
  colour,
  tint,
  reveal,
}: {
  x: number;
  y: number;
  label: string;
  meta: string;
  colour: string;
  tint: string;
  /** 0 → 1 entrance progress for this node. */
  reveal: number;
}) {
  const top = y - NODE.h / 2;
  return (
    <g opacity={reveal} transform={`translate(0 ${(1 - reveal) * 12})`}>
      <rect
        x={x}
        y={top}
        width={NODE.w}
        height={NODE.h}
        rx={11}
        fill="rgba(19,21,27,0.92)"
        stroke={reveal > 0.7 ? tint : 'rgba(255,255,255,0.09)'}
        strokeWidth={1}
      />
      <circle cx={x + 19} cy={y} r={4.5} fill={colour} />
      <circle cx={x + 19} cy={y} r={8} fill={colour} opacity={0.16} />
      <text className={styles.nodeLabel} x={x + 34} y={y - 1}>
        {label}
      </text>
      <text className={styles.nodeMeta} x={x + 34} y={y + 12}>
        {meta}
      </text>
    </g>
  );
}

export default function ContextFlow() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();

  // Below the pin breakpoint the wrapper is normal height, so scroll progress
  // stays at 0 and the diagram would never build. There, it renders complete.
  const [pinned, setPinned] = useState(true);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 941px)');
    const sync = () => setPinned(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const p = pinned ? progress : 1;

  // Stage envelopes. They deliberately overlap: the core starts forming while
  // the last in-edge is still drawing, which is what makes it feel like one
  // continuous build rather than four separate animations.
  const sourcesIn = (i: number) => easeInOut(mapRange(p, 0.02 + i * 0.035, 0.16 + i * 0.035));
  const edgesIn = (i: number) => easeInOut(mapRange(p, 0.12 + i * 0.04, 0.34 + i * 0.04));
  const coreIn = easeInOut(mapRange(p, 0.34, 0.54));
  const edgesOut = (i: number) => easeInOut(mapRange(p, 0.54 + i * 0.05, 0.74 + i * 0.05));
  const outputsIn = (i: number) => easeInOut(mapRange(p, 0.64 + i * 0.05, 0.82 + i * 0.05));
  const live = p > 0.86;

  const activeStage = STAGES.reduce(
    (acc, stage, index) => (p >= stage.at ? index : acc),
    0,
  );

  return (
    <section id="product">
      <div className={styles.wrap} ref={ref}>
        <div className={styles.stage}>
          <div className={styles.inner}>
            {/* ------------------------------ copy ------------------------------ */}
            <div className={styles.copy}>
              <Reveal>
                <Eyebrow>Universal context</Eyebrow>
              </Reveal>
              <h2 className={styles.title}>
                <SplitText text="One context for every machine on the floor" step={42} />
              </h2>

              <div className={styles.steps}>
                <span className={styles.rail} aria-hidden="true">
                  <span
                    className={styles.railFill}
                    style={{ ['--fill' as string]: pinned ? p : 1 }}
                  />
                </span>
                <ol className={styles.stepList}>
                  {STAGES.map((stage, index) => (
                    <li
                      key={stage.index}
                      className={`${styles.step} ${index === activeStage ? styles.stepActive : ''}`}
                    >
                      <span className={styles.stepMarker} aria-hidden="true" />
                      <span className={styles.stepIndex}>{stage.index}</span>
                      <h3 className={styles.stepTitle}>{stage.title}</h3>
                      <p className={styles.stepBody}>{stage.body}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            {/* ----------------------------- diagram ---------------------------- */}
            <div className={styles.diagram}>
              <span className={styles.diagramGlow} aria-hidden="true" />
              <svg
                className={styles.svg}
                viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
                role="img"
                aria-label="Sensor channels feeding the ULTRON core, which emits a health score, anomaly alerts and work orders"
              >
                <defs>
                  <linearGradient id="cfIn" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(232,180,101,0.15)" />
                    <stop offset="100%" stopColor="rgba(156,140,255,0.65)" />
                  </linearGradient>
                  <linearGradient id="cfOut" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(156,140,255,0.65)" />
                    <stop offset="100%" stopColor="rgba(53,214,198,0.5)" />
                  </linearGradient>
                  <linearGradient id="cfCore" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#7d6cf5" />
                    <stop offset="100%" stopColor="#4a37c9" />
                  </linearGradient>
                </defs>

                {/* Edges are drawn before the nodes so the boxes sit on top of the
                    line ends and hide the joins. */}
                {SOURCES.map((source, i) => {
                  const t = edgesIn(i);
                  return (
                    <g key={`in-${source.label}`}>
                      <path
                        d={inPath(source.y)}
                        pathLength={1}
                        fill="none"
                        stroke="url(#cfIn)"
                        strokeWidth={1.4}
                        strokeDasharray={1}
                        strokeDashoffset={1 - t}
                      />
                      {live && (
                        <path
                          className={styles.flow}
                          style={{ ['--flow-delay' as string]: `${i * 0.42}s` }}
                          d={inPath(source.y)}
                          pathLength={1}
                          fill="none"
                          stroke="var(--u-amber)"
                          strokeWidth={2.4}
                          strokeLinecap="round"
                        />
                      )}
                    </g>
                  );
                })}

                {OUTPUTS.map((output, i) => {
                  const t = edgesOut(i);
                  return (
                    <g key={`out-${output.label}`}>
                      <path
                        d={outPath(output.y)}
                        pathLength={1}
                        fill="none"
                        stroke="url(#cfOut)"
                        strokeWidth={1.4}
                        strokeDasharray={1}
                        strokeDashoffset={1 - t}
                      />
                      {live && (
                        <path
                          className={styles.flow}
                          style={{ ['--flow-delay' as string]: `${0.2 + i * 0.5}s` }}
                          d={outPath(output.y)}
                          pathLength={1}
                          fill="none"
                          stroke="var(--u-cyan)"
                          strokeWidth={2.4}
                          strokeLinecap="round"
                        />
                      )}
                    </g>
                  );
                })}

                {/* ------------------------------ core ----------------------------- */}
                <g opacity={coreIn} transform={`translate(0 ${(1 - coreIn) * 8})`}>
                  <circle
                    className={live ? styles.corePulse : undefined}
                    cx={CORE.x}
                    cy={CORE.y}
                    r={CORE.r + 22}
                    fill="rgba(110,91,242,0.13)"
                  />
                  <circle
                    className={live ? styles.coreRing : undefined}
                    cx={CORE.x}
                    cy={CORE.y}
                    r={CORE.r + 11}
                    fill="none"
                    stroke="rgba(156,140,255,0.34)"
                    strokeWidth={1}
                    strokeDasharray="3 9"
                  />
                  <circle
                    cx={CORE.x}
                    cy={CORE.y}
                    r={CORE.r}
                    fill="url(#cfCore)"
                    stroke="rgba(180,168,255,0.6)"
                    strokeWidth={1}
                  />
                  <text className={styles.coreLabel} x={CORE.x} y={CORE.y - 2}>
                    ULTRON
                  </text>
                  <text className={styles.coreMeta} x={CORE.x} y={CORE.y + 14}>
                    CORE
                  </text>
                </g>

                {/* ----------------------------- nodes ----------------------------- */}
                {SOURCES.map((source, i) => (
                  <Node
                    key={source.label}
                    x={SOURCE_X}
                    y={source.y}
                    label={source.label}
                    meta={source.meta}
                    colour="var(--u-amber)"
                    tint="rgba(232,180,101,0.4)"
                    reveal={sourcesIn(i)}
                  />
                ))}

                {OUTPUTS.map((output, i) => (
                  <Node
                    key={output.label}
                    x={OUTPUT_X}
                    y={output.y}
                    label={output.label}
                    meta={output.meta}
                    colour="var(--u-cyan)"
                    tint="rgba(53,214,198,0.4)"
                    reveal={outputsIn(i)}
                  />
                ))}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
