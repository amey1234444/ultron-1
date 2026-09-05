// Shared building blocks for the inner pages — capabilities, outcomes, about,
// FAQ and contact. The landing primitives (`Reveal`, `Button`, `Arrow`) are
// reused where they fit; what lives here is the chrome those pages share and
// the landing page does not have: the two-column hero, the plate wall, the
// stat strip, the definition rows, the timeline and the CTA band.

import Link from 'next/link';
import { Fragment, type CSSProperties, type ReactNode } from 'react';

import styles from './inner.module.css';
import { Arrow, Button, useInView } from '../home/primitives';

export { styles as innerStyles };

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export type HeroFact = { label: string; value: string };

/**
 * Headline with one run of words set in gold. `title` is split on `*` — the
 * segment between the asterisks is the emphasised one.
 */
export function GoldTitle({ text, className }: { text: string; className?: string }) {
  const parts = text.split('*');
  return (
    <span className={className}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className={styles.gold}>
            {part}
          </span>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </span>
  );
}

export function PageHero({
  eyebrow,
  meta,
  title,
  lead,
  facts,
  actions,
  align = 'left',
}: {
  eyebrow: string;
  meta?: string;
  /** `*word*` marks the gold run. */
  title: string;
  lead: string;
  facts?: HeroFact[];
  actions?: ReactNode;
  align?: 'left' | 'center';
}) {
  return (
    <header className={`${styles.hero} ${align === 'center' ? styles.heroCenter : ''}`}>
      <div className={styles.heroLight} aria-hidden="true" />
      <div className={styles.heroInner}>
        <div>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            {eyebrow}
            {meta ? <span className={styles.eyebrowMeta}>· {meta}</span> : null}
          </p>
          <h1 className={styles.heroTitle}>
            <GoldTitle text={title} />
          </h1>
          <p className={styles.heroLead}>{lead}</p>
          {actions ? <div className={styles.heroActions}>{actions}</div> : null}
        </div>
        {facts && facts.length > 0 ? (
          <dl className={styles.heroAside}>
            {facts.map((fact) => (
              <div key={fact.label} className={styles.heroFact}>
                <dt className={styles.heroFactLabel}>{fact.label}</dt>
                <dd className={styles.heroFactValue}>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Section head
// ---------------------------------------------------------------------------

export function InnerHead({
  eyebrow,
  title,
  lead,
  layout = 'split',
  more,
}: {
  eyebrow: string;
  /** `*word*` marks the gold run. */
  title: string;
  lead?: string;
  layout?: 'split' | 'stack' | 'center';
  more?: { href: string; label: string };
}) {
  const cls =
    layout === 'stack' ? styles.headStack : layout === 'center' ? styles.headCenter : '';
  return (
    <div className={`${styles.head} ${cls}`}>
      <div>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          {eyebrow}
        </p>
        <h2 className={styles.headTitle}>
          <GoldTitle text={title} />
        </h2>
        {layout !== 'split' && lead ? <p className={styles.headLead}>{lead}</p> : null}
      </div>
      {layout === 'split' && (lead || more) ? (
        <div>
          {lead ? <p className={styles.headLead}>{lead}</p> : null}
          {more ? (
            <p style={{ margin: lead ? '16px 0 0' : 0 }}>
              <Link href={more.href} className={styles.more}>
                {more.label}
                <Arrow size={14} />
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plates
// ---------------------------------------------------------------------------

export type PlateTone = 'dark' | 'paper' | 'bronze';

/** Grid of plates. Reveals children as a group so the wall arrives together. */
export function PlateWall({ children, className }: { children: ReactNode; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -10% 0px');
  return (
    <div
      ref={ref}
      className={`${styles.plates} ${inView ? styles.shown : ''} ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

export function Plate({
  tone = 'dark',
  span = 4,
  index,
  eyebrow,
  title,
  body,
  children,
  foot,
  mark,
  delay = 0,
  className,
  style,
}: {
  tone?: PlateTone;
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 12;
  index?: number;
  eyebrow?: string;
  title?: string;
  body?: string;
  children?: ReactNode;
  foot?: ReactNode;
  mark?: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const toneCls =
    tone === 'paper' ? styles.platePaper : tone === 'bronze' ? styles.plateBronze : styles.plateDark;
  const spanCls = styles[`span${span}` as keyof typeof styles];
  return (
    <article
      className={`${styles.plate} ${toneCls} ${spanCls} ${className ?? ''}`}
      style={{ ...style, ['--delay' as string]: `${delay}ms` }}
    >
      {mark ? (
        <div className={styles.plateMark} aria-hidden="true">
          {mark}
        </div>
      ) : null}
      {eyebrow || index !== undefined ? (
        <div className={styles.plateHead}>
          {eyebrow ? <p className={styles.plateEyebrow}>{eyebrow}</p> : <span />}
          {index !== undefined ? (
            <span className={styles.plateIndex}>{String(index).padStart(2, '0')}</span>
          ) : null}
        </div>
      ) : null}
      {title ? <h3 className={styles.plateTitle}>{title}</h3> : null}
      {body ? <p className={styles.plateBody}>{body}</p> : null}
      {children}
      {foot ? <div className={styles.plateFoot}>{foot}</div> : null}
    </article>
  );
}

export function QuotePlate({
  tone,
  span = 4,
  quote,
  name,
  role,
  delay,
  mark,
}: {
  tone: PlateTone;
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 12;
  quote: string;
  name: string;
  role: string;
  delay?: number;
  mark?: ReactNode;
}) {
  return (
    <Plate
      tone={tone}
      span={span}
      delay={delay}
      mark={mark}
      foot={
        <p className={styles.plateWho}>
          <b>{name}</b>
          <span className={styles.plateWhoSep} aria-hidden="true" />
          {role}
        </p>
      }
    >
      <blockquote style={{ margin: 0 }}>
        <p className={styles.plateQuote}>{quote}</p>
      </blockquote>
    </Plate>
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export type Stat = { value: string; unit?: string; label: string };

export function StatStrip({ items }: { items: Stat[] }) {
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -10% 0px');
  return (
    <div ref={ref} className={`${styles.stats} ${inView ? styles.shown : ''}`}>
      {items.map((stat, index) => (
        <div
          key={stat.label}
          className={styles.stat}
          style={{ ['--delay' as string]: `${index * 80}ms` }}
        >
          <p className={styles.statValue}>
            {stat.value}
            {stat.unit ? <span className={styles.statUnit}>{stat.unit}</span> : null}
          </p>
          <p className={styles.statLabel}>{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Definition rows
// ---------------------------------------------------------------------------

export type Row = { term: string; detail: ReactNode };

export function Rows({ items, numbered = true }: { items: Row[]; numbered?: boolean }) {
  const { ref, inView } = useInView<HTMLDListElement>('0px 0px -10% 0px');
  return (
    <dl ref={ref} className={`${styles.rows} ${inView ? styles.shown : ''}`}>
      {items.map((row, index) => (
        <div
          key={row.term}
          className={styles.row}
          style={{ ['--delay' as string]: `${index * 70}ms` }}
        >
          <dt className={styles.rowTerm}>
            {numbered ? (
              <span className={styles.rowIndex}>{String(index + 1).padStart(2, '0')}</span>
            ) : null}
            {row.term}
          </dt>
          <dd className={styles.rowDetail}>{row.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type Tick = { when: string; title: string; body: string; tag?: string; hot?: boolean };

export function Timeline({ items }: { items: Tick[] }) {
  const { ref, inView } = useInView<HTMLOListElement>('0px 0px -10% 0px');
  return (
    <ol ref={ref} className={`${styles.timeline} ${inView ? styles.shown : ''}`}>
      {items.map((tick, index) => (
        <li
          key={`${tick.when}-${tick.title}`}
          className={`${styles.tick} ${tick.hot ? styles.tickHot : ''}`}
          style={{ ['--delay' as string]: `${index * 80}ms` }}
        >
          <p className={styles.tickWhen}>{tick.when}</p>
          <div>
            <h3 className={styles.tickTitle}>
              {tick.title}
              {tick.tag ? <span className={styles.tickTag}>{tick.tag}</span> : null}
            </h3>
            <p className={styles.tickBody}>{tick.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Pull quote
// ---------------------------------------------------------------------------

export function PullQuote({ children, who }: { children: ReactNode; who?: string }) {
  return (
    <figure className={styles.pull}>
      <blockquote style={{ margin: 0 }}>
        <p className={styles.pullText}>{children}</p>
      </blockquote>
      {who ? <figcaption className={styles.pullWho}>{who}</figcaption> : null}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// CTA band
// ---------------------------------------------------------------------------

export function BronzeButton({
  href,
  children,
  external,
}: {
  href: string;
  children: ReactNode;
  external?: boolean;
}) {
  if (external || href.startsWith('mailto:') || href.startsWith('http')) {
    return (
      <a href={href} className={styles.btnBronze}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={styles.btnBronze}>
      {children}
    </Link>
  );
}

export function CtaBand({
  eyebrow,
  title,
  body,
  ghost,
  primary,
  secondary,
}: {
  eyebrow: string;
  title: string;
  body: string;
  ghost: string;
  primary: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <div className={styles.cta}>
      <span className={styles.ctaGhost} aria-hidden="true">
        {ghost}
      </span>
      <div className={styles.ctaCopy}>
        <p className={styles.eyebrow}>
          <span className={styles.eyebrowDot} aria-hidden="true" />
          {eyebrow}
        </p>
        <h2 className={styles.ctaTitle}>
          <GoldTitle text={title} />
        </h2>
        <p className={styles.ctaBody}>{body}</p>
      </div>
      <div className={styles.ctaActions}>
        <BronzeButton href={primary.href}>
          {primary.label}
          <Arrow />
        </BronzeButton>
        {secondary ? (
          <Button href={secondary.href} variant="ghost">
            {secondary.label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marks — abstract glyphs for plate corners. Shapes, never logos.
// ---------------------------------------------------------------------------

export function RingsMark() {
  return (
    <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="6">
      <circle cx="100" cy="100" r="90" />
      <circle cx="100" cy="100" r="62" />
      <circle cx="100" cy="100" r="34" />
    </svg>
  );
}

export function GateMark() {
  return (
    <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="7">
      <path d="M30 170V70a70 70 0 0 1 140 0v100" />
      <path d="M62 170V78a38 38 0 0 1 76 0v92" />
      <path d="M100 170v-40" />
    </svg>
  );
}

export function WaveMark() {
  return (
    <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="6">
      <path d="M0 100c25-40 50-40 75 0s50 40 75 0 50-40 75 0" />
      <path d="M0 140c25-40 50-40 75 0s50 40 75 0 50-40 75 0" opacity=".6" />
      <path d="M0 60c25-40 50-40 75 0s50 40 75 0 50-40 75 0" opacity=".6" />
    </svg>
  );
}

export function GridMark() {
  return (
    <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="5">
      <path d="M20 20h160v160H20z" />
      <path d="M20 80h160M20 140h160M80 20v160M140 20v160" />
    </svg>
  );
}
