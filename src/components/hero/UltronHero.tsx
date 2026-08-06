import { useCallback, useEffect, useRef, useState } from 'react';

import { Arrow, Button, Marquee, SplitText, clamp01, useReducedMotion } from '../home/primitives';
import styles from './UltronHero.module.css';

const PROTOCOLS = [
  'MQTT',
  'Modbus TCP',
  'Modbus RTU',
  'OPC UA',
  'REST',
  'WebSocket',
  'Webhooks',
  'CSV export',
];

/**
 * Straightens the product plate as the page scrolls.
 *
 * The stage starts tipped back and lifts to flat over roughly the first
 * three-quarters of a viewport, which is the window in which a visitor is still
 * looking at the fold. Values are written straight onto the node as custom
 * properties instead of through React state — this runs on every scroll frame,
 * and a re-render per frame is exactly what it must not do.
 */
function useStageScrub(reduced: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.style.setProperty('--tilt', '0deg');
      el.style.setProperty('--zoom', '1');
      return;
    }

    let frame = 0;
    const apply = () => {
      frame = 0;
      const progress = clamp01(window.scrollY / (window.innerHeight * 0.75));
      el.style.setProperty('--tilt', `${(1 - progress) * 13}deg`);
      el.style.setProperty('--zoom', `${0.945 + progress * 0.055}`);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced]);

  return ref;
}

function ChipIcon({ name }: { name: 'health' | 'alert' | 'pulse' }) {
  const shared = {
    width: 15,
    height: 15,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'health') {
    return (
      <svg {...shared}>
        <path d="M12 3a9 9 0 1 1-6.4 2.6" />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" />
      </svg>
    );
  }
  if (name === 'alert') {
    return (
      <svg {...shared}>
        <path d="M12 4.5 3 20h18L12 4.5Z" />
        <path d="M12 10v4" />
        <path d="M12 17.2h.01" />
      </svg>
    );
  }
  return (
    <svg {...shared}>
      <path d="M3 12h4l2.5 6 4-13 2.5 7h5" />
    </svg>
  );
}

export default function UltronHero() {
  const reduced = useReducedMotion();
  const stageRef = useStageScrub(reduced);
  const heroRef = useRef<HTMLElement | null>(null);

  // The vibration figure ticks so the chip over the render is alive rather than
  // a static caption. Paused whenever the tab is hidden.
  const [vibration, setVibration] = useState(3.14);
  useEffect(() => {
    if (reduced) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (id) return;
      id = setInterval(() => {
        setVibration((value) => {
          const next = value + (Math.random() - 0.5) * 0.34;
          return Math.round(Math.min(4.4, Math.max(2.4, next)) * 100) / 100;
        });
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

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const el = heroRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--hx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty('--hy', `${((event.clientY - rect.top) / rect.height) * 100}%`);
    el.style.setProperty('--hover', '1');
  }, []);

  const onPointerLeave = useCallback(() => {
    heroRef.current?.style.setProperty('--hover', '0');
  }, []);

  return (
    <section
      className={styles.hero}
      ref={heroRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.ambient} aria-hidden="true">
        <span className={`${styles.blob} ${styles.blobViolet}`} />
        <span className={`${styles.blob} ${styles.blobCyan}`} />
        <span className={`${styles.blob} ${styles.blobAmber}`} />
      </div>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.beam} aria-hidden="true" />
      <div className={styles.cursorGlow} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.inner}>
        <a className={styles.announce} href="#product">
          <span className={styles.announceTag}>New</span>
          AI health scoring on every mapped channel
          <span className={styles.announceChevron} aria-hidden="true">
            <Arrow size={13} />
          </span>
        </a>

        <h1 className={styles.title}>
          <span className={styles.titleLine}>
            <SplitText text="Machine health," step={70} />
          </span>
          <span className={styles.titleLine}>
            <SplitText text="in real time" accentFrom={0} delay={210} step={70} />
          </span>
        </h1>

        <p className={styles.sub}>
          ULTRON turns raw sensor telemetry into live dashboards and AI-driven failure prediction —
          so your team fixes machines before they break, not after.
        </p>

        <div className={styles.ctas}>
          <Button href="/login">
            Open the console
            <Arrow />
          </Button>
          <Button href="#product" variant="ghost">
            See how it works
          </Button>
        </div>

        <div className={styles.trust}>
          <span>No new sensors required</span>
          <span className={styles.trustDot} aria-hidden="true" />
          <span>Deploys on your network</span>
          <span className={styles.trustDot} aria-hidden="true" />
          <span>Sub-second alarms</span>
        </div>

        <div className={styles.stage}>
          <div className={styles.stageInner} ref={stageRef}>
            <div className={styles.stageGlow} aria-hidden="true" />

            <div className={styles.frame}>
              <div className={styles.chrome}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.chromeBar}>ultron.io / console / plant-overview</span>
                <span className={styles.chromeLive}>
                  <span className={styles.livePip} aria-hidden="true" />
                  Live
                </span>
              </div>
              <img
                className={styles.shot}
                src="/images/ultron-hero-console.png"
                alt="The ULTRON console showing plant health, a live health trend and a machine map"
                width={1670}
                height={940}
                /* Above the fold, so it must not be lazy — this is the LCP element. */
                fetchPriority="high"
                decoding="async"
              />
              <span className={styles.sheen} aria-hidden="true" />
            </div>

            <div
              className={`${styles.chip} ${styles.chipLeft}`}
              style={{ ['--chip-delay' as string]: '1250ms' }}
            >
              <span
                className={styles.chipIcon}
                style={{
                  ['--chip-tint' as string]: 'rgba(63,185,80,0.16)',
                  ['--chip-color' as string]: 'var(--u-green)',
                }}
              >
                <ChipIcon name="health" />
              </span>
              <span>
                <span className={styles.chipLabel}>Health score</span>
                <span className={styles.chipValue}>96 / 100</span>
              </span>
            </div>

            <div
              className={`${styles.chip} ${styles.chipRight}`}
              style={{ ['--chip-delay' as string]: '1420ms' }}
            >
              <span
                className={styles.chipIcon}
                style={{
                  ['--chip-tint' as string]: 'rgba(232,180,101,0.16)',
                  ['--chip-color' as string]: 'var(--u-amber)',
                }}
              >
                <ChipIcon name="pulse" />
              </span>
              <span>
                <span className={styles.chipLabel}>Vibration · RAV-01</span>
                <span className={styles.chipValue}>{vibration.toFixed(2)} mm/s</span>
              </span>
            </div>

            <div
              className={`${styles.chip} ${styles.chipLower}`}
              style={{ ['--chip-delay' as string]: '1590ms' }}
            >
              <span
                className={styles.chipIcon}
                style={{
                  ['--chip-tint' as string]: 'rgba(240,86,63,0.16)',
                  ['--chip-color' as string]: 'var(--u-red)',
                }}
              >
                <ChipIcon name="alert" />
              </span>
              <span>
                <span className={styles.chipLabel}>Predicted failure</span>
                <span className={styles.chipValue}>Bearing · 11 days</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.rail}>
        <p className={styles.railLabel}>Speaks the protocols already on your floor</p>
        <Marquee duration={38}>
          {PROTOCOLS.map((protocol) => (
            <span key={protocol} className={styles.railItem}>
              <span className={styles.railTick} aria-hidden="true" />
              {protocol}
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  );
}
