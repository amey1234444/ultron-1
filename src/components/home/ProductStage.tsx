// The product surface, on a plate that straightens itself as the page scrolls.
//
// Split out of the hero so the fold stays a single centred sentence. The plate
// starts tipped back and lifts to flat across the section, which reads as the
// surface turning to face you as you arrive at it.

import { useEffect, useRef } from 'react';

import PlantPreview from './PlantPreview';
import styles from './ProductStage.module.css';
import { clamp01, useReducedMotion } from './primitives';

export default function ProductStage() {
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const plateRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const plate = plateRef.current;
    if (!stage || !plate) return;
    if (reduced) {
      plate.style.setProperty('--tilt', '0deg');
      plate.style.setProperty('--zoom', '1');
      return;
    }

    let frame = 0;
    const apply = () => {
      frame = 0;
      const rect = stage.getBoundingClientRect();
      // Progress from "the plate's top edge enters the viewport" to "it has
      // reached the upper third", which is the window in which it is being
      // looked at rather than scrolled past.
      const progress = clamp01(
        (window.innerHeight - rect.top) / (window.innerHeight * 0.85),
      );
      plate.style.setProperty('--tilt', `${(1 - progress) * 14}deg`);
      plate.style.setProperty('--zoom', `${0.94 + progress * 0.06}`);
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

  return (
    <section className={styles.section}>
      <div className={styles.stage} ref={stageRef}>
        <div className={styles.plate} ref={plateRef}>
          <PlantPreview />
        </div>
      </div>
    </section>
  );
}
