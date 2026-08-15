/**
 * The plant experience: one 3D scene, two places to look at it from.
 *
 * How the fullscreen move works
 * -----------------------------
 * The canvas lives in a `position: fixed` layer whose bounds are *measured*
 * from a placeholder sitting in the dashboard grid. In `overview` the layer is
 * pinned exactly over that placeholder; entering animates its bounds out to the
 * viewport. Nothing unmounts, so the WebGL context, the loaded GLBs and the
 * camera all survive the move — which is the whole reason it reads as flying
 * into the plant rather than opening a page.
 *
 * The dashboard behind it is never re-laid-out either: its chrome fades in
 * place while the layer grows over it. That costs nothing to reverse, so coming
 * back is exactly the same animation run backwards.
 *
 * Web-only (`.web.tsx`) alongside the canvas it hosts; the native build gets the
 * sibling stub.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import type { ConsolePalette } from '../../../lib/consoleTheme';
import type { PlantAssetTelemetry } from '../../../lib/plantAnalytics';
import { cameraModeFor, isImmersive, isTransitioning, PLANT_TRANSITION_MS } from '../../../lib/plantViewState';
import { PlantScene3D } from '../plant3d/PlantScene3D';
import type { PlantCameraCommand, ProjectedAsset } from '../plant3d/types';
import { PlantLabelLayer } from './PlantLabelLayer';
import type { PlantExperienceProps } from './plantExperienceTypes';

const SANS = 'Inter, system-ui, -apple-system, sans-serif';
const MONO = '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace';
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export type { PlantExperienceProps };

// ---------------------------------------------------------------------------
// Icons — inline so the control cluster needs no icon font to paint
// ---------------------------------------------------------------------------

type IconProps = { size?: number };
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const Icons = {
  orbit: ({ size = 14 }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
      <circle cx="12" cy="12" r="3.2" />
      <ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-28 12 12)" />
    </svg>
  ),
  pan: ({ size = 14 }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
      <path d="M12 3.5v17M3.5 12h17M12 3.5 9.6 6.2M12 3.5l2.4 2.7M12 20.5l-2.4-2.7M12 20.5l2.4-2.7M3.5 12l2.7-2.4M3.5 12l2.7 2.4M20.5 12l-2.7-2.4M20.5 12l-2.7 2.4" />
    </svg>
  ),
  zoomIn: ({ size = 14 }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 20.5 20.5M10.5 7.8v5.4M7.8 10.5h5.4" />
    </svg>
  ),
  zoomOut: ({ size = 14 }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 20.5 20.5M7.8 10.5h5.4" />
    </svg>
  ),
  fit: ({ size = 14 }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  ),
  reset: ({ size = 14 }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
      <path d="M4.5 12a7.5 7.5 0 1 1 2.3 5.4" />
      <path d="M4.2 7.4v4.3h4.3" />
    </svg>
  ),
  back: ({ size = 13 }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  ),
  expand: ({ size = 13 }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} {...stroke}>
      <path d="M4 9.5V4h5.5M20 14.5V20h-5.5M4 4l6 6M20 20l-6-6" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

function ControlButton({
  label,
  onPress,
  palette,
  isDark,
  children,
}: {
  label: string;
  onPress: () => void;
  palette: ConsolePalette;
  isDark: boolean;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={label}
        onClick={onPress}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          padding: 0,
          cursor: 'pointer',
          background: hover ? (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(10,11,13,0.05)') : 'transparent',
          border: 'none',
          color: hover ? palette.ink : palette.inkMuted,
          transition: `color 140ms ease, background 140ms ease`,
        }}
      >
        {children}
      </button>
      {/* Tooltip, not a permanent caption: six labelled buttons would be a
          toolbar competing with the plant. */}
      {hover ? (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            left: 'calc(100% + 7px)',
            top: '50%',
            transform: 'translateY(-50%)',
            padding: '2px 7px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            background: palette.panel,
            border: `1px solid ${palette.line}`,
            fontFamily: MONO,
            fontSize: 8.5,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: palette.inkMuted,
            boxShadow: isDark ? '0 6px 16px rgba(0,0,0,0.45)' : '0 4px 12px rgba(15,20,30,0.14)',
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}

function SceneControls({
  palette,
  isDark,
  onCommand,
}: {
  palette: ConsolePalette;
  isDark: boolean;
  onCommand: (kind: PlantCameraCommand['kind']) => void;
}) {
  const items: { key: string; label: string; icon: ReactNode; run: () => void }[] = [
    { key: 'orbit', label: 'Orbit — drag', icon: <Icons.orbit />, run: () => onCommand('reset') },
    { key: 'pan', label: 'Pan — right-drag', icon: <Icons.pan />, run: () => onCommand('reset') },
    { key: 'in', label: 'Zoom in', icon: <Icons.zoomIn />, run: () => onCommand('zoom-in') },
    { key: 'out', label: 'Zoom out', icon: <Icons.zoomOut />, run: () => onCommand('zoom-out') },
    { key: 'fit', label: 'Fit plant', icon: <Icons.fit />, run: () => onCommand('fit') },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 6,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 5,
        overflow: 'hidden',
        background: palette.panel,
        border: `1px solid ${palette.line}`,
        boxShadow: isDark ? '0 8px 22px rgba(0,0,0,0.45)' : '0 6px 16px rgba(15,20,30,0.12)',
      }}
    >
      {items.map((item, index) => (
        <div
          key={item.key}
          style={{ borderTop: index === 0 ? 'none' : `1px solid ${palette.line}` }}
        >
          <ControlButton label={item.label} onPress={item.run} palette={palette} isDark={isDark}>
            {item.icon}
          </ControlButton>
        </div>
      ))}
    </div>
  );
}

/** Contextual inspector for the selected asset. */
function AssetDetails({
  asset,
  palette,
  isDark,
  statusColor,
  onClose,
}: {
  asset: PlantAssetTelemetry;
  palette: ConsolePalette;
  isDark: boolean;
  statusColor: string;
  onClose: () => void;
}) {
  const rows: [string, string][] = [
    ['Machines', String(asset.machines).padStart(2, '0')],
    ['Active', String(asset.machinesActive).padStart(2, '0')],
    ['Power', asset.powerKw >= 1000 ? `${(asset.powerKw / 1000).toFixed(2)} MW` : `${Math.round(asset.powerKw)} kW`],
    ['Temperature', `${asset.temperatureC.toFixed(1)} °C`],
    ['Alarms', String(asset.alarms).padStart(2, '0')],
    ['Health', `${asset.health}/100`],
    ['OEE', `${asset.oee}%`],
    ['Telemetry', asset.telemetry],
  ];
  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: 12,
        bottom: 12,
        width: 232,
        zIndex: 7,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 5,
        overflow: 'hidden',
        background: palette.panel,
        border: `1px solid ${palette.line}`,
        boxShadow: isDark ? '0 14px 34px rgba(0,0,0,0.5)' : '0 10px 24px rgba(15,20,30,0.14)',
      }}
    >
      <div style={{ padding: '9px 11px', borderBottom: `1px solid ${palette.line}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: statusColor, marginTop: 5, flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: palette.ink }}>
              {asset.name}
            </div>
            <div style={{ marginTop: 3, fontFamily: MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: statusColor }}>
              {asset.status}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close asset details"
            onClick={onClose}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer', padding: 2,
              color: palette.inkFaint, fontFamily: MONO, fontSize: 12, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      <div style={{ padding: '7px 11px', display: 'grid', gap: 4, overflowY: 'auto' }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: palette.inkFaint }}>
              {label}
            </span>
            <span style={{ flex: 1, borderBottom: `1px dotted ${palette.line}`, transform: 'translateY(-2px)' }} />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                color: label === 'Alarms' && asset.alarms > 0 ? statusColor : palette.ink,
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>

      {asset.areaName ? (
        <div style={{ marginTop: 'auto', padding: '7px 11px', borderTop: `1px solid ${palette.line}` }}>
          {/* Provenance: which telemetry area these numbers actually came from. */}
          <div style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: palette.inkFaint }}>
            Telemetry source
          </div>
          <div style={{ marginTop: 3, fontFamily: SANS, fontSize: 10.5, color: palette.inkMuted }}>{asset.areaName}</div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

export default function PlantExperience({
  mode,
  onEnter,
  onExit,
  scene,
  statusColors,
  callouts,
  palette,
  isDark,
  plantName,
  live,
  assets,
  selectedId,
  onSelect,
  // `canEdit`/`onEdit` stay in the contract for the native stub and the page
  // header, but the world itself no longer carries an edit button — it was the
  // second one on screen.
}: PlantExperienceProps) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [layerSize, setLayerSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [projected, setProjected] = useState<ProjectedAsset[]>([]);
  const [command, setCommand] = useState<PlantCameraCommand | null>(null);
  const commandId = useRef(0);

  const immersive = isImmersive(mode);
  const transitioning = isTransitioning(mode);

  // --- keep the layer pinned over its placeholder ---------------------------
  useLayoutEffect(() => {
    const element = placeholderRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setBounds((current) =>
        current &&
        Math.abs(current.top - rect.top) < 0.5 &&
        Math.abs(current.left - rect.left) < 0.5 &&
        Math.abs(current.width - rect.width) < 0.5 &&
        Math.abs(current.height - rect.height) < 0.5
          ? current
          : { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // `true` for capture: the console scrolls inner containers, not the window.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, []);

  // --- the label solver works in canvas pixels, so it needs the live size ---
  useLayoutEffect(() => {
    const element = layerRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setLayerSize((current) =>
        Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // --- Esc leaves the twin --------------------------------------------------
  useEffect(() => {
    if (mode !== 'immersive') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Esc unwinds one level at a time: clear the selection first, leave second.
      if (selectedId) onSelect(null);
      else onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onExit, onSelect, selectedId]);

  const runCommand = useCallback((kind: PlantCameraCommand['kind']) => {
    commandId.current += 1;
    setCommand({ id: commandId.current, kind });
  }, []);

  const handleBackgroundClick = useCallback(() => {
    if (transitioning) return;
    // From the dashboard, clicking the yard is how you go in. Inside, it is how
    // you drop the current selection.
    if (immersive) onSelect(null);
    else onEnter();
  }, [immersive, onEnter, onSelect, transitioning]);

  const handleSelectComponent = useCallback(
    (id: string) => {
      if (transitioning) return;
      onSelect(id);
      // Selecting an asset from the dashboard is a request to go and look at
      // it, so the same gesture enters and focuses.
      if (!immersive) onEnter();
    },
    [immersive, onEnter, onSelect, transitioning],
  );

  const selected = selectedId ? assets.find((asset) => asset.id === selectedId) ?? null : null;

  const layerStyle: CSSProperties = immersive
    ? { top: 0, left: 0, width: '100vw', height: '100vh' }
    : bounds
      ? { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height }
      : { top: 0, left: 0, width: 0, height: 0, opacity: 0 };

  return (
    <>
      {/* The placeholder reserves the region the world occupies and is what the
          fixed layer measures itself against. Deliberately unstyled: the 3D is
          the page's ground, not a card sitting on it, so there is no frame, no
          radius and no fill to give it an edge. */}
      <div ref={placeholderRef} style={{ flex: 1, minHeight: 0, minWidth: 0 }} />

      <div
        ref={layerRef}
        style={{
          position: 'fixed',
          zIndex: immersive ? 80 : 1,
          overflow: 'hidden',
          background: palette.bg,
          boxSizing: 'border-box',
          transition: `top ${PLANT_TRANSITION_MS}ms ${EASE}, left ${PLANT_TRANSITION_MS}ms ${EASE}, width ${PLANT_TRANSITION_MS}ms ${EASE}, height ${PLANT_TRANSITION_MS}ms ${EASE}`,
          cursor: hoveredId ? 'pointer' : 'grab',
          ...layerStyle,
        }}
      >
        <PlantScene3D
          scene={scene}
          statusColors={statusColors}
          callouts={callouts}
          dark={isDark}
          viewMode={cameraModeFor(mode)}
          selectedComponentId={selectedId}
          onSelectComponent={handleSelectComponent}
          onHoverComponent={setHoveredId}
          onBackgroundClick={handleBackgroundClick}
          cameraCommand={command}
          labelMode="projected"
          onProjectLabels={setProjected}
        />

        <PlantLabelLayer
          projected={projected}
          assets={assets}
          statusColors={statusColors}
          hoveredId={hoveredId}
          selectedId={selectedId}
          onHover={setHoveredId}
          onSelect={handleSelectComponent}
          palette={palette}
          isDark={isDark}
          width={layerSize.width}
          height={layerSize.height}
          // Labels are noise while the frame is moving; they come back the
          // instant the move lands.
          visible={!transitioning}
        />

        <SceneControls palette={palette} isDark={isDark} onCommand={runCommand} />

        {/* --- immersive header --- */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            zIndex: 7,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            opacity: immersive ? 1 : 0,
            transform: immersive ? 'translateY(0)' : 'translateY(-6px)',
            pointerEvents: immersive ? 'auto' : 'none',
            transition: `opacity 240ms ${EASE} ${immersive ? '180ms' : '0ms'}, transform 240ms ${EASE}`,
          }}
        >
          <button
            type="button"
            onClick={onExit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px 5px 7px',
              cursor: 'pointer',
              borderRadius: 5,
              background: palette.panel,
              border: `1px solid ${palette.line}`,
              color: palette.inkMuted,
              fontFamily: MONO,
              fontSize: 8.5,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            <Icons.back />
            Plant overview
          </button>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: palette.ink,
            }}
          >
            {plantName}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 7px',
              borderRadius: 999,
              background: live ? 'rgba(63,191,106,0.12)' : 'transparent',
              border: `1px solid ${live ? 'rgba(63,191,106,0.3)' : palette.line}`,
            }}
          >
            <span style={{ width: 4.5, height: 4.5, borderRadius: 999, background: live ? palette.accent : palette.neutral }} />
            <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.14em', color: live ? palette.accent : palette.inkFaint }}>
              {live ? 'LIVE' : 'DEMO'}
            </span>
          </span>
        </div>

        {/* Entering is a header action and a click on the empty yard; there is
            no button over the world, because every corner of it is already
            spoken for by the KPI strip, the analytics column and the charts. */}

        {/* --- asset inspector, immersive only --- */}
        {immersive && selected ? (
          <AssetDetails
            asset={selected}
            palette={palette}
            isDark={isDark}
            statusColor={statusColors[selected.id] ?? palette.accent}
            onClose={() => onSelect(null)}
          />
        ) : null}
      </div>
    </>
  );
}
