import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { formatRul, LEVEL_HEX } from '../../../../lib/condition';
import type { RankedDiagnosis } from './rollup';

const CONFIDENCE_DOTS: Record<RankedDiagnosis['confidence'], string> = {
  high: '●●●',
  medium: '●●○',
  low: '●○○',
};

// Every failure mode the rules fired on, ranked, so a planner can see the second
// and third problem rather than only the loudest one. The lead item is already in
// the banner above; this is the queue behind it.
export function PredictionList({ diagnoses }: { diagnoses: RankedDiagnosis[] }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className={cn('font-body-medium text-[10px] uppercase tracking-wider', mutedClass)}>Predicted Failure Modes</Text>
        <Text className={cn('font-body text-[10px]', mutedClass)}>to limit · confidence</Text>
      </View>

      {diagnoses.length === 0 ? (
        <Text className={cn('font-body text-xs italic', mutedClass)}>
          No failure signature matched. Every mapped point is inside its limits.
        </Text>
      ) : (
        <View className="gap-2">
          {diagnoses.map((diagnosis) => {
            // Colour by urgency, not by confidence: a low-confidence mode on a
            // point already past critical still needs to look like a problem.
            const level = diagnosis.evidence.some((e) => e.level === 'danger') ? 'danger' : 'alert';
            const colour = LEVEL_HEX[level];

            return (
              <View
                key={`${diagnosis.componentLabel}-${diagnosis.id}`}
                className={cn('flex-row items-center gap-2 rounded-lg border px-2.5 py-2', lineClass)}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colour }} />

                <View className="flex-1">
                  <Text numberOfLines={1} className={cn('font-body-medium text-xs', inkClass)}>
                    {diagnosis.label}
                  </Text>
                  <Text numberOfLines={1} className={cn('font-body text-[10px]', mutedClass)}>
                    {diagnosis.componentLabel} · {diagnosis.evidence.map((e) => e.code).join(', ')}
                  </Text>
                </View>

                <Text style={{ color: colour }} className="font-mono text-[11px] font-bold tabular-nums">
                  {formatRul(diagnosis.rulDays)}
                </Text>
                <Text className={cn('font-mono text-[10px]', mutedClass)}>{CONFIDENCE_DOTS[diagnosis.confidence]}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
