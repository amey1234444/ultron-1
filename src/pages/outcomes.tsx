// /outcomes — what changed, measured, and how it was measured.
//
// Hero → the four figures with the baseline each moved off → the Northfield
// case in its own dates → what the people on the floor said → the next step,
// with the study method folded away under the case. The figures are the landing
// page's figures; this page is where they get their study.

import Head from 'next/head';

import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import Figures from '../components/outcomes/Figures';
import Ledger from '../components/outcomes/Ledger';
import Method from '../components/outcomes/Method';
import {
  CtaBand,
  DetailSection,
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
          title="Less downtime. *More certainty.*"
          lead="Results against each site’s own record. 62 assets. Twelve months before and after."
        />

        <Figures />
        <Ledger />
        <DetailSection label="Study method & exclusions">
          <Method />
        </DetailSection>

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
              title="See it on *your machines.*"
              body="Start with one asset and your existing data."
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
