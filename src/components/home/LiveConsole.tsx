// The streaming console panel — the product surface, driven by a small live
// data model so it behaves the way the real console does.
//
// One interval feeds every value on the panel, and it is suspended whenever the
// panel is off screen or the tab is hidden. A marketing page has no business
// running a timer in a background tab.

import { useEffect, useRef, useState } from 'react';

import styles from './LiveConsole.module.css';
import { useInView, useReducedMotion } from './primitives';

const POINTS = 48;
const CHANNELS = 6;

type Model = {
  vibration: number[];
  temperature: number[];
  channels: number[];
  vib: number;
  temp: number;
  rpm: number;
  health: number;
};

const seed = (offset: number, amplitude: number, base: number) =>
  Array.from({ length: POINTS }, (_, i) => base + Math.sin(i / offset) * amplitude);

const INITIAL: Model = {
  vibration: seed(3.2, 16, 52),
  temperature: seed(4.4, 11, 38),
  channels: Array.from({ length: CHANNELS }, (_, i) => 45 + Math.sin(i) * 18),
  vib: 3.14,
  temp: 61,
  rpm: 1482,
  health: 92,
};

/** Advances a series by one sample, keeping the window length fixed. */
function advance(series: number[], drift: number, min: number, max: number) {
  const next = series.slice(1);
  const last = series[series.length - 1];
  next.push(Math.min(max, Math.max(min, last + (Math.random() - 0.5) * drift)));
  return next;
}

function useLiveModel(running: boolean) {
  const [model, setModel] = useState<Model>(INITIAL);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setModel((prev) => ({
        vibration: advance(prev.vibration, 15, 12, 88),
        temperature: advance(prev.temperature, 11, 10, 78),
        channels: prev.channels.map((value) =>
          Math.min(96, Math.max(24, value + (Math.random() - 0.5) * 22)),
        ),
        vib: Math.round(Math.min(5.4, Math.max(2.2, prev.vib + (Math.random() - 0.5) * 0.45)) * 100) / 100,
        temp: Math.round(Math.min(74, Math.max(52, prev.temp + (Math.random() - 0.5) * 2.2))),
        rpm: Math.round(Math.min(1520, Math.max(1440, prev.rpm + (Math.random() - 0.5) * 16))),
        health: Math.round(Math.min(99, Math.max(78, prev.health + (Math.random() - 0.5) * 3))),
      }));
    }, 1200);
    return () => clearInterval(id);
  }, [running]);

  return model;
}

/** Builds a smooth path through the series using midpoint quadratic segments. */
function toPath(series: number[], width: number, height: number) {
  const points = series.map((value, index) => ({
    x: (index / (series.length - 1)) * width,
    y: height - (value / 100) * height,
  }));
  if (points.length === 0) return '';
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const midX = (previous.x + current.x) / 2;
    d += ` Q ${previous.x.toFixed(1)} ${previous.y.toFixed(1)} ${midX.toFixed(1)} ${(
      (previous.y + current.y) /
      2
    ).toFixed(1)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

const CHART = { w: 620, h: 176 };

function Sparkline({ series, tone }: { series: number[]; tone: string }) {
  const recent = series.slice(-18);
  return (
    <svg className={styles.kpiSpark} viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true">
      <path
        d={toPath(recent, 120, 24)}
        fill="none"
        stroke={tone}
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.75"
        style={{ transition: 'd 900ms ease' }}
      />
    </svg>
  );
}

function Kpi({
  label,
  value,
  unit,
  tone,
  series,
}: {
  label: string;
  value: string;
  unit: string;
  tone: string;
  series: number[];
}) {
  return (
    <div className={styles.kpi}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiRow}>
        <span className={styles.kpiValue} style={{ ['--tone' as string]: tone }}>
          {value}
        </span>
        <span className={styles.kpiUnit}>{unit}</span>
      </div>
      <Sparkline series={series} tone={tone} />
    </div>
  );
}

export default function LiveConsole() {
  const reduced = useReducedMotion();
  const { ref, inView } = useInView<HTMLDivElement>('120px 0px 120px 0px');

  // `inView` latches on, so pair it with a live visibility flag: together they
  // mean "on screen right now and the tab is in front".
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const sync = () => setVisible(!document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  // Once scrolled well past, stop feeding the model entirely.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), {
      rootMargin: '160px 0px 160px 0px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const model = useLiveModel(!reduced && visible && onScreen && inView);

  const vibPath = toPath(model.vibration, CHART.w, CHART.h);
  const tempPath = toPath(model.temperature, CHART.w, CHART.h);
  const area = `${vibPath} L ${CHART.w} ${CHART.h} L 0 ${CHART.h} Z`;

  const circumference = 2 * Math.PI * 32;
  const healthTone =
    model.health > 90 ? 'var(--u-green)' : model.health > 82 ? 'var(--u-amber)' : 'var(--u-red)';

  return (
    <div className={styles.shell} ref={ref}>
      <span className={styles.glow} aria-hidden="true" />
      <div className={styles.frame} ref={panelRef}>
        <div className={styles.chrome}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
          <div className={styles.tabs}>
            <span className={`${styles.tab} ${styles.tabActive}`}>Overview</span>
            <span className={styles.tab}>Trends</span>
            <span className={styles.tab}>Alarms</span>
          </div>
          <span className={styles.status}>
            <span className={styles.statusPip} aria-hidden="true" />
            RAV-01 streaming
          </span>
        </div>

        <div className={styles.body}>
          <div className={styles.main}>
            <div className={styles.mainHead}>
              <span className={styles.mainTitle}>Vibration &amp; bearing temperature</span>
              <span className={styles.mainMeta}>LAST 60S · 10 HZ</span>
            </div>

            <svg
              className={styles.chart}
              viewBox={`0 0 ${CHART.w} ${CHART.h}`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Live vibration and bearing temperature trend"
            >
              <defs>
                <linearGradient id="liveArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--u-amber)" stopOpacity="0.24" />
                  <stop offset="100%" stopColor="var(--u-amber)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {[0.25, 0.5, 0.75].map((fraction) => (
                <line
                  key={fraction}
                  x1="0"
                  y1={CHART.h * fraction}
                  x2={CHART.w}
                  y2={CHART.h * fraction}
                  stroke="rgba(255,255,255,0.045)"
                  strokeWidth="1"
                />
              ))}

              <path d={area} fill="url(#liveArea)" />
              <path
                d={tempPath}
                fill="none"
                stroke="var(--u-violet-soft)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
              <path
                d={vibPath}
                fill="none"
                stroke="var(--u-amber)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.legendSwatch} style={{ ['--swatch' as string]: 'var(--u-amber)' }} />
                Vibration
              </span>
              <span className={styles.legendItem}>
                <span
                  className={styles.legendSwatch}
                  style={{ ['--swatch' as string]: 'var(--u-violet-soft)' }}
                />
                Bearing temp
              </span>
            </div>

            <div className={styles.channels}>
              {model.channels.map((value, index) => (
                <div className={styles.channel} key={`ch-${index}`}>
                  <div className={styles.channelBars}>
                    {[0, 1, 2].map((bar) => (
                      <span
                        key={bar}
                        className={styles.channelBar}
                        style={{
                          height: `${Math.max(14, value - bar * 11)}%`,
                          opacity: 0.35 + bar * 0.24,
                          ['--tone' as string]:
                            index % 3 === 2 ? 'var(--u-cyan)' : 'var(--u-violet-soft)',
                        }}
                      />
                    ))}
                  </div>
                  <span className={styles.channelLabel}>CH{String(index + 1).padStart(2, '0')}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.rail}>
            <div className={styles.gauge}>
              <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
                <circle cx="38" cy="38" r="32" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
                <circle
                  className={styles.gaugeArc}
                  cx="38"
                  cy="38"
                  r="32"
                  fill="none"
                  stroke={healthTone}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - model.health / 100)}
                  transform="rotate(-90 38 38)"
                />
                <text
                  x="38"
                  y="43"
                  textAnchor="middle"
                  fontSize="19"
                  fontWeight="600"
                  fill="var(--u-ink)"
                  fontFamily="var(--u-font-sans)"
                >
                  {model.health}
                </text>
              </svg>
              <div>
                <div className={styles.gaugeLabel}>Health score</div>
                <div className={styles.gaugeMeta}>AI · updated live</div>
              </div>
            </div>

            <Kpi
              label="Vibration"
              value={model.vib.toFixed(2)}
              unit="mm/s"
              tone={model.vib > 4.6 ? 'var(--u-red)' : model.vib > 3.9 ? 'var(--u-amber)' : 'var(--u-green)'}
              series={model.vibration}
            />
            <Kpi
              label="Bearing temp"
              value={String(model.temp)}
              unit="°C"
              tone={model.temp > 70 ? 'var(--u-amber)' : 'var(--u-green)'}
              series={model.temperature}
            />
            <Kpi
              label="Shaft speed"
              value={model.rpm.toLocaleString('en-US')}
              unit="rpm"
              tone="var(--u-cyan)"
              series={model.temperature}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
