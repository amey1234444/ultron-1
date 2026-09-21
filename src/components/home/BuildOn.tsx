// Build on ULTRON — the developer band.
//
// The headline names three protocols, so the drawing beside it shows the three
// protocols. Each strip animates its own actual semantics rather than being
// three copies of the same travelling dot:
//
//   REST       one request out, one response back, then nothing. Discrete and
//              paired, with a visible gap — that gap is the whole difference
//              between polling and being pushed to.
//   WebSocket  a channel that is already open, carrying frames both ways at
//              once and never closing.
//   MQTT       one publish reaches the broker and leaves it as three, arriving
//              at every subscriber at the same instant.
//
// All three run continuously and out of phase with each other. Cycling a
// "featured" one was the first version and it was worse: it implied you pick
// one, when the point of the section is that all three are live at once.
//
// The isometric construction mark this section used to carry is gone. It was
// well drawn and said nothing — three working protocol diagrams are a better
// answer to "build anything on ULTRON" than an abstract solid is.

import Link from 'next/link';

import styles from './BuildOn.module.css';
import { Arrow, useInView } from './primitives';

/* Shared strip geometry. */
const W = 460;
const H = 84;
const MID = H / 2;

/** A node box with a label under it. */
function Node({
  x,
  y = MID,
  label,
  wide = 46,
  strong,
}: {
  x: number;
  y?: number;
  label: string;
  wide?: number;
  strong?: boolean;
}) {
  return (
    <g>
      <rect
        className={`${styles.node} ${strong ? styles.nodeStrong : ''}`}
        x={x - wide / 2}
        y={y - 11}
        width={wide}
        height={22}
        rx="5"
      />
      <text className={styles.nodeLabel} x={x} y={y + 4}>
        {label}
      </text>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* REST — request, response, pause                                            */
/* -------------------------------------------------------------------------- */

function Rest() {
  return (
    <svg className={styles.strip} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line className={styles.wire} x1="66" y1={MID} x2={W - 66} y2={MID} />

      {/* Out, then back on the same wire, then a beat of nothing. */}
      <circle className={styles.reqPacket} cy={MID - 7} r="3.2" />
      <circle className={styles.resPacket} cy={MID + 7} r="3.2" />

      <text className={styles.wireNote} x={W / 2} y={MID - 16}>
        GET /api/assets/RAV-01
      </text>
      <text className={styles.wireNoteDim} x={W / 2} y={MID + 26}>
        200 · one round trip
      </text>

      <Node x={40} label="You" wide={44} />
      <Node x={W - 40} label="ULTRON" wide={56} strong />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* WebSocket — an open channel, both directions at once                        */
/* -------------------------------------------------------------------------- */

const WS_FRAMES = [0, 1, 2, 3, 4, 5];

function WebSocketStrip() {
  return (
    <svg className={styles.strip} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {/* Two rails, because the channel genuinely is duplex. */}
      <line className={styles.wire} x1="66" y1={MID - 8} x2={W - 66} y2={MID - 8} />
      <line className={styles.wire} x1="66" y1={MID + 8} x2={W - 66} y2={MID + 8} />

      {WS_FRAMES.map((i) => (
        <circle
          key={`d-${i}`}
          className={styles.wsDown}
          cy={MID - 8}
          r="2.8"
          style={{ ['--delay' as string]: `${i * 0.45}s` }}
        />
      ))}
      {WS_FRAMES.map((i) => (
        <circle
          key={`u-${i}`}
          className={styles.wsUp}
          cy={MID + 8}
          r="2.2"
          style={{ ['--delay' as string]: `${i * 0.45 + 0.22}s` }}
        />
      ))}

      <text className={styles.wireNote} x={W / 2} y={MID - 22}>
        live frames · 10 Hz
      </text>
      <text className={styles.wireNoteDim} x={W / 2} y={MID + 32}>
        open · never polled
      </text>

      <Node x={40} label="You" wide={44} />
      <Node x={W - 40} label="ULTRON" wide={56} strong />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* MQTT — one in, three out                                                    */
/* -------------------------------------------------------------------------- */

const SUBS = [MID - 26, MID, MID + 26];

function Mqtt() {
  return (
    <svg className={styles.strip} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line className={styles.wire} x1="66" y1={MID} x2="196" y2={MID} />

      {/* Broker to each subscriber. */}
      {SUBS.map((y, i) => (
        <path
          key={i}
          className={styles.wire}
          d={`M 244 ${MID} C 286 ${MID}, 300 ${y}, 342 ${y}`}
        />
      ))}

      {/* The publish. */}
      <circle className={styles.pubPacket} cy={MID} r="3.2" />

      {/* The fan-out — all three leave the broker on the same beat, which is the
          only thing worth showing about pub/sub. */}
      {SUBS.map((y, i) => (
        <circle
          key={i}
          className={styles.subPacket}
          r="2.8"
          style={{
            ['--y0' as string]: `${MID}px`,
            ['--y1' as string]: `${y}px`,
            ['--i' as string]: i,
          }}
        />
      ))}

      <text className={styles.wireNote} x="131" y={MID - 14}>
        plant/+/channel
      </text>

      <Node x={40} label="Plant" wide={48} />
      <Node x={220} label="Broker" wide={52} strong />
      {SUBS.map((y, i) => (
        <Node key={i} x={W - 58} y={y} label={['Console', 'Agent', 'Your app'][i]} wide={62} />
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

const PROTOCOLS = [
  { name: 'REST', note: 'Every asset, window and channel the console reads.', strip: <Rest /> },
  {
    name: 'WebSocket',
    note: 'The same push the console runs on, pointed at you.',
    strip: <WebSocketStrip />,
  },
  { name: 'MQTT', note: 'Subscribe to the plant directly, at the broker.', strip: <Mqtt /> },
];

export default function BuildOn() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -14% 0px');

  return (
    <section className={styles.section}>
      <div className={styles.grid} aria-hidden="true" />

      <div ref={ref} className={`${styles.inner} ${inView ? styles.shown : ''}`}>
        <div className={styles.copy}>
          <h2 className={styles.title}>
            <span className={styles.proto}>REST.</span>{' '}
            <span className={styles.proto}>WebSocket.</span>{' '}
            <span className={styles.proto}>MQTT.</span>
            <br />
            <span className={styles.titleMuted}>Build anything on ULTRON.</span>
          </h2>
          <p className={styles.body}>
            The console has no privileged back door. Every channel, window and asset it reads is
            available to you over the same interfaces — and an agent can query the plant directly
            over MCP.
          </p>
          <Link href="/about" className={styles.link}>
            View docs
            <Arrow size={15} />
          </Link>
        </div>

        <div className={styles.strips}>
          {PROTOCOLS.map((protocol, index) => (
            <div
              key={protocol.name}
              className={styles.row}
              style={{ ['--delay' as string]: `${index * 140}ms` }}
            >
              <div className={styles.rowHead}>
                <span className={styles.rowName}>{protocol.name}</span>
                <span className={styles.rowNote}>{protocol.note}</span>
              </div>
              {protocol.strip}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
