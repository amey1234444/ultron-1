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
 * One column, two objects. The status band answers "how is this machine" and
 * stays put; the card below it answers "show me", and its tab bar is the only
 * navigation between the three ways of being shown. There used to be a sticky
 * instrument rail down the right-hand side as well — it was the Signals table
 * in miniature, and the half of that subject it could not carry, the
 * acquisition chain behind each reading, is now inside the Signals row itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  boundaryCrossings,
  buildKeyChanges,
  buildPartViews,
  classifyBehaviour,
  faultName,
  matchClassLabel,
  partForFault,
  partForTag,
  partsForConstraint,
  PROCESS_CONSTRAINTS,
  resolveSignal,
  resolveSignalStatus,
  runScenario,
  scenarioById,
  SCENARIOS,
  signalKindForTag,
  TAG_LABELS,
  tagsForConstraint,
  type ExtruderAnalysisResult,
  type ExtruderInputReading,
  type ExtruderTag,
  type MachinePart,
  type ResolvedSignal,
  type Scenario,
  type SignalView,
} from '../../../lib/analysis/extruder';
import type { SignalQuality } from '../../../lib/analysis/types';
import { deviceWithGatewayConnectionState, type DeviceNode } from '../../../lib/devices';
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
  text,
  type TabItem,
  type Variant,
} from '../../ui';
import { AdvanceDiagnosisTab } from './analyzer/AdvanceDiagnosisTab';
import { StatusBand, type StatusCount } from './analyzer/StatusBand';
import { Block, FilterChips, SearchField } from './analyzer/AnalyzerParts';
import { ConclusionTab, type CurrentDiagnosis } from './analyzer/ConclusionTab';
import type { FindingCluster } from './analyzer/Findings';
import { SEVERITY_LABEL, SEVERITY_ORDER, type Severity } from '../../../lib/severity';
import { signalFilterCounts, SIGNAL_FILTERS, SignalTab, type SignalFilter } from './analyzer/SignalTab';
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
      rack && card && live
        ? latestMeasurementForChannel(deviceWithGatewayConnectionState(rack, devices), card, channelNumber(mapped.channel.id), live)
        : undefined;
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

/** The anomaly layer's own severity words, onto the findings ramp. */
const SEVERITY_FOR_ANOMALY: Record<string, Severity> = {
  critical: 'fault',
  high: 'fault',
  medium: 'limit',
  low: 'boundary',
  none: 'advisory',
};

const LAYER_NOTE: Record<string, { title: string; detail: string; variant: Variant }> = {
  DATA_QUALITY: {
    title: 'The data stream is broken - machine condition is not being reported',
    detail:
      'A transport fault owns this answer. A plant diagnosis computed from these numbers would not be trustworthy, so it is withheld until the stream is fixed. The plant hypotheses are still assessed and visible under Evidence.',
    variant: 'destructive',
  },
};

function readinessVariant(score: number): Variant {
  if (score >= 85) return 'success';
  if (score >= 60) return 'warning';
  return 'destructive';
}

function humanise(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}

/** First letter up, the rest as `humanise` left it. For anything that starts a line. */
function sentenceCase(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/**
 * Three screens, three questions.
 *
 * Diagnosis: what is wrong, and what to do. Advance Diagnosis: why, and where
 * on the machine. Signals: what every sensor reads, whether that is inside its
 * limits, and which piece of hardware produced it.
 *
 * What used to be six tabs collapsed into these. Evidence was never really a
 * subject of its own — it is the reasoning behind a conclusion and belongs
 * beside it. Limits answered half of the Signal question and became the other
 * half of that table. Connectivity answered the question directly underneath a
 * reading and is now the second half of the row that shows it: one row per
 * sensor, rather than the same sensor findable twice, once by what it measures
 * and once by where it is wired. Model provenance is a footnote under the table
 * whose numbers it qualifies.
 */
type TabKey = 'diagnosis' | 'advance' | 'signal';

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
            <Text className={text.chip} style={{ color: palette.inkMuted }}>
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
                    <Text className={text.data} style={{ color: palette.ink, minWidth: 168 }} numberOfLines={1}>
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
  // null = the Advance Diagnosis entry screen (all parts). Held here rather than
  // inside the tab so that following a finding from Diagnosis or a signal from
  // the Signal table lands on the right part, not on the part picker.
  const [selectedPart, setSelectedPart] = useState<MachinePart | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  // Which kinds of finding the Diagnosis list is showing. Held in the shell
  // because the control that drives it lives in the shell's toolbar row, beside
  // the tabs, rather than inside the screen it filters.
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');
  const [signalQuery, setSignalQuery] = useState('');
  // The standing integrity caveat is dismissible per session: it is a condition
  // of the reading, not an event, so once acknowledged it should not keep
  // re-claiming the top of the screen on every re-render.
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  // When this analysis session began, for the header's elapsed fact. A ref so
  // it survives re-renders without becoming a dependency of anything.
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
  const violations = detail.constraints.filter((check) => check.status === 'VIOLATION');
  const liveDataUnavailable = !scenarioRun && dataMode === 'none';

  // --- verdict ---------------------------------------------------------------
  const hasCandidates = detail.candidateFaults.length > 0;
  const verdictSeverity: Severity = liveDataUnavailable
    ? 'boundary'
    : violations.length > 0
      ? 'limit'
      : hasCandidates
        ? (SEVERITY_FOR_ANOMALY[analysis.anomaly.severity] ?? 'limit')
        : detail.faultCategory === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
          ? 'boundary'
          : 'advisory';
  // One word for the status tile. Deliberately not the verdict headline, which
  // is a sentence: the tile answers "how is the machine", the headline answers
  // "what is wrong", and the tile has to be readable across a control room.
  const verdictStatusWord = liveDataUnavailable
    ? 'No data'
    : violations.length > 0
      ? 'Critical'
      : hasCandidates
        ? 'Warning'
        : detail.faultCategory === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
          ? 'Unclear'
          : 'Normal';
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

  // --- signals ---------------------------------------------------------------
  // One view model per tag, joined here because this is the only layer that
  // knows all three sources: the pipeline's resolved signal, the rack channel's
  // configured limits, and the acquisition chain the reading arrived through.
  // Everything derived FROM that join - behaviour, severity, part ownership -
  // is computed in lib/analysis/extruder/partView.ts, not in a component.
  const mappedByLabel = useMemo(
    () => new Map(mappedChannels.map((mapped) => [mapped.label.trim(), mapped])),
    [mappedChannels],
  );
  const baselineByTag = useMemo(() => new Map(detail.baseline.map((entry) => [entry.tag, entry])), [detail.baseline]);
  const constraintByTag = useMemo(() => {
    const map = new Map<ExtruderTag, (typeof PROCESS_CONSTRAINTS)[number]>();
    for (const constraint of PROCESS_CONSTRAINTS) {
      for (const tag of tagsForConstraint(constraint.constraintId)) {
        if (!map.has(tag)) map.set(tag, constraint);
      }
    }
    return map;
  }, []);

  const signalViews = useMemo<SignalView[]>(() => {
    const resolved = detail.resolvedSignals.map((signal: ResolvedSignal) => {
      const quality = qualityByCode.get(signal.tag);
      const connection = connectionByLabel.get(signal.label);
      const mapped = mappedByLabel.get(signal.label);
      const baseline = baselineByTag.get(signal.tag);
      const constraint = constraintByTag.get(signal.tag);
      const history = historyRef.current[signal.tag] ?? [];

      const reference = baseline?.value ?? null;
      // The learned normal band is the right yardstick for "has this moved
      // meaningfully"; without one, classifyBehaviour falls back to the
      // signal's own observed spread rather than to an invented constant.
      const behaviour = classifyBehaviour(history, reference !== null ? Math.abs(reference) * 0.2 : null);

      const warningLimit = mapped?.channel.alarmWarning ?? null;
      const criticalLimit = mapped?.channel.alarmCritical ?? null;

      return {
        tag: signal.tag,
        measures: TAG_LABELS[signal.tag] ?? signal.tag,
        point: signal.label,
        kind: signalKindForTag(signal.tag),
        part: partForTag(signal.tag),
        value: signal.value,
        unit: signal.unit,
        reference,
        referenceNote:
          baseline?.provenance ??
          'No learned or configured normal value exists for this signal yet, so no reference is shown.',
        behaviour: behaviour.behaviour,
        behaviourDetail: behaviour.detail,
        warningLimit,
        criticalLimit,
        processLimit: constraint
          ? { name: constraint.name, operator: constraint.operator, limit: constraint.upper, unit: constraint.unit }
          : null,
        status: resolveSignalStatus(signal.value, warningLimit, criticalLimit),
        quality: quality?.status ?? (signal.value === null ? 'UNAVAILABLE' : 'GOOD'),
        qualityNotes: [
          ...(quality?.limitations ?? []),
          ...(quality?.checks ?? []),
          ...(TAG_PURPOSE[signal.tag] ? [TAG_PURPOSE[signal.tag]] : []),
        ],
        updated: connection ? relativeAge(connection.lastUpdatedAt) : relativeAge(signal.timestamp),
        source: signal.source === 'demo' ? 'Simulated' : 'Gateway',
        channel: connection
          ? `${connection.channelCode} · ${connection.rackName} · slot ${String(connection.slot).padStart(2, '0')} · ${connection.channelId}`
          : 'Not traced to a rack channel',
        history,
      } satisfies SignalView;
    });

    // A tag with no point mapped to it is listed, not omitted. "Nothing is
    // measuring the gearbox" is the single most important thing this screen can
    // say, and an absent row says the opposite.
    const missing = detail.missingTags.map((item) => ({
      tag: item.tag,
      measures: item.label,
      point: 'Not mapped to any point on the machine',
      kind: signalKindForTag(item.tag),
      part: partForTag(item.tag),
      value: null,
      unit: '',
      reference: null,
      referenceNote: 'No reference exists for a tag nothing is mapped to.',
      behaviour: 'UNAVAILABLE' as const,
      behaviourDetail: item.note ?? 'No point on this machine resolves onto this tag.',
      warningLimit: null,
      criticalLimit: null,
      processLimit: null,
      status: 'NOT_MAPPED' as const,
      quality: 'UNAVAILABLE',
      qualityNotes: [item.note ?? TAG_PURPOSE[item.tag] ?? 'No point on this machine resolves onto this tag.'],
      updated: 'never',
      source: '—',
      channel: 'Not traced to a rack channel',
      history: [],
      missing: { essential: item.essential, note: item.note ?? '' },
    })) satisfies SignalView[];

    return [...resolved, ...missing];
  }, [
    baselineByTag,
    connectionByLabel,
    constraintByTag,
    detail.missingTags,
    detail.resolvedSignals,
    mappedByLabel,
    qualityByCode,
  ]);

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

  // --- machine parts ---------------------------------------------------------
  const partViews = useMemo(() => buildPartViews({ analysis, signals: signalViews }), [analysis, signalViews]);
  const keyChanges = useMemo(() => buildKeyChanges(signalViews), [signalViews]);

  // --- conclusion ------------------------------------------------------------
  // One row per physical crossing. See `boundaryCrossings` for why.
  const crossings = useMemo(() => boundaryCrossings(detail.triggeredThresholds), [detail.triggeredThresholds]);

  /**
   * Everything raised on this machine, grouped by the signal it was raised on.
   *
   * The list used to be one row per rule, which printed the same sentence three
   * times when one point tripped three thresholds. One cluster is one signal;
   * its rules are the table inside it. See `analyzer/Findings.tsx`.
   *
   * Severities come from what the pipeline actually raises, and stay distinct:
   *
   *   limit      a hard process constraint is violated       amber
   *   boundary   a registered threshold is crossed           slate
   *
   * A crossed threshold is NOT amber. It is a registered reference being
   * exceeded, and a machine with twelve of them is not a machine with twelve
   * warnings — that conflation is the thing this grouping exists to undo.
   */
  const findingClusters = useMemo<FindingCluster[]>(() => {
    /** The registered bound behind a triggered threshold, joined by id. */
    const registered = new Map(thresholdRegister.map((entry) => [entry.thresholdId, entry]));

    const limits: FindingCluster[] = violations.map((check) => {
      const part = partsForConstraint(check.constraintId)[0] ?? null;
      // Both sides are on the same scale and in the same unit, so the ratio is
      // a real multiple rather than an invented one.
      const ratio =
        check.value !== null && Number.isFinite(check.value) && check.limit !== 0
          ? Math.abs(check.value / check.limit)
          : null;
      return {
        id: `limit-${check.constraintId}`,
        severity: 'limit' as const,
        title: `${check.name} is past its hard process limit`,
        signal: [check.constraintId, part, check.unit].filter(Boolean).join(' · '),
        note:
          check.reason ??
          'A registered hard process limit is exceeded. This is a bound on the process itself, not a reference the model learned.',
        part,
        rules: [
          {
            code: check.constraintId,
            rule: check.name,
            reference: `${check.operator} ${check.limit} ${check.unit}`.trim(),
            observed: check.value === null ? '—' : `${check.value} ${check.unit}`.trim(),
            ratio,
          },
        ],
      };
    });

    // One cluster per sensor, however many of its thresholds fired.
    const bySensor = new Map<string, FindingCluster>();
    for (const { threshold, faultIds } of crossings) {
      const sensor = threshold.sensor;
      const part = sensor in TAG_LABELS ? partForTag(sensor as ExtruderTag) : null;
      const label = TAG_LABELS[sensor as ExtruderTag] ?? sensor;
      const bound = registered.get(threshold.thresholdId);

      // Only divide when there is a registered value to divide by, and it is
      // not zero. Everything else reports "not comparable" rather than a
      // number nobody can defend.
      const ratio =
        bound && threshold.observed !== null && Number.isFinite(threshold.observed) && bound.value !== 0
          ? Math.abs(threshold.observed / bound.value)
          : null;

      const rule = {
        code: threshold.thresholdId,
        rule: humanise(threshold.feature),
        reference: bound ? `${bound.operator} ${bound.value} ${bound.unit}`.trim() : 'not registered',
        observed:
          threshold.observed === null
            ? '—'
            : `${Number(threshold.observed.toFixed(Math.abs(threshold.observed) >= 10 ? 1 : 2))} ${bound?.unit ?? ''}`.trim(),
        ratio,
      };

      const existing = bySensor.get(sensor);
      if (existing) {
        existing.rules.push(rule);
        continue;
      }

      bySensor.set(sensor, {
        id: `boundary-${sensor}`,
        severity: 'boundary' as const,
        title: `${label} crossed a registered boundary`,
        signal: [sensor, label.toLowerCase(), bound?.unit].filter(Boolean).join(' · '),
        note:
          faultIds.length > 1
            ? `This point feeds ${faultIds.length} hypotheses the installed sensors cannot separate, so a crossing here narrows the field without naming a cause.`
            : threshold.notes ||
              'A registered reference for this point is exceeded. That is a boundary, not a breach of a hard process limit.',
        part,
        rules: [rule],
      });
    }

    return [...limits, ...bySensor.values()];
  }, [crossings, thresholdRegister, violations]);

  const currentDiagnosis = useMemo<CurrentDiagnosis | null>(() => {
    const top = candidateAssessments[0];
    if (!top) return null;
    const part = partForFault(top.faultId);
    const record = analysis.diagnoses.find((entry) => entry.code === top.faultId);
    return {
      likelyCause: top.faultName,
      affectedPart: part ?? 'Not localised to one part',
      part,
      alternatives: candidateAssessments.length - 1,
      ranking:
        candidateAssessments.length > 1
          ? `${matchClassLabel(top.matchClass)} of ${candidateAssessments.length}`
          : matchClassLabel(top.matchClass),
      cannotConfirm: [
        ...(top.separatingMeasurement ? [top.separatingMeasurement] : []),
        ...(record?.limitations ?? []),
        ...analysis.doctorReport.caveats,
      ],
    };
  }, [analysis.diagnoses, analysis.doctorReport.caveats, candidateAssessments]);

  const nextAction = analysis.maintenance.caseRequired
    ? {
        // Sentence case: the pill that shows this is no longer set in tracked
        // capitals, so "medium" would arrive lower-case at the start of a line.
        priority: sentenceCase(humanise(analysis.maintenance.priority)),
        steps: analysis.maintenance.recommendedActions,
        verification: analysis.maintenance.verificationSteps,
      }
    : null;


  const resolvedCount = detail.resolvedSignals.length;
  const totalTags = resolvedCount + detail.missingTags.length;

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

  // Counts are what each tab is FOR, not how many rows it happens to hold:
  // Diagnosis counts what is raised, Advance Diagnosis counts parts that are not
  // normal, Signal counts readings outside their limits.
  const partsNotNormal = partViews.filter((view) => view.state !== 'NORMAL' && view.state !== 'UNAVAILABLE').length;
  const signalsOutsideLimits = signalViews.filter(
    (signal) => signal.status === 'WARNING' || signal.status === 'ALARM',
  ).length;

  const tabs: TabItem<TabKey>[] = [
    {
      value: 'diagnosis',
      label: 'Diagnosis',
      icon: 'stethoscope',
      // Rules, not clusters: the tab badge has to agree with the filter counts
      // on the card underneath it, and those count rules.
      count: findingClusters.reduce((total, cluster) => total + cluster.rules.length, 0),
      countVariant: violations.length > 0 ? 'destructive' : crossings.length > 0 ? 'warning' : 'muted',
    },
    {
      value: 'advance',
      label: 'Advance Diagnosis',
      icon: 'cog-outline',
      count: partsNotNormal,
      countVariant: partsNotNormal > 0 ? 'warning' : 'muted',
    },
    {
      value: 'signal',
      label: 'Signals',
      icon: 'access-point',
      // Rows that need a decision on this screen: a reading outside its limits,
      // or a mapped point the model could not read at all.
      count: signalsOutsideLimits + unconsumed.length,
      countVariant: signalsOutsideLimits + unconsumed.length > 0 ? 'warning' : 'muted',
    },
  ];

  /**
   * The one navigation the redesign depends on.
   *
   * Diagnosis names a problem; Advance Diagnosis explains it. Every finding on
   * Diagnosis and every row on Signal carries the part it belongs to, so both
   * can hand the user straight to the part deep-dive instead of leaving them to
   * find it in a picker.
   */
  const openPart = useCallback((part: MachinePart) => {
    setSelectedPart(part);
    setTab('advance');
  }, []);

  const { width } = useWindowDimensions();
  // One breakpoint, and only one: where a screen may split into two readable
  // columns. Nothing else in the layer branches on width.
  const wide = width >= 1120;
  // Matches the machine header's own gutter above this screen, so the analysis
  // cards start on the same vertical as the machine's name rather than a few
  // pixels inside it.
  const gutter = width >= 768 ? 20 : 12;

  // --- shell furniture -------------------------------------------------------
  /**
   * The machine's state as one sentence, for the top of the band.
   *
   * The status word answers "how is it"; this answers "why do you say that", and
   * it is the only place in the layer that answers it before a tab is chosen.
   * It is assembled from what the pipeline already concluded rather than
   * written per case, so it can never disagree with the screen below it.
   */
  const verdictLine = liveDataUnavailable
    ? 'No gateway measurement is reaching this machine, so no condition can be reported.'
    : violations.length > 0
      ? `${violations.length} hard process limit${violations.length === 1 ? '' : 's'} exceeded${
          currentDiagnosis ? ` · ${currentDiagnosis.likelyCause} on ${currentDiagnosis.affectedPart}` : ''
        }.`
      : currentDiagnosis
        ? `${currentDiagnosis.likelyCause} on ${currentDiagnosis.affectedPart}.`
        : detail.faultCategory === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
          ? 'The installed sensors cannot separate the remaining explanations, so no single conclusion is reported.'
          : 'No controlled fault signature is met by the current measurements.';

  /**
   * The counters, machine-wide.
   *
   * They say "this machine" on every row, because the severity mix beside them
   * is scoped to what is in view and the two must not be mistaken for each
   * other. Both derive from the same arrays, so the numbers cannot disagree.
   *
   * Each one opens the findings list already filtered to what it counted — a
   * count you cannot press is a number the reader has to go and find the
   * meaning of somewhere else.
   */
  const openFindings = useCallback(
    (severity: Severity) => {
      setSeverityFilter(severity);
      setTab('diagnosis');
    },
    [],
  );

  const counts: StatusCount[] = [
    {
      key: 'faults',
      label: 'Detected faults',
      value: String(candidateAssessments.length),
      detail: 'Matched fault signatures',
      severity: 'fault',
      scope: 'this machine',
      onPress: candidateAssessments.length > 0 ? () => openFindings('fault') : undefined,
    },
    {
      key: 'limits',
      label: SEVERITY_LABEL.limit,
      value: String(violations.length),
      detail: 'Above a hard registered process limit',
      severity: 'limit',
      scope: 'this machine',
      onPress: violations.length > 0 ? () => openFindings('limit') : undefined,
    },
    {
      key: 'boundaries',
      label: SEVERITY_LABEL.boundary,
      value: String(crossings.length),
      detail: 'Registered references exceeded',
      severity: 'boundary',
      scope: 'this machine',
      onPress: crossings.length > 0 ? () => openFindings('boundary') : undefined,
    },
    {
      key: 'unread',
      label: 'Points not read',
      value: String(unconsumed.length),
      detail: 'Mapped but not resolved onto a tag',
      severity: 'advisory',
      scope: unconsumed.length === 0 ? '' : 'this machine',
      onPress: unconsumed.length > 0 ? () => setTab('signal') : undefined,
    },
  ];

  /** Severity shares for the mix, scoped to the findings list in view. */
  const severityShares = useMemo(
    () =>
      SEVERITY_ORDER.map((severity) => ({
        severity,
        count: findingClusters
          .filter((cluster) => cluster.severity === severity)
          .reduce((total, cluster) => total + cluster.rules.length, 0),
      })),
    [findingClusters],
  );

  // The integrity layer's standing caveat. It qualifies the status it sits
  // under, so it closes the band rather than being one more banner pushing the
  // whole screen down.
  const notice =
    layerNote && !noticeDismissed
      ? {
          title: layerNote.title,
          detail: layerNote.detail,
          variant: layerNote.variant,
          actionLabel: 'Open signals',
          onAction: () => setTab('signal'),
          onDismiss: () => setNoticeDismissed(true),
        }
      : null;

  const signalCounts = useMemo(() => signalFilterCounts(signalViews), [signalViews]);

  /**
   * The toolbar that shares the tab row.
   *
   * Diagnosis no longer puts anything here: its findings card carries its own
   * severity filters, in the severity hues, right above the rows they scope.
   * A filter a card's width away from the list it filters is a filter you have
   * to remember you set.
   */
  const toolbar =
    tab === 'signal' ? (
      <>
        <SearchField value={signalQuery} onChange={setSignalQuery} placeholder="Filter signals..." width={186} />
        <FilterChips
          label="Filter signals"
          value={signalFilter}
          onChange={setSignalFilter}
          options={SIGNAL_FILTERS.map((entry) => ({
            value: entry.value,
            label: entry.label,
            count: signalCounts[entry.value],
            variant: entry.value === 'attention' ? ('warning' as const) : undefined,
          }))}
        />
      </>
    ) : null;

  const screen =
    tab === 'diagnosis' ? (
      liveDataUnavailable ? (
        <Block first title="Diagnosis withheld" accent="warning">
          <Body muted>
            No saved mapped channel is receiving current gateway telemetry. Connect the Mappable Boxes to the correct
            rack channels and wait for live samples before diagnosing faults.
          </Body>
        </Block>
      ) : (
        <ConclusionTab
          clusters={findingClusters}
          filter={severityFilter}
          onFilter={setSeverityFilter}
          diagnosis={currentDiagnosis}
          action={nextAction}
          wide={wide}
          onOpenPart={openPart}
        />
      )
    ) : tab === 'advance' ? (
      <AdvanceDiagnosisTab parts={partViews} selectedPart={selectedPart} onSelectPart={setSelectedPart} wide={wide} />
    ) : (
      <SignalTab
        signals={signalViews}
        unconsumed={unconsumed}
        connectionByPoint={connectionByLabel}
        devices={devices}
        cards={cards}
        live={live}
        wide={wide}
        onOpenPart={openPart}
        filter={signalFilter}
        query={signalQuery}
        provenance={`Single-screw extruder model ${analysis.modelVersion} · recipe ${detail.recipeId} · ${thresholdRegister.length} registered thresholds (${fieldCalibratedCount} field-calibrated) · ${resolvedCount}/${totalTags} diagnostic tags resolved from ${mappedChannels.length} mapped point${mappedChannels.length === 1 ? '' : 's'} · ${connectivitySummary.connected}/${connectivitySummary.total} points live across ${connectivitySummary.gateways} gateway${connectivitySummary.gateways === 1 ? '' : 's'}`}
      />
    );

  return (
    <View className="min-h-0 flex-1" style={{ backgroundColor: palette.bg }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 14, paddingBottom: 32, gap: 12 }}
      >
        <StatusBand
          statusWord={verdictStatusWord}
          statusSeverity={verdictSeverity}
          statusContext={humanise(detail.inferredMachineState)}
          statusChip={currentDiagnosis?.affectedPart}
          verdictLine={verdictLine}
          sourceLabel={sourceLabel}
          sourceVariant={sourceVariant}
          scenarioLabel={scenarioRun ? scenarioRun.scenario.id : 'Scenarios'}
          scenarioActive={Boolean(scenarioRun)}
          onToggleLibrary={() => setLibraryOpen((previous) => !previous)}
          onReturnToLive={() => setScenarioId(null)}
          counts={counts}
          shares={severityShares}
          filter={severityFilter}
          onFilter={(severity) => {
            setSeverityFilter(severity);
            setTab('diagnosis');
          }}
          notice={notice}
          wide={wide}
        />

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
                  ? `Running ${scenarioRun.scenario.id} · ${scenarioRun.scenario.name}. Live data is not being analysed.`
                  : 'Verified diagnostic cases from the digital twin. Selecting one drives this same pipeline with that condition instead of live measurements.'}
              </Body>
            </CardHeader>
            <Separator />
            <ScenarioPicker activeId={scenarioId} onSelect={setScenarioId} />
          </Card>
        ) : null}

        {/* A running scenario invalidates every number below it, on every
            screen, so it is the one banner that is not scoped to a tab. */}
        {scenarioRun ? (
          <Alert
            variant={scenarioRun.verdict === 'PASS' ? 'success' : scenarioRun.verdict === 'NOT_REPRODUCIBLE' ? 'muted' : 'destructive'}
            title={`${scenarioRun.scenario.id} · ${scenarioRun.scenario.name} · ${scenarioRun.verdict === 'NOT_REPRODUCIBLE' ? 'not reproducible here' : scenarioRun.verdict.toLowerCase()}`}
          >
            <View className="gap-1.5">
              <Body muted>{scenarioRun.rationale}</Body>
              <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
                <KeyValue label="Injected" value={scenarioRun.expectedFaultIds.join(', ') || 'nothing'} />
                <KeyValue label="Reported" value={scenarioRun.actualFaultIds.join(', ') || 'nothing'} />
                <KeyValue label="Acceptance" value={scenarioRun.scenario.acceptance} />
              </View>
            </View>
          </Alert>
        ) : null}

        {/* Scoped to Diagnosis. The other two screens already say this per row
            and per part, so repeating it as a banner there was the same fact
            three times over. */}
        {tab === 'diagnosis' && !scenarioRun && dataMode !== 'gateway' ? (
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

        {/* One column, full width, and one card. The band above answers "how is
            this machine"; this answers "show me", and the tab bar is the only
            navigation between the four ways of being shown. */}
        <View
          className="overflow-hidden rounded-2xl border"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <View
            className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3.5 py-2.5"
            style={{ borderBottomWidth: 1, borderBottomColor: palette.line }}
          >
            <Tabs items={tabs} value={tab} onChange={setTab} />
            {toolbar}
          </View>

          {screen}
        </View>
      </ScrollView>
    </View>
  );
}
