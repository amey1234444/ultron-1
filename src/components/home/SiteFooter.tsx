// Site footer.
//
// Stripped to four things: the mark, the routes, where we are, and the legal
// line. No blurb, no glow, no status pill — everything the old footer said in
// prose is either on a page of its own now or was never load-bearing.
//
// Only destinations that exist: real pages, real anchors on the landing page,
// or a real mailbox.

import Link from 'next/link';

import logoDark from '../../../assets/brand/logo-dark.png';
import styles from './SiteFooter.module.css';

const LOGO_SRC = typeof logoDark === 'string' ? logoDark : logoDark.src;

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Platform',
    links: [
      { label: 'How it works', href: '/#signal' },
      { label: 'Capabilities', href: '/#platform' },
      { label: 'Outcomes', href: '/#results' },
      { label: 'Open console', href: '/login' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'FAQ', href: '/about#faq' },
      { label: 'Contact', href: '/contact' },
      { label: 'Request access', href: '/signup' },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <Link href="/home" className={styles.brand} aria-label="ULTRON home">
          <img src={LOGO_SRC} alt="ULTRON" className={styles.brandLogo} />
        </Link>

        {COLUMNS.map((column) => (
          <nav key={column.title} className={styles.col} aria-label={column.title}>
            <h2 className={styles.colTitle}>{column.title}</h2>
            {column.links.map((link) => (
              <Link key={link.href} href={link.href} className={styles.colLink}>
                {link.label}
              </Link>
            ))}
          </nav>
        ))}

        <address className={styles.address}>
          ULTRON HQ
          <br />
          548 Market Street
          <br />
          San Francisco, CA 94104
          <br />
          <a href="mailto:hello@ultron.io" className={styles.addressLink}>
            hello@ultron.io
          </a>
        </address>
      </div>

      <div className={styles.base}>
        <a
          href="https://www.linkedin.com/company/ultron-industrial"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="ULTRON on LinkedIn"
          className={styles.social}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM0 8.98h4.96V24H0zM8.98 8.98h4.75v2.05h.07c.66-1.25 2.28-2.57 4.69-2.57 5.02 0 5.95 3.3 5.95 7.6V24h-4.96v-6.9c0-1.65-.03-3.77-2.3-3.77-2.3 0-2.65 1.8-2.65 3.65V24H8.98z" />
          </svg>
        </a>

        <p className={styles.legal}>
          © {new Date().getFullYear()} ULTRON Technologies. All rights reserved.
        </p>
      </div>

      {/* The page signs its name on the way out. Decorative only. */}
      <div className={styles.wordmark} aria-hidden="true">
        ULTRON
      </div>
    </footer>
  );
}
