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
  type TabItem,
  type Variant,
} from '../../ui';
import { AdvanceDiagnosisTab } from './analyzer/AdvanceDiagnosisTab';
import { AnalyzerHeader, type HeaderFact } from './analyzer/AnalyzerHeader';
import { Block, FilterChips, SearchField } from './analyzer/AnalyzerParts';
import {
  ATTENTION_FILTERS,
  ConclusionTab,
  filterAttention,
  type AttentionFilter,
  type AttentionItem,
  type CurrentDiagnosis,
} from './analyzer/ConclusionTab';
import { InstrumentRail, type InstrumentRow } from './analyzer/InstrumentRail';
import { signalFilterCounts, SIGNAL_FILTERS, SignalTab, type SignalFilter } from './analyzer/SignalTab';
import { StatTiles, type StatTile } from './analyzer/StatTiles';
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

/**
 * Three screens, three questions.
 *
 * Diagnosis: what is wrong. Advance Diagnosis: why, and where on the machine.
 * Signal: what the sensors read and whether they are inside their limits.
 *
 * What used to be six tabs collapsed into these. Evidence was never really a
 * subject of its own — it is the reasoning behind a conclusion and belongs
 * beside it. Limits answered half of the Signal question and is now the other
 * half of that table. Model and Connectivity were provenance, and provenance
 * belongs where the number it qualifies is shown, not on a page of its own.
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
  // null = the Advance Diagnosis entry screen (all parts). Held here rather than
  // inside the tab so that following a finding from Diagnosis or a signal from
  // the Signal table lands on the right part, not on the part picker.
  const [selectedPart, setSelectedPart] = useState<MachinePart | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  // Which kinds of finding the Diagnosis list is showing. Held in the shell
  // because the control that drives it lives in the shell's toolbar row, beside
  // the tabs, rather than inside the screen it filters.
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>('all');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('all');
  const [signalQuery, setSignalQuery] = useState('');
  // The standing integrity caveat is dismissible per session: it is a condition
  // of the reading, not an event, so once acknowledged it should not keep
  // re-claiming the top of the screen on every re-render.
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  // When this analysis session began, for the header's elapsed fact. A ref so
  // it survives re-renders without becoming a dependency of anything.
  const sessionStart = useRef(Date.now()).current;
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
  const verdictVariant: Variant = liveDataUnavailable
    ? 'muted'
    : violations.length > 0
      ? 'destructive'
      : hasCandidates
        ? (SEVERITY_VARIANT[analysis.anomaly.severity] ?? 'warning')
        : detail.faultCategory === 'INSUFFICIENT_DIAGNOSTIC_EVIDENCE'
          ? 'info'
          : 'success';
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
  // Everything raised on this machine, in one list, worst first. The three kinds
  // come from the three things the pipeline actually raises, and stay distinct:
  // a fault is a root-cause inference, not the rung above an alarm.
  const attentionItems = useMemo<AttentionItem[]>(() => {
    const alarms: AttentionItem[] = violations.map((check) => ({
      key: `alarm-${check.constraintId}`,
      kind: 'ALARM',
      message: `${check.name} is past its hard process limit`,
      reference: `${check.constraintId} · ${check.operator} ${check.limit} ${check.unit}`,
      part: partsForConstraint(check.constraintId)[0] ?? null,
    }));
    const warnings: AttentionItem[] = detail.triggeredThresholds.map((threshold) => ({
      key: `warning-${threshold.thresholdId}-${threshold.sensor}`,
      kind: 'WARNING',
      message: `${TAG_LABELS[threshold.sensor as ExtruderTag] ?? threshold.sensor} crossed a registered boundary`,
      reference: `${threshold.thresholdId} · ${threshold.feature}`,
      part: threshold.sensor in TAG_LABELS ? partForTag(threshold.sensor as ExtruderTag) : null,
    }));
    return [...alarms, ...warnings];
  }, [detail.triggeredThresholds, violations]);

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
    ? { priority: humanise(analysis.maintenance.priority), steps: analysis.maintenance.recommendedActions }
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
      count: attentionItems.length,
      countVariant: verdictVariant,
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
      label: 'Signal',
      icon: 'access-point',
      count: signalsOutsideLimits,
      countVariant: signalsOutsideLimits > 0 ? 'warning' : 'muted',
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
  // Two breakpoints, and only two. `wide` is where a screen may split into two
  // readable columns; `hasRail` is where the instrument rail still leaves the
  // analysis a full-width column beside it rather than a gutter.
  const wide = width >= 1120;
  const hasRail = width >= 1400;
  const RAIL_WIDTH = 344;

  // --- shell furniture -------------------------------------------------------
  const headerFacts: HeaderFact[] = [
    ...(machineId ? [{ label: 'Machine', value: machineId }] : []),
    { label: 'Model', value: `Single-screw extruder ${analysis.modelVersion}` },
    { label: 'Recipe', value: detail.recipeId },
    { label: 'State', value: humanise(detail.inferredMachineState), variant: stateVariant(detail.inferredMachineState) },
    {
      label: 'Gateways',
      value: `${connectivitySummary.gateways} · ${connectivitySummary.connected}/${connectivitySummary.total} live`,
      variant:
        connectivitySummary.connected === connectivitySummary.total && connectivitySummary.total > 0
          ? 'success'
          : 'warning',
    },
    { label: 'Tags', value: `${resolvedCount}/${totalTags} resolved`, variant: readinessVariant(analysis.readiness.score) },
  ];

  const sessionLabel = useMemo(() => {
    const minutes = Math.max(0, Math.round((Date.now() - sessionStart) / 60000));
    const started = new Date(sessionStart);
    const clock = `${String(started.getHours()).padStart(2, '0')}:${String(started.getMinutes()).padStart(2, '0')}`;
    const elapsed = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} m` : `${minutes} m`;
    return `${elapsed} · since ${clock}`;
  }, [analysis.generatedAt, sessionStart]);

  // The four numbers that describe the machine, not the screen. They stay above
  // the tab bar so the answer to "how is this machine" does not change shape
  // when the reader moves between Diagnosis, Advance Diagnosis and Signal.
  const tiles: StatTile[] = [
    {
      key: 'status',
      label: 'Machine status',
      value: verdictStatusWord,
      detail: `${humanise(detail.inferredMachineState)} · ${humanise(detail.identifiability)}`,
      variant: verdictVariant,
      filled: true,
    },
    {
      key: 'warnings',
      label: 'Warnings',
      value: String(detail.triggeredThresholds.length),
      detail: 'Registered boundaries crossed',
      variant: detail.triggeredThresholds.length > 0 ? 'warning' : 'success',
      history: keyChanges[0] ? signalViews.find((signal) => signal.tag === keyChanges[0].tag)?.history : undefined,
    },
    {
      key: 'alarms',
      label: 'Alarms',
      value: String(violations.length),
      detail: 'Hard process limits exceeded',
      variant: violations.length > 0 ? 'destructive' : 'success',
    },
    {
      key: 'faults',
      label: 'Detected problems',
      value: String(candidateAssessments.length),
      detail: 'Matched fault signatures',
      variant: candidateAssessments.length > 0 ? 'destructive' : 'success',
      note: candidateAssessments.length > 0 ? humanise(detail.faultLayer).replace('_', ' ') : undefined,
    },
  ];

  const instrumentRows: InstrumentRow[] = useMemo(
    () =>
      signalViews
        .filter((signal) => !signal.missing)
        .map((signal) => {
          const frozen = signal.qualityNotes.some((note) => note.toLowerCase().includes('frozen'));
          const variant: Variant =
            signal.status === 'ALARM'
              ? 'destructive'
              : signal.status === 'WARNING' || signal.quality === 'DEGRADED'
                ? 'warning'
                : signal.value === null
                  ? 'muted'
                  : 'success';
          return {
            key: `${signal.tag}-${signal.point}`,
            tag: signal.tag,
            name: signal.measures,
            value: signal.value,
            unit: signal.unit,
            variant,
            flag: frozen ? 'flatline' : signal.value === null ? 'no reading' : undefined,
            history: signal.history,
          } satisfies InstrumentRow;
        }),
    [signalViews],
  );
  const goodInstruments = instrumentRows.filter((row) => row.variant === 'success').length;

  // The integrity layer's standing caveat. It qualifies the facts it sits under,
  // so it renders inside the header card rather than as one more banner pushing
  // the whole screen down.
  const notice =
    layerNote && !noticeDismissed
      ? {
          title: layerNote.title,
          detail: layerNote.detail,
          variant: layerNote.variant,
          actionLabel: 'Verify sensor',
          onAction: () => setTab('signal'),
          onDismiss: () => setNoticeDismissed(true),
        }
      : null;

  const visibleAttention = filterAttention(attentionItems, attentionFilter);
  const signalCounts = useMemo(() => signalFilterCounts(signalViews), [signalViews]);

  /**
   * The toolbar that shares the tab row.
   *
   * One row, one place for a screen's controls. Diagnosis filters its findings;
   * Signal searches and filters its table; Advance Diagnosis navigates by part
   * chips inside its own body, because those carry a state dot each and are
   * navigation rather than a filter.
   */
  const toolbar =
    tab === 'diagnosis' ? (
      <FilterChips
        label="Filter findings"
        value={attentionFilter}
        onChange={setAttentionFilter}
        options={ATTENTION_FILTERS.map((entry) => ({
          value: entry.value,
          label: entry.label,
          count:
            entry.kind === null ? attentionItems.length : attentionItems.filter((item) => item.kind === entry.kind).length,
          variant: entry.kind === 'WARNING' ? ('warning' as const) : entry.kind === null ? undefined : ('destructive' as const),
        }))}
      />
    ) : tab === 'signal' ? (
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
          attention={visibleAttention}
          attentionTotal={attentionItems.length}
          changes={keyChanges}
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
        wide={wide}
        onOpenPart={openPart}
        filter={signalFilter}
        query={signalQuery}
        provenance={`Single-screw extruder model ${analysis.modelVersion} · recipe ${detail.recipeId} · ${thresholdRegister.length} registered thresholds (${fieldCalibratedCount} field-calibrated) · ${resolvedCount}/${totalTags} diagnostic tags resolved from ${mappedChannels.length} mapped point${mappedChannels.length === 1 ? '' : 's'}`}
      />
    );

  return (
    <View className="min-h-0 flex-1" style={{ backgroundColor: palette.bg }}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 14, gap: 12 }}>
        <AnalyzerHeader
          facts={headerFacts}
          session={sessionLabel}
          sourceLabel={sourceLabel}
          sourceVariant={sourceVariant}
          scenarioLabel={scenarioRun ? scenarioRun.scenario.id : 'Scenarios'}
          scenarioActive={Boolean(scenarioRun)}
          onToggleLibrary={() => setLibraryOpen((previous) => !previous)}
          onReturnToLive={() => setScenarioId(null)}
          notice={notice}
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

        {/* The workspace: analysis left, the instruments it was read off right.
            The rail is not the Signal screen in miniature - it carries no
            limits and no status column - so the two never print one fact
            twice. */}
        <View className={cn(hasRail && 'flex-row items-start')} style={{ gap: 12 }}>
          <View className="min-w-0 flex-1" style={{ gap: 12 }}>
            <StatTiles tiles={tiles} wide={wide} />

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
          </View>

          {hasRail ? (
            <View style={{ width: RAIL_WIDTH, position: 'sticky', top: 14, alignSelf: 'flex-start' } as never}>
              <InstrumentRail
                rows={instrumentRows}
                missing={detail.missingTags.length}
                goodCount={goodInstruments}
                updatedLabel={instrumentRows.length > 0 ? relativeAge(analysis.generatedAt) : 'never'}
                onOpenSignals={() => setTab('signal')}
                maxHeight={520}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
