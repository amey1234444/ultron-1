import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { splinePath, useSmoothTimedValues } from '../../../../lib/chartMotion';
import { cn } from '../../../../lib/cn';
import { alpha, consolePalette, floatingElevation } from '../../../../lib/consoleTheme';
import type { TrendSample } from '../../../../lib/liveChannelValue';
import { text } from '../../../ui';
import {
  decimate,
  formatInstant,
  formatTick,
  nearestIndex,
  niceDomain,
  niceTimeStep,
  medianInterval,
  segmentByState,
  sliceVisible,
  splitOnGaps,
  stateOf,
  timeTicks,
  type Limits,
  type SignalState,
} from './chartMath';

/**
 * The analytical plot.
 *
 * Chart-first, in the sense the trends brief asks for: the plot is the object
 * on the page, and everything drawn on it is either the measurement, a limit
 * the measurement is judged against, or the furniture needed to read a value
 * off it. Nothing decorative.
 *
 * What is on it, and what each thing is for:
 *
 *   grid          two weights. Majors are what a value is read against and sit
 *                 under every axis label; minors halve them for finer reading.
 *                 Both are neutral tokens, not the series colour at an opacity.
 *   zones         alert and danger shaded, and at half strength on white: on a
 *                 signal sitting near its limits these bands cover most of the
 *                 plot, so they have to be faint enough that most of the plot
 *                 still reads as white. They follow the Thresholds control.
 *   limits        1px dashed, in the meaning's own colour, labelled at the left
 *                 edge — ALERT 2.50 / DANGER 3.50, the same words and the same
 *                 numbers the sensor tiles and the analysis layer use.
 *   series        segmented by state. Green while in limits, amber over alert,
 *                 red over danger, with the colour changing exactly on the
 *                 threshold rather than at the next sample — see segmentByState.
 *   live marker   the newest sample, as a small dot with a ring. No animation:
 *                 a pulsing marker on a screen an operator watches all shift is
 *                 a distraction, not an indicator.
 *   value flag    the latest reading on the right axis, in its status colour.
 *   crosshair     neutral guides, a timestamp and the exact value, snapped to
 *                 the nearest real sample so a scrubbed reading is a reading
 *                 that was actually taken.
 *
 * Interaction: wheel to zoom about the cursor, drag to pan, double-click to
 * reset. The first two are wired through DOM listeners on the web because
 * react-native has no wheel event; on a native target the chart is still fully
 * readable and the toolbar's reset control still applies.
 */

const AXIS_W = 58;
const AXIS_H = 22;
const PAD_TOP = 10;
const PAD_BOTTOM = 8;
const Y_TICKS = 6;
/** Below this many pixels per label the time axis starts colliding with itself. */
const X_LABEL_WIDTH = 62;
const MIN_SPAN_MS = 200;

export type TrendChartProps = {
  samples: TrendSample[];
  /** Viewport, in epoch milliseconds. */
  from: number;
  to: number;
  limits: Limits;
  unit: string;
  decimals: number;
  /** The signal's name, for the tooltip. */
  label: string;
  showLimits: boolean;
  height: number;
  /** A manual pan or zoom. The host uses this to leave live-follow. */
  onViewport: (from: number, to: number) => void;
  onReset: () => void;
  /** The feed has stopped refreshing. The plot says so rather than implying live. */
  stale?: boolean;
};

export function TrendChart({
  samples,
  from,
  to,
  limits,
  unit,
  decimals,
  label,
  showLimits,
  height,
  onViewport,
  onReset,
  stale = false,
}: TrendChartProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const [width, setWidth] = useState(0);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const surface = useRef<View | null>(null);
  const drag = useRef<{ x: number; from: number; to: number } | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((previous) => (Math.abs(previous - next) < 1 ? previous : next));
  }, []);

  const plotW = Math.max(0, width - AXIS_W);
  const plotH = Math.max(0, height - AXIS_H);
  const top = PAD_TOP;
  const bottom = Math.max(top + 1, plotH - PAD_BOTTOM);

  const span = Math.max(MIN_SPAN_MS, to - from);
  const zoneOpacity = isDark ? 0.055 : 0.028;
  const fmt = useCallback((value: number) => value.toFixed(decimals), [decimals]);

  // --- data ------------------------------------------------------------------
  const visible = useMemo(() => sliceVisible(samples, from, to), [samples, from, to]);
  const drawn = useMemo(
    () => (plotW > 0 ? decimate(visible, from, to, Math.max(2, Math.round(plotW))) : visible),
    [visible, from, to, plotW],
  );
  const flowingDrawn = useSmoothTimedValues(drawn, stale ? 900 : 650);

  const domain = useMemo(() => {
    const values = [...visible, ...flowingDrawn].map((sample) => sample.v);
    const references = [limits.alert, limits.danger].filter((v): v is number => typeof v === 'number');
    if (values.length === 0) {
      return references.length > 0
        ? niceDomain(0, Math.max(...references) * 1.15, Y_TICKS)
        : niceDomain(0, 1, Y_TICKS);
    }
    const lo = Math.min(...values, ...references);
    const hi = Math.max(...values, ...references);
    // A dead-flat signal has no range of its own; give it one so the line sits
    // in the middle of the plot rather than welded to an edge.
    const pad = (hi - lo) * 0.12 || Math.max(Math.abs(hi) * 0.05, 0.5);
    return niceDomain(lo - pad, hi + pad, Y_TICKS);
  }, [visible, flowingDrawn, limits.alert, limits.danger]);

  const valueSpan = domain.hi - domain.lo || 1;
  const y = useCallback(
    (value: number) => bottom - ((value - domain.lo) / valueSpan) * (bottom - top),
    [bottom, top, domain.lo, valueSpan],
  );
  const x = useCallback((t: number) => ((t - from) / span) * plotW, [from, span, plotW]);

  const yTicks = useMemo(
    () => Array.from({ length: Y_TICKS }, (_, index) => domain.hi - (valueSpan * index) / (Y_TICKS - 1)),
    [domain.hi, valueSpan],
  );
  const xStep = useMemo(
    () => niceTimeStep(span, Math.max(2, Math.floor(plotW / X_LABEL_WIDTH))),
    [span, plotW],
  );
  const xTicks = useMemo(() => timeTicks(from, to, xStep), [from, to, xStep]);
  const xMinor = useMemo(() => timeTicks(from, to, xStep / 2), [from, to, xStep]);

  // A pause in the feed is drawn as a pause. Five times the channel's own
  // cadence is comfortably past jitter and well short of a reconnect.
  const gapMs = useMemo(() => {
    const cadence = medianInterval(visible);
    return cadence === null ? null : Math.max(cadence * 5, 1500);
  }, [visible]);

  const segments = useMemo(
    () => splitOnGaps(flowingDrawn, gapMs).flatMap((run) => segmentByState(run, limits)),
    [flowingDrawn, gapMs, limits],
  );

  const seriesColour = useCallback(
    (state: SignalState) =>
      state === 'danger' ? palette.chartDanger : state === 'alert' ? palette.chartAlert : palette.chartNormal,
    [palette],
  );

  const latest = samples.length > 0 ? samples[samples.length - 1] : null;
  const latestInView = latest !== null && latest.t >= from && latest.t <= to;
  const latestPainted = latestInView ? (flowingDrawn.find((sample) => sample.t === latest?.t) ?? flowingDrawn[flowingDrawn.length - 1] ?? latest) : latest;
  const latestState = latestPainted ? stateOf(latestPainted.v, limits) : 'normal';

  // --- crosshair -------------------------------------------------------------
  const cursorSample = useMemo(() => {
    if (cursorX === null || visible.length === 0 || plotW <= 0) return null;
    const at = from + (cursorX / plotW) * span;
    const index = nearestIndex(visible, at);
    return index >= 0 ? visible[index] : null;
  }, [cursorX, visible, from, span, plotW]);

  // --- interaction -----------------------------------------------------------
  const zoomAbout = useCallback(
    (fraction: number, factor: number) => {
      const anchorMs = from + span * fraction;
      const nextSpan = Math.max(MIN_SPAN_MS, span * factor);
      onViewport(anchorMs - nextSpan * fraction, anchorMs + nextSpan * (1 - fraction));
    },
    [from, span, onViewport],
  );

  // Wheel and double-click have no react-native equivalent, so they are attached
  // to the underlying DOM node where there is one. On a native target the guard
  // simply means neither exists, and the toolbar still owns reset.
  useEffect(() => {
    const node = surface.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;

    const onWheel = (event: WheelEvent) => {
      if (plotW <= 0) return;
      event.preventDefault();
      const bounds = node.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / plotW));
      zoomAbout(fraction, event.deltaY > 0 ? 1.18 : 1 / 1.18);
    };
    const onDoubleClick = (event: MouseEvent) => {
      event.preventDefault();
      onReset();
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('dblclick', onDoubleClick);
    return () => {
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('dblclick', onDoubleClick);
    };
  }, [zoomAbout, onReset, plotW]);

  const localX = (event: { nativeEvent: unknown }): number | null => {
    const native = event.nativeEvent as { offsetX?: number; locationX?: number };
    const value = native.offsetX ?? native.locationX;
    return typeof value === 'number' ? value : null;
  };

  const onPointerDown = (event: { nativeEvent: unknown }) => {
    const at = localX(event);
    if (at === null) return;
    drag.current = { x: at, from, to };
  };

  const onPointerMove = (event: { nativeEvent: unknown }) => {
    const at = localX(event);
    if (at === null || plotW <= 0) return;
    setCursorX(Math.max(0, Math.min(plotW, at)));
    const dragging = drag.current;
    if (!dragging) return;
    const shift = ((dragging.x - at) / plotW) * (dragging.to - dragging.from);
    onViewport(dragging.from + shift, dragging.to + shift);
  };

  const endDrag = () => {
    drag.current = null;
  };

  const ready = plotW > 4 && plotH > 40;
  const hasLine = ready && segments.length > 0;

  return (
    <View style={{ height }} onLayout={onLayout}>
      <View className="flex-row" style={{ height: plotH }}>
        {/* ── the plot ─────────────────────────────────────────────────── */}
        <View
          ref={surface}
          collapsable={false}
          className="min-w-0 flex-1 overflow-hidden"
          style={{ height: plotH, backgroundColor: palette.chartBg, cursor: 'crosshair' } as never}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={() => {
            endDrag();
            setCursorX(null);
          }}
        >
          {ready ? (
            <View pointerEvents="none">
              <Svg width={plotW} height={plotH}>
                {/* Threshold zones.
                    They are bands, not blocks: on a signal sitting near its
                    limits the alert and danger zones between them cover most of
                    the plot, so the opacity has to be low enough that "most of
                    the plot" still reads as white. Light mode runs at half the
                    dark figure — a 6% amber wash over 80% of a white chart is a
                    cream chart, and the line stops being the strongest object
                    on it. They follow the Thresholds control, because a zone
                    with no line to anchor it is decoration. */}
                {showLimits && limits.alert !== undefined ? (
                  <Rect
                    x={0}
                    y={limits.danger !== undefined ? y(limits.danger) : 0}
                    width={plotW}
                    height={Math.max(0, y(limits.alert) - (limits.danger !== undefined ? y(limits.danger) : 0))}
                    fill={palette.chartAlert}
                    fillOpacity={zoneOpacity}
                  />
                ) : null}
                {showLimits && limits.danger !== undefined ? (
                  <Rect
                    x={0}
                    y={0}
                    width={plotW}
                    height={Math.max(0, y(limits.danger))}
                    fill={palette.chartDanger}
                    fillOpacity={zoneOpacity * 1.1}
                  />
                ) : null}

                {/* Minor grid, then major. Order matters: a major line must not
                    be half-covered by the minor drawn after it. */}
                {xMinor.map((tick) => {
                  const px = Math.round(x(tick)) + 0.5;
                  return <Line key={`xm${tick}`} x1={px} y1={0} x2={px} y2={plotH} stroke={palette.chartGridMinor} strokeWidth={1} />;
                })}
                {yTicks.map((tick) => {
                  const py = Math.round(y(tick - domain.step / 2)) + 0.5;
                  return <Line key={`ym${tick}`} x1={0} y1={py} x2={plotW} y2={py} stroke={palette.chartGridMinor} strokeWidth={1} />;
                })}
                {xTicks.map((tick) => {
                  const px = Math.round(x(tick)) + 0.5;
                  return <Line key={`x${tick}`} x1={px} y1={0} x2={px} y2={plotH} stroke={palette.chartGridMajor} strokeWidth={1} />;
                })}
                {yTicks.map((tick) => {
                  const py = Math.round(y(tick)) + 0.5;
                  return <Line key={`y${tick}`} x1={0} y1={py} x2={plotW} y2={py} stroke={palette.chartGridMajor} strokeWidth={1} />;
                })}

                {/* Configured limits. 1px dashed — a thick limit line reads as
                    data, and there is only one line here that is data. */}
                {showLimits && limits.alert !== undefined ? (
                  <Line
                    x1={0}
                    y1={y(limits.alert)}
                    x2={plotW}
                    y2={y(limits.alert)}
                    stroke={palette.chartAlert}
                    strokeWidth={1}
                    strokeDasharray="5 4"
                    opacity={0.85}
                  />
                ) : null}
                {showLimits && limits.danger !== undefined ? (
                  <Line
                    x1={0}
                    y1={y(limits.danger)}
                    x2={plotW}
                    y2={y(limits.danger)}
                    stroke={palette.chartDanger}
                    strokeWidth={1}
                    strokeDasharray="5 4"
                    opacity={0.85}
                  />
                ) : null}

                {/* The measurement. One path per state run. */}
                {segments.map((segment, index) => (
                  <Path
                    key={`seg${index}`}
                    d={splinePath(segment.points.map((point) => ({ x: x(point.t), y: y(point.v) })), 0.45)}
                    fill="none"
                    stroke={seriesColour(segment.state)}
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}

                {/* The newest sample. */}
                {latestInView && latestPainted ? (
                  <>
                    <Circle cx={x(latestPainted.t)} cy={y(latestPainted.v)} r={6} fill={seriesColour(latestState)} fillOpacity={stale ? 0.08 : 0.18} />
                    <Circle
                      cx={x(latestPainted.t)}
                      cy={y(latestPainted.v)}
                      r={3}
                      fill={stale ? palette.chartBg : seriesColour(latestState)}
                      stroke={seriesColour(latestState)}
                      strokeWidth={1.5}
                    />
                  </>
                ) : null}

                {/* Crosshair: neutral, never the status hue. */}
                {cursorX !== null && cursorSample ? (
                  <>
                    <Line
                      x1={Math.round(x(cursorSample.t)) + 0.5}
                      y1={0}
                      x2={Math.round(x(cursorSample.t)) + 0.5}
                      y2={plotH}
                      stroke={palette.chartCrosshair}
                      strokeWidth={1}
                    />
                    <Line
                      x1={0}
                      y1={Math.round(y(cursorSample.v)) + 0.5}
                      x2={plotW}
                      y2={Math.round(y(cursorSample.v)) + 0.5}
                      stroke={palette.chartCrosshair}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <Circle
                      cx={x(cursorSample.t)}
                      cy={y(cursorSample.v)}
                      r={3.5}
                      fill={palette.chartBg}
                      stroke={seriesColour(stateOf(cursorSample.v, limits))}
                      strokeWidth={2}
                    />
                  </>
                ) : null}
              </Svg>
            </View>
          ) : null}

          {/* Limit labels, at the edge the axis is not on. */}
          {ready && showLimits ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}>
              {limits.alert !== undefined ? (
                <LimitLabel top={y(limits.alert)} word="ALERT" value={fmt(limits.alert)} colour={palette.chartAlert} bg={palette.chartBg} />
              ) : null}
              {limits.danger !== undefined ? (
                <LimitLabel top={y(limits.danger)} word="DANGER" value={fmt(limits.danger)} colour={palette.chartDanger} bg={palette.chartBg} />
              ) : null}
            </View>
          ) : null}

          {/* Tooltip. Follows the cursor and flips at the halfway mark so it
              never covers the part of the line being read. */}
          {ready && cursorSample && cursorX !== null ? (
            <View
              pointerEvents="none"
              className="absolute rounded-[10px] border px-3 py-2"
              style={{
                top: 10,
                ...(cursorX > plotW * 0.55 ? { right: plotW - x(cursorSample.t) + 12 } : { left: x(cursorSample.t) + 12 }),
                minWidth: 168,
                borderColor: isDark ? palette.lineStrong : palette.line,
                backgroundColor: palette.chartTooltipBg,
                ...floatingElevation(isDark),
              }}
            >
              <Text numberOfLines={1} className={text.label} style={{ color: palette.inkFaint }}>
                {label}
              </Text>
              <Text className={cn('mt-1', text.meta)} style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}>
                {formatInstant(cursorSample.t)}
              </Text>
              <View className="mt-1.5 flex-row items-baseline gap-1.5">
                <Text className={text.dataLg} style={{ color: palette.chartText, fontVariant: ['tabular-nums'] }}>
                  {fmt(cursorSample.v)}
                </Text>
                <Text className={text.meta} style={{ color: palette.inkMuted }}>
                  {unit}
                </Text>
              </View>
              <TooltipRow
                label="Status"
                value={stateOf(cursorSample.v, limits).toUpperCase()}
                colour={seriesColour(stateOf(cursorSample.v, limits))}
              />
              {limits.alert !== undefined ? <TooltipRow label="Alert" value={fmt(limits.alert)} /> : null}
              {limits.danger !== undefined ? <TooltipRow label="Danger" value={fmt(limits.danger)} /> : null}
            </View>
          ) : null}

          {!hasLine && ready ? (
            <View className="absolute inset-0 items-center justify-center">
              <Text className={text.body} style={{ color: palette.inkFaint }}>
                No trend data available for this window.
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── right value axis ─────────────────────────────────────────── */}
        <View style={{ width: AXIS_W, height: plotH, borderLeftWidth: 1, borderLeftColor: palette.chartAxis }}>
          {ready
            ? yTicks.map((tick) => (
                <Text
                  key={`l${tick}`}
                  numberOfLines={1}
                  className={cn('absolute', text.meta)}
                  style={{ left: 7, top: y(tick) - 7, color: palette.chartAxisText, fontVariant: ['tabular-nums'] }}
                >
                  {fmt(tick)}
                </Text>
              ))
            : null}

          {/* The latest reading, in its status colour — the one number this axis
              exists to carry. */}
          {ready && latestPainted ? (
            <View
              className="absolute rounded-[5px] px-1.5 py-[2px]"
              style={{
                left: 3,
                right: 3,
                top: Math.max(0, Math.min(plotH - 16, y(latestPainted.v) - 8)),
                backgroundColor: stale ? palette.panelRaised : seriesColour(latestState),
                borderWidth: stale ? 1 : 0,
                borderColor: palette.line,
              }}
            >
              <Text
                numberOfLines={1}
                className={text.code}
                style={{ color: stale ? palette.inkMuted : '#FFFFFF', fontVariant: ['tabular-nums'] }}
              >
                {fmt(latestPainted.v)}
              </Text>
            </View>
          ) : null}

          {/* The cursor's own value, on the axis it belongs to. */}
          {ready && cursorSample ? (
            <View
              className="absolute rounded-[5px] px-1.5 py-[2px]"
              style={{
                left: 3,
                right: 3,
                top: Math.max(0, Math.min(plotH - 16, y(cursorSample.v) - 8)),
                backgroundColor: palette.ink,
              }}
            >
              <Text numberOfLines={1} className={text.code} style={{ color: palette.panel, fontVariant: ['tabular-nums'] }}>
                {fmt(cursorSample.v)}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── time axis ──────────────────────────────────────────────────── */}
      <View style={{ height: AXIS_H, borderTopWidth: 1, borderTopColor: palette.chartAxis }}>
        {ready
          ? xTicks.map((tick) => {
              const px = x(tick);
              // Dropped rather than clipped at the edges: half a timestamp is
              // worse than none.
              if (px < 18 || px > plotW - 18) return null;
              return (
                <Text
                  key={`t${tick}`}
                  numberOfLines={1}
                  className={cn('absolute', text.meta)}
                  style={{
                    left: px - X_LABEL_WIDTH / 2,
                    width: X_LABEL_WIDTH,
                    top: 4,
                    textAlign: 'center',
                    color: palette.chartAxisText,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {formatTick(tick, span)}
                </Text>
              );
            })
          : null}
        <Text
          className={cn('absolute', text.meta)}
          style={{ right: 8, top: 4, color: palette.inkFaint }}
        >
          {unit}
        </Text>
      </View>
    </View>
  );
}

function LimitLabel({
  top,
  word,
  value,
  colour,
  bg,
}: {
  top: number;
  word: string;
  value: string;
  colour: string;
  bg: string;
}) {
  return (
    <View
      className="absolute flex-row items-center gap-1.5 rounded-[4px] px-1.5"
      style={{ left: 6, top: top - 8, backgroundColor: alpha(bg, 0.85) }}
    >
      <Text className={text.label} style={{ color: colour }}>
        {word}
      </Text>
      <Text className={text.code} style={{ color: colour, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}

function TooltipRow({ label, value, colour }: { label: string; value: string; colour?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className="mt-1 flex-row items-center justify-between gap-3">
      <Text className={text.meta} style={{ color: palette.inkMuted }}>
        {label}
      </Text>
      <Text className={text.meta} style={{ color: colour ?? palette.chartText, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </View>
  );
}
