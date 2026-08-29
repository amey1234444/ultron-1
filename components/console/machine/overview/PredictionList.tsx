import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { formatRul, levelHexes } from '../../../../lib/condition';
import type { MachinePredictionResult } from '../analysis/prognosticsModel';
import type { RankedDiagnosis } from './rollup';

const CONFIDENCE_DOTS: Record<RankedDiagnosis['confidence'], string> = {
  high: '●●●',
  medium: '●●○',
  low: '●○○',
};

// Every failure mode the rules fired on, ranked, so a planner can see the second
// and third problem rather than only the loudest one. The lead item is already in
// the banner above; this is the queue behind it.
function forecastTime(forecast: MachinePredictionResult): string {
  const days = forecast.estimatedTimeToAlertDays ?? forecast.estimatedTimeToDangerDays;
  if (days === null) return '--';
  if (days <= 0) return 'now';
  if (days < 1) return '<1 d';
  return days < 10 ? `${(Math.round(days * 10) / 10).toString()} d` : `${Math.round(days)} d`;
}

export function PredictionList({ diagnoses, forecasts = [] }: { diagnoses: RankedDiagnosis[]; forecasts?: MachinePredictionResult[] }) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const levels = levelHexes(isDark);

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className={cn('font-body-medium text-[10px] uppercase tracking-wider', mutedClass)}>Predicted Failure Modes</Text>
        <Text className={cn('font-body text-[10px]', mutedClass)}>to limit · confidence</Text>
      </View>

      {diagnoses.length === 0 && forecasts.length === 0 ? (
        <Text className={cn('font-body text-xs italic', mutedClass)}>
          No failure signature matched. Every mapped point is inside its limits.
        </Text>
      ) : (
        <View className="gap-2">
          {diagnoses.map((diagnosis) => {
            // Colour by urgency, not by confidence: a low-confidence mode on a
            // point already past critical still needs to look like a problem.
            const level = diagnosis.evidence.some((e) => e.level === 'danger') ? 'danger' : 'alert';
            const colour = levels[level];

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
          {diagnoses.length === 0 && forecasts.map((forecast) => {
            const colour = levels[forecast.condition === 'danger' ? 'danger' : forecast.condition === 'alert' ? 'alert' : 'normal'];

            return (
              <View
                key={forecast.predictionId}
                className={cn('flex-row items-center gap-2 rounded-lg border px-2.5 py-2', lineClass)}
              >
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colour }} />

                <View className="flex-1">
                  <Text numberOfLines={1} className={cn('font-body-medium text-xs', inkClass)}>
                    {forecast.faultName}
                  </Text>
                  <Text numberOfLines={1} className={cn('font-body text-[10px]', mutedClass)}>
                    {forecast.location.join(' · ')} · {forecast.predictionStatus}
                  </Text>
                </View>

                <Text style={{ color: colour }} className="font-mono text-[11px] font-bold tabular-nums">
                  {forecastTime(forecast)}
                </Text>
                <Text className={cn('font-mono text-[10px]', mutedClass)}>{forecast.predictionConfidence}%</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
