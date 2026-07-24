import Link from 'next/link';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';

import { useAuth } from '../context/AuthContext';

const GOLD = '#C9A15C';
const BG = '#0A0A0A';
const INK = '#F5F5F5';
const MUTED = '#8A8A8A';
const BLUE = '#58A6FF';
const GREEN = '#3FB950';

// Landing-page typography — DM Sans for body/headings and Bebas Neue as the
// tall condensed display face, mirroring oswarteck.com. Loaded via Google Fonts
// in _document.tsx (falls back to the bundled faces / system fonts).
const FONT_DISPLAY = "'Bebas Neue', 'Space Grotesk', SpaceGrotesk_600SemiBold, system-ui, sans-serif";
const FONT_HEAD = "'Sora', 'Space Grotesk', SpaceGrotesk_600SemiBold, system-ui, sans-serif";
const FONT_BODY = "'Sora', 'DM Sans', Inter_400Regular, system-ui, sans-serif";
const FONT_MED = "'Sora', 'DM Sans', Inter_500Medium, system-ui, sans-serif";
const FONT_MONO = 'IBMPlexMono_400Regular, ui-monospace, monospace';

// Fades a block up into place the first time it scrolls into view.
function Reveal({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.7s ease ${delay}ms, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Pointer-reactive 3D tilt wrapper. The card leans toward the cursor and, when
// `grow` is set, scales up on hover — used for the live-dashboard KPI cards.
function TiltCard({
  children,
  grow = false,
  max = 12,
  style,
}: {
  children: ReactNode;
  grow?: boolean;
  max?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, active: false });

  const onMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -py * max, ry: px * max, active: true });
  };
  const reset = () => setTilt({ rx: 0, ry: 0, active: false });

  const scale = tilt.active && grow ? 1.06 : 1;
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={reset}
      style={{
        transform: `perspective(700px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${scale})`,
        transformStyle: 'preserve-3d',
        transition: tilt.active ? 'transform 0.08s linear' : 'transform 0.4s cubic-bezier(0.22,1,0.36,1)',
        cursor: 'pointer',
        willChange: 'transform',
        zIndex: tilt.active ? 2 : 1,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Icon({ paths }: { paths: ReactNode }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  );
}

const FEATURES = [
  {
    icon: <Icon paths={<><path d="M3 12h4l3 8 4-16 3 8h4" /></>} />,
    title: 'Predictive maintenance',
    body: 'AI health scores surface failing bearings, misalignment and imbalance before they take a line down.',
  },
  {
    icon: <Icon paths={<><path d="M3 3v18h18" /><path d="M7 14l3-4 4 3 4-7" /></>} />,
    title: 'Real-time trends',
    body: 'Every mapped channel streams onto one smooth, comparable chart — filter by type, toggle any series.',
  },
  {
    icon: (
      <Icon
        paths={
          <>
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <path d="M6.5 10v4h11" />
          </>
        }
      />
    ),
    title: 'Asset hierarchy',
    body: 'Model plants, areas, machines and racks in a clean tree that mirrors the way your site is really wired.',
  },
  {
    icon: <Icon paths={<><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" /></>} />,
    title: 'Role-based access',
    body: 'Super-admin, admin and user tiers keep control tight — add, edit and remove any account in seconds.',
  },
];

const STATS = [
  { value: '10 Hz', label: 'live telemetry' },
  { value: '6-level', label: 'asset hierarchy' },
  { value: '3-tier', label: 'access control' },
  { value: '<1s', label: 'trend refresh' },
];

export default function HomePage() {
  const { user } = useAuth();
  const consoleHref = user ? '/' : '/login';
  const consoleLabel = user ? 'Open console' : 'Sign in';
  const [pointer, setPointer] = useState({ x: 50, y: 34 });
  const handleHeroMove = (event: ReactMouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPointer({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  };

  // Scroll-driven perspective on the hero dashboard — it starts tilted back
  // (like Gigaton's product hero) and straightens as you scroll into the page.
  const [scrollProgress, setScrollProgress] = useState(0);
  // Whether the page has scrolled past the top — drives the oswarteck-style nav
  // that starts transparent and condenses into a frosted-glass bar on scroll.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const p = Math.min(1, window.scrollY / 520);
      setScrollProgress(p);
      setScrolled(window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const tilt = 20 * (1 - scrollProgress);
  const lift = 40 * (1 - scrollProgress);
  const pointerTiltX = (pointer.y - 50) * 0.04;
  const pointerTiltY = (50 - pointer.x) * 0.04;
  const pointerShiftX = (pointer.x - 50) * 0.18;
  const pointerShiftY = (pointer.y - 50) * 0.18;

  return (
    <div style={{ background: BG, color: INK, minHeight: '100vh', fontFamily: FONT_BODY, overflowX: 'hidden' }}>
      <style>{keyframes}</style>

      {/* Nav */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: scrolled ? '11px clamp(20px, 6vw, 72px)' : '18px clamp(20px, 6vw, 72px)',
          // Glassy from the very top: a lighter, more transparent frosted panel at
          // rest that condenses into a denser frosted bar once you scroll.
          backdropFilter: scrolled ? 'blur(22px) saturate(180%)' : 'blur(14px) saturate(150%)',
          WebkitBackdropFilter: scrolled ? 'blur(22px) saturate(180%)' : 'blur(14px) saturate(150%)',
          background: scrolled
            ? 'linear-gradient(180deg, rgba(20,20,20,0.78), rgba(10,10,10,0.52))'
            : 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.03) 55%, rgba(201,161,92,0.06))',
          borderBottom: `1px solid ${scrolled ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.10)'}`,
          // A bright hairline top highlight + soft glow gives the glass a glossy,
          // reflective sheen even at rest (when the near-black hero sits behind it);
          // the drop shadow deepens on scroll to lift the bar off the page.
          boxShadow: scrolled
            ? '0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 30px rgba(0,0,0,0.32)'
            : '0 1px 0 rgba(255,255,255,0.14) inset, 0 -1px 0 rgba(201,161,92,0.10) inset, 0 6px 24px rgba(0,0,0,0.18)',
          transition:
            'padding 0.35s cubic-bezier(0.22,1,0.36,1), background 0.4s ease, backdrop-filter 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease',
        }}
      >
        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 26, letterSpacing: '0.28em' }}>ULTRON</span>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <a href="#features" style={navLink} className="ultron-navlink">
            Features
          </a>
          <a href="#dashboard" style={navLink} className="ultron-navlink">
            Dashboard
          </a>
          <a href="#contact" style={navLink} className="ultron-navlink">
            Contact
          </a>
          <Link
            href={consoleHref}
            style={{
              fontFamily: FONT_MED,
              fontSize: 14,
              color: BG,
              background: INK,
              padding: '9px 18px',
              borderRadius: 10,
              textDecoration: 'none',
            }}
          >
            {consoleLabel}
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section
        onMouseMove={handleHeroMove}
        onMouseLeave={() => setPointer({ x: 50, y: 34 })}
        style={{
          position: 'relative',
          padding: 'clamp(64px, 10vw, 130px) clamp(20px, 6vw, 72px) clamp(24px, 4vw, 48px)',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        {/* animated backdrop */}
        <div aria-hidden style={{ ...heroGrid, backgroundPosition: `${pointerShiftX}px ${pointerShiftY}px` }} />
        <div
          aria-hidden
          style={{
            ...heroSpotlight,
            background: `radial-gradient(circle at ${pointer.x}% ${pointer.y}%, rgba(201,161,92,0.28), rgba(88,166,255,0.13) 32%, transparent 64%)`,
          }}
        />
        <div
          aria-hidden
          style={{
            ...orb,
            top: '-140px',
            left: '-120px',
            background: 'rgba(201,161,92,0.22)',
            transform: `translate3d(${pointerShiftX}px, ${pointerShiftY}px, 0)`,
          }}
        />
        <div
          aria-hidden
          style={{
            ...orb,
            bottom: '-160px',
            right: '-120px',
            background: 'rgba(88,166,255,0.16)',
            animationDelay: '3s',
            transform: `translate3d(${-pointerShiftX}px, ${-pointerShiftY}px, 0)`,
          }}
        />

        <div style={{ position: 'relative', maxWidth: 920, margin: '0 auto' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid rgba(201,161,92,0.4)',
              color: GOLD,
              fontFamily: FONT_MONO,
              fontSize: 12,
              letterSpacing: '0.14em',
              opacity: 0,
              animation: 'fadeUp 0.8s ease 0.05s forwards',
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 999, background: GOLD, animation: 'pulse 2s infinite' }} />
            INDUSTRIAL IOT · PREDICTIVE MAINTENANCE
          </div>

          <h1
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: 'clamp(48px, 8vw, 96px)',
              lineHeight: 0.98,
              margin: '26px 0 0',
              letterSpacing: '0.01em',
              opacity: 0,
              animation: 'fadeUp 0.9s cubic-bezier(0.22,1,0.36,1) 0.15s forwards',
            }}
          >
            Machine health,{' '}
            <span
              style={{
                background: `linear-gradient(110deg, ${GOLD}, #F0D9A8, ${GOLD})`,
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
                animation: 'shimmer 5s linear infinite',
              }}
            >
              in real time
            </span>
          </h1>

          <p
            style={{
              maxWidth: 620,
              margin: '22px auto 0',
              fontSize: 'clamp(16px, 2vw, 19px)',
              lineHeight: 1.6,
              color: MUTED,
              opacity: 0,
              animation: 'fadeUp 0.9s ease 0.3s forwards',
            }}
          >
            ULTRON turns raw sensor telemetry into live dashboards and AI-driven failure prediction — so you fix machines
            before they break, not after.
          </p>

          <div
            style={{
              display: 'flex',
              gap: 14,
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginTop: 36,
              opacity: 0,
              animation: 'fadeUp 0.9s ease 0.45s forwards',
            }}
          >
            <Link href={consoleHref} style={{ ...ctaPrimary }}>
              {user ? 'Open console →' : 'Launch console →'}
            </Link>
            <a href="#dashboard" style={{ ...ctaGhost }}>
              See it live
            </a>
          </div>
        </div>

        {/* Animated live dashboard — the Gigaton-style product hero. Tilts back
            in 3D and straightens on scroll. */}
        <div
          id="dashboard"
          style={{
            perspective: 1600,
            maxWidth: 1080,
            margin: '56px auto 0',
            opacity: 0,
            animation: 'fadeUp 1s ease 0.6s forwards',
            scrollMarginTop: 90,
          }}
        >
          <div
            style={{
              transform: `rotateX(${tilt + pointerTiltX}deg) rotateY(${pointerTiltY}deg) translateY(${lift}px)`,
              transformStyle: 'preserve-3d',
              transition: 'transform 0.15s linear',
              willChange: 'transform',
            }}
          >
            <LiveDashboard />
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ padding: 'clamp(48px, 8vw, 90px) clamp(20px, 6vw, 72px) 0' }}>
        <Reveal>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 1,
              maxWidth: 1000,
              margin: '0 auto',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 18,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.08)',
            }}
          >
            {STATS.map((s) => (
              <div key={s.label} style={{ background: '#0E0E0E', padding: '26px 20px', textAlign: 'center' }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 40, color: GOLD }}>{s.value}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: MUTED, marginTop: 6, letterSpacing: '0.08em' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: 'clamp(80px, 12vw, 140px) clamp(20px, 6vw, 72px)', scrollMarginTop: 70 }}>
        <Reveal>
          <div style={{ textAlign: 'center', maxWidth: 700, margin: '0 auto 56px' }}>
            <div style={sectionKicker}>WHAT IT DOES</div>
            <h2 style={sectionTitle}>Everything you need to monitor rotating equipment</h2>
          </div>
        </Reveal>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 18,
            maxWidth: 1080,
            margin: '0 auto',
          }}
        >
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 90}>
              <div style={featureCard} className="ultron-card">
                <div style={featureIcon}>{f.icon}</div>
                <h3 style={{ fontFamily: FONT_HEAD, fontSize: 20, margin: '18px 0 8px' }}>{f.title}</h3>
                <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.6, margin: 0 }}>{f.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Showcase band */}
      <section style={{ padding: '0 clamp(20px, 6vw, 72px) clamp(80px, 12vw, 140px)' }}>
        <Reveal>
          <div
            style={{
              maxWidth: 1080,
              margin: '0 auto',
              borderRadius: 24,
              padding: 'clamp(32px, 6vw, 64px)',
              background: 'radial-gradient(120% 120% at 0% 0%, rgba(201,161,92,0.14), transparent 55%), #0E0E0E',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 40,
              alignItems: 'center',
            }}
          >
            <div>
              <div style={sectionKicker}>LIVE TRENDS</div>
              <h2 style={{ ...sectionTitle, textAlign: 'left' }}>Every channel, one smooth chart</h2>
              <p style={{ color: MUTED, fontSize: 16, lineHeight: 1.7 }}>
                Overlay temperature, vibration, pressure and more on a single normalised graph. Filter by measurement
                type from a dropdown, and toggle any series on or off straight from the legend.
              </p>
            </div>
            <MiniChart />
          </div>
        </Reveal>
      </section>

      {/* Footer CTA */}
      <section style={{ padding: '0 clamp(20px, 6vw, 72px) clamp(70px, 10vw, 120px)', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 'clamp(34px, 5.5vw, 60px)', letterSpacing: '0.01em' }}>
            Ready to see your machines think?
          </h2>
          <div style={{ marginTop: 28 }}>
            <Link href={consoleHref} style={ctaPrimary}>
              {user ? 'Open console →' : 'Get started →'}
            </Link>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live, animated product dashboard shown in the hero.
// ---------------------------------------------------------------------------

const CHART_POINTS = 44;

function LiveDashboard() {
  // Streaming series that scroll left, plus a couple of live KPI values and a
  // health gauge — all driven by one interval so the whole panel feels alive.
  const [series, setSeries] = useState<number[]>(() =>
    Array.from({ length: CHART_POINTS }, (_, i) => 50 + Math.sin(i / 3) * 18),
  );
  const [series2, setSeries2] = useState<number[]>(() =>
    Array.from({ length: CHART_POINTS }, (_, i) => 40 + Math.cos(i / 4) * 12),
  );
  const [vib, setVib] = useState(3.1);
  const [temp, setTemp] = useState(61);
  const [rpm, setRpm] = useState(1480);
  const [health, setHealth] = useState(92);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setSeries((prev) => {
        const next = prev.slice(1);
        const last = prev[prev.length - 1];
        next.push(Math.max(10, Math.min(90, last + (Math.random() - 0.5) * 16)));
        return next;
      });
      setSeries2((prev) => {
        const next = prev.slice(1);
        const last = prev[prev.length - 1];
        next.push(Math.max(8, Math.min(80, last + (Math.random() - 0.5) * 12)));
        return next;
      });
      setVib((v) => +(Math.max(1.5, Math.min(6, v + (Math.random() - 0.5) * 0.5)).toFixed(2)));
      setTemp((t) => Math.round(Math.max(52, Math.min(74, t + (Math.random() - 0.5) * 2))));
      setRpm((r) => Math.round(Math.max(1440, Math.min(1520, r + (Math.random() - 0.5) * 14))));
      setHealth((h) => Math.round(Math.max(78, Math.min(99, h + (Math.random() - 0.5) * 3))));
    }, 1100);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'linear-gradient(180deg, #101010, #0B0B0B)',
        boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,161,92,0.06)',
      }}
    >
      {/* window chrome */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <span style={{ width: 11, height: 11, borderRadius: 999, background: '#EF4444' }} />
        <span style={{ width: 11, height: 11, borderRadius: 999, background: '#F2A93B' }} />
        <span style={{ width: 11, height: 11, borderRadius: 999, background: GREEN }} />
        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: MUTED, marginLeft: 10 }}>ULTRON · RAV-01 · Live</span>
        <span
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: GREEN,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 999, background: GREEN, animation: 'pulse 1.6s infinite' }} />
          STREAMING
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 0 }}>
        {/* main chart column */}
        <div style={{ padding: 18, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontFamily: FONT_MED, fontSize: 13, color: INK }}>Vibration &amp; temperature</span>
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: MUTED }}>last 60s</span>
          </div>
          <TiltCard max={8}>
            <StreamChart series={series} series2={series2} />
          </TiltCard>
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <Legend color={GOLD} label="Vibration" />
            <Legend color={BLUE} label="Temperature" />
          </div>

          {/* animated capacity bars */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 18 }}>
            {[0, 1, 2, 3].map((i) => {
              const pct = 40 + ((Math.sin(tick / 2 + i) + 1) / 2) * 55;
              return (
                <div key={i}>
                  <div style={{ height: 46, display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                    {[0, 1, 2].map((b) => (
                      <div
                        key={b}
                        style={{
                          flex: 1,
                          height: `${Math.max(12, pct - b * 12)}%`,
                          background: i === 3 ? BLUE : GOLD,
                          opacity: 0.35 + b * 0.25,
                          borderRadius: 2,
                          transition: 'height 0.9s cubic-bezier(0.22,1,0.36,1)',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: MUTED, marginTop: 6, letterSpacing: '0.06em' }}>
                    CH{i + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* sidebar KPIs + gauge — each card tilts toward the cursor and grows on hover */}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TiltCard grow>
            <Gauge value={health} />
          </TiltCard>
          <TiltCard grow>
            <Kpi label="Vibration" value={`${vib}`} unit="mm/s" tone={vib > 5 ? '#EF4444' : vib > 4 ? GOLD : GREEN} />
          </TiltCard>
          <TiltCard grow>
            <Kpi label="Bearing temp" value={`${temp}`} unit="°C" tone={temp > 70 ? GOLD : GREEN} />
          </TiltCard>
          <TiltCard grow>
            <Kpi label="Shaft speed" value={rpm.toLocaleString()} unit="rpm" tone={INK} />
          </TiltCard>
        </div>
      </div>
    </div>
  );
}

function StreamChart({ series, series2 }: { series: number[]; series2: number[] }) {
  const W = 520;
  const H = 150;
  const toPath = (data: number[]) =>
    data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - (v / 100) * H;
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(' ');
  const areaPath = `${toPath(series)} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="150" preserveAspectRatio="none">
      <defs>
        <linearGradient id="ultronArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GOLD} stopOpacity="0.28" />
          <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" y1={H * f} x2={W} y2={H * f} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      <path d={areaPath} fill="url(#ultronArea)" style={{ transition: 'all 0.9s ease' }} />
      <path
        d={toPath(series2)}
        fill="none"
        stroke={BLUE}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: 'all 0.9s ease', opacity: 0.8 }}
      />
      <path
        d={toPath(series)}
        fill="none"
        stroke={GOLD}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: 'all 0.9s ease' }}
      />
    </svg>
  );
}

function Gauge({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: 14,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={value > 90 ? GREEN : value > 82 ? GOLD : '#EF4444'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 42 42)"
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.9s ease' }}
        />
        <text x="42" y="46" textAnchor="middle" fontSize="20" fontFamily={FONT_HEAD} fill={INK}>
          {value}
        </text>
      </svg>
      <div>
        <div style={{ fontFamily: FONT_MED, fontSize: 13, color: INK }}>Health score</div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: MUTED, marginTop: 4 }}>AI · updated live</div>
      </div>
    </div>
  );
}

function Kpi({ label, value, unit, tone }: { label: string; value: string; unit: string; tone: string }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: MUTED, letterSpacing: '0.08em' }}>{label.toUpperCase()}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 6 }}>
        <span style={{ fontFamily: FONT_HEAD, fontSize: 24, color: tone, transition: 'color 0.6s ease' }}>{value}</span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: MUTED }}>{unit}</span>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: FONT_MONO, fontSize: 11, color: MUTED }}>
      <span style={{ width: 14, height: 3, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

// A small animated line chart purely for decoration on the showcase band.
function MiniChart() {
  const series = [
    { colour: GOLD, d: 'M0 70 C 40 60, 60 40, 100 44 S 170 30, 220 34 S 300 20, 340 26' },
    { colour: BLUE, d: 'M0 96 C 50 92, 70 78, 120 82 S 200 70, 250 74 S 310 64, 340 68' },
    { colour: GREEN, d: 'M0 118 C 45 116, 80 108, 130 110 S 210 104, 260 106 S 320 100, 340 102' },
  ];
  return (
    <div
      style={{
        background: '#0A0A0A',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 18,
      }}
    >
      <svg viewBox="0 0 340 150" width="100%" height="180" preserveAspectRatio="none">
        {[30, 60, 90, 120].map((y) => (
          <line key={y} x1="0" y1={y} x2="340" y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        {series.map((s, i) => (
          <path
            key={s.colour}
            d={s.d}
            fill="none"
            stroke={s.colour}
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{
              strokeDasharray: 700,
              strokeDashoffset: 700,
              animation: `draw 2.4s ease ${i * 0.35}s forwards`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Site footer — company, product, resources, contact + social links.
// ---------------------------------------------------------------------------

const SOCIALS: { label: string; href: string; icon: ReactNode }[] = [
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/company/ultron-industrial',
    icon: (
      <path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM0 8.98h4.96V24H0zM8.98 8.98h4.75v2.05h.07c.66-1.25 2.28-2.57 4.69-2.57 5.02 0 5.95 3.3 5.95 7.6V24h-4.96v-6.9c0-1.65-.03-3.77-2.3-3.77-2.3 0-2.65 1.8-2.65 3.65V24H8.98z" />
    ),
  },
  {
    label: 'X',
    href: 'https://x.com',
    icon: (
      <path d="M18.9 2H22l-7.5 8.6L23.4 22h-6.9l-5.4-7-6.2 7H1.8l8-9.2L1 2h7l4.9 6.5L18.9 2zm-2.4 18h1.9L7.6 4H5.6l10.9 16z" />
    ),
  },
  {
    label: 'GitHub',
    href: 'https://github.com',
    icon: (
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.3-5.26-1.28-5.26-5.7 0-1.26.45-2.3 1.2-3.1-.12-.3-.52-1.48.11-3.08 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.5 3.18-1.18 3.18-1.18.63 1.6.23 2.78.11 3.08.75.8 1.2 1.84 1.2 3.1 0 4.43-2.7 5.4-5.28 5.68.42.36.79 1.08.79 2.18v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" />
    ),
  },
];

function SiteFooter() {
  const cols: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: 'Product',
      links: [
        { label: 'Features', href: '#features' },
        { label: 'Live dashboard', href: '#dashboard' },
        { label: 'Console', href: '/login' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About us', href: '#contact' },
        { label: 'Careers', href: '#contact' },
        { label: 'Blog', href: '#contact' },
      ],
    },
    {
      title: 'Resources',
      links: [
        { label: 'Documentation', href: '#contact' },
        { label: 'API reference', href: '#contact' },
        { label: 'Support', href: '#contact' },
      ],
    },
  ];

  return (
    <footer id="contact" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#080808', scrollMarginTop: 70 }}>
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: 'clamp(48px, 8vw, 72px) clamp(20px, 6vw, 72px) 32px',
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 1.4fr) repeat(3, minmax(120px, 1fr))',
          gap: 40,
        }}
      >
        {/* brand + contact */}
        <div>
          <span style={{ fontFamily: FONT_DISPLAY, fontSize: 28, letterSpacing: '0.22em', color: INK }}>ULTRON</span>
          <p style={{ color: MUTED, fontSize: 14, lineHeight: 1.7, margin: '16px 0 0', maxWidth: 300 }}>
            Industrial intelligence platform for real-time monitoring and predictive maintenance of rotating equipment.
          </p>
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a href="mailto:hello@ultron.io" style={contactLink} className="ultron-navlink">
              hello@ultron.io
            </a>
            <a href="tel:+18005551234" style={contactLink} className="ultron-navlink">
              +1 (800) 555-1234
            </a>
            <span style={{ ...contactLink, color: MUTED }}>San Francisco, CA · Remote-first</span>
          </div>
          <div style={{ marginTop: 22, display: 'flex', gap: 12 }}>
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={s.label}
                title={s.label}
                className="ultron-social"
                style={socialBtn}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  {s.icon}
                </svg>
              </a>
            ))}
          </div>
        </div>

        {cols.map((col) => (
          <div key={col.title}>
            <div style={{ fontFamily: FONT_MED, fontSize: 13, color: INK, marginBottom: 16 }}>{col.title}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {col.links.map((l) =>
                l.href.startsWith('#') || l.href.startsWith('/') ? (
                  <Link key={l.label} href={l.href} style={footerLink} className="ultron-navlink">
                    {l.label}
                  </Link>
                ) : (
                  <a key={l.label} href={l.href} style={footerLink} className="ultron-navlink">
                    {l.label}
                  </a>
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '20px clamp(20px, 6vw, 72px)',
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          color: MUTED,
          fontSize: 13,
        }}
      >
        <span style={{ fontFamily: FONT_MONO }}>© {new Date().getFullYear()} ULTRON — Industrial intelligence platform</span>
        <span style={{ display: 'flex', gap: 20 }}>
          <a href="#contact" style={footerLink} className="ultron-navlink">
            Privacy
          </a>
          <a href="#contact" style={footerLink} className="ultron-navlink">
            Terms
          </a>
        </span>
      </div>
    </footer>
  );
}

const navLink: CSSProperties = {
  fontFamily: FONT_MED,
  fontSize: 14,
  color: MUTED,
  textDecoration: 'none',
  transition: 'color 0.2s ease',
};

const footerLink: CSSProperties = {
  fontFamily: FONT_BODY,
  fontSize: 14,
  color: MUTED,
  textDecoration: 'none',
  transition: 'color 0.2s ease',
};

const contactLink: CSSProperties = {
  fontFamily: FONT_MED,
  fontSize: 14,
  color: INK,
  textDecoration: 'none',
  transition: 'color 0.2s ease',
};

const socialBtn: CSSProperties = {
  width: 38,
  height: 38,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  color: MUTED,
  transition: 'color 0.2s ease, border-color 0.2s ease, transform 0.2s ease',
};

const orb: CSSProperties = {
  position: 'absolute',
  width: 380,
  height: 380,
  borderRadius: '50%',
  filter: 'blur(90px)',
  animation: 'float 9s ease-in-out infinite',
  pointerEvents: 'none',
};

const heroGrid: CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
  backgroundSize: '48px 48px',
  maskImage: 'radial-gradient(circle at 50% 30%, black, transparent 72%)',
  WebkitMaskImage: 'radial-gradient(circle at 50% 30%, black, transparent 72%)',
  pointerEvents: 'none',
};

const heroSpotlight: CSSProperties = {
  position: 'absolute',
  inset: 0,
  opacity: 0.9,
  transition: 'background 0.18s ease-out',
  pointerEvents: 'none',
};

const ctaPrimary: CSSProperties = {
  fontFamily: FONT_MED,
  fontSize: 15,
  color: BG,
  background: INK,
  padding: '13px 26px',
  borderRadius: 12,
  textDecoration: 'none',
  boxShadow: '0 10px 40px rgba(245,245,245,0.12)',
};

const ctaGhost: CSSProperties = {
  fontFamily: FONT_MED,
  fontSize: 15,
  color: INK,
  padding: '13px 26px',
  borderRadius: 12,
  textDecoration: 'none',
  border: '1px solid rgba(255,255,255,0.18)',
};

const sectionKicker: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 12,
  letterSpacing: '0.18em',
  color: GOLD,
  marginBottom: 14,
};

const sectionTitle: CSSProperties = {
  fontFamily: FONT_DISPLAY,
  fontSize: 'clamp(30px, 4.5vw, 46px)',
  lineHeight: 1.05,
  letterSpacing: '0.01em',
  margin: 0,
};

const featureCard: CSSProperties = {
  height: '100%',
  padding: 26,
  borderRadius: 18,
  background: '#0E0E0E',
  border: '1px solid rgba(255,255,255,0.08)',
  transition: 'transform 0.3s ease, border-color 0.3s ease',
};

const featureIcon: CSSProperties = {
  width: 46,
  height: 46,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 12,
  background: 'rgba(201,161,92,0.14)',
};

const keyframes = `
@keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
@keyframes float { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(30px) scale(1.06); } }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
@keyframes shimmer { to { background-position: 200% center; } }
@keyframes draw { to { stroke-dashoffset: 0; } }
.ultron-card:hover { transform: translateY(-6px); border-color: rgba(201,161,92,0.5) !important; }
.ultron-navlink { position: relative; }
.ultron-navlink::after { content: ''; position: absolute; left: 0; bottom: -5px; height: 1.5px; width: 0; background: ${GOLD}; transition: width 0.32s cubic-bezier(0.22,1,0.36,1); }
.ultron-navlink:hover { color: ${INK} !important; }
.ultron-navlink:hover::after { width: 100%; }
.ultron-social:hover { color: ${GOLD} !important; border-color: rgba(201,161,92,0.5) !important; transform: translateY(-2px); }
@media (max-width: 720px) {
  header nav a[href^="#"] { display: none; }
}
`;
