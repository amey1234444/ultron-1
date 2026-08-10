// About.
//
// Holds the FAQ, which used to be a band on the landing page. The questions
// belong to someone who has already decided the product is interesting and is
// now checking it against their own plant — which is this page's reader, not
// the fold's.

import Head from 'next/head';

import Ambience from '../components/home/Ambience';
import Faq from '../components/home/Faq';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import { Arrow, Button, Reveal, SectionHead } from '../components/home/primitives';
import SiteNav from '../components/web/SiteNav';

const PRINCIPLES = [
  {
    title: 'A score you can argue with',
    body: 'Every figure carries the channels that produced it, weighted and timestamped. If the number is wrong, you can see exactly where it went wrong — which is the only way a number survives a control room.',
  },
  {
    title: 'The plant keeps its data',
    body: 'The gateway runs inside your network and does not need the internet to work. History exports on demand over interfaces we also use ourselves. Nothing here is a one-way door.',
  },
  {
    title: 'No new hardware to start',
    body: 'If it already speaks MQTT, Modbus or OPC UA, it is already a source. Sensors sharpen the model later; they are not the price of admission.',
  },
];

export default function AboutPage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>About — ULTRON</title>
        <meta
          name="description"
          content="Why ULTRON is built the way it is, and the questions engineering teams ask us before deploying it."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Ambience />

      <div className={styles.content}>
        <header className={styles.pageHead}>
          <div className={styles.pageHeadInner}>
            <p className={styles.pageEyebrow}>About</p>
            <h1 className={styles.pageTitle}>Built by people who have been on the floor at 3am</h1>
            <p className={styles.pageLead}>
              ULTRON exists because the data needed to prevent a failure is almost always already
              being emitted — it is just scattered across systems that do not talk, in units that do
              not agree, at a resolution nobody keeps.
            </p>
            <span className={styles.pageRule} aria-hidden="true" />
          </div>
        </header>

        <section className={`${styles.section} ${styles.sectionTight}`}>
          <div className={styles.inner}>
            <div className={styles.prose}>
              <Reveal>
                <p>
                  Most monitoring projects fail the same way. A pilot proves the signal is there, the
                  rollout doubles the number of dashboards, and eighteen months later the plant is
                  looking at more screens than it was before and trusting none of them.
                </p>
                <p>
                  We took the opposite constraint as the starting point:{' '}
                  <strong>one number per asset, and the one instruction that follows from it</strong>
                  . Everything in the platform — the gateway, the measurement model, the scoring, the
                  forecasting — exists to make that single figure defensible.
                </p>
                <p>
                  That constraint is why the console shows the detractors next to the score, why the
                  models re-baseline against the plant they are actually running on, and why a
                  forecast is drawn with its spread rather than as a confident line. A figure an
                  operator cannot interrogate is a figure they will eventually ignore.
                </p>
              </Reveal>

              <div className={styles.principles}>
                {PRINCIPLES.map((principle, index) => (
                  <Reveal key={principle.title} delay={index * 80} className={styles.principle}>
                    <span className={styles.principleIndex}>
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <h2 className={styles.principleTitle}>{principle.title}</h2>
                    <p className={styles.principleBody}>{principle.body}</p>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className={`${styles.section} ${styles.ruled}`}>
          <div className={styles.inner}>
            <SectionHead
              eyebrow="FAQ"
              title="Questions engineering teams ask us"
              accentFrom={4}
              align="center"
            />
            <Faq />
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionTight}`}>
          <div className={styles.inner}>
            <Reveal>
              <div className={styles.contact}>
                <div className={styles.contactPanel}>
                  <h2 className={styles.contactHeading}>Still have a question?</h2>
                  <p className={styles.contactBody}>
                    The ones we cannot answer generically are usually the interesting ones. Send it
                    over and an engineer will reply.
                  </p>
                  <div className={styles.contactActions}>
                    <Button href="/contact">
                      Talk to an engineer
                      <Arrow />
                    </Button>
                    <Button href="mailto:hello@ultron.io" variant="ghost">
                      hello@ultron.io
                    </Button>
                  </div>
                </div>
                <div className={styles.contactPanel}>
                  <div className={styles.contactRows}>
                    <div className={styles.contactRow}>
                      <div className={styles.contactLabel}>Deployment</div>
                      <div className={styles.contactValue}>Your network, or ours</div>
                    </div>
                    <div className={styles.contactRow}>
                      <div className={styles.contactLabel}>Protocols</div>
                      <div className={styles.contactValue}>MQTT · Modbus · OPC UA · REST</div>
                    </div>
                    <div className={styles.contactRow}>
                      <div className={styles.contactLabel}>Time to first insight</div>
                      <div className={styles.contactValue}>About six weeks</div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
