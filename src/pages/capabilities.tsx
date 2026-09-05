// /capabilities — the four claims, and the four things it will not claim.
//
// This section used to sit on the landing page as `#platform`, which left the
// landing page arguing two things at once: what BlackGATE is for, and what it
// can do in detail. Those are different questions asked by different readers,
// so the detail has its own page now — the same move `/how-it-works` made for
// the mechanism.
//
// The order matters. Claims first, because that is what a reader arrives for;
// limits second, because that is what decides whether they believe the claims.

import Head from 'next/head';

import Boundaries from '../components/capabilities/Boundaries';
import Ambience from '../components/home/Ambience';
import Capabilities from '../components/home/Capabilities';
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
              Four claims, each with the artefact that backs it next to the sentence that makes it.
              Then the four things this deliberately does not do, because a capability list without
              its boundary is a brochure.
            </p>
            <span className={styles.pageRule} aria-hidden="true" />
          </div>
        </header>

        {/* The pinned-panel argument. Owns `#platform`. */}
        <Capabilities />

        {/* The counterpart: where it stops. Owns `#boundaries`. */}
        <Boundaries />

        <SiteFooter />
      </div>
    </div>
  );
}
