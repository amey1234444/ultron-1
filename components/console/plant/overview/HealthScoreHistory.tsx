/**
 * Health score against the operating thresholds it is judged by.
 *
 * The whole improvement here is inside the plot, not around it. There are no
 * extra cards, no second chart and no permanent labels on every point:
 *
 *  - The curve is a cubic spline at low tension. Enough smoothing that a
 *    five-second sample cadence does not read as a saw, not so much that the
 *    chart invents a shape the data never had.
 *  - Target, Warning and Critical are dashed rules with their names on the plot
 *    edge, so a value can be judged where it is read instead of by trips to a
 *    legend. The bands between them carry a tint low enough that the line stays
 *    the strongest object on the chart — a wash that competes with the series
 *    is decoration.
 *  - Only three points are ever marked: the window's minimum, its maximum, and
 *    now. Everything else is the line. Marking every sample is how a trend
 *    turns into a bead necklace.
 *  - The y-axis holds the meaningful health range rather than a flat 0-100,
 *    because a plant that moves between 74 and 78 is a flat line on a 0-100
 *    axis and that is exactly the movement an operator is watching for. The
 *    window opens downward on its own if a reading falls below it, so the
 *    series can never run off the bottom of the plot.
 */
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { splinePath, useSmoothSeries } from '../../../../lib/chartMotion';
import { alpha, type ConsolePalette } from '../../../../lib/consoleTheme';
import { STEP } from '../PlantSurfaces';
import { ChipButton, PAD, Panel, PanelHeader } from './OverviewChrome';

export type HealthPoint = { label: string; value: number };

/** Plot insets. Right is wide because the threshold names live on that edge. */
const PAD_L = 30;
const PAD_R = 76;
const PAD_T = 12;
const PAD_B = 22;
const AXIS_FONT = 9.5;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function LegendKey({ label, color, dashed, palette }: { label: string; color: string; dashed?: boolean; palette: ConsolePalette }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: STEP * 1.5 }}>
      {dashed ? (
        <View style={{ flexDirection: 'row', width: 15, gap: 2.5 }}>
          <View style={{ width: 5, height: 2, backgroundColor: color }} />
          <View style={{ width: 5, height: 2, backgroundColor: color }} />
        </View>
      ) : (
        <View style={{ width: 15, height: 2, borderRadius: 2, backgroundColor: color }} />
      )}
      <Text className="font-body" style={{ fontSize: 10.5, color: palette.inkFaint }}>
        {label}
      </Text>
    </View>
  );
}

export function HealthScoreHistory({
  points,
  target,
  warning = 75,
  critical = 60,
  rangeLabel,
  onRangePress,
  palette,
  isDark,
}: {
  points: HealthPoint[];
  target: number;
  warning?: number;
  critical?: number;
  rangeLabel: string;
  onRangePress?: () => void;
  palette: ConsolePalette;
  isDark: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<number | null>(null);

  const onLayout = useCallback((event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) =>
      Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5 ? current : { width, height },
    );
  }, []);

  const values = useMemo(() => points.map((point) => point.value), [points]);
  // Eased so a new sample slides the curve rather than snapping it. The easing
  // lives here, so an animating chart repaints itself instead of dragging the
  // map and the rail through sixty re-renders a second with it.
  const shown = useSmoothSeries(values);

  // The extremes, which are the only two points the plot marks besides now.
  // Nothing here is printed as text: the summary row that used to sit under the
  // chart restated five numbers the plot already draws, and a strip that spends
  // a third of its height re-reading its own picture has no height left for the
  // picture.
  const stats = useMemo(() => {
    if (values.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [values]);

  // The plotted window. Defaults to 40-100 — wide enough to keep all three
  // thresholds on the chart, tight enough that ordinary drift is visible — and
  // opens downward if a reading would otherwise fall off the bottom.
  const yMax = 100;
  const yMin = values.length > 0 ? Math.min(40, Math.floor(stats.min / 5) * 5 - 5) : 40;

  const plotW = Math.max(1, size.width - PAD_L - PAD_R);
  const plotH = Math.max(1, size.height - PAD_T - PAD_B);
  const ready = size.width > 40 && size.height > 60 && shown.length > 0;

  const x = useCallback(
    (index: number) => PAD_L + (shown.length <= 1 ? plotW / 2 : (index / (shown.length - 1)) * plotW),
    [plotW, shown.length],
  );
  const y = useCallback(
    (value: number) => PAD_T + (1 - (clamp(value, yMin, yMax) - yMin) / (yMax - yMin)) * plotH,
    [plotH, yMax, yMin],
  );

  const coords = useMemo(() => shown.map((value, index) => ({ x: x(index), y: y(value) })), [shown, x, y]);
  // tension 1 puts the control points a sixth of the span out, which is the
  // gentlest curve that still reads as continuous at this sample density.
  const linePath = coords.length > 1 ? splinePath(coords, 1) : '';
  const areaPath =
    coords.length > 1
      ? `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(PAD_T + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(PAD_T + plotH).toFixed(1)} Z`
      : '';

  const ticks = useMemo(() => {
    const raw = [yMin, critical, warning, target, yMax].filter((value) => value >= yMin && value <= yMax);
    return Array.from(new Set(raw)).sort((a, b) => a - b);
  }, [critical, target, warning, yMax, yMin]);

  const minIndex = values.indexOf(stats.min);
  const maxIndex = values.indexOf(stats.max);
  const currentIndex = coords.length - 1;
  // A marker on the last point would sit under the "now" ring, and a min that
  // is also the max would draw two labels on one point.
  const showMin = ready && minIndex >= 0 && minIndex !== currentIndex && stats.min !== stats.max;
  const showMax = ready && maxIndex >= 0 && maxIndex !== currentIndex && stats.min !== stats.max;

  const xLabelIndices = useMemo(() => {
    const count = points.length;
    if (count === 0) return [];
    if (count <= 5) return points.map((_, index) => index);
    const wanted = 5;
    const out = new Set<number>();
    for (let i = 0; i < wanted; i += 1) out.add(Math.round((i / (wanted - 1)) * (count - 1)));
    return [...out].sort((a, b) => a - b);
  }, [points]);

  const onPointerMove = (event: { nativeEvent: unknown }) => {
    if (!ready || shown.length === 0) return;
    const native = event.nativeEvent as { offsetX?: number; locationX?: number };
    const at = native.offsetX ?? native.locationX;
    if (typeof at !== 'number') return;
    const ratio = clamp((at - PAD_L) / plotW, 0, 1);
    setHovered(Math.round(ratio * (shown.length - 1)));
  };

  const hoverPoint = hovered !== null && hovered < coords.length ? coords[hovered] : null;
  const hoverData = hovered !== null && hovered < points.length ? points[hovered] : null;

  // Tooltip geometry. Fixed width so it can be clamped inside the plot without
  // measuring it — a readout that hangs off the panel edge is worse than none.
  const TIP_W = 158;
  const TIP_H = 62;
  const tipLeft = hoverPoint ? clamp(hoverPoint.x - TIP_W / 2, 2, Math.max(2, size.width - TIP_W - 2)) : 0;
  const tipTop = hoverPoint ? clamp(hoverPoint.y - TIP_H - 12, 2, Math.max(2, size.height - TIP_H - 2)) : 0;

  const zoneOpacity = (dark: number, light: number) => (isDark ? dark : light);

  return (
    <Panel
      palette={palette}
      isDark={isDark}
      style={{ flex: 1, minWidth: 0, minHeight: 0, padding: PAD - 2, paddingBottom: STEP * 1.5 }}
    >
      <PanelHeader
        label="Health score history"
        subtitle="Health trend against operating thresholds"
        palette={palette}
        right={<ChipButton label={rangeLabel} onPress={onRangePress} palette={palette} chevron={!!onRangePress} />}
      />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: STEP * 3.5, marginTop: STEP * 2 }}>
        <LegendKey label="Health score" color={palette.accent} palette={palette} />
        <LegendKey label={`Target ${target}`} color={palette.accent} dashed palette={palette} />
        <LegendKey label={`Warning ${warning}`} color={palette.warning} dashed palette={palette} />
        <LegendKey label={`Critical ${critical}`} color={palette.critical} dashed palette={palette} />
      </View>

      <View
        style={{ flex: 1, minHeight: 0, marginTop: STEP }}
        onLayout={onLayout}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        {ready ? (
          <Svg width={size.width} height={size.height}>
            <Defs>
              <LinearGradient id="plantHealthArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={palette.accent} stopOpacity={0.18} />
                <Stop offset="68%" stopColor={palette.accent} stopOpacity={0.06} />
                <Stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Condition bands. Barely there on purpose — see the note above. */}
            <Rect
              x={PAD_L}
              y={y(yMax)}
              width={plotW}
              height={Math.max(0, y(target) - y(yMax))}
              fill={palette.accent}
              opacity={zoneOpacity(0.05, 0.025)}
            />
            <Rect
              x={PAD_L}
              y={y(target)}
              width={plotW}
              height={Math.max(0, y(warning) - y(target))}
              fill={palette.warning}
              opacity={zoneOpacity(0.035, 0.018)}
            />
            <Rect
              x={PAD_L}
              y={y(warning)}
              width={plotW}
              height={Math.max(0, y(critical) - y(warning))}
              fill={palette.warning}
              opacity={zoneOpacity(0.055, 0.028)}
            />
            <Rect
              x={PAD_L}
              y={y(critical)}
              width={plotW}
              height={Math.max(0, y(yMin) - y(critical))}
              fill={palette.critical}
              opacity={zoneOpacity(0.06, 0.03)}
            />

            {/* Grid and the value axis. */}
            {ticks.map((tick) => (
              <G key={`tick-${tick}`}>
                <Line x1={PAD_L} x2={PAD_L + plotW} y1={y(tick)} y2={y(tick)} stroke={palette.chartGridMinor} strokeWidth={1} />
                <SvgText x={PAD_L - 8} y={y(tick) + 3.2} fontSize={AXIS_FONT} fill={palette.inkFaint} textAnchor="end">
                  {tick}
                </SvgText>
              </G>
            ))}

            {/* Thresholds, named where they are drawn. */}
            {[
              { value: target, tone: palette.accent, label: `Target ${target}`, opacity: 0.75 },
              { value: warning, tone: palette.warning, label: `Warning ${warning}`, opacity: 0.55 },
              { value: critical, tone: palette.critical, label: `Critical ${critical}`, opacity: 0.7 },
            ].map((rule) => (
              <G key={rule.label}>
                <Line
                  x1={PAD_L}
                  x2={PAD_L + plotW}
                  y1={y(rule.value)}
                  y2={y(rule.value)}
                  stroke={rule.tone}
                  strokeWidth={1}
                  strokeDasharray="4 5"
                  opacity={rule.opacity}
                />
                <SvgText x={PAD_L + plotW + 9} y={y(rule.value) + 3.2} fontSize={AXIS_FONT} fill={rule.tone} textAnchor="start">
                  {rule.label}
                </SvgText>
              </G>
            ))}

            {areaPath ? <Path d={areaPath} fill="url(#plantHealthArea)" /> : null}
            {/* A soft under-stroke separates the line from the band behind it
                without adding a second colour to the chart. */}
            {linePath ? <Path d={linePath} fill="none" stroke={alpha(palette.accent, 0.16)} strokeWidth={5} strokeLinecap="round" /> : null}
            {linePath ? (
              <Path d={linePath} fill="none" stroke={palette.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            ) : null}

            {/* Exceptions only: the worst reading, the best, and now. */}
            {showMin ? (
              <G>
                <Circle cx={coords[minIndex].x} cy={coords[minIndex].y} r={3.5} fill={palette.critical} stroke={palette.panel} strokeWidth={1.5} />
                <G>
                  <Rect
                    x={clamp(coords[minIndex].x - 27, PAD_L, PAD_L + plotW - 54)}
                    y={Math.min(coords[minIndex].y + 9, PAD_T + plotH - 17)}
                    width={54}
                    height={17}
                    rx={4}
                    fill={palette.critical}
                  />
                  <SvgText
                    x={clamp(coords[minIndex].x - 27, PAD_L, PAD_L + plotW - 54) + 27}
                    y={Math.min(coords[minIndex].y + 9, PAD_T + plotH - 17) + 11.5}
                    fontSize={9}
                    fontWeight="600"
                    fill="#FFFFFF"
                    textAnchor="middle"
                  >
                    {`MIN ${stats.min}`}
                  </SvgText>
                </G>
              </G>
            ) : null}

            {showMax ? (
              <G>
                <Circle cx={coords[maxIndex].x} cy={coords[maxIndex].y} r={3.5} fill={palette.accent} stroke={palette.panel} strokeWidth={1.5} />
                <G>
                  <Rect
                    x={clamp(coords[maxIndex].x - 27, PAD_L, PAD_L + plotW - 54)}
                    y={Math.max(coords[maxIndex].y - 26, PAD_T)}
                    width={54}
                    height={17}
                    rx={4}
                    fill={palette.accent}
                  />
                  <SvgText
                    x={clamp(coords[maxIndex].x - 27, PAD_L, PAD_L + plotW - 54) + 27}
                    y={Math.max(coords[maxIndex].y - 26, PAD_T) + 11.5}
                    fontSize={9}
                    fontWeight="600"
                    fill="#FFFFFF"
                    textAnchor="middle"
                  >
                    {`MAX ${stats.max}`}
                  </SvgText>
                </G>
              </G>
            ) : null}

            {coords.length > 0 ? (
              <G>
                <Circle cx={coords[currentIndex].x} cy={coords[currentIndex].y} r={8} fill={palette.accent} opacity={0.14} />
                <Circle cx={coords[currentIndex].x} cy={coords[currentIndex].y} r={4} fill={palette.panel} stroke={palette.accent} strokeWidth={2.4} />
              </G>
            ) : null}

            {/* Time axis. Five ticks at most — this is a strip, not a workspace. */}
            {xLabelIndices.map((index) => (
              <SvgText
                key={`x-${index}`}
                x={x(index)}
                y={size.height - 6}
                fontSize={AXIS_FONT}
                fill={palette.inkFaint}
                textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
              >
                {points[index]?.label ?? ''}
              </SvgText>
            ))}

            {hoverPoint ? (
              <G>
                <Line
                  x1={hoverPoint.x}
                  x2={hoverPoint.x}
                  y1={PAD_T}
                  y2={PAD_T + plotH}
                  stroke={palette.chartCrosshair}
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <Circle cx={hoverPoint.x} cy={hoverPoint.y} r={4.5} fill={palette.panel} stroke={palette.accent} strokeWidth={2.2} />
              </G>
            ) : null}
          </Svg>
        ) : null}

        {hoverPoint && hoverData ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: tipLeft,
              top: tipTop,
              width: TIP_W,
              paddingHorizontal: STEP * 2.5,
              paddingVertical: STEP * 2,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: palette.line,
              backgroundColor: palette.chartTooltipBg,
              shadowColor: palette.shadow,
              shadowOpacity: isDark ? 0.4 : 0.12,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            }}
          >
            <Text className="font-mono" style={{ fontSize: 9.5, color: palette.inkFaint }}>
              {hoverData.label}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: STEP * 1.5, marginTop: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: palette.accent }} />
              <Text className="font-body" style={{ flex: 1, minWidth: 0, fontSize: 11, color: palette.inkMuted }}>
                Health score
              </Text>
              <Text className="font-mono" style={{ fontSize: 12, fontWeight: '600', color: palette.ink }}>
                {hoverData.value}
              </Text>
            </View>
            <Text className="font-mono" style={{ marginTop: 4, fontSize: 9.5, color: palette.inkFaint }}>
              {hoverData.value - target >= 0 ? '+' : ''}
              {hoverData.value - target} pts vs target
            </Text>
          </View>
        ) : null}
      </View>
    </Panel>
  );
}
