/**
 * Full-bleed plant workspace (web).
 *
 * The 3D canvas is the page — edge to edge, nothing framing it. Only two things
 * sit on top of it: a KPI strip in the top-left, and a pair of compact stat
 * cards in the bottom-right. Everything else was removed rather than docked,
 * because the plant is the instrument here and panels compete with it.
 *
 * Layout only: card contents arrive as a slot, so the console's existing charts
 * and tables are reused untouched (react-native-web renders them as DOM, so they
 * compose inside this shell without a rewrite).
 */
import type { CSSProperties, ReactNode } from 'react';

export type PlantKpi = {
  label: string;
  value: string;
  unit?: string;
  /** 0-1; drives the hairline meter under the value. */
  progress?: number;
  /** 0-1; stable marker on the meter. */
  target?: number;
  plan?: string;
  tone: string;
};

export type PlantWorkspaceProps = {
  canvas: ReactNode;
  kpis: PlantKpi[];
  /** Exactly two compact cards, rendered bottom-right over the canvas. */
  cards: ReactNode;
  title: string;
  meta?: string;
  live?: boolean;
  dark: boolean;
  compact?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
};

const SANS = 'Inter, system-ui, -apple-system, sans-serif';
const MONO = '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace';

export function workspaceTokens(dark: boolean) {
  return dark
    ? {
        canvas: '#08090C',
        glassTop: 'rgba(255,255,255,0.055)',
        glassBottom: 'rgba(255,255,255,0.012)',
        base: 'rgba(13,15,19,0.62)',
        border: 'rgba(255,255,255,0.09)',
        rim: 'rgba(255,255,255,0.13)',
        hair: 'rgba(255,255,255,0.06)',
        ink: '#F7F6F2',
        inkMuted: '#8B8D93',
        inkFaint: '#62666E',
        scrim: 'rgba(6,7,9,0.60)',
        shadow: 'rgba(0,0,0,0.42)',
        accent: '#3FBF6A',
      }
    : {
        canvas: '#EEEFF1',
        // Light theme needs a real gradient, not white-on-white, or the glass
        // flattens into a plain card — which is exactly how it was reading.
        glassTop: 'rgba(255,255,255,0.92)',
        glassBottom: 'rgba(226,229,234,0.55)',
        base: 'rgba(248,249,251,0.52)',
        border: 'rgba(10,11,13,0.13)',
        rim: 'rgba(255,255,255,0.95)',
        hair: 'rgba(10,11,13,0.08)',
        ink: '#0A0B0D',
        inkMuted: '#5C6068',
        inkFaint: '#7B818A',
        scrim: 'rgba(255,255,255,0.62)',
        shadow: 'rgba(15,20,30,0.16)',
        accent: '#2A7A48',
      };
}

type T = ReturnType<typeof workspaceTokens>;

/** Glass: a gradient wash over a translucent base, with a lit top rim. */
function glass(t: T, radius = 13): CSSProperties {
  return {
    background: `linear-gradient(157deg, ${t.glassTop}, ${t.glassBottom}), ${t.base}`,
    border: `1px solid ${t.border}`,
    borderRadius: radius,
    backdropFilter: 'blur(22px) saturate(150%)',
    WebkitBackdropFilter: 'blur(22px) saturate(150%)',
    boxShadow: `inset 0 1px 0 ${t.rim}, inset 0 -1px 0 ${t.hair}, 0 14px 40px ${t.shadow}`,
  };
}

/**
 * Shared glass shell.
 *
 * The gradient + blur alone reads as a translucent rectangle; what makes it look
 * like glass is the pair of layers below — a specular highlight raking the
 * top-left, and a hairline that catches light along the top edge only.
 */
function GlassSurface({
  t, dark, children, style, radius = 13,
}: { t: T; dark: boolean; children: ReactNode; style?: CSSProperties; radius?: number }) {
  return (
    <div style={{ ...glass(t, radius), position: 'relative', overflow: 'hidden', isolation: 'isolate', ...style }}>
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: dark
            ? 'radial-gradient(130% 78% at 6% -18%, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.035) 40%, transparent 70%)'
            : 'radial-gradient(130% 78% at 6% -18%, rgba(255,255,255,1) 0%, rgba(255,255,255,0.42) 40%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, pointerEvents: 'none', zIndex: 1,
          background: `linear-gradient(to right, transparent, ${dark ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,1)'}, transparent)`,
        }}
      />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

const micro = (t: T): CSSProperties => ({
  fontFamily: MONO,
  fontSize: 8.5,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: t.inkFaint,
});

function KpiTile({ kpi, t, dark }: { kpi: PlantKpi; t: T; dark: boolean }) {
  const pct = kpi.progress === undefined ? null : Math.max(0, Math.min(1, kpi.progress));
  const target = kpi.target === undefined ? null : Math.max(0, Math.min(1, kpi.target));
  return (
    <GlassSurface t={t} dark={dark} style={{ padding: '10px 14px 11px', minWidth: 152 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {/* tone pip: states which measure is off plan without adding a hue */}
        <span style={{ width: 5, height: 5, borderRadius: 999, background: kpi.tone, boxShadow: `0 0 7px ${kpi.tone}` }} />
        <span style={micro(t)}>{kpi.label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 5 }}>
        {/* Light numerals: a measurement, not a marketing claim. */}
        <span style={{ fontFamily: SANS, fontSize: 27, fontWeight: 300, lineHeight: 1, color: t.ink, letterSpacing: '-0.025em' }}>
          {kpi.value}
        </span>
        {kpi.unit ? <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.inkMuted }}>{kpi.unit}</span> : null}
      </div>
      {pct !== null ? (
        <div style={{ position: 'relative', marginTop: 8, height: 4, borderRadius: 3, background: t.hair }}>
          <div style={{
            width: `${pct * 100}%`, height: '100%', borderRadius: 3,
            background: `linear-gradient(to right, ${kpi.tone}88, ${kpi.tone})`,
            boxShadow: `0 0 8px ${kpi.tone}66`,
          }} />
          {target !== null ? <span aria-hidden style={{ position: 'absolute', left: `calc(${target * 100}% - 1px)`, top: -2, width: 2, height: 8, borderRadius: 1, background: t.ink, boxShadow: `0 0 0 1px ${t.base}` }} /> : null}
        </div>
      ) : null}
      {kpi.plan ? <div style={{ ...micro(t), marginTop: 7, letterSpacing: '0.08em', textTransform: 'none', whiteSpace: 'nowrap' }}>{kpi.plan}</div> : null}
    </GlassSurface>
  );
}

export default function PlantWorkspace({
  canvas, kpis, cards, title, meta, live, dark, compact = false, canEdit, onEdit,
}: PlantWorkspaceProps) {
  const t = workspaceTokens(dark);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: t.canvas }}>
      {/* --- the canvas IS the page --- */}
      <div style={{ position: 'absolute', inset: 0 }}>{canvas}</div>

      {/* --- scrims: hold overlay legibility over a bright plant --- */}
      <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 190, pointerEvents: 'none',
                    background: `linear-gradient(to bottom, ${t.scrim}, transparent)` }} />
      <div style={{ position: 'absolute', insetInline: 0, bottom: 0, height: 210, pointerEvents: 'none',
                    background: `linear-gradient(to top, ${t.scrim}, transparent)` }} />

      {/* --- header + KPI strip. Pointer-transparent, so the plant stays
              orbitable by dragging straight through it. --- */}
      <div style={{ position: 'absolute', top: 15, left: 17, right: 17, zIndex: 4, pointerEvents: 'none',
                    display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontFamily: SANS, fontSize: 14, fontWeight: 600, color: t.ink, letterSpacing: '-0.01em' }}>
            {title}
          </h2>
          {live ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999,
                           background: 'rgba(63,191,106,0.13)', border: '1px solid rgba(63,191,106,0.32)' }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: t.accent }} />
              <span style={{ fontFamily: MONO, fontSize: 8.5, color: t.accent, letterSpacing: '0.14em' }}>LIVE</span>
            </span>
          ) : null}
          {meta ? <span style={{ fontFamily: SANS, fontSize: 10.5, color: t.inkMuted }}>{meta}</span> : null}
          {canEdit && onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              style={{ ...glass(t), pointerEvents: 'auto', cursor: 'pointer', padding: '4px 12px', borderRadius: 8,
                       fontFamily: SANS, fontSize: 10.5, fontWeight: 500, color: t.accent }}
            >
              Edit map
            </button>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          {kpis.map((kpi) => <KpiTile key={kpi.label} kpi={kpi} t={t} dark={dark} />)}
        </div>
      </div>

      {/* --- the two stat cards, floating bottom-right --- */}
      <div
        style={{
          position: 'absolute', right: 17, bottom: 17, zIndex: 5,
          display: 'flex', flexDirection: compact ? 'column' : 'row', gap: 11,
          alignItems: 'flex-end', maxWidth: 'calc(100% - 34px)',
        }}
      >
        {cards}
      </div>
    </div>
  );
}

/**
 * Compact glass cell for the two stat cards. Fixed, deliberately small footprint
 * — these annotate the plant, they do not compete with it.
 */
export function WorkspaceCard({
  title, meta, metaTone, dark, children, width = 292, height = 158,
}: {
  title: string; meta?: string; metaTone?: string; dark: boolean;
  children: ReactNode; width?: number; height?: number;
}) {
  const t = workspaceTokens(dark);
  return (
    <GlassSurface t={t} dark={dark} style={{ width, height, padding: '10px 13px 11px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={micro(t)}>{title}</span>
        {meta ? (
          <span style={{
            fontFamily: MONO, fontSize: 9, whiteSpace: 'nowrap',
            color: metaTone ?? t.inkFaint,
            ...(metaTone ? {
              padding: '1.5px 6px', borderRadius: 999,
              background: `${metaTone}1F`, border: `1px solid ${metaTone}44`,
            } : {}),
          }}>
            {meta}
          </span>
        ) : null}
      </div>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>{children}</div>
    </GlassSurface>
  );
}
