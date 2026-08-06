import Head from 'next/head';
import { useState } from 'react';

import SignalField from '../components/home/SignalField';
import Signals from '../components/home/Signals';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import {
  Arrow,
  Button,
  Eyebrow,
  Reveal,
  SectionHead,
  useCountUp,
  useInView,
} from '../components/home/primitives';
import UltronHero from '../components/hero/UltronHero';
import SiteNav from '../components/web/SiteNav';
import { useAuth } from '../context/AuthContext';

const METRICS = [
  { value: 10, suffix: ' Hz', label: 'live telemetry' },
  { value: 6, suffix: '-level', label: 'asset hierarchy' },
  { value: 3, suffix: '-tier', label: 'access control' },
  { value: 1, prefix: '<', suffix: 's', label: 'trend refresh' },
];

const FAQS = [
  {
    q: 'Do we need new sensors to get started?',
    a: 'No. If your equipment already reports over MQTT, Modbus or OPC UA, the gateway can ingest it as-is. New sensors only make the health model sharper — they are not a prerequisite for going live.',
  },
  {
    q: 'How is the health score calculated?',
    a: 'It blends channel quality, alarm and danger threshold breaches, telemetry freshness and gateway availability into a single 0–100 figure. The biggest detractors are always listed alongside the number, so the score is auditable rather than a black box.',
  },
  {
    q: 'Can it run without internet access?',
    a: 'Yes. The gateway and console can be deployed entirely inside the plant network. The cloud console is optional and exists for multi-site rollups.',
  },
  {
    q: 'Who can create accounts?',
    a: 'Anyone can request one, but a super admin has to approve it before sign-in works. Roles are changeable at any time from the console, and every change is attributable.',
  },
];

function Metric({
  value,
  prefix,
  suffix,
  label,
  active,
}: {
  value: number;
  prefix?: string;
  suffix: string;
  label: string;
  active: boolean;
}) {
  const counted = useCountUp(value, active, 1400);
  return (
    <div className={styles.metric}>
      <div className={styles.metricValue}>
        {prefix}
        {Math.round(counted)}
        {suffix}
      </div>
      <div className={styles.metricLabel}>{label}</div>
    </div>
  );
}

function Metrics() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={styles.metrics}>
      {METRICS.map((metric) => (
        <Metric key={metric.label} {...metric} active={inView} />
      ))}
    </div>
  );
}

/**
 * Accordion.
 *
 * The panel animates on `grid-template-rows: 0fr → 1fr` rather than max-height,
 * so it opens to the answer's true height — no magic pixel ceiling that clips
 * longer copy.
 */
function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className={styles.faq}>
      {FAQS.map((faq, index) => {
        const isOpen = open === index;
        return (
          <Reveal key={faq.q} delay={index * 60}>
            <div className={`${styles.faqItem} ${isOpen ? styles.faqOpen : ''}`}>
              <button
                type="button"
                className={styles.faqButton}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${index}`}
                onClick={() => setOpen(isOpen ? null : index)}
              >
                {faq.q}
                <span className={styles.faqSign} aria-hidden="true" />
              </button>
              <div className={styles.faqPanel} id={`faq-panel-${index}`} role="region">
                <div className={styles.faqPanelInner}>
                  <p className={styles.faqAnswer}>{faq.a}</p>
                </div>
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const consoleHref = user ? '/' : '/login';

  return (
    <div className={styles.page}>
      <Head>
        <title>ULTRON — Machine health, in real time</title>
        <meta
          name="description"
          content="ULTRON turns plant telemetry into a single auditable health score per asset, and the one instruction that follows from it."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />

      <UltronHero />

      {/* Pinned noise → signal → decision sequence. Owns the `#signal` anchor. */}
      <SignalField />

      {/* Mirrored signal bands + the capability triptych, which owns `#platform`. */}
      <section className={`${styles.section} ${styles.ruled}`}>
        <div className={styles.inner}>
          <Signals />
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionTight}`}>
        <div className={styles.inner}>
          <Metrics />
        </div>
      </section>

      <section id="faq" className={styles.section}>
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

      <section id="contact" className={`${styles.section} ${styles.sectionTight}`}>
        <div className={styles.inner}>
          <Reveal>
            <div className={styles.cta}>
              <span className={styles.ctaGrid} aria-hidden="true" />
              <div>
                <Eyebrow>Get in touch</Eyebrow>
                <h2 className={styles.ctaTitle}>
                  Ready to see your
                  <br />
                  machines think?
                </h2>
                <p className={styles.ctaLead}>
                  Book a walkthrough with an engineer, or sign in and stream your first channel
                  today. Deployment on your network or ours.
                </p>
                <div className={styles.ctaActions}>
                  <Button href={consoleHref}>
                    {user ? 'Open console' : 'Get started'}
                    <Arrow />
                  </Button>
                  <Button href="mailto:hello@ultron.io" variant="ghost">
                    Talk to an engineer
                  </Button>
                </div>
              </div>

              <div className={styles.contactRows}>
                {[
                  { label: 'Email', value: 'hello@ultron.io', href: 'mailto:hello@ultron.io' },
                  { label: 'Phone', value: '+1 (800) 555-1234', href: 'tel:+18005551234' },
                  { label: 'Studio', value: 'San Francisco, CA · Remote-first' },
                  { label: 'Response time', value: 'Under one business day' },
                ].map((row) => (
                  <div key={row.label} className={styles.contactRow}>
                    <div className={styles.contactLabel}>{row.label}</div>
                    {row.href ? (
                      <a href={row.href} className={styles.contactValue}>
                        {row.value}
                      </a>
                    ) : (
                      <div className={styles.contactValue}>{row.value}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
