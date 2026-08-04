import Link from 'next/link';
import type { ReactNode } from 'react';

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
  | 'chat';

type NavItem = {
  label: string;
  href: string;
  menu?: { label: string; href: string }[];
};

// Anchors resolve to the sections that already exist further down the landing
// page; `/login` and `/` are the real auth + console routes.
const navigation: NavItem[] = [
  {
    label: 'Features',
    href: '#features',
    menu: [
      { label: 'Predictive maintenance', href: '#features' },
      { label: 'Real-time trends', href: '#features' },
      { label: 'Asset hierarchy', href: '#features' },
    ],
  },
  { label: 'Dashboard', href: '#dashboard' },
  {
    label: 'Platform',
    href: '#platform',
    menu: [
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Connectivity', href: '#platform' },
      { label: 'Security', href: '#platform' },
    ],
  },
  {
    label: 'Industries',
    href: '#industries',
    menu: [
      { label: 'Cement & mining', href: '#industries' },
      { label: 'Power generation', href: '#industries' },
      { label: 'Chemical & process', href: '#industries' },
    ],
  },
  {
    label: 'Resources',
    href: '#faq',
    menu: [
      { label: 'FAQ', href: '#faq' },
      { label: 'Live dashboard', href: '#dashboard' },
      { label: 'Contact sales', href: '#contact' },
    ],
  },
  { label: 'Contact', href: '#contact' },
];

const platformFeatures: { icon: IconName; title: string; subtitle: string }[] = [
  { icon: 'telemetry', title: 'Real-time Telemetry', subtitle: '<200ms latency' },
  { icon: 'ai', title: 'AI-Powered Insights', subtitle: 'Predict failures early' },
  { icon: 'cloud', title: 'Edge to Cloud', subtitle: 'Secure & Scalable' },
  { icon: 'clock', title: '99.9% Uptime', subtitle: 'Enterprise Grade' },
];

const heroBenefits: { icon: IconName; title: string; subtitle: string }[] = [
  { icon: 'chart', title: 'AI Predictive', subtitle: 'Smart anomaly detection' },
  { icon: 'clock', title: 'Real-time Alerts', subtitle: 'Instant notifications' },
  { icon: 'shield', title: 'Secure by Design', subtitle: 'End-to-end encryption' },
];

// Customer wall. `mark` is an original monochrome glyph drawn for this page —
// swap in an official brand SVG at the same path once one is licensed.
const partners: { name: string; mark: ReactNode }[] = [
  {
    name: 'Vedanta',
    mark: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M6 7l10 18L26 7" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M13 7l3 5.4L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: 'Tata Steel',
    mark: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2.2" />
        <path d="M6 16h20" stroke="currentColor" strokeWidth="2.2" />
        <path d="M16 6c4 5 4 15 0 20-4-5-4-15 0-20Z" stroke="currentColor" strokeWidth="2.2" />
      </svg>
    ),
  },
  {
    name: 'Hindalco',
    mark: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2.2" />
        <path d="M16 6c6 3 6 15 0 20-6-5-6-17 0-20Z" fill="currentColor" opacity="0.55" />
      </svg>
    ),
  },
  {
    name: 'JSW',
    mark: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M5 9l7 14 4-8 4 8 7-14" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    name: 'SAIL',
    mark: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 5l11 11-11 11L5 16 16 5Z" stroke="currentColor" strokeWidth="2.2" />
        <path d="M16 11l5 5-5 5-5-5 5-5Z" fill="currentColor" opacity="0.6" />
      </svg>
    ),
  },
  {
    name: 'Hindustan Zinc',
    mark: (
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path d="M16 4l10 6v12l-10 6-10-6V10l10-6Z" stroke="currentColor" strokeWidth="2.2" />
        <path d="M12 12h8l-8 8h8" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      </svg>
    ),
  },
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
    case 'chat':
      return (
        <svg {...properties}>
          <path d="M20 14.5A2.5 2.5 0 0 1 17.5 17H8l-4 3.5V6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5Z" />
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
            <span className={styles.brandName}>ULTRON</span>
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
            <Link href={consoleHref} className={styles.signInButton}>
              {user ? 'Console' : 'Sign in'}
            </Link>

            <a href="#contact" className={styles.requestDemoButton}>
              Request Demo
              <Icon name="arrow" size={18} />
            </a>
          </div>
        </div>
      </header>

      <div className={styles.featureStrip}>
        <div className={styles.featureStripContent}>
          {platformFeatures.map((feature, index) => (
            <div className={styles.platformFeature} key={feature.title}>
              <span className={styles.platformFeatureIcon}>
                <Icon name={feature.icon} size={23} />
              </span>

              <span className={styles.platformFeatureText}>
                <strong>{feature.title}</strong>
                <small>{feature.subtitle}</small>
              </span>

              {index < platformFeatures.length - 1 && <span className={styles.featureDivider} />}
            </div>
          ))}

          <div className={styles.systemStatus}>
            <span className={styles.systemStatusDot} />
            All Systems Operational
          </div>
        </div>
      </div>

      <div className={styles.backgroundScene} aria-hidden="true" />
      <div className={styles.backgroundGrade} aria-hidden="true" />
      <div className={styles.backgroundPattern} aria-hidden="true" />

      <div className={styles.heroContent}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            INDUSTRIAL IOT
            <span className={styles.eyebrowSeparator}>·</span>
            PREDICTIVE MAINTENANCE
          </div>

          <h1>
            MACHINE HEALTH,
            <span>IN REAL TIME</span>
          </h1>

          <div className={styles.headingDecoration} aria-hidden="true">
            <span />
          </div>

          <p>
            ULTRON turns raw sensor telemetry into live dashboards and AI-driven failure prediction — so you fix machines
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

      <div className={styles.partnerBar}>
        <span className={styles.partnerHeading}>TRUSTED BY INDUSTRY LEADERS</span>

        {partners.map((partner) => (
          <span className={styles.partnerLogo} key={partner.name}>
            {partner.mark}
            {partner.name}
          </span>
        ))}
      </div>

      <a href="#contact" className={styles.chatButton} aria-label="Talk to us">
        <Icon name="chat" size={24} />
      </a>
    </section>
  );
}
