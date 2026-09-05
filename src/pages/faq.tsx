// /faq — every question we get asked, grouped by who is asking.
//
// A sticky side index on the left tracks the group in view; the groups on the
// right are accordions. One item open per group, the first open by default so
// the page does not land as a wall of closed rows. Search filters across all
// groups; a group with no matches disappears from both the list and the index.

import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';

import Ambience from '../components/home/Ambience';
import SiteFooter from '../components/home/SiteFooter';
import styles from '../components/home/home.module.css';
import { Arrow, Button } from '../components/home/primitives';
import faq from '../components/pages/faq.module.css';
import { BronzeButton, CtaBand, PageHero, innerStyles } from '../components/pages/inner';
import SiteNav from '../components/web/SiteNav';

type Item = { q: string; a: string };
type Group = { id: string; label: string; who: string; items: Item[] };

const GROUPS: Group[] = [
  {
    id: 'starting',
    label: 'Getting started',
    who: 'Asked by the person who has to say yes to a pilot.',
    items: [
      {
        q: 'Do we need new sensors to get started?',
        a: 'No. If your equipment already reports over MQTT, Modbus or OPC UA, the gateway can ingest it as-is. New sensors only make the health model sharper — they are not a prerequisite for going live.',
      },
      {
        q: 'How long does a first deployment take?',
        a: 'A gateway on the network and a first asset mapped is usually the same day. Getting to a baseline the models trust takes a few weeks of normal running, because that is how long it takes the plant to show them what normal looks like. Northfield went from install to first finding in six weeks.',
      },
      {
        q: 'What does a pilot look like?',
        a: 'One production line — the one the plant argues about — mapped to the points that already exist. We learn its baseline from its own history, and show you what the console would have said over the last twelve months before anyone signs anything.',
      },
      {
        q: 'What if fewer than 80 per cent of our points are mapped?',
        a: 'The asset is held at CONFIGURATION_REQUIRED and the console names what is missing. It is never compared against another site\'s machine to fill the gap, and it does not count in any outcome figure until it is mapped.',
      },
    ],
  },
  {
    id: 'model',
    label: 'The model',
    who: 'Asked by the reliability engineer who has been burned before.',
    items: [
      {
        q: 'How is the health score calculated?',
        a: 'It blends channel quality, alarm and danger threshold breaches, telemetry freshness and gateway availability into a single 0–100 figure. The biggest detractors are always listed alongside the number, so the score is auditable rather than a black box.',
      },
      {
        q: 'Where do the limits come from?',
        a: 'From the asset\'s own healthy running, not from vendor defaults. A band is fitted per point once there is enough clean history, and re-fitted as the plant drifts — a new feedstock, a rebuilt bearing, a summer.',
      },
      {
        q: 'Will it give me a failure date?',
        a: 'A range, where the evidence can carry one: the trend has to be monotonic, long enough to fit, and consistent across the points that would move together. Everywhere else the finding is published without a date rather than with a confident one.',
      },
      {
        q: 'Can I see why it raised a finding?',
        a: 'Yes — every finding lists the points it was drawn from, their values at the time, and the limit each crossed. You can check them against the historian yourself, and disagree with the model using the same numbers it used.',
      },
      {
        q: 'Does it convert between units to match a limit?',
        a: 'No. A channel locks onto an instrument only when it measures what that instrument measures. A vibration in g stays in acceleration; it is never quietly integrated to mm/s so a velocity limit can be applied.',
      },
    ],
  },
  {
    id: 'deploy',
    label: 'Deployment & data',
    who: 'Asked by IT, OT and whoever owns the network diagram.',
    items: [
      {
        q: 'Can it run without internet access?',
        a: 'Yes. The gateway and console can be deployed entirely inside the plant network. Air-gapped sites receive model updates on media and send nothing out. The cloud console is optional and exists for multi-site rollups.',
      },
      {
        q: 'Where does it run?',
        a: 'On-premise on one industrial server, in your private cloud, or hosted by us. The console is the same in all three; the choice is yours and can change later.',
      },
      {
        q: 'What does it connect to?',
        a: 'Historians (OSIsoft PI, AVEVA, Honeywell PHD, Ignition), controllers directly over OPC-UA or Modbus TCP, and timed CSV or Parquet drops for sites that export rather than expose. Findings leave over webhook, e-mail or a CMMS work order.',
      },
      {
        q: 'What happens to the data if we leave?',
        a: 'It is yours throughout. History exports to CSV or Parquet on demand, the same REST and WebSocket interfaces the console uses are open to you, and on leaving the full history is handed back and our copy destroyed. Nothing about the platform is a one-way door.',
      },
    ],
  },
  {
    id: 'people',
    label: 'People & access',
    who: 'Asked by the plant director and the person who manages accounts.',
    items: [
      {
        q: 'Who can create accounts?',
        a: 'Anyone can request one, but a super admin has to approve it before sign-in works. Roles are changeable at any time from the console, and every change is attributable.',
      },
      {
        q: 'What roles are there?',
        a: 'Operator, engineer and reader. Operators act on instructions, engineers see the evidence behind them and can adjust mappings, readers see the morning list. SSO is supported where the site has it.',
      },
      {
        q: 'What does a plant director actually look at?',
        a: 'One line per asset: which component, how sure, and when to take it out. That list is the whole product from the director\'s chair; everything else exists to make those lines defensible.',
      },
      {
        q: 'Who do we talk to when something is wrong?',
        a: 'The engineer on your account, and then the founders. The person who replies will have built the thing you are asking about.',
      },
    ],
  },
];

function useActiveGroup(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const nodes = ids
      .map((id) => document.getElementById(`faq-${id}`))
      .filter((node): node is HTMLElement => node !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace('faq-', ''));
      },
      { rootMargin: '-25% 0px -60% 0px' },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function GroupAccordion({ group, query }: { group: Group; query: string }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id={`faq-${group.id}`} className={faq.group}>
      <div className={faq.groupHead}>
        <h2 className={faq.groupTitle}>{group.label}</h2>
        <p className={faq.groupWho}>{group.who}</p>
      </div>
      <div className={faq.list}>
        {group.items.map((item, index) => {
          const isOpen = open === index || query.length > 0;
          const id = `${group.id}-${index}`;
          return (
            <div key={item.q} className={`${faq.item} ${isOpen ? faq.itemOpen : ''}`}>
              <button
                type="button"
                className={faq.button}
                aria-expanded={isOpen}
                aria-controls={`panel-${id}`}
                onClick={() => setOpen(isOpen && !query ? null : index)}
              >
                <span className={faq.index}>{String(index + 1).padStart(2, '0')}</span>
                <span className={faq.question}>{item.q}</span>
                <span className={faq.sign} aria-hidden="true" />
              </button>
              <div className={faq.panel} id={`panel-${id}`} role="region">
                <div className={faq.panelInner}>
                  <p className={faq.answer}>{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function FaqPage() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return GROUPS;
    return GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.q.toLowerCase().includes(needle) || item.a.toLowerCase().includes(needle),
      ),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  const ids = useMemo(() => groups.map((group) => group.id), [groups]);
  const active = useActiveGroup(ids);
  const total = GROUPS.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className={styles.page}>
      <Head>
        <title>FAQ — BlackGATE</title>
        <meta
          name="description"
          content="Every question engineering teams ask us before deploying BlackGATE, grouped by who is asking: getting started, the model, deployment and data, people and access."
        />
        <meta name="theme-color" content="#0A0A0A" />
      </Head>

      <SiteNav />
      <Ambience />

      <div className={styles.content}>
        <PageHero
          eyebrow="FAQ"
          meta={`${total} questions · 4 groups`}
          title="Questions engineering teams *ask us*"
          lead="Grouped by who is asking. These are the questions that arrive after someone has decided the product is interesting and is now checking it against their own plant. If yours is not here, an engineer will answer it."
          actions={
            <>
              <BronzeButton href="#questions">
                Browse the questions
                <Arrow />
              </BronzeButton>
              <Button href="/contact" variant="ghost">
                Ask one of your own
              </Button>
            </>
          }
        />

        <section id="questions" className={innerStyles.section}>
          <div className={innerStyles.inner}>
            <div className={faq.layout}>
              <aside className={faq.side}>
                <div className={faq.sideSticky}>
                  <label className={faq.search}>
                    <span className={faq.searchIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                    </span>
                    <input
                      ref={inputRef}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search questions"
                      aria-label="Search questions"
                    />
                    {query ? (
                      <button
                        type="button"
                        className={faq.clear}
                        onClick={() => {
                          setQuery('');
                          inputRef.current?.focus();
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </label>

                  <p className={faq.sideLabel}>Index</p>
                  <nav aria-label="FAQ groups">
                    <ol className={faq.index}>
                      {GROUPS.map((group, position) => {
                        const shown = groups.find((g) => g.id === group.id);
                        return (
                          <li key={group.id}>
                            <a
                              href={`#faq-${group.id}`}
                              className={`${faq.indexLink} ${
                                active === group.id ? faq.indexActive : ''
                              } ${shown ? '' : faq.indexMuted}`}
                            >
                              <span className={faq.indexNum}>
                                {String(position + 1).padStart(2, '0')}
                              </span>
                              <span className={faq.indexLabel}>{group.label}</span>
                              <span className={faq.indexCount}>
                                {shown ? shown.items.length : 0}
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ol>
                  </nav>

                  <div className={faq.sideNote}>
                    <p className={faq.sideNoteTitle}>Not here?</p>
                    <p className={faq.sideNoteBody}>
                      The ones we cannot answer generically are usually the interesting ones.
                    </p>
                    <Button href="/contact" variant="ghost">
                      Ask an engineer
                      <Arrow />
                    </Button>
                  </div>
                </div>
              </aside>

              <div className={faq.groups}>
                {groups.length === 0 ? (
                  <div className={faq.empty}>
                    <p className={faq.emptyTitle}>Nothing matches &ldquo;{query}&rdquo;</p>
                    <p className={faq.emptyBody}>
                      Try a shorter word, or send the question over — it is probably one worth
                      adding.
                    </p>
                    <Button href={`mailto:hello@ultron.io?subject=${encodeURIComponent(`Question: ${query}`)}`}>
                      Send it to an engineer
                      <Arrow />
                    </Button>
                  </div>
                ) : (
                  groups.map((group) => (
                    <GroupAccordion key={group.id} group={group} query={query.trim()} />
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={innerStyles.section}>
          <div className={innerStyles.inner}>
            <CtaBand
              eyebrow="Still asking"
              ghost="04"
              title="The interesting questions are the *specific* ones"
              body="Tell us about the asset, the historian and the failure you are tired of. The engineer who replies will have built the part you are asking about."
              primary={{ href: '/contact', label: 'Talk to an engineer' }}
              secondary={{ href: '/capabilities', label: 'What it does, and does not' }}
            />
          </div>
        </section>

        <SiteFooter />
      </div>
    </div>
  );
}
