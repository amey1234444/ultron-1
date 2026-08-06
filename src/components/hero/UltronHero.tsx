import { useCallback, useEffect, useRef } from 'react';

import PlantPreview from '../home/PlantPreview';
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
      el.style.setProperty('--tilt', `${(1 - progress) * 12}deg`);
      el.style.setProperty('--zoom', `${0.95 + progress * 0.05}`);
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

export default function UltronHero() {
  const reduced = useReducedMotion();
  const stageRef = useStageScrub(reduced);
  const heroRef = useRef<HTMLElement | null>(null);

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
        <span className={`${styles.blob} ${styles.blobLight}`} />
        <span className={`${styles.blob} ${styles.blobAccent}`} />
      </div>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.cursorGlow} aria-hidden="true" />
      <div className={styles.grain} aria-hidden="true" />

      <div className={styles.inner}>
        <a className={styles.announce} href="#signal">
          <span className={styles.announceDot} aria-hidden="true" />
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

        <div className={styles.ctas}>
          <Button href="/login">
            Open the console
            <Arrow />
          </Button>
          <Button href="#signal" variant="ghost">
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
            <PlantPreview />
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
