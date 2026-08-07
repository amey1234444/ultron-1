// FAQ accordion.
//
// Lives on /about rather than on the landing page: these are the questions an
// evaluator asks after they have decided the product is interesting, which is
// not the same moment as the fold.
//
// The panel animates on `grid-template-rows: 0fr → 1fr` rather than max-height,
// so it opens to the answer's true height — no magic pixel ceiling that clips
// longer copy.

import { useState } from 'react';

import styles from './Faq.module.css';
import { Reveal } from './primitives';

export const FAQS = [
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
    q: 'What happens to the data if we leave?',
    a: 'It is yours throughout. History exports to CSV or Parquet on demand, and the same REST and WebSocket interfaces the console uses are open to you, so nothing about the platform is a one-way door.',
  },
  {
    q: 'How long does a first deployment take?',
    a: 'A gateway on the network and a first asset mapped is usually the same day. Getting to a baseline the models trust takes a few weeks of normal running, because that is how long it takes the plant to show them what normal looks like.',
  },
];

export default function Faq({ items = FAQS }: { items?: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className={styles.faq}>
      {items.map((faq, index) => {
        const isOpen = open === index;
        return (
          <Reveal key={faq.q} delay={index * 55}>
            <div className={`${styles.item} ${isOpen ? styles.itemOpen : ''}`}>
              <button
                type="button"
                className={styles.button}
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${index}`}
                onClick={() => setOpen(isOpen ? null : index)}
              >
                <span className={styles.index}>{String(index + 1).padStart(2, '0')}</span>
                {faq.q}
                <span className={styles.sign} aria-hidden="true" />
              </button>
              <div className={styles.panel} id={`faq-panel-${index}`} role="region">
                <div className={styles.panelInner}>
                  <p className={styles.answer}>{faq.a}</p>
                </div>
              </div>
            </div>
          </Reveal>
        );
      })}
    </div>
  );
}
