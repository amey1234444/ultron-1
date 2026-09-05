import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useId, useRef, useState } from 'react';

import logoDark from '../../../assets/brand/logo-dark.png';
import { useAuth } from '../../context/AuthContext';
import styles from './SiteNav.module.css';

const LOGO_SRC = typeof logoDark === 'string' ? logoDark : logoDark.src;

type NavItem =
  | { label: string; href: string }
  | { label: string; items: { label: string; href: string; hint: string }[] };

// Every destination in here resolves to something the site actually has: a real
// page, or a section id that exists on the landing page. The bar never
// advertises a route that 404s or an anchor that scrolls nowhere.
const NAV: NavItem[] = [
  {
    label: 'Platform',
    items: [
      { label: 'How it works', href: '/how-it-works', hint: 'Machine to decision, hop by hop' },
      { label: 'Capabilities', href: '/capabilities', hint: 'Adaptive, explainable, predictive' },
      { label: 'Outcomes', href: '/outcomes', hint: 'What changes after cutover' },
    ],
  },
  {
    label: 'Company',
    items: [
      { label: 'About', href: '/about', hint: 'Why we built it this way' },
      { label: 'FAQ', href: '/faq', hint: 'What evaluators ask us' },
    ],
  },
  { label: 'Contact', href: '/contact' },
];

function Icon({ name }: { name: 'arrow' | 'login' | 'menu' | 'close' | 'chevron' }) {
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
    case 'chevron':
      return (
        <svg {...shared} width={13} height={13} strokeWidth={2.2}>
          <path d="m6 9 6 6 6-6" />
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

/**
 * A top-level entry that owns a panel.
 *
 * Opens on hover for pointers and on click for everything else, and closes on
 * Escape or on focus leaving the group — so the panel is reachable by keyboard
 * without the hover intent trapping anyone inside it.
 */
function NavGroup({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: { label: string; href: string; hint: string }[];
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const groupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div
      ref={groupRef}
      className={styles.group}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!groupRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        className={`${styles.link} ${styles.linkButton} ${open ? styles.linkOpen : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <span className={styles.chevron}>
          <Icon name="chevron" />
        </span>
      </button>

      <div className={`${styles.panel} ${open ? styles.panelOpen : ''}`} id={panelId}>
        <div className={styles.panelInner}>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.panelItem}
              onClick={() => {
                setOpen(false);
                onNavigate();
              }}
            >
              <span className={styles.panelItemLabel}>{item.label}</span>
              <span className={styles.panelItemHint}>{item.hint}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SiteNav() {
  const { user } = useAuth();
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const consoleHref = user ? '/' : '/login';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // A locked page behind the mobile sheet keeps the sheet from scrolling the
  // page underneath it.
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

  const close = () => setOpen(false);
  const isCurrent = (href: string) => router.pathname === href.split('#')[0];

  return (
    <>
      <header className={`${styles.shell} ${scrolled || open ? styles.scrolled : ''}`}>
        <div className={styles.inner}>
          <Link href="/home" className={styles.brand} aria-label="BlackGATE home" onClick={close}>
            <img src={LOGO_SRC} alt="BlackGATE" className={styles.brandLogo} />
          </Link>

          <nav className={styles.nav} aria-label="Primary">
            {NAV.map((item) =>
              'items' in item ? (
                <NavGroup key={item.label} label={item.label} items={item.items} onNavigate={close} />
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`${styles.link} ${isCurrent(item.href) ? styles.linkActive : ''}`}
                  aria-current={isCurrent(item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <div className={styles.actions}>
            <Link href={consoleHref} className={styles.ghost}>
              {user ? 'Console' : 'Sign in'}
            </Link>
            <Link href={user ? '/' : '/signup'} className={styles.cta}>
              {user ? 'Open console' : 'Request access'}
              <Icon name={user ? 'arrow' : 'login'} />
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
      </header>

      {open && (
        <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Menu">
          {NAV.flatMap((item) => ('items' in item ? item.items : [item])).map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.sheetLink}
              style={{ ['--item-delay' as string]: `${index * 50}ms` }}
              onClick={close}
            >
              <span className={styles.sheetIndex}>/{String(index + 1).padStart(2, '0')}</span>
              {item.label}
            </Link>
          ))}
          <div className={styles.sheetActions}>
            <Link href={consoleHref} className={styles.cta} onClick={close}>
              <Icon name={user ? 'arrow' : 'login'} />
              {user ? 'Open console' : 'Sign in'}
            </Link>
            {!user && (
              <Link href="/signup" className={styles.ghost} onClick={close}>
                Request access
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
