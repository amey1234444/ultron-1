/**
 * The cards and panels around the health chart.
 *
 * All presentational. Each takes values the service sent and renders them; none
 * derives a health state, a probability or a remaining life. Where the service
 * sent nothing, these render an em dash rather than a zero, because zero is a
 * measurement and absence is not.
 */
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { consolePalette } from '../../../ui';
import type {
  ComponentRul,
  HealthDriver,
  HealthState,
  Percentiles,
} from '../../../../lib/knowledge/ml/rulContract';

const DASH = '—';

export function hairline(isDark: boolean): string {
  return isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
}

export function stateColour(state: HealthState, isDark: boolean): string {
  const palette = consolePalette(isDark);
  if (state === 'HEALTHY') return palette.accent;
  if (state === 'DEGRADING') return palette.warning;
  if (state === 'CRITICAL') return palette.critical;
  return palette.inkMuted;
}

/* -- primitives ------------------------------------------------------------ */

export function Card({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  const { isDark } = useAppTheme();
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  return (
    <View
      style={{ flexGrow: 1, flexBasis: 170, minWidth: 150, borderColor: hairline(isDark) }}
      className="gap-1 rounded-lg border px-3 py-2.5"
    >
      <Text className={cn('font-mono text-[9.5px] tracking-wider', muted)}>{label}</Text>
      {children}
      {note ? <Text className={cn('font-body text-[10.5px] leading-[15px]', muted)}>{note}</Text> : null}
    </View>
  );
}

export function Panel({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  const { isDark } = useAppTheme();
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const ink = isDark ? 'text-ink' : 'text-ink-inverse';
  return (
    <View style={{ flexGrow: 1, flexBasis: 300, minWidth: 260, borderColor: hairline(isDark) }} className="gap-2.5 rounded-xl border p-3">
      <View className="gap-0.5">
        <Text className={cn('font-mono text-[11px] font-bold tracking-wider', ink)}>{title}</Text>
        {caption ? <Text className={cn('font-body text-[10.5px] leading-[15px]', muted)}>{caption}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** A banner that states a fact about the data rather than decorating it. */
export function Banner({ tone, children }: { tone: 'info' | 'warning' | 'critical'; children: ReactNode }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const colour = tone === 'critical' ? palette.critical : tone === 'warning' ? palette.warning : palette.info;
  return (
    <View style={{ borderColor: colour, backgroundColor: `${colour}14` }} className="rounded-lg border px-3 py-2">
      <Text style={{ color: colour }} className="font-body text-[11.5px] leading-[17px]">
        {children}
      </Text>
    </View>
  );
}

/* -- summary --------------------------------------------------------------- */

function formatRul(percentiles: Percentiles | null, unit: 'days' | 'hours'): { value: string; note: string } {
  if (!percentiles) return { value: DASH, note: 'Not available' };
  const suffix = unit === 'days' ? 'days' : 'h';
  return {
    value: `${Math.round(percentiles.p50)} ${suffix}`,
    note: `${Math.round(percentiles.p10)}–${Math.round(percentiles.p90)} ${suffix} (80% interval)`,
  };
}

export function HealthSummaryStrip({
  value,
  unit,
  stale,
}: {
  value: ComponentRul;
  unit: 'days' | 'hours';
  stale: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ink = isDark ? 'text-ink' : 'text-ink-inverse';
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const rul = formatRul(unit === 'days' ? value.summary.rulDays : value.summary.rulOperatingHours, unit);
  const notDegrading = value.status === 'NOT_DEGRADING';
  const d30 = value.summary.failureProbability?.d30 ?? null;

  return (
    <View className="flex-row flex-wrap" style={{ gap: 10 }}>
      <Card label="HEALTH INDEX">
        <View className="flex-row items-baseline" style={{ gap: 8 }}>
          <Text className={cn('font-mono text-[19px] tabular-nums', ink)}>{value.summary.healthIndex.toFixed(2)}</Text>
          <Text style={{ color: stateColour(value.summary.healthState, isDark) }} className="font-mono text-[10px] tracking-wider">
            {value.summary.healthState}
          </Text>
        </View>
      </Card>

      <Card
        label={unit === 'days' ? 'REMAINING LIFE' : 'REMAINING OPERATING HOURS'}
        note={notDegrading ? 'Not degrading — beyond horizon' : rul.note}
      >
        <Text className={cn('font-mono text-[19px] tabular-nums', ink)}>
          {notDegrading ? 'Beyond horizon' : rul.value}
        </Text>
      </Card>

      <Card label="30-DAY FAILURE PROBABILITY">
        <Text
          style={d30 !== null && d30 > 0.5 ? { color: palette.critical } : undefined}
          className={cn('font-mono text-[19px] tabular-nums', d30 === null || d30 <= 0.5 ? ink : undefined)}
        >
          {d30 === null ? DASH : `${Math.round(d30 * 100)}%`}
        </Text>
      </Card>

      <Card label="CONFIDENCE">
        <Text className={cn('font-mono text-[19px]', ink)}>{value.summary.confidence}</Text>
      </Card>

      {!value.provenance.trainedOnRealData ? (
        <Card label="VALIDATION" note="No model here has been fitted on data from a real machine.">
          <Text style={{ color: palette.warning }} className="font-mono text-[11px] tracking-wider">
            EXPERIMENTAL · SYNTHETIC
          </Text>
        </Card>
      ) : null}

      {stale ? (
        <Card label="FRESHNESS" note={`Computed ${value.provenance.computedAt.replace('T', ' ').slice(0, 16)}`}>
          <Text style={{ color: palette.warning }} className="font-mono text-[11px] tracking-wider">
            STALE
          </Text>
        </Card>
      ) : null}
    </View>
  );
}

/* -- failure probability --------------------------------------------------- */

export function FailureProbabilityPanel({ value }: { value: ComponentRul }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const ink = isDark ? 'text-ink' : 'text-ink-inverse';
  const probability = value.summary.failureProbability;

  return (
    <Panel title="FAILURE PROBABILITY" caption="The model's probability that this component reaches its failure threshold within each window.">
      {!probability ? (
        <Text className={cn('font-body text-[11.5px]', muted)}>
          Not available — no degradation has been modelled for this component.
        </Text>
      ) : (
        <View className="gap-2">
          {([['7 days', probability.d7], ['30 days', probability.d30], ['60 days', probability.d60]] as const).map(
            ([label, p]) => (
              <View key={label} className="gap-1">
                <View className="flex-row items-baseline justify-between">
                  <Text className={cn('font-body text-[11px]', muted)}>{label}</Text>
                  <Text className={cn('font-mono text-[12px] tabular-nums', ink)}>{Math.round(p * 100)}%</Text>
                </View>
                <View style={{ height: 6, backgroundColor: palette.track, borderRadius: 3, overflow: 'hidden' }}>
                  <View
                    style={{
                      width: `${Math.max(1, Math.round(p * 100))}%`,
                      height: '100%',
                      backgroundColor: p > 0.5 ? palette.critical : p > 0.2 ? palette.warning : palette.accent,
                    }}
                  />
                </View>
              </View>
            ),
          )}
        </View>
      )}
    </Panel>
  );
}

/* -- drivers --------------------------------------------------------------- */

export function TopDriversPanel({ drivers }: { drivers: readonly HealthDriver[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const ink = isDark ? 'text-ink' : 'text-ink-inverse';
  const max = drivers.reduce((best, entry) => Math.max(best, entry.contribution), 0);

  return (
    <Panel title="WHAT IS DRIVING IT" caption="The indicators moving the health index, ranked by their share of the movement.">
      {drivers.length === 0 ? (
        <Text className={cn('font-body text-[11.5px]', muted)}>
          No drivers reported — the model attributed no movement to a single indicator.
        </Text>
      ) : (
        <View className="gap-2">
          {drivers.map((driver) => (
            <View key={driver.indicator} className="gap-1">
              <View className="flex-row items-baseline justify-between" style={{ gap: 8 }}>
                <Text numberOfLines={1} className={cn('flex-1 font-body text-[11px]', ink)}>
                  {driver.label}
                </Text>
                <Text className={cn('font-mono text-[11px] tabular-nums', muted)}>
                  {Math.round(driver.contribution * 100)}%
                </Text>
              </View>
              <View style={{ height: 5, backgroundColor: palette.track, borderRadius: 3, overflow: 'hidden' }}>
                <View
                  style={{
                    width: `${max > 0 ? Math.max(2, Math.round((driver.contribution / max) * 100)) : 2}%`,
                    height: '100%',
                    backgroundColor: palette.forecast,
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

/* -- RUL convergence ------------------------------------------------------- */

/**
 * Whether the estimate is settling.
 *
 * A remaining-life number that moves every day is not yet an answer. Drawn as a
 * plain band-and-line rather than reusing the main chart, because the y axis
 * here is days rather than a health index and sharing the axis code would mean
 * one of the two lying about its units.
 */
export function RulConvergenceChart({ value, width = 420, height = 150 }: { value: ComponentRul; width?: number; height?: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const points = value.rulEstimateHistory;

  if (points.length < 2) {
    return (
      <Panel title="IS THE ESTIMATE SETTLING?" caption="Successive remaining-life estimates, with their 80% interval.">
        <Text className={cn('font-body text-[11.5px]', muted)}>
          Not enough estimates yet to show whether the forecast is converging.
        </Text>
      </Panel>
    );
  }

  const pad = { top: 10, right: 10, bottom: 18, left: 30 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxDays = Math.max(...points.map((p) => p.rulP90Days)) * 1.05;
  const x = (index: number) => pad.left + (index / Math.max(1, points.length - 1)) * plotW;
  const y = (days: number) => pad.top + (1 - days / Math.max(1, maxDays)) * plotH;

  const ring = [
    ...points.map((p, i) => `${x(i).toFixed(1)},${y(p.rulP90Days).toFixed(1)}`),
    ...[...points].reverse().map((p, i) => `${x(points.length - 1 - i).toFixed(1)},${y(p.rulP10Days).toFixed(1)}`),
  ].join(' ');

  return (
    <Panel title="IS THE ESTIMATE SETTLING?" caption="Successive remaining-life estimates, with their 80% interval. A narrowing band means the forecast is converging.">
      <RulSvg
        width={width}
        height={height}
        ring={ring}
        median={points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.rulP50Days).toFixed(1)}`).join(' ')}
        band={palette.forecast}
        line={palette.chartNormal}
        axis={palette.chartAxis}
        axisText={palette.chartAxisText}
        pad={pad}
        plotW={plotW}
        plotH={plotH}
        maxDays={maxDays}
        firstDate={points[0].date}
        lastDate={points[points.length - 1].date}
      />
    </Panel>
  );
}

/* -- provenance ------------------------------------------------------------ */

export function ProvenanceFooter({ value }: { value: ComponentRul }) {
  const { isDark } = useAppTheme();
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const p = value.provenance;
  return (
    <Text className={cn('font-body text-[10.5px] leading-[15px]', muted)}>
      {p.method} v{p.methodVersion} · computed {p.computedAt.replace('T', ' ').slice(0, 16)} ·{' '}
      {p.dataQualityDaysUsed} days of valid data · labels {p.labelQuality} ·{' '}
      {p.trainedOnRealData ? 'fitted on real machine data' : 'not fitted on real machine data'}
    </Text>
  );
}

/* -- the accessible fallback ----------------------------------------------- */

export function DataTable({ value, onClose }: { value: ComponentRul; onClose: () => void }) {
  const { isDark } = useAppTheme();
  const ink = isDark ? 'text-ink' : 'text-ink-inverse';
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const rows = [
    ...value.history.map((point) => [point.date, point.hi.toFixed(3), point.sufficiency, point.healthState] as const),
    ...value.projection.map(
      (point) => [point.date, point.hiP50.toFixed(3), `${point.hiP10.toFixed(3)}–${point.hiP90.toFixed(3)}`, 'PROJECTED'] as const,
    ),
  ];

  return (
    <View style={{ borderColor: hairline(isDark) }} className="gap-2 rounded-xl border p-3">
      <View className="flex-row items-center justify-between">
        <Text className={cn('font-mono text-[11px] font-bold tracking-wider', ink)}>DATA</Text>
        <Pressable onPress={onClose} accessibilityRole="button" className="rounded-md px-2 py-1">
          <Text className={cn('font-mono text-[10.5px]', muted)}>Close</Text>
        </Pressable>
      </View>
      <View className="flex-row" style={{ gap: 12 }}>
        {['Date', 'Health index', 'Interval / hours', 'State'].map((heading) => (
          <Text key={heading} className={cn('flex-1 font-mono text-[9.5px] tracking-wider', muted)}>
            {heading.toUpperCase()}
          </Text>
        ))}
      </View>
      {rows.slice(0, 200).map((row, index) => (
        <View key={`${row[0]}-${index}`} className="flex-row" style={{ gap: 12 }}>
          {row.map((cell, cellIndex) => (
            <Text key={cellIndex} className={cn('flex-1 font-mono text-[10.5px] tabular-nums', ink)}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
      {rows.length > 200 ? (
        <Text className={cn('font-body text-[10.5px]', muted)}>
          Showing the first 200 of {rows.length} rows.
        </Text>
      ) : null}
    </View>
  );
}

/* -- small SVG helper, kept out of the panel body -------------------------- */

import Svg, { Line as SvgLine, Path as SvgPath, Polygon as SvgPolygon, Text as SvgTextEl } from 'react-native-svg';

function RulSvg(props: {
  width: number;
  height: number;
  ring: string;
  median: string;
  band: string;
  line: string;
  axis: string;
  axisText: string;
  pad: { top: number; right: number; bottom: number; left: number };
  plotW: number;
  plotH: number;
  maxDays: number;
  firstDate: string;
  lastDate: string;
}) {
  const { pad, plotW, plotH } = props;
  return (
    <Svg width="100%" height={props.height} viewBox={`0 0 ${props.width} ${props.height}`} preserveAspectRatio="none">
      <SvgPolygon points={props.ring} fill={props.band} opacity={0.18} />
      <SvgPath d={props.median} stroke={props.line} strokeWidth={1.75} fill="none" />
      <SvgLine x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} stroke={props.axis} strokeWidth={1} />
      <SvgTextEl x={pad.left - 6} y={pad.top + 4} fontSize={9} fill={props.axisText} textAnchor="end">
        {Math.round(props.maxDays)}
      </SvgTextEl>
      <SvgTextEl x={pad.left - 6} y={pad.top + plotH} fontSize={9} fill={props.axisText} textAnchor="end">
        0
      </SvgTextEl>
      <SvgTextEl x={pad.left} y={pad.top + plotH + 13} fontSize={9} fill={props.axisText}>
        {props.firstDate}
      </SvgTextEl>
      <SvgTextEl x={pad.left + plotW} y={pad.top + plotH + 13} fontSize={9} fill={props.axisText} textAnchor="end">
        {props.lastDate}
      </SvgTextEl>
    </Svg>
  );
}
