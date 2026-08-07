// Landing hero.
//
// Everything is built on the page's centre axis: eyebrow, headline, lead and
// buttons are all centred on it, and the horizon arc underneath is a circle
// whose centre sits on the same line. The symmetry is the composition — there
// is no second column and no imagery competing with the sentence.
//
// The only motion is scroll-driven: the arc rises and opens as you move down
// the fold while the copy settles back. Values are written straight onto the
// node as custom properties rather than through React state, because this runs
// on every scroll frame and a re-render per frame is what it must not do.

import { useEffect, useRef } from 'react';

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

/** Scrubs the hero's custom properties against scroll position over one fold. */
function useHeroScrub(reduced: boolean) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.style.setProperty('--p', '0');
      return;
    }

    let frame = 0;
    const apply = () => {
      frame = 0;
      // One viewport of travel is the whole budget — past that the hero is off
      // screen and further scrubbing is invisible work.
      el.style.setProperty('--p', clamp01(window.scrollY / window.innerHeight).toFixed(4));
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
  const heroRef = useHeroScrub(reduced);

  return (
    <section className={styles.hero} ref={heroRef}>
      {/* The axis the whole composition is mirrored about, drawn so the
          symmetry is stated rather than merely implied. */}
      <span className={styles.axis} aria-hidden="true">
        <span className={styles.axisTick} />
      </span>

      <div className={styles.inner}>
        <p className={styles.eyebrow}>The only plant platform with</p>

        <h1 className={styles.title}>
          <SplitText text="Total Plant Context" step={90} />
          <span className={styles.tm} aria-hidden="true">
            ™
          </span>
        </h1>

        <p className={styles.lead}>
          Every channel on your floor, reconciled into one live model — and the single instruction
          that follows from it.
        </p>

        <div className={styles.ctas}>
          <Button href="/login">
            Open the console
            <Arrow />
          </Button>
          <Button href="/#platform" variant="ghost">
            See how it works
          </Button>
        </div>
      </div>

      {/* Horizon. A ring mask on a very large circle, clipped to its top slice —
          the arc is a real circle centred on the page axis, not a drawn curve. */}
      <div className={styles.horizonClip} aria-hidden="true">
        <div className={styles.horizon}>
          <span className={styles.arcGlow} />
          <span className={styles.arc} />
        </div>
        <span className={styles.bloom} />
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
