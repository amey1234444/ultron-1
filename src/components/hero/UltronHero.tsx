import Link from 'next/link';

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
  { icon: 'cloud', title: 'Edge to Cloud', subtitle: 'Secure & scalable' },
  { icon: 'clock', title: '99.9% Uptime', subtitle: 'Enterprise grade' },
];

const heroBenefits: { icon: IconName; title: string; subtitle: string }[] = [
  { icon: 'shield', title: 'Secure by Design', subtitle: 'End-to-end encryption' },
  { icon: 'chart', title: 'AI Predictive', subtitle: 'Smart anomaly detection' },
  { icon: 'clock', title: 'Real-time Alerts', subtitle: 'Instant notifications' },
];

const partners = ['VEDANTA', 'TATA STEEL', 'HINDALCO', 'JSW', 'SAIL', 'HINDUSTAN ZINC'];

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

export default function UltronHero() {
  const { user } = useAuth();
  const consoleHref = user ? '/' : '/login';

  return (
    <section className={styles.hero}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/home" className={styles.brand} aria-label="ULTRON home">
            <span className={styles.brandName}>ULTRON</span>
            <span className={styles.brandTagline}>MACHINE HEALTH, IN REAL TIME</span>
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

        {/* Console render — the industrial platform scene. Shown as a
            right-anchored backdrop layer on desktop (see the stylesheet) and
            inline underneath the copy on narrow screens. */}
        <div className={styles.heroVisual}>
          <img
            src="/images/ultron-hero-console.png"
            alt="ULTRON console showing live machine health metrics above an instrumented plant platform"
            width={1672}
            height={941}
            fetchPriority="high"
          />
        </div>
      </div>

      <div className={styles.partnerBar}>
        <span className={styles.partnerHeading}>TRUSTED BY INDUSTRY LEADERS</span>

        {partners.map((partner) => (
          <span key={partner}>{partner}</span>
        ))}
      </div>

      <a href="#contact" className={styles.chatButton} aria-label="Talk to us">
        <Icon name="chat" size={24} />
      </a>
    </section>
  );
}
