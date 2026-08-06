// Feature bento.
//
// Each card carries a purpose-built visual instead of a generic icon, and each
// visual plays once when the grid scrolls into view. The whole grid shares a
// single IntersectionObserver: it flips one `visible` class and the CSS does the
// rest, so there is no per-card JavaScript and nothing keeps running after the
// animation has landed.

import styles from './Bento.module.css';
import { Reveal, SpotlightCard, useCountUp, useInView } from './primitives';

function VisualHead({ label, live }: { label: string; live?: string }) {
  return (
    <div className={styles.visualHead}>
      <span>{label}</span>
      {live && (
        <span className={styles.pill}>
          <span className={styles.pillDot} aria-hidden="true" />
          {live}
        </span>
      )}
    </div>
  );
}

/** A — measured history, then a dashed forecast running into a failure marker. */
function ForecastChart() {
  const history = 'M 0 96 C 34 92 52 78 84 80 S 132 64 168 70 S 214 52 248 58';
  const forecast = 'M 248 58 C 274 62 292 44 318 34 S 356 20 380 12';
  const area = `${history} L 248 130 L 0 130 Z`;

  return (
    <div className={styles.visual}>
      <VisualHead label="Bearing envelope · RAV-01" live="Streaming" />
      <svg className={styles.chart} viewBox="0 0 380 140" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="bentoArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--u-amber)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--u-amber)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[34, 68, 102].map((y) => (
          <line key={y} x1="0" y1={y} x2="380" y2={y} stroke="rgba(255,255,255,0.045)" strokeWidth="1" />
        ))}

        {/* The alarm threshold the forecast crosses — the point of the card. */}
        <line x1="0" y1="22" x2="380" y2="22" stroke="rgba(240,86,63,0.35)" strokeWidth="1" strokeDasharray="4 5" />

        <path className={styles.areaFade} d={area} fill="url(#bentoArea)" opacity="0" />
        <path
          className={`${styles.draw} ${styles.drawHistory}`}
          d={history}
          pathLength={1}
          fill="none"
          stroke="var(--u-amber)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className={`${styles.draw} ${styles.drawForecast}`}
          d={forecast}
          pathLength={1}
          fill="none"
          stroke="var(--u-violet-soft)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="1"
        />

        <g className={styles.marker} opacity="0">
          <circle className={styles.markerPulse} cx="380" cy="12" r="6" fill="var(--u-red)" />
          <circle cx="380" cy="12" r="4" fill="var(--u-red)" />
        </g>
      </svg>
      <div className={styles.chartLegend}>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ ['--swatch' as string]: 'var(--u-amber)' }} />
          Measured
        </span>
        <span className={styles.legendItem}>
          <span
            className={`${styles.legendSwatch} ${styles.legendDashed}`}
            style={{ ['--swatch' as string]: 'var(--u-violet-soft)' }}
          />
          Forecast
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ ['--swatch' as string]: 'var(--u-red)' }} />
          Alarm in 11d
        </span>
      </div>
    </div>
  );
}

const DETRACTORS = [
  { label: 'Vibration drift', value: 0.62, tone: 'var(--u-amber)' },
  { label: 'Telemetry gaps', value: 0.28, tone: 'var(--u-violet-soft)' },
];

/** B — the health ring, with the two figures actually dragging the score down. */
function HealthRing({ active }: { active: boolean }) {
  const score = useCountUp(92, active, 1600);

  return (
    <div className={styles.visual}>
      <VisualHead label="Health score" />
      <div className={styles.ringWrap}>
        <div className={styles.ring}>
          <svg width="104" height="104" viewBox="0 0 104 104" aria-hidden="true">
            <circle className={styles.ringTrack} cx="52" cy="52" r="40" fill="none" strokeWidth="7" />
            <circle
              className={styles.ringValue}
              cx="52"
              cy="52"
              r="40"
              fill="none"
              stroke="var(--u-green)"
              strokeWidth="7"
              strokeLinecap="round"
              transform="rotate(-90 52 52)"
            />
          </svg>
          <div className={styles.ringNumber}>
            <span className={styles.ringFigure}>{Math.round(score)}</span>
            <span className={styles.ringUnit}>of 100</span>
          </div>
        </div>

        <div className={styles.detractors}>
          {DETRACTORS.map((item, index) => (
            <div key={item.label} className={styles.detractor}>
              <span>{item.label}</span>
              <span className={styles.detractorBar}>
                <span
                  className={styles.detractorFill}
                  style={{
                    ['--bar-value' as string]: item.value,
                    ['--bar' as string]: item.tone,
                    ['--bar-delay' as string]: `${400 + index * 160}ms`,
                  }}
                />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TREE = [
  { label: 'Kiln line 2', depth: 0, badge: 'AREA', active: false },
  { label: 'Raw mill 04', depth: 1, badge: '6 CH', active: false },
  { label: 'Main drive motor', depth: 2, badge: 'OK', active: true },
  { label: 'Gearbox DE', depth: 2, badge: 'WATCH', active: false },
  { label: 'ID fan 11', depth: 1, badge: '4 CH', active: false },
];

/** C — the plant hierarchy, unfolding one level at a time. */
function AssetTree() {
  return (
    <div className={styles.visual}>
      <VisualHead label="Asset hierarchy" />
      <div className={styles.tree}>
        {TREE.map((row, index) => (
          <div
            key={row.label}
            data-depth={row.depth}
            className={`${styles.treeRow} ${row.active ? styles.treeRowActive : ''}`}
            style={{
              ['--depth' as string]: row.depth,
              ['--row-delay' as string]: `${index * 110}ms`,
            }}
          >
            <svg
              className={styles.treeGlyph}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {row.depth === 2 ? (
                <>
                  <circle cx="12" cy="12" r="3.2" />
                  <path d="M12 3v3.4M12 17.6V21M3 12h3.4M17.6 12H21" />
                </>
              ) : (
                <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4L11 7h7.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" />
              )}
            </svg>
            {row.label}
            <span className={styles.treeBadge}>{row.badge}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ROLES = [
  { initials: 'SA', name: 'Super admin', scope: 'All sites · billing', on: true, tint: 'rgba(110,91,242,0.2)', ink: 'var(--u-violet-soft)' },
  { initials: 'AD', name: 'Admin', scope: 'Site · users', on: true, tint: 'rgba(53,214,198,0.16)', ink: 'var(--u-cyan)' },
  { initials: 'US', name: 'User', scope: 'Read · acknowledge', on: false, tint: 'rgba(255,255,255,0.07)', ink: 'var(--u-ink-2)' },
];

/** D — the three access tiers, with their write permission as a toggle. */
function RoleStack() {
  return (
    <div className={styles.visual}>
      <VisualHead label="Access control" />
      <div className={styles.roles}>
        {ROLES.map((role, index) => (
          <div
            key={role.name}
            className={styles.role}
            style={{ ['--row-delay' as string]: `${index * 130}ms` }}
          >
            <span
              className={styles.roleAvatar}
              style={{ ['--avatar' as string]: role.tint, ['--avatar-ink' as string]: role.ink }}
            >
              {role.initials}
            </span>
            <span>
              <span className={styles.roleName}>{role.name}</span>
              <br />
              <span className={styles.roleScope}>{role.scope}</span>
            </span>
            <span
              className={`${styles.roleSwitch} ${role.on ? '' : styles.roleSwitchOff}`}
              style={{ ['--row-delay' as string]: `${300 + index * 130}ms` }}
              aria-hidden="true"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

const ALERTS = [
  { title: 'Danger threshold breached', meta: 'RAV-01 · Vibration', age: '2s', tone: 'var(--u-red)' },
  { title: 'Bearing temp trending up', meta: 'MILL-04 · Temperature', age: '48s', tone: 'var(--u-amber)' },
  { title: 'Gateway back online', meta: 'GW-KILN-2', age: '4m', tone: 'var(--u-green)' },
];

/** E — the alert feed, arriving newest first. */
function AlertFeed() {
  return (
    <div className={styles.visual}>
      <VisualHead label="Alert feed" live="Live" />
      <div className={styles.alerts}>
        {ALERTS.map((alert, index) => (
          <div
            key={alert.title}
            className={styles.alert}
            style={{ ['--tone' as string]: alert.tone, ['--row-delay' as string]: `${index * 140}ms` }}
          >
            <span className={styles.alertDot} aria-hidden="true" />
            <span>
              <span className={styles.alertTitle}>{alert.title}</span>
              <br />
              <span className={styles.alertMeta}>{alert.meta}</span>
            </span>
            <span className={styles.alertAge}>{alert.age}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Card({
  span,
  kicker,
  title,
  body,
  children,
  delay,
}: {
  span: 'wide' | 'half';
  kicker: string;
  title: string;
  body: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <Reveal
      delay={delay}
      className={span === 'wide' ? styles.spanWide : styles.spanHalf}
    >
      <SpotlightCard className={styles.card}>
        {children}
        <div className={styles.cardCopy}>
          <span className={styles.kicker}>{kicker}</span>
          <h3 className={styles.cardTitle}>{title}</h3>
          <p className={styles.cardBody}>{body}</p>
        </div>
      </SpotlightCard>
    </Reveal>
  );
}

export default function Bento() {
  // One observer for the whole grid. Every visual keys off the same class, so
  // they play as a single choreographed pass rather than five separate ones.
  const { ref, inView } = useInView<HTMLDivElement>('0px 0px -18% 0px');

  return (
    <div ref={ref} className={`${styles.bento} ${inView ? styles.visible : ''}`}>
      <Card
        span="wide"
        kicker="Predictive maintenance"
        title="See the failure before it happens"
        body="Health models project each channel forward and tell you which asset crosses its alarm threshold next — and how many days you have."
        delay={0}
      >
        <ForecastChart />
      </Card>

      <Card
        span="half"
        kicker="Scoring"
        title="One number, fully explained"
        body="Channel quality, threshold breaches, freshness and gateway uptime resolve to a single 0–100 score with its detractors named."
        delay={80}
      >
        <HealthRing active={inView} />
      </Card>

      <Card
        span="half"
        kicker="Modelling"
        title="A tree that matches the plant"
        body="Projects, areas, machines, racks and channels — six levels that mirror how the site is really wired."
        delay={0}
      >
        <AssetTree />
      </Card>

      <Card
        span="half"
        kicker="Governance"
        title="Three tiers, no grey areas"
        body="Super admin, admin and user. Accounts are provisioned by approval, and roles change from the console in seconds."
        delay={80}
      >
        <RoleStack />
      </Card>

      <Card
        span="half"
        kicker="Response"
        title="Alarms that reach a person"
        body="Thresholds are evaluated at the edge, so a breach is on someone's screen in under a second — not at the next poll."
        delay={160}
      >
        <AlertFeed />
      </Card>
    </div>
  );
}
