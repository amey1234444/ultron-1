/**
 * Health index over time, with the projected interval ahead of today.
 *
 * Purely presentational: every value it draws arrives as a prop, already parsed
 * and already turned into geometry by `rulSeries`. It computes no health state,
 * no crossing date and no threshold. What it decides is where ink goes.
 *
 * Drawn bottom to top, because later layers must read over earlier ones:
 * zone tints, threshold lines, the interval band, the median, the observations,
 * then the vertical markers and the crossing labels.
 *
 * Every line is distinguished by dash pattern as well as colour, so the chart
 * survives grayscale printing and the common colour vision deficiencies. The
 * accessible fallback is the data table the container renders beside it; this
 * component carries the summary sentence as its `aria-label`.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { consolePalette } from '../../../ui';
import type { ComponentRul } from '../../../../lib/knowledge/ml/rulContract';
import {
  bandRing,
  buildDomain,
  buildEventMarkers,
  buildHistorySegments,
  buildMedianLine,
  buildProjectionBand,
  describeChart,
  downsampleHistory,
  placeCrossingLabels,
  toDayIndex,
  type ChartRange,
} from './rulSeries';

/** Above 1000 points the extra ink is invisible and the render is not free. */
const MAX_HISTORY_POINTS = 1000;

const PAD = { top: 18, right: 18, bottom: 34, left: 46 };

export type HiProjectionChartProps = {
  value: ComponentRul;
  range: ChartRange;
  todayIso: string;
  showBand?: boolean;
  showEvents?: boolean;
  /** Plot height. 360 on desktop, 260 on mobile; the caller decides which. */
  height?: number;
  width?: number;
};

export function HiProjectionChart({
  value,
  range,
  todayIso,
  showBand = true,
  showEvents = true,
  height = 360,
  width = 960,
}: HiProjectionChartProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const plotW = Math.max(120, width - PAD.left - PAD.right);
  const plotH = Math.max(100, height - PAD.top - PAD.bottom);

  const geometry = useMemo(() => {
    const domain = buildDomain(value, range, todayIso);
    const history = downsampleHistory(value.history, MAX_HISTORY_POINTS);
    return {
      domain,
      ...buildHistorySegments(history, domain),
      band: buildProjectionBand(value.projection, domain),
      median: buildMedianLine(value.projection, domain),
      events: buildEventMarkers(value.events, domain, range),
      crossings: placeCrossingLabels(
        value.thresholdCrossings,
        value.summary.rulDays,
        domain,
        // Eight days of separation is roughly a label's width at this scale.
        Math.max(6, (domain.days / plotW) * 90),
      ),
    };
  }, [value, range, todayIso, plotW]);

  const { domain } = geometry;
  // x maps days-from-start onto the plot; y takes an already-flipped 0..1.
  const x = (day: number) => PAD.left + (day / Math.max(1e-6, domain.days)) * plotW;
  const y = (flipped: number) => PAD.top + flipped * plotH;
  const hiY = (hi: number) => y(1 - hi);

  const line = (points: { x: number; y: number }[]) =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.x).toFixed(2)} ${y(point.y).toFixed(2)}`).join(' ');

  const failure = value.thresholds.failureHi;
  const warning = value.thresholds.warningHi;

  const todayX = x(toDayIndex(todayIso, domain.startMs));
  const onsetX =
    value.summary.onsetDetectedAt !== null
      ? x(toDayIndex(value.summary.onsetDetectedAt, domain.startMs))
      : null;

  const axisText = palette.chartAxisText;
  const observed = palette.chartNormal;
  const projected = palette.forecast;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={describeChart(value)}
      style={{ width: '100%' }}
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {/* 1 — zone tints. Very low alpha: these orient the eye, they are not data. */}
        {failure !== null ? (
          <Rect x={PAD.left} y={hiY(failure)} width={plotW} height={Math.max(0, y(1) - hiY(failure))} fill={palette.critical} opacity={0.07} />
        ) : null}
        {failure !== null && warning !== null ? (
          <Rect x={PAD.left} y={hiY(warning)} width={plotW} height={Math.max(0, hiY(failure) - hiY(warning))} fill={palette.warning} opacity={0.07} />
        ) : null}

        {/* Y gridlines and ticks at 0, .25, .5, .75, 1 */}
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <G key={`tick-${tick}`}>
            <Line x1={PAD.left} y1={hiY(tick)} x2={PAD.left + plotW} y2={hiY(tick)} stroke={palette.chartGridMinor} strokeWidth={1} />
            <SvgText x={PAD.left - 8} y={hiY(tick) + 3.5} fontSize={10} fill={axisText} textAnchor="end">
              {tick.toFixed(2)}
            </SvgText>
          </G>
        ))}
        <SvgText
          x={12}
          y={PAD.top + plotH / 2}
          fontSize={10}
          fill={axisText}
          textAnchor="middle"
          transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}
        >
          Health index
        </SvgText>

        {/* 2 — threshold lines, labelled at the left above the line. */}
        {warning !== null ? (
          <G>
            <Line x1={PAD.left} y1={hiY(warning)} x2={PAD.left + plotW} y2={hiY(warning)} stroke={palette.warning} strokeWidth={1.25} strokeDasharray="7 4" />
            <SvgText x={PAD.left + 4} y={hiY(warning) - 5} fontSize={10} fill={palette.warning}>
              {`Warning (HI ${warning.toFixed(2)})`}
            </SvgText>
          </G>
        ) : null}
        {failure !== null ? (
          <G>
            <Line x1={PAD.left} y1={hiY(failure)} x2={PAD.left + plotW} y2={hiY(failure)} stroke={palette.critical} strokeWidth={1.25} strokeDasharray="3 3" />
            <SvgText x={PAD.left + 4} y={hiY(failure) - 5} fontSize={10} fill={palette.critical}>
              {`Failure threshold (HI ${failure.toFixed(2)})`}
            </SvgText>
          </G>
        ) : null}

        {/* 3 — the 80% interval, as one filled ring. */}
        {showBand && geometry.band.length > 1 ? (
          <Polygon
            points={bandRing(geometry.band)
              .map((point) => `${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`)
              .join(' ')}
            fill={projected}
            opacity={0.18}
          />
        ) : null}

        {/* 4 — median projection. */}
        {geometry.median.length > 1 ? (
          <Path d={line(geometry.median)} stroke={projected} strokeWidth={1.75} strokeDasharray="6 4" fill="none" />
        ) : null}

        {/* 5 — observed history. One path per segment: the breaks are the point. */}
        {geometry.segments.map((segment, index) => (
          <Path key={`seg-${index}`} d={line(segment)} stroke={observed} strokeWidth={2} fill="none" />
        ))}
        {geometry.segments.flat().map((entry) => (
          <Circle key={`pt-${entry.point.date}`} cx={x(entry.x)} cy={y(entry.y)} r={1.9} fill={observed} />
        ))}
        {/* Insufficient days: hollow, grey, and never joined to a neighbour. */}
        {geometry.insufficient.map((entry) => (
          <Circle
            key={`insuf-${entry.point.date}`}
            cx={x(entry.x)}
            cy={y(entry.y)}
            r={2.6}
            fill="none"
            stroke={palette.inkDisabled}
            strokeWidth={1.2}
          />
        ))}

        {/* 6 — vertical markers. */}
        <G>
          <Line x1={todayX} y1={PAD.top} x2={todayX} y2={PAD.top + plotH} stroke={palette.chartCrosshair} strokeWidth={1} strokeDasharray="2 3" />
          <SvgText x={todayX + 4} y={PAD.top + 10} fontSize={9.5} fill={axisText}>
            Today
          </SvgText>
        </G>
        {onsetX !== null ? (
          <G>
            <Line x1={onsetX} y1={PAD.top} x2={onsetX} y2={PAD.top + plotH} stroke={palette.warning} strokeWidth={1} strokeDasharray="2 3" />
            <SvgText x={onsetX + 4} y={PAD.top + 22} fontSize={9.5} fill={palette.warning}>
              Degradation onset
            </SvgText>
          </G>
        ) : null}
        {showEvents
          ? geometry.events.map((marker) => (
              <G key={`ev-${marker.event.date}-${marker.event.type}`} opacity={marker.priorLife ? 0.35 : 1}>
                <Line
                  x1={x(marker.x)}
                  y1={PAD.top + plotH - 14}
                  x2={x(marker.x)}
                  y2={PAD.top + plotH}
                  stroke={palette.inkMuted}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <EventGlyph type={marker.event.type} cx={x(marker.x)} cy={PAD.top + plotH - 18} colour={palette.inkMuted} />
              </G>
            ))
          : null}

        {/* 7 — crossing markers, staggered downward where they would collide. */}
        {failure !== null
          ? geometry.crossings.map((crossing) => (
              <G key={`cross-${crossing.key}`}>
                <Circle cx={x(crossing.x)} cy={hiY(failure)} r={crossing.emphasis ? 4 : 3} fill={palette.critical} />
                <SvgText
                  x={x(crossing.x)}
                  y={hiY(failure) + 14 + crossing.row * 12}
                  fontSize={crossing.emphasis ? 10.5 : 9.5}
                  fontWeight={crossing.emphasis ? '700' : '400'}
                  fill={palette.critical}
                  textAnchor="middle"
                >
                  {crossing.label}
                </SvgText>
              </G>
            ))
          : null}

        {/* X axis */}
        <Line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke={palette.chartAxis} strokeWidth={1} />
        {[0, 0.5, 1].map((fraction) => {
          const ms = domain.startMs + (domain.endMs - domain.startMs) * fraction;
          return (
            <SvgText
              key={`xt-${fraction}`}
              x={PAD.left + fraction * plotW}
              y={PAD.top + plotH + 16}
              fontSize={9.5}
              fill={axisText}
              textAnchor={fraction === 0 ? 'start' : fraction === 1 ? 'end' : 'middle'}
            >
              {new Date(ms).toISOString().slice(0, 10)}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

/** A distinct shape per event type, so the marker reads without colour. */
function EventGlyph({ type, cx, cy, colour }: { type: string; cx: number; cy: number; colour: string }) {
  if (type === 'REPLACEMENT') {
    return <Polygon points={`${cx},${cy - 4} ${cx + 4},${cy} ${cx},${cy + 4} ${cx - 4},${cy}`} fill={colour} />;
  }
  if (type === 'REPAIR') {
    return <Rect x={cx - 3.2} y={cy - 3.2} width={6.4} height={6.4} fill={colour} />;
  }
  if (type === 'INSPECTION') {
    return <Circle cx={cx} cy={cy} r={3.2} fill="none" stroke={colour} strokeWidth={1.3} />;
  }
  return <Circle cx={cx} cy={cy} r={3.2} fill={colour} />;
}
