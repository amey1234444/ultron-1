/**
 * Full-bleed plant workspace (web).
 *
 * The 3D canvas is the page: it fills the whole surface edge to edge, and every
 * other panel is docked *onto* it — a KPI strip across the top, an analysis rail
 * on the right, a chart dock along the bottom. Overlays are translucent with a
 * backdrop blur so the plant stays readable behind them.
 *
 * Layout only. The panel contents come in as slots so this file never duplicates
 * the console's existing charts and tables — and because those are
 * react-native-web components, they render as ordinary DOM inside this shell.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';

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
  rail: ReactNode;
  dock: ReactNode;
  title: string;
  meta?: string;
  live?: boolean;
  dark: boolean;
  compact?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
};

const RAIL_W = 352;
const DOCK_H = 208;

function tokens(dark: boolean) {
  return dark
    ? {
        canvas: '#08090C',
        panel: 'rgba(15,17,21,0.72)',
        panelSolid: 'rgba(15,17,21,0.92)',
        border: 'rgba(255,255,255,0.10)',
        borderSoft: 'rgba(255,255,255,0.06)',
        ink: '#F7F6F2',
        inkMuted: '#8B8D93',
        inkFaint: '#62666E',
        scrim: 'rgba(6,7,9,0.55)',
        accent: '#3FBF6A',
      }
    : {
        canvas: '#EEEFF1',
        panel: 'rgba(255,255,255,0.80)',
        panelSolid: 'rgba(255,255,255,0.95)',
        border: 'rgba(10,11,13,0.10)',
        borderSoft: 'rgba(10,11,13,0.06)',
        ink: '#0A0B0D',
        inkMuted: '#5C6068',
        inkFaint: '#80858D',
        scrim: 'rgba(255,255,255,0.55)',
        accent: '#2A7A48',
      };
}

type T = ReturnType<typeof tokens>;

const surface = (t: T, solid = false): CSSProperties => ({
  background: solid ? t.panelSolid : t.panel,
  border: `1px solid ${t.border}`,
  borderRadius: 14,
  backdropFilter: 'blur(18px) saturate(140%)',
  WebkitBackdropFilter: 'blur(18px) saturate(140%)',
  boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
});

const microLabel = (t: T): CSSProperties => ({
  fontSize: 9,
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
  color: t.inkFaint,
  fontWeight: 600,
});

function KpiTile({ kpi, t }: { kpi: PlantKpi; t: T }) {
  return (
    <div style={{ ...surface(t), padding: '9px 13px 10px', minWidth: 148, flex: '0 1 auto' }}>
      <div style={microLabel(t)}>{kpi.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 3 }}>
        <span style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.05, color: t.ink, letterSpacing: '-0.02em' }}>{kpi.value}</span>
        {kpi.unit ? <span style={{ fontSize: 11, color: t.inkMuted }}>{kpi.unit}</span> : null}
      </div>
      {kpi.progress !== undefined ? (
        <div style={{ marginTop: 7, height: 2, borderRadius: 2, background: t.borderSoft, overflow: 'hidden' }}>
          <div style={{ width: `${Math.max(0, Math.min(1, kpi.progress)) * 100}%`, height: '100%', background: kpi.tone, borderRadius: 2 }} />
        </div>
      ) : null}
      {kpi.plan ? (
        <div style={{ marginTop: 5, fontSize: 9.5, color: t.inkFaint, whiteSpace: 'nowrap' }}>{kpi.plan}</div>
      ) : null}
    </div>
  );
}

function EdgeToggle({
  t, open, onClick, side, label,
}: { t: T; open: boolean; onClick: () => void; side: 'right' | 'bottom'; label: string }) {
  const chevron = side === 'right' ? (open ? '›' : '‹') : open ? '⌄' : '⌃';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={open}
      title={label}
      style={{
        ...surface(t, true),
        position: 'absolute',
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: t.inkMuted,
        fontSize: 15,
        lineHeight: 1,
        padding: 0,
        transition: 'right .26s cubic-bezier(.4,0,.2,1), bottom .26s cubic-bezier(.4,0,.2,1)',
        ...(side === 'right'
          ? { width: 20, height: 54, right: open ? RAIL_W + 8 : 10, top: '46%', borderRadius: '8px 4px 4px 8px' }
          : { width: 54, height: 20, bottom: open ? DOCK_H + 8 : 10, left: 18, borderRadius: '8px 8px 4px 4px' }),
      }}
    >
      {chevron}
    </button>
  );
}

export default function PlantWorkspace({
  canvas, kpis, rail, dock, title, meta, live, dark, compact = false, canEdit, onEdit,
}: PlantWorkspaceProps) {
  const [railOpen, setRailOpen] = useState(!compact);
  const [dockOpen, setDockOpen] = useState(!compact);
  const t = tokens(dark);
  const railW = compact ? Math.min(RAIL_W, 300) : RAIL_W;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: t.canvas }}>
      {/* --- the canvas IS the page --- */}
      <div style={{ position: 'absolute', inset: 0 }}>{canvas}</div>

      {/* --- scrims: keep overlay text legible over a bright plant --- */}
      <div style={{ position: 'absolute', insetInline: 0, top: 0, height: 168, pointerEvents: 'none',
                    background: `linear-gradient(to bottom, ${t.scrim}, transparent)` }} />
      <div style={{ position: 'absolute', insetInline: 0, bottom: 0, height: 120, pointerEvents: 'none',
                    background: `linear-gradient(to top, ${t.scrim}, transparent)` }} />

      {/* --- header + KPI strip (pointer-transparent, so the plant stays orbitable underneath) --- */}
      <div
        style={{
          position: 'absolute', top: 14, left: 16, zIndex: 4, pointerEvents: 'none',
          right: (railOpen ? railW : 0) + 40,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: t.ink, letterSpacing: '-0.01em' }}>{title}</h2>
          {live ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 999,
                           background: 'rgba(63,191,106,0.14)', border: '1px solid rgba(63,191,106,0.35)' }}>
              <span style={{ width: 5, height: 5, borderRadius: 999, background: t.accent }} />
              <span style={{ fontSize: 9.5, fontWeight: 600, color: t.accent, letterSpacing: '0.08em' }}>LIVE</span>
            </span>
          ) : null}
          {meta ? <span style={{ fontSize: 10.5, color: t.inkMuted }}>{meta}</span> : null}
          {canEdit && onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              style={{ ...surface(t, true), pointerEvents: 'auto', cursor: 'pointer', padding: '4px 11px',
                       fontSize: 10.5, fontWeight: 600, color: t.accent, borderRadius: 8 }}
            >
              Edit map
            </button>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
          {kpis.map((kpi) => <KpiTile key={kpi.label} kpi={kpi} t={t} />)}
        </div>
      </div>

      {/* --- right analysis rail, docked onto the canvas --- */}
      <aside
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: railW, zIndex: 5,
          transform: railOpen ? 'translateX(0)' : `translateX(${railW}px)`,
          transition: 'transform .26s cubic-bezier(.4,0,.2,1)',
          background: t.panel,
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
          borderLeft: `1px solid ${t.border}`,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '12px 14px 10px', borderBottom: `1px solid ${t.borderSoft}` }}>
          <div style={microLabel(t)}>Analysis</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 12 }}>{rail}</div>
      </aside>
      <EdgeToggle t={t} open={railOpen} onClick={() => setRailOpen((v) => !v)} side="right" label="Toggle analysis rail" />

      {/* --- bottom chart dock, docked onto the canvas --- */}
      <section
        style={{
          position: 'absolute', left: 0, bottom: 0, height: DOCK_H, zIndex: 5,
          right: railOpen ? railW : 0,
          transform: dockOpen ? 'translateY(0)' : `translateY(${DOCK_H}px)`,
          transition: 'transform .26s cubic-bezier(.4,0,.2,1), right .26s cubic-bezier(.4,0,.2,1)',
          background: t.panel,
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
          borderTop: `1px solid ${t.border}`,
          padding: 12,
          overflow: 'hidden',
        }}
      >
        {dock}
      </section>
      <EdgeToggle t={t} open={dockOpen} onClick={() => setDockOpen((v) => !v)} side="bottom" label="Toggle chart dock" />
    </div>
  );
}

/** Titled cell used by the rail and dock slots, so both read as one system. */
export function WorkspaceCard({
  title, meta, dark, children, style, flex,
}: { title: string; meta?: string; dark: boolean; children: ReactNode; style?: CSSProperties; flex?: number }) {
  const t = tokens(dark);
  return (
    <div style={{ ...surface(t), padding: '10px 12px 12px', display: 'flex', flexDirection: 'column',
                  minWidth: 0, minHeight: 0, ...(flex !== undefined ? { flex } : {}), ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <span style={microLabel(t)}>{title}</span>
        {meta ? <span style={{ fontSize: 9.5, color: t.inkFaint, whiteSpace: 'nowrap' }}>{meta}</span> : null}
      </div>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0 }}>{children}</div>
    </div>
  );
}
