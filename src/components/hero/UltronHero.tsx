import Link from 'next/link';
import type { ReactNode } from 'react';

import logoDark from '../../../assets/brand/logo-dark.png';
import { useAuth } from '../../context/AuthContext';
import styles from './UltronHero.module.css';

type IconName =
  | 'arrow'
  | 'chevron'
  | 'play'
  | 'telemetry'
  | 'ai'
  | 'cloud'
  | 'clock'
  | 'shield'
  | 'chart'
  | 'search'
  | 'menu'
  | 'login';

type NavItem = {
  label: string;
  href: string;
  menu?: { label: string; href: string }[];
};

// Anchors resolve to the sections that already exist further down the landing
// page; `/login` and `/` are the real auth + console routes.
const navigation: NavItem[] = [
  { label: 'Mission', href: '#features' },
  { label: 'Careers', href: '#contact' },
  { label: 'Elixir', href: '#platform' },
];

const LOGO_DARK_SRC = typeof logoDark === 'string' ? logoDark : logoDark.src;

const heroBenefits: { icon: IconName; title: string; subtitle: string }[] = [
  { icon: 'chart', title: 'AI Predictive', subtitle: 'Smart anomaly detection' },
  { icon: 'clock', title: 'Real-time Alerts', subtitle: 'Instant notifications' },
  { icon: 'shield', title: 'Secure by Design', subtitle: 'End-to-end encryption' },
];

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const properties = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'arrow':
      return (
        <svg {...properties}>
          <path d="M5 12h14" />
          <path d="m14 7 5 5-5 5" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...properties}>
          <path d="m8 10 4 4 4-4" />
        </svg>
      );
    case 'play':
      return (
        <svg {...properties}>
          <circle cx="12" cy="12" r="9" />
          <path d="m10 8 6 4-6 4Z" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...properties}>
          <path d="M12 3 5 6v5c0 4.8 2.8 8.1 7 10 4.2-1.9 7-5.2 7-10V6l-7-3Z" />
          <path d="m9.2 12 1.8 1.8 3.8-4" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...properties}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
          <path d="m7 15 3-3 3 2 4-5" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...properties}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'telemetry':
      return (
        <svg {...properties}>
          <path d="M12 3v7" />
          <path d="M9.4 6.4a6 6 0 1 0 5.2 0" />
          <path d="M12 13v3" />
          <path d="M9 16h6" />
        </svg>
      );
    case 'ai':
      return (
        <svg {...properties}>
          <rect x="5" y="5" width="14" height="14" rx="3" />
          <path d="M9 2v3M15 2v3M9 19v3M15 19v3" />
          <path d="M2 9h3M2 15h3M19 9h3M19 15h3" />
          <path d="m9 14 2-5 2 5 2-5" />
        </svg>
      );
    case 'cloud':
      return (
        <svg {...properties}>
          <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 11.5 3.3 3.3 0 0 0 7 18Z" />
          <path d="M12 8v7" />
          <path d="m9.5 12.5 2.5 2.5 2.5-2.5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...properties}>
          <circle cx="10.5" cy="10.5" r="5.5" />
          <path d="m15 15 4 4" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...properties}>
          <path d="M5 7h14" />
          <path d="M5 12h14" />
          <path d="M5 17h14" />
        </svg>
      );
    case 'login':
      return (
        <svg {...properties}>
          <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
          <path d="M10 8l4 4-4 4" />
          <path d="M14 12H4" />
        </svg>
      );
  }
}

export default function UltronHero({ narrowVisual }: { narrowVisual?: ReactNode }) {
  const { user } = useAuth();
  const consoleHref = user ? '/' : '/login';

  return (
    <section className={styles.hero}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/home" className={styles.brand} aria-label="ULTRON home">
            <img src={LOGO_DARK_SRC} alt="ULTRON" className={styles.brandLogo} />
          </Link>

          <nav className={styles.navigation} aria-label="Primary navigation">
            {navigation.map((item) => (
              <div className={styles.navigationItem} key={item.label}>
                <a href={item.href} className={styles.navigationLink}>
                  {item.label}
                  {item.menu && <Icon name="chevron" size={14} />}
                </a>

                {item.menu && (
                  <div className={styles.navigationMenu}>
                    {item.menu.map((entry) => (
                      <a key={entry.label} href={entry.href}>
                        {entry.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div className={styles.headerActions}>
            <div className={styles.utilityActions} aria-hidden="true">
              <span className={styles.utilityButton}>
                <Icon name="search" size={18} />
              </span>
              <span className={styles.utilityDivider} />
              <span className={styles.utilityButton}>
                <Icon name="menu" size={18} />
              </span>
            </div>
            <Link href={consoleHref} className={styles.signInButton}>
              <Icon name="login" size={16} />
              <span>{user ? 'Console' : 'Sign in'}</span>
            </Link>
          </div>
        </div>
      </header>

      <div className={styles.backgroundScene} aria-hidden="true" />
      <div className={styles.backgroundGrade} aria-hidden="true" />
      <div className={styles.backgroundPattern} aria-hidden="true" />

      <div className={styles.heroContent}>
        <div className={styles.heroCopy}>
          <h1>
            MACHINE HEALTH,
            <span>IN REAL TIME</span>
          </h1>

          <div className={styles.headingDecoration} aria-hidden="true">
            <span />
          </div>

          <p>
            ULTRON turns raw sensor telemetry into live dashboards and AI-driven failure prediction - so you fix machines
            before they break, not after.
          </p>

          <div className={styles.heroActions}>
            <Link href={consoleHref} className={styles.primaryButton}>
              {user ? 'Open console' : 'Launch console'}
              <Icon name="arrow" size={20} />
            </Link>

            <a href="#dashboard" className={styles.secondaryButton}>
              <Icon name="play" size={21} />
              See it live
            </a>
          </div>

          <div className={styles.benefits}>
            {heroBenefits.map((benefit, index) => (
              <div className={styles.benefit} key={benefit.title}>
                <Icon name={benefit.icon} size={24} />

                <span>
                  <strong>{benefit.title}</strong>
                  <small>{benefit.subtitle}</small>
                </span>

                {index < heroBenefits.length - 1 && <span className={styles.benefitDivider} />}
              </div>
            ))}
          </div>
        </div>

        {/* Wide viewports get the console render as a right-anchored backdrop
            (see `.backgroundScene`). Below that the render is dropped entirely
            and this column carries the animated live dashboard instead. */}
        <div className={styles.heroVisual}>{narrowVisual}</div>
      </div>

    </section>
  );
}
