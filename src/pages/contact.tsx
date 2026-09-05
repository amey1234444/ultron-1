// /contact — talk to an engineer.
//
// There is a form, and it is honest about what it does: nothing in this
// codebase receives a POST, so the form composes the message and hands it to
// the reader's own mail client addressed to hello@ultron.io. Every field ends
// up in the e-mail body; nothing typed here is silently dropped. The address
// itself is printed beside the form for anyone who would rather just write.
//
// The page is the form. The routes-in plates and the five-step timeline that
// used to sit around it said in two screens what the topic chips and the reply
// time say in one line, and everything they carried is still reachable: the
// topics pre-fill the subject, and the office and address sit beside the form.

import Head from 'next/head';
import { type FormEvent, useMemo, useState } from 'react';

import { COMPANY_ADDRESS_LINES, COMPANY_LEGAL_NAME } from '../../lib/company';
import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import { Arrow, Button, Reveal } from '../components/home/primitives';
import contact from '../components/pages/contact.module.css';
import { innerStyles } from '../components/pages/inner';
import SiteNav from '../components/web/SiteNav';
import { useAuth } from '../context/AuthContext';

const EMAIL = 'hello@ultron.io';

type Topic = 'walkthrough' | 'pilot' | 'question' | 'access';

const TOPICS: { id: Topic; label: string; subject: string }[] = [
  { id: 'walkthrough', label: 'Walkthrough', subject: 'Walkthrough request' },
  { id: 'pilot', label: 'Pilot', subject: 'Pilot on one line' },
  { id: 'question', label: 'Technical question', subject: 'Technical question' },
  { id: 'access', label: 'Console access', subject: 'Console access' },
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
        {/* The form. */}
        <section id="write" className={contact.formBand}>
          <div className={innerStyles.inner}>
            <div className={contact.formGrid}>
              <div className={contact.formAside}>
                <Reveal>
                  <p className={contact.asideEyebrow}>Contact</p>
                  <h1 className={contact.asideTitle}>Let’s talk about<br />your machines.</h1>
                  <p className={contact.asideBody}>
                    A walkthrough, a pilot, or a technical question. Start here.
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
                      <dd>Within one business day</dd>
                    </div>
                  </dl>
                </Reveal>
                <Button href={user ? '/' : '/signup'} variant="ghost">
                  {user ? 'Open console' : 'Request console access'}<Arrow />
                </Button>
              </div>

              <Reveal delay={60} className={contact.formWrap}>
                <form className={contact.form} onSubmit={onSubmit}>
                  <fieldset className={contact.topics}>
                    <legend className={contact.label}>I’m interested in</legend>
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
                        placeholder="Your role (optional)"
                      />
                    </label>
                    <label className={`${contact.field} ${contact.fieldWide}`}>
                      <span className={contact.label}>How can we help?</span>
                      <textarea
                        name="message"
                        rows={4}
                        value={message}
                        onChange={(event) => setMessage(event.target.value)}
                        placeholder="Tell us about your equipment and what you need."
                        required
                      />
                    </label>
                  </div>

                  <div className={contact.formFoot}>
                    <p className={contact.formNote}>Opens your email app. Send the message there.</p>
                    <div className={contact.formActions}>
                      <button
                        type="submit"
                        className={innerStyles.btnBronze}
                        disabled={!ready}
                        aria-disabled={!ready}
                      >
                        Compose email
                        <Arrow />
                      </button>
                      {/* Always in the DOM so the announcement is heard when it
                          arrives, not when the region does. */}
                      <p className={contact.formNote} role="status">
                        {sent ? `Email draft opened. If it did not open, write to ${EMAIL}.` : ''}
                      </p>
                    </div>
                  </div>
                </form>
              </Reveal>
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
