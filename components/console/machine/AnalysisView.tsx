import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { EmptyState } from '../EmptyState';
import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  analyzeRotaryAirlock,
  type AnalysisReading,
  type AnalysisSignalCode,
  type DiagnosisCandidate,
  type RotaryAirlockAnalysisResult,
} from '../../../lib/analysis/rotaryAirlockAnalyzer';
import { cn } from '../../../lib/cn';
import { deviceWithGatewayConnectionState, type DeviceNode } from '../../../lib/devices';
import { latestMeasurementForChannel, type LiveState } from '../../../lib/liveTelemetry';
import type { CardNode } from '../../../lib/rack';
import { apiFetch } from '../../../src/lib/apiClient';
import { ExtruderAnalysisView } from './ExtruderAnalysisView';
import {
  Badge,
  Body,
  Card,
  CardHeader,
  CardTitle,
  Cell,
  Collapsible,
  consolePalette,
  DataTable,
  Separator,
  StatTile,
  StatusDot,
  Tabs,
  VerdictBanner,
  type TabItem,
  type Variant,
} from '../../ui';
import {
  BulletList,
  DeepAnalyzerPanel,
  Panel,
  SectionTitle,
  StatusPanel,
  Tone,
  TONE_COLOUR,
  type IconName,
} from './MachineOverview';
import { LIVE_RANGE_FOR_LETTER, type LiveKindLetter } from './liveValue';
import type { MappedChannel } from './RackOccupancyView';

const LABEL_TO_SIGNAL: { match: RegExp; code: AnalysisSignalCode }[] = [
  { match: /motor.*current|current/i, code: 'motor_current' },
  { match: /rotor.*speed|speed|rpm/i, code: 'rotor_speed' },
  { match: /de.*bearing.*temp|drive.*bearing.*temp/i, code: 'de_bearing_temperature' },
  { match: /nde.*bearing.*temp|non.*drive.*bearing.*temp/i, code: 'nde_bearing_temperature' },
  { match: /de.*vib|drive.*vib/i, code: 'de_vibration_acceleration_rms' },
  { match: /nde.*vib|non.*drive.*vib/i, code: 'nde_vibration_acceleration_rms' },
  { match: /inlet.*pressure/i, code: 'inlet_pressure' },
  { match: /outlet.*pressure|discharge.*pressure/i, code: 'outlet_pressure' },
  { match: /material.*temp/i, code: 'material_temperature' },
];

function signalCodeFor(label: string): AnalysisSignalCode | null {
  return LABEL_TO_SIGNAL.find((entry) => entry.match.test(label))?.code ?? null;
}

function channelNumber(channelId: string): number {
  const match = channelId.match(/\.CH(\d+)$/);
  return match ? Number(match[1]) : 1;
}

type AnalysisBundle = {
  latest: RotaryAirlockAnalysisResult | null;
  snapshots: unknown[];
  episodes: unknown[];
  cases: MaintenanceCase[];
  overview: unknown[];
};

type MaintenanceCase = {
  id: number;
  snapshot_id?: number | null;
  title: string;
  priority: string;
  status: string;
  recommended_actions?: string[];
  verification_steps?: string[];
  similar_case_signals?: string[];
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
};

type AnomalyEpisode = {
  id: number;
  state: string;
  severity: string;
  score: number;
  contributors?: { code: string; description: string; score: number; direction: string }[];
  started_at?: string;
  last_seen_at?: string;
  resolved_at?: string | null;
};

type RotaryAnalysisTab = 'diagnosis' | 'evidence' | 'signals' | 'cases';
type RotarySignalRow = {
  id: string;
  label: string;
  code: string;
  value: string;
  status: 'Live' | 'No current reading' | 'Not consumed';
};

export type AnalysisViewProps = {
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  machineId?: string;
  machineTemplate?: string;
  expectedPoints?: number;
};

// `useDemoValues` used to fabricate one value per measurement letter and feed it
// to the diagnosis engine whenever a channel had no real reading — so the
// analyser could report a confident diagnosis about a plant it had no data from.
// It is gone: a channel without a measurement now contributes nothing at all.

function buildReadings(
  mappedChannels: MappedChannel[],
  devices: DeviceNode[],
  cards: CardNode[],
  live: LiveState | undefined,
): AnalysisReading[] {
  const now = new Date().toISOString();
  return mappedChannels.flatMap((mapped) => {
    const code = signalCodeFor(`${mapped.label} ${mapped.channel.label}`);
    if (!code) return [];

    const rack = devices.find((d) => d.id === mapped.channel.rackId);
    const card = cards.find((c) => c.deviceId === mapped.channel.rackId && c.slot === mapped.channel.slot);

    let value: number | null = null;
    let unit = mapped.channel.unit;
    let quality = 'GOOD';
    let valid = true;
    let timestamp = now;
    let source: AnalysisReading['source'] = 'gateway';

    if (rack && card && live) {
      const measurement = latestMeasurementForChannel(deviceWithGatewayConnectionState(rack, devices), card, channelNumber(mapped.channel.id), live);
      if (measurement && measurement.value !== null && measurement.value !== undefined) {
        value = measurement.value;
        unit = measurement.unit ?? unit;
        quality = measurement.quality ?? quality;
        valid = measurement.measurementValid ?? valid;
        timestamp = measurement.updatedAt ?? now;
        source = 'gateway';
      }
    }

    // No measurement means no reading. Substituting a plausible number here
    // would let the analyser produce a diagnosis — with a confidence score —
    // about a channel that has never reported. An analysis over fewer real
    // signals is correct; an analysis over invented ones is not.
    if (value === null || value === undefined) return [];

    return [
      {
        code,
        value,
        unit,
        quality,
        valid,
        timestamp,
        source,
      },
    ];
  });
}

function urgencyTone(urgency: DiagnosisCandidate['urgency']): Tone {
  if (urgency === 'urgent' || urgency === 'inspect_promptly') return 'critical';
  if (urgency === 'inspect_soon') return 'warning';
  return 'info';
}

function priorityTone(priority: RotaryAirlockAnalysisResult['maintenance']['priority']): Tone {
  if (priority === 'critical' || priority === 'high') return 'critical';
  if (priority === 'medium' || priority === 'low') return 'warning';
  return 'live';
}

function stateTone(state: RotaryAirlockAnalysisResult['operatingState']['state']): Tone {
  if (state === 'motor_running_rotor_stopped' || state === 'unexpectedly_stopped') return 'critical';
  if (state === 'unstable' || state === 'starting' || state === 'stopping') return 'warning';
  if (state === 'running_normal_load' || state === 'running_high_load' || state === 'running_no_load') return 'live';
  return 'info';
}

function readinessTone(score: number): Tone {
  if (score >= 80) return 'live';
  if (score >= 50) return 'info';
  return 'warning';
}

function toneVariant(tone: Tone): Variant {
  if (tone === 'critical') return 'destructive';
  if (tone === 'warning') return 'warning';
  if (tone === 'live') return 'success';
  return 'info';
}

function formatUrgency(urgency: DiagnosisCandidate['urgency']): string {
  const map: Record<DiagnosisCandidate['urgency'], string> = {
    monitor: 'Monitor',
    inspect_soon: 'Inspect soon',
    inspect_promptly: 'Inspect promptly',
    urgent: 'Urgent',
  };
  return map[urgency] ?? urgency;
}

function DiagnosisCard({ diagnosis }: { diagnosis: DiagnosisCandidate }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const tone = urgencyTone(diagnosis.urgency);
  const colour = TONE_COLOUR[tone];

  return (
    <Panel className="gap-3" style={{ borderLeftWidth: 3, borderLeftColor: colour }}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className={cn('font-body-bold text-lg tracking-[-0.02em]', textClass)}>{diagnosis.title}</Text>
        <Text style={{ color: colour }} className="font-mono text-[11.5px] uppercase tracking-[0.16em]">
          {formatUrgency(diagnosis.urgency)} · {Math.round(diagnosis.confidence * 100)}%
        </Text>
      </View>
      {diagnosis.supporting.length > 0 && (
        <View className="gap-1">
          <Text className={cn('font-body-medium text-[12.5px] uppercase tracking-wider', mutedClass)}>Supporting evidence</Text>
          {diagnosis.supporting.map((item) => (
            <Text key={item} className={cn('font-body text-xs leading-4', textClass)}>
              - {item}
            </Text>
          ))}
        </View>
      )}
      {diagnosis.contradicting.length > 0 && (
        <View className="gap-1">
          <Text className={cn('font-body-medium text-[12.5px] uppercase tracking-wider', mutedClass)}>Contradictions</Text>
          {diagnosis.contradicting.map((item) => (
            <Text key={item} className={cn('font-body text-xs leading-4', mutedClass)}>
              - {item}
            </Text>
          ))}
        </View>
      )}
      {diagnosis.immediateAction && (
        <View className="gap-1">
          <Text className={cn('font-body-medium text-[12.5px] uppercase tracking-wider', mutedClass)}>Immediate action</Text>
          <Text className={cn('font-body text-xs leading-4', textClass)}>{diagnosis.immediateAction}</Text>
        </View>
      )}
      {diagnosis.inspection.length > 0 && (
        <View className="gap-1">
          <Text className={cn('font-body-medium text-[12.5px] uppercase tracking-wider', mutedClass)}>Inspection</Text>
          {diagnosis.inspection.map((item) => (
            <Text key={item} className={cn('font-body text-xs leading-4', textClass)}>
              - {item}
            </Text>
          ))}
        </View>
      )}
    </Panel>
  );
}

/**
 * Analysis tab, dispatched by machine template.
 *
 * Each template with a condition-monitoring model gets its own analyzer; both
 * produce a `MachineAnalysisResult`, so the shared panels (deep analyzer,
 * maintenance guidance) and the durable `analysis_*` tables are model-agnostic.
 */
export function AnalysisView(props: AnalysisViewProps) {
  const analyzer = ANALYZER_REGISTRY[props.machineTemplate ?? ''];
  if (analyzer === 'extruder') {
    return (
      <ExtruderAnalysisView
        mappedChannels={props.mappedChannels}
        devices={props.devices}
        cards={props.cards}
        live={props.live}
        expectedPoints={props.expectedPoints}
        machineId={props.machineId}
      />
    );
  }
  if (analyzer === 'rotary-airlock') return <RotaryAirlockAnalysisView {...props} />;
  return (
    <View className="flex-1 items-center justify-center px-6 py-10">
      <Card className="w-full max-w-2xl gap-3" accent="info">
        <Badge variant="info">Analyzer unavailable</Badge>
        <Text className="font-body-bold text-xl">No condition model for {props.machineTemplate || 'this template'}</Text>
        <Body muted>
          Analysis is only enabled when a template has a verified machine-specific model. Live readings remain available in Overview and Trends; no rotary-airlock conclusions are being substituted here.
        </Body>
      </Card>
    </View>
  );
}

const ANALYZER_REGISTRY: Record<string, 'rotary-airlock' | 'extruder'> = {
  'Rotary Airlock Valve': 'rotary-airlock',
  'Single Screw Extruder': 'extruder',
};

function RotaryAirlockAnalysisView({
  mappedChannels,
  devices,
  cards,
  live,
  machineId,
  expectedPoints,
}: AnalysisViewProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';

  const [analysisTab, setAnalysisTab] = useState<RotaryAnalysisTab>('diagnosis');
  const [bundle, setBundle] = useState<AnalysisBundle | null>(null);

  useEffect(() => {
    if (!machineId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch(`/api/analysis/machine/${encodeURIComponent(machineId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as AnalysisBundle;
        if (!cancelled) setBundle(data);
      } catch {
        // Server bundle is supplementary; local analysis still renders.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [machineId]);

  const analysis = useMemo<RotaryAirlockAnalysisResult>(() => {
    const readings = buildReadings(mappedChannels, devices, cards, live);
    return analyzeRotaryAirlock({ readings, now: new Date().toISOString() });
  }, [mappedChannels, devices, cards, live]);

  const signalRows = useMemo<RotarySignalRow[]>(() => {
    const readings = buildReadings(mappedChannels, devices, cards, live);
    return mappedChannels.map((mapped) => {
      const code = signalCodeFor(`${mapped.label} ${mapped.channel.label}`);
      const reading = code ? readings.find((candidate) => candidate.code === code) : undefined;
      return {
        id: mapped.id,
        label: mapped.label,
        code: code ?? 'UNMODELLED',
        value: reading ? `${reading.value} ${reading.unit}`.trim() : '—',
        status: code ? (reading ? 'Live' : 'No current reading') : 'Not consumed',
      };
    });
  }, [mappedChannels, devices, cards, live]);

  if (mappedChannels.length === 0) {
    return <EmptyState title="No mapped channels" description="Analysis needs saved rack mappings — link a box to a channel in Design mode, then save the canvas configuration." />;
  }

  const conditionTone: Tone =
    analysis.diagnoses.length > 0
      ? urgencyTone(analysis.diagnoses[0].urgency)
      : analysis.maintenance.caseRequired
        ? priorityTone(analysis.maintenance.priority)
        : 'live';
  const conditionLabel = analysis.diagnoses[0]?.title ?? analysis.maintenance.title ?? 'No dominant fault pattern';
  const conditionDetail =
    analysis.diagnoses[0]?.supporting[0] ??
    analysis.maintenance.recommendedActions[0] ??
    'Mapped evidence does not currently support a dominant diagnosis.';
  const verdictVariant = toneVariant(conditionTone);
  const tabs: TabItem<RotaryAnalysisTab>[] = [
    { value: 'diagnosis', label: 'Diagnosis', icon: 'stethoscope', count: analysis.diagnoses.length, countVariant: verdictVariant },
    { value: 'evidence', label: 'Evidence', icon: 'chart-timeline-variant', count: analysis.anomaly.contributors.length },
    { value: 'signals', label: 'Signals', icon: 'access-point', count: signalRows.filter((row) => row.status !== 'Live').length, countVariant: 'warning' },
    { value: 'cases', label: 'Cases / history', icon: 'clipboard-text-clock-outline', count: (bundle?.cases.length ?? 0) + (bundle?.episodes.length ?? 0) },
  ];

  const liveSignalCount = signalRows.filter((row) => row.status === 'Live').length;

  return (
    <View className="min-h-0 flex-1" style={{ backgroundColor: palette.bg }}>
      {/* Same chrome as the extruder analysis layer: identity and data source
          fixed above a scrolling body, so what the numbers came from is always
          on screen. */}
      <View
        className="gap-3 px-5 py-3 md:flex-row md:items-center md:justify-between"
        style={{ backgroundColor: palette.panel, borderBottomWidth: 1, borderBottomColor: palette.line }}
      >
        <View className="min-w-0 gap-1.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className={cn('font-body-bold text-[19px] tracking-[-0.025em]', textClass)}>Rotary airlock analysis</Text>
            <Badge variant="muted" icon="hand-back-right-outline">Advisory only</Badge>
          </View>
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge variant="muted" outline>Model {analysis.modelVersion}</Badge>
            <Badge variant={analysis.readiness.ready ? 'success' : 'warning'} outline>
              {mappedChannels.length}/{expectedPoints ?? mappedChannels.length} mapped
            </Badge>
            {machineId ? <Body mono muted>{machineId}</Body> : null}
          </View>
        </View>

        <View
          className="flex-row items-center gap-2 self-start rounded-lg border px-2.5 py-1.5"
          style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
        >
          <StatusDot variant={liveSignalCount > 0 ? 'success' : 'muted'} />
          <Text className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: palette.inkMuted }}>
            {liveSignalCount > 0 ? `${liveSignalCount} live signal${liveSignalCount === 1 ? '' : 's'}` : 'No live data'}
          </Text>
        </View>
      </View>

      <View className="px-5 py-2" style={{ backgroundColor: palette.panel, borderBottomWidth: 1, borderBottomColor: palette.line }}>
        <Tabs items={tabs} value={analysisTab} onChange={setAnalysisTab} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 56, alignItems: 'center' }}
      >
        <View className="w-full gap-4" style={{ maxWidth: 1280 }}>
      <VerdictBanner
        variant={verdictVariant}
        eyebrow="Current conclusion"
        title={conditionLabel}
        detail={conditionDetail}
        meta={<Badge variant={verdictVariant}>{Math.round((analysis.diagnoses[0]?.confidence ?? analysis.operatingState.confidence) * 100)}% confidence</Badge>}
      />

      <View className="flex-row flex-wrap gap-3">
        <StatTile
          className="min-w-[210px] flex-1"
          icon="check-decagram-outline"
          label="Readiness"
          value={analysis.readiness.ready ? 'Ready' : 'Not ready'}
          detail={analysis.readiness.limitations[0] ?? 'Mapped evidence is ready for live condition analysis.'}
          variant={toneVariant(readinessTone(analysis.readiness.score))}
          meter={analysis.readiness.score}
        />
        <StatTile
          className="min-w-[210px] flex-1"
          icon="engine-outline"
          label="Operating state"
          value={analysis.operatingState.state}
          detail={`${Math.round(analysis.operatingState.confidence * 100)}% confidence`}
          variant={toneVariant(stateTone(analysis.operatingState.state))}
        />
        <StatTile
          className="min-w-[210px] flex-1"
          icon="eye-outline"
          label="Dominant condition"
          value={conditionLabel}
          detail={conditionDetail}
          variant={verdictVariant}
        />
        <StatTile
          className="min-w-[210px] flex-1"
          icon="wrench-clock-outline"
          label="Maintenance priority"
          value={analysis.maintenance.priority}
          detail={analysis.maintenance.recommendedActions[0] ?? 'Continue routine monitoring.'}
          variant={toneVariant(priorityTone(analysis.maintenance.priority))}
        />
      </View>

      {/* Every section belongs to exactly one tab. Before this the page stacked
          the diagnoses, contributors, guidance and history under whichever tab
          was open, so switching tabs appeared to do almost nothing. */}
      {analysisTab === 'diagnosis' && (
        <View className="gap-3">
          <SectionTitle title="Diagnoses" />
          {analysis.diagnoses.length === 0 ? (
            <Panel>
              <Text className={cn('font-body text-xs leading-5', mutedClass)}>
                No probable blockage, rubbing, bearing, overload, or drive-slip pattern is strong enough yet. This is not a
                clearance; it only means the mapped live evidence does not currently support a dominant diagnosis.
              </Text>
            </Panel>
          ) : (
            analysis.diagnoses.map((diagnosis) => <DiagnosisCard key={diagnosis.code} diagnosis={diagnosis} />)
          )}

          {analysis.maintenance.caseRequired && (
            <>
              <SectionTitle title="Maintenance guidance" />
              <BulletList
                title="Recommended actions"
                items={analysis.maintenance.recommendedActions}
                tone={priorityTone(analysis.maintenance.priority)}
                emptyLabel="No actions defined."
              />
              {analysis.maintenance.verificationSteps.length > 0 && (
                <BulletList
                  title="Verification steps"
                  items={analysis.maintenance.verificationSteps}
                  tone="info"
                  emptyLabel="No verification steps defined."
                />
              )}
            </>
          )}
        </View>
      )}

      {analysisTab === 'evidence' && (
        <View className="gap-3">
          <DeepAnalyzerPanel analysis={analysis} />

          <SectionTitle title="Anomaly contributors" />
          {analysis.anomaly.contributors.length === 0 ? (
            <Panel>
              <Text className={cn('font-body text-xs leading-5', mutedClass)}>
                No mature baseline departure is available.
              </Text>
            </Panel>
          ) : (
            <View className="flex-row flex-wrap gap-3">
              {analysis.anomaly.contributors.map((contributor) => {
                const contributorTone: Tone =
                  contributor.direction === 'normal' ? 'live' : contributor.direction === 'high' ? 'warning' : 'info';
                return (
                  <Panel key={contributor.code} className="min-w-[240px] flex-1 gap-1">
                    <Text className={cn('font-body-medium text-xs', textClass)}>{contributor.code}</Text>
                    <Text className={cn('font-body text-[12.5px] leading-4', mutedClass)}>{contributor.description}</Text>
                    <Text style={{ color: TONE_COLOUR[contributorTone] }} className="font-mono text-[12.5px] font-bold">
                      {contributor.direction} · {contributor.score.toFixed(1)}
                    </Text>
                  </Panel>
                );
              })}
            </View>
          )}

          <Collapsible
            title="Model provenance and limitations"
            icon="file-document-outline"
            summary={`${analysis.readiness.limitations.length} current limitations`}
            count={analysis.readiness.limitations.length}
          >
            {analysis.readiness.limitations.length > 0 ? (
              analysis.readiness.limitations.map((item) => (
                <Body key={item} muted>
                  • {item}
                </Body>
              ))
            ) : (
              <Body muted>No additional model limitations are active.</Body>
            )}
          </Collapsible>
        </View>
      )}

      {analysisTab === 'signals' && (
        <Card className="gap-3">
          <CardHeader>
            <CardTitle size="sm">Signal quality and mapping</CardTitle>
            <Body muted>
              {liveSignalCount} of {signalRows.length} saved mapped points are currently reporting into the model.
            </Body>
          </CardHeader>
          <Separator />
          <DataTable
            rows={signalRows}
            keyOf={(row) => row.id}
            emptyLabel="No saved mapped signals."
            columns={[
              { key: 'point', header: 'Mapped point', width: 2.2, render: (row) => <Cell>{row.label}</Cell> },
              { key: 'code', header: 'Model signal', width: 1.4, render: (row) => <Cell mono muted>{row.code}</Cell> },
              { key: 'value', header: 'Latest', width: 1.2, numeric: true, render: (row) => <Cell mono numeric>{row.value}</Cell> },
              {
                key: 'status',
                header: 'Quality',
                width: 1.3,
                render: (row) => (
                  <Badge variant={row.status === 'Live' ? 'success' : row.status === 'Not consumed' ? 'muted' : 'warning'} icon={null}>
                    {row.status}
                  </Badge>
                ),
              },
            ]}
          />
        </Card>
      )}

      {analysisTab === 'cases' && (
        <View className="gap-3">
          <SectionTitle title="Maintenance cases" />
          {!bundle || bundle.cases.length === 0 ? (
            <Panel>
              <Text className={cn('font-body text-xs leading-5', mutedClass)}>No durable maintenance case has been raised for this machine.</Text>
            </Panel>
          ) : (
            bundle.cases.map((maintenanceCase) => (
              <Panel key={maintenanceCase.id} className="gap-2">
                <View className="flex-row flex-wrap items-center justify-between gap-2">
                  <Text className={cn('font-body-bold text-sm', textClass)}>{maintenanceCase.title}</Text>
                  <Text className={cn('font-body-medium text-[12.5px]', mutedClass)}>
                    {maintenanceCase.status} · {maintenanceCase.priority}
                  </Text>
                </View>
                {(maintenanceCase.recommended_actions ?? []).length > 0 && (
                  <View className="gap-1">
                    {maintenanceCase.recommended_actions?.map((action) => (
                      <Text key={action} className={cn('font-body text-xs leading-4', textClass)}>
                        - {action}
                      </Text>
                    ))}
                  </View>
                )}
              </Panel>
            ))
          )}

          <SectionTitle title="Anomaly episodes" />
          {!bundle || bundle.episodes.length === 0 ? (
            <Panel>
              <Text className={cn('font-body text-xs leading-5', mutedClass)}>No anomaly episode has been recorded.</Text>
            </Panel>
          ) : (
            bundle.episodes.map((episode) => {
              const ep = episode as AnomalyEpisode;
              const tone: Tone =
                ep.severity === 'critical' || ep.severity === 'high'
                  ? 'critical'
                  : ep.severity === 'medium' || ep.severity === 'low'
                    ? 'warning'
                    : 'live';
              return (
                <Panel key={ep.id} className="gap-2">
                  <View className="flex-row flex-wrap items-center justify-between gap-2">
                    <Text className={cn('font-body-bold text-sm', textClass)}>{ep.state.replace(/_/g, ' ')}</Text>
                    <Text style={{ color: TONE_COLOUR[tone] }} className="font-body-medium text-[12.5px]">
                      {ep.severity} · {ep.score.toFixed(1)}
                    </Text>
                  </View>
                  {(ep.contributors ?? []).length > 0 && (
                    <View className="gap-1">
                      {ep.contributors?.map((contributor) => (
                        <Text key={contributor.code} className={cn('font-body text-xs leading-4', mutedClass)}>
                          - {contributor.code}: {contributor.description} ({contributor.direction}, {contributor.score.toFixed(1)})
                        </Text>
                      ))}
                    </View>
                  )}
                </Panel>
              );
            })
          )}
        </View>
      )}
        </View>
      </ScrollView>
    </View>
  );
}
