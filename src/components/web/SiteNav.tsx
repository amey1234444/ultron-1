import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import logoDark from '../../../assets/brand/logo-dark.png';
import { useAuth } from '../../context/AuthContext';
import styles from './SiteNav.module.css';

const LOGO_SRC = typeof logoDark === 'string' ? logoDark : logoDark.src;

type NavItem = { label: string; href: string };

// Flat, five entries, no dropdowns. The panels this bar used to carry were
// describing a site with more rooms than it has — every destination below is a
// real page or a section id that exists on the landing page.
const NAV: NavItem[] = [
  { label: 'Platform', href: '/#platform' },
  { label: 'Industries', href: '/#industries' },
  { label: 'Condition', href: '/#condition' },
  { label: 'Evidence', href: '/#evidence' },
  { label: 'Company', href: '/about' },
];

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
          <Link href="/home" className={styles.brand} aria-label="ULTRON home" onClick={close}>
            <img src={LOGO_SRC} alt="ULTRON" className={styles.brandLogo} />
            {/* The one place green appears in the chrome, and it means what it
                means everywhere else on the site: measured, now. */}
            <span className={styles.live}>
              <span className={styles.liveDot} aria-hidden="true" />
              Live
            </span>
          </Link>

          <nav className={styles.nav} aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`${styles.link} ${isCurrent(item.href) ? styles.linkActive : ''}`}
                aria-current={isCurrent(item.href) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.actions}>
            <Link href={consoleHref} className={styles.ghost}>
              {user ? 'Console' : 'Sign in'}
            </Link>
            <Link href="/contact" className={styles.cta}>
              Request a demo
              <Icon name="arrow" />
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
          {NAV.map((item, index) => (
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
            <Link href="/contact" className={styles.cta} onClick={close}>
              Request a demo
              <Icon name="arrow" />
            </Link>
            <Link href={consoleHref} className={styles.ghost} onClick={close}>
              <Icon name={user ? 'arrow' : 'login'} />
              {user ? 'Open console' : 'Sign in'}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
