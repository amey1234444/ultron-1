import Head from 'next/head';
import { useState, type ReactNode } from 'react';

import Bento from '../components/home/Bento';
import ContextFlow from '../components/home/ContextFlow';
import LiveConsole from '../components/home/LiveConsole';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import {
  Arrow,
  Button,
  Eyebrow,
  Reveal,
  SectionHead,
  SpotlightCard,
  useCountUp,
  useInView,
} from '../components/home/primitives';
import UltronHero from '../components/hero/UltronHero';
import SiteNav from '../components/web/SiteNav';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const PIPELINE = [
  {
    kicker: '01 · Connect',
    title: 'Wire up the gateway',
    body: 'Racks, cards and channels are described once. The gateway starts publishing measurements over MQTT within minutes.',
  },
  {
    kicker: '02 · Model',
    title: 'Map the plant',
    body: 'Projects, areas, machines and devices mirror the physical site, so every reading has a home in the hierarchy.',
  },
  {
    kicker: '03 · Monitor',
    title: 'Watch it live',
    body: 'The console streams state, alarms and quality flags in real time, with thresholds evaluated at the edge.',
  },
  {
    kicker: '04 · Act',
    title: 'Fix before failure',
    body: 'Health scores and ranked recommendations tell maintenance which asset to touch next, and exactly why.',
  },
];

const INDUSTRIES = [
  {
    title: 'Cement & mining',
    body: 'Crushers, mills and kiln drives running 24/7 on bearings that fail expensively.',
    metric: 'Continuous duty',
    icon: (
      <>
        <path d="M4 20h16" />
        <path d="M6 20V9l5-3v14" />
        <path d="M11 12h7v8" />
        <path d="M14.5 15.5h.01" />
      </>
    ),
  },
  {
    title: 'Power generation',
    body: 'Turbine and pump trains where the vibration signature is the earliest warning available.',
    metric: 'Sub-second alarms',
    icon: (
      <>
        <path d="M13 3 5 13.5h6L11 21l8-10.5h-6L13 3Z" />
      </>
    ),
  },
  {
    title: 'Chemical & process',
    body: 'Compressors and agitators monitored alongside temperature, pressure and flow.',
    metric: 'Multi-variable',
    icon: (
      <>
        <path d="M9 3v6.5L4.5 17A2.5 2.5 0 0 0 6.7 21h10.6a2.5 2.5 0 0 0 2.2-4L15 9.5V3" />
        <path d="M8 3h8" />
        <path d="M7 15h10" />
      </>
    ),
  },
  {
    title: 'Discrete manufacturing',
    body: 'Line-side motors and conveyors tracked per shift to protect throughput targets.',
    metric: 'OEE aware',
    icon: (
      <>
        <rect x="3" y="13" width="18" height="7" rx="2" />
        <circle cx="8" cy="20" r="1.4" />
        <circle cx="16" cy="20" r="1.4" />
        <path d="M7 13V8l4-3 4 3v5" />
      </>
    ),
  },
];

const PROTOCOLS = [
  'MQTT',
  'Modbus TCP',
  'Modbus RTU',
  'OPC UA',
  'REST',
  'WebSocket',
  'Webhooks',
  'CSV export',
  'SNMP traps',
];

const SECURITY = [
  'Role-based access with super-admin, admin and user tiers',
  'Server-side sessions with rate limiting on every auth route',
  'Admin-approved account provisioning — no open self-service access',
  'CAPTCHA-gated registration and anti-clickjacking headers',
  'Edge-first architecture: telemetry leaves the plant on one outbound channel',
];

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
  {
    q: 'How long does a deployment take?',
    a: 'A single line with an existing MQTT or Modbus source is typically streaming the same day. Modelling a full site hierarchy is the longer piece of work, and it can happen while data is already flowing.',
  },
];

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function Check() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IndustryIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Four numbered steps joined by a rail that sweeps in when the row appears. */
function Pipeline() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`${styles.pipeline} ${inView ? styles.pipelineVisible : ''}`}
    >
      <span className={styles.pipelineRail} aria-hidden="true">
        <span className={styles.pipelineRailFill} />
      </span>
      {PIPELINE.map((step, index) => (
        <Reveal key={step.title} delay={index * 90} className={styles.step}>
          <span
            className={styles.stepMarker}
            style={{ ['--step-delay' as string]: `${300 + index * 260}ms` }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          <span className={styles.stepKicker}>{step.kicker}</span>
          <h3 className={styles.stepTitle}>{step.title}</h3>
          <p className={styles.stepBody}>{step.body}</p>
        </Reveal>
      ))}
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  const { user } = useAuth();
  const consoleHref = user ? '/' : '/login';

  return (
    <div className={styles.page}>
      <Head>
        <title>ULTRON — Machine health, in real time</title>
        <meta
          name="description"
          content="ULTRON turns raw sensor telemetry into live dashboards and AI-driven failure prediction for rotating equipment — so your team fixes machines before they break."
        />
        <meta name="theme-color" content="#08090B" />
      </Head>

      <SiteNav />

      <UltronHero />

      {/* Pinned, scroll-scrubbed product explainer. Owns the `#product` anchor. */}
      <ContextFlow />

      {/* Feature bento */}
      <section id="platform" className={`${styles.section} ${styles.ruled}`}>
        <div className={styles.inner}>
          <SectionHead
            eyebrow="The platform"
            title="Everything you need to watch rotating equipment"
            accentFrom={4}
            lead="Five surfaces that cover the whole loop — from the raw channel arriving at the gateway to the work order that closes it out."
            align="center"
          />
          <Bento />
        </div>
      </section>

      {/* Live console */}
      <section id="console" className={styles.section}>
        <div className={styles.inner}>
          <SectionHead
            eyebrow="Live console"
            title="Streaming telemetry, exactly as operators see it"
            accentFrom={5}
            lead="One screen for the plant floor: normalised channels, a live health score and the alarms that matter — refreshed sub-second."
            align="center"
          />
          <LiveConsole />
        </div>
      </section>

      {/* Metrics band */}
      <section className={`${styles.section} ${styles.sectionTight}`}>
        <div className={styles.inner}>
          <Metrics />
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline" className={`${styles.section} ${styles.ruled}`}>
        <div className={styles.inner}>
          <SectionHead
            eyebrow="Deployment"
            title="From sensor to insight in four steps"
            accentFrom={5}
          />
          <Pipeline />
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className={styles.section}>
        <div className={styles.inner}>
          <SectionHead
            eyebrow="Who it's for"
            title="Built for the plants that can't stop"
            accentFrom={4}
            lead="Sites where an unplanned stop is measured in tonnes, not tickets."
          />
          <div className={styles.industries}>
            {INDUSTRIES.map((industry, index) => (
              <Reveal key={industry.title} delay={index * 80}>
                <SpotlightCard className={styles.industry}>
                  <span className={styles.industryIcon}>
                    <IndustryIcon>{industry.icon}</IndustryIcon>
                  </span>
                  <h3 className={styles.industryTitle}>{industry.title}</h3>
                  <p className={styles.industryBody}>{industry.body}</p>
                  <span className={styles.industryMetric}>{industry.metric}</span>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Connectivity + security */}
      <section id="security" className={styles.section}>
        <div className={styles.inner}>
          <SectionHead
            eyebrow="Trust"
            title="Fits the network you already have"
            accentFrom={3}
          />
          <div className={styles.split}>
            <Reveal>
              <SpotlightCard className={styles.panel} lift={false}>
                <Eyebrow>Connectivity</Eyebrow>
                <h3 className={styles.panelTitle}>Speaks your plant&apos;s protocols</h3>
                <div className={styles.chips}>
                  {PROTOCOLS.map((protocol) => (
                    <span key={protocol} className={styles.chip}>
                      {protocol}
                    </span>
                  ))}
                </div>
                <p className={styles.panelNote}>
                  Edge gateways normalise every reading into one measurement model, so a vibration
                  channel on a legacy PLC looks exactly like a modern MQTT sensor by the time it
                  reaches the console.
                </p>
              </SpotlightCard>
            </Reveal>

            <Reveal delay={90}>
              <SpotlightCard className={styles.panel} lift={false}>
                <Eyebrow>Security</Eyebrow>
                <h3 className={styles.panelTitle}>Built for OT networks</h3>
                <ul className={styles.checks}>
                  {SECURITY.map((item) => (
                    <li key={item} className={styles.check}>
                      <span className={styles.checkMark}>
                        <Check />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </SpotlightCard>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FAQ */}
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

      {/* Closing CTA */}
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
