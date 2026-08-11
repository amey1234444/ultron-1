import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  allThresholds,
  analyzeExtruder,
  appendHistory,
  CANONICAL_UNITS,
  resolveSignal,
  TAG_LABELS,
  type ExtruderAnalysisResult,
  type ExtruderInputReading,
  type ExtruderTag,
  type FaultAssessmentRecord,
} from '../../../lib/analysis/extruder';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import { latestMeasurementForChannel, type LiveState } from '../../../lib/liveTelemetry';
import type { CardNode } from '../../../lib/rack';
import { EmptyState } from '../EmptyState';
import {
  BulletList,
  DeepAnalyzerPanel,
  Panel,
  SectionTitle,
  StatusPanel,
  TONE_COLOUR,
  type IconName,
  type Tone,
} from './MachineOverview';
import type { MappedChannel } from './RackOccupancyView';

/**
 * Demo operating point for the ULTRON pilot extruder, in canonical units.
 *
 * The generic V/T/S/P/C demo bands elsewhere in the console are plausible for a
 * pump, not for an extruder — a 45-82 degC "temperature" would read as three
 * simultaneously failed barrel heaters against the controlled 180/210/220 degC
 * setpoints. These centres are the machine's own controlled reference points, so
 * an unmapped machine demonstrates a healthy extruder rather than a fabricated
 * catastrophe. Demo readings are labelled as simulated in the signal quality
 * report and never presented as gateway measurements.
 */
const DEMO_OPERATING_POINT: Record<ExtruderTag, { centre: number; jitter: number }> = {
  E1: { centre: 2000, jitter: 8 },
  V1: { centre: 2.0, jitter: 0.05 },
  V2: { centre: 2.0, jitter: 0.05 },
  T1: { centre: 180, jitter: 0.4 },
  T2: { centre: 210, jitter: 0.4 },
  T3: { centre: 220, jitter: 0.4 },
  T4: { centre: 40, jitter: 0.5 },
  T5: { centre: 40, jitter: 0.5 },
  P1: { centre: 4.0, jitter: 0.06 },
  L1: { centre: 75, jitter: 1.2 },
  'PM1.current': { centre: 10, jitter: 0.25 },
  'PM1.power': { centre: 10, jitter: 0.3 },
  'PM1.voltage': { centre: 415, jitter: 2 },
  'PM1.power_factor': { centre: 0.88, jitter: 0.01 },
};

const DEMO_TICK_MS = 1500;

/** A slow random walk around each tag's controlled reference. Demo data only. */
function useDemoOperatingPoint(): Record<string, number> {
  const seed = () =>
    Object.fromEntries(
      (Object.keys(DEMO_OPERATING_POINT) as ExtruderTag[]).map((tag) => [tag, DEMO_OPERATING_POINT[tag].centre]),
    );
  const [values, setValues] = useState<Record<string, number>>(seed);
  useEffect(() => {
    const id = setInterval(() => {
      setValues((previous) => {
        const next: Record<string, number> = {};
        for (const tag of Object.keys(DEMO_OPERATING_POINT) as ExtruderTag[]) {
          const { centre, jitter } = DEMO_OPERATING_POINT[tag];
          const drifted = (previous[tag] ?? centre) + (Math.random() - 0.5) * jitter;
          // Pull back toward the reference so the walk cannot wander into a
          // fault band and invent a diagnosis out of nothing.
          next[tag] = Math.min(centre + jitter * 2, Math.max(centre - jitter * 2, drifted));
        }
        return next;
      });
    }, DEMO_TICK_MS);
    return () => clearInterval(id);
  }, []);
  return values;
}

function channelNumber(channelId: string): number {
  const match = channelId.match(/\.CH(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function buildReadings(
  mappedChannels: MappedChannel[],
  devices: DeviceNode[],
  cards: CardNode[],
  live: LiveState | undefined,
  demo: Record<string, number>,
  now: string,
): ExtruderInputReading[] {
  return mappedChannels.map((mapped) => {
    // The box label is what the operator named the instrument, and it already
    // falls back to the channel label when the box is unnamed. Concatenating the
    // two would let a card's own wording ("Vibration Card CH1") leak into the
    // match and resolve a pressure point onto a vibration tag.
    const label = mapped.label.trim();
    const rack = devices.find((device) => device.id === mapped.channel.rackId);
    const card = cards.find((candidate) => candidate.deviceId === mapped.channel.rackId && candidate.slot === mapped.channel.slot);

    if (rack && card && live) {
      const measurement = latestMeasurementForChannel(rack, card, channelNumber(mapped.channel.id), live);
      if (measurement && measurement.value !== null && measurement.value !== undefined) {
        return {
          label,
          value: measurement.value,
          unit: measurement.unit || mapped.channel.unit,
          quality: measurement.quality ?? 'GOOD',
          valid: measurement.measurementValid ?? true,
          timestamp: measurement.updatedAt ?? now,
          source: 'gateway' as const,
        };
      }
    }

    // No gateway measurement: fall back to the simulated operating point, in the
    // tag's canonical unit so a mis-declared card unit cannot make demo data
    // look like a fault.
    const resolution = resolveSignal(label);
    const tag = resolution.kind === 'mapped' ? resolution.tag : null;
    return {
      label,
      value: tag ? (demo[tag] ?? null) : null,
      unit: tag ? CANONICAL_UNITS[tag] : mapped.channel.unit,
      quality: 'GOOD',
      valid: true,
      timestamp: now,
      source: 'demo' as const,
    };
  });
}

const MATCH_CLASS_TONE: Record<string, Tone> = {
  STRONG_CANDIDATE: 'critical',
  CANDIDATE: 'warning',
  WEAK: 'info',
  INSUFFICIENT: 'muted',
  ELIMINATED: 'muted',
};

const LAYER_COPY: Record<string, { title: string; detail: string; tone: Tone }> = {
  DATA_QUALITY: {
    title: 'Data-quality layer owns this answer',
    detail:
      'The data stream itself is broken. A plant diagnosis computed from these numbers is not trustworthy, so the machine condition is not reported until the transport problem is fixed.',
    tone: 'critical',
  },
  INSTRUMENTATION: {
    title: 'Instrumentation layer owns this answer',
    detail:
      'A sensor is demonstrably misreporting and no physically coupled measurement moved with it. The measurement chain is the more likely explanation than a machine condition.',
    tone: 'warning',
  },
};

function readinessTone(score: number): Tone {
  if (score >= 80) return 'live';
  if (score >= 50) return 'info';
  return 'warning';
}

function stateTone(state: string): Tone {
  if (state === 'PRODUCING') return 'live';
  if (state === 'UNDETERMINED') return 'muted';
  return 'info';
}

function constraintTone(status: string): Tone {
  if (status === 'VIOLATION') return 'critical';
  if (status === 'PARTIAL') return 'info';
  return 'live';
}

function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : Number(value.toPrecision(digits));
  return String(rounded);
}

function Label({ children }: { children: React.ReactNode }) {
  const { isDark } = useAppTheme();
  return (
    <Text
      className={cn(
        'font-body-medium text-[11px] uppercase tracking-wider',
        isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
      )}
    >
      {children}
    </Text>
  );
}

function Body({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  const { isDark } = useAppTheme();
  const tone = muted ? (isDark ? 'text-ink-muted' : 'text-ink-inverse-muted') : isDark ? 'text-ink' : 'text-ink-inverse';
  return <Text className={cn('font-body text-xs leading-4', tone)}>{children}</Text>;
}

function CandidateCard({ assessment, ordinal }: { assessment: FaultAssessmentRecord; ordinal: number }) {
  const { isDark } = useAppTheme();
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const colour = TONE_COLOUR[MATCH_CLASS_TONE[assessment.matchClass] ?? 'info'];
  const evidence = [...assessment.primary, ...assessment.supporting, ...assessment.weak];

  return (
    <Panel className="gap-3" style={{ borderLeftWidth: 3, borderLeftColor: colour }}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className={cn('font-body-bold text-lg tracking-[-0.02em]', textClass)}>
          {ordinal}. {assessment.faultName}
        </Text>
        <Text style={{ color: colour }} className="font-mono text-[10px] uppercase tracking-[0.16em]">
          {assessment.matchClass.replace(/_/g, ' ')}
        </Text>
      </View>
      <Body muted>
        {assessment.faultId} · {assessment.category} · ordinal engineering match score {assessment.engineeringMatchScore}{' '}
        (a ranking, not a probability)
      </Body>

      {evidence.length > 0 && (
        <View className="gap-1">
          <Label>Evidence</Label>
          {evidence.map((item, index) => (
            <Body key={`${item.faultId}-${item.feature}-${index}`}>
              · [{item.strength.replace('_MATCH', '')}] {item.sensor} {item.feature} = {formatNumber(item.observedValue)}{' '}
              (expected {item.expectedDirection}) — {item.description}
            </Body>
          ))}
        </View>
      )}

      {assessment.contradicting.length > 0 && (
        <View className="gap-1">
          <Label>Contradicting</Label>
          {assessment.contradicting.map((item, index) => (
            <Body key={`${item.feature}-${index}`} muted>
              · {item.sensor}: {item.description}
            </Body>
          ))}
        </View>
      )}

      <View className="gap-1">
        <Label>Identifiability</Label>
        <Body muted>{assessment.identifiability.replace(/_/g, ' ').toLowerCase()}</Body>
        {assessment.separatingMeasurement ? (
          <Body muted>Separating measurement required: {assessment.separatingMeasurement}.</Body>
        ) : null}
      </View>
    </Panel>
  );
}

export type ExtruderAnalysisViewProps = {
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  expectedPoints?: number;
};

export function ExtruderAnalysisView({ mappedChannels, devices, cards, live, expectedPoints }: ExtruderAnalysisViewProps) {
  const { isDark } = useAppTheme();
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const demo = useDemoOperatingPoint();

  // The twin's pipeline keeps its own rolling history so temporal features —
  // trend, repetition and dispersion — become available after a few samples.
  // Without it, heater failure cannot be separated from heater degradation and
  // no instrumentation hypothesis can ever be raised.
  const historyRef = useRef<Partial<Record<ExtruderTag, (number | null)[]>>>({});

  const analysis = useMemo<ExtruderAnalysisResult>(() => {
    const now = new Date().toISOString();
    const readings = buildReadings(mappedChannels, devices, cards, live, demo, now);
    const result = analyzeExtruder({ readings, history: historyRef.current, now });
    historyRef.current = appendHistory(historyRef.current, result);
    return result;
  }, [mappedChannels, devices, cards, live, demo]);

  if (mappedChannels.length === 0) {
    return (
      <EmptyState
        title="No mapped channels"
        description="Analysis needs saved rack mappings — link a box to a channel in Design mode, then save the canvas configuration."
      />
    );
  }

  const detail = analysis.extruder;
  const layerBanner = LAYER_COPY[detail.faultLayer];
  const conditionLabel =
    detail.candidateFaults.length === 0
      ? detail.faultCategory === 'MACHINE_STATE_TRANSITION'
        ? `Machine state: ${detail.inferredMachineState}`
        : detail.faultCategory === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
          ? 'Insufficient diagnostic evidence'
          : 'No controlled signature met'
      : detail.candidateFaults.length === 1
        ? analysis.diagnoses[0]?.title ?? detail.candidateFaults[0]
        : `Ambiguous across ${detail.candidateFaults.length} hypotheses`;
  const conditionTone: Tone =
    detail.candidateFaults.length === 0
      ? detail.faultCategory === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
        ? 'info'
        : 'live'
      : analysis.anomaly.severity === 'critical' || analysis.anomaly.severity === 'high'
        ? 'critical'
        : 'warning';

  const candidateAssessments = detail.assessments.filter((assessment) =>
    detail.candidateFaults.includes(assessment.faultId),
  );
  const eliminated = detail.assessments.filter((assessment) => assessment.matchClass === 'ELIMINATED');
  const mappedTags = new Set(detail.resolvedSignals.map((signal) => signal.tag));

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="min-w-0 flex-1 gap-1">
        <Text className={cn('font-body-bold text-3xl tracking-[-0.03em]', textClass)}>Analysis layer</Text>
        <Body muted>
          ULTRON single-screw-extruder diagnostic model {analysis.modelVersion}, recipe {detail.recipeId}.{' '}
          {mappedTags.size} of {detail.resolvedSignals.length + detail.missingTags.length} pilot tags resolved from{' '}
          {mappedChannels.length}
          {expectedPoints ? ` of ${expectedPoints} expected` : ''} mapped points.
        </Body>
      </View>

      <Panel style={{ borderLeftWidth: 3, borderLeftColor: TONE_COLOUR.info }}>
        <Body muted>
          Engineering-development baseline. All {allThresholds().length} diagnostic thresholds are
          engineering-development values and none is field calibrated. This model is advisory only: automatic actuation
          is false, and real RUL, field-calibrated probability and absolute severity percent are blocked outputs.
          Machine-specific calibration and real asset-life claims require OEM inputs and field data.
        </Body>
      </Panel>

      <View className="flex-row flex-wrap gap-3">
        <StatusPanel
          icon={'check-decagram-outline' as IconName}
          title="Readiness"
          value={analysis.readiness.ready ? 'Ready' : 'Not ready'}
          detail={analysis.readiness.limitations[0] ?? 'All essential pilot tags are mapped.'}
          tone={readinessTone(analysis.readiness.score)}
          meta={`${analysis.readiness.score}%`}
        />
        <StatusPanel
          icon={'state-machine' as IconName}
          title="Machine state"
          value={detail.inferredMachineState}
          detail={detail.stateBasis[0] ?? 'Derived from speed, zone residuals and zone trend.'}
          tone={stateTone(detail.inferredMachineState)}
        />
        <StatusPanel
          icon={'eye-outline' as IconName}
          title="Condition"
          value={conditionLabel}
          detail={detail.identifiability.replace(/_/g, ' ').toLowerCase()}
          tone={conditionTone}
        />
        <StatusPanel
          icon={'ruler-square' as IconName}
          title="Hard constraints"
          value={detail.constraintStatus}
          detail={
            detail.constraints.find((check) => check.status === 'VIOLATION')?.name ??
            `${detail.constraints.filter((check) => check.status === 'PASS').length} of ${detail.constraints.length} evaluated and inside limits.`
          }
          tone={constraintTone(detail.constraintStatus)}
        />
      </View>

      {layerBanner && (
        <Panel className="gap-1" style={{ borderLeftWidth: 3, borderLeftColor: TONE_COLOUR[layerBanner.tone] }}>
          <Text className={cn('font-body-bold text-sm', textClass)}>{layerBanner.title}</Text>
          <Body muted>{layerBanner.detail}</Body>
        </Panel>
      )}

      <DeepAnalyzerPanel analysis={analysis} />

      <View className="gap-3">
        <SectionTitle title="Diagnosis" />
        <Panel className="gap-2">
          <Text className={cn('font-body-bold text-sm', textClass)}>{detail.primaryDiagnosis}</Text>
          <Body muted>{analysis.doctorReport.summary}</Body>
          <Body muted>{detail.explanation}</Body>
          {detail.separatingMeasurements.length > 0 && (
            <View className="gap-1 pt-1">
              <Label>To collapse this ambiguity</Label>
              {detail.separatingMeasurements.map((item) => (
                <Body key={item}>· {item}</Body>
              ))}
            </View>
          )}
        </Panel>
        {candidateAssessments.map((assessment, index) => (
          <CandidateCard key={assessment.faultId} assessment={assessment} ordinal={index + 1} />
        ))}
      </View>

      <View className="gap-3">
        <SectionTitle title="Hard process constraints" />
        <Panel className="gap-2">
          <Body muted>
            Constraints answer whether the machine is inside its declared safe operating envelope right now. That is a
            different question from what is wrong with the machine, so they are reported beside the diagnosis, never
            folded into it.
          </Body>
          {detail.constraints.map((check) => {
            const tone: Tone =
              check.status === 'VIOLATION' ? 'critical' : check.status === 'PASS' ? 'live' : 'muted';
            return (
              <View key={check.constraintId} className="flex-row flex-wrap items-baseline gap-2 py-[3px]">
                <Text style={{ color: TONE_COLOUR[tone] }} className="font-mono text-[10px] uppercase tracking-[0.12em]">
                  {check.status === 'NOT_EVALUATED_MISSING_INPUT' ? 'N/A' : check.status}
                </Text>
                <Text className={cn('font-body-medium text-xs', textClass)}>{check.name}</Text>
                <Body muted>
                  {formatNumber(check.value)} {check.unit} · limit {check.operator} {check.limit} {check.unit} ·{' '}
                  {check.hardSoft}
                  {check.reason ? ` — ${check.reason}` : ''}
                </Body>
              </View>
            );
          })}
        </Panel>
      </View>

      <View className="gap-3">
        <SectionTitle title="Signal inventory" />
        <Panel className="gap-2">
          <Label>Resolved pilot tags</Label>
          {detail.resolvedSignals.length === 0 ? (
            <Body muted>No mapped point resolved onto a pilot tag.</Body>
          ) : (
            detail.resolvedSignals.map((signal) => (
              <Body key={`${signal.tag}-${signal.label}`}>
                · {signal.tag} ({TAG_LABELS[signal.tag]}) ← “{signal.label}” = {formatNumber(signal.value)} {signal.unit}
                {signal.conversion !== 'identity' ? ` · ${signal.conversion}` : ''}
                {signal.source === 'demo' ? ' · simulated' : ''}
              </Body>
            ))
          )}
        </Panel>

        {detail.missingTags.length > 0 && (
          <Panel className="gap-2">
            <Label>Not mapped</Label>
            {detail.missingTags.map((item) => (
              <Body key={item.tag} muted>
                · {item.tag} ({item.label}) — {item.essential ? 'essential evidence' : 'widens what can be separated'}
              </Body>
            ))}
          </Panel>
        )}

        {detail.unconsumedSignals.length > 0 && (
          <Panel className="gap-2">
            <Label>Mapped but not consumed by this model</Label>
            {detail.unconsumedSignals.map((item) => (
              <Body key={item.label} muted>
                · “{item.label}” — {item.reason}
              </Body>
            ))}
          </Panel>
        )}

        {(detail.rejectedSignals.length > 0 || detail.unrecognisedSignals.length > 0) && (
          <Panel className="gap-2">
            <Label>Not resolved</Label>
            {detail.rejectedSignals.map((item) => (
              <Body key={item.label} muted>
                · “{item.label}” — {item.error}
              </Body>
            ))}
            {detail.unrecognisedSignals.map((label) => (
              <Body key={label} muted>
                · “{label}” — no pilot tag matches this label. Rename the point to the instrument it is wired to.
              </Body>
            ))}
          </Panel>
        )}
      </View>

      {detail.triggeredThresholds.length > 0 && (
        <View className="gap-3">
          <SectionTitle title="Thresholds crossed" />
          <Panel className="gap-2">
            {detail.triggeredThresholds.map((item, index) => (
              <View key={`${item.thresholdId}-${item.faultId}-${index}`} className="gap-[2px] py-[3px]">
                <Text className={cn('font-body-medium text-xs', textClass)}>
                  {item.thresholdId} · {item.sensor} {item.feature} = {formatNumber(item.observed)} (
                  {item.expectedDirection})
                </Text>
                <Body muted>
                  {item.sourceStatus} · field calibrated: {item.fieldCalibrated ? 'yes' : 'no'} — {item.notes}
                </Body>
              </View>
            ))}
          </Panel>
        </View>
      )}

      <View className="gap-3">
        <SectionTitle title="Healthy baseline" />
        <Panel className="gap-2">
          <Body muted>
            Every comparison is made against the machine&apos;s own healthy reference. A value with no controlled source
            leaves its dependent evidence unevaluated rather than defaulting to zero.
          </Body>
          {detail.baseline.map((item) => (
            <View key={item.tag} className="flex-row flex-wrap items-baseline gap-2 py-[2px]">
              <Text className={cn('font-body-medium text-xs', textClass)}>
                {item.label}: {formatNumber(item.value)} {item.unit}
              </Text>
              <Body muted>
                {item.status} · {item.provenance}
              </Body>
            </View>
          ))}
        </Panel>
      </View>

      {analysis.maintenance.caseRequired && (
        <View className="gap-3">
          <SectionTitle title="Maintenance guidance" />
          <BulletList
            title="Recommended actions"
            items={analysis.maintenance.recommendedActions}
            tone={analysis.maintenance.priority === 'critical' || analysis.maintenance.priority === 'high' ? 'critical' : 'warning'}
            emptyLabel="No actions defined."
          />
          <BulletList
            title="Verification steps"
            items={analysis.maintenance.verificationSteps}
            tone="info"
            emptyLabel="No verification steps defined."
          />
        </View>
      )}

      {eliminated.length > 0 && (
        <View className="gap-3">
          <SectionTitle title="Eliminated hypotheses" />
          <Panel className="gap-2">
            <Body muted>
              A hypothesis is eliminated only when the measurement that most directly observes its mechanism says the
              mechanism is not acting, and nothing else supports it.
            </Body>
            {eliminated.map((assessment) => (
              <Body key={assessment.faultId} muted>
                · {assessment.faultName} — {assessment.contradicting[0]?.description ?? 'primary observable contradicted'}
              </Body>
            ))}
          </Panel>
        </View>
      )}

      <View className="gap-3">
        <SectionTitle title="Pipeline" />
        <Panel className="gap-2">
          <Body muted>{detail.trace.join(' → ')}</Body>
          <Label>Unavailable feature groups</Label>
          {Object.entries(detail.availability).filter(([, status]) => status.startsWith('NOT_EVALUATED')).length === 0 ? (
            <Body muted>All feature groups were evaluated.</Body>
          ) : (
            Object.entries(detail.availability)
              .filter(([, status]) => status.startsWith('NOT_EVALUATED'))
              .map(([key, status]) => (
                <Body key={key} muted>
                  · {key}: {status.replace('NOT_EVALUATED_', '').replace(/_/g, ' ').toLowerCase()}
                </Body>
              ))
          )}
        </Panel>
      </View>
    </ScrollView>
  );
}
