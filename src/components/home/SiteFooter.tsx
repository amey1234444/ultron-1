import Link from 'next/link';
import type { ReactNode } from 'react';

import logoDark from '../../../assets/brand/logo-dark.png';
import styles from './SiteFooter.module.css';

const LOGO_SRC = typeof logoDark === 'string' ? logoDark : logoDark.src;

const SOCIALS: { label: string; href: string; icon: ReactNode }[] = [
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/ultron-industrial',
    icon: (
      <path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM0 8.98h4.96V24H0zM8.98 8.98h4.75v2.05h.07c.66-1.25 2.28-2.57 4.69-2.57 5.02 0 5.95 3.3 5.95 7.6V24h-4.96v-6.9c0-1.65-.03-3.77-2.3-3.77-2.3 0-2.65 1.8-2.65 3.65V24H8.98z" />
    ),
  },
  {
    label: 'X',
    href: 'https://x.com',
    icon: (
      <path d="M18.9 2H22l-7.5 8.6L23.4 22h-6.9l-5.4-7-6.2 7H1.8l8-9.2L1 2h7l4.9 6.5L18.9 2zm-2.4 18h1.9L7.6 4H5.6l10.9 16z" />
    ),
  },
  {
    label: 'GitHub',
    href: 'https://github.com',
    icon: (
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.3-5.26-1.28-5.26-5.7 0-1.26.45-2.3 1.2-3.1-.12-.3-.52-1.48.11-3.08 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.5 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.08.75.8 1.2 1.84 1.2 3.1 0 4.43-2.7 5.4-5.28 5.68.42.36.79 1.08.79 2.18v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
    ),
  },
];

// Only destinations that exist: page sections, the console, or a real mailbox —
// the footer never links to a page the site does not have.
const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#product' },
      { label: 'Platform', href: '#platform' },
      { label: 'Live console', href: '#console' },
      { label: 'Open console', href: '/login' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { label: 'Industries', href: '#industries' },
      { label: 'Integrations', href: '#security' },
      { label: 'Security', href: '#security' },
      { label: 'Pipeline', href: '#pipeline' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'FAQ', href: '#faq' },
      { label: 'Contact sales', href: 'mailto:hello@ultron.io' },
      { label: 'Request access', href: '/signup' },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <span className={styles.footerGlow} aria-hidden="true" />

      <div className={styles.inner}>
        <div>
          <img src={LOGO_SRC} alt="ULTRON" className={styles.brandLogo} />
          <p className={styles.brandBlurb}>
            Industrial intelligence platform for real-time monitoring and predictive maintenance of
            rotating equipment.
          </p>

          <div className={styles.contact}>
            <a href="mailto:hello@ultron.io" className={styles.contactLink}>
              hello@ultron.io
            </a>
            <a href="tel:+18005551234" className={styles.contactLink}>
              +1 (800) 555-1234
            </a>
            <span className={styles.contactMuted}>San Francisco, CA · Remote-first</span>
          </div>

          <span className={styles.statusBadge}>
            <span className={styles.statusDot} aria-hidden="true" />
            All systems operational
          </span>

          <div className={styles.socials}>
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={social.label}
                title={social.label}
                className={styles.social}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  {social.icon}
                </svg>
              </a>
            ))}
          </div>
        </div>

        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h3 className={styles.colTitle}>{column.title}</h3>
            <div className={styles.colLinks}>
              {column.links.map((link) =>
                link.href.startsWith('mailto:') ? (
                  <a key={link.label} href={link.href} className={styles.colLink}>
                    {link.label}
                  </a>
                ) : (
                  <Link key={link.label} href={link.href} className={styles.colLink}>
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.wordmark} aria-hidden="true">
        <span className={styles.wordmarkText}>ULTRON</span>
      </div>

      <div className={styles.legal}>
        <span>© {new Date().getFullYear()} ULTRON — Industrial intelligence platform</span>
        <span>ISO 27001-aligned · SOC 2 controls · GDPR ready</span>
        <span className={styles.legalLinks}>
          <a href="#contact" className={styles.legalLink}>
            Privacy
          </a>
          <a href="#contact" className={styles.legalLink}>
            Terms
          </a>
        </span>
      </div>
    </footer>
  );
}
