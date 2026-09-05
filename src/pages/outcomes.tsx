// /outcomes — where the study behind the figures will live.
//
// The outcome figures themselves stay on the landing page as `#condition`;
// they are part of the argument that page makes. This page is for what a
// landing page has nowhere to put — how those figures were measured — and it
// gets sections written for it rather than the landing band shown twice.
//
// What stands here today is the method. The rest of the page is still to be
// designed.

import Head from 'next/head';

import Ambience from '../components/home/Ambience';
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
              Every figure we publish is an observed range across sixty-two monitored sites, taken
              against each site&rsquo;s own record from the twelve months before cutover. The study
              that produced them, and what it leaves out, is set out below.
            </p>
            <span className={styles.pageRule} aria-hidden="true" />
          </div>
        </header>

        {/* The study. Owns `#method`. */}
        <Method />

        <SiteFooter />
      </div>
    </div>
  );
}
