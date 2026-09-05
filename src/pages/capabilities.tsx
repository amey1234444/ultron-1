// /capabilities — the long answer to "what does it actually do".
//
// Hero → four pillars, each with its artefact → the pipeline that joins them →
// the datasheet → the four things it will not do → the next step. The landing
// page keeps `#platform`; nothing from it is shown here a second time.

import Head from 'next/head';

import Boundaries from '../components/capabilities/Boundaries';
import Pillars from '../components/capabilities/Pillars';
import Pipeline from '../components/capabilities/Pipeline';
import Specs from '../components/capabilities/Specs';
import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import { Arrow, Button } from '../components/home/primitives';
import { BronzeButton, CtaBand, PageHero, innerStyles } from '../components/pages/inner';
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
          meta="Four claims, one pipeline"
          title="Adaptive, explainable, predictive — and *accountable* for each"
          lead="What the platform does, shown as the objects it produces: a baseline the plant taught, a finding that carries its evidence, a forecast drawn as a range, an instruction placed in a window the plant can take. Then the four things it will not do."
          facts={[
            { label: 'Baseline', value: 'Learned per asset' },
            { label: 'Finding', value: 'Points · values · limits' },
            { label: 'Forecast', value: 'A range, never a date' },
            { label: 'Hardware to start', value: 'None' },
          ]}
          actions={
            <>
              <BronzeButton href="#pillars">
                The four capabilities
                <Arrow />
              </BronzeButton>
              <Button href="#boundaries" variant="ghost">
                What it will not tell you
              </Button>
            </>
          }
        />

        <Pillars />
        <Pipeline />
        <Specs />
        <Boundaries />

        <section className={innerStyles.section}>
          <div className={innerStyles.inner}>
            <CtaBand
              eyebrow="Next"
              ghost="01"
              title="See it on *your* worst asset"
              body="Pick the machine the plant argues about. We map it to the existing points, learn its baseline from its own history, and show you what it says — in a call, on your numbers."
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
