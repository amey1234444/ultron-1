/**
 * Chart primitives for the Plant Overview.
 *
 * These are deliberately not a chart library. Everything the overview plots is
 * small, dense and subordinate to the 3D plant, so each of these draws exactly
 * one thing with a hairline stroke, a quiet grid and 8px axis type — the
 * proportions an engineering readout uses, which no chart library default gets
 * right without being fought.
 *
 * Rendered with `react-native-svg`, the same as the rest of the console, so they
 * compose into the react-native tree and survive the native build.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import type { ConsolePalette } from '../../../lib/consoleTheme';

const AXIS_FONT = 8;

/**
 * Renders children once the box has a real size.
 *
 * Charts need pixel dimensions and the layout is fluid, so every chart here is
 * wrapped in this rather than being handed a guessed width.
 */
export function Measured({
  children,
  style,
}: {
  children: (size: { width: number; height: number }) => ReactNode;
  style?: object;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
        ? current
        : { width, height },
    );
  }, []);
  return (
    <View style={[{ flex: 1, minHeight: 0, minWidth: 0 }, style]} onLayout={onLayout}>
      {size.width > 1 && size.height > 1 ? children(size) : null}
    </View>
  );
}

function scaleY(value: number, min: number, max: number, top: number, height: number): number {
  const span = max - min || 1;
  return top + height - ((value - min) / span) * height;
}

/** Catmull-Rom through the samples, emitted as cubic beziers. */
function spline(points: { x: number; y: number }[], tension = 0.5): string {
  if (points.length === 0) return '';
  if (points.length < 3) return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    path += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return path;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + 1e-6; value += step) ticks.push(value);
  return ticks;
}

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
  if (Math.abs(value) >= 10) return String(Math.round(value));
  return String(Math.round(value * 10) / 10);
}

// ---------------------------------------------------------------------------
// Area chart — electricity demand
// ---------------------------------------------------------------------------

export function AreaChart({
  values,
  width,
  height,
  palette,
  color,
  xLabels,
}: {
  values: number[];
  width: number;
  height: number;
  palette: ConsolePalette;
  color: string;
  xLabels: string[];
}) {
  if (values.length < 2) return null;
  const padLeft = 26;
  const padBottom = 13;
  const padTop = 4;
  const plotW = Math.max(1, width - padLeft - 2);
  const plotH = Math.max(1, height - padBottom - padTop);

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // A demand curve read against a zero baseline is a flat line; the window is
  // padded around the data instead so the shape is legible.
  const min = Math.max(0, rawMin - (rawMax - rawMin) * 0.55);
  const max = rawMax + (rawMax - rawMin) * 0.25;
  const ticks = niceTicks(min, max, 3);

  const points = values.map((value, index) => ({
    x: padLeft + (index / (values.length - 1)) * plotW,
    y: scaleY(value, min, max, padTop, plotH),
  }));
  const line = spline(points);
  const area = `${line} L${points[points.length - 1].x},${padTop + plotH} L${points[0].x},${padTop + plotH} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.3} />
          <Stop offset="1" stopColor={color} stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <G>
        {ticks.map((tick) => {
          const y = scaleY(tick, min, max, padTop, plotH);
          return (
            <G key={tick}>
              <Line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke={palette.grid} strokeWidth={1} />
              <SvgText x={padLeft - 5} y={y + 3} fontSize={AXIS_FONT} fill={palette.inkFaint} textAnchor="end">
                {formatTick(tick)}
              </SvgText>
            </G>
          );
        })}
      </G>
      <Path d={area} fill="url(#demandFill)" />
      <Path d={line} stroke={color} strokeWidth={1.35} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {xLabels.map((label, index) => (
        <SvgText
          key={label}
          x={padLeft + (index / (xLabels.length - 1)) * plotW}
          y={height - 2}
          fontSize={AXIS_FONT}
          fill={palette.inkFaint}
          textAnchor={index === 0 ? 'start' : index === xLabels.length - 1 ? 'end' : 'middle'}
        >
          {label}
        </SvgText>
      ))}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Multi-series line — operating power
// ---------------------------------------------------------------------------

export function MultiLineChart({
  series,
  width,
  height,
  palette,
  xLabels,
}: {
  series: { id: string; values: number[]; color: string }[];
  width: number;
  height: number;
  palette: ConsolePalette;
  xLabels: string[];
}) {
  const all = series.flatMap((entry) => entry.values);
  if (all.length === 0) return null;
  const padLeft = 20;
  const padBottom = 13;
  const padTop = 4;
  const plotW = Math.max(1, width - padLeft - 2);
  const plotH = Math.max(1, height - padBottom - padTop);
  const min = 0;
  const max = Math.max(...all) * 1.18 || 1;
  const ticks = niceTicks(min, max, 4);

  return (
    <Svg width={width} height={height}>
      {ticks.map((tick) => {
        const y = scaleY(tick, min, max, padTop, plotH);
        return (
          <G key={tick}>
            <Line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke={palette.grid} strokeWidth={1} />
            <SvgText x={padLeft - 5} y={y + 3} fontSize={AXIS_FONT} fill={palette.inkFaint} textAnchor="end">
              {formatTick(tick)}
            </SvgText>
          </G>
        );
      })}
      {series.map((entry) => (
        <Path
          key={entry.id}
          d={spline(
            entry.values.map((value, index) => ({
              x: padLeft + (index / (entry.values.length - 1)) * plotW,
              y: scaleY(value, min, max, padTop, plotH),
            })),
          )}
          stroke={entry.color}
          strokeWidth={1.2}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {xLabels.map((label, index) => (
        <SvgText
          key={label}
          x={padLeft + (index / (xLabels.length - 1)) * plotW}
          y={height - 2}
          fontSize={AXIS_FONT}
          fill={palette.inkFaint}
          textAnchor={index === 0 ? 'start' : index === xLabels.length - 1 ? 'end' : 'middle'}
        >
          {label}
        </SvgText>
      ))}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Bars — energy cost
// ---------------------------------------------------------------------------

export function BarChart({
  values,
  labels,
  width,
  height,
  palette,
  color,
}: {
  values: number[];
  labels: string[];
  width: number;
  height: number;
  palette: ConsolePalette;
  color: string;
}) {
  if (values.length === 0) return null;
  const padLeft = 26;
  const padBottom = 13;
  const padTop = 4;
  const plotW = Math.max(1, width - padLeft - 2);
  const plotH = Math.max(1, height - padBottom - padTop);
  const max = Math.max(...values) * 1.12 || 1;
  const ticks = niceTicks(0, max, 3);
  const slot = plotW / values.length;
  const barW = Math.max(2, Math.min(11, slot * 0.56));

  return (
    <Svg width={width} height={height}>
      {ticks.map((tick) => {
        const y = scaleY(tick, 0, max, padTop, plotH);
        return (
          <G key={tick}>
            <Line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke={palette.grid} strokeWidth={1} />
            <SvgText x={padLeft - 5} y={y + 3} fontSize={AXIS_FONT} fill={palette.inkFaint} textAnchor="end">
              {formatTick(tick)}
            </SvgText>
          </G>
        );
      })}
      {values.map((value, index) => {
        const h = Math.max(1, ((value / max) * plotH));
        return (
          <Rect
            key={index}
            x={padLeft + slot * index + (slot - barW) / 2}
            y={padTop + plotH - h}
            width={barW}
            height={h}
            fill={color}
            rx={1}
          />
        );
      })}
      {labels.map((label, index) => (
        <SvgText
          key={label}
          x={padLeft + slot * index + slot / 2}
          y={height - 2}
          fontSize={AXIS_FONT}
          fill={palette.inkFaint}
          textAnchor="middle"
        >
          {label}
        </SvgText>
      ))}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Severity bars — alarms by day
// ---------------------------------------------------------------------------

export function SeverityBars({
  labels,
  groups,
  width,
  height,
  palette,
}: {
  labels: string[];
  /** Ordered severities, drawn as adjacent bars within each day's slot. */
  groups: { id: string; color: string; values: number[] }[];
  width: number;
  height: number;
  palette: ConsolePalette;
}) {
  if (labels.length === 0) return null;
  const padLeft = 20;
  const padBottom = 13;
  const padTop = 4;
  const plotW = Math.max(1, width - padLeft - 2);
  const plotH = Math.max(1, height - padBottom - padTop);
  const max = Math.max(1, ...groups.flatMap((group) => group.values)) * 1.15;
  const ticks = niceTicks(0, max, 3);
  const slot = plotW / labels.length;
  const barW = Math.max(1.5, Math.min(4.5, (slot * 0.62) / groups.length));

  return (
    <Svg width={width} height={height}>
      {ticks.map((tick) => {
        const y = scaleY(tick, 0, max, padTop, plotH);
        return (
          <G key={tick}>
            <Line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke={palette.grid} strokeWidth={1} />
            <SvgText x={padLeft - 5} y={y + 3} fontSize={AXIS_FONT} fill={palette.inkFaint} textAnchor="end">
              {formatTick(tick)}
            </SvgText>
          </G>
        );
      })}
      {labels.map((label, index) => {
        const groupW = barW * groups.length + (groups.length - 1);
        const originX = padLeft + slot * index + (slot - groupW) / 2;
        return (
          <G key={label}>
            {groups.map((group, gIndex) => {
              const value = group.values[index] ?? 0;
              const h = Math.max(value > 0 ? 1.5 : 0, (value / max) * plotH);
              return (
                <Rect
                  key={group.id}
                  x={originX + gIndex * (barW + 1)}
                  y={padTop + plotH - h}
                  width={barW}
                  height={h}
                  fill={group.color}
                  rx={0.75}
                />
              );
            })}
            <SvgText x={padLeft + slot * index + slot / 2} y={height - 2} fontSize={AXIS_FONT} fill={palette.inkFaint} textAnchor="middle">
              {label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
