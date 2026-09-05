// /outcomes — what changed, measured, and how it was measured.
//
// Hero → the four figures drawn against their baselines → the Northfield case
// in its own dates → the method → what the people on the floor said → the
// next step. The figures are the landing page's figures; this page is where
// they get their study.

import Head from 'next/head';

import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import { Arrow, Button } from '../components/home/primitives';
import Figures from '../components/outcomes/Figures';
import Ledger from '../components/outcomes/Ledger';
import Method from '../components/outcomes/Method';
import {
  BronzeButton,
  CtaBand,
  InnerHead,
  PageHero,
  PlateWall,
  QuotePlate,
  RingsMark,
  innerStyles,
} from '../components/pages/inner';
import SiteNav from '../components/web/SiteNav';

export default function OutcomesPage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>Outcomes — BlackGATE</title>
        <meta
          name="description"
          content="Four outcome ranges drawn against the baselines they moved off, across sixty-two monitored assets. The Northfield case in its own dates, the study method, and what the people on the floor said."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Ambience />

      <div className={styles.content}>
        <PageHero
          eyebrow="Outcomes"
          meta="62 assets · 12 months either side"
          title="Measured, *not modelled*"
          lead="Every figure on this page is a range measured against a site's own twelve-month record, not a projection. The study design is printed under the figures, the exclusions are printed with it, and the one case we can show in full is shown in full."
          facts={[
            { label: 'Population', value: '62 rotating assets' },
            { label: 'Windows', value: '12 mo before · 12 mo after' },
            { label: 'Confirmed on inspection', value: '95 per cent' },
            { label: 'Point estimates', value: 'None' },
          ]}
          actions={
            <>
              <BronzeButton href="#figures">
                The four figures
                <Arrow />
              </BronzeButton>
              <Button href="#method" variant="ghost">
                How they were taken
              </Button>
            </>
          }
        />

        <Figures />
        <Ledger />
        <Method />

        <section className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
          <div className={innerStyles.inner}>
            <InnerHead
              eyebrow="On the floor"
              title="What the people who *used it* said"
              lead="Three roles, three plants. Each quote is about the same thing: a finding you can argue with, in a window you can take."
            />
            <PlateWall>
              <QuotePlate
                tone="paper"
                span={5}
                quote="A range we can trust beats a date we can't. The first time it said nineteen to twenty-six days, we planned for twenty-two and it went out on twenty-three."
                name="Priya Raman"
                role="Maintenance manager, Northfield"
                mark={<RingsMark />}
              />
              <QuotePlate
                tone="dark"
                span={4}
                delay={90}
                quote="I have never trusted a black box, and I still don't. This isn't one — it shows me the three points and the limits, and I can check them against the historian myself."
                name="Daniel Okafor"
                role="Reliability engineer, Westmere"
              />
              <QuotePlate
                tone="dark"
                span={3}
                delay={180}
                quote="The morning list is one line per asset. That's all I read, and it's enough."
                name="Helen Strand"
                role="Plant director, Carrow"
              />
            </PlateWall>
          </div>
        </section>

        <section className={innerStyles.section}>
          <div className={innerStyles.inner}>
            <CtaBand
              eyebrow="Next"
              ghost="02"
              title="Run the same study *on your record*"
              body="Bring twelve months of your own maintenance log. We map one line, learn its baseline from its own history, and show what the figures would have been — before anyone signs anything."
              primary={{ href: '/contact', label: 'Start with one line' }}
              secondary={{ href: '/capabilities', label: 'What it does, and does not' }}
            />
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
