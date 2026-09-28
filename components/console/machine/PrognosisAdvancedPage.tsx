/**
 * Prognosis · Advanced — the evidence behind the forecast.
 *
 * Prognosis · Overview answers "what is coming, and when". This answers "why
 * the model says so, and how much to trust it", which is a different question
 * and a different reader: the one deciding whether to act on a forecast, or to
 * wait for more history before believing it.
 *
 * `MachinePredictionResult` already carries all of it — the fitted model and
 * its error, the trend and its acceleration, the interval around the estimate,
 * and an `advanced` block of degradation statistics. Almost none of it was
 * rendered anywhere. Nothing here is computed for display; every number on the
 * page comes off the prediction, and where the model did not produce one it is
 * shown as an em dash rather than a zero.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { PrognosisTone } from './analysis/prognosisViewModel';
import { toneHex } from './prognosis/PrognosisHero';
import { AnalysisTabs } from './analysis/AnalysisTabs';
import type { AnalysisDepth } from './analysis/analysisNav';
import {
  emptyPrognostics,
  type MachinePredictionResult,
  type MachinePrognosticsResult,
  type PredictabilityClass,
  type PredictionStatus,
} from './analysis/prognosticsModel';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';
import type { ReactNode } from 'react';

type Props = {
  machineName: string;
  template: string;
  hierarchyPath?: string;
  feed: FeedStatus;
  ageSeconds: number;
  prognostics?: MachinePrognosticsResult;
  onSelectDepth?: (depth: AnalysisDepth) => void;
  tabsTrailing?: ReactNode;
  onSelectMachine?: () => void;
  onRefresh?: () => void;
  loading?: boolean;
};

const DASH = '—';

function num(value: number | null | undefined, digits = 2, suffix = ''): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value.toFixed(digits)}${suffix}`;
}

function days(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  if (value <= 0) return 'NOW';
  return `${Math.round(value)} d`;
}

function stamp(value: string | null): string {
  if (!value) return DASH;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? DASH : parsed.toISOString().replace('T', ' ').slice(0, 16);
}

/** Predictability is a claim about the fault, not about this particular fit. */
const PREDICTABILITY_NOTE: Record<PredictabilityClass, string> = {
  HIGH: 'Degrades gradually and measurably; a horizon is meaningful.',
  MEDIUM: 'Degrades measurably, but the onset scatters between machines.',
  LOW: 'Weak or noisy progression; treat any horizon as indicative.',
  DETECTION_ONLY: 'No usable progression. This fault is detected, never forecast.',
};

const STATUS_TONE: Record<PredictionStatus, PrognosisTone> = {
  NOT_PREDICTABLE: 'neutral',
  INSUFFICIENT_HISTORY: 'neutral',
  MONITORING: 'healthy',
  DEGRADATION_DETECTED: 'attention',
  FORECAST_AVAILABLE: 'attention',
  HIGH_UNCERTAINTY: 'attention',
  VALIDATED_RUL_AVAILABLE: 'danger',
};

function Tile({ label, value, note, tint }: { label: string; value: string; note?: string; tint?: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View style={{ flexGrow: 1, flexBasis: 150, minWidth: 134, borderColor: hairline }} className="gap-1 rounded-lg border px-3 py-2.5">
      <Text className={cn('font-mono text-[9.5px] tracking-wider', mutedClass)}>{label}</Text>
      <Text style={tint ? { color: tint } : undefined} className={cn('font-mono text-[17px] tabular-nums', !tint && inkClass)}>
        {value}
      </Text>
      {note ? (
        <Text numberOfLines={2} className={cn('font-body text-[10.5px] leading-[15px]', mutedClass)}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function Panel({ title, caption, children }: { title: string; caption?: string; children: ReactNode }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View style={{ borderColor: hairline }} className="gap-2.5 rounded-xl border p-3">
      <View className="gap-0.5">
        <Text className={cn('font-mono text-[11px] font-bold tracking-wider', inkClass)}>{title}</Text>
        {caption ? <Text className={cn('font-body text-[10.5px] leading-[15px]', mutedClass)}>{caption}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function PrognosisAdvancedPage({
  machineName,
  template,
  hierarchyPath,
  feed,
  ageSeconds,
  prognostics,
  onSelectDepth,
  tabsTrailing,
  onSelectMachine,
  onRefresh,
  loading = false,
}: Props) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  const result = prognostics ?? emptyPrognostics();
  const predictions = result.predictions;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to whatever is most worth reading: the soonest projected danger,
  // else the first active forecast, else the first prediction at all.
  const selected: MachinePredictionResult | null = useMemo(() => {
    if (predictions.length === 0) return null;
    const chosen = selectedId ? predictions.find((p) => p.predictionId === selectedId) : undefined;
    return chosen ?? result.earliestProjectedDanger ?? result.activeForecasts[0] ?? predictions[0];
  }, [predictions, result.earliestProjectedDanger, result.activeForecasts, selectedId]);

  const header = (
    <>
      <MachineHeader
        machineName={machineName}
        template={template}
        path={hierarchyPath}
        subtitle="Model internals, interval width and the statistics behind the forecast"
        section="ANALYSIS / PROGNOSIS · ADVANCED"
        feed={feed}
        ageSeconds={ageSeconds}
        onSelectMachine={onSelectMachine}
        onRefresh={onRefresh}
      />
      <AnalysisTabs active="prognosis-advanced" onSelect={onSelectDepth} trailing={tabsTrailing} />
    </>
  );

  if (loading) {
    return (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
        {header}
        <Text className={cn('font-body text-sm italic', mutedClass)}>Reading prognostics…</Text>
      </ScrollView>
    );
  }

  if (!result.enabled || predictions.length === 0 || !selected) {
    return (
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
        {header}
        <Panel
          title="NO PROGNOSTIC MODEL HAS RUN"
          caption="Forecasting needs a fault that degrades measurably and enough history to fit a trend to. Until both exist there is nothing here to show, which is different from the machine being healthy."
        >
          <View className="flex-row flex-wrap" style={{ gap: 10 }}>
            <Tile label="SOURCE" value={result.sourceLabel} />
            <Tile label="HISTORY SAMPLES" value={String(result.historySampleCount)} />
            <Tile label="PREDICTIONS" value={String(predictions.length)} />
          </View>
        </Panel>
      </ScrollView>
    );
  }

  const statusTone = STATUS_TONE[selected.predictionStatus];
  const statusTint = toneHex(statusTone, isDark);
  const a = selected.advanced;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
      {header}

      {/* Which prediction is being read. One row of chips rather than a dropdown:
          the count is small and the set is the point — a reader should see how
          many faults are being forecast at once. */}
      <View className="gap-1.5">
        <Text className={cn('font-mono text-[9.5px] tracking-wider', mutedClass)}>
          PREDICTION · {predictions.length} FAULT{predictions.length === 1 ? '' : 'S'} MODELLED
        </Text>
        <View className="flex-row flex-wrap" style={{ gap: 8 }}>
          {predictions.map((prediction) => {
            const isActive = prediction.predictionId === selected.predictionId;
            const tint = toneHex(STATUS_TONE[prediction.predictionStatus], isDark);
            return (
              <Pressable
                key={prediction.predictionId}
                onPress={() => setSelectedId(prediction.predictionId)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={{ borderColor: isActive ? tint ?? undefined : hairline }}
                className={cn('gap-0.5 rounded-lg border px-3 py-1.5', isActive && 'bg-accent/10')}
              >
                <Text className={cn('font-mono text-[10.5px] font-bold tracking-wide', isActive ? inkClass : mutedClass)}>
                  {prediction.faultName}
                </Text>
                <Text style={tint ? { color: tint } : undefined} className="font-mono text-[9.5px] tracking-wider">
                  {prediction.predictionStatus.replace(/_/g, ' ')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Panel
        title="MODEL"
        caption="Which curve was fitted, and how well it describes the history. Backtest error is the one to read before acting: it is the error against data the fit did not see."
      >
        <View className="flex-row flex-wrap" style={{ gap: 10 }}>
          <Tile label="MODEL" value={selected.modelType.replace(/_/g, ' ')} note={`version ${selected.modelVersion}`} />
          <Tile label="FIT (R²)" value={num(selected.modelFit, 3)} />
          <Tile label="RESIDUAL ERROR" value={num(selected.residualError, 3)} />
          <Tile label="BACKTEST ERROR" value={num(selected.backtestError, 3)} note="Against held-out history" />
          <Tile
            label="PREDICTABILITY"
            value={selected.predictabilityClass}
            note={PREDICTABILITY_NOTE[selected.predictabilityClass]}
          />
          <Tile label="STATUS" value={selected.predictionStatus.replace(/_/g, ' ')} tint={statusTint} />
        </View>
      </Panel>

      <Panel
        title="TREND"
        caption="The direction and rate the indicator is moving. A robust slope that disagrees with the ordinary slope means outliers are steering the fit."
      >
        <View className="flex-row flex-wrap" style={{ gap: 10 }}>
          <Tile label="DIRECTION" value={selected.trendDirection} />
          <Tile label="SLOPE / DAY" value={num(selected.trendSlopePerDay, 4)} note={selected.unit || undefined} />
          <Tile label="ROBUST SLOPE / DAY" value={num(selected.robustSlopePerDay, 4)} note="Theil–Sen" />
          <Tile label="ACCELERATION" value={num(selected.trendAcceleration, 4)} tint={selected.accelerationDetected ? toneHex('attention', isDark) : undefined} />
          <Tile label="CURRENT" value={num(selected.currentValue, 3, selected.unit ? ` ${selected.unit}` : '')} />
          <Tile label="BASELINE" value={num(selected.baselineValue, 3, selected.unit ? ` ${selected.unit}` : '')} />
        </View>
      </Panel>

      <Panel
        title="HORIZON AND INTERVAL"
        caption="The estimate and the width of the band around it. A wide band on a short horizon is the shape that should delay a decision rather than drive one."
      >
        <View className="flex-row flex-wrap" style={{ gap: 10 }}>
          <Tile label="TO ALERT" value={days(selected.estimatedTimeToAlertDays)} />
          <Tile label="TO DANGER" value={days(selected.estimatedTimeToDangerDays)} tint={toneHex('danger', isDark)} />
          <Tile label="TO FUNCTIONAL FAILURE" value={days(selected.estimatedTimeToFunctionalFailureDays)} note={selected.functionalFailureValidated ? 'Validated' : 'Not validated'} />
          <Tile label="INTERVAL" value={`${days(selected.predictionLowerBoundDays)} – ${days(selected.predictionUpperBoundDays)}`} />
          <Tile label="CONFIDENCE" value={num(selected.predictionConfidence * 100, 0, '%')} />
          <Tile
            label="CHANGE SINCE LAST"
            value={selected.forecastChangeDays === null ? DASH : `${selected.forecastChangeDays > 0 ? '+' : ''}${Math.round(selected.forecastChangeDays)} d`}
            note={selected.previousForecastDays === null ? 'First forecast' : `was ${days(selected.previousForecastDays)}`}
          />
        </View>
        {selected.thresholdProjectionWording ? (
          <Text className={cn('font-body text-[11.5px] leading-[17px]', inkClass)}>{selected.thresholdProjectionWording}</Text>
        ) : null}
      </Panel>

      <Panel
        title="DEGRADATION STATISTICS"
        caption="The detectors behind the status. CUSUM and monotonicity are what separate a genuine drift from a noisy signal that happens to be high today."
      >
        <View className="flex-row flex-wrap" style={{ gap: 10 }}>
          <Tile label="MOVING AVERAGE" value={num(a.movingAverage, 3)} />
          <Tile label="EWMA" value={num(a.ewma, 3)} />
          <Tile label="Z-SCORE" value={num(a.zScore, 2)} />
          <Tile label="VARIANCE" value={num(a.variance, 4)} />
          <Tile label="CUSUM" value={num(a.cusum, 3)} />
          <Tile label="MONOTONICITY" value={num(a.monotonicity, 2)} note="1.0 = strictly one-directional" />
          <Tile label="OP-CONDITION RESIDUAL" value={num(a.operatingConditionResidual, 3)} note="Drift not explained by load" />
          <Tile label="ALERT THRESHOLD" value={num(a.alertThreshold, 3)} />
          <Tile label="DANGER THRESHOLD" value={num(a.dangerThreshold, 3)} tint={toneHex('danger', isDark)} />
          <Tile label="HEALTH INDICATOR" value={num(selected.healthIndicator, 3)} />
        </View>
      </Panel>

      <Panel
        title="PROVENANCE"
        caption="What the forecast was computed from. A horizon derived from simulated frames is a rehearsal of the pipeline, not a statement about this machine."
      >
        <View className="flex-row flex-wrap" style={{ gap: 10 }}>
          <Tile label="SOURCE" value={selected.sourceLabel} tint={selected.sourceLabel === 'SIMULATION' ? toneHex('attention', isDark) : undefined} />
          <Tile label="SAMPLES" value={String(selected.sampleCount)} />
          <Tile label="HISTORY" value={`${num(selected.historyDurationDays, 1)} d`} />
          <Tile label="ONSET" value={stamp(selected.degradationOnset)} />
          <Tile label="WINDOW START" value={stamp(a.dataWindowStart)} />
          <Tile label="WINDOW END" value={stamp(a.dataWindowEnd)} />
        </View>

        {selected.availableInputs.length > 0 ? (
          <View className="gap-1">
            <Text className={cn('font-mono text-[9.5px] tracking-wider', mutedClass)}>INPUTS USED</Text>
            <Text className={cn('font-body text-[11px] leading-[16px]', inkClass)}>{selected.availableInputs.join(' · ')}</Text>
          </View>
        ) : null}

        {selected.requiredAdditionalEvidence.length > 0 ? (
          <View className="gap-1">
            <Text className={cn('font-mono text-[9.5px] tracking-wider', mutedClass)}>WOULD SHARPEN THIS FORECAST</Text>
            {selected.requiredAdditionalEvidence.map((item) => (
              <Text key={item} className={cn('font-body text-[11px] leading-[16px]', inkClass)}>
                · {item}
              </Text>
            ))}
          </View>
        ) : null}
      </Panel>

      <Text className={cn('font-body text-[10.5px] leading-[15px]', mutedClass)}>
        Generated {stamp(result.generatedAt)} · machine horizon {days(result.machineFailureHorizonDays)} ·{' '}
        {result.activeForecasts.length} active forecast{result.activeForecasts.length === 1 ? '' : 's'} of {predictions.length}.
      </Text>
    </ScrollView>
  );
}
