// /capabilities — where the detailed capability argument will live.
//
// This page is deliberately its own thing. The landing page keeps `#platform`,
// the pinned-panel section that states what BlackGATE is for; this page is for
// the longer answer a reader goes looking for after that, and it gets sections
// written for it rather than the landing page's sections shown a second time.
//
// What stands here today is the boundary list — the four claims the system
// declines to make. The rest of the page is still to be designed.

import Head from 'next/head';

import Boundaries from '../components/capabilities/Boundaries';
import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import SiteNav from '../components/web/SiteNav';

export default function CapabilitiesPage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>Capabilities — BlackGATE</title>
        <meta
          name="description"
          content="Adaptive baselines, explainable findings and predictions that carry their evidence — and the four claims the system declines to make."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Ambience />

      <div className={styles.content}>
        <header className={styles.pageHead}>
          <div className={styles.pageHeadInner}>
            <p className={styles.pageEyebrow}>Capabilities</p>
            <h1 className={styles.pageTitle}>Adaptive, explainable, predictive</h1>
            <p className={styles.pageLead}>
              What the system does, and the four things it deliberately does not do — because a
              capability list without its boundary is a brochure.
            </p>
            <span className={styles.pageRule} aria-hidden="true" />
          </div>
        </header>

        {/* Where it stops. Owns `#boundaries`. */}
        <Boundaries />

        <SiteFooter />
      </div>
    </div>
  );
}
