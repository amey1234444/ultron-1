// /outcomes — what measurably changes, and how that was measured.
//
// The outcome figures used to sit on the landing page as `#condition`. They are
// the most interrogated thing on the site — every evaluator who takes them
// seriously immediately wants the study behind them — and a landing page has
// nowhere to put that study. Here the figures lead and the method follows them,
// which is also where the band's own "Read the method" link has always pointed.

import Head from 'next/head';

import Ambience from '../components/home/Ambience';
import Cutover from '../components/home/Cutover';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import Method from '../components/outcomes/Method';
import SiteNav from '../components/web/SiteNav';

export default function OutcomesPage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>Outcomes — BlackGATE</title>
        <meta
          name="description"
          content="Unplanned downtime, time between failures, warning before failure and confirmation rate — measured against the twelve months before monitoring went live, across 62 sites."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Ambience />

      <div className={styles.content}>
        <header className={styles.pageHead}>
          <div className={styles.pageHeadInner}>
            <p className={styles.pageEyebrow}>Outcomes</p>
            <h1 className={styles.pageTitle}>Measured, not modelled</h1>
            <p className={styles.pageLead}>
              Every figure here is an observed range across sixty-two monitored sites, taken
              against each site&rsquo;s own record from the twelve months before cutover. The study
              that produced them, and what it leaves out, is set out underneath.
            </p>
            <span className={styles.pageRule} aria-hidden="true" />
          </div>
        </header>

        {/* The four figures against their baseline. Owns `#condition`. */}
        <Cutover />

        {/* The study behind them. Owns `#method` — where the band above links. */}
        <Method />

        <SiteFooter />
      </div>
    </div>
  );
}
