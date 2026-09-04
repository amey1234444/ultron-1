// Contact.
//
// Moved off the landing page so the fold ends on the product rather than on a
// form. There is deliberately no contact form here: nothing in this codebase
// would receive one, and a field that silently drops what you typed is worse
// than an address you can actually write to.

import Head from 'next/head';

import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import { Arrow, Button, Reveal } from '../components/home/primitives';
import SiteNav from '../components/web/SiteNav';
import { useAuth } from '../context/AuthContext';

const DETAILS: { label: string; value: string; href?: string }[] = [
  { label: 'Email', value: 'hello@ultron.io', href: 'mailto:hello@ultron.io' },
  { label: 'Phone', value: '+1 (800) 555-1234', href: 'tel:+18005551234' },
  { label: 'HQ', value: '548 Market Street, San Francisco, CA 94104' },
  { label: 'Response time', value: 'Under one business day' },
];

const STEPS = [
  {
    title: 'A 30-minute call',
    body: 'What you run, what already reports, and which asset is costing you the most unplanned hours.',
  },
  {
    title: 'A mapped pilot asset',
    body: 'We take one machine end to end — gateway, channels, thresholds, score — so the value is measured rather than argued.',
  },
  {
    title: 'Your own numbers',
    body: 'A read on what the pilot would have caught over the last two quarters, against your own maintenance record.',
  },
];

export default function ContactPage() {
  const { user } = useAuth();

  return (
    <div className={styles.page}>
      <Head>
        <title>Contact — BlackGATE</title>
        <meta
          name="description"
          content="Talk to an engineer about deploying BlackGATE on your plant network, or request console access."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Ambience />

      <div className={styles.content}>
        <header className={styles.pageHead}>
          <div className={styles.pageHeadInner}>
            <p className={styles.pageEyebrow}>Contact</p>
            <h1 className={styles.pageTitle}>Talk to an engineer</h1>
            <p className={styles.pageLead}>
              Not a sales queue. The first conversation is with someone who has commissioned this on
              a plant floor, and it starts with your equipment rather than our slides.
            </p>
            <span className={styles.pageRule} aria-hidden="true" />
          </div>
        </header>

        <section className={`${styles.section} ${styles.sectionTight}`}>
          <div className={styles.inner}>
            <Reveal>
              <div className={styles.contact}>
                <div className={styles.contactPanel}>
                  <h2 className={styles.contactHeading}>
                    Ready to see your
                    <br />
                    machines think?
                  </h2>
                  <p className={styles.contactBody}>
                    Book a walkthrough, or sign in and stream your first channel today. Deployment
                    on your network or ours — the gateway does not need to reach the internet.
                  </p>
                  <div className={styles.contactActions}>
                    <Button href={user ? '/' : '/signup'}>
                      {user ? 'Open console' : 'Request access'}
                      <Arrow />
                    </Button>
                    <Button href="mailto:hello@ultron.io" variant="ghost">
                      Email us directly
                    </Button>
                  </div>
                </div>

                <div className={styles.contactPanel}>
                  <div className={styles.contactRows}>
                    {DETAILS.map((detail) => (
                      <div key={detail.label} className={styles.contactRow}>
                        <div className={styles.contactLabel}>{detail.label}</div>
                        {detail.href ? (
                          <a href={detail.href} className={styles.contactValue}>
                            {detail.value}
                          </a>
                        ) : (
                          <div className={styles.contactValue}>{detail.value}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionTight}`}>
          <div className={styles.inner}>
            <Reveal>
              <div className={styles.contact}>
                <div className={styles.contactPanel}>
                  <h2 className={styles.contactHeading}>What happens next</h2>
                  <p className={styles.contactBody}>
                    Three steps, in this order. Nothing is signed before the third one.
                  </p>
                </div>
                <div className={styles.contactPanel}>
                  <ol className={styles.steps}>
                    {STEPS.map((step) => (
                      <li key={step.title} className={styles.step}>
                        <h3 className={styles.stepTitle}>{step.title}</h3>
                        <p className={styles.stepBody}>{step.body}</p>
                      </li>
                    ))}
                  </ol>
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
