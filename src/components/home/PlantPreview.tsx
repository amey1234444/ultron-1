// The product surface — a compact, live rendering of the console's plant
// overview.
//
// Showing the real surface, with the real palette and type, is both more honest
// and cheaper than shipping a 1.4 MB PNG that has to be re-exported every time
// the console changes.
//
// Structure mirrors the console: a context bar, tabs, a KPI strip stated
// against plan, one chart that runs measured history straight into forecast
// across a "now" line, the metric table, and the action rail.

import { useEffect, useState } from 'react';

import styles from './PlantPreview.module.css';
import { useReducedMotion } from './primitives';

const POINTS = 44;
const FORECAST_POINTS = 16;

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

const CHART = { w: 620, h: 150 };
/** Where measured history stops and forecast begins. */
const NOW_X = CHART.w * 0.68;

/** Smooth path through a series mapped onto [x0, x1]. */
function toPath(series: number[], x0: number, x1: number) {
  const points = series.map((value, index) => ({
    x: x0 + (index / (series.length - 1)) * (x1 - x0),
    y: CHART.h - (value / 100) * CHART.h,
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

/** Forecast continuing off the last measured value, with a widening spread. */
function forecast(from: number, spread: number) {
  return Array.from({ length: FORECAST_POINTS }, (_, i) => {
    const t = i / (FORECAST_POINTS - 1);
    return from + t * 9 + spread * t * t * 13 + Math.sin(i / 2.2 + spread) * 1.6;
  });
}

const METRICS = [
  { name: 'Burning zone temp', unit: '°C', target: 1452, actual: 1441, gradient: '↑ 15' },
  { name: 'Kiln amps', unit: 'A', target: 55, actual: 54, gradient: '↑ 2' },
  { name: 'Free lime', unit: '%', target: 1.4, actual: 1.9, gradient: '↓ 0.2' },
  { name: 'Filling degree', unit: '%', target: 13.2, actual: 11.9, gradient: '↑ 0.4' },
  { name: 'Production rate', unit: 't/h', target: 176, actual: 168, gradient: '↑ 2' },
];

const ACTIONS = [
  {
    time: '16:00',
    tag: 'Kiln',
    title: 'Feed rate −0.5 t/h',
    body: 'Quality good · reducing fuel to avoid overburning',
  },
  {
    time: '12:00',
    tag: 'Kiln',
    title: 'Bearing DE flagged',
    body: 'Replace within 11 days · vibration trend confirmed',
  },
  {
    time: '08:00',
    tag: 'Fan',
    title: 'ID fan damper 72 → 68%',
    body: 'O₂ high and gas flow sufficient · reducing fan speed',
  },
  {
    time: '04:00',
    tag: 'Mill',
    title: 'Raw mill 04 re-baselined',
    body: 'Alternative fuel mix · model v2.5 promoted',
  },
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
          trend: step(prev.trend, 11, 26, 88),
          load: step(prev.load, 9, 16, 74),
          health: Math.round(Math.min(99, Math.max(88, prev.health + (Math.random() - 0.5) * 2))),
          output: Math.round(Math.min(182, Math.max(168, prev.output + (Math.random() - 0.5) * 3))),
          energy: Math.round(Math.min(768, Math.max(742, prev.energy + (Math.random() - 0.5) * 6))),
          alarms: prev.alarms,
        }));
      }, 1600);
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

  const last = model.trend[model.trend.length - 1];
  const trendPath = toPath(model.trend, 22, NOW_X);
  const loadPath = toPath(model.load, 22, NOW_X);
  const forecasts = [-1, 0, 1].map((spread) =>
    toPath([last, ...forecast(last, spread)], NOW_X, CHART.w - 6),
  );

  // The console's KPI strip: a value, the fraction of plan it has reached, and
  // a notch marking where plan actually sits.
  const kpis = [
    {
      label: 'Production',
      value: String(model.output),
      unit: 't/h',
      fill: 0.94,
      target: 1,
      plan: 'Plan 176',
      delta: '−1',
      tone: 'ok' as const,
    },
    {
      label: 'Specific heat',
      value: String(model.energy),
      unit: 'kcal/kg',
      fill: 0.87,
      target: 0.9,
      plan: 'Plan 755',
      delta: '−1',
      tone: 'ok' as const,
    },
    {
      label: 'Health score',
      value: String(model.health),
      unit: '/100',
      fill: model.health / 100,
      target: 0.9,
      plan: 'Excellent',
      delta: '+4',
      tone: 'ok' as const,
    },
    {
      label: 'Active alarms',
      value: String(model.alarms),
      unit: 'critical',
      fill: 0.18,
      target: 0.25,
      plan: 'vs. yesterday',
      delta: '−1',
      tone: 'warn' as const,
    },
  ];

  return (
    <div className={styles.frame}>
      {/* ------------------------------------------------------ context bar */}
      <div className={styles.bar}>
        <span className={styles.mark}>
          <span className={styles.markGlyph} aria-hidden="true" />
          BLACKGATE
        </span>

        <span className={styles.select}>
          <span className={styles.selectKey}>Plant</span>
          Ballyconnell
          <span className={styles.caret} aria-hidden="true" />
        </span>
        <span className={styles.select}>
          <span className={styles.selectKey}>Asset</span>
          Kiln line 2
          <span className={styles.caret} aria-hidden="true" />
        </span>

        <span className={styles.barRight}>
          <span className={styles.strategy}>
            <span className={styles.strategyKey}>Strategy</span>
            Cost
          </span>
          <span className={styles.online}>
            <span className={styles.onlineDots} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            All gateways online
          </span>
          <span className={styles.avatar} aria-hidden="true">
            OP
          </span>
        </span>
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div className={styles.tabs}>
        {['Live control', 'Performance', 'Explainability', 'Configuration', 'History'].map(
          (tab, index) => (
            <span key={tab} className={`${styles.tab} ${index === 0 ? styles.tabActive : ''}`}>
              {tab}
            </span>
          ),
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.left}>
          {/* --------------------------------------------------- KPI strip */}
          <div className={styles.kpis}>
            {kpis.map((kpi) => (
              <div className={styles.kpi} key={kpi.label}>
                <div className={styles.kpiHead}>
                  <span className={styles.kpiLabel}>{kpi.label}</span>
                  <span className={`${styles.kpiValue} ${styles[kpi.tone]}`}>
                    {kpi.value}
                    <span className={styles.kpiUnit}>{kpi.unit}</span>
                  </span>
                </div>
                <div className={styles.kpiTrack}>
                  <span
                    className={`${styles.kpiFill} ${styles[kpi.tone]}`}
                    style={{ transform: `scaleX(${kpi.fill})` }}
                  />
                  <span className={styles.kpiNotch} style={{ left: `${kpi.target * 100}%` }} />
                </div>
                <div className={styles.kpiPlan}>
                  {kpi.plan}
                  <span className={styles.kpiDelta}>Δ {kpi.delta}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ------------------------------------------------------- chart */}
          <div className={styles.chartWrap}>
            <div className={styles.chartHead}>
              <span className={styles.chartTitle}>Burning zone temperature</span>
              <span className={styles.chartKeys}>
                <span className={styles.key}>
                  <i className={styles.keyMeasured} />
                  Measured
                </span>
                <span className={styles.key}>
                  <i className={styles.keyLoad} />
                  Kiln amps
                </span>
                <span className={styles.key}>
                  <i className={styles.keyForecast} />
                  Forecast
                </span>
                <span className={styles.chartMeta}>10 Hz · last 24 h</span>
              </span>
            </div>

            <div className={styles.chartRow}>
              {/* The threshold scale: where in its own range the channel is
                  allowed to sit, read vertically against the plot. */}
              <span className={styles.scale} aria-hidden="true" />

              <svg
                className={styles.chart}
                viewBox={`0 0 ${CHART.w} ${CHART.h}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="Burning zone temperature, measured to now and forecast beyond it"
              >
                <defs>
                  <linearGradient id="ppArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {[0.22, 0.46, 0.7, 0.94].map((f) => (
                  <line
                    key={f}
                    className={styles.gridline}
                    x1="22"
                    y1={CHART.h * f}
                    x2={CHART.w}
                    y2={CHART.h * f}
                  />
                ))}

                <path
                  d={`${trendPath} L ${NOW_X} ${CHART.h} L 22 ${CHART.h} Z`}
                  fill="url(#ppArea)"
                />

                <path className={styles.load} d={loadPath} />

                {forecasts.map((d, index) => (
                  <path key={index} className={styles.forecast} d={d} />
                ))}

                <path className={styles.trend} d={trendPath} />

                <line className={styles.nowLine} x1={NOW_X} y1="0" x2={NOW_X} y2={CHART.h} />
              </svg>
            </div>

            <div className={styles.chartAxis}>
              {['08:00', '12:00', '16:00', '20:00', '00:00'].map((stamp) => (
                <span key={stamp}>{stamp}</span>
              ))}
              <span className={styles.axisNow}>now</span>
            </div>
          </div>

          {/* ------------------------------------------------ metric table */}
          <div className={styles.metrics}>
            <div className={styles.metricHead}>
              <span>Metric</span>
              <span className={styles.colDev}>Deviation</span>
              <span className={styles.colNum}>Target</span>
              <span className={styles.colNum}>Actual</span>
              <span className={styles.colNum}>Grad</span>
              <span className={styles.colNum}>Gap</span>
            </div>

            {METRICS.map((metric) => {
              const gap = Number((metric.actual - metric.target).toFixed(1));
              const ratio = Math.abs(gap) / Math.max(1, Math.abs(metric.target)) ;
              const tone = ratio <= 0.02 ? 'ok' : ratio <= 0.1 ? 'warn' : 'bad';
              // Five-step deviation scale, centred on plan.
              const pip = gap === 0 ? 2 : gap < 0 ? (ratio > 0.1 ? 0 : 1) : ratio > 0.1 ? 4 : 3;
              return (
                <div className={`${styles.metricRow} ${styles[`row_${tone}`]}`} key={metric.name}>
                  <span className={styles.metricName}>
                    <span className={`${styles.dot} ${styles[tone]}`} />
                    {metric.name}
                  </span>
                  <span className={styles.colDev}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={`${styles.pip} ${i === pip ? styles[`pip_${tone}`] : ''}`}
                      />
                    ))}
                  </span>
                  <span className={`${styles.colNum} ${styles.muted}`}>{metric.target}</span>
                  <span className={`${styles.colNum} ${styles[tone]}`}>
                    {metric.actual}
                    <span className={styles.metricUnit}>{metric.unit}</span>
                  </span>
                  <span className={`${styles.colNum} ${styles.muted}`}>{metric.gradient}</span>
                  <span className={`${styles.colNum} ${styles[tone]}`}>
                    {gap > 0 ? `+${gap}` : gap}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* --------------------------------------------------- action rail */}
        <div className={styles.rail}>
          <div className={styles.railTitle}>Recent actions</div>

          {ACTIONS.map((action, index) => (
            <div
              className={`${styles.action} ${index > 2 ? styles.actionFaded : ''}`}
              key={action.time}
            >
              <div className={styles.actionHead}>
                <span className={styles.actionTime}>{action.time}</span>
                <span className={styles.actionTag}>{action.tag}</span>
              </div>
              <div className={styles.actionTitle}>{action.title}</div>
              <div className={styles.actionBody}>{action.body}</div>
            </div>
          ))}

          <div className={styles.version}>
            <span className={styles.versionLabel}>Live controller</span>
            <span className={styles.versionValue}>v2.5</span>
          </div>
        </div>
      </div>
    </div>
  );
}
