import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { formatRul, levelHexes, type PointEvidence } from '../../../../lib/condition';
import type { MachineSummary, RankedDiagnosis } from './rollup';

function evidenceLine(evidence: PointEvidence[]) {
  return evidence
    .slice(0, 4)
    .map((e) => `${e.code} ${e.value.toFixed(e.decimals)} ${e.unit}${e.rising ? ' rising' : ''}`)
    .join('   ');
}

// The one sentence the page exists to deliver: what appears to be wrong, on the
// evidence of which readings, and what to do about it. Everything else on the
// overview is the supporting detail for this strip.
export function DiagnosisBanner({
  diagnosis,
  summary,
  actionLabel,
  onAction,
}: {
  diagnosis: RankedDiagnosis | null;
  summary: MachineSummary;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const levels = levelHexes(isDark);

  // Nothing is elevated. Say so plainly and give the number that backs it up,
  // rather than leaving a blank space that reads as "not checked".
  if (!diagnosis) {
    const worst = summary.worstPoint;
    return (
      <View className={cn('flex-row items-center gap-3 rounded-xl border px-4 py-3', lineClass)}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: levels.normal }} />
        <Text className={cn('font-body-medium text-xs', inkClass)}>No active condition</Text>
        {worst && worst.value !== null ? (
          <Text className={cn('flex-1 font-body text-[11px]', mutedClass)} numberOfLines={1}>
            Closest to a limit: {worst.code} {worst.label} at {worst.value.toFixed(worst.band.decimals)} {worst.unit}, alert at{' '}
            {worst.thresholds.alert.toFixed(worst.band.decimals)}.
          </Text>
        ) : null}
      </View>
    );
  }

  const colour = levels[summary.level];

  // The worst point on the machine, when this diagnosis does not already account
  // for it. Only worth calling out if it is actually elevated.
  const worst = summary.worstPoint;
  const unrepresentedWorst =
    worst && worst.level !== 'normal' && !diagnosis.evidence.some((e) => e.id === worst.id) ? worst : null;

  return (
    <View
      className="gap-2 overflow-hidden rounded-xl border px-4 py-3"
      style={{ borderColor: `${colour}55`, backgroundColor: `${colour}0F` }}
    >
      <View className="flex-row items-center gap-2">
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colour }} />
        <Text style={{ color: colour }} className="font-body-bold text-sm">
          {diagnosis.label}
        </Text>
        <Text className={cn('font-body text-xs', mutedClass)}>on {diagnosis.componentLabel}</Text>

        <View className={cn('rounded-full border px-1.5 py-0.5', lineClass)}>
          <Text className={cn('font-mono text-[9px] uppercase tracking-wide', mutedClass)}>{diagnosis.confidence} confidence</Text>
        </View>

        {diagnosis.rulDays !== null ? (
          <Text style={{ color: colour }} className="font-mono text-[11px] font-bold tabular-nums">
            {formatRul(diagnosis.rulDays)} to limit
          </Text>
        ) : null}

        <View className="flex-1" />

        {onAction && actionLabel ? (
          <Pressable onPress={onAction} className="rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1">
            <Text className="font-body-bold text-[10px] text-accent">{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      <Text className={cn('font-mono text-[10px]', mutedClass)}>{evidenceLine(diagnosis.evidence)}</Text>

      <Text className={cn('font-body text-[11px]', inkClass)}>{diagnosis.recommendation}</Text>

      {/* The ranked diagnoses are built per component, and readings that could not
          be attributed to one produce no diagnosis at all — so the machine's most
          urgent point can sit outside every rule that fired, and the banner would
          quietly talk about the second-worst problem while the header reported the
          worst. Name it when that happens. */}
      {unrepresentedWorst && unrepresentedWorst.value !== null ? (
        <Text className={cn('font-body text-[11px]', mutedClass)} numberOfLines={1}>
          Also: {unrepresentedWorst.code} {unrepresentedWorst.label} at{' '}
          {unrepresentedWorst.value.toFixed(unrepresentedWorst.band.decimals)} {unrepresentedWorst.unit} is{' '}
          {unrepresentedWorst.level === 'danger' ? 'over its limit' : 'elevated'}, and is not covered by this diagnosis.
        </Text>
      ) : null}
    </View>
  );
}
