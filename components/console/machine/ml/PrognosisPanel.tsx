import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import type {
  MlDiagnosis,
  MlDiagnosisResponse,
  MlRiskHorizon,
} from '../../../../lib/knowledge/ml/contract';
import { mlStatusLine } from '../../../../lib/knowledge/ml/contract';
import {
  Alert,
  Badge,
  Body,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  KeyValue,
  Meter,
  SectionLabel,
  Separator,
  alpha,
  consolePalette,
  type Variant,
} from '../../../ui';

/**
 * The prognosis view.
 *
 * One requirement governs the whole design: **it must be visually impossible to
 * confuse a predictive risk with a current alarm.** They are different claims —
 * "this may develop within fifteen minutes" and "an approved limit has been
 * crossed" — and an operator who reads the first as the second will stop a
 * machine that is running fine, or worse, learn to ignore both.
 *
 * So the separation is structural, not a matter of wording:
 *
 *   - the current rule state is stated first, in its own bordered strip, before
 *     any risk number appears;
 *   - risk bars use a dashed track and a distinct label, never the solid
 *     severity fill the alarm components use;
 *   - every risk carries its threshold and whether persistence was met, so a
 *     probability is never shown as a bare number;
 *   - an uncrossed risk is rendered in the muted variant however high it is.
 *
 * The last one is the important one. A 0.79 against a 0.80 threshold is not an
 * alert, and colouring it as one because it is nearly there is how a decision
 * layer gets bypassed by the UI.
 */

type Props = {
  response: MlDiagnosisResponse | null;
  /** Set when the service could not be reached. Rendered instead of the view. */
  unavailable?: string | null;
};

function riskVariant(horizon: MlRiskHorizon): Variant {
  // Crossed means threshold *and* persistence *and* hysteresis all agreed. It
  // is the only condition under which a risk is coloured.
  if (!horizon.crossed) return 'muted';
  return horizon.probability >= 0.9 ? 'destructive' : 'warning';
}

function ruleStateVariant(state: string): Variant {
  if (state === 'DANGER') return 'destructive';
  if (state === 'ALERT') return 'warning';
  return 'success';
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * One horizon's risk, with everything needed to read the number.
 *
 * A bare probability is unusable: over what horizon, against which threshold,
 * after how much persistence, and was it calibrated at all. All four are here.
 */
function RiskRow({ horizon }: { horizon: MlRiskHorizon }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const variant = riskVariant(horizon);

  return (
    <View className="gap-1.5 py-2">
      <View className="flex-row items-baseline justify-between">
        <View className="flex-row items-center gap-2">
          <Text
            className="font-mono text-[10px] uppercase tracking-[0.16em]"
            style={{ color: palette.inkMuted }}
          >
            {horizon.horizonMinutes} min
          </Text>
          {horizon.crossed ? (
            <Badge variant={variant} icon="bell-ring-outline">
              threshold + persistence met
            </Badge>
          ) : (
            <Badge variant="muted" icon="timer-sand">
              below decision threshold
            </Badge>
          )}
        </View>
        <Text
          className="font-mono text-[15px]"
          style={{ color: horizon.crossed ? palette.ink : palette.inkMuted }}
        >
          {pct(horizon.probability)}
        </Text>
      </View>

      {/* A dashed track, never the solid severity fill the alarm components
          use. The visual language of "may develop" is deliberately different
          from the visual language of "is happening". */}
      <View
        className="w-full overflow-hidden rounded-full border border-dashed"
        style={{ height: 8, borderColor: alpha(palette.inkMuted, 0.4) }}
      >
        <Meter value={horizon.probability * 100} variant={variant} height={6} />
      </View>

      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text className="font-mono text-[10px]" style={{ color: palette.inkMuted }}>
          raise {pct(horizon.raiseThreshold)} · clear {pct(horizon.clearThreshold)}
        </Text>
        <Text className="font-mono text-[10px]" style={{ color: palette.inkMuted }}>
          {horizon.persistenceMet ? 'persistence met' : 'persistence not met'}
        </Text>
        <Text className="font-mono text-[10px]" style={{ color: palette.inkMuted }}>
          {horizon.calibrated ? 'calibrated' : 'UNCALIBRATED — read as a score, not a frequency'}
        </Text>
      </View>
    </View>
  );
}

function FaultRisk({ entry, shown }: { entry: MlDiagnosis; shown: Set<number> }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <Card className="gap-0">
      <CardHeader>
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <CardTitle>{entry.diagnosis}</CardTitle>
            <Text className="font-mono text-[10px] tracking-[0.14em]" style={{ color: palette.inkMuted }}>
              {entry.faultId} · {entry.where}
            </Text>
          </View>
          <View className="items-end gap-1">
            <Badge variant={entry.source === 'RULES' ? 'info' : 'success'} icon="chip">
              {entry.source}
            </Badge>
            {!entry.surfaced ? (
              <Badge variant="muted" icon="eye-off-outline">
                shadow — not alarmed
              </Badge>
            ) : null}
          </View>
        </View>
      </CardHeader>
      <CardContent className="gap-0">
        {entry.risk
          .filter((horizon) => shown.has(horizon.horizonMinutes))
          .map((horizon) => (
            <RiskRow key={horizon.horizonMinutes} horizon={horizon} />
          ))}
        <Separator className="my-2" />
        <Body className="text-[12px]">{entry.why}</Body>
      </CardContent>
    </Card>
  );
}

/**
 * Which forecast horizons to show.
 *
 * The options come from the response, never from a constant, because a horizon
 * is not a display preference — it is a trained output. Each one is a separate
 * booster keyed `fault_id@horizon_minutes`, so a control offering 45 minutes
 * against a model trained on 5/15/30 would be asking for a prediction that does
 * not exist. Reading the options from `diagnoses[].risk[]` makes that
 * impossible by construction.
 *
 * Changing which horizons a model is *trained* on is a different operation:
 * rebuild the dataset with `--horizons` and retrain. This control cannot do it
 * and does not imply that it can.
 */
function HorizonSelector({
  available,
  shown,
  onToggle,
}: {
  available: number[];
  shown: Set<number>;
  onToggle: (minutes: number) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  if (available.length <= 1) return null;

  return (
    <View
      className="rounded-lg border p-3"
      style={{
        borderColor: alpha(palette.inkMuted, 0.3),
        backgroundColor: alpha(palette.panel, 0.5),
      }}
    >
      <SectionLabel>Forecast horizon — trained outputs</SectionLabel>
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
        {available.map((minutes) => {
          const on = shown.has(minutes);
          return (
            <Pressable
              key={minutes}
              onPress={() => onToggle(minutes)}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${minutes} minute horizon`}
              className="flex-row items-center gap-1 rounded-md border px-2 py-1"
              style={{
                borderColor: on ? palette.accent : alpha(palette.inkMuted, 0.4),
                backgroundColor: on ? alpha(palette.accent, 0.14) : 'transparent',
              }}
            >
              <MaterialCommunityIcons
                name={on ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                size={13}
                color={on ? palette.accent : palette.inkMuted}
              />
              <Text
                className="font-mono text-[11px]"
                style={{ color: on ? palette.ink : palette.inkMuted }}
              >
                {minutes} min
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Body muted className="mt-2 text-[11px]">
        These are the horizons this model was trained for. Training different ones needs a dataset
        rebuild and a retrain — it is not a display setting.
      </Body>
    </View>
  );
}

export function PrognosisPanel({ response, unavailable }: Props) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  // Derived from the response so a model with different horizons is followed
  // automatically. Sorted ascending: a reader scans short to long.
  const available = useMemo(() => {
    const seen = new Set<number>();
    for (const entry of response?.diagnoses ?? []) {
      for (const horizon of entry.risk) seen.add(horizon.horizonMinutes);
    }
    return [...seen].sort((a, b) => a - b);
  }, [response]);

  // `null` means "not chosen yet", which shows everything. Storing the choice
  // rather than defaulting to all-selected keeps a newly appearing horizon
  // visible instead of silently hidden.
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const shown = useMemo(
    () => new Set(available.filter((minutes) => !hidden.has(minutes))),
    [available, hidden],
  );
  const toggle = (minutes: number) =>
    setHidden((current) => {
      const next = new Set(current);
      // The last visible horizon cannot be hidden: an empty panel would read as
      // "no risk" rather than "nothing selected".
      if (next.has(minutes)) next.delete(minutes);
      else if (shown.size > 1) next.add(minutes);
      return next;
    });

  if (unavailable) {
    return (
      <Alert variant="muted" title="No predictive analysis" icon="cloud-off-outline">
        <Body>{unavailable}</Body>
        <Body muted className="mt-1 text-[12px]">
          The deterministic DOC-02 to DOC-05 analysis on the other tabs is unaffected and remains
          authoritative.
        </Body>
      </Alert>
    );
  }

  if (!response) {
    return (
      <Alert variant="muted" title="Waiting for telemetry" icon="timer-sand">
        <Body>No frame has been analysed for this machine yet.</Body>
      </Alert>
    );
  }

  const withRisk = response.diagnoses.filter((entry) => entry.risk.length > 0);
  const condition = response.currentCondition;

  return (
    <View className="gap-3">
      {/* The current condition, first and in its own strip. Whatever the risk
          numbers below say, this is what is true right now. */}
      <View
        className="rounded-lg border p-3"
        style={{
          borderColor: alpha(palette.inkMuted, 0.3),
          backgroundColor: alpha(palette.panel, 0.5),
        }}
      >
        <SectionLabel>Current condition — deterministic, not predicted</SectionLabel>
        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          <Badge variant={ruleStateVariant(condition.ruleState)} icon="gauge">
            {condition.ruleState}
          </Badge>
          <Badge variant={condition.customerDangerReached ? 'destructive' : 'muted'} icon="alert-octagon-outline">
            {condition.customerDangerReached ? 'Danger reached' : 'No approved Danger reached'}
          </Badge>
          <Badge variant={condition.customerAlertReached ? 'warning' : 'muted'} icon="alert-outline">
            {condition.customerAlertReached ? 'Alert reached' : 'No approved Alert reached'}
          </Badge>
          <Badge variant="muted" icon="pulse">
            {condition.activeAnomalyCount} active anomal{condition.activeAnomalyCount === 1 ? 'y' : 'ies'}
          </Badge>
        </View>
        <Body className="mt-2 text-[12px]">{condition.ruleStateReason}</Body>
      </View>

      <Alert
        variant={response.ml.status === 'OK' ? 'info' : 'warning'}
        title="Predictive risk"
        icon="chart-timeline-variant"
      >
        <Body>{mlStatusLine(response)}</Body>
        {!response.models.trainedOnRealData ? (
          <Body className="mt-1 text-[12px]">
            The model answering was fitted on synthetic scenarios. Its numbers demonstrate that the
            pipeline works; they are not evidence about this machine.
          </Body>
        ) : null}
      </Alert>

      <HorizonSelector available={available} shown={shown} onToggle={toggle} />

      {withRisk.length === 0 ? (
        <Alert variant="muted" title="No fault risk is being modelled" icon="information-outline">
          <Body>
            {response.ml.reasonDetail ??
              'No promoted model produced a risk for this machine at this instant.'}
          </Body>
        </Alert>
      ) : (
        withRisk.map((entry) => (
          <FaultRisk key={entry.faultId} entry={entry} shown={shown} />
        ))
      )}

      <View className="flex-row flex-wrap gap-x-6 gap-y-1">
        <KeyValue label="Mode" value={response.ml.mode} />
        <KeyValue label="Champion" value={response.models.champion ?? 'none promoted'} />
        <KeyValue label="Feature set" value={response.models.featureSetVersion ?? 'n/a'} />
        <KeyValue
          label="Latency"
          value={
            response.ml.inferenceLatencyMs === null
              ? 'n/a'
              : `${Math.round(response.ml.inferenceLatencyMs)} ms`
          }
        />
      </View>

      <View className="flex-row items-start gap-2">
        <MaterialCommunityIcons name="information-outline" size={13} color={palette.inkMuted} />
        <Text className="flex-1 text-[11px] leading-[16px]" style={{ color: palette.inkMuted }}>
          A predictive risk is not an alarm. A crossed risk with a NORMAL rule state means no
          approved limit has been reached — the model expects a condition to develop, and the
          engineering limits still govern what is serious.
        </Text>
      </View>
    </View>
  );
}
