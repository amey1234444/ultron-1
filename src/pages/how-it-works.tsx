// /how-it-works — the mechanism, in one place.
//
// These three sections used to be spread through the landing page, which left
// the landing page arguing two things at once: what ULTRON is for, and how it is
// built. They are different questions asked by different readers, so the "how"
// now has its own page and the landing page keeps the "what".
//
// The order is the path a reading actually takes: it is produced and reconciled
// (the loom), it travels (the pipeline), and it never stops (the record).

import Head from 'next/head';

import BuildOn from '../components/home/BuildOn';
import Coverage from '../components/howitworks/Coverage';
import Pipeline from '../components/home/Pipeline';
import Rules from '../components/home/Rules';
import SignalLoom from '../components/howitworks/SignalLoom';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import SiteNav from '../components/web/SiteNav';

export default function HowItWorksPage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>How it works — ULTRON</title>
        <meta
          name="description"
          content="How a reading travels from the machine to your screen: reconciled onto one measurement model, published sub-second, and recorded without gaps."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Rules />

      <div className={styles.content}>
        <header className={styles.pageHead}>
          <div className={styles.pageHeadInner}>
            <p className={styles.pageEyebrow}>How it works</p>
            <h1 className={styles.pageTitle}>From the machine to a decision</h1>
            <p className={styles.pageLead}>
              No black box and no proprietary bus. Standard instrumentation, an MQTT broker, one
              measurement model and a console that repaints in place — with the latency budget
              written down at every hop.
            </p>
            <span className={styles.pageRule} aria-hidden="true" />
          </div>
        </header>

        {/* Ragged channels in, one reconciled context out. Owns `#signals`. */}
        <SignalLoom />

        {/* The pinned hop-by-hop chain and its latency budget. Owns `#signal`. */}
        <Pipeline />

        {/* The unbroken coverage record. Owns `#always-on`. */}
        <Coverage />

        {/* The three interfaces the same data is available over. This was on the
            landing page, where it was the only section asking the reader to
            think about wire protocols — a question nobody has yet at that point.
            Here it is the last thing on the page, and by now it is the obvious
            one: you have just been shown how a reading is made, so the natural
            next question is how you get at it yourself. */}
        <BuildOn />

        <SiteFooter />
      </div>
    </div>
  );
}
