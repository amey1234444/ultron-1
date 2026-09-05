// /about — why it is built the way it is, and who built it.
//
// Hero → the manifesto (three paragraphs, as prose, on paper) → the three
// principles as plates → the company in numbers → the journey → how we work
// with a plant → a short FAQ teaser pointing at /faq → the next step.
//
// The FAQ used to live here in full; it now has its own route, and this page
// keeps `#faq` as a teaser so old links still land on something relevant.

import Head from 'next/head';

import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import { Arrow, Button, Reveal } from '../components/home/primitives';
import about from '../components/pages/about.module.css';
import {
  BronzeButton,
  CtaBand,
  GateMark,
  GridMark,
  InnerHead,
  PageHero,
  Plate,
  PlateWall,
  PullQuote,
  RingsMark,
  Rows,
  StatStrip,
  Timeline,
  WaveMark,
  innerStyles,
} from '../components/pages/inner';
import SiteNav from '../components/web/SiteNav';
import { COMPANY_ADDRESS_INLINE } from '../../lib/company';

const NUMBERS = [
  { value: '62', label: 'rotating assets in the outcome study' },
  { value: '14', unit: 'mo', label: 'longest continuous deployment, Northfield' },
  { value: '3', label: 'protocols spoken on day one: MQTT · Modbus · OPC UA' },
  { value: '0', label: 'sensors a plant has to buy to begin' },
];

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

const HOW = [
  {
    term: 'We start with one line',
    detail:
      'Not the plant. One production line, the one that gets argued about, mapped to the points that already exist. If it does not earn a second line, it stops there.',
  },
  {
    term: 'We show our working',
    detail:
      'Every finding carries its points, values and limits. Every figure on our site carries its baseline and its method. If you cannot check it, we should not have said it.',
  },
  {
    term: 'We say what it will not do',
    detail:
      'No failure dates on evidence that cannot carry one; no diagnosing a machine it has never seen well; no converting units to make a signal fit. These are checks in the code, not lines in the copy.',
  },
  {
    term: 'The data stays yours',
    detail:
      'On-premise or private cloud, export is a button, and on leaving the full history is handed back in open formats. Nothing here is a one-way door.',
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
          meta="BlackGATE Technologies"
          title="Built by people who have been on the floor *at 3am*"
          lead="BlackGATE exists because the data needed to prevent a failure is almost always already being emitted — scattered across systems that do not talk, in units that do not agree, at a resolution nobody keeps. We read it, and print one line per asset."
          facts={[
            { label: 'Founded', value: '2021, on a night shift' },
            { label: 'Based', value: 'Bhilwara, Rajasthan' },
            { label: 'Builds', value: 'One gateway, one console' },
            { label: 'Believes', value: 'A figure you can argue with' },
          ]}
          actions={
            <>
              <BronzeButton href="#principles">
                What we believe
                <Arrow />
              </BronzeButton>
              <Button href="#journey" variant="ghost">
                How we got here
              </Button>
            </>
          }
        />

        {/* Manifesto — prose on paper. */}
        <section className={about.manifesto}>
          <div className={innerStyles.inner}>
            <div className={about.manifestoGrid}>
              <Reveal>
                <p className={about.manifestoEyebrow}>Why</p>
                <h2 className={about.manifestoTitle}>
                  Most monitoring projects fail the same way
                </h2>
              </Reveal>
              <Reveal delay={100}>
                <div className={about.prose}>
                  <p>
                    A pilot proves the signal is there, the rollout doubles the number of dashboards,
                    and eighteen months later the plant is looking at more screens than it was before
                    and trusting none of them.
                  </p>
                  <p>
                    We took the opposite constraint as the starting point:{' '}
                    <strong>one number per asset, and the one instruction that follows from it.</strong>{' '}
                    Everything in the platform — the gateway, the measurement model, the scoring, the
                    forecasting — exists to make that single figure defensible.
                  </p>
                  <p>
                    That constraint is why the console shows the detractors next to the score, why the
                    models re-baseline against the plant they are actually running on, and why a
                    forecast is drawn with its spread rather than as a confident line. A figure an
                    operator cannot interrogate is a figure they will eventually ignore.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Principles. */}
        <section id="principles" className={innerStyles.section}>
          <div className={innerStyles.inner}>
            <InnerHead
              eyebrow="Three principles"
              title="The constraints we *chose*"
              lead="Each of these costs us something — a feature we did not build, a claim we do not make — and each is why the thing still works after the pilot."
            />
            <PlateWall>
              <Plate
                tone="dark"
                span={4}
                index={1}
                eyebrow="Defensible"
                title="A score you can argue with"
                body="Every figure carries the channels that produced it, weighted and timestamped. If the number is wrong, you can see exactly where it went wrong — which is the only way a number survives a control room."
                mark={<RingsMark />}
              />
              <Plate
                tone="bronze"
                span={4}
                index={2}
                eyebrow="Sovereign"
                title="The plant keeps its data"
                body="The gateway runs inside your network and does not need the internet to work. History exports on demand over interfaces we also use ourselves. Nothing here is a one-way door."
                delay={90}
                mark={<GateMark />}
              />
              <Plate
                tone="dark"
                span={4}
                index={3}
                eyebrow="Unassuming"
                title="No new hardware to start"
                body="If it already speaks MQTT, Modbus or OPC UA, it is already a source. Sensors sharpen the model later; they are not the price of admission."
                delay={180}
                mark={<GridMark />}
              />
            </PlateWall>
          </div>
        </section>

        {/* Numbers. */}
        <section className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
          <div className={innerStyles.inner}>
            <InnerHead
              eyebrow="In numbers"
              title="Small team, *measured* claims"
              layout="stack"
            />
            <StatStrip items={NUMBERS} />
          </div>
        </section>

        {/* Journey. */}
        <section id="journey" className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
          <div className={innerStyles.inner}>
            <div className={about.journeyGrid}>
              <div className={about.journeySticky}>
                <InnerHead
                  eyebrow="Journey"
                  title="From a night shift to a *study*"
                  lead="Five years, one idea: read what the plant already says, and say only what the evidence can carry."
                  layout="stack"
                />
                <PullQuote who="Founding note, 2021">
                  The historian had been describing the failure for a week. Nobody had been
                  reading it.
                </PullQuote>
              </div>
              <Timeline items={JOURNEY} />
            </div>
          </div>
        </section>

        {/* How we work. */}
        <section className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
          <div className={innerStyles.inner}>
            <InnerHead
              eyebrow="How we work"
              title="Four habits a plant can *hold us to*"
              lead="Written down so they can be pointed at. If we break one, the person to tell is the engineer on your account, and then the founders."
            />
            <Rows items={HOW} />
          </div>
        </section>

        {/* FAQ teaser — `#faq` kept for old links. */}
        <section id="faq" className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
          <div className={innerStyles.inner}>
            <InnerHead
              eyebrow="FAQ"
              title="Questions engineering teams *ask us*"
              lead="The three we hear first. The full list, grouped by who is asking, is on its own page."
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
              title="Talk to an *engineer*, not a rep"
              body="The questions we cannot answer generically are usually the interesting ones. Send it over — the person who replies will have built the thing you are asking about."
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
