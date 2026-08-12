import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  allThresholds,
  analyzeExtruder,
  appendHistory,
  ALL_TAGS,
  CANONICAL_UNITS,
  faultName,
  resolveSignal,
  SCENARIO_POINT_LABELS,
  runScenario,
  scenarioById,
  SCENARIOS,
  TAG_LABELS,
  type ConstraintCheck,
  type ExtruderAnalysisResult,
  type ExtruderInputReading,
  type ExtruderTag,
  type FaultAssessmentRecord,
  type ResolvedSignal,
  type Scenario,
} from '../../../lib/analysis/extruder';
import type { SignalQuality } from '../../../lib/analysis/types';
import type { DeviceNode } from '../../../lib/devices';
import { latestMeasurementForChannel, type LiveState } from '../../../lib/liveTelemetry';
import { configuredHealthyValue, type CardNode } from '../../../lib/rack';
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
import type { MappedChannel } from './RackOccupancyView';

/**
 * Healthy operating point for the pilot extruder.
 *
 * These are NOT numbers chosen here. They are read straight off the twin's own
 * verified healthy-nominal case (`SCN-N-001`), which carries the complete
 * eleven-tag vector for a machine running correctly on recipe RD-001. Keeping a
 * second table in this file would be a second source of truth that could drift
 * away from the one the analyzer actually compares against.
 *
 * The generic V/T/S/P/C demo bands used elsewhere in the console are plausible
 * for a pump, not an extruder — a 45-82 degC "temperature" would read as three
 * simultaneously failed barrel heaters against the controlled 180/210/220 degC
 * setpoints — so they are deliberately not used here.
 */
const HEALTHY_OPERATING_POINT: Partial<Record<ExtruderTag, number>> = (() => {
  const healthy = scenarioById('SCN-N-001');
  if (!healthy) return {};
  const out: Partial<Record<ExtruderTag, number>> = {};
  for (const [tag, value] of Object.entries(healthy.measurements) as [ExtruderTag, number | null][]) {
    if (value !== null && Number.isFinite(value)) out[tag] = value;
  }
  return out;
})();

const DEMO_TICK_MS = 1500;

/** Dispersion applied to a synthesised reading: 0.2% of value, so it is visible but never a fault. */
const SYNTHETIC_JITTER_FRACTION = 0.002;

function jitterFor(value: number): number {
  return Math.max(Math.abs(value) * SYNTHETIC_JITTER_FRACTION, 1e-4);
}

/**
 * A slow walk around each tag's healthy value, used only where no measurement
 * exists. Movement is not decoration: without it the temporal features (trend,
 * dispersion, repetition) never accumulate, and the rules that separate heater
 * failure from heater degradation could never be demonstrated.
 */
function useSyntheticOperatingPoint(centres: Partial<Record<ExtruderTag, number>>): Record<string, number> {
  const centreKey = JSON.stringify(centres);
  const [values, setValues] = useState<Record<string, number>>(() => ({ ...centres }) as Record<string, number>);

  useEffect(() => {
    setValues({ ...(JSON.parse(centreKey) as Record<string, number>) });
  }, [centreKey]);

  useEffect(() => {
    const targets = JSON.parse(centreKey) as Record<string, number>;
    const id = setInterval(() => {
      setValues((previous) => {
        const next: Record<string, number> = {};
        for (const [tag, centre] of Object.entries(targets)) {
          if (!Number.isFinite(centre)) continue;
          const spread = jitterFor(centre);
          const drifted = (previous[tag] ?? centre) + (Math.random() - 0.5) * spread;
          // Pull back toward the healthy value so the walk can never wander into
          // a fault band and invent a diagnosis out of nothing.
          next[tag] = Math.min(centre + spread * 2, Math.max(centre - spread * 2, drifted));
        }
        return next;
      });
    }, DEMO_TICK_MS);
    return () => clearInterval(id);
  }, [centreKey]);

  return values;
}

function channelNumber(channelId: string): number {
  const match = channelId.match(/\.CH(\d+)$/);
  return match ? Number(match[1]) : 1;
}

/** A mapped point, plus the card-level alarm state the analyzer deliberately ignores. */
type PointInput = {
  reading: ExtruderInputReading;
  /** The channel's own commissioning alarm state — NOT a model finding. */
  alarm: 'none' | 'warning' | 'critical';
  alarmLimit: number | null;
  observed: number | null;
  channelUnit: string;
  reporting: boolean;
};

/**
 * Where the numbers on screen came from.
 *
 * `template` is the un-commissioned machine: nothing is mapped yet, so the full
 * pilot tag set is synthesised at its controlled operating point. That keeps the
 * whole analysis layer explorable — and the scenario library usable — before a
 * single channel exists, which is what it is for.
 */
type DataMode = 'gateway' | 'demo' | 'mixed' | 'template';

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
 * measuring — the single worst failure this model can have, and the exact
 * reason the twin reports a missing input as NOT_EVALUATED instead of
 * defaulting it.
 *
 * The simulated operating point is therefore used only when NOTHING is
 * reporting, i.e. the view is being previewed with no gateway attached at all.
 * That state is announced in the header rather than left to be inferred.
 */
function buildPoints(
  mappedChannels: MappedChannel[],
  devices: DeviceNode[],
  cards: CardNode[],
  live: LiveState | undefined,
  synthetic: Record<string, number>,
  now: string,
): { points: PointInput[]; mode: DataMode } {
  // Nothing mapped at all: stand the machine up as a template at its controlled
  // operating point, so the layer can be explored, demonstrated and driven with
  // scenarios before commissioning. Every reading is flagged simulated.
  if (mappedChannels.length === 0) {
    const points = ALL_TAGS.map((tag) => ({
      reading: {
        label: SCENARIO_POINT_LABELS[tag],
        value: synthetic[tag] ?? null,
        unit: CANONICAL_UNITS[tag],
        quality: 'GOOD',
        valid: true,
        timestamp: now,
        source: 'demo' as const,
      },
      alarm: 'none' as const,
      alarmLimit: null,
      observed: synthetic[tag] ?? null,
      channelUnit: CANONICAL_UNITS[tag],
      reporting: false,
    }));
    return { points, mode: 'template' as const };
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
    const value =
      measurement && measurement.value !== null && measurement.value !== undefined ? measurement.value : null;
    return { mapped, label, measurement, value };
  });

  const reportingCount = measured.filter((entry) => entry.value !== null).length;
  // Nothing anywhere is reporting: this is a dashboard preview, not a machine.
  const previewing = reportingCount === 0;

  const points = measured.map(({ mapped, label, measurement, value }) => {
    if (previewing) {
      const resolution = resolveSignal(label);
      const tag = resolution.kind === 'mapped' ? resolution.tag : null;
      // Prefer what the CHANNEL itself declares over anything this view knows.
      // A card carries its own engineering range and normal band, and that is
      // the commissioning engineer's statement of what healthy reads like on
      // this instrument — more authoritative here than a generic reference.
      // Only when the card declares no range at all do we fall back to the
      // twin's verified healthy vector.
      const card = cards.find(
        (candidate) => candidate.deviceId === mapped.channel.rackId && candidate.slot === mapped.channel.slot,
      );
      const fromChannel = card ? configuredHealthyValue(card) : null;
      const simulated = fromChannel ?? (tag ? (synthetic[tag] ?? null) : null);
      return {
        reading: {
          label,
          value: simulated,
          // A channel-derived value carries the channel's own unit; the fallback
          // is already in the tag's canonical unit.
          unit: fromChannel !== null ? mapped.channel.unit : tag ? CANONICAL_UNITS[tag] : mapped.channel.unit,
          quality: 'GOOD',
          valid: true,
          timestamp: now,
          source: 'demo' as const,
        },
        ...alarmStateFor(mapped.channel, simulated),
        observed: simulated,
        channelUnit: mapped.channel.unit,
        reporting: false,
      };
    }

    return {
      reading: {
        label,
        value,
        unit: measurement?.unit || mapped.channel.unit,
        quality: measurement?.quality ?? 'GOOD',
        valid: measurement?.measurementValid ?? true,
        timestamp: measurement?.updatedAt ?? now,
        source: 'gateway' as const,
      },
      ...alarmStateFor(mapped.channel, value),
      observed: value,
      channelUnit: mapped.channel.unit,
      reporting: value !== null,
    };
  });

  const mode: DataMode = previewing ? 'demo' : reportingCount === points.length ? 'gateway' : 'mixed';
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

/**
 * Scenario picker — the twin's 61 verified diagnostic cases.
 *
 * Grouped by the same checklist sections the twin's own manual test matrix uses,
 * so a case number here and a case number in its documentation are the same
 * thing. Cases the console cannot reproduce are listed with the reason rather
 * than hidden: "this needs a raw waveform" is information, and silently omitting
 * 14 of 61 would misrepresent what the model covers.
 */
function ScenarioPicker({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
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
            placeholder="Filter by id, name or fault code…"
            placeholderTextColor={palette.inkFaint}
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

      {grouped.length === 0 ? <Body muted>No scenario matches “{query}”.</Body> : null}

      {grouped.map(([letter, section]) => (
        <View key={letter} className="gap-1.5">
          <SectionLabel>
            {letter} · {section.title}
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
                <Text
                  className="font-mono text-[10.5px]"
                  style={{ color: palette.ink, minWidth: 168 }}
                  numberOfLines={1}
                >
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
  const synthetic = useSyntheticOperatingPoint(HEALTHY_OPERATING_POINT);
  const [tab, setTab] = useState<TabKey>('diagnosis');
  const [scenarioId, setScenarioId] = useState<string | null>(null);

  // The twin's pipeline keeps its own rolling history so temporal features —
  // trend, repetition and dispersion — become available after a few samples.
  // Without it, heater failure cannot be separated from heater degradation and
  // no instrumentation hypothesis can ever be raised.
  const historyRef = useRef<Partial<Record<ExtruderTag, (number | null)[]>>>({});

  const liveRun = useMemo(() => {
    const now = new Date().toISOString();
    const built = buildPoints(mappedChannels, devices, cards, live, synthetic, now);
    return {
      analysis: analyzeExtruder({
        readings: built.points.map((point) => point.reading),
        history: historyRef.current,
        now,
      }),
      points: built.points,
      dataMode: built.mode,
    };
  }, [mappedChannels, devices, cards, live, synthetic]);

  // Accumulate in an effect rather than inside the memo: mutating a ref during
  // render double-appends under StrictMode's double-invoke.
  useEffect(() => {
    historyRef.current = appendHistory(historyRef.current, liveRun.analysis);
  }, [liveRun]);

  // Scenario mode replaces the live vector wholesale. The pipeline is identical —
  // only the measurements differ — so what is on screen is the same analysis the
  // machine would produce if it were actually in that condition.
  const scenarioRun = useMemo(() => {
    const scenario = scenarioId ? scenarioById(scenarioId) : undefined;
    return scenario ? runScenario(scenario) : null;
  }, [scenarioId]);

  const analysis = scenarioRun ? scenarioRun.analysis : liveRun.analysis;
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

      {/* Say plainly where the numbers come from. A template machine that reads
          healthy must never be mistaken for a real one that reads healthy. */}
      {!scenarioRun && dataMode !== 'gateway' && (
        <Alert
          variant="info"
          icon="flask-outline"
          title={
            dataMode === 'template'
              ? 'Template preview — no channels mapped yet'
              : dataMode === 'demo'
                ? 'Simulated data — no channel is reporting'
                : 'Partly simulated — some mapped channels are not reporting'
          }
        >
          {dataMode === 'template'
            ? `All ${ALL_TAGS.length} pilot tags are standing at their controlled operating point so the layer can be explored before commissioning. Map boxes to rack channels and save the canvas to analyse real data, or pick a case from the scenario library below to drive a specific condition.`
            : 'These readings are generated at the machine’s controlled reference, not measured. Every one is marked “Simulated” in the Signals tab.'}
        </Alert>
      )}

      {/* --- scenario library ------------------------------------------------ */}
      <Collapsible
        title="Fault scenario library"
        icon="flask-outline"
        count={SCENARIOS.length}
        variant={scenarioRun ? 'warning' : undefined}
        defaultOpen={false}
        summary={
          scenarioRun
            ? `Running ${scenarioRun.scenario.id} — ${scenarioRun.scenario.name}. Live data is not being analysed.`
            : `${SCENARIOS.length} verified diagnostic cases from the digital twin. Select one to drive the analyzer with that condition; ${SCENARIOS.filter((s) => !s.unsupported).length} are reproducible here.`
        }
      >
        <ScenarioPicker activeId={scenarioId} onSelect={setScenarioId} />
      </Collapsible>

      {scenarioRun && (
        <Alert
          variant={
            scenarioRun.verdict === 'PASS'
              ? 'success'
              : scenarioRun.verdict === 'NOT_REPRODUCIBLE'
                ? 'muted'
                : 'destructive'
          }
          title={`${scenarioRun.scenario.id} · ${scenarioRun.scenario.name} — ${scenarioRun.verdict === 'NOT_REPRODUCIBLE' ? 'not reproducible here' : scenarioRun.verdict.toLowerCase()}`}
        >
          <View className="gap-1.5">
            <Body muted>{scenarioRun.rationale}</Body>
            <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
              <KeyValue
                label="Injected"
                value={scenarioRun.expectedFaultIds.join(', ') || 'nothing'}
              />
              <KeyValue
                label="Reported"
                value={scenarioRun.actualFaultIds.join(', ') || 'nothing'}
              />
              <KeyValue label="Acceptance" value={scenarioRun.scenario.acceptance} />
              {scenarioRun.scenario.severity !== null ? (
                <KeyValue label="Severity" value={String(scenarioRun.scenario.severity)} />
              ) : null}
            </View>
            <Body muted>
              The request carried measurements only — no scenario id, fault id or expected result reached the
              detector. The comparison above scores a diagnosis that had already finished.
            </Body>
          </View>
        </Alert>
      )}

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
