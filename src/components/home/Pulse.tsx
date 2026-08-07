// Pulse — the closing section, in the slot the FAQ used to sit in.
//
// A sweep rotating over the asset field. Two ideas are doing the work:
//
//   1. The concentric rings are not decoration — they are the asset hierarchy.
//      Site, line, cell, asset, channel, from the outside in. The sweep crosses
//      all five levels on every pass, which is the claim the section is making.
//   2. Each asset lights exactly as the sweep reaches it. The dot's animation
//      delay is derived from its own bearing and the sweep's period, so the two
//      stay locked without a single line of JavaScript driving them.
//
// Beside it, the scan log runs on a seamless vertical marquee — the same list
// rendered twice and translated by exactly -50%, so it never visibly restarts.

import styles from './Pulse.module.css';

const VIEW = 560;
const C = VIEW / 2;
const SWEEP_SECONDS = 9;

/** Outside in: the five levels the console organises a plant into. */
const RINGS = [
  { r: 252, label: 'SITE' },
  { r: 204, label: 'LINE' },
  { r: 156, label: 'CELL' },
  { r: 108, label: 'ASSET' },
  { r: 60, label: 'CHANNEL' },
];

/** Assets, in polar coordinates — fixed, so server and client render the same field. */
const ASSETS: { angle: number; radius: number; size: number; tag: string }[] = [
  { angle: 12, radius: 86, size: 2.6, tag: 'RAV-01' },
  { angle: 41, radius: 172, size: 2, tag: 'MILL-04' },
  { angle: 68, radius: 120, size: 3.2, tag: 'FAN-11' },
  { angle: 97, radius: 228, size: 2.2, tag: 'KILN-2' },
  { angle: 124, radius: 64, size: 2, tag: 'PMP-07' },
  { angle: 151, radius: 196, size: 2.8, tag: 'CNV-03' },
  { angle: 173, radius: 134, size: 2, tag: 'SEP-02' },
  { angle: 199, radius: 244, size: 2.4, tag: 'BLR-01' },
  { angle: 224, radius: 98, size: 3, tag: 'GBX-09' },
  { angle: 247, radius: 180, size: 2.2, tag: 'CMP-05' },
  { angle: 271, radius: 130, size: 2.6, tag: 'DRV-12' },
  { angle: 293, radius: 218, size: 2, tag: 'ELV-06' },
  { angle: 316, radius: 72, size: 2.4, tag: 'RAV-02' },
  { angle: 338, radius: 200, size: 3, tag: 'MILL-01' },
];

const LOG = [
  ['RAV-01', 'bearing DE', '96'],
  ['MILL-04', 'spindle load', '91'],
  ['FAN-11', 'vibration RMS', '98'],
  ['KILN-2', 'burning zone', '94'],
  ['PMP-07', 'seal pressure', '89'],
  ['CNV-03', 'belt tension', '97'],
  ['SEP-02', 'rotor speed', '93'],
  ['BLR-01', 'feedwater temp', '95'],
  ['GBX-09', 'oil particulate', '88'],
  ['CMP-05', 'discharge temp', '96'],
];

const polar = (angle: number, radius: number) => {
  const radians = ((angle - 90) * Math.PI) / 180;
  return [C + Math.cos(radians) * radius, C + Math.sin(radians) * radius] as const;
};

/** Bezel graduations: every 5°, with every third one long. */
const BEZEL = Array.from({ length: 72 }, (_, i) => {
  const angle = i * 5;
  const long = i % 3 === 0;
  const outer = 272;
  const inner = outer - (long ? 9 : 5);
  const [x1, y1] = polar(angle, inner);
  const [x2, y2] = polar(angle, outer);
  return { x1, y1, x2, y2, long };
});

export default function Pulse() {
  return (
    <section className={styles.section}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Always on</p>
        <h2 className={styles.title}>
          Every asset, every second,
          <br />
          <span className={styles.titleMuted}>whether anyone is watching or not.</span>
        </h2>

        <div className={styles.panel}>
          {['tl', 'tr', 'bl', 'br'].map((corner) => (
            <span key={corner} className={`${styles.tick} ${styles[corner]}`} aria-hidden="true" />
          ))}

          <div className={styles.stage}>
            <svg
              className={styles.svg}
              viewBox={`0 0 ${VIEW} ${VIEW}`}
              role="img"
              aria-label="A sweep rotating over five levels of plant hierarchy, lighting each asset as it is scanned"
            >
              <defs>
                {/* The trailing wedge behind the sweep line. */}
                <linearGradient id="pulse-wedge" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0.11" />
                </linearGradient>
              </defs>

              {/* Bezel — counter-rotating, so the field reads as an instrument
                  rather than as a spinning graphic. */}
              <g className={styles.bezel}>
                {BEZEL.map((tick, index) => (
                  <line
                    key={index}
                    className={tick.long ? styles.bezelTickLong : styles.bezelTick}
                    x1={tick.x1}
                    y1={tick.y1}
                    x2={tick.x2}
                    y2={tick.y2}
                  />
                ))}
              </g>

              {RINGS.map((ring, index) => (
                <g key={ring.label}>
                  <circle
                    className={`${styles.ring} ${index % 2 ? styles.ringDashed : ''}`}
                    cx={C}
                    cy={C}
                    r={ring.r}
                  />
                  {/* Level name, riding the ring where it crosses the axis. */}
                  <text className={styles.ringLabel} x={C + 6} y={C - ring.r + 3.5}>
                    {ring.label}
                  </text>
                </g>
              ))}

              {/* Bearing lines every 30°, so the field has an orientation. */}
              {Array.from({ length: 12 }, (_, i) => {
                const [x, y] = polar(i * 30, RINGS[0].r);
                return <line key={i} className={styles.bearing} x1={C} y1={C} x2={x} y2={y} />;
              })}

              <g className={styles.sweep} style={{ ['--period' as string]: `${SWEEP_SECONDS}s` }}>
                <path
                  className={styles.wedge}
                  d={`M ${C} ${C} L ${C} ${C - 252} A 252 252 0 0 0 ${polar(-64, 252)[0]} ${
                    polar(-64, 252)[1]
                  } Z`}
                  fill="url(#pulse-wedge)"
                />
                <line className={styles.sweepLine} x1={C} y1={C} x2={C} y2={C - 252} />
                <circle className={styles.sweepTip} cx={C} cy={C - 252} r="2.5" />
              </g>

              {ASSETS.map((asset) => {
                const [x, y] = polar(asset.angle, asset.radius);
                // Lock the flash to the moment the sweep line crosses this bearing.
                const delay = `${((asset.angle / 360) * SWEEP_SECONDS).toFixed(2)}s`;
                return (
                  <g
                    key={asset.tag}
                    style={{
                      ['--delay' as string]: delay,
                      ['--period' as string]: `${SWEEP_SECONDS}s`,
                    }}
                  >
                    <circle className={styles.halo} cx={x} cy={y} r={asset.size} />
                    <circle className={styles.asset} cx={x} cy={y} r={asset.size} />
                    {/* The tag surfaces only while the sweep is on it. */}
                    <text
                      className={styles.assetTag}
                      x={x + asset.size + 5}
                      y={y + 2.6}
                      textAnchor={asset.angle > 180 ? 'end' : 'start'}
                      transform={
                        asset.angle > 180 ? `translate(${-2 * (asset.size + 5)} 0)` : undefined
                      }
                    >
                      {asset.tag}
                    </text>
                  </g>
                );
              })}

              <circle className={styles.core} cx={C} cy={C} r="4.5" />
              <circle
                className={styles.coreRing}
                cx={C}
                cy={C}
                r="4.5"
                style={{ ['--period' as string]: `${SWEEP_SECONDS / 3}s` }}
              />
            </svg>

            <span className={styles.fade} aria-hidden="true" />
          </div>

          {/* ------------------------------------------------- scan log */}
          <div className={styles.log}>
            <div className={styles.logHead}>
              <span className={styles.logLive}>
                <span className={styles.logDot} aria-hidden="true" />
                Scanning
              </span>
              <span>{SWEEP_SECONDS}s cycle</span>
            </div>

            <div className={styles.logViewport} aria-hidden="true">
              <div className={styles.logTrack}>
                {[0, 1].map((copy) => (
                  <div key={copy} className={styles.logGroup}>
                    {LOG.map(([asset, channel, score]) => (
                      <div key={`${copy}-${asset}`} className={styles.logRow}>
                        <span className={styles.logAsset}>{asset}</span>
                        <span className={styles.logChannel}>{channel}</span>
                        <span className={styles.logScore}>{score}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <span className={styles.logMask} />
            </div>
          </div>
        </div>

        <dl className={styles.readout}>
          {[
            ['Channels', '1,284'],
            ['Assets', '96'],
            ['Sites', '4'],
            ['Gaps in cover', 'None'],
          ].map(([label, value]) => (
            <div key={label} className={styles.readoutItem}>
              <dt className={styles.readoutLabel}>{label}</dt>
              <dd className={styles.readoutValue}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
