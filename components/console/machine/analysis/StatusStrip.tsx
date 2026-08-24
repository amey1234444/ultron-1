import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import {
  conditionHexes,
  CONDITION_LABEL,
  OVERALL_TREND_LABEL,
  type ConditionCounts,
  type OverallState,
  type OverallTrend,
  type OverviewCondition,
} from '../../../../lib/analysisOverview';

// A labelled value with an optional condition colour. Small enough to sit in a
// dense grid, and the shared building block for both the status strip and the
// metric boxes elsewhere on the page.
export function MetricBox({
  label,
  value,
  subtitle,
  condition,
  emphasis,
}: {
  label: string;
  value: string;
  subtitle?: string;
  condition?: OverviewCondition;
  // The machine's own state gets more weight than the facts around it.
  emphasis?: boolean;
}) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
  const colour = condition ? conditionHex[condition] : undefined;

  return (
    <View
      className={cn('flex-1 gap-1.5 rounded-xl border px-3.5 py-3', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
      style={{ borderColor: emphasis && colour ? `${colour}4D` : hairline, minWidth: 150 }}
    >
      <Text numberOfLines={1} className={cn('font-mono text-[9px] tracking-wider', mutedClass)}>
        {label}
      </Text>

      <Text
        numberOfLines={1}
        style={{ color: colour, fontSize: emphasis ? 24 : 17, lineHeight: emphasis ? 27 : 20 }}
        className={cn('font-mono font-bold tabular-nums', !colour && inkClass)}
      >
        {value}
      </Text>

      {subtitle ? (
        <Text numberOfLines={2} className={cn('font-body text-[10px] leading-[14px]', mutedClass)}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

// The six facts a reader needs before anything else.
//
// The two that are easiest to get wrong are next to each other on purpose:
// machine condition and machine health. Health is a weighted average and averages
// hide things, so it is labelled as supporting information and can never set the
// condition — see overallState. When the score would have understated the machine,
// the strip says so out loud rather than quietly showing the kinder number.
export function StatusStrip({
  state,
  counts,
  trend,
  operatingState,
  operatingDetail,
  totalIssues,
}: {
  state: OverallState;
  counts: ConditionCounts;
  trend: { trend: OverallTrend; detail: string };
  operatingState: string;
  operatingDetail?: string;
  totalIssues: number;
}) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const mix = [
    counts.danger > 0 ? `${counts.danger} danger` : null,
    counts.alert > 0 ? `${counts.alert} alert` : null,
    counts.attention > 0 ? `${counts.attention} attention` : null,
    counts.offline > 0 ? `${counts.offline} offline` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-3">
        <MetricBox
          label="MACHINE CONDITION"
          value={CONDITION_LABEL[state.condition]}
          subtitle={state.criticalReason ? `Worst: ${state.criticalReason}` : 'Nothing open'}
          condition={state.condition}
          emphasis
        />

        <MetricBox
          label="MACHINE HEALTH"
          value={state.health === null ? 'NO DATA' : `${Math.round(state.health)} / 100`}
          subtitle="Supporting metric — never overrides condition"
          condition={state.health === null ? 'offline' : state.healthSuggests}
        />

        <MetricBox
          label="OPEN ISSUES"
          value={String(totalIssues).padStart(2, '0')}
          subtitle={mix || 'none open'}
        />
      </View>

      <View className="flex-row flex-wrap gap-3">
        <MetricBox
          label="MOST CRITICAL"
          value={state.criticalReason ? state.criticalReason.split(' · ')[0].toUpperCase() : '--'}
          subtitle={state.criticalReason ? state.criticalReason.split(' · ')[1] : 'nothing open'}
          condition={state.condition === 'healthy' ? undefined : state.condition}
        />

        {/* Operating state is not condition. A machine can be running and in
            danger, and hiding one behind the other is how an overview misleads. */}
        <MetricBox label="OPERATING STATE" value={operatingState} subtitle={operatingDetail ?? 'not reported'} />

        <MetricBox
          label="OVERALL TREND"
          value={OVERALL_TREND_LABEL[trend.trend]}
          subtitle={trend.detail}
          condition={trend.trend === 'worsening' ? 'alert' : trend.trend === 'improving' ? 'healthy' : undefined}
        />
      </View>

      {/* Said explicitly, because this is the exact case where a single number
          would have reassured the reader wrongly. */}
      {state.scoreUnderstates ? (
        <View
          className="flex-row flex-wrap items-center gap-2 rounded-lg px-3 py-2"
          style={{ backgroundColor: `${conditionHex[state.condition]}12` }}
        >
          <Text style={{ color: conditionHex[state.condition] }} className="font-mono text-[9px] font-bold tracking-wider">
            HEALTH SCORE UNDERSTATES THIS MACHINE
          </Text>
          <Text className={cn('flex-1 font-body text-[10px]', mutedClass)}>
            The average reads {CONDITION_LABEL[state.healthSuggests].toLowerCase()}, but a component is in{' '}
            {CONDITION_LABEL[state.condition].toLowerCase()}. Condition wins.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
