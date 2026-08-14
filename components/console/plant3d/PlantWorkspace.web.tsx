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
        rim: 'rgba(255,255,255,0.11)',
        hair: 'rgba(255,255,255,0.06)',
        ink: '#F7F6F2',
        inkMuted: '#8B8D93',
        inkFaint: '#62666E',
        scrim: 'rgba(6,7,9,0.60)',
        accent: '#3FBF6A',
      }
    : {
        canvas: '#EEEFF1',
        glassTop: 'rgba(255,255,255,0.80)',
        glassBottom: 'rgba(255,255,255,0.42)',
        base: 'rgba(255,255,255,0.55)',
        border: 'rgba(10,11,13,0.10)',
        rim: 'rgba(255,255,255,0.85)',
        hair: 'rgba(10,11,13,0.07)',
        ink: '#0A0B0D',
        inkMuted: '#5C6068',
        inkFaint: '#80858D',
        scrim: 'rgba(255,255,255,0.62)',
        accent: '#2A7A48',
      };
}

type T = ReturnType<typeof workspaceTokens>;

/** Glass: a gradient wash over a translucent base, with a lit top rim. */
function glass(t: T): CSSProperties {
  return {
    background: `linear-gradient(157deg, ${t.glassTop}, ${t.glassBottom}), ${t.base}`,
    border: `1px solid ${t.border}`,
    borderRadius: 13,
    backdropFilter: 'blur(22px) saturate(150%)',
    WebkitBackdropFilter: 'blur(22px) saturate(150%)',
    boxShadow: `inset 0 1px 0 ${t.rim}, 0 14px 40px rgba(0,0,0,0.34)`,
  };
}

const micro = (t: T): CSSProperties => ({
  fontFamily: MONO,
  fontSize: 8.5,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: t.inkFaint,
});

function KpiTile({ kpi, t }: { kpi: PlantKpi; t: T }) {
  return (
    <div style={{ ...glass(t), padding: '9px 14px 10px', minWidth: 146 }}>
      <div style={micro(t)}>{kpi.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 4 }}>
        {/* Light numerals: a measurement, not a marketing claim. */}
        <span style={{ fontFamily: SANS, fontSize: 25, fontWeight: 300, lineHeight: 1, color: t.ink, letterSpacing: '-0.02em' }}>
          {kpi.value}
        </span>
        {kpi.unit ? <span style={{ fontFamily: MONO, fontSize: 10.5, color: t.inkMuted }}>{kpi.unit}</span> : null}
      </div>
      {kpi.progress !== undefined ? (
        <div style={{ marginTop: 8, height: 2, borderRadius: 2, background: t.hair, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(0, Math.min(1, kpi.progress)) * 100}%`, height: '100%', background: kpi.tone }} />
        </div>
      ) : null}
    </div>
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
          {kpis.map((kpi) => <KpiTile key={kpi.label} kpi={kpi} t={t} />)}
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
  title, meta, dark, children, width = 286, height = 150,
}: { title: string; meta?: string; dark: boolean; children: ReactNode; width?: number; height?: number }) {
  const t = workspaceTokens(dark);
  return (
    <div
      style={{
        ...glass(t), width, height, padding: '9px 12px 10px',
        display: 'flex', flexDirection: 'column', minWidth: 0,
        position: 'relative', overflow: 'hidden', isolation: 'isolate',
      }}
    >
      {/* specular sheen: a soft diagonal highlight raking the top-left corner,
          which is what separates "glass" from "a translucent rectangle" */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: dark
            ? 'radial-gradient(120% 70% at 8% -14%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 38%, transparent 68%)'
            : 'radial-gradient(120% 70% at 8% -14%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 38%, transparent 68%)',
        }}
      />
      {/* hairline that catches the light along the top edge only */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: 0, left: '9%', right: '9%', height: 1, pointerEvents: 'none', zIndex: 1,
          background: `linear-gradient(to right, transparent, ${dark ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,1)'}, transparent)`,
        }}
      />
      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 7 }}>
          <span style={micro(t)}>{title}</span>
          {meta ? <span style={{ fontFamily: MONO, fontSize: 9, color: t.inkFaint, whiteSpace: 'nowrap' }}>{meta}</span> : null}
        </div>
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>{children}</div>
      </div>
    </div>
  );
}
