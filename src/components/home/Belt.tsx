// Belt — the hairline arcs that bind the sections into one page.
//
// The page already had vertical structure: the column rules run the whole
// height of it and every section lands on that measure. What it had nothing of
// was anything *horizontal* tying one band to the next, so the sections read as
// a stack of separate plates rather than as one machine.
//
// This is that binding. A single layer of very large-radius hairlines sweeping
// down the page: they cross the transparent bands, pass behind the opaque ones
// (the hero, the platform, the results) and re-emerge below them, which is what
// implies one continuous curve running the length of the page even though most
// of it is hidden at any moment. It replaces the two scrolling telemetry waves
// that used to sit in the ambience — they moved, which meant they read as
// weather; this holds still, which means it reads as structure.
//
// Geometry notes, because two decisions here look like mistakes and are not:
//
//   · The layer is exactly as tall as the document and is translated upward by
//     the scroll distance, so it is pinned to the *page*, not to the viewport.
//     That is what lets an arc start above the fold and land somewhere specific
//     eight screens later.
//   · `preserveAspectRatio="none"` stretches the viewBox to that full height.
//     The arcs are designed in that stretched space on purpose: it means the
//     curve's landmarks sit at fixed *fractions of the page* on every screen
//     size, which is the only way the marker below can be guaranteed to land in
//     the closing section. `vector-effect: non-scaling-stroke` keeps the line a
//     true 1px through the stretch.
//
// Decorative: pointer-transparent, hidden from assistive tech.

import styles from './Belt.module.css';

/** The design space. y runs 0 → 1000 over the whole document, top to bottom. */
const VIEW = 1000;

type Cubic = {
  /** Control point 1, control point 2, end point. Start is the previous end. */
  c1: readonly [number, number];
  c2: readonly [number, number];
  to: readonly [number, number];
};

/**
 * The primary curve: one sweep from off the left edge above the fold, out to
 * the right of the measure around the platform section, then back across and
 * off the bottom. Two segments, joined so the tangent carries through.
 */
const START = [-120, 120] as const;
const CURVE: Cubic[] = [
  { c1: [240, 60], c2: [640, 210], to: [890, 430] },
  { c1: [1080, 590], c2: [1000, 830], to: [620, 1040] },
];

const PRIMARY = CURVE.reduce(
  (d, seg) => `${d} C ${seg.c1[0]} ${seg.c1[1]}, ${seg.c2[0]} ${seg.c2[1]}, ${seg.to[0]} ${seg.to[1]}`,
  `M ${START[0]} ${START[1]}`,
);

/** Cubic Bézier evaluated at `t`, per axis. */
function at(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * The marker's position, taken from the same curve data that draws the line —
 * so it is on the path by construction rather than by eye, and stays on it if
 * the curve is ever retuned.
 *
 * `t` is picked so the point lands about 88% of the way down the document,
 * which is inside the closing band.
 */
const MARKER_T = 0.75;
const MARKER = (() => {
  const from = CURVE[0].to;
  const seg = CURVE[1];
  return {
    x: at(from[0], seg.c1[0], seg.c2[0], seg.to[0], MARKER_T),
    y: at(from[1], seg.c1[1], seg.c2[1], seg.to[1], MARKER_T),
  };
})();

/**
 * Two companions, fainter and offset down the page. They are not parallel
 * copies — a true offset curve would read as a printing error. Each one is a
 * slightly different sweep from the same family, which is what a belt looks
 * like.
 */
const COMPANIONS = [
  'M -120 330 C 260 268, 690 400, 940 640 C 1080 776, 940 960, 560 1060',
  'M -120 610 C 200 566, 560 660, 812 856 C 940 956, 900 1046, 700 1090',
];

export default function Belt() {
  return (
    <div className={styles.belt} aria-hidden="true">
      <svg
        className={styles.canvas}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        {COMPANIONS.map((d) => (
          <path key={d} className={styles.arcFaint} d={d} />
        ))}
        <path className={styles.arc} d={PRIMARY} />
      </svg>

      {/* The orbit marker: the single decorative use of the accent anywhere on
          the page, sitting exactly on the primary curve in the closing section.
          It works only because it is the only one — a second would turn both of
          them into decoration, and green would stop meaning "measured now".

          Rendered as an element rather than as an SVG circle on purpose: the
          canvas above is non-uniformly scaled, so a <circle> inside it would be
          drawn as a tall ellipse. */}
      <span
        className={styles.marker}
        style={{
          left: `${(MARKER.x / VIEW) * 100}%`,
          top: `${(MARKER.y / VIEW) * 100}%`,
        }}
      />
    </div>
  );
}
