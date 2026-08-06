import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import logoDark from '../../../assets/brand/logo-dark.png';
import { useAuth } from '../../context/AuthContext';
import styles from './SiteNav.module.css';

const LOGO_SRC = typeof logoDark === 'string' ? logoDark : logoDark.src;

// Every entry points at a section that exists on the landing page, so the bar
// never advertises a destination the site cannot reach.
export const NAV_SECTIONS = [
  { label: 'How it works', id: 'signal' },
  { label: 'Platform', id: 'platform' },
  { label: 'FAQ', id: 'faq' },
  { label: 'Contact', id: 'contact' },
] as const;

/** Highlights the nav entry whose section currently owns the middle of the viewport. */
function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const targets = NAV_SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => element !== null,
    );
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      // A tall band collapsed to the middle of the screen: whichever section
      // crosses the centre line wins, which matches what the eye is reading.
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.2, 0.5, 1] },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return active;
}

/** Fraction of the document that has been scrolled past, for the progress rail. */
function useReadProgress(): number {
  const [read, setRead] = useState(0);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setRead(scrollable <= 0 ? 0 : Math.min(1, window.scrollY / scrollable));
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

  return read;
}

function Icon({ name }: { name: 'arrow' | 'login' | 'menu' | 'close' }) {
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
  switch (name) {
    case 'arrow':
      return (
        <svg {...shared}>
          <path d="M5 12h14" />
          <path d="m14 7 5 5-5 5" />
        </svg>
      );
    case 'login':
      return (
        <svg {...shared}>
          <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
          <path d="m10 8 4 4-4 4" />
          <path d="M14 12H4" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...shared} width={17} height={17}>
          <path d="M4 8h16" />
          <path d="M4 16h16" />
        </svg>
      );
    case 'close':
      return (
        <svg {...shared} width={17} height={17}>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </svg>
      );
  }
}

export default function SiteNav() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const active = useActiveSection();
  const read = useReadProgress();
  const consoleHref = user ? '/' : '/login';

  // The sliding pill is driven from live measurements rather than CSS, so it
  // can travel between links of different widths instead of snapping.
  const navRef = useRef<HTMLElement | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);

  const measureIndicator = useCallback(() => {
    const nav = navRef.current;
    const el = active ? linkRefs.current[active] : null;
    if (!nav || !el) {
      setIndicator(null);
      return;
    }
    setIndicator({ x: el.offsetLeft - nav.clientLeft, w: el.offsetWidth });
  }, [active]);

  useEffect(() => {
    measureIndicator();
    window.addEventListener('resize', measureIndicator);
    return () => window.removeEventListener('resize', measureIndicator);
  }, [measureIndicator]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A locked page behind the mobile sheet keeps the sheet from scrolling the
  // landing page underneath it.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <header className={`${styles.shell} ${scrolled || open ? styles.scrolled : ''}`}>
        <div className={styles.inner}>
          <Link href="/home" className={styles.brand} aria-label="ULTRON home">
            <img src={LOGO_SRC} alt="ULTRON" className={styles.brandLogo} />
            <span className={styles.brandDivider} aria-hidden="true" />
            <span className={styles.brandTag}>
              Industrial{'\n'}Intelligence
            </span>
          </Link>

          <nav className={styles.nav} aria-label="Primary" ref={navRef}>
            <span
              className={`${styles.indicator} ${indicator ? styles.indicatorOn : ''}`}
              aria-hidden="true"
              style={{
                ['--ind-x' as string]: `${indicator?.x ?? 0}px`,
                ['--ind-w' as string]: `${indicator?.w ?? 0}px`,
              }}
            />
            {NAV_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                ref={(el) => {
                  linkRefs.current[section.id] = el;
                }}
                className={`${styles.link} ${active === section.id ? styles.linkActive : ''}`}
                aria-current={active === section.id ? 'true' : undefined}
              >
                {section.label}
              </a>
            ))}
          </nav>

          <div className={styles.actions}>
            {!user && (
              <Link href="/signup" className={styles.ghost}>
                Request access
              </Link>
            )}
            <Link href={consoleHref} className={styles.cta}>
              <Icon name={user ? 'arrow' : 'login'} />
              {user ? 'Open console' : 'Sign in'}
            </Link>
            <button
              type="button"
              className={styles.burger}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <Icon name={open ? 'close' : 'menu'} />
            </button>
          </div>
        </div>

        <span
          className={styles.progress}
          aria-hidden="true"
          style={{ ['--read' as string]: read }}
        />
      </header>

      {open && (
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Menu">
          {NAV_SECTIONS.map((section, index) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={styles.sheetLink}
              style={{ ['--item-delay' as string]: `${index * 55}ms` }}
              onClick={() => setOpen(false)}
            >
              <span className={styles.sheetIndex}>/{String(index + 1).padStart(2, '0')}</span>
              {section.label}
            </a>
          ))}
          <div className={styles.sheetActions}>
            <Link href={consoleHref} className={styles.cta} onClick={() => setOpen(false)}>
              <Icon name={user ? 'arrow' : 'login'} />
              {user ? 'Open console' : 'Sign in'}
            </Link>
            {!user && (
              <Link href="/signup" className={styles.ghost} onClick={() => setOpen(false)}>
                Request access
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
