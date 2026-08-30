// The prognosis page's one analytical visual.
//
// Everything else on the screen states a number. This is the only thing that
// shows the shape of the argument: a measured line that rises, a boundary at
// today, a projection that keeps rising, and two horizontal limits it is going
// to meet. A reader should get "healthy now, not healthy later" from the shape
// alone, before reading a single label.
//
// Drawn by hand in react-native-svg rather than through a chart library,
// because the console has no chart library and this needs about six primitives.
// Two things it does that a default chart configuration would not:
//
//  - It measures its container and draws at 1:1 pixel units. An SVG with a
//    viewBox and the default `preserveAspectRatio` FITS its drawing inside the
//    box rather than filling it, so a fixed viewBox at `width="100%"` leaves
//    the chart marooned in the middle of the panel at whatever size it was
//    authored at.
//  - Its markers are read off the series, not positioned independently. A
//    crossing marker that is placed by its own rule ends up beside the line it
//    is supposed to be marking as soon as the curve changes.
import { useCallback, useState } from 'react';
import { Platform, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import type { PrognosisMetric } from '../analysis/prognosisViewModel';
import { consolePalette, text } from '../../../ui';

/**
 * Type inside the plot.
 *
 * `fontFamily` on an SVG node does not go through nativewind, so the web faces
 * are named directly and the bundled families are named for the native targets.
 * Everything that can be a real `<Text>` — title, legend, milestones — is one,
 * above or below the drawing.
 */
const PLOT_SANS = Platform.select({ web: 'Inter, system-ui, sans-serif', default: 'Inter_500Medium' });
const PLOT_SANS_BOLD = Platform.select({ web: 'Inter, system-ui, sans-serif', default: 'Inter_600SemiBold' });
const PLOT_MONO = Platform.select({ web: '"JetBrains Mono", ui-monospace, monospace', default: 'IBMPlexMono_400Regular' });

const AXIS_LEFT = 66;
const AXIS_RIGHT = 22;
const AXIS_TOP = 26;
const AXIS_BOTTOM = 40;

function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return [min];
  const raw = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? magnitude * 10;
  const ticks: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + 1e-9; value += step) ticks.push(Number(value.toFixed(6)));
  return ticks;
}

function dayLabel(day: number): string {
  if (day === 0) return 'TODAY';
  return day > 0 ? `+${Math.round(day)}D` : `${Math.abs(Math.round(day))}D AGO`;
}

export function DegradationForecastChart({ metric }: { metric: PrognosisMetric }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((previous) => (Math.abs(previous - next) < 2 ? previous : next));
  }, []);

  const w = width > 0 ? width : 900;
  const h = Math.max(230, Math.min(330, Math.round(w * 0.26)));
  const plotW = w - AXIS_LEFT - AXIS_RIGHT;
  const plotH = h - AXIS_TOP - AXIS_BOTTOM;
  const ready = width > 0 && plotW > 120 && metric.history.length > 1;

  const dayMin = -metric.historyDays;
  const dayMax = metric.forecastDays;
  const xDay = (day: number) => AXIS_LEFT + ((day - dayMin) / (dayMax - dayMin)) * plotW;
  const yValue = (value: number) =>
    AXIS_TOP + (1 - (value - metric.scaleMin) / Math.max(1e-6, metric.scaleMax - metric.scaleMin)) * plotH;

  const path = (points: { day: number; value: number }[]) =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xDay(point.day).toFixed(1)} ${yValue(point.value).toFixed(1)}`).join(' ');

  const valueTicks = niceTicks(metric.scaleMin, metric.scaleMax, 5);
  const dayTicks = [dayMin, dayMin * 0.75, dayMin * 0.5, dayMin * 0.25, 0, dayMax * 0.4, dayMax * 0.75, dayMax].map((day) => Math.round(day));
  const uniqueDayTicks = Array.from(new Set(dayTicks)).sort((a, b) => a - b);

  // Markers are read off the series so they cannot drift from the curve.
  const valueAtDay = (day: number): number | null => {
    const source = day <= 0 ? metric.history : metric.forecast;
    if (source.length === 0) return null;
    let nearest = source[0];
    for (const point of source) if (Math.abs(point.day - day) < Math.abs(nearest.day - day)) nearest = point;
    return nearest.value;
  };

  const alertY = metric.alertThreshold === null ? null : yValue(metric.alertThreshold);
  const dangerY = metric.dangerThreshold === null ? null : yValue(metric.dangerThreshold);

  return (
    <View onLayout={onLayout} style={{ backgroundColor: palette.chartBg, borderRadius: 6 }}>
      {ready ? (
        <Svg width={w} height={h}>
          <Rect x={0} y={0} width={w} height={h} fill={palette.chartBg} />

          {/* Severity regions, at an opacity that reads as ground rather than
              as a fill. The lines still carry the meaning. */}
          {dangerY !== null ? (
            <Rect x={AXIS_LEFT} y={AXIS_TOP} width={plotW} height={Math.max(0, dangerY - AXIS_TOP)} fill={palette.critical} fillOpacity={0.06} />
          ) : null}
          {alertY !== null && dangerY !== null ? (
            <Rect x={AXIS_LEFT} y={dangerY} width={plotW} height={Math.max(0, alertY - dangerY)} fill={palette.forecast} fillOpacity={0.045} />
          ) : null}

          {valueTicks.map((value) => (
            <Line
              key={`gy-${value}`}
              x1={AXIS_LEFT}
              y1={yValue(value)}
              x2={AXIS_LEFT + plotW}
              y2={yValue(value)}
              stroke={palette.chartGridMinor}
              strokeWidth={1}
            />
          ))}

          {/* Threshold limits. */}
          {alertY !== null ? (
            <Line x1={AXIS_LEFT} y1={alertY} x2={AXIS_LEFT + plotW} y2={alertY} stroke={palette.forecast} strokeWidth={1.2} strokeDasharray="6 5" />
          ) : null}
          {dangerY !== null ? (
            <Line x1={AXIS_LEFT} y1={dangerY} x2={AXIS_LEFT + plotW} y2={dangerY} stroke={palette.critical} strokeWidth={1.2} strokeDasharray="6 5" />
          ) : null}

          {/* Measured, then projected. The dash is the whole point: a reader
              must never mistake a projection for a reading. */}
          <Path d={path(metric.history)} fill="none" stroke={palette.forecast} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <Path
            d={path(metric.forecast)}
            fill="none"
            stroke={palette.forecast}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="5 5"
            strokeOpacity={0.85}
          />

          <Line x1={xDay(0)} y1={AXIS_TOP} x2={xDay(0)} y2={AXIS_TOP + plotH} stroke={palette.chartCrosshair} strokeWidth={1} strokeDasharray="3 4" />

          {/* Today, then each crossing the engine actually projected. */}
          <Circle cx={xDay(0)} cy={yValue(valueAtDay(0) ?? 0)} r={5.5} fill={palette.chartBg} />
          <Circle cx={xDay(0)} cy={yValue(valueAtDay(0) ?? 0)} r={3.6} fill={palette.accent} />
          {metric.alertCrossingDay !== null && metric.alertThreshold !== null ? (
            <>
              <Circle cx={xDay(metric.alertCrossingDay)} cy={yValue(metric.alertThreshold)} r={5.5} fill={palette.chartBg} />
              <Circle cx={xDay(metric.alertCrossingDay)} cy={yValue(metric.alertThreshold)} r={3.6} fill={palette.forecast} />
            </>
          ) : null}
          {metric.dangerCrossingDay !== null && metric.dangerThreshold !== null ? (
            <>
              <Circle cx={xDay(metric.dangerCrossingDay)} cy={yValue(metric.dangerThreshold)} r={5.5} fill={palette.chartBg} />
              <Circle cx={xDay(metric.dangerCrossingDay)} cy={yValue(metric.dangerThreshold)} r={3.6} fill={palette.critical} />
            </>
          ) : null}

          {valueTicks.map((value) => (
            <SvgText
              key={`ty-${value}`}
              x={AXIS_LEFT - 8}
              y={yValue(value) + 3.5}
              fill={palette.chartAxisText}
              fontSize={9.5}
              fontFamily={PLOT_MONO}
              textAnchor="end"
            >
              {value.toFixed(metric.decimals)}
            </SvgText>
          ))}
          {uniqueDayTicks.map((day) => (
            <SvgText
              key={`tx-${day}`}
              x={xDay(day)}
              y={AXIS_TOP + plotH + 18}
              fill={day === 0 ? palette.chartText : palette.chartAxisText}
              fontSize={9}
              fontFamily={day === 0 ? PLOT_SANS_BOLD : PLOT_MONO}
              textAnchor="middle"
            >
              {dayLabel(day)}
            </SvgText>
          ))}

          {/* The y axis says what it is measuring, once, on its side — a chart
              whose vertical axis is only a column of bare numbers makes the
              reader carry the unit in their head from the panel heading. */}
          <SvgText
            x={12}
            y={AXIS_TOP + plotH / 2}
            fill={palette.chartAxisText}
            fontSize={8.5}
            fontFamily={PLOT_SANS}
            letterSpacing={1.2}
            textAnchor="middle"
            transform={`rotate(-90 12 ${(AXIS_TOP + plotH / 2).toFixed(1)})`}
          >
            {metric.axisLabel}
          </SvgText>

          <SvgText x={AXIS_LEFT} y={13} fill={palette.chartAxisText} fontSize={8.5} fontFamily={PLOT_SANS} letterSpacing={1.3}>
            MEASURED HISTORY
          </SvgText>
          <SvgText x={xDay(0) + 8} y={13} fill={palette.chartAxisText} fontSize={8.5} fontFamily={PLOT_SANS} letterSpacing={1.3}>
            FORECAST PERIOD
          </SvgText>

          {dangerY !== null ? (
            <SvgText x={AXIS_LEFT + 8} y={dangerY - 6} fill={palette.critical} fontSize={8.5} fontFamily={PLOT_SANS} letterSpacing={1.1}>
              DANGER THRESHOLD
            </SvgText>
          ) : null}
          {alertY !== null ? (
            <SvgText x={AXIS_LEFT + 8} y={alertY - 6} fill={palette.forecast} fontSize={8.5} fontFamily={PLOT_SANS} letterSpacing={1.1}>
              ALERT THRESHOLD
            </SvgText>
          ) : null}
        </Svg>
      ) : (
        <View style={{ height: h }} />
      )}

      {/* The key, as real text under the drawing rather than as SVG glyphs.
          Solid vs dashed is the one distinction a reader must not have to
          guess at, so it is stated in words as well as drawn. */}
      <View
        className="flex-row flex-wrap items-center justify-center gap-x-5 gap-y-1 px-3 py-2"
        style={{ borderTopWidth: 1, borderTopColor: palette.lineSubtle }}
      >
        <View className="flex-row items-center gap-1.5">
          <Svg width={16} height={8}>
            <Line x1={0} y1={4} x2={16} y2={4} stroke={palette.forecast} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <Text className={cn(text.micro)} style={{ color: palette.inkMuted }}>
            Solid = measured
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Svg width={16} height={8}>
            <Line x1={0} y1={4} x2={16} y2={4} stroke={palette.forecast} strokeWidth={2} strokeDasharray="4 3" strokeLinecap="round" />
          </Svg>
          <Text className={cn(text.micro)} style={{ color: palette.inkMuted }}>
            Dashed = projected
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Svg width={8} height={10}>
            <Line x1={4} y1={0} x2={4} y2={10} stroke={palette.chartCrosshair} strokeWidth={1.4} strokeDasharray="3 3" />
          </Svg>
          <Text className={cn(text.micro)} style={{ color: palette.inkMuted }}>
            Vertical line = today
          </Text>
        </View>
      </View>
    </View>
  );
}
