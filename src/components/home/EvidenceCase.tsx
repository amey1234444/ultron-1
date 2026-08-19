// Evidence band — one plant, fourteen months, stated as what was found.
//
// The reference puts a photograph of a works at dusk behind this band. There is
// no such photograph in the repository and a stock kiln would have been a claim
// we cannot support, so the plate is drawn instead: four silhouette layers, a
// graded sky and two plumes. It carries the same weight as the reference frame
// and it is honest about being a drawing — nothing in it is presented as a
// picture of Northfield.
//
// The four figures sit at the top of the plate and the finding sits under them,
// because the order matters: the numbers are what happened, the sentence is
// what it meant.

import Link from 'next/link';

import styles from './EvidenceCase.module.css';
import { Arrow, useInView } from './primitives';

const STATS = [
  { value: '4', label: 'bearings caught before they seized' },
  { value: '31%', label: 'fewer unplanned downtime hours' },
  { value: '14 d', label: 'median notice before the window closed' },
  { value: '6 wk', label: 'install to first finding' },
];

/**
 * The works at dusk, in four planes.
 *
 * Depth is carried entirely by value: each plane forward is darker and less
 * hazy than the one behind it, which is how distance actually reads in air.
 * `slice` on the aspect ratio keeps the horizon on the same line whatever the
 * band's width ends up being.
 */
function Works() {
  return (
    <svg
      className={styles.scene}
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="ev-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b0c0e" />
          <stop offset="34%" stopColor="#171310" />
          <stop offset="58%" stopColor="#3a2415" />
          <stop offset="76%" stopColor="#7c451d" />
          <stop offset="88%" stopColor="#b86a2a" />
          <stop offset="100%" stopColor="#d68a3c" />
        </linearGradient>

        <radialGradient id="ev-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffc078" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#e08a3c" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#e08a3c" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="ev-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e9a45c" stopOpacity="0" />
          <stop offset="100%" stopColor="#e9a45c" stopOpacity="0.3" />
        </linearGradient>

        <linearGradient id="ev-plume" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#d99a5c" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#d99a5c" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="1600" height="900" fill="url(#ev-sky)" />

      {/* The sun, low and just off the axis. */}
      <circle cx="1010" cy="690" r="360" fill="url(#ev-glow)" />
      <circle cx="1010" cy="690" r="46" fill="#ffd9a1" opacity="0.5" />

      {/* Plumes go in before the stacks so the stacks read as being in front. */}
      <g opacity="0.5">
        <path
          d="M352 470 C 300 380 372 320 336 236 C 316 190 356 150 330 96 L 402 96 C 428 156 392 196 412 244 C 444 322 380 386 424 470 Z"
          fill="url(#ev-plume)"
        />
        <path
          d="M1188 500 C 1150 424 1206 372 1178 306 C 1160 264 1194 232 1174 188 L 1236 188 C 1258 236 1228 270 1246 310 C 1276 374 1224 424 1258 500 Z"
          fill="url(#ev-plume)"
        />
      </g>

      {/* --- plane 4: the far skyline, almost dissolved in the haze --------- */}
      <g fill="#2b2117" opacity="0.5">
        <rect x="60" y="556" width="150" height="84" />
        <rect x="96" y="500" width="16" height="60" />
        <rect x="150" y="486" width="12" height="74" />
        <rect x="252" y="540" width="96" height="100" />
        <rect x="470" y="562" width="128" height="78" />
        <rect x="516" y="496" width="14" height="70" />
        <rect x="700" y="548" width="86" height="92" />
        <rect x="880" y="566" width="140" height="74" />
        <rect x="1090" y="536" width="104" height="104" />
        <rect x="1132" y="470" width="13" height="72" />
        <rect x="1300" y="558" width="180" height="82" />
        <rect x="1352" y="492" width="15" height="72" />
        <rect x="1500" y="572" width="88" height="68" />
      </g>

      {/* Ground haze sitting on the horizon line. */}
      <rect x="0" y="512" width="1600" height="132" fill="url(#ev-haze)" opacity="0.65" />

      {/* --- plane 3: the works proper -------------------------------------- */}
      <g fill="#140f0b">
        {/* preheater tower */}
        <rect x="286" y="220" width="98" height="440" />
        <rect x="268" y="256" width="18" height="404" />
        <rect x="384" y="300" width="16" height="360" />
        <rect x="276" y="204" width="118" height="18" />
        {/* its stack */}
        <rect x="330" y="96" width="42" height="120" />
        <rect x="322" y="88" width="58" height="14" />

        {/* kiln, on its slope */}
        <path d="M418 470 L 858 402 L 858 452 L 418 520 Z" />
        {[440, 520, 600, 680, 760, 840].map((x) => (
          <rect key={x} x={x} y={470 - (x - 418) * 0.1545} width="14" height="190" />
        ))}

        {/* cooler house */}
        <rect x="860" y="440" width="196" height="220" />
        <rect x="892" y="404" width="26" height="42" />
        <rect x="1000" y="418" width="22" height="30" />

        {/* second stack */}
        <rect x="1170" y="188" width="52" height="472" />
        <rect x="1162" y="180" width="68" height="14" />
        <rect x="1160" y="300" width="72" height="8" />
        <rect x="1160" y="430" width="72" height="8" />

        {/* silo bank */}
        <rect x="1276" y="352" width="74" height="308" />
        <rect x="1358" y="352" width="74" height="308" />
        <rect x="1440" y="392" width="66" height="268" />
        <rect x="1266" y="336" width="250" height="20" />

        {/* the ground the whole plane stands on */}
        <rect x="0" y="640" width="1600" height="40" />
      </g>

      {/* Conveyor gantries — thin, and the thing that makes it read as a works
          rather than as a city. */}
      <g stroke="#140f0b" strokeWidth="7" fill="none">
        <path d="M100 560 L 286 486" />
        <path d="M1056 470 L 1170 430" />
        <path d="M1232 386 L 1276 372" />
      </g>

      {/* --- plane 2: near structures, darker still ------------------------- */}
      <g fill="#0a0708">
        <rect x="0" y="672" width="1600" height="60" />
        <rect x="128" y="596" width="120" height="100" />
        <rect x="168" y="540" width="12" height="62" />
        <rect x="612" y="612" width="164" height="84" />
        <rect x="960" y="602" width="112" height="94" />
        <rect x="1372" y="588" width="150" height="108" />
        <rect x="1420" y="528" width="11" height="66" />
      </g>

      {/* --- plane 1: the foreground, effectively black --------------------- */}
      <g fill="#050506">
        <rect x="0" y="726" width="1600" height="174" />
        <path d="M0 726 L 190 726 L 214 690 L 300 690 L 322 726 L 640 726 L 664 682 L 744 682 L 766 726 L 1600 726 L 1600 900 L 0 900 Z" />
        {[80, 240, 430, 620, 810, 1000, 1190, 1380, 1540].map((x) => (
          <rect key={x} x={x} y={694} width="9" height="40" />
        ))}
      </g>
    </svg>
  );
}

export default function EvidenceCase() {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -16% 0px');

  return (
    <section id="evidence" className={styles.section}>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowRule} aria-hidden="true" />
          Case · Northfield · 14 months monitored
        </p>

        <div ref={ref} className={`${styles.plate} ${inView ? styles.plateShown : ''}`}>
          <Works />
          <span className={styles.scrim} aria-hidden="true" />

          <div className={styles.content}>
            <div className={styles.stats}>
              {STATS.map((stat, index) => (
                <div
                  key={stat.label}
                  className={styles.stat}
                  style={{ ['--delay' as string]: `${180 + index * 110}ms` }}
                >
                  <span className={styles.statValue}>{stat.value}</span>
                  <span className={styles.statLabel}>{stat.label}</span>
                </div>
              ))}
            </div>

            <div className={styles.finding}>
              <h2 className={styles.title}>
                Four bearings replaced on planned stops. None of them failed in service.
              </h2>

              <p className={styles.note}>
                Two of the four were flagged before any threshold was crossed, on trend alone. The
                plant kept its shutdown calendar unchanged.
              </p>
            </div>
          </div>
        </div>

        <Link href="/how-it-works" className={styles.trail}>
          See the evidence trail
          <Arrow size={14} />
        </Link>
      </div>
    </section>
  );
}
