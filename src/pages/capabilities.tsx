// /capabilities — the long answer to "what does it actually do".
//
// Hero → four pillars, each with its artefact → the pipeline that joins them →
// the next step, with the datasheet and the model limits folded away under it.
// The landing page keeps `#platform`; nothing from it is shown here a second
// time.
//
// The page argues in one line per idea. Everything a reader asks for on the
// second call — throughput, connectors, what the site has to provide, the four
// claims the system declines to make — is still here, one click down, because
// running it inline buried the argument under its own footnotes.

import Head from 'next/head';

import Boundaries from '../components/capabilities/Boundaries';
import Pillars from '../components/capabilities/Pillars';
import Pipeline from '../components/capabilities/Pipeline';
import Specs from '../components/capabilities/Specs';
import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import { CtaBand, DetailSection, PageHero, innerStyles } from '../components/pages/inner';
import SiteNav from '../components/web/SiteNav';

export default function CapabilitiesPage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>Capabilities — BlackGATE</title>
        <meta
          name="description"
          content="Adaptive baselines, explainable findings, forecasts drawn as ranges and instructions the plant can act on — with the artefact behind each claim, the pipeline that joins them, and the four claims the system declines to make."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Ambience />

      <div className={styles.content}>
        <PageHero
          eyebrow="Capabilities"
          title="Know your machines. *Act with clarity.*"
          lead="From the signals a plant already has to one clear maintenance decision."
        />

        <Pillars />
        <Pipeline />

        {/* Folded, not dropped. `DetailSection` opens itself if a link points at
            `#specs` or `#boundaries`, so the anchors keep working. */}
        <DetailSection label="Technical specifications">
          <Specs />
        </DetailSection>
        <DetailSection label="Model limits">
          <Boundaries />
        </DetailSection>

        <section className={innerStyles.section}>
          <div className={innerStyles.inner}>
            <CtaBand
              eyebrow="Next"
              ghost="01"
              title="See it on *your machines*"
              body="Start with one asset and the data you already have. We map it, learn its baseline from its own history, and show you what it says."
              primary={{ href: '/contact', label: 'Request a walkthrough' }}
              secondary={{ href: '/outcomes', label: 'Read the outcomes first' }}
            />
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
