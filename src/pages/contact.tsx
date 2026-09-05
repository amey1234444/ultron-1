// /contact — talk to an engineer.
//
// There is a form, and it is honest about what it does: nothing in this
// codebase receives a POST, so the form composes the message and hands it to
// the reader's own mail client addressed to hello@ultron.io. Every field ends
// up in the e-mail body; nothing typed here is silently dropped. The address
// itself is printed beside the form for anyone who would rather just write.
//
// Hero → three conversation routes → the form with the details beside it →
// what happens next → the office.

import Head from 'next/head';
import { type FormEvent, useMemo, useState } from 'react';

import { COMPANY_ADDRESS_LINES, COMPANY_LEGAL_NAME } from '../../lib/company';
import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import { Arrow, Button, Reveal } from '../components/home/primitives';
import contact from '../components/pages/contact.module.css';
import {
  BronzeButton,
  GateMark,
  GridMark,
  InnerHead,
  PageHero,
  Plate,
  PlateWall,
  Timeline,
  WaveMark,
  innerStyles,
} from '../components/pages/inner';
import SiteNav from '../components/web/SiteNav';
import { useAuth } from '../context/AuthContext';

const EMAIL = 'hello@ultron.io';

type Topic = 'walkthrough' | 'pilot' | 'question' | 'access';

const TOPICS: { id: Topic; label: string; subject: string }[] = [
  { id: 'walkthrough', label: 'A walkthrough on our asset', subject: 'Walkthrough request' },
  { id: 'pilot', label: 'A pilot on one line', subject: 'Pilot on one line' },
  { id: 'question', label: 'A technical question', subject: 'Technical question' },
  { id: 'access', label: 'Console access', subject: 'Console access' },
];

const ROUTES = [
  {
    eyebrow: 'Walkthrough',
    title: 'Thirty minutes on your worst asset',
    body: 'Pick the machine the plant argues about. We map it to the points it already has and show you what the console would say — on a call, on your numbers.',
    topic: 'walkthrough' as Topic,
    mark: <WaveMark />,
  },
  {
    eyebrow: 'Pilot',
    title: 'One line, twelve months back',
    body: 'Bring a year of your maintenance log. We learn the line\'s baseline from its own history and read what would have been caught, before anyone signs anything.',
    topic: 'pilot' as Topic,
    mark: <GateMark />,
  },
  {
    eyebrow: 'Question',
    title: 'Ask the person who built it',
    body: 'Historian quirks, unit conversions, air-gapped sites, what the score is made of. The engineer who replies will have written the part you are asking about.',
    topic: 'question' as Topic,
    mark: <GridMark />,
  },
];

const NEXT = [
  {
    when: 'Day 0',
    title: 'You write',
    body: 'The form on this page, or a plain e-mail. Either lands with an engineer, not a queue.',
  },
  {
    when: '< 1 day',
    title: 'An engineer replies',
    body: 'With two or three questions about what you run, what already reports, and which asset costs the most unplanned hours.',
  },
  {
    when: 'Week 1',
    title: 'A 30-minute call',
    body: 'Your equipment rather than our slides. We leave with a list of the points one asset already emits.',
    hot: true,
  },
  {
    when: 'Week 2–3',
    title: 'A mapped pilot asset',
    body: 'One machine end to end — gateway, channels, baseline, score — so the value is measured rather than argued.',
  },
  {
    when: 'Week 6',
    title: 'Your own numbers',
    body: 'A read on what the pilot would have caught over the last two quarters, against your own maintenance record. Nothing is signed before this.',
    tag: 'Decision',
  },
];

function buildMailto(fields: {
  topic: Topic;
  name: string;
  company: string;
  role: string;
  email: string;
  message: string;
}) {
  const topic = TOPICS.find((t) => t.id === fields.topic) ?? TOPICS[0];
  const subject = `${topic.subject}${fields.company ? ` — ${fields.company}` : ''}`;
  const lines = [
    fields.message.trim(),
    '',
    '—',
    fields.name ? `Name: ${fields.name}` : null,
    fields.role ? `Role: ${fields.role}` : null,
    fields.company ? `Company: ${fields.company}` : null,
    fields.email ? `Reply to: ${fields.email}` : null,
    `Topic: ${topic.label}`,
  ].filter((line): line is string => line !== null);
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

export default function ContactPage() {
  const { user } = useAuth();
  const [topic, setTopic] = useState<Topic>('walkthrough');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const href = useMemo(
    () => buildMailto({ topic, name, company, role, email, message }),
    [topic, name, company, role, email, message],
  );

  const ready = name.trim().length > 0 && email.includes('@') && message.trim().length > 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready) return;
    window.location.href = href;
    setSent(true);
  }

  return (
    <div className={styles.page}>
      <Head>
        <title>Contact — BlackGATE</title>
        <meta
          name="description"
          content="Talk to an engineer about a walkthrough on your asset, a pilot on one line, or a technical question. Replies within one business day, from the people who built it."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Ambience />

      <div className={styles.content}>
        <PageHero
          eyebrow="Contact"
          meta="Replies within one business day"
          title="Talk to an *engineer*"
          lead="Not a sales queue. The first conversation is with someone who has commissioned this on a plant floor, and it starts with your equipment rather than our slides. Three ways in, below — or just write."
          facts={[
            { label: 'E-mail', value: EMAIL },
            { label: 'First reply', value: 'Under one business day' },
            { label: 'First call', value: '30 minutes, your asset' },
            { label: 'Signed before value', value: 'Nothing' },
          ]}
          actions={
            <>
              <BronzeButton href="#write">
                Write to us
                <Arrow />
              </BronzeButton>
              <Button href={user ? '/' : '/signup'} variant="ghost">
                {user ? 'Open console' : 'Request console access'}
              </Button>
            </>
          }
        />

        {/* Routes in. */}
        <section className={innerStyles.section}>
          <div className={innerStyles.inner}>
            <InnerHead
              eyebrow="Three ways in"
              title="Start with the *conversation* you actually want"
              lead="Each one pre-fills the form below. All three end up with the same engineers."
            />
            <PlateWall>
              {ROUTES.map((route, index) => (
                <Plate
                  key={route.topic}
                  tone={index === 1 ? 'bronze' : 'dark'}
                  span={4}
                  index={index + 1}
                  eyebrow={route.eyebrow}
                  title={route.title}
                  body={route.body}
                  delay={index * 90}
                  mark={route.mark}
                  foot={
                    <a
                      href="#write"
                      className={contact.routeLink}
                      onClick={() => setTopic(route.topic)}
                    >
                      Choose this
                      <Arrow size={14} />
                    </a>
                  }
                />
              ))}
            </PlateWall>
          </div>
        </section>

        {/* The form. */}
        <section id="write" className={contact.formBand}>
          <div className={innerStyles.inner}>
            <div className={contact.formGrid}>
              <div className={contact.formAside}>
                <Reveal>
                  <p className={contact.asideEyebrow}>Write</p>
                  <h2 className={contact.asideTitle}>Tell us about the asset</h2>
                  <p className={contact.asideBody}>
                    What you run, what already reports, and which machine costs the most unplanned
                    hours. The more specific the better — the interesting questions are the specific
                    ones.
                  </p>
                </Reveal>

                <Reveal delay={100}>
                  <dl className={contact.details}>
                    <div>
                      <dt>E-mail</dt>
                      <dd>
                        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
                      </dd>
                    </div>
                    <div>
                      <dt>Office</dt>
                      <dd>
                        {COMPANY_LEGAL_NAME}
                        <br />
                        {COMPANY_ADDRESS_LINES.map((line) => (
                          <span key={line}>
                            {line}
                            <br />
                          </span>
                        ))}
                      </dd>
                    </div>
                    <div>
                      <dt>Response</dt>
                      <dd>Under one business day, from an engineer</dd>
                    </div>
                  </dl>
                </Reveal>
              </div>

              <Reveal delay={60} className={contact.formWrap}>
                <form className={contact.form} onSubmit={onSubmit} noValidate>
                  <fieldset className={contact.topics}>
                    <legend className={contact.label}>What is this about</legend>
                    <div className={contact.topicRow}>
                      {TOPICS.map((option) => (
                        <label
                          key={option.id}
                          className={`${contact.topic} ${
                            topic === option.id ? contact.topicOn : ''
                          }`}
                        >
                          <input
                            type="radio"
                            name="topic"
                            value={option.id}
                            checked={topic === option.id}
                            onChange={() => setTopic(option.id)}
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className={contact.fields}>
                    <label className={contact.field}>
                      <span className={contact.label}>Name</span>
                      <input
                        type="text"
                        name="name"
                        autoComplete="name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Your name"
                        required
                      />
                    </label>
                    <label className={contact.field}>
                      <span className={contact.label}>Work e-mail</span>
                      <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="you@plant.example"
                        required
                      />
                    </label>
                    <label className={contact.field}>
                      <span className={contact.label}>Company</span>
                      <input
                        type="text"
                        name="company"
                        autoComplete="organization"
                        value={company}
                        onChange={(event) => setCompany(event.target.value)}
                        placeholder="Site or company"
                      />
                    </label>
                    <label className={contact.field}>
                      <span className={contact.label}>Role</span>
                      <input
                        type="text"
                        name="role"
                        autoComplete="organization-title"
                        value={role}
                        onChange={(event) => setRole(event.target.value)}
                        placeholder="Reliability engineer, plant director…"
                      />
                    </label>
                    <label className={`${contact.field} ${contact.fieldWide}`}>
                      <span className={contact.label}>The asset, and the question</span>
                      <textarea
                        name="message"
                        rows={6}
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Which machine, what it already reports (historian, PLC, protocol), and what you would want it to have told you."
                        required
                      />
                    </label>
                  </div>

                  <div className={contact.formFoot}>
                    <p className={contact.formNote}>
                      Sending opens your mail client with everything above addressed to{' '}
                      <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. Nothing is stored here.
                    </p>
                    <div className={contact.formActions}>
                      <button
                        type="submit"
                        className={innerStyles.btnBronze}
                        disabled={!ready}
                        aria-disabled={!ready}
                      >
                        {sent ? 'Opened in your mail client' : 'Send to an engineer'}
                        <Arrow />
                      </button>
                      <a href={href} className={contact.plainLink}>
                        Or open as a plain e-mail
                      </a>
                    </div>
                  </div>
                </form>
              </Reveal>
            </div>
          </div>
        </section>

        {/* What happens next. */}
        <section className={`${innerStyles.section} ${innerStyles.sectionRuled}`}>
          <div className={innerStyles.inner}>
            <div className={contact.nextGrid}>
              <div className={contact.nextSticky}>
                <InnerHead
                  eyebrow="What happens next"
                  title="Five steps, *nothing signed* before the fifth"
                  lead="In this order, every time. If a step does not earn the next one, it stops there — which is the point of starting on one line."
                  layout="stack"
                />
              </div>
              <Timeline items={NEXT} />
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
