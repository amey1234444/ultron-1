import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { SEVERITY_HEX } from '../../../../lib/analysisDiagnosis';

export type ActionPriority = 'high' | 'medium' | 'low';

const PRIORITY_HEX: Record<ActionPriority, string> = {
  high: SEVERITY_HEX.fault,
  medium: SEVERITY_HEX.limit,
  low: SEVERITY_HEX.boundary,
};

// "Do this" — ordered steps, where the order is the safety argument: verify the
// reading before acting on it, and isolate before opening anything. Numbered
// because these genuinely are a sequence, not a set.
export function DoThisList({
  steps,
  priority,
  title = 'Do this',
}: {
  steps: string[];
  priority: ActionPriority;
  title?: string;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const tint = PRIORITY_HEX[priority];

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>{title}</Text>
        <View className="rounded border px-1.5 py-[1px]" style={{ borderColor: `${tint}66`, backgroundColor: `${tint}14` }}>
          <Text style={{ color: tint }} className="font-mono text-[8px] font-bold tracking-wider">
            {priority.toUpperCase()} PRIORITY
          </Text>
        </View>
      </View>

      <View className="gap-2">
        {steps.map((step, index) => (
          <View key={step} className="flex-row gap-2.5">
            <Text style={{ width: 14, color: tint }} className="font-mono text-[10px] tabular-nums">
              {index + 1}
            </Text>
            <Text className={cn('flex-1 font-body text-[12px] leading-[18px]', inkClass)}>{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// "Then confirm" — the closure criteria. Not a sequence but a set of conditions,
// so these are ticks rather than numbers.
//
// The fourth item exists in the original design and is worth keeping verbatim in
// spirit: a job is closed on evidence returning to normal, never on an action
// having been performed. That is the difference between a maintenance record and a
// condition record.
export function ThenConfirmList({ criteria, footnote }: { criteria: string[]; footnote?: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';

  return (
    <View className="gap-3">
      <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Then confirm</Text>

      <View className="gap-2">
        {criteria.map((item) => (
          <View key={item} className="flex-row gap-2.5">
            <Text style={{ width: 12 }} className={cn('font-mono text-[10px]', mutedClass)}>
              ✓
            </Text>
            <Text className={cn('flex-1 font-body text-[11px] leading-[17px]', inkClass)}>{item}</Text>
          </View>
        ))}
      </View>

      {footnote ? (
        <Text className={cn('font-body text-[10px] leading-[15px] pt-1', mutedClass)} style={{ borderTopWidth: 1, borderTopColor: hairline }}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}
