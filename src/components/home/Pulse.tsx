// Pulse — the closing animation, in the slot the FAQ used to sit in.
//
// A sweep rotating over the asset field, drawn entirely in hairlines. Each asset
// lights exactly as the sweep crosses it: the dot's animation delay is derived
// from its own angle and the sweep's period, so the two stay locked without a
// single line of JavaScript driving them.
//
// The whole thing is one SVG on two CSS rotations, so it costs a compositor
// layer and nothing else.

import styles from './Pulse.module.css';

const VIEW = 520;
const C = VIEW / 2;
const SWEEP_SECONDS = 9;

const RINGS = [56, 104, 152, 200, 244];

/** Assets, in polar coordinates — fixed, so server and client render the same field. */
const ASSETS: { angle: number; radius: number; size: number }[] = [
  { angle: 12, radius: 84, size: 2.6 },
  { angle: 47, radius: 168, size: 2 },
  { angle: 74, radius: 118, size: 3.2 },
  { angle: 103, radius: 222, size: 2.2 },
  { angle: 131, radius: 62, size: 2 },
  { angle: 158, radius: 190, size: 2.8 },
  { angle: 176, radius: 132, size: 2 },
  { angle: 203, radius: 238, size: 2.4 },
  { angle: 228, radius: 96, size: 3 },
  { angle: 251, radius: 178, size: 2.2 },
  { angle: 279, radius: 128, size: 2.6 },
  { angle: 297, radius: 214, size: 2 },
  { angle: 318, radius: 70, size: 2.4 },
  { angle: 341, radius: 196, size: 3 },
];

const polar = (angle: number, radius: number) => {
  const radians = ((angle - 90) * Math.PI) / 180;
  return [C + Math.cos(radians) * radius, C + Math.sin(radians) * radius] as const;
};

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

        <div className={styles.stage}>
          <svg
            className={styles.svg}
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            role="img"
            aria-label="A sweep rotating over the plant's assets, each lighting as it is scanned"
          >
            <defs>
              {/* The trailing wedge behind the sweep line. */}
              <linearGradient id="pulse-wedge" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            {RINGS.map((radius, index) => (
              <circle
                key={radius}
                className={`${styles.ring} ${index % 2 ? styles.ringDashed : ''}`}
                cx={C}
                cy={C}
                r={radius}
              />
            ))}

            {/* Bearing lines every 30°, so the field has an orientation. */}
            {Array.from({ length: 12 }, (_, i) => {
              const [x, y] = polar(i * 30, RINGS[RINGS.length - 1]);
              return <line key={i} className={styles.bearing} x1={C} y1={C} x2={x} y2={y} />;
            })}

            <g className={styles.sweep} style={{ ['--period' as string]: `${SWEEP_SECONDS}s` }}>
              <path
                className={styles.wedge}
                d={`M ${C} ${C} L ${C} ${C - 244} A 244 244 0 0 0 ${
                  polar(-56, 244)[0]
                } ${polar(-56, 244)[1]} Z`}
                fill="url(#pulse-wedge)"
              />
              <line className={styles.sweepLine} x1={C} y1={C} x2={C} y2={C - 244} />
            </g>

            {ASSETS.map((asset) => {
              const [x, y] = polar(asset.angle, asset.radius);
              // Lock the flash to the moment the sweep line crosses this angle.
              const delay = `${((asset.angle / 360) * SWEEP_SECONDS).toFixed(2)}s`;
              return (
                <g key={`${asset.angle}-${asset.radius}`} style={{ ['--delay' as string]: delay }}>
                  <circle
                    className={styles.halo}
                    cx={x}
                    cy={y}
                    r={asset.size}
                    style={{ ['--period' as string]: `${SWEEP_SECONDS}s` }}
                  />
                  <circle
                    className={styles.asset}
                    cx={x}
                    cy={y}
                    r={asset.size}
                    style={{ ['--period' as string]: `${SWEEP_SECONDS}s` }}
                  />
                </g>
              );
            })}

            <circle className={styles.core} cx={C} cy={C} r="5" />
            <circle
              className={styles.coreRing}
              cx={C}
              cy={C}
              r="5"
              style={{ ['--period' as string]: `${SWEEP_SECONDS / 3}s` }}
            />
          </svg>

          <span className={styles.fade} aria-hidden="true" />
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
