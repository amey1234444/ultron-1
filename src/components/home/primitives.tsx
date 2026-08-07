// Shared landing-page primitives — the motion hooks and the small set of
// components every section is built from.
//
// No animation library: the page runs on IntersectionObserver for entrances and
// a single rAF-batched scroll read for the scrubbed sections. That keeps the
// bundle small and, more importantly, keeps every moving part on transform and
// opacity so scrolling never leaves the compositor.

import Link from 'next/link';
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

import styles from './primitives.module.css';

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Maps `value` from [inMin, inMax] onto [outMin, outMax], clamped at both ends. */
export function mapRange(value: number, inMin: number, inMax: number, outMin = 0, outMax = 1) {
  if (inMax === inMin) return outMin;
  return outMin + clamp01((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/** Smoothstep — takes the mechanical edge off scroll-scrubbed values. */
export const easeInOut = (t: number) => t * t * (3 - 2 * t);

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Tracks the OS "reduce motion" preference.
 *
 * Starts `false` on both server and first client render so hydration matches,
 * then corrects in an effect — a frame of motion is a far smaller problem than
 * a hydration mismatch that blanks the page.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return reduced;
}

/** True once the element has scrolled into view. Latches — it never goes back. */
export function useInView<T extends HTMLElement>(rootMargin = '0px 0px -12% 0px') {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}

/**
 * 0 → 1 progress of a tall element scrolling past the viewport, for the pinned
 * sections.
 *
 * The read is done inside rAF and the listener is passive, so this never blocks
 * the scroll thread. State only updates when the value actually moves by a
 * visible amount, which keeps React out of the way on most frames.
 */
export function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    let last = -1;

    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      // How far the element can travel before its bottom reaches the viewport
      // bottom. Guarded because a collapsed element would divide by zero.
      const travel = rect.height - window.innerHeight;
      const next = travel <= 0 ? 0 : clamp01(-rect.top / travel);
      if (Math.abs(next - last) > 0.0015) {
        last = next;
        setProgress(next);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return { ref, progress };
}

/** Counts from 0 to `target` once `active` flips true. */
export function useCountUp(target: number, active: boolean, duration = 1500) {
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = clamp01((now - start) / duration);
      // Ease-out cubic: fast off the mark, settles gently on the final figure.
      setValue(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, duration, reduced, target]);

  return value;
}

/**
 * Writes the pointer position onto the element as `--mx`/`--my` percentages and
 * toggles `--spot`, driving the spotlight layers in the CSS.
 *
 * Returning handlers rather than attaching listeners keeps this off the main
 * thread until the pointer is actually over a card.
 */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  const onPointerMove = useCallback((event: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
    el.style.setProperty('--my', `${((event.clientY - rect.top) / rect.height) * 100}%`);
  }, []);

  const onPointerEnter = useCallback(() => {
    ref.current?.style.setProperty('--spot', '1');
  }, []);

  const onPointerLeave = useCallback(() => {
    ref.current?.style.setProperty('--spot', '0');
  }, []);

  return { ref, onPointerMove, onPointerEnter, onPointerLeave };
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Fades and lifts its children into place the first time they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  className,
  style,
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'li' | 'section';
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <Tag
      ref={ref as never}
      data-reveal=""
      className={`${styles.reveal} ${inView ? styles.revealShown : ''} ${className ?? ''}`}
      style={{ ...style, ['--reveal-delay' as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/**
 * Headline that wipes up one word at a time from behind a mask.
 *
 * Words are split on whitespace and rejoined with real spaces between the
 * inline-blocks, so the text still wraps, selects and reads to a screen reader
 * as one sentence.
 */
export function SplitText({
  text,
  accentFrom,
  delay = 0,
  step = 65,
  className,
}: {
  text: string;
  /** Index of the first word rendered in the accent gradient. */
  accentFrom?: number;
  delay?: number;
  step?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>('0px');
  const words = text.split(' ');

  return (
    <span
      ref={ref}
      data-reveal=""
      className={`${styles.split} ${inView ? styles.splitShown : ''} ${className ?? ''}`}
      aria-label={text}
    >
      {words.map((word, index) => (
        // The separating space sits *outside* the masked word. Inside it, the
        // `overflow: hidden` that clips the wipe also collapses the space, and
        // the headline renders with its words run together.
        <Fragment key={`${word}-${index}`}>
          <span className={styles.word} aria-hidden="true">
            <span
              className={`${styles.wordInner} ${
                accentFrom !== undefined && index >= accentFrom ? styles.accent : ''
              }`}
              style={{ ['--word-delay' as string]: `${delay + index * step}ms` }}
            >
              {word}
            </span>
          </span>
          {index < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={`${styles.eyebrow} ${className ?? ''}`}>
      <span className={styles.eyebrowRule} aria-hidden="true" />
      {children}
    </span>
  );
}

export function SectionHead({
  eyebrow,
  title,
  accentFrom,
  lead,
  align = 'left',
}: {
  eyebrow: string;
  title: string;
  accentFrom?: number;
  lead?: string;
  align?: 'left' | 'center';
}) {
  return (
    <div className={`${styles.head} ${align === 'center' ? styles.headCenter : ''}`}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <h2 className={styles.title}>
        <SplitText text={title} accentFrom={accentFrom} step={48} />
      </h2>
      {lead && (
        <Reveal delay={140}>
          <p className={styles.lead}>{lead}</p>
        </Reveal>
      )}
    </div>
  );
}

export function SpotlightCard({
  children,
  className,
  lift = true,
  style,
}: {
  children: ReactNode;
  className?: string;
  lift?: boolean;
  style?: CSSProperties;
}) {
  const spotlight = useSpotlight<HTMLDivElement>();
  return (
    <div
      ref={spotlight.ref}
      onPointerMove={spotlight.onPointerMove}
      onPointerEnter={spotlight.onPointerEnter}
      onPointerLeave={spotlight.onPointerLeave}
      className={`${styles.card} ${lift ? styles.cardLift : ''} ${className ?? ''}`}
      style={style}
    >
      {children}
    </div>
  );
}

export function Button({
  href,
  children,
  variant = 'primary',
  className,
  external,
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost';
  className?: string;
  external?: boolean;
}) {
  const cls = `${styles.btn} ${variant === 'primary' ? styles.btnPrimary : styles.btnGhost} ${
    className ?? ''
  }`;
  if (external || href.startsWith('mailto:') || href.startsWith('http')) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/**
 * Seamless horizontal marquee. Renders the row twice and translates the track
 * by exactly -50%, so the copy lands where the original started.
 */
export function Marquee({
  children,
  duration = 42,
  className,
}: {
  children: ReactNode;
  duration?: number;
  className?: string;
}) {
  return (
    <div className={`${styles.marquee} ${className ?? ''}`}>
      <div
        className={styles.marqueeTrack}
        style={{ ['--marquee-duration' as string]: `${duration}s` }}
      >
        <div className={styles.marqueeGroup}>{children}</div>
        <div className={styles.marqueeGroup} aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Arrow({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h13" />
      <path d="m12 6 6 6-6 6" />
    </svg>
  );
}

export { styles as primitiveStyles };
