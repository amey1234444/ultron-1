import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { useAuth } from '../context/AuthContext';

const GOLD = '#C9A15C';
const BG = '#0A0A0A';
const INK = '#F5F5F5';
const MUTED = '#8A8A8A';

const FONT_HEAD = 'SpaceGrotesk_600SemiBold, system-ui, sans-serif';
const FONT_BODY = 'Inter_400Regular, system-ui, sans-serif';
const FONT_MED = 'Inter_500Medium, system-ui, sans-serif';
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
          padding: '18px clamp(20px, 6vw, 72px)',
          backdropFilter: 'blur(12px)',
          background: 'rgba(10,10,10,0.6)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span style={{ fontFamily: FONT_HEAD, fontSize: 22, letterSpacing: '0.28em' }}>ULTRON</span>
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
      </header>

      {/* Hero */}
      <section
        style={{
          position: 'relative',
          padding: 'clamp(72px, 12vw, 160px) clamp(20px, 6vw, 72px) clamp(64px, 10vw, 120px)',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        {/* animated backdrop */}
        <div aria-hidden style={heroGrid} />
        <div aria-hidden style={{ ...orb, top: '-140px', left: '-120px', background: 'rgba(201,161,92,0.22)' }} />
        <div
          aria-hidden
          style={{ ...orb, bottom: '-160px', right: '-120px', background: 'rgba(88,166,255,0.16)', animationDelay: '3s' }}
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
              fontFamily: FONT_HEAD,
              fontSize: 'clamp(40px, 7vw, 82px)',
              lineHeight: 1.02,
              margin: '26px 0 0',
              letterSpacing: '-0.02em',
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
            <a href="#features" style={{ ...ctaGhost }}>
              Explore features
            </a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ padding: '0 clamp(20px, 6vw, 72px)', marginTop: -20 }}>
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
                <div style={{ fontFamily: FONT_HEAD, fontSize: 30, color: GOLD }}>{s.value}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: MUTED, marginTop: 6, letterSpacing: '0.08em' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: 'clamp(80px, 12vw, 140px) clamp(20px, 6vw, 72px)' }}>
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
      <section style={{ padding: '0 clamp(20px, 6vw, 72px) clamp(90px, 12vw, 150px)', textAlign: 'center' }}>
        <Reveal>
          <h2 style={{ fontFamily: FONT_HEAD, fontSize: 'clamp(30px, 5vw, 52px)', letterSpacing: '-0.02em' }}>
            Ready to see your machines think?
          </h2>
          <div style={{ marginTop: 28 }}>
            <Link href={consoleHref} style={ctaPrimary}>
              {user ? 'Open console →' : 'Get started →'}
            </Link>
          </div>
        </Reveal>
      </section>

      <footer
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          padding: '26px clamp(20px, 6vw, 72px)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          color: MUTED,
          fontSize: 13,
        }}
      >
        <span style={{ fontFamily: FONT_HEAD, letterSpacing: '0.2em', color: INK }}>ULTRON</span>
        <span style={{ fontFamily: FONT_MONO }}>© {new Date().getFullYear()} — Industrial intelligence platform</span>
      </footer>
    </div>
  );
}

// A small animated line chart purely for decoration on the showcase band.
function MiniChart() {
  const series = [
    { colour: GOLD, d: 'M0 70 C 40 60, 60 40, 100 44 S 170 30, 220 34 S 300 20, 340 26' },
    { colour: '#58A6FF', d: 'M0 96 C 50 92, 70 78, 120 82 S 200 70, 250 74 S 310 64, 340 68' },
    { colour: '#3FB950', d: 'M0 118 C 45 116, 80 108, 130 110 S 210 104, 260 106 S 320 100, 340 102' },
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
  fontFamily: FONT_HEAD,
  fontSize: 'clamp(26px, 4vw, 40px)',
  lineHeight: 1.15,
  letterSpacing: '-0.02em',
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
`;
