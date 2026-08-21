/**
 * Asset labels, placed in screen space.
 *
 * The rule this exists to enforce: a card must never cover the model it
 * describes, or any other model. Anchoring a card to a projected point cannot
 * honour that — avoiding a collision means knowing where every other card
 * landed — so placement is solved here for all assets at once, against the
 * screen-space footprints the in-canvas projector publishes each frame.
 *
 * Placement
 * ---------
 * Each label is offered candidate positions in preference order (above, upper
 * corners, sides, lower corners, then a wider ring). A candidate is rejected if
 * it leaves the viewport, overlaps *any* asset's footprint, or overlaps a card
 * already placed this pass. Assets are solved in priority order — selected
 * first, then hovered, then nearest the camera — so the ones the operator is
 * actually looking at get the good positions and distant background assets take
 * what is left.
 *
 * Density
 * -------
 * At rest a label is two lines: identity and state. That is all six can carry
 * without the yard disappearing behind them. The readings unfold on hover, and
 * clicking opens the inspector — so the detail is one gesture away rather than
 * permanently in front of the plant.
 */
import { useMemo, type CSSProperties } from 'react';

import type { ConsolePalette } from '../../../lib/consoleTheme';
import type { PlantAssetTelemetry } from '../../../lib/plantAnalytics';
import type { ProjectedAsset } from '../plant3d/types';

const MONO = '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace';

/**
 * Card footprints. Fixed, because the solver needs them before layout.
 *
 * Identity and state stack rather than sharing a line: side by side, a name
 * like "Electrical / Power House" had to be clipped to fit next to its status,
 * and a label that cannot say what it is labelling has no reason to be there.
 */
const REST = { w: 184, h: 58 };
const OPEN = { w: 200, h: 132 };
/** Clearance between a card and a model, and between two cards. */
const CLEAR = 12;
/** Length of the connector's lead-off from the model. */
const LEAD = 20;

/**
 * Chrome the solver must stay clear of, in canvas pixels.
 *
 * The plant no longer runs edge to edge under floating panels, but the map
 * region still carries its own header. A label placed under it is a label the
 * operator cannot read, and "on screen" is not the same test as "visible".
 */
export type LabelInsets = { top: number; right: number; bottom: number; left: number };

const NO_INSETS: LabelInsets = { top: 0, right: 0, bottom: 0, left: 0 };

type Rect = { x: number; y: number; w: number; h: number };

function overlaps(a: Rect, b: Rect, pad = 0): boolean {
  return (
    a.x < b.x + b.w + pad &&
    a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad &&
    a.y + a.h + pad > b.y
  );
}

/** Point on `rect`'s edge nearest `tx,ty` — where the connector attaches. */
function edgePoint(rect: Rect, tx: number, ty: number): { x: number; y: number } {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  // Scale the direction until it meets the box, so the line starts flush with
  // the border instead of emerging from the middle of the text.
  const scaleX = dx === 0 ? Infinity : rect.w / 2 / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : rect.h / 2 / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dx * scale, y: cy + dy * scale };
}

/** Candidate offsets from the anchor, in the preference order above. */
function candidates(size: { w: number; h: number }): [number, number][] {
  const out: [number, number][] = [];
  for (const ring of [1, 1.9, 2.9]) {
    const lead = LEAD * ring;
    out.push(
      [-size.w / 2, -size.h - lead],                 // above
      [-size.w - lead * 0.7, -size.h - lead * 0.5],  // upper-left
      [lead * 0.7, -size.h - lead * 0.5],            // upper-right
      [-size.w - lead, -size.h / 2],                 // left
      [lead, -size.h / 2],                           // right
      [-size.w - lead * 0.7, lead * 0.5],            // lower-left
      [lead * 0.7, lead * 0.5],                      // lower-right
    );
  }
  return out;
}

export type PlantLabelLayerProps = {
  projected: ProjectedAsset[];
  assets: PlantAssetTelemetry[];
  statusColors: Record<string, string>;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  palette: ConsolePalette;
  isDark: boolean;
  width: number;
  height: number;
  /** Fades the whole layer out while the frame is moving. */
  visible: boolean;
  /** Regions of the canvas covered by chrome. Labels never land inside them. */
  insets?: LabelInsets;
};

export function PlantLabelLayer({
  projected,
  assets,
  statusColors,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
  palette,
  isDark,
  width,
  height,
  visible,
  insets = NO_INSETS,
}: PlantLabelLayerProps) {
  const byId = useMemo(() => {
    const map: Record<string, PlantAssetTelemetry> = {};
    for (const asset of assets) map[asset.id] = asset;
    return map;
  }, [assets]);

  const placements = useMemo(() => {
    const visibleAssets = projected.filter((asset) => asset.onScreen && byId[asset.id]);
    if (visibleAssets.length === 0 || width < 2 || height < 2) return [];

    // Every model's footprint is off-limits to every card, not just its own.
    const models: Rect[] = visibleAssets.map((asset) => ({
      x: asset.boxX,
      y: asset.boxY,
      w: asset.boxW,
      h: asset.boxH,
    }));

    const priority = (asset: ProjectedAsset) => {
      if (asset.id === selectedId) return 3_000_000;
      if (asset.id === hoveredId) return 2_000_000;
      // Nearest the camera wins: a foreground building is what the operator is
      // reading, and a distant one can afford an awkward label.
      return 1_000_000 - asset.distance;
    };

    const order = [...visibleAssets].sort((a, b) => priority(b) - priority(a));
    const taken: Rect[] = [];

    return order.map((asset) => {
      const open = asset.id === hoveredId || asset.id === selectedId;
      const size = open ? OPEN : REST;
      let chosen: Rect | null = null;

      for (const [dx, dy] of candidates(size)) {
        const rect: Rect = { x: asset.anchorX + dx, y: asset.anchorY + dy, w: size.w, h: size.h };
        if (
          rect.x < insets.left + 4 ||
          rect.y < insets.top + 4 ||
          rect.x + rect.w > width - insets.right - 4 ||
          rect.y + rect.h > height - insets.bottom - 4
        ) {
          continue;
        }
        if (models.some((model) => overlaps(rect, model, CLEAR))) continue;
        if (taken.some((placed) => overlaps(rect, placed, CLEAR))) continue;
        chosen = rect;
        break;
      }

      if (!chosen) {
        // Nothing clean was available. Take the preferred position anyway, but
        // keep it on screen — a label half off the edge is worse than one that
        // grazes a roof, and this only happens in a badly crowded frame.
        chosen = {
          x: Math.min(
            Math.max(insets.left + 4, asset.anchorX - size.w / 2),
            Math.max(insets.left + 4, width - insets.right - size.w - 4),
          ),
          y: Math.min(
            Math.max(insets.top + 4, asset.anchorY - size.h - LEAD),
            Math.max(insets.top + 4, height - insets.bottom - size.h - 4),
          ),
          w: size.w,
          h: size.h,
        };
      }

      taken.push(chosen);
      return { asset, rect: chosen, open };
    });
  }, [byId, height, hoveredId, insets, projected, selectedId, width]);

  const surface = isDark ? 'rgba(16,19,24,0.92)' : 'rgba(255,255,255,0.94)';
  const hair = isDark ? 'rgba(255,255,255,0.075)' : 'rgba(10,11,13,0.09)';

  return (
    <div
      aria-hidden={!visible}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        // The layer never eats pointer events; only the cards do, so the plant
        // stays orbitable by dragging anywhere between them.
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease',
      }}
    >
      {/* Connectors, under the cards. */}
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        {placements.map(({ asset, rect }) => {
          const active = asset.id === hoveredId || asset.id === selectedId;
          const attach = edgePoint(rect, asset.anchorX, asset.anchorY);
          const tone = active ? palette.accent : statusColors[asset.id] ?? palette.neutral;
          return (
            <g key={asset.id} opacity={active ? 0.95 : 0.5}>
              <line
                x1={attach.x}
                y1={attach.y}
                x2={asset.anchorX}
                y2={asset.anchorY}
                stroke={tone}
                strokeWidth={active ? 1.1 : 0.9}
                strokeDasharray={active ? undefined : '2 2'}
              />
              <circle cx={asset.anchorX} cy={asset.anchorY} r={active ? 2.6 : 2} fill={tone} />
            </g>
          );
        })}
      </svg>

      {placements.map(({ asset, rect, open }) => {
        const telemetry = byId[asset.id];
        const tone = statusColors[asset.id] ?? palette.neutral;
        const active = asset.id === hoveredId || asset.id === selectedId;
        const rowStyle: CSSProperties = {
          display: 'flex',
          alignItems: 'baseline',
          gap: 6,
          fontFamily: MONO,
          fontSize: 10,
          whiteSpace: 'nowrap',
        };
        return (
          <div
            key={asset.id}
            role="button"
            tabIndex={0}
            onMouseEnter={() => onHover(asset.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(asset.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect(asset.id);
            }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: rect.w,
              height: rect.h,
              // Transform rather than left/top so moving a card is a compositor
              // job — six of these updating every frame during an orbit.
              transform: `translate3d(${Math.round(rect.x)}px, ${Math.round(rect.y)}px, 0)`,
              pointerEvents: 'auto',
              cursor: 'pointer',
              overflow: 'hidden',
              background: surface,
              border: `1px solid ${active ? 'rgba(63,191,106,0.55)' : hair}`,
              borderRadius: 6,
              // The callout lifts with the building it belongs to. It already
              // grows and takes an accent edge on hover — the deeper shadow is
              // what makes those read as one card coming forward rather than as
              // a box changing size in place.
              boxShadow: active
                ? isDark
                  ? '0 14px 30px rgba(0,0,0,0.55)'
                  : '0 10px 22px rgba(15,20,30,0.20)'
                : isDark
                  ? '0 6px 18px rgba(0,0,0,0.4)'
                  : '0 4px 12px rgba(15,20,30,0.12)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              transition:
                'border-color 140ms ease, box-shadow 200ms ease, width 160ms cubic-bezier(0.22, 1, 0.36, 1), height 160ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <div style={{ padding: '7px 9px 6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: tone, flexShrink: 0 }} />
                  <span
                    style={{
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: MONO,
                      fontSize: 10,
                      fontWeight: '700',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: palette.ink,
                    }}
                  >
                    {telemetry.name}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 8.5,
                    fontWeight: '600',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: tone,
                    flexShrink: 0,
                  }}
                >
                  {telemetry.status}
                </span>
              </div>

              {/* Score + Sparkline Row */}
              <div style={{ marginTop: 5, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: '600', color: palette.ink, lineHeight: '18px' }}>
                    {telemetry.health}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: palette.inkFaint }}>/100</span>
                </div>

                {/* Inline Micro Sparkline */}
                <svg width={52} height={14} style={{ overflow: 'visible' }}>
                  <path
                    d={`M0,${12 - (telemetry.health / 100) * 8} Q13,${14 - (telemetry.health / 100) * 10} 26,${
                      10 - (telemetry.health / 100) * 6
                    } T52,${8 - (telemetry.health / 100) * 6}`}
                    fill="none"
                    stroke={tone}
                    strokeWidth={1.4}
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>

            {open ? (
              <div style={{ borderTop: `1px solid ${hair}`, padding: '6px 10px', display: 'grid', gap: 4 }}>
                {(
                  [
                    ['Machines', String(telemetry.machines).padStart(2, '0'), undefined],
                    [
                      'Alarms',
                      String(telemetry.alarms).padStart(2, '0'),
                      telemetry.alarms > 0 ? tone : undefined,
                    ],
                    [
                      'Power',
                      telemetry.powerKw >= 1000
                        ? `${(telemetry.powerKw / 1000).toFixed(2)} MW`
                        : `${Math.round(telemetry.powerKw)} kW`,
                      undefined,
                    ],
                    ['Telemetry', telemetry.telemetry, undefined],
                  ] as [string, string, string | undefined][]
                ).map(([label, value, valueTone]) => (
                  <div key={label} style={rowStyle}>
                    <span style={{ fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: palette.inkFaint }}>
                      {label}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 10.5, color: valueTone ?? palette.ink }}>{value}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
