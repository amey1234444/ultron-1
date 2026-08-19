// Site footer.
//
// One line: the copyright, and the same five destinations the bar carries. The
// four-column block that used to live here was re-stating the navigation in
// longer form — a page this short does not need to be told twice where it goes.
//
// Only destinations that exist: real pages, or real anchors on the landing page.

import Link from 'next/link';

import styles from './SiteFooter.module.css';

const LINKS: { label: string; href: string }[] = [
  { label: 'Platform', href: '/#platform' },
  { label: 'Industries', href: '/#industries' },
  { label: 'Condition', href: '/#condition' },
  { label: 'Evidence', href: '/#evidence' },
  { label: 'Company', href: '/about' },
];

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p className={styles.legal}>© {new Date().getFullYear()} Ultron</p>

        <nav className={styles.links} aria-label="Footer">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={styles.link}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
