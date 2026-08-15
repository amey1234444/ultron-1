/**
 * The Analyzer workspace.
 *
 * This file is the composition root only: it collects the readings, runs the
 * pipeline (or a scenario against it), and hands each tab exactly the shape it
 * needs. Every region it draws lives in `./analyzer/*`, so no single component
 * owns six unrelated subjects and a tab can be reworked without touching the
 * data path.
 *
 * Layout
 * ------
 * Desktop is a two-column workspace: the analysis on the left, the instruments
 * it was read from in a sticky rail on the right. Those are the two questions an
 * operator asks in the same breath — "what is wrong" and "what is it actually
 * reading" — and answering them a scroll apart is what made the previous
 * version read as a document rather than an instrument. Below ~1180px the rail
 * falls under the content, which is the only honest thing to do with it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  buildParameterConnections,
  relativeAge,
  summariseConnections,
  type ConnectivityInput,
} from '../../../lib/analysis/connectivity';
import {
  allThresholds,
  analyzeExtruder,
  appendHistory,
  faultName,
  resolveSignal,
  runScenario,
  scenarioById,
  SCENARIOS,
  TAG_LABELS,
  type ExtruderAnalysisResult,
  type ExtruderInputReading,
  type ExtruderTag,
  type ResolvedSignal,
  type Scenario,
} from '../../../lib/analysis/extruder';
import type { SignalQuality } from '../../../lib/analysis/types';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import { CHANNEL_LIVE_GRACE_MS, latestMeasurementForChannel, type LiveMeasurement, type LiveState } from '../../../lib/liveTelemetry';
import type { CardNode } from '../../../lib/rack';
import {
  Alert,
  Badge,
  Body,
  Card,
  CardHeader,
  CardTitle,
  consolePalette,
  KeyValue,
  SectionLabel,
  Separator,
  Tabs,
  type MagnitudeDatum,
  type TabItem,
  type Variant,
} from '../../ui';
import { AnalyzerHeader, type HeaderFact } from './analyzer/AnalyzerHeader';
import { Fact, Section } from './analyzer/AnalyzerParts';
import { ConnectivityTab } from './analyzer/ConnectivityTab';
import {
  ConclusionPanel,
  DiagnosisSummary,
  EliminatedList,
  HypothesisList,
  MaintenanceGuidance,
} from './analyzer/DiagnosisTab';
import { collectEvidence, EvidenceTab } from './analyzer/EvidenceTab';
import { LimitsTab } from './analyzer/LimitsTab';
import { LiveInstrumentReadout, type ReadoutRow } from './analyzer/LiveInstrumentReadout';
import { ModelTab } from './analyzer/ModelTab';
import { SignalsTab, type SignalHealth, type SignalRow } from './analyzer/SignalsTab';
import type { MappedChannel } from './RackOccupancyView';

function channelNumber(channelId: string): number {
  const match = channelId.match(/\.CH(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function usableMeasurementValue(measurement: LiveMeasurement | undefined): number | null {
  if (!measurement) return null;
  if (measurement.measurementValid === false) return null;
  if (measurement.quality && measurement.quality !== 'GOOD') return null;
  const ageMs = Date.now() - Date.parse(measurement.updatedAt);
  if (!Number.isFinite(ageMs) || ageMs > CHANNEL_LIVE_GRACE_MS) return null;
  return typeof measurement.value === 'number' && Number.isFinite(measurement.value) ? measurement.value : null;
}

/** A mapped point, plus the card-level alarm state the analyzer deliberately ignores. */
type PointInput = {
  reading: ExtruderInputReading;
  /** The channel's own commissioning alarm state - NOT a model finding. */
  alarm: 'none' | 'warning' | 'critical';
  alarmLimit: number | null;
  observed: number | null;
  channelUnit: string;
  reporting: boolean;
};

/** Where the live analysis inputs came from. */
type DataMode = 'gateway' | 'mixed' | 'none';

function alarmStateFor(channel: MappedChannel['channel'], value: number | null): {
  alarm: PointInput['alarm'];
  alarmLimit: number | null;
} {
  if (value === null || !Number.isFinite(value)) return { alarm: 'none', alarmLimit: null };
  if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) {
    return { alarm: 'critical', alarmLimit: channel.alarmCritical };
  }
  if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) {
    return { alarm: 'warning', alarmLimit: channel.alarmWarning };
  }
  return { alarm: 'none', alarmLimit: channel.alarmCritical ?? channel.alarmWarning ?? null };
}

/**
 * Collect one reading per mapped point.
 *
 * A mapped channel that is not reporting is submitted with a NULL value, never
 * with a stand-in number. Substituting a plausible healthy value would
 * manufacture a clean bill of health for a machine nobody is actually
 * measuring - the single worst failure this model can have, and the exact
 * reason the twin reports a missing input as NOT_EVALUATED instead of
 * defaulting it.
 */
function buildPoints(
  mappedChannels: MappedChannel[],
  devices: DeviceNode[],
  cards: CardNode[],
  live: LiveState | undefined,
  now: string,
): { points: PointInput[]; mode: DataMode } {
  if (mappedChannels.length === 0) {
    return { points: [], mode: 'none' as const };
  }

  // The box label is what the operator named the instrument, and it already
  // falls back to the channel label when the box is unnamed. Concatenating the
  // two would let a card's own wording ("Vibration Card CH1") leak into the
  // match and resolve a pressure point onto a vibration tag.
  const measured = mappedChannels.map((mapped) => {
    const label = mapped.label.trim();
    const rack = devices.find((device) => device.id === mapped.channel.rackId);
    const card = cards.find(
      (candidate) => candidate.deviceId === mapped.channel.rackId && candidate.slot === mapped.channel.slot,
    );
    const measurement =
      rack && card && live ? latestMeasurementForChannel(rack, card, channelNumber(mapped.channel.id), live) : undefined;
    const value = usableMeasurementValue(measurement);
    return { mapped, label, measurement, value };
  });

  const reportingCount = measured.filter((entry) => entry.value !== null).length;
  const points = measured.map(({ mapped, label, measurement, value }) => ({
    reading: {
      label,
      templatePointCode: mapped.templatePointCode,
      value,
      unit: measurement?.unit || mapped.channel.unit,
      quality: measurement?.quality ?? (value === null ? 'UNAVAILABLE' : 'GOOD'),
      valid: value !== null && (measurement?.measurementValid ?? true),
      timestamp: measurement?.updatedAt ?? now,
      source: 'gateway' as const,
    },
    ...alarmStateFor(mapped.channel, value),
    observed: value,
    channelUnit: mapped.channel.unit,
    reporting: value !== null,
  }));

  const mode: DataMode = reportingCount === 0 ? 'none' : reportingCount === points.length ? 'gateway' : 'mixed';
  return { points, mode };
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

const QUALITY_VARIANT: Record<SignalQuality['status'], Variant> = {
  GOOD: 'success',
  DEGRADED: 'warning',
  BAD: 'destructive',
  UNAVAILABLE: 'muted',
};

const QUALITY_HEALTH: Record<SignalQuality['status'], SignalHealth> = {
  GOOD: 'healthy',
  DEGRADED: 'warning',
  BAD: 'abnormal',
  UNAVAILABLE: 'unavailable',
};

const LAYER_NOTE: Record<string, { title: string; detail: string; variant: Variant }> = {
  DATA_QUALITY: {
    title: 'The data stream is broken - machine condition is not being reported',
    detail:
      'A transport fault owns this answer. A plant diagnosis computed from these numbers would not be trustworthy, so it is withheld until the stream is fixed. The plant hypotheses are still assessed and visible under Evidence.',
    variant: 'destructive',
  },
  INSTRUMENTATION: {
    title: 'A sensor is misreporting - machine condition is not being reported',
    detail:
      'A measurement moved without any physically coupled measurement moving with it, so the measurement chain is the more likely explanation than a machine condition. Verify the sensor before acting on the reading.',
    variant: 'warning',
  },
};

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

function humanise(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}

type TabKey = 'diagnosis' | 'limits' | 'evidence' | 'signals' | 'model' | 'connectivity';

/**
 * What each pilot tag is actually for, in the words a plant operator would use.
 *
 * The model speaks in tags — P1, T5, PM1.current — because its registers do,
 * and that precision is worth keeping. But "P1" tells a reader nothing on its
 * own, so every place a tag is shown to a human it is shown with the sentence
 * below beside it.
 */
const TAG_PURPOSE: Record<ExtruderTag, string> = {
  E1: 'How fast the screw is turning. Tells the model whether the machine is running, and how hard.',
  V1: 'Shake at the motor. Rises when the motor bearings or alignment go off.',
  V2: 'Shake at the gearbox. Rises when gears or gearbox bearings wear.',
  T1: 'Heat in barrel zone 1. Checked against the heater setpoint for heater faults.',
  T2: 'Heat in barrel zone 2. Checked against the heater setpoint for heater faults.',
  T3: 'Heat in barrel zone 3. Checked against the heater setpoint, and for shear heating.',
  T4: 'Heat at the motor. Rises when the motor is working too hard or is not cooling.',
  T5: 'Heat at the gearbox. Rises when lubrication or a bearing is failing.',
  P1: 'Pressure of the melt before the screen and die. The main clue for blockages, starvation and over-feeding.',
  L1: 'How much material is left in the hopper. Tells the model whether the machine is being fed.',
  'PM1.current': 'How much current the drive is pulling. The direct measure of how hard the machine is working.',
  'PM1.power': 'How much electrical power the drive is using. Recorded, but the load rules are written on current.',
  'PM1.voltage': 'Supply voltage. Context for the electrical readings.',
  'PM1.power_factor': 'How efficiently the drive draws power. Context for the electrical readings.',
};

// --------------------------------------------------------------------------------------
// Scenario library
// --------------------------------------------------------------------------------------

/**
 * Scenario picker - the twin's 61 verified diagnostic cases.
 *
 * Grouped by the same checklist sections the twin's own manual test matrix uses,
 * so a case number here and a case number in its documentation are the same
 * thing. Cases the console cannot reproduce are listed with the reason rather
 * than hidden: "this needs a raw waveform" is information, and silently omitting
 * 14 of 61 would misrepresent what the model covers.
 */
function ScenarioPicker({ activeId, onSelect }: { activeId: string | null; onSelect: (id: string | null) => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [query, setQuery] = useState('');

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = SCENARIOS.filter(
      (scenario) =>
        !needle ||
        scenario.id.toLowerCase().includes(needle) ||
        scenario.name.toLowerCase().includes(needle) ||
        scenario.expectedFaultIds.some((id) => id.toLowerCase().includes(needle)),
    );
    const sections = new Map<string, { title: string; items: Scenario[] }>();
    for (const scenario of matches) {
      const entry = sections.get(scenario.section);
      if (entry) entry.items.push(scenario);
      else sections.set(scenario.section, { title: scenario.sectionTitle, items: [scenario] });
    }
    return [...sections.entries()];
  }, [query]);

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <View
          className="min-w-[200px] flex-1 rounded-lg border px-3 py-2"
          style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
        >
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Filter by id, name or fault code..."
            placeholderTextColor={palette.inkFaint}
            accessibilityLabel="Filter scenarios"
            className="font-body text-xs"
            style={{ color: palette.ink, outlineStyle: 'none' } as never}
          />
        </View>
        {activeId ? (
          <Pressable
            onPress={() => onSelect(null)}
            accessibilityRole="button"
            className="rounded-lg border px-3 py-2"
            style={{ borderColor: palette.line }}
          >
            <Text className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: palette.inkMuted }}>
              Back to live data
            </Text>
          </Pressable>
        ) : null}
      </View>

      {grouped.length === 0 ? <Body muted>No scenario matches &quot;{query}&quot;.</Body> : null}

      <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
        <View className="gap-3">
          {grouped.map(([letter, section]) => (
            <View key={letter} className="gap-1.5">
              <SectionLabel>
                {letter} - {section.title}
              </SectionLabel>
              {section.items.map((scenario) => {
                const active = scenario.id === activeId;
                const blocked = Boolean(scenario.unsupported);
                return (
                  <Pressable
                    key={scenario.id}
                    onPress={() => onSelect(scenario.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className="flex-row flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
                    style={{
                      borderColor: active ? palette.lineStrong : palette.line,
                      backgroundColor: active ? palette.panelRaised : 'transparent',
                    }}
                  >
                    <Text className="font-mono text-[10.5px]" style={{ color: palette.ink, minWidth: 168 }} numberOfLines={1}>
                      {scenario.id}
                    </Text>
                    <Text className="min-w-0 flex-1 font-body text-xs" style={{ color: palette.ink }} numberOfLines={1}>
                      {scenario.name}
                    </Text>
                    {blocked ? (
                      <Badge variant="muted" icon="waveform">
                        Needs raw signal
                      </Badge>
                    ) : scenario.expectedFaultIds.length === 0 ? (
                      <Badge variant="success">No fault</Badge>
                    ) : (
                      <Badge variant={scenario.expectedFaultIds.length > 1 ? 'warning' : 'info'} icon={null} outline>
                        {scenario.expectedFaultIds.join(' / ')}
                      </Badge>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
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
  machineId?: string;
};

export function ExtruderAnalysisView({ mappedChannels, devices, cards, live, expectedPoints, machineId }: ExtruderAnalysisViewProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [tab, setTab] = useState<TabKey>('diagnosis');
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  // The scenario library is a drawer opened from the header rather than a
  // section in the flow: it is a testing instrument, not part of the reading.
  const [libraryOpen, setLibraryOpen] = useState(false);

  // The twin's pipeline keeps its own rolling history so temporal features -
  // trend, repetition and dispersion - become available after a few samples.
  // Without it, heater failure cannot be separated from heater degradation and
  // no instrumentation hypothesis can ever be raised.
  const historyRef = useRef<Partial<Record<ExtruderTag, (number | null)[]>>>({});

  const liveRun = useMemo(() => {
    const now = new Date().toISOString();
    const built = buildPoints(mappedChannels, devices, cards, live, now);
    return {
      analysis: analyzeExtruder({
        readings: built.points.map((point) => point.reading),
        history: historyRef.current,
        now,
      }),
      points: built.points,
      dataMode: built.mode,
    };
  }, [mappedChannels, devices, cards, live]);

  // Accumulate in an effect rather than inside the memo: mutating a ref during
  // render double-appends under StrictMode's double-invoke.
  useEffect(() => {
    historyRef.current = appendHistory(historyRef.current, liveRun.analysis);
  }, [liveRun]);

  // Scenario mode replaces the live vector wholesale. The pipeline is identical -
  // only the measurements differ - so what is on screen is the same analysis the
  // machine would produce if it were actually in that condition.
  const scenarioRun = useMemo(() => {
    const scenario = scenarioId ? scenarioById(scenarioId) : undefined;
    return scenario ? runScenario(scenario) : null;
  }, [scenarioId]);

  const analysis: ExtruderAnalysisResult = scenarioRun ? scenarioRun.analysis : liveRun.analysis;
  const dataMode = liveRun.dataMode;
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
  const liveDataUnavailable = !scenarioRun && dataMode === 'none';

  // --- verdict ---------------------------------------------------------------
  const hasCandidates = detail.candidateFaults.length > 0;
  const verdictVariant: Variant = liveDataUnavailable
    ? 'muted'
    : violations.length > 0
      ? 'destructive'
      : hasCandidates
        ? (SEVERITY_VARIANT[analysis.anomaly.severity] ?? 'warning')
        : detail.faultCategory === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
          ? 'info'
          : 'success';
  const verdictTitle = liveDataUnavailable
    ? 'No live channel data'
    : hasCandidates
      ? detail.candidateFaults.length === 1
        ? (analysis.diagnoses[0]?.title ?? detail.candidateFaults[0])
        : `${detail.candidateFaults.length} hypotheses the installed sensors cannot separate`
      : detail.faultCategory === 'MACHINE_STATE_TRANSITION'
        ? `Machine is in ${humanise(detail.inferredMachineState)}`
        : detail.faultCategory === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
          ? 'Something was observed, but it cannot be identified'
          : 'No controlled fault signature was met';
  const verdictDetail = liveDataUnavailable
    ? 'No diagnosis is computed until at least one saved mapped channel is receiving current gateway telemetry.'
    : analysis.doctorReport.summary;

  const layerNote = LAYER_NOTE[detail.faultLayer];

  // --- connectivity ----------------------------------------------------------
  // Built from the saved canvas mappings and the device hierarchy, and resolved
  // onto tags by the same function the pipeline itself uses, so the tag column
  // here can never disagree with the tag the model read.
  const connections = useMemo(() => {
    const inputs: ConnectivityInput[] = mappedChannels.map((mapped) => ({
      id: mapped.id,
      label: mapped.label,
      channel: mapped.channel,
      templatePointCode: mapped.templatePointCode,
    }));
    return buildParameterConnections({
      points: inputs,
      devices,
      cards,
      live,
      resolveTag: (point) => {
        const resolution = resolveSignal(point.label, point.templatePointCode, point.channel.unit);
        return resolution.kind === 'mapped'
          ? { tag: resolution.tag, label: TAG_LABELS[resolution.tag] ?? resolution.tag }
          : null;
      },
    });
  }, [cards, devices, live, mappedChannels]);

  const connectivitySummary = useMemo(() => summariseConnections(connections), [connections]);
  const connectionByLabel = useMemo(
    () => new Map(connections.map((row) => [row.parameter, row])),
    [connections],
  );

  const thresholdRegister = useMemo(() => allThresholds(), []);
  const fieldCalibratedCount = thresholdRegister.filter((threshold) => threshold.fieldCalibrated).length;

  // --- signals ---------------------------------------------------------------
  const qualityByCode = useMemo(() => new Map(analysis.quality.map((item) => [item.code, item])), [analysis.quality]);

  const signalRows = useMemo<SignalRow[]>(() => {
    const resolvedRows = detail.resolvedSignals.map((signal: ResolvedSignal) => {
      const quality = qualityByCode.get(signal.tag);
      const status = quality?.status ?? (signal.value === null ? 'UNAVAILABLE' : 'GOOD');
      // The pipeline names a frozen channel in its own quality checks, so the
      // state is read off the model rather than guessed from the sparkline.
      const frozen = (quality?.checks ?? []).some((check) => check.toLowerCase().includes('frozen'));
      const connection = connectionByLabel.get(signal.label);
      return {
        key: `${signal.tag}-${signal.label}`,
        tag: signal.tag,
        measures: TAG_LABELS[signal.tag] ?? signal.tag,
        point: signal.label,
        value: signal.value,
        unit: signal.unit,
        health: frozen ? ('frozen' as SignalHealth) : QUALITY_HEALTH[status],
        note:
          (quality?.limitations ?? []).join(' ') ||
          (quality?.checks ?? []).join(', ') ||
          TAG_PURPOSE[signal.tag] ||
          'No quality limitation recorded for this signal.',
        source: signal.source === 'demo' ? 'Simulated' : 'Gateway',
        channel: connection ? `${connection.channelCode} · ${connection.rackName} · ${connection.channelId}` : '—',
        lastUpdate: connection ? relativeAge(connection.lastUpdatedAt) : relativeAge(signal.timestamp),
        history: historyRef.current[signal.tag] ?? [],
      } satisfies SignalRow;
    });

    const missingRows = detail.missingTags.map((item) => ({
      key: `missing-${item.tag}`,
      tag: item.tag,
      measures: item.label,
      point: 'Not mapped to any point on the machine',
      value: null,
      unit: '',
      health: 'unavailable' as SignalHealth,
      note: item.note ?? TAG_PURPOSE[item.tag] ?? 'No point on this machine resolves onto this tag.',
      source: '—',
      channel: '—',
      lastUpdate: 'never',
      history: [],
      missing: { essential: item.essential },
    })) satisfies SignalRow[];

    return [...resolvedRows, ...missingRows];
  }, [connectionByLabel, detail.missingTags, detail.resolvedSignals, qualityByCode]);

  const unconsumed = useMemo(
    () => [
      ...detail.unconsumedSignals.map((item) => ({ label: item.label, reason: item.reason })),
      ...detail.rejectedSignals.map((item) => ({ label: item.label, reason: item.error })),
      ...detail.unrecognisedSignals.map((label) => ({
        label,
        reason: 'No diagnostic tag matches this label. Rename the point to the instrument it is actually wired to, or drop its trail onto the matching pad on the machine.',
      })),
    ],
    [detail.rejectedSignals, detail.unconsumedSignals, detail.unrecognisedSignals],
  );

  // --- evidence --------------------------------------------------------------
  const evidenceItems = useMemo(() => collectEvidence(detail.assessments), [detail.assessments]);

  const contributorData: MagnitudeDatum[] = analysis.anomaly.contributors.map((item) => ({
    key: item.code,
    label: `${item.code} - ${TAG_LABELS[item.code as ExtruderTag] ?? item.code}`,
    value: item.score,
    display: item.score.toFixed(1),
    direction: item.direction,
  }));

  // --- rail ------------------------------------------------------------------
  const readoutRows = useMemo<ReadoutRow[]>(
    () =>
      detail.resolvedSignals.map((signal) => {
        const status = qualityByCode.get(signal.tag)?.status ?? (signal.value === null ? 'UNAVAILABLE' : 'GOOD');
        return {
          key: `${signal.tag}-${signal.label}`,
          tag: signal.tag,
          name: TAG_LABELS[signal.tag] ?? signal.tag,
          value: signal.value,
          unit: signal.unit,
          variant: QUALITY_VARIANT[status],
          status: humanise(status),
          history: historyRef.current[signal.tag] ?? [],
        };
      }),
    [detail.resolvedSignals, qualityByCode],
  );

  const resolvedCount = detail.resolvedSignals.length;
  const totalTags = resolvedCount + detail.missingTags.length;
  const maxMatchScore = Math.max(1, ...candidateAssessments.map((assessment) => assessment.engineeringMatchScore));

  // --- chrome ----------------------------------------------------------------
  const sourceVariant: Variant = scenarioRun
    ? 'warning'
    : dataMode === 'gateway'
      ? 'success'
      : dataMode === 'mixed'
        ? 'warning'
        : 'muted';
  const sourceLabel = scenarioRun
    ? 'Scenario injection'
    : dataMode === 'gateway'
      ? 'Live gateway'
      : dataMode === 'mixed'
        ? 'Partial live data'
        : 'No live data';

  const headerFacts: HeaderFact[] = [
    ...(machineId ? [{ label: 'Machine', value: machineId }] : []),
    { label: 'Model', value: `Single-screw extruder ${analysis.modelVersion}` },
    { label: 'Recipe', value: detail.recipeId },
    { label: 'State', value: humanise(detail.inferredMachineState), variant: stateVariant(detail.inferredMachineState) },
    {
      label: 'Gateways',
      value: `${connectivitySummary.gateways} · ${connectivitySummary.connected}/${connectivitySummary.total} points live`,
      variant: connectivitySummary.connected === connectivitySummary.total && connectivitySummary.total > 0 ? 'success' : 'warning',
    },
    { label: 'Tags', value: `${resolvedCount}/${totalTags} resolved`, variant: readinessVariant(analysis.readiness.score) },
  ];

  const tabs: TabItem<TabKey>[] = [
    { value: 'diagnosis', label: 'Diagnosis', icon: 'stethoscope', count: candidateAssessments.length, countVariant: verdictVariant },
    { value: 'limits', label: 'Limits', icon: 'ruler-square', count: violations.length, countVariant: 'destructive' },
    { value: 'evidence', label: 'Evidence', icon: 'chart-timeline-variant', count: evidenceItems.length, countVariant: 'warning' },
    { value: 'signals', label: 'Signals', icon: 'access-point', count: detail.missingTags.length + unresolved, countVariant: 'info' },
    { value: 'model', label: 'Model', icon: 'file-document-outline' },
    {
      value: 'connectivity',
      label: 'Connectivity',
      icon: 'lan-connect',
      count: connectivitySummary.unmapped + connectivitySummary.offline,
      countVariant: 'warning',
    },
  ];

  const { width } = useWindowDimensions();
  // Two columns only where a rail still leaves a readable main column. Below it
  // the rail drops underneath rather than squeezing the analysis to a gutter.
  const wide = width >= 1180;
  const railWidth = width >= 1600 ? 372 : 336;

  const evidenceBasis = useMemo(() => {
    const lines: string[] = [];
    if (detail.triggeredThresholds.length > 0) {
      lines.push(`${detail.triggeredThresholds.length} registered threshold${detail.triggeredThresholds.length === 1 ? '' : 's'} crossed.`);
    }
    lines.push(`${resolvedCount} of ${totalTags} diagnostic tags resolved from ${mappedChannels.length} mapped point${mappedChannels.length === 1 ? '' : 's'}.`);
    if (degradedSignals.length > 0) {
      lines.push(`${degradedSignals.length} signal${degradedSignals.length === 1 ? '' : 's'} degraded or bad, which narrows what can be concluded.`);
    }
    if (violations.length > 0) {
      lines.push(`${violations.length} hard process limit${violations.length === 1 ? '' : 's'} exceeded, reported separately from the diagnosis.`);
    }
    if (lines.length === 1) lines.push('No registered threshold was crossed by the current measurements.');
    return lines;
  }, [degradedSignals.length, detail.triggeredThresholds.length, mappedChannels.length, resolvedCount, totalTags, violations.length]);

  const rail = (
    <View className="gap-3">
      <LiveInstrumentReadout
        rows={readoutRows}
        missing={detail.missingTags.map((item) => ({ tag: item.tag, label: item.label, essential: item.essential }))}
        maxHeight={wide ? 360 : 300}
      />

      {/* Where those readings physically come from. The full chain is a tab of
          its own; this is the one-glance version that sits beside every
          conclusion drawn from it. */}
      <Section
        title="Gateway context"
        eyebrow="Acquisition"
        meta="Where the readings above are arriving from."
        actions={
          <Badge variant={connectivitySummary.offline > 0 ? 'warning' : 'success'} icon={null} outline>
            {connectivitySummary.connected}/{connectivitySummary.total}
          </Badge>
        }
      >
        <View className="gap-2.5">
          <View className="flex-row flex-wrap gap-x-5 gap-y-2">
            <Fact label="Source" value={sourceLabel} mono={false} width={120} />
            <Fact label="Gateways" value={String(connectivitySummary.gateways)} width={78} />
            <Fact label="Racks" value={String(connectivitySummary.racks)} width={70} />
            <Fact label="Channels" value={String(connectivitySummary.channels)} width={82} />
            <Fact
              label="Silent"
              value={String(connectivitySummary.offline)}
              width={70}
              tone={connectivitySummary.offline > 0 ? palette.warning : undefined}
            />
            <Fact
              label="Unmapped"
              value={String(connectivitySummary.unmapped)}
              width={90}
              tone={connectivitySummary.unmapped > 0 ? palette.warning : undefined}
            />
          </View>
          <Pressable
            onPress={() => setTab('connectivity')}
            accessibilityRole="button"
            accessibilityLabel="Open the connectivity tab"
            className="flex-row items-center justify-between rounded-lg border px-2.5 py-1.5"
            style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
          >
            <Text className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkMuted }}>
              Trace the acquisition chain
            </Text>
            <Text className="font-mono text-[11px]" style={{ color: palette.inkFaint }}>
              →
            </Text>
          </Pressable>
        </View>
      </Section>
    </View>
  );

  return (
    <View className="min-h-0 flex-1" style={{ backgroundColor: palette.bg }}>
      <AnalyzerHeader
        facts={headerFacts}
        sourceLabel={sourceLabel}
        sourceVariant={sourceVariant}
        scenarioLabel={scenarioRun ? scenarioRun.scenario.id : 'Scenarios'}
        scenarioActive={Boolean(scenarioRun)}
        onToggleLibrary={() => setLibraryOpen((previous) => !previous)}
        onReturnToLive={() => setScenarioId(null)}
      />

      {/* Tab bar — also fixed, so switching views never means scrolling back up. */}
      <View className="px-5 py-2" style={{ backgroundColor: palette.panel, borderBottomWidth: 1, borderBottomColor: palette.line }}>
        <Tabs items={tabs} value={tab} onChange={setTab} />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 48, alignItems: 'center' }}>
        <View className="w-full gap-3" style={{ maxWidth: 1680 }}>
          {libraryOpen ? (
            <Card className="gap-3">
              <CardHeader>
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle size="sm">Fault scenario library</CardTitle>
                  <Badge variant={scenarioRun ? 'warning' : 'muted'} icon="flask-outline">
                    {SCENARIOS.filter((scenario) => !scenario.unsupported).length}/{SCENARIOS.length} reproducible
                  </Badge>
                </View>
                <Body muted>
                  {scenarioRun
                    ? `Running ${scenarioRun.scenario.id} — ${scenarioRun.scenario.name}. Live data is not being analysed.`
                    : 'Verified diagnostic cases from the digital twin. Selecting one drives this same pipeline with that condition instead of live measurements.'}
                </Body>
              </CardHeader>
              <Separator />
              <ScenarioPicker activeId={scenarioId} onSelect={setScenarioId} />
            </Card>
          ) : null}

          {/* Say plainly when the live model has no gateway measurements to read. */}
          {!scenarioRun && dataMode !== 'gateway' ? (
            <Alert
              variant="info"
              icon="access-point-off"
              title={dataMode === 'none' ? 'No live channel data' : 'Partial live channel data'}
            >
              {mappedChannels.length === 0
                ? 'No saved Mappable Box links exist for this machine. Link boxes to rack channels in Design mode and save the canvas before live analysis can run.'
                : 'Only channels with current gateway measurements are evaluated. Silent mapped channels stay unavailable and do not receive fallback values.'}
            </Alert>
          ) : null}

          {scenarioRun ? (
            <Alert
              variant={scenarioRun.verdict === 'PASS' ? 'success' : scenarioRun.verdict === 'NOT_REPRODUCIBLE' ? 'muted' : 'destructive'}
              title={`${scenarioRun.scenario.id} - ${scenarioRun.scenario.name} - ${scenarioRun.verdict === 'NOT_REPRODUCIBLE' ? 'not reproducible here' : scenarioRun.verdict.toLowerCase()}`}
            >
              <View className="gap-1.5">
                <Body muted>{scenarioRun.rationale}</Body>
                <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                  <KeyValue label="Injected" value={scenarioRun.expectedFaultIds.join(', ') || 'nothing'} />
                  <KeyValue label="Reported" value={scenarioRun.actualFaultIds.join(', ') || 'nothing'} />
                  <KeyValue label="Acceptance" value={scenarioRun.scenario.acceptance} />
                  {scenarioRun.scenario.severity !== null ? (
                    <KeyValue label="Severity" value={String(scenarioRun.scenario.severity)} />
                  ) : null}
                </View>
              </View>
            </Alert>
          ) : null}

          {/* A hard-limit breach is the most urgent thing on this screen and
              stays visible regardless of which tab is open. */}
          {violations.length > 0 ? (
            <Alert variant="destructive" title={`${violations.length} hard process limit${violations.length === 1 ? '' : 's'} exceeded`}>
              {violations
                .map((check) => `${check.name} at ${check.value === null ? '—' : check.value} ${check.unit} (limit ${check.operator} ${check.limit}).`)
                .join(' ')}
            </Alert>
          ) : null}

          {layerNote ? (
            <Alert variant={layerNote.variant} title={layerNote.title}>
              {layerNote.detail}
            </Alert>
          ) : null}

          {/* --- the workspace grid ------------------------------------------
              Main analysis left, the instruments it was read from right. The
              rail sticks to the top of the scroller on desktop so a long
              evidence table never scrolls the readings out of sight. */}
          <View className={cn('gap-3', wide && 'flex-row items-start')}>
            <View className="min-w-0 flex-1 gap-3">
              {tab === 'diagnosis' ? (
                liveDataUnavailable ? (
                  <Section title="Diagnosis withheld" eyebrow="No measurements" accent="warning">
                    <Body muted>
                      No saved mapped channel is receiving current gateway telemetry. Connect the Mappable Boxes to the
                      correct rack channels and wait for live samples before diagnosing faults.
                    </Body>
                  </Section>
                ) : (
                  <>
                    <DiagnosisSummary
                      variant={verdictVariant}
                      headline={verdictTitle}
                      eyebrow={
                        hasCandidates ? `${humanise(detail.faultLayer)} layer · ${humanise(detail.faultCategory)}` : 'No fault signature'
                      }
                      detail={verdictDetail}
                      identifiability={humanise(detail.identifiability)}
                      readiness={{
                        score: analysis.readiness.score,
                        ready: analysis.readiness.ready,
                        variant: readinessVariant(analysis.readiness.score),
                        missing: analysis.readiness.missingEssential,
                      }}
                      machineState={{
                        label: humanise(detail.inferredMachineState),
                        variant: stateVariant(detail.inferredMachineState),
                        basis: detail.stateBasis[0] ?? '',
                      }}
                      hypotheses={candidateAssessments.length}
                      topScore={candidateAssessments[0]?.engineeringMatchScore ?? null}
                      unresolvedSignals={unresolved}
                      severity={{
                        label: analysis.anomaly.severity === 'none' ? 'none active' : humanise(analysis.anomaly.severity),
                        variant: SEVERITY_VARIANT[analysis.anomaly.severity] ?? 'info',
                      }}
                    />

                    <ConclusionPanel
                      machineState={humanise(detail.inferredMachineState)}
                      stateBasis={detail.stateBasis}
                      separatingMeasurements={detail.separatingMeasurements}
                      hypotheses={candidateAssessments.length}
                      explanation={detail.explanation}
                      evidenceBasis={evidenceBasis}
                    />

                    <HypothesisList assessments={candidateAssessments} maxScore={maxMatchScore} />

                    {analysis.maintenance.caseRequired ? (
                      <MaintenanceGuidance
                        priority={analysis.maintenance.priority}
                        actions={analysis.maintenance.recommendedActions}
                        verification={analysis.maintenance.verificationSteps}
                        variant={
                          analysis.maintenance.priority === 'critical' || analysis.maintenance.priority === 'high'
                            ? 'destructive'
                            : 'warning'
                        }
                      />
                    ) : null}

                    <EliminatedList assessments={eliminated} />
                  </>
                )
              ) : null}

              {tab === 'limits' ? <LimitsTab constraints={detail.constraints} fieldCalibrated={fieldCalibratedCount} /> : null}

              {tab === 'evidence' ? (
                <EvidenceTab
                  evidence={evidenceItems}
                  missing={detail.missingTags}
                  thresholds={detail.triggeredThresholds}
                  contributors={contributorData}
                  contributorVariant={SEVERITY_VARIANT[analysis.anomaly.severity] ?? 'info'}
                  anomalyLimitation={analysis.anomaly.limitations[0] ?? 'No measurement is outside its consistency band.'}
                  assessments={detail.assessments}
                  readinessScore={analysis.readiness.score}
                  thresholdTotal={thresholdRegister.length}
                />
              ) : null}

              {tab === 'signals' ? <SignalsTab signals={signalRows} unconsumed={unconsumed} /> : null}

              {tab === 'model' ? (
                <ModelTab
                  modelName="Single-screw extruder diagnostic model"
                  modelVersion={analysis.modelVersion}
                  recipeId={detail.recipeId}
                  machineState={humanise(detail.inferredMachineState)}
                  inputs={detail.resolvedSignals.map((signal) => ({
                    tag: signal.tag,
                    label: TAG_LABELS[signal.tag] ?? signal.tag,
                    value: signal.value,
                    unit: signal.unit,
                  }))}
                  missing={detail.missingTags}
                  constraintCount={detail.constraints.length}
                  blockedOutputs={detail.blockedOutputs}
                  baseline={detail.baseline}
                  trace={detail.trace}
                  availability={detail.availability}
                  caveats={analysis.doctorReport.caveats}
                  thresholdCount={thresholdRegister.length}
                  fieldCalibrated={fieldCalibratedCount}
                />
              ) : null}

              {tab === 'connectivity' ? <ConnectivityTab connections={connections} /> : null}
            </View>

            {/* The rail carries the same two panels on every tab: what the model
                is reading, and where those readings come from. */}
            <View
              style={
                wide
                  ? ({ width: railWidth, position: 'sticky', top: 0, alignSelf: 'flex-start' } as never)
                  : undefined
              }
            >
              {rail}
            </View>
          </View>

          {/* Kept out of the rail so the page still names the machine's fault
              vocabulary when the rail has collapsed underneath. */}
          {expectedPoints && expectedPoints > mappedChannels.length ? (
            <Body muted>
              {mappedChannels.length} of {expectedPoints} expected measurement points are mapped on this machine.
            </Body>
          ) : null}

          {/* Named so the page still says which fault the model would call this,
              even when the diagnosis tab is not the one open. */}
          {hasCandidates && tab !== 'diagnosis' ? (
            <Body muted>
              Current diagnosis: {detail.candidateFaults.map((id) => faultName(id)).join(', ')}.
            </Body>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
