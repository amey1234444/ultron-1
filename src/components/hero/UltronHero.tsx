// Landing hero.
//
// A classification line, one sentence on the page's centre axis, one link, and
// a horizon behind it. Nothing else — no wordmark, no protocol rail, no second
// button competing with the first. The symmetry is the composition.
//
// The only motion is scroll-driven: the horizon rises and opens as you move
// down the fold while the copy settles back. Values are written straight onto
// the node as custom properties rather than through React state, because this
// runs on every scroll frame and a re-render per frame is what it must not do.

import { useEffect, useRef } from 'react';

import { SplitText, clamp01, useReducedMotion } from '../home/primitives';
import styles from './UltronHero.module.css';

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
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Condition monitoring for rotating equipment</p>

        {/* Two lines, and the second one is grey. The sentence turns on "after"
            — setting the consequence back a step is what makes the headline
            read as a warning rather than as a boast. */}
        <h1 className={styles.title}>
          <span className={styles.titleLine}>
            <SplitText text="Stop finding out" step={95} />
          </span>
          <span className={`${styles.titleLine} ${styles.titleMuted}`}>
            <SplitText text="after it breaks." delay={190} step={95} />
          </span>
        </h1>

        {/* One button, on the axis. The fold asks for exactly one thing. */}
        <div className={styles.actions}>
          <a className={styles.console} href="/login">
            Console
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h13" />
              <path d="m12 6 6 6-6 6" />
            </svg>
          </a>
        </div>
      </div>

      {/* Horizon. A ring mask on a very large circle, clipped to its top slice —
          a real circle centred on the page axis, not a drawn curve. The rim
          carries a highlight that travels around it, so the light on the limb
          reads as moving rather than painted. */}
      <div className={styles.horizonClip} aria-hidden="true">
        <div className={styles.horizon}>
          <span className={styles.arcGlow} />
          <span className={styles.arc} />
          <span className={styles.shine} />
        </div>
      </div>
    </section>
  );
}
