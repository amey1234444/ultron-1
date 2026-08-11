import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  allThresholds,
  analyzeExtruder,
  appendHistory,
  CANONICAL_UNITS,
  faultName,
  resolveSignal,
  TAG_LABELS,
  type ConstraintCheck,
  type ExtruderAnalysisResult,
  type ExtruderInputReading,
  type ExtruderTag,
  type FaultAssessmentRecord,
  type ResolvedSignal,
} from '../../../lib/analysis/extruder';
import type { SignalQuality } from '../../../lib/analysis/types';
import type { DeviceNode } from '../../../lib/devices';
import { latestMeasurementForChannel, type LiveState } from '../../../lib/liveTelemetry';
import type { CardNode } from '../../../lib/rack';
import {
  Alert,
  Badge,
  Body,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Cell,
  Collapsible,
  consolePalette,
  DataTable,
  KeyValue,
  LimitBar,
  MagnitudeBars,
  SectionLabel,
  Separator,
  StatTile,
  Tabs,
  VerdictBanner,
  type Column,
  type MagnitudeDatum,
  type TabItem,
  type Variant,
} from '../../ui';
import { EmptyState } from '../EmptyState';
import type { MappedChannel } from './RackOccupancyView';

/**
 * Demo operating point for the ULTRON pilot extruder, in canonical units.
 *
 * The generic V/T/S/P/C demo bands elsewhere in the console are plausible for a
 * pump, not for an extruder — a 45-82 degC "temperature" would read as three
 * simultaneously failed barrel heaters against the controlled 180/210/220 degC
 * setpoints. These centres are the machine's own controlled reference points, so
 * an unmapped machine demonstrates a healthy extruder rather than a fabricated
 * catastrophe. Demo readings are labelled as simulated wherever they appear.
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
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      (Object.keys(DEMO_OPERATING_POINT) as ExtruderTag[]).map((tag) => [tag, DEMO_OPERATING_POINT[tag].centre]),
    ),
  );
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
    const card = cards.find(
      (candidate) => candidate.deviceId === mapped.channel.rackId && candidate.slot === mapped.channel.slot,
    );

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

// --------------------------------------------------------------------------------------
// Presentation mappings
// --------------------------------------------------------------------------------------

const SEVERITY_VARIANT: Record<string, Variant> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'warning',
  low: 'warning',
  none: 'success',
};

const MATCH_CLASS_VARIANT: Record<string, Variant> = {
  STRONG_CANDIDATE: 'destructive',
  CANDIDATE: 'warning',
  WEAK: 'info',
  INSUFFICIENT: 'muted',
  ELIMINATED: 'muted',
};

const QUALITY_VARIANT: Record<SignalQuality['status'], Variant> = {
  GOOD: 'success',
  DEGRADED: 'warning',
  BAD: 'destructive',
  UNAVAILABLE: 'muted',
};

const LAYER_NOTE: Record<string, { title: string; detail: string; variant: Variant }> = {
  DATA_QUALITY: {
    title: 'The data stream is broken — machine condition is not being reported',
    detail:
      'A transport fault owns this answer. A plant diagnosis computed from these numbers would not be trustworthy, so it is withheld until the stream is fixed. The plant hypotheses are still assessed and visible under Evidence.',
    variant: 'destructive',
  },
  INSTRUMENTATION: {
    title: 'A sensor is misreporting — machine condition is not being reported',
    detail:
      'A measurement moved without any physically coupled measurement moving with it, so the measurement chain is the more likely explanation than a machine condition. Verify the sensor before acting on the reading.',
    variant: 'warning',
  },
};

function constraintVariant(status: ConstraintCheck['status']): Variant {
  if (status === 'VIOLATION') return 'destructive';
  if (status === 'PASS') return 'success';
  return 'muted';
}

function readinessVariant(score: number): Variant {
  if (score >= 85) return 'success';
  if (score >= 60) return 'warning';
  return 'destructive';
}

function stateVariant(state: string): Variant {
  if (state === 'PRODUCING') return 'success';
  if (state === 'UNDETERMINED') return 'muted';
  return 'info';
}

function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : Number(value.toPrecision(digits));
  return String(rounded);
}

function humanise(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}

type TabKey = 'diagnosis' | 'limits' | 'evidence' | 'signals' | 'model';

// --------------------------------------------------------------------------------------
// Sections
// --------------------------------------------------------------------------------------

function CandidateCard({ assessment, ordinal }: { assessment: FaultAssessmentRecord; ordinal: number }) {
  const variant = MATCH_CLASS_VARIANT[assessment.matchClass] ?? 'info';
  const evidence = [...assessment.primary, ...assessment.supporting, ...assessment.weak];

  return (
    <Card accent={variant} className="gap-3">
      <CardHeader>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>
            {ordinal}. {assessment.faultName}
          </CardTitle>
          <Badge variant={variant}>{humanise(assessment.matchClass)}</Badge>
        </View>
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <KeyValue label="Fault" value={assessment.faultId} />
          <KeyValue label="Subsystem" value={humanise(assessment.category)} />
          <KeyValue label="Match score" value={String(assessment.engineeringMatchScore)} />
        </View>
      </CardHeader>

      <CardContent>
        <SectionLabel>Evidence</SectionLabel>
        {evidence.map((item, index) => (
          <View key={`${item.feature}-${index}`} className="flex-row gap-2">
            <Badge
              variant={item.strength === 'PRIMARY_MATCH' ? 'destructive' : item.strength === 'SUPPORTING_MATCH' ? 'warning' : 'muted'}
              icon={null}
              outline
            >
              {item.strength.replace('_MATCH', '')}
            </Badge>
            <View className="min-w-0 flex-1 gap-0.5">
              <Body>{item.description}</Body>
              <Body muted mono>
                {item.sensor} · {item.feature} = {formatNumber(item.observedValue)} · expected {item.expectedDirection}
              </Body>
            </View>
          </View>
        ))}
      </CardContent>

      {assessment.contradicting.length > 0 && (
        <CardContent>
          <SectionLabel>Contradicting</SectionLabel>
          {assessment.contradicting.map((item, index) => (
            <Body key={`${item.feature}-${index}`} muted>
              · {item.sensor}: {item.description}
            </Body>
          ))}
        </CardContent>
      )}

      <CardContent>
        <SectionLabel>Identifiability</SectionLabel>
        <Body muted>{humanise(assessment.identifiability)}</Body>
        {assessment.separatingMeasurement ? (
          <Body muted>Separating measurement required: {assessment.separatingMeasurement}.</Body>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ConstraintRow({ check }: { check: ConstraintCheck }) {
  const variant = constraintVariant(check.status);
  const evaluated = check.value !== null;
  return (
    <View className="gap-2 py-2.5">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Body>{check.name}</Body>
          <Badge variant={variant} icon={null} outline>
            {check.hardSoft}
          </Badge>
        </View>
        <Badge variant={variant}>{check.status === 'NOT_EVALUATED_MISSING_INPUT' ? 'Not evaluated' : check.status}</Badge>
      </View>
      {evaluated ? (
        <>
          <LimitBar value={check.value as number} limit={check.limit} variant={variant} />
          <View className="flex-row flex-wrap items-center gap-x-3">
            <KeyValue label="Value" value={`${formatNumber(check.value)} ${check.unit}`} variant={variant} />
            <KeyValue label="Limit" value={`${check.operator} ${check.limit} ${check.unit}`} />
          </View>
        </>
      ) : (
        <Body muted>{check.reason}</Body>
      )}
      {evaluated && check.reason ? <Body muted>{check.reason}</Body> : null}
    </View>
  );
}

// --------------------------------------------------------------------------------------
// View
// --------------------------------------------------------------------------------------

export type ExtruderAnalysisViewProps = {
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  expectedPoints?: number;
};

export function ExtruderAnalysisView({ mappedChannels, devices, cards, live, expectedPoints }: ExtruderAnalysisViewProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const demo = useDemoOperatingPoint();
  const [tab, setTab] = useState<TabKey>('diagnosis');

  // The twin's pipeline keeps its own rolling history so temporal features —
  // trend, repetition and dispersion — become available after a few samples.
  // Without it, heater failure cannot be separated from heater degradation and
  // no instrumentation hypothesis can ever be raised.
  const historyRef = useRef<Partial<Record<ExtruderTag, (number | null)[]>>>({});

  const analysis = useMemo<ExtruderAnalysisResult>(() => {
    const now = new Date().toISOString();
    const readings = buildReadings(mappedChannels, devices, cards, live, demo, now);
    return analyzeExtruder({ readings, history: historyRef.current, now });
  }, [mappedChannels, devices, cards, live, demo]);

  // Accumulate in an effect rather than inside the memo: mutating a ref during
  // render double-appends under StrictMode's double-invoke.
  useEffect(() => {
    historyRef.current = appendHistory(historyRef.current, analysis);
  }, [analysis]);

  const detail = analysis.extruder;
  const candidateAssessments = useMemo(
    () => detail.assessments.filter((assessment) => detail.candidateFaults.includes(assessment.faultId)),
    [detail],
  );
  const eliminated = useMemo(
    () => detail.assessments.filter((assessment) => assessment.matchClass === 'ELIMINATED'),
    [detail],
  );
  const violations = detail.constraints.filter((check) => check.status === 'VIOLATION');
  const degradedSignals = analysis.quality.filter((item) => item.status === 'BAD' || item.status === 'DEGRADED');
  const unresolved = detail.unconsumedSignals.length + detail.unrecognisedSignals.length + detail.rejectedSignals.length;

  if (mappedChannels.length === 0) {
    return (
      <EmptyState
        title="No mapped channels"
        description="Analysis needs saved rack mappings — link a box to a channel in Design mode, then save the canvas configuration."
      />
    );
  }

  // --- verdict ---------------------------------------------------------------
  const hasCandidates = detail.candidateFaults.length > 0;
  const verdictVariant: Variant = violations.length > 0
    ? 'destructive'
    : hasCandidates
      ? (SEVERITY_VARIANT[analysis.anomaly.severity] ?? 'warning')
      : detail.faultCategory === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
        ? 'info'
        : 'success';
  const verdictTitle = hasCandidates
    ? detail.candidateFaults.length === 1
      ? (analysis.diagnoses[0]?.title ?? detail.candidateFaults[0])
      : `${detail.candidateFaults.length} hypotheses the installed sensors cannot separate`
    : detail.faultCategory === 'MACHINE_STATE_TRANSITION'
      ? `Machine is in ${humanise(detail.inferredMachineState)}`
      : detail.faultCategory === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
        ? 'Something was observed, but it cannot be identified'
        : 'No controlled fault signature was met';

  const layerNote = LAYER_NOTE[detail.faultLayer];

  const tabs: TabItem<TabKey>[] = [
    { value: 'diagnosis', label: 'Diagnosis', icon: 'stethoscope', count: candidateAssessments.length, countVariant: verdictVariant },
    { value: 'limits', label: 'Limits', icon: 'ruler-square', count: violations.length, countVariant: 'destructive' },
    { value: 'evidence', label: 'Evidence', icon: 'chart-timeline-variant', count: detail.triggeredThresholds.length, countVariant: 'warning' },
    { value: 'signals', label: 'Signals', icon: 'access-point', count: detail.missingTags.length + unresolved, countVariant: 'info' },
    { value: 'model', label: 'Model', icon: 'file-document-outline' },
  ];

  // --- anomaly contributors as a magnitude series ----------------------------
  const contributorData: MagnitudeDatum[] = analysis.anomaly.contributors.map((item) => ({
    key: item.code,
    label: `${item.code} — ${TAG_LABELS[item.code as ExtruderTag] ?? item.code}`,
    value: item.score,
    display: item.score.toFixed(1),
    direction: item.direction,
  }));

  // --- table column definitions ---------------------------------------------
  const thresholdColumns: Column<(typeof detail.triggeredThresholds)[number]>[] = [
    { key: 'id', header: 'Threshold', width: 2.2, render: (row) => <Cell mono>{row.thresholdId}</Cell> },
    // One threshold can be evaluated for several hypotheses — the melt-pressure
    // signature is checked for both the screen and the die, because P1 sits
    // upstream of both. Without the fault those rows are indistinguishable.
    { key: 'fault', header: 'Hypothesis', width: 1.8, render: (row) => <Cell numberOfLines={2}>{faultName(row.faultId)}</Cell> },
    { key: 'sensor', header: 'Sensor', width: 1.1, render: (row) => <Cell mono muted>{row.sensor}</Cell> },
    { key: 'feature', header: 'Feature', width: 2.4, render: (row) => <Cell muted numberOfLines={2}>{row.feature}</Cell> },
    { key: 'observed', header: 'Observed', width: 1, numeric: true, render: (row) => <Cell numeric>{formatNumber(row.observed)}</Cell> },
    { key: 'expected', header: 'Boundary', width: 1.2, numeric: true, render: (row) => <Cell numeric muted>{row.expectedDirection}</Cell> },
    {
      key: 'cal',
      header: 'Calibrated',
      width: 1,
      render: (row) => (
        <Badge variant={row.fieldCalibrated ? 'success' : 'muted'} icon={null} outline>
          {row.fieldCalibrated ? 'Field' : 'Dev'}
        </Badge>
      ),
    },
  ];

  const signalColumns: Column<ResolvedSignal>[] = [
    { key: 'tag', header: 'Tag', width: 0.8, render: (row) => <Cell mono>{row.tag}</Cell> },
    { key: 'what', header: 'Measures', width: 2, render: (row) => <Cell muted numberOfLines={2}>{TAG_LABELS[row.tag]}</Cell> },
    { key: 'from', header: 'Mapped point', width: 2.2, render: (row) => <Cell numberOfLines={2}>{row.label}</Cell> },
    {
      key: 'value',
      header: 'Value',
      width: 1.3,
      numeric: true,
      render: (row) => (
        <Cell numeric>
          {formatNumber(row.value)} {row.unit}
        </Cell>
      ),
    },
    {
      key: 'src',
      header: 'Source',
      width: 1.1,
      render: (row) => (
        <Badge variant={row.source === 'demo' ? 'muted' : 'success'} icon={null} outline>
          {row.source === 'demo' ? 'Simulated' : 'Gateway'}
        </Badge>
      ),
    },
  ];

  const qualityColumns: Column<SignalQuality>[] = [
    { key: 'code', header: 'Tag', width: 0.8, render: (row) => <Cell mono>{row.code}</Cell> },
    {
      key: 'status',
      header: 'Status',
      width: 1.2,
      render: (row) => <Badge variant={QUALITY_VARIANT[row.status]}>{row.status}</Badge>,
    },
    { key: 'checks', header: 'Checks', width: 2, render: (row) => <Cell muted numberOfLines={2}>{row.checks.join(', ')}</Cell> },
    {
      key: 'value',
      header: 'Latest',
      width: 1.2,
      numeric: true,
      render: (row) => (
        <Cell numeric muted>
          {formatNumber(row.latestValue)} {row.unit}
        </Cell>
      ),
    },
  ];

  const baselineColumns: Column<(typeof detail.baseline)[number]>[] = [
    { key: 'label', header: 'Reference', width: 2, render: (row) => <Cell numberOfLines={2}>{row.label}</Cell> },
    {
      key: 'value',
      header: 'Value',
      width: 1.2,
      numeric: true,
      render: (row) => (
        <Cell numeric>
          {formatNumber(row.value)} {row.unit}
        </Cell>
      ),
    },
    {
      key: 'status',
      header: 'Basis',
      width: 1.4,
      render: (row) => (
        <Badge variant={row.status === 'SOURCE_BACKED' ? 'success' : row.status === 'DERIVED' ? 'info' : 'muted'} icon={null} outline>
          {humanise(row.status)}
        </Badge>
      ),
    },
    { key: 'prov', header: 'Provenance', width: 3.2, render: (row) => <Cell mono muted numberOfLines={3}>{row.provenance}</Cell> },
  ];

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}>
      {/* --- header ---------------------------------------------------------- */}
      <View className="gap-1">
        <Text className="font-body-bold text-3xl tracking-[-0.03em]" style={{ color: palette.ink }}>
          Analysis layer
        </Text>
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <KeyValue label="Model" value={`Single-screw extruder ${analysis.modelVersion}`} />
          <KeyValue label="Recipe" value={detail.recipeId} />
          <KeyValue label="State" value={detail.inferredMachineState} variant={stateVariant(detail.inferredMachineState)} />
        </View>
      </View>

      {/* --- the verdict ----------------------------------------------------- */}
      <VerdictBanner
        variant={verdictVariant}
        eyebrow={hasCandidates ? `${humanise(detail.faultLayer)} layer · ${humanise(detail.faultCategory)}` : 'No fault signature'}
        title={verdictTitle}
        detail={analysis.doctorReport.summary}
        meta={
          <>
            <Badge variant={verdictVariant}>{humanise(detail.identifiability)}</Badge>
            <Badge variant="muted" icon="flask-outline">
              Engineering development
            </Badge>
            <Badge variant="muted" icon="hand-back-right-outline">
              Advisory only
            </Badge>
          </>
        }
      />

      {/* A hard-limit breach is the most urgent thing on this page and stays
          visible regardless of which tab is open. */}
      {violations.length > 0 && (
        <Alert variant="destructive" title={`${violations.length} hard process limit${violations.length === 1 ? '' : 's'} exceeded`}>
          {violations
            .map((check) => `${check.name} at ${formatNumber(check.value)} ${check.unit} (limit ${check.operator} ${check.limit}).`)
            .join(' ')}
        </Alert>
      )}

      {layerNote && (
        <Alert variant={layerNote.variant} title={layerNote.title}>
          {layerNote.detail}
        </Alert>
      )}

      {/* --- KPI row --------------------------------------------------------- */}
      <View className="flex-row flex-wrap gap-3">
        <StatTile
          className="min-w-[220px] flex-1"
          label="Evidence readiness"
          value={`${analysis.readiness.score}%`}
          variant={readinessVariant(analysis.readiness.score)}
          icon="check-decagram-outline"
          meter={analysis.readiness.score}
          detail={
            analysis.readiness.ready
              ? 'All essential pilot tags are mapped.'
              : `${analysis.readiness.missingEssential.length} essential tag(s) not mapped.`
          }
        />
        <StatTile
          className="min-w-[220px] flex-1"
          label="Machine state"
          value={humanise(detail.inferredMachineState)}
          variant={stateVariant(detail.inferredMachineState)}
          icon="state-machine"
          detail={detail.stateBasis[0] ?? 'Derived from speed, zone residuals and zone trend.'}
        />
        <StatTile
          className="min-w-[220px] flex-1"
          label="Anomaly"
          value={analysis.anomaly.severity === 'none' ? 'None active' : `${humanise(analysis.anomaly.severity)}`}
          variant={SEVERITY_VARIANT[analysis.anomaly.severity] ?? 'info'}
          icon="radar"
          detail={
            analysis.anomaly.contributors[0]?.description ??
            analysis.anomaly.limitations[0] ??
            'No measurement is outside its consistency band.'
          }
        />
        <StatTile
          className="min-w-[220px] flex-1"
          label="Hard limits"
          value={humanise(detail.constraintStatus)}
          variant={detail.constraintStatus === 'VIOLATION' ? 'destructive' : detail.constraintStatus === 'PASS' ? 'success' : 'muted'}
          icon="ruler-square"
          detail={`${detail.constraints.filter((c) => c.status === 'PASS').length} of ${detail.constraints.length} evaluated and inside limits.`}
        />
      </View>

      <Tabs items={tabs} value={tab} onChange={setTab} />

      {/* --- Diagnosis ------------------------------------------------------- */}
      {tab === 'diagnosis' && (
        <View className="gap-3">
          <Card>
            <CardHeader>
              <CardTitle size="sm">How this conclusion was reached</CardTitle>
              <Body muted>{detail.explanation}</Body>
            </CardHeader>
            {detail.separatingMeasurements.length > 0 && (
              <>
                <Separator className="my-3" />
                <CardContent>
                  <SectionLabel>To collapse this ambiguity</SectionLabel>
                  {detail.separatingMeasurements.map((item) => (
                    <Body key={item}>· {item}</Body>
                  ))}
                </CardContent>
              </>
            )}
          </Card>

          {candidateAssessments.map((assessment, index) => (
            <CandidateCard key={assessment.faultId} assessment={assessment} ordinal={index + 1} />
          ))}

          {analysis.maintenance.caseRequired && (
            <Card accent={analysis.maintenance.priority === 'critical' || analysis.maintenance.priority === 'high' ? 'destructive' : 'warning'}>
              <CardHeader>
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle size="sm">Maintenance guidance</CardTitle>
                  <Badge
                    variant={analysis.maintenance.priority === 'critical' || analysis.maintenance.priority === 'high' ? 'destructive' : 'warning'}
                  >
                    {analysis.maintenance.priority} priority
                  </Badge>
                </View>
              </CardHeader>
              <Separator className="my-3" />
              <CardContent>
                <SectionLabel>Recommended actions</SectionLabel>
                {analysis.maintenance.recommendedActions.map((action, index) => (
                  <Body key={`${action}-${index}`}>· {action}</Body>
                ))}
              </CardContent>
              <Separator className="my-3" />
              <CardContent>
                <SectionLabel>Verification</SectionLabel>
                {analysis.maintenance.verificationSteps.map((step, index) => (
                  <Body key={`${step}-${index}`} muted>
                    · {step}
                  </Body>
                ))}
              </CardContent>
            </Card>
          )}

          {eliminated.length > 0 && (
            <Collapsible
              title="Eliminated hypotheses"
              count={eliminated.length}
              icon="close-circle-outline"
              summary="Ruled out because the measurement that most directly observes the mechanism says it is not acting."
            >
              {eliminated.map((assessment) => (
                <View key={assessment.faultId} className="gap-0.5">
                  <Body>{assessment.faultName}</Body>
                  <Body muted>{assessment.contradicting[0]?.description ?? 'Primary observable contradicted.'}</Body>
                </View>
              ))}
            </Collapsible>
          )}
        </View>
      )}

      {/* --- Limits ---------------------------------------------------------- */}
      {tab === 'limits' && (
        <View className="gap-3">
          <Alert variant="info" title="Limits are reported beside the diagnosis, never folded into it">
            A constraint answers whether the machine is inside its declared safe operating envelope right now. That is a
            different question from what is wrong with the machine — an in-limit machine can still have a developing
            fault, and an out-of-limit machine can be mechanically healthy.
          </Alert>
          <Card>
            {detail.constraints.map((check, index) => (
              <View key={check.constraintId}>
                {index > 0 ? <Separator /> : null}
                <ConstraintRow check={check} />
              </View>
            ))}
          </Card>
        </View>
      )}

      {/* --- Evidence -------------------------------------------------------- */}
      {tab === 'evidence' && (
        <View className="gap-3">
          <Card>
            <CardHeader>
              <CardTitle size="sm">Departure from the healthy reference</CardTitle>
              <Body muted>
                Measured in analytical-redundancy consistency bands — a registered sensitivity value, not a calibrated
                severity unit. Absolute severity percent is a blocked output for this model.
              </Body>
            </CardHeader>
            <Separator className="my-3" />
            {contributorData.length > 0 ? (
              <MagnitudeBars
                data={contributorData}
                variant={SEVERITY_VARIANT[analysis.anomaly.severity] ?? 'info'}
                unitSuffix=" bands"
              />
            ) : (
              <Body muted>{analysis.anomaly.limitations[0]}</Body>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle size="sm">Thresholds crossed</CardTitle>
              <Body muted>
                Every boundary is declared in the diagnostic threshold register with its source and calibration state.
                None of the {allThresholds().length} thresholds in this model is field calibrated.
              </Body>
            </CardHeader>
            <Separator className="my-3" />
            <DataTable
              columns={thresholdColumns}
              rows={detail.triggeredThresholds}
              keyOf={(row, index) => `${row.thresholdId}-${row.faultId}-${index}`}
              minWidth={860}
              emptyLabel="No registered threshold was crossed by the current measurements."
            />
          </Card>

          <Collapsible
            title="Full hypothesis ledger"
            count={detail.assessments.length}
            icon="format-list-checks"
            summary="Every fault the model assessed, including those with insufficient or contradicted evidence."
          >
            {detail.assessments.map((assessment) => (
              <View key={assessment.faultId} className="flex-row flex-wrap items-center gap-2 py-1">
                <Badge variant={MATCH_CLASS_VARIANT[assessment.matchClass] ?? 'muted'} icon={null} outline>
                  {humanise(assessment.matchClass)}
                </Badge>
                <Body>{assessment.faultName}</Body>
                <Body muted mono>
                  {assessment.faultId} · score {assessment.engineeringMatchScore}
                </Body>
              </View>
            ))}
          </Collapsible>
        </View>
      )}

      {/* --- Signals --------------------------------------------------------- */}
      {tab === 'signals' && (
        <View className="gap-3">
          <Card>
            <CardHeader>
              <CardTitle size="sm">Resolved pilot tags</CardTitle>
              <Body muted>
                {detail.resolvedSignals.length} of {detail.resolvedSignals.length + detail.missingTags.length} pilot tags
                resolved from {mappedChannels.length}
                {expectedPoints ? ` of ${expectedPoints} expected` : ''} mapped points.
              </Body>
            </CardHeader>
            <Separator className="my-3" />
            <DataTable
              columns={signalColumns}
              rows={detail.resolvedSignals}
              keyOf={(row) => `${row.tag}-${row.label}`}
              minWidth={680}
              emptyLabel="No mapped point resolved onto a pilot tag."
            />
          </Card>

          {detail.missingTags.length > 0 && (
            <Card accent="warning">
              <CardHeader>
                <CardTitle size="sm">Not mapped</CardTitle>
                <Body muted>Mapping these widens what the model can separate.</Body>
              </CardHeader>
              <Separator className="my-3" />
              <View className="gap-1.5">
                {detail.missingTags.map((item) => (
                  <View key={item.tag} className="flex-row flex-wrap items-center gap-2">
                    <Badge variant={item.essential ? 'warning' : 'muted'} icon={null} outline>
                      {item.essential ? 'Essential' : 'Diagnostic'}
                    </Badge>
                    <Body mono>{item.tag}</Body>
                    <Body muted>{item.label}</Body>
                  </View>
                ))}
              </View>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle size="sm">Signal quality</CardTitle>
              <Body muted>
                {degradedSignals.length === 0
                  ? 'No mapped signal is degraded.'
                  : `${degradedSignals.length} signal(s) degraded or bad.`}
              </Body>
            </CardHeader>
            <Separator className="my-3" />
            <DataTable
              columns={qualityColumns}
              rows={analysis.quality}
              keyOf={(row) => row.code}
              minWidth={560}
            />
          </Card>

          {unresolved > 0 && (
            <Collapsible
              title="Points the model does not consume"
              count={unresolved}
              icon="link-variant-off"
              variant="info"
              summary="Mapped points that carry no pilot tag, plus any the model declines by design."
            >
              {detail.unconsumedSignals.map((item) => (
                <View key={item.label} className="gap-0.5">
                  <Body>{item.label}</Body>
                  <Body muted>{item.reason}</Body>
                </View>
              ))}
              {detail.rejectedSignals.map((item) => (
                <View key={item.label} className="gap-0.5">
                  <Body>{item.label}</Body>
                  <Body muted>{item.error}</Body>
                </View>
              ))}
              {detail.unrecognisedSignals.map((label) => (
                <View key={label} className="gap-0.5">
                  <Body>{label}</Body>
                  <Body muted>
                    No pilot tag matches this label. Rename the point to the instrument it is actually wired to.
                  </Body>
                </View>
              ))}
            </Collapsible>
          )}
        </View>
      )}

      {/* --- Model ----------------------------------------------------------- */}
      {tab === 'model' && (
        <View className="gap-3">
          <Alert variant="info" title="Engineering-development baseline — not field validated">
            {`All ${allThresholds().length} diagnostic thresholds are engineering-development values and none is field calibrated. This model is advisory only: automatic actuation is false, and ${detail.blockedOutputs.join(', ')} are blocked outputs. Machine-specific calibration and real asset-life claims require OEM inputs and field data.`}
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle size="sm">Healthy baseline</CardTitle>
              <Body muted>
                Every comparison is made against the machine&apos;s own healthy reference. A value with no controlled
                source leaves its dependent evidence unevaluated rather than defaulting to zero.
              </Body>
            </CardHeader>
            <Separator className="my-3" />
            <DataTable
              columns={baselineColumns}
              rows={detail.baseline}
              keyOf={(row) => row.tag}
              minWidth={760}
            />
          </Card>

          <Collapsible
            title="Pipeline execution"
            icon="sitemap-outline"
            summary={detail.trace.join(' → ')}
          >
            <SectionLabel>Stages</SectionLabel>
            <Body muted mono>
              {detail.trace.join(' → ')}
            </Body>
            <Separator className="my-2" />
            <SectionLabel>Unavailable feature groups</SectionLabel>
            {Object.entries(detail.availability).filter(([, status]) => status.startsWith('NOT_EVALUATED')).length === 0 ? (
              <Body muted>All feature groups were evaluated.</Body>
            ) : (
              Object.entries(detail.availability)
                .filter(([, status]) => status.startsWith('NOT_EVALUATED'))
                .map(([key, status]) => (
                  <Body key={key} muted mono>
                    {key}: {humanise(status.replace('NOT_EVALUATED_', ''))}
                  </Body>
                ))
            )}
          </Collapsible>

          <Collapsible title="Caveats" icon="alert-circle-outline" count={analysis.doctorReport.caveats.length} summary="Everything this result depends on that is not yet established.">
            {analysis.doctorReport.caveats.map((caveat, index) => (
              <Body key={`${caveat}-${index}`} muted>
                · {caveat}
              </Body>
            ))}
          </Collapsible>
        </View>
      )}
    </ScrollView>
  );
}
