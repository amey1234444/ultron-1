/**
 * Chart primitives for the Plant Overview.
 *
 * Ultra-premium visualization engine using react-native-svg.
 * Clean grid lines, smooth Catmull-Rom splines, gradient area fills,
 * and high-contrast telemetry indicators.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { splinePath, useSmoothSeries, useSmoothSeriesGroup } from '../../../lib/chartMotion';
import type { ConsolePalette } from '../../../lib/consoleTheme';

const AXIS_FONT = 9.5;

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
// Area chart — electricity demand & general single-metric trend
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
  const smoothValues = useSmoothSeries(values);
  if (smoothValues.length < 2) return null;
  const padLeft = 30;
  const padBottom = 16;
  const padTop = 6;
  const plotW = Math.max(1, width - padLeft - 4);
  const plotH = Math.max(1, height - padBottom - padTop);

  const rawMin = Math.min(...smoothValues);
  const rawMax = Math.max(...smoothValues);
  const min = Math.max(0, rawMin - (rawMax - rawMin) * 0.4);
  const max = rawMax + (rawMax - rawMin) * 0.2;
  const ticks = niceTicks(min, max, 3);

  const points = smoothValues.map((value, index) => ({
    x: padLeft + (index / (smoothValues.length - 1)) * plotW,
    y: scaleY(value, min, max, padTop, plotH),
  }));
  const line = splinePath(points);
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)} L${points[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} Z`;
  const latestPt = points[points.length - 1];

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="areaGradFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <Stop offset="100%" stopColor={color} stopOpacity={0.01} />
        </LinearGradient>
      </Defs>
      <G>
        {ticks.map((tick) => {
          const y = scaleY(tick, min, max, padTop, plotH);
          return (
            <G key={tick}>
              <Line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke={palette.grid} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
              <SvgText x={padLeft - 6} y={y + 3} fontSize={AXIS_FONT} fill={palette.inkFaint} textAnchor="end">
                {formatTick(tick)}
              </SvgText>
            </G>
          );
        })}
      </G>
      <Path d={area} fill="url(#areaGradFill)" />
      <Path d={line} stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      
      {/* Endpoint pulse dot */}
      {latestPt && (
        <G>
          <Circle cx={latestPt.x} cy={latestPt.y} r={4} fill={color} />
          <Circle cx={latestPt.x} cy={latestPt.y} r={7} stroke={color} strokeWidth={1} fill="none" opacity={0.4} />
        </G>
      )}

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
  const smoothSeries = useSmoothSeriesGroup(series.map((entry) => entry.values));
  const all = smoothSeries.flatMap((values) => values);
  if (all.length === 0) return null;
  const padLeft = 24;
  const padBottom = 16;
  const padTop = 6;
  const plotW = Math.max(1, width - padLeft - 4);
  const plotH = Math.max(1, height - padBottom - padTop);
  const min = 0;
  const max = Math.max(...all) * 1.15 || 1;
  const ticks = niceTicks(min, max, 4);

  return (
    <Svg width={width} height={height}>
      {ticks.map((tick) => {
        const y = scaleY(tick, min, max, padTop, plotH);
        return (
          <G key={tick}>
            <Line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke={palette.grid} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
            <SvgText x={padLeft - 5} y={y + 3} fontSize={AXIS_FONT} fill={palette.inkFaint} textAnchor="end">
              {formatTick(tick)}
            </SvgText>
          </G>
        );
      })}
      {series.map((entry, seriesIndex) => {
        const values = smoothSeries[seriesIndex] ?? entry.values;
        const pts = values.map((value, index) => ({
          x: padLeft + (index / Math.max(1, values.length - 1)) * plotW,
          y: scaleY(value, min, max, padTop, plotH),
        }));
        return (
          <Path
            key={entry.id}
            d={splinePath(pts)}
            stroke={entry.color}
            strokeWidth={1.8}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
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
  const smoothValues = useSmoothSeries(values);
  if (smoothValues.length === 0) return null;
  const padLeft = 30;
  const padBottom = 16;
  const padTop = 6;
  const plotW = Math.max(1, width - padLeft - 4);
  const plotH = Math.max(1, height - padBottom - padTop);
  const max = Math.max(...smoothValues) * 1.12 || 1;
  const ticks = niceTicks(0, max, 3);
  const slot = plotW / smoothValues.length;
  const barW = Math.max(3, Math.min(14, slot * 0.55));

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.95} />
          <Stop offset="100%" stopColor={color} stopOpacity={0.65} />
        </LinearGradient>
      </Defs>
      {ticks.map((tick) => {
        const y = scaleY(tick, 0, max, padTop, plotH);
        return (
          <G key={tick}>
            <Line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke={palette.grid} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
            <SvgText x={padLeft - 5} y={y + 3} fontSize={AXIS_FONT} fill={palette.inkFaint} textAnchor="end">
              {formatTick(tick)}
            </SvgText>
          </G>
        );
      })}
      {smoothValues.map((value, index) => {
        const h = Math.max(2, (value / max) * plotH);
        return (
          <Rect
            key={index}
            x={padLeft + slot * index + (slot - barW) / 2}
            y={padTop + plotH - h}
            width={barW}
            height={h}
            fill="url(#barGrad)"
            rx={3}
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
  groups: { id: string; color: string; values: number[] }[];
  width: number;
  height: number;
  palette: ConsolePalette;
}) {
  const smoothGroups = useSmoothSeriesGroup(groups.map((group) => group.values));
  if (labels.length === 0) return null;
  const padLeft = 24;
  const padBottom = 16;
  const padTop = 6;
  const plotW = Math.max(1, width - padLeft - 4);
  const plotH = Math.max(1, height - padBottom - padTop);
  const max = Math.max(1, ...smoothGroups.flatMap((values) => values)) * 1.15;
  const ticks = niceTicks(0, max, 3);
  const slot = plotW / labels.length;
  const barW = Math.max(2.5, Math.min(6, (slot * 0.6) / groups.length));

  return (
    <Svg width={width} height={height}>
      {ticks.map((tick) => {
        const y = scaleY(tick, 0, max, padTop, plotH);
        return (
          <G key={tick}>
            <Line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke={palette.grid} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
            <SvgText x={padLeft - 5} y={y + 3} fontSize={AXIS_FONT} fill={palette.inkFaint} textAnchor="end">
              {formatTick(tick)}
            </SvgText>
          </G>
        );
      })}
      {labels.map((label, index) => {
        const groupW = barW * groups.length + (groups.length - 1) * 1.5;
        const originX = padLeft + slot * index + (slot - groupW) / 2;
        return (
          <G key={label}>
            {groups.map((group, gIndex) => {
              const value = smoothGroups[gIndex]?.[index] ?? group.values[index] ?? 0;
              const h = Math.max(value > 0 ? 2 : 0, (value / max) * plotH);
              return (
                <Rect
                  key={group.id}
                  x={originX + gIndex * (barW + 1.5)}
                  y={padTop + plotH - h}
                  width={barW}
                  height={h}
                  fill={group.color}
                  rx={2}
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

// ---------------------------------------------------------------------------
// Impulse Chart — Throughput Packets/s
// ---------------------------------------------------------------------------

export function ImpulseChart({
  values,
  xLabels = [],
  width,
  height,
  palette,
  color,
}: {
  values: number[];
  xLabels?: string[];
  width: number;
  height: number;
  palette: ConsolePalette;
  color?: string;
}) {
  const smoothValues = useSmoothSeries(values);
  if (smoothValues.length === 0) return null;
  const padLeft = 22;
  const padBottom = 16;
  const padTop = 8;
  const padRight = 6;
  const plotW = Math.max(1, width - padLeft - padRight);
  const plotH = Math.max(1, height - padBottom - padTop);

  const maxVal = Math.max(1, ...smoothValues) * 1.15;
  const ticks = niceTicks(0, maxVal, 3);
  const barColor = color ?? palette.accent;

  const barCount = smoothValues.length;
  const slotW = plotW / Math.max(1, barCount);
  const barW = Math.max(2, Math.min(6, slotW * 0.5));
  const peakVal = Math.max(...smoothValues);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="impulseGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={barColor} stopOpacity={0.9} />
          <Stop offset="100%" stopColor={barColor} stopOpacity={0.4} />
        </LinearGradient>
      </Defs>

      {/* Horizontal Grid */}
      {ticks.map((tick) => {
        const y = scaleY(tick, 0, maxVal, padTop, plotH);
        return (
          <G key={tick}>
            <Line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke={palette.grid} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
            <SvgText x={padLeft - 4} y={y + 3} fontSize={8.5} fill={palette.inkFaint} textAnchor="end">
              {formatTick(tick)}
            </SvgText>
          </G>
        );
      })}

      {/* Impulse Bars */}
      {smoothValues.map((val, idx) => {
        const cx = padLeft + idx * slotW + slotW / 2;
        const h = Math.max(val > 0 ? 2.5 : 0, (val / maxVal) * plotH);
        const y = padTop + plotH - h;
        const isPeak = val === peakVal && val > 0;

        return (
          <G key={idx}>
            <Rect
              x={cx - barW / 2}
              y={y}
              width={barW}
              height={h}
              fill="url(#impulseGrad)"
              opacity={isPeak ? 1 : val > 0 ? 0.75 : 0.25}
              rx={1.5}
            />
            {isPeak && (
              <G>
                <Circle cx={cx} cy={y - 3} r={2} fill={barColor} />
                <Circle cx={cx} cy={y - 3} r={5} stroke={barColor} strokeWidth={0.8} fill="none" opacity={0.6} />
              </G>
            )}
          </G>
        );
      })}

      {/* X Labels */}
      {xLabels.map((lbl, idx) => {
        const xPos = padLeft + (idx / Math.max(1, xLabels.length - 1)) * plotW;
        return (
          <SvgText
            key={lbl + idx}
            x={xPos}
            y={height - 2}
            fontSize={8.5}
            fill={palette.inkFaint}
            textAnchor={idx === 0 ? 'start' : idx === xLabels.length - 1 ? 'end' : 'middle'}
          >
            {lbl}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Operational Health Timeline — Target / Critical Envelope Chart
// ---------------------------------------------------------------------------

export function HealthEnvelopeChart({
  values,
  xLabels = [],
  width,
  height,
  palette,
  target = 90,
  critical = 60,
  currentVal,
}: {
  values: number[];
  xLabels?: string[];
  width: number;
  height: number;
  palette: ConsolePalette;
  target?: number;
  critical?: number;
  currentVal?: number;
}) {
  const targetValues = currentVal === undefined || values.length === 0 ? values : [...values.slice(0, -1), currentVal];
  const smoothValues = useSmoothSeries(targetValues);
  if (smoothValues.length === 0) return null;
  const padLeft = 24;
  const padRight = 72;
  const padBottom = 16;
  const padTop = 10;
  const plotW = Math.max(1, width - padLeft - padRight);
  const plotH = Math.max(1, height - padBottom - padTop);

  const minVal = 0;
  const maxVal = 100;

  const points = smoothValues.map((v, i) => ({
    x: padLeft + (i / Math.max(1, smoothValues.length - 1)) * plotW,
    y: scaleY(v, minVal, maxVal, padTop, plotH),
  }));

  const pathD = splinePath(points);
  const areaD = `${pathD} L${points[points.length - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)} L${points[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} Z`;

  const targetY = scaleY(target, minVal, maxVal, padTop, plotH);
  const criticalY = scaleY(critical, minVal, maxVal, padTop, plotH);

  const latestVal = smoothValues[smoothValues.length - 1] ?? currentVal ?? values[values.length - 1] ?? 76;
  const latestPt = points[points.length - 1] ?? { x: padLeft + plotW, y: scaleY(latestVal, minVal, maxVal, padTop, plotH) };
  const latestTone = latestVal >= target ? palette.accent : latestVal >= critical ? palette.warning : palette.critical;

  // Maxima & Minima points
  let maxIdx = 0;
  let minIdx = 0;
  smoothValues.forEach((val, i) => {
    if (val > smoothValues[maxIdx]) maxIdx = i;
    if (val < smoothValues[minIdx]) minIdx = i;
  });
  const maxPt = points[maxIdx];
  const minPt = points[minIdx];

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="healthEnvGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={palette.accent} stopOpacity={0.2} />
          <Stop offset="100%" stopColor={palette.accent} stopOpacity={0.01} />
        </LinearGradient>
      </Defs>

      {/* Area Gradient Fill */}
      <Path d={areaD} fill="url(#healthEnvGrad)" />

      {/* Target Reference Line */}
      <Line
        x1={padLeft}
        y1={targetY}
        x2={padLeft + plotW + 12}
        y2={targetY}
        stroke={palette.accent}
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.65}
      />
      <SvgText x={padLeft + plotW + 16} y={targetY + 3.5} fontSize={9} fill={palette.accent} fontWeight="600">
        Target {target}
      </SvgText>

      {/* Critical Reference Line */}
      <Line
        x1={padLeft}
        y1={criticalY}
        x2={padLeft + plotW + 12}
        y2={criticalY}
        stroke={palette.critical}
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.65}
      />
      <SvgText x={padLeft + plotW + 16} y={criticalY + 3.5} fontSize={9} fill={palette.critical} fontWeight="600">
        Critical {critical}
      </SvgText>

      {/* Health Trajectory Spline.
          Slim on purpose. A 2px stroke on a chart this size reads as a
          highlighter mark — it sits on top of the grid rather than in it, and
          it swallows the small vertical movements that are the entire point of
          a health line whose range is 74 to 78. At 1.25 the line is a
          measurement again. */}
      <Path d={pathD} fill="none" stroke={palette.accent} strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />

      {/* Maxima Callout */}
      {maxPt && (
        <G key="env-max">
          <Circle cx={maxPt.x} cy={maxPt.y} r={3} fill={palette.accent} />
          <Rect x={maxPt.x - 22} y={maxPt.y - 18} width={44} height={14} rx={3} fill={palette.accent} opacity={0.9} />
          <SvgText x={maxPt.x} y={maxPt.y - 8} fontSize={8} fontWeight="700" fill="#FFFFFF" textAnchor="middle">
            MAX {Math.round(smoothValues[maxIdx])}
          </SvgText>
        </G>
      )}

      {/* Minima Callout */}
      {minPt && maxIdx !== minIdx && (
        <G key="env-min">
          <Circle cx={minPt.x} cy={minPt.y} r={3} fill={palette.critical} />
          <Rect x={minPt.x - 22} y={minPt.y + 4} width={44} height={14} rx={3} fill={palette.critical} opacity={0.9} />
          <SvgText x={minPt.x} y={minPt.y + 14} fontSize={8} fontWeight="700" fill="#FFFFFF" textAnchor="middle">
            MIN {Math.round(smoothValues[minIdx])}
          </SvgText>
        </G>
      )}

      {/* Current Endpoint Marker */}
      <Circle cx={latestPt.x} cy={latestPt.y} r={3.4} fill={latestTone} />
      <Circle cx={latestPt.x} cy={latestPt.y} r={7} stroke={latestTone} strokeWidth={0.9} fill="none" opacity={0.4} />
      <SvgText x={latestPt.x + 12} y={latestPt.y + 3.5} fontSize={11} fill={palette.ink} fontWeight="700">
        {Math.round(latestVal)}
      </SvgText>

      {/* Y Axis Grid/Ticks */}
      {[0, 25, 50, 75, 100].map((t) => {
        const y = scaleY(t, minVal, maxVal, padTop, plotH);
        return (
          <G key={t}>
            <Line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke={palette.grid} strokeWidth={0.5} opacity={0.5} />
            <SvgText x={padLeft - 5} y={y + 3} fontSize={8.5} fill={palette.inkFaint} textAnchor="end">
              {t}
            </SvgText>
          </G>
        );
      })}

      {/* X Labels */}
      {xLabels.map((lbl, idx) => {
        const xPos = padLeft + (idx / Math.max(1, xLabels.length - 1)) * plotW;
        return (
          <SvgText
            key={lbl + idx}
            x={xPos}
            y={height - 2}
            fontSize={8.5}
            fill={palette.inkFaint}
            textAnchor={idx === 0 ? 'start' : idx === xLabels.length - 1 ? 'end' : 'middle'}
          >
            {lbl}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Micro Sparkline — compact SVG trend line for HUD & priority rows
// ---------------------------------------------------------------------------

export function MicroSparkline({
  values,
  width = 48,
  height = 14,
  color = '#10B981',
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const smoothValues = useSmoothSeries(values ?? []);
  if (smoothValues.length < 2) return null;
  const min = Math.min(...smoothValues);
  const max = Math.max(...smoothValues);
  const span = max - min || 1;

  const points = smoothValues.map((v, i) => {
    const x = (i / (smoothValues.length - 1)) * width;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return { x, y };
  });

  return (
    <Svg width={width} height={height} style={{ overflow: 'visible' }}>
      <Path d={splinePath(points, 0.45)} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
