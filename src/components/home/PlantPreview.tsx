// The hero's single product visual — a compact, live rendering of the console's
// plant-overview page.
//
// This replaces the static render that used to sit in the hero. Showing the
// real surface, with the real palette and type, is both more honest and cheaper
// than shipping a 1.4 MB PNG that has to be re-exported every time the console
// changes.

import { useEffect, useState } from 'react';

import styles from './PlantPreview.module.css';
import { useReducedMotion } from './primitives';

const POINTS = 46;

type Model = {
  trend: number[];
  load: number[];
  health: number;
  output: number;
  energy: number;
  alarms: number;
};

// Deterministic seed so the server and the first client render agree; the
// interval takes over afterwards.
const INITIAL: Model = {
  trend: Array.from({ length: POINTS }, (_, i) => 54 + Math.sin(i / 3.4) * 15 + Math.sin(i / 1.7) * 4),
  load: Array.from({ length: POINTS }, (_, i) => 40 + Math.cos(i / 4.1) * 12),
  health: 96,
  output: 175,
  energy: 754,
  alarms: 2,
};

const step = (series: number[], drift: number, min: number, max: number) => {
  const next = series.slice(1);
  const last = series[series.length - 1];
  next.push(Math.min(max, Math.max(min, last + (Math.random() - 0.5) * drift)));
  return next;
};

/** Smooth path through the series, using midpoint quadratics. */
function toPath(series: number[], width: number, height: number) {
  const points = series.map((value, index) => ({
    x: (index / (series.length - 1)) * width,
    y: height - (value / 100) * height,
  }));
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    d += ` Q ${a.x.toFixed(1)} ${a.y.toFixed(1)} ${((a.x + b.x) / 2).toFixed(1)} ${(
      (a.y + b.y) /
      2
    ).toFixed(1)}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
}

const CHART = { w: 560, h: 116 };

const ASSETS = [
  { name: 'Burning zone temp', target: 92, actual: 90 },
  { name: 'Kiln amps', target: 90, actual: 84 },
  { name: 'Raw mill 04', target: 90, actual: 71 },
  { name: 'ID fan 11', target: 90, actual: 93 },
];

const ACTIONS = [
  { time: '08:00', title: 'Kiln feed rate +1.5% — thermal profile stable', live: true },
  { time: '04:00', title: 'Bearing DE flagged: replace within 11 days', live: false },
  { time: '00:00', title: 'Gateway GW-KILN-2 reconnected', live: false },
  { time: '20:00', title: 'Threshold set updated to v2.5', live: false },
];

export default function PlantPreview() {
  const reduced = useReducedMotion();
  const [model, setModel] = useState<Model>(INITIAL);

  useEffect(() => {
    if (reduced) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (id) return;
      id = setInterval(() => {
        setModel((prev) => ({
          trend: step(prev.trend, 13, 22, 92),
          load: step(prev.load, 10, 14, 76),
          health: Math.round(Math.min(99, Math.max(88, prev.health + (Math.random() - 0.5) * 2))),
          output: Math.round(Math.min(182, Math.max(168, prev.output + (Math.random() - 0.5) * 3))),
          energy: Math.round(Math.min(768, Math.max(742, prev.energy + (Math.random() - 0.5) * 6))),
          alarms: prev.alarms,
        }));
      }, 1400);
    };
    const stop = () => {
      if (id) clearInterval(id);
      id = undefined;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced]);

  const trendPath = toPath(model.trend, CHART.w, CHART.h);
  const loadPath = toPath(model.load, CHART.w, CHART.h);

  // Mirrors the console's KPI strip: a value, the fraction of plan it has
  // reached, and a notch marking where plan actually sits.
  const kpis = [
    { label: 'Production', value: model.output, unit: 't/h', fill: 0.94, target: 1, plan: 'Plan 176 · Δ −1', tone: 'var(--u-accent)' },
    { label: 'Specific heat', value: model.energy, unit: 'kcal/kg', fill: 0.87, target: 0.9, plan: 'Plan 755 · Δ −1', tone: 'var(--u-accent)' },
    { label: 'Health score', value: model.health, unit: '/100', fill: model.health / 100, target: 0.9, plan: 'Excellent · Δ +4', tone: 'var(--u-accent)' },
    { label: 'Active alarms', value: model.alarms, unit: 'critical', fill: 0.18, target: 0.25, plan: 'Δ −1 vs. yesterday', tone: 'var(--u-red)' },
  ];

  return (
    <div className={styles.frame}>
      <div className={styles.bar}>
        <span className={styles.mark}>
          <span className={styles.markGlyph} aria-hidden="true" />
          ULTRON
        </span>
        <span className={styles.select}>
          <span className={styles.selectKey}>Plant</span>
          Kiln line 2
        </span>
        <span className={styles.select}>
          <span className={styles.selectKey}>Asset</span>
          RAV-01
        </span>
        <span className={styles.online}>
          <span className={styles.onlineDot} aria-hidden="true" />
          All gateways online
        </span>
      </div>

      <div className={styles.tabs}>
        <span className={`${styles.tab} ${styles.tabActive}`}>Overview</span>
        <span className={styles.tab}>Trends</span>
        <span className={styles.tab}>Analysis</span>
        <span className={styles.tab}>Alarms</span>
      </div>

      <div className={styles.body}>
        <div className={styles.left}>
          <div className={styles.kpis}>
            {kpis.map((kpi) => (
              <div className={styles.kpi} key={kpi.label}>
                <div className={styles.kpiLabel}>{kpi.label}</div>
                <div className={styles.kpiValue}>
                  {kpi.value}
                  <span className={styles.kpiUnit}>{kpi.unit}</span>
                </div>
                <div className={styles.kpiTrack}>
                  <span
                    className={styles.kpiFill}
                    style={{ transform: `scaleX(${kpi.fill})`, ['--tone' as string]: kpi.tone }}
                  />
                  <span className={styles.kpiNotch} style={{ left: `${kpi.target * 100}%` }} />
                </div>
                <div className={styles.kpiPlan}>{kpi.plan}</div>
              </div>
            ))}
          </div>

          <div className={styles.chartWrap}>
            <div className={styles.chartHead}>
              <span className={styles.chartTitle}>Burning zone temperature &amp; kiln amps</span>
              <span className={styles.chartMeta}>Last 24h · 10 Hz</span>
            </div>
            <svg
              className={styles.chart}
              viewBox={`0 0 ${CHART.w} ${CHART.h}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Live trend of burning zone temperature and kiln amps"
            >
              <defs>
                <linearGradient id="ppArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--u-accent)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--u-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.28, 0.56, 0.84].map((f) => (
                <line
                  key={f}
                  x1="0"
                  y1={CHART.h * f}
                  x2={CHART.w}
                  y2={CHART.h * f}
                  stroke="rgba(255,255,255,0.045)"
                  strokeWidth="1"
                />
              ))}
              <path d={`${trendPath} L ${CHART.w} ${CHART.h} L 0 ${CHART.h} Z`} fill="url(#ppArea)" />
              <path
                d={loadPath}
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d={trendPath}
                fill="none"
                stroke="var(--u-accent)"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* The console's signature row: each asset stated against plan, with
              the gap encoded as a five-step scale you can skim vertically. */}
          <div className={styles.assets}>
            <div className={styles.assetHead}>
              <span className={styles.assetName}>Asset</span>
              <span className={styles.assetScaleCol}>Deviation</span>
              <span className={styles.assetNum}>Target</span>
              <span className={styles.assetNum}>Actual</span>
              <span className={styles.assetNum}>Gap</span>
            </div>
            {ASSETS.map((asset) => {
              const gap = asset.actual - asset.target;
              const tone =
                Math.abs(gap) <= 3
                  ? 'var(--u-accent)'
                  : Math.abs(gap) <= 12
                    ? 'var(--u-amber)'
                    : 'var(--u-red)';
              const step = gap === 0 ? 2 : gap < 0 ? 2 - Math.min(2, Math.round(-gap / 6)) : 2 + Math.min(2, Math.round(gap / 6));
              return (
                <div className={styles.assetRow} key={asset.name}>
                  <span className={styles.assetName}>
                    <span className={styles.assetDot} style={{ background: tone }} />
                    {asset.name}
                  </span>
                  <span className={styles.assetScaleCol}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={styles.assetPip}
                        style={{ background: i === step ? tone : 'rgba(255,255,255,0.09)' }}
                      />
                    ))}
                  </span>
                  <span className={`${styles.assetNum} ${styles.assetMuted}`}>{asset.target}</span>
                  <span className={styles.assetNum}>{asset.actual}</span>
                  <span className={styles.assetNum} style={{ color: tone }}>
                    {gap > 0 ? `+${gap}` : gap}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className={styles.rail}>
          <div className={styles.railTitle}>Recent actions</div>
          {ACTIONS.map((action, index) => (
            <div
              className={`${styles.action} ${index > 2 ? styles.actionFaded : ''}`}
              key={action.time}
            >
              <div className={styles.actionTime}>{action.time}</div>
              <div
                className={`${styles.actionTitle} ${action.live ? styles.actionTitleLive : ''}`}
              >
                {action.title}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
