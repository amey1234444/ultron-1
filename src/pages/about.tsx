// /about — why it is built the way it is, and who built it.
//
// Hero → the three principles as plates → the journey, with the year-by-year
// story folded away behind it → a short FAQ teaser pointing at /faq → the next
// step. The manifesto, the numbers band and the four working habits were three
// ways of saying what the principles say once, so the principles say it.
//
// The FAQ used to live here in full; it now has its own route, and this page
// keeps `#faq` as a teaser so old links still land on something relevant.

import Head from 'next/head';

import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import { Arrow, Button } from '../components/home/primitives';
import about from '../components/pages/about.module.css';
import {
  CtaBand,
  DetailSection,
  GateMark,
  GridMark,
  InnerHead,
  PageHero,
  Plate,
  PlateWall,
  PullQuote,
  RingsMark,
  Timeline,
  WaveMark,
  innerStyles,
} from '../components/pages/inner';
import SiteNav from '../components/web/SiteNav';
import { COMPANY_ADDRESS_INLINE } from '../../lib/company';

const JOURNEY = [
  {
    when: '2021',
    title: 'The 3am question',
    body: 'Two of us on a night shift at a polymer site, watching a gearbox that the historian had been describing for a week and nobody had been reading. The data was there. The reading was not.',
  },
  {
    when: '2022',
    title: 'A gateway, not a dashboard',
    body: 'First build: a box that sat inside the plant network, read what was already there, and printed one line per asset. No cloud, no new sensors, no new screens.',
  },
  {
    when: '2023',
    title: 'Baselines the plant teaches',
    body: 'The vendor-default limits were wrong on every site. We replaced them with bands fitted from each asset\'s own healthy running, re-fitted as the plant drifted.',
    hot: true,
    tag: 'Turning point',
  },
  {
    when: '2024',
    title: 'Northfield goes live',
    body: 'Forty-one assets, first finding in six weeks, four bearings caught in the first year. The case we still show in full, wrong finding included.',
  },
  {
    when: '2025',
    title: 'The study',
    body: 'Sixty-two assets, twelve months either side, each site against its own record. Exclusions declared before the numbers came in.',
  },
  {
    when: 'Now',
    title: 'BlackGATE',
    body: `Registered as BlackGATE Technologies at ${COMPANY_ADDRESS_INLINE}. A small team of controls, reliability and software engineers, most of whom have been on the floor at 3am.`,
  },
];

const FAQ_TEASER = [
  { q: 'Do we need new sensors to get started?', a: 'No. If it already speaks MQTT, Modbus or OPC UA, it is already a source.' },
  { q: 'Can it run without internet access?', a: 'Yes. The gateway runs inside your network; air-gapped sites receive updates on media.' },
  { q: 'What happens to the data if we leave?', a: 'It is handed back in open formats and our copy is destroyed.' },
];

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>About — BlackGATE</title>
        <meta
          name="description"
          content="Why BlackGATE is built the way it is: one number per asset and the instruction that follows from it. The principles, the numbers, the journey, and how we work with a plant."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Ambience />

      <div className={styles.content}>
        <PageHero
          eyebrow="About"
          title="Built for the *plant floor.*"
          lead="We turn the signals you already have into decisions your team can trust."
        />

        {/* Principles. */}
        <section id="principles" className={innerStyles.section}>
          <div className={innerStyles.inner}>
            <InnerHead
              eyebrow="Three principles"
              title="Three things we *stand for.*"
            />
            <PlateWall>
              <Plate
                tone="dark"
                span={4}
                index={1}
                eyebrow="Defensible"
                title="Every score, explained"
                body="Trace every score to the readings that shaped it."
                mark={<RingsMark />}
              />
              <Plate
                tone="bronze"
                span={4}
                index={2}
                eyebrow="Sovereign"
                title="Your data stays yours"
                body="Run inside your network. Keep control of your history."
                delay={90}
                mark={<GateMark />}
              />
              <Plate
                tone="dark"
                span={4}
                index={3}
                eyebrow="Unassuming"
                title="Use what you have"
                body="Start with existing MQTT, Modbus, and OPC UA sources."
                delay={180}
                mark={<GridMark />}
              />
            </PlateWall>
          </div>
        </section>

        {/* Journey. */}
        <section id="journey" className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
          <div className={innerStyles.inner}>
            <div className={about.journeyGrid}>
              <div className={about.journeySticky}>
                <InnerHead
                  eyebrow="Journey"
                  title="Made for *real operations.*"
                  lead="Five years, one idea: read what the plant already says, and say only what the evidence can carry."
                  layout="stack"
                />
                <PullQuote who="Founding note, 2021">
                  The historian had been describing the failure for a week. Nobody had been
                  reading it.
                </PullQuote>
              </div>
              <DetailSection label="Our story, 2021 to today" variant="inline">
                <Timeline items={JOURNEY} />
              </DetailSection>
            </div>
          </div>
        </section>

        {/* FAQ teaser — `#faq` kept for old links. */}
        <section id="faq" className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
          <div className={innerStyles.inner}>
            <InnerHead
              eyebrow="FAQ"
              title="Before you *get started.*"
              more={{ href: '/faq', label: 'All questions' }}
            />
            <PlateWall>
              {FAQ_TEASER.map((item, index) => (
                <Plate
                  key={item.q}
                  tone={index === 0 ? 'paper' : 'dark'}
                  span={4}
                  delay={index * 90}
                  title={item.q}
                  body={item.a}
                  mark={index === 0 ? <WaveMark /> : undefined}
                  foot={
                    <Button href="/faq" variant="ghost">
                      Read the answer
                      <Arrow />
                    </Button>
                  }
                />
              ))}
            </PlateWall>
          </div>
        </section>

        <section className={innerStyles.section}>
          <div className={innerStyles.inner}>
            <CtaBand
              eyebrow="Next"
              ghost="03"
              title="See it on *your machines.*"
              body="Start with one asset and your existing data."
              primary={{ href: '/contact', label: 'Talk to an engineer' }}
              secondary={{ href: 'mailto:hello@ultron.io', label: 'hello@ultron.io' }}
            />
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
