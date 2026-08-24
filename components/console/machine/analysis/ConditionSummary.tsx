import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import {
  CONDITION_HEX,
  CONDITION_LABEL,
  type ConditionSummaryText,
  type OverallState,
  type OverallTrend,
  type PriorityAction,
} from '../../../../lib/analysisOverview';
import { MetricBox } from './StatusStrip';

// The plain-language answer, for a reader who is not a vibration analyst.
//
// The text is assembled from the data in summariseCondition, not generated: an
// overview that paraphrases its own numbers in a paragraph of prose invites the
// two to drift apart, and the prose is what people quote.
export function ConditionSummary({
  summary,
  state,
  trend,
  startedLabel,
  dataFreshness,
}: {
  summary: ConditionSummaryText;
  state: OverallState;
  trend: { trend: OverallTrend; detail: string };
  startedLabel: string;
  dataFreshness: { label: string; healthy: boolean };
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="gap-4">
      <View>
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Machine condition summary</Text>
        <Text className={cn('mt-1 font-mono text-[9px] tracking-wider', mutedClass)}>PLAIN-LANGUAGE INTERPRETATION</Text>
      </View>

      <View className="flex-row flex-wrap gap-4">
        <View style={{ flexGrow: 3, flexBasis: 420, minWidth: 300 }} className="gap-2">
          <Text className={cn('font-mono text-[9px] font-bold tracking-wider text-accent')}>WHAT IS HAPPENING</Text>
          <Text className={cn('font-body-bold text-[15px] leading-[21px]', inkClass)}>{summary.headline}</Text>
          <Text className={cn('font-body text-[12px] leading-[19px]', mutedClass)} style={{ maxWidth: 620 }}>
            {summary.body}
          </Text>
        </View>

        {/* The four questions that do not need a sentence. */}
        <View style={{ flexGrow: 1, flexBasis: 260, minWidth: 240 }} className="gap-2">
          <View className="flex-row gap-2">
            <MetricBox label="HOW SERIOUS" value={CONDITION_LABEL[state.condition]} condition={state.condition} />
            <MetricBox
              label="GETTING WORSE"
              value={trend.trend === 'worsening' ? 'YES' : trend.trend === 'improving' ? 'NO' : 'HOLDING'}
              subtitle={trend.detail}
              condition={trend.trend === 'worsening' ? 'alert' : undefined}
            />
          </View>
          <View className="flex-row gap-2">
            <MetricBox label="STARTED" value={startedLabel} />
            <MetricBox
              label="DATA FRESHNESS"
              value={dataFreshness.label}
              condition={dataFreshness.healthy ? 'healthy' : 'alert'}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

// The one to three things worth doing now. Capped deliberately: a list of twelve
// recommendations has not prioritised anything, it has only sorted.
export function PriorityActions({ actions }: { actions: PriorityAction[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';

  return (
    <View className="gap-3">
      <View>
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>What needs attention now</Text>
        <Text className={cn('mt-1 font-mono text-[9px] tracking-wider', mutedClass)}>TOP PRIORITY ACTIONS</Text>
      </View>

      {actions.length === 0 ? (
        <Text className={cn('font-body text-[11px] italic', mutedClass)}>Nothing requires action.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-3">
          {actions.map((action) => {
            const colour = CONDITION_HEX[action.condition];
            return (
              <View
                key={action.priority}
                style={{ flexGrow: 1, flexBasis: 260, minWidth: 240, borderColor: `${colour}40` }}
                className="gap-2 rounded-xl border px-3.5 py-3"
              >
                <View className="flex-row items-center gap-2">
                  <Text style={{ color: colour }} className="font-mono text-[10px] font-bold tracking-wider">
                    {action.priority}
                  </Text>
                  <View style={{ width: 3, height: 3, borderRadius: 2, backgroundColor: hairline }} />
                  <Text numberOfLines={1} className={cn('flex-1 font-mono text-[10px] tracking-wider', mutedClass)}>
                    {action.area}
                  </Text>
                </View>

                <Text className={cn('font-body-bold text-[13px] leading-[18px]', inkClass)}>{action.title}</Text>
                <Text className={cn('font-body text-[11px] leading-[16px]', mutedClass)}>{action.description}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
