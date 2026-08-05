import Link from 'next/link';
import type { ReactNode } from 'react';

import { useAuth } from '../../context/AuthContext';
import styles from './UltronHero.module.css';

type IconName = 'arrow' | 'play' | 'clock' | 'shield' | 'chart';

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
  }
}

export default function UltronHero({ narrowVisual }: { narrowVisual?: ReactNode }) {
  const { user } = useAuth();
  const consoleHref = user ? '/' : '/login';

  return (
    <section className={styles.hero}>
      <div className={styles.backgroundScene} aria-hidden="true" />
      <div className={styles.backgroundGrade} aria-hidden="true" />
      <div className={styles.backgroundPattern} aria-hidden="true" />

      <div className={styles.heroContent}>
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            Predictive maintenance platform
            <span className={styles.eyebrowIndex}>/01</span>
          </div>

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
