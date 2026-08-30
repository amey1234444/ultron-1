// The prognosis page's panels below the hero: the trend, the live evidence
// behind it, and the three closing columns.
//
// The ordering is the argument, not a layout preference. Trend answers "which
// direction and when", evidence answers "on what readings", correlation answers
// "why the engine believes it", outlook answers "what happens next" and
// guidance answers "what a person should do". Anything that competes visually
// with the trend has been turned down.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { EqualColumnStrip } from '../analysis/EqualColumnStrip';
import type { EvidenceMetric, PrognosisMetric, PrognosisReason, PrognosisViewModel } from '../analysis/prognosisViewModel';
import { Hoverable, alpha, consolePalette, radius, tabular, text } from '../../../ui';
import { DegradationForecastChart } from './DegradationForecastChart';
import { PanelHeading, ShutdownStrip, toneHex } from './PrognosisHero';

function Panel({ children, style }: { children: ReactNode; style?: object }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className="gap-3 border px-4 py-3.5"
      style={{ borderColor: palette.line, borderRadius: radius.md, backgroundColor: palette.panel, ...style }}
    >
      {children}
    </View>
  );
}

function formatDays(days: number | null): string {
  if (days === null) return '—';
  if (days <= 0) return 'NOW';
  return `${Math.round(days)} DAYS`;
}

/** The metric selector. Compact by design: it must not push the chart down. */
function MetricSelector({
  metrics,
  selectedId,
  onSelect,
}: {
  metrics: PrognosisMetric[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  if (metrics.length < 2) return null;

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {metrics.map((metric) => {
        const active = metric.id === selectedId;
        return (
          <Hoverable
            key={metric.id}
            onPress={() => onSelect(metric.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Show ${metric.title}`}
            className="border px-2.5 py-1.5"
            style={({ hovered }) => ({
              borderRadius: 4,
              borderColor: active ? alpha(palette.forecast, 0.55) : hovered ? palette.hoverBorder : palette.line,
              backgroundColor: active ? alpha(palette.forecast, 0.1) : hovered ? palette.hoverSurface : palette.panelRaised,
            })}
          >
            <Text className={text.label} style={{ color: active ? palette.forecast : palette.inkMuted }} numberOfLines={1}>
              {metric.label}
            </Text>
          </Hoverable>
        );
      })}
    </View>
  );
}

/** Four readings across the panel. A strip, not four more cards. */
function TrendSummary({ metric }: { metric: PrognosisMetric }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const unit = metric.unit ? ` ${metric.unit}` : '';

  const cells = [
    {
      label: 'CURRENT VALUE',
      value: metric.current === null ? '—' : `${metric.current.toFixed(metric.decimals)}${unit}`,
      note: 'Latest measured reading',
      colour: palette.accent,
    },
    {
      label: 'ALERT THRESHOLD',
      value: metric.alertThreshold === null ? '—' : `${metric.alertThreshold.toFixed(metric.decimals)}${unit}`,
      note: 'Early action level',
      colour: palette.forecast,
    },
    {
      label: 'DANGER THRESHOLD',
      value: metric.dangerThreshold === null ? '—' : `${metric.dangerThreshold.toFixed(metric.decimals)}${unit}`,
      note: 'Severe-risk region',
      colour: palette.critical,
    },
    {
      label: 'VISIBLE SCALE',
      value: `${metric.scaleMin.toFixed(metric.decimals)}–${metric.scaleMax.toFixed(metric.decimals)}${unit}`,
      note: 'Focused for trend clarity',
      colour: palette.ink,
    },
  ];

  return (
    <EqualColumnStrip
      minColumnWidth={150}
      cells={cells.map((cell) => ({
        key: cell.label,
        node: (
          <>
            <Text className={text.label} style={{ color: palette.inkFaint }} numberOfLines={1}>
              {cell.label}
            </Text>
            <Text className={text.dataMd} style={[tabular, { color: cell.colour, fontWeight: '600' }]} numberOfLines={1}>
              {cell.value}
            </Text>
            <Text className={text.micro} style={{ color: palette.inkFaint }} numberOfLines={1}>
              {cell.note}
            </Text>
          </>
        ),
      }))}
    />
  );
}

/** Three results under the chart. Compact — the chart stays dominant. */
function ForecastMilestones({ metric }: { metric: PrognosisMetric }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const unit = metric.unit ? ` ${metric.unit}` : '';

  const stones = [
    {
      label: 'CURRENT',
      when: 'TODAY',
      value: metric.current === null ? '—' : `${metric.current.toFixed(metric.decimals)}${unit}`,
      colour: palette.accent,
    },
    {
      label: 'PROJECTED ALERT',
      when: metric.alertCrossingDay === null ? 'NOT PROJECTED' : `IN ${formatDays(metric.alertCrossingDay)}`,
      value: metric.alertThreshold === null ? '—' : `${metric.alertThreshold.toFixed(metric.decimals)}${unit}`,
      colour: palette.forecast,
    },
    {
      label: 'PROJECTED DANGER',
      when: metric.dangerCrossingDay === null ? 'NOT PROJECTED' : `IN ${formatDays(metric.dangerCrossingDay)}`,
      value: metric.dangerThreshold === null ? '—' : `${metric.dangerThreshold.toFixed(metric.decimals)}${unit}`,
      colour: palette.critical,
    },
  ];

  return (
    <View className="flex-row flex-wrap justify-center gap-2">
      {stones.map((stone) => (
        <View
          key={stone.label}
          className="flex-row items-center gap-2.5 border px-3 py-1.5"
          style={{ borderColor: alpha(stone.colour, 0.28), backgroundColor: alpha(stone.colour, 0.07), borderRadius: 4 }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: stone.colour }} />
          <Text className={text.label} style={{ color: palette.inkMuted }}>
            {stone.label}
          </Text>
          <Text className={text.label} style={{ color: stone.colour }}>
            {stone.when}
          </Text>
          <Text className={text.data} style={[tabular, { color: palette.ink }]}>
            {stone.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function PrognosisTrendPanel({
  model,
  metric,
  onSelectMetric,
}: {
  model: PrognosisViewModel;
  metric: PrognosisMetric;
  onSelectMetric: (id: string) => void;
}) {
  return (
    <Panel>
      <PanelHeading
        eyebrow="LONG-TERM CONDITION TREND"
        title={metric.title}
        subtitle={`Fitted to the last ${metric.historyDays} days of measured history, projected ${metric.forecastDays} days forward${metric.derived ? ' — curve reconstructed from the fitted model' : ''}`}
        trailingLabel="SELECTED METRIC"
        trailingValue={metric.title}
      />
      <MetricSelector metrics={model.metrics} selectedId={metric.id} onSelect={onSelectMetric} />
      <TrendSummary metric={metric} />
      <DegradationForecastChart metric={metric} />
      <ForecastMilestones metric={metric} />
    </Panel>
  );
}

/** One container, thin separators — not six independent boxes. */
export function SupportingEvidenceStrip({ items }: { items: EvidenceMetric[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  if (items.length === 0) return null;

  return (
    <Panel>
      <Text className={text.label} style={{ color: palette.inkFaint }}>
        CURRENT SUPPORTING EVIDENCE
      </Text>
      {/* Equal columns, so the six readings are drawn as the peers they are.
          The label is held to one line because a label that wraps pushes its
          own value down a row and breaks the shared baseline across the strip. */}
      <EqualColumnStrip
        minColumnWidth={168}
        cells={items.map((item) => ({
          key: item.id,
          node: (
            <>
              <Text className={text.label} style={{ color: palette.inkFaint }} numberOfLines={1}>
                {item.label}
              </Text>
              <Text className={text.dataMd} style={[tabular, { color: palette.ink, fontWeight: '600' }]} numberOfLines={1}>
                {item.value}
              </Text>
              <Text className={text.micro} style={{ color: toneHex(item.tone, isDark) }} numberOfLines={1}>
                {item.note}
              </Text>
            </>
          ),
        }))}
      />
    </Panel>
  );
}

function ReasonRow({ reason }: { reason: PrognosisReason }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const colour = reason.strong ? palette.forecast : palette.neutral;

  return (
    <Hoverable
      className="flex-row items-start gap-2.5 px-2 py-1.5"
      style={({ hovered }) => ({
        marginHorizontal: -8,
        borderRadius: radius.sm,
        backgroundColor: hovered ? palette.hoverSurface : undefined,
      })}
    >
      <View style={{ width: 2, alignSelf: 'stretch', minHeight: 14, borderRadius: 1, backgroundColor: alpha(colour, reason.strong ? 0.95 : 0.5) }} />
      <Text className={cn('min-w-0 flex-1', text.body)} style={{ color: reason.strong ? palette.ink : palette.inkMuted }}>
        {reason.text}
      </Text>
    </Hoverable>
  );
}

export function EvidenceCorrelationPanel({ model }: { model: PrognosisViewModel }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <Panel style={{ flexGrow: 1, flexBasis: 320, minWidth: 280 }}>
      <PanelHeading eyebrow="EVIDENCE CORRELATION" title="Why ULTRON detected it" />
      {model.reasons.length === 0 ? (
        <Text className={text.body} style={{ color: palette.inkMuted }}>
          The engine did not report the features behind this projection.
        </Text>
      ) : (
        <View>
          {model.reasons.map((reason) => (
            <ReasonRow key={reason.id} reason={reason} />
          ))}
        </View>
      )}
    </Panel>
  );
}

/**
 * The forecast rail: today, the inspection window, alert, danger — in order and
 * to scale.
 *
 * The inspect stop is the one actionable date on it. Alert and danger are what
 * the machine will do; inspect is what a person should do, and it has to sit
 * visibly BEFORE the alert crossing or the rail is just a countdown to a
 * problem with no intervention on it.
 */
function ForecastRail({ alertDays, dangerDays }: { alertDays: number | null; dangerDays: number | null }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const span = Math.max(dangerDays ?? alertDays ?? 1, 1);
  const inspectDays = alertDays === null ? null : Math.max(1, Math.round(alertDays * 0.45));
  const at = (days: number | null) => (days === null ? null : Math.min(99, Math.max(0, (days / span) * 100)));
  const inspectAt = at(inspectDays);
  const alertAt = at(alertDays);
  const dangerAt = at(dangerDays);

  const dot = (left: number, colour: string, key: string) => (
    <View
      key={key}
      style={{ position: 'absolute', left: `${left}%`, top: -2.5, width: 8, height: 8, borderRadius: 4, backgroundColor: colour }}
    />
  );

  const stops = [
    { label: 'TODAY', when: '0', colour: palette.accent },
    { label: 'INSPECT', when: inspectDays === null ? '—' : `+${inspectDays}d`, colour: palette.accent },
    { label: 'ALERT', when: alertDays === null ? '—' : `+${Math.round(alertDays)}d`, colour: palette.forecast },
    { label: 'DANGER', when: dangerDays === null ? '—' : `+${Math.round(dangerDays)}d`, colour: palette.critical },
  ];

  return (
    <View className="gap-2 pt-1">
      <View style={{ height: 3, borderRadius: 2, backgroundColor: palette.track }}>
        <View
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${alertAt ?? 0}%`, backgroundColor: alpha(palette.accent, 0.5), borderRadius: 2 }}
        />
        {alertAt !== null && dangerAt !== null ? (
          <View
            style={{
              position: 'absolute',
              left: `${alertAt}%`,
              top: 0,
              bottom: 0,
              width: `${Math.max(0, dangerAt - alertAt)}%`,
              backgroundColor: alpha(palette.forecast, 0.55),
              borderRadius: 2,
            }}
          />
        ) : null}
        {dot(0, palette.accent, 'today')}
        {inspectAt === null ? null : dot(inspectAt, palette.accent, 'inspect')}
        {alertAt === null ? null : dot(alertAt, palette.forecast, 'alert')}
        {dangerAt === null ? null : dot(dangerAt, palette.critical, 'danger')}
      </View>
      <View className="flex-row justify-between">
        {stops.map((stop) => (
          <View key={stop.label} className="gap-0.5">
            <Text className={text.label} style={{ color: stop.colour }}>
              {stop.label}
            </Text>
            <Text className={text.micro} style={{ color: palette.inkFaint }}>
              {stop.when}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PredictiveOutlookPanel({ model }: { model: PrognosisViewModel }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const cells = [
    { label: 'CURRENT CONDITION', value: model.machineCondition.toLocaleUpperCase(), note: 'Operating within limits', tone: 'healthy' as const },
    { label: 'DEVELOPING CONDITION', value: model.affectedComponent, note: model.statusNote, tone: 'attention' as const },
    { label: 'ALERT CROSSING', value: formatDays(model.predictedAlertDays), note: 'Estimated', tone: 'attention' as const },
    { label: 'DANGER WINDOW', value: formatDays(model.predictedDangerDays), note: 'Projected region', tone: 'danger' as const },
  ];

  return (
    <Panel style={{ flexGrow: 1, flexBasis: 320, minWidth: 280 }}>
      <PanelHeading eyebrow="PREDICTIVE OUTLOOK" title="Forecast outlook" />
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {cells.map((cell) => (
          <View
            key={cell.label}
            className="gap-1 border px-3 py-2"
            style={{ flexGrow: 1, flexBasis: 130, minWidth: 120, borderColor: palette.line, borderRadius: 4, backgroundColor: palette.panelRaised }}
          >
            <Text className={text.label} style={{ color: palette.inkFaint }} numberOfLines={1}>
              {cell.label}
            </Text>
            <Text className={text.chip} style={{ color: toneHex(cell.tone, isDark) }} numberOfLines={1}>
              {cell.value}
            </Text>
            <Text className={text.micro} style={{ color: palette.inkFaint }} numberOfLines={1}>
              {cell.note}
            </Text>
          </View>
        ))}
      </View>
      <ForecastRail alertDays={model.predictedAlertDays} dangerDays={model.predictedDangerDays} />
      <Text className={text.micro} style={{ color: palette.inkMuted }}>
        {model.predictedDangerDays === null
          ? 'No danger crossing is projected from the current history.'
          : `If the current degradation rate persists, the condition is projected to reach the configured danger region in approximately ${Math.round(model.predictedDangerDays)} days.`}
      </Text>
    </Panel>
  );
}

export function MaintenanceGuidancePanel({ model }: { model: PrognosisViewModel }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <Panel style={{ flexGrow: 1, flexBasis: 320, minWidth: 280 }}>
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <PanelHeading eyebrow="MAINTENANCE GUIDANCE" title="Recommended action" />
        <View
          className="px-2 py-1"
          style={{ borderWidth: 1, borderColor: alpha(palette.forecast, 0.32), backgroundColor: alpha(palette.forecast, 0.1), borderRadius: 4 }}
        >
          <Text className={text.label} style={{ color: palette.forecast }}>
            {model.maintenance.category}
          </Text>
        </View>
      </View>

      <Text className={text.body} style={{ color: palette.inkMuted }}>
        {model.maintenance.body}
      </Text>

      {model.maintenance.checklist.length > 0 ? (
        <View className="flex-row flex-wrap" style={{ rowGap: 2 }}>
          {model.maintenance.checklist.map((item) => (
            <View key={item} className="flex-row items-center gap-2 py-1" style={{ flexGrow: 1, flexBasis: 150, minWidth: 140 }}>
              <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={9} color={palette.inkFaint} />
              <Text className={cn('min-w-0 flex-1', text.micro)} style={{ color: palette.ink }} numberOfLines={1}>
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <ShutdownStrip required={model.maintenance.shutdownRequired} />
    </Panel>
  );
}
