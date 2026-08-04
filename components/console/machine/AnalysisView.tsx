import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  analyzeRotaryAirlock,
  type AnalysisReading,
  type AnalysisSignalCode,
  type DiagnosisCandidate,
  type RotaryAirlockAnalysisResult,
} from '../../../lib/analysis/rotaryAirlockAnalyzer';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import { latestMeasurementForChannel, type LiveState } from '../../../lib/liveTelemetry';
import type { CardNode } from '../../../lib/rack';
import { apiFetch } from '../../../src/lib/apiClient';
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
import { LIVE_RANGE_FOR_LETTER, useLiveValue, type LiveKindLetter } from './liveValue';
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

export type AnalysisViewProps = {
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  machineId?: string;
  machineTemplate?: string;
  expectedPoints?: number;
};

function useDemoValues(): Record<LiveKindLetter, number> {
  const v = useLiveValue('V', true);
  const t = useLiveValue('T', true);
  const s = useLiveValue('S', true);
  const p = useLiveValue('P', true);
  const c = useLiveValue('C', true);
  const x = useLiveValue('X', true);
  return useMemo(() => ({ V: v, T: t, S: s, P: p, C: c, X: x }), [v, t, s, p, c, x]);
}

function buildReadings(
  mappedChannels: MappedChannel[],
  devices: DeviceNode[],
  cards: CardNode[],
  live: LiveState | undefined,
  demoValues: Record<LiveKindLetter, number>,
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
    let source: AnalysisReading['source'] = 'demo';

    if (rack && card && live) {
      const measurement = latestMeasurementForChannel(rack, card, channelNumber(mapped.channel.id), live);
      if (measurement && measurement.value !== null && measurement.value !== undefined) {
        value = measurement.value;
        unit = measurement.unit ?? unit;
        quality = measurement.quality ?? quality;
        valid = measurement.measurementValid ?? valid;
        timestamp = measurement.updatedAt ?? now;
        source = 'gateway';
      }
    }

    if (value === null || value === undefined) {
      value = demoValues[mapped.channel.letter] ?? LIVE_RANGE_FOR_LETTER[mapped.channel.letter].min;
      source = 'demo';
    }

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
        <Text className={cn('font-body-bold text-sm', textClass)}>{diagnosis.title}</Text>
        <Text style={{ color: colour }} className="font-body-bold text-[11px] uppercase tracking-wider">
          {formatUrgency(diagnosis.urgency)} · {Math.round(diagnosis.confidence * 100)}%
        </Text>
      </View>
      {diagnosis.supporting.length > 0 && (
        <View className="gap-1">
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Supporting evidence</Text>
          {diagnosis.supporting.map((item) => (
            <Text key={item} className={cn('font-body text-xs leading-4', textClass)}>
              - {item}
            </Text>
          ))}
        </View>
      )}
      {diagnosis.contradicting.length > 0 && (
        <View className="gap-1">
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Contradictions</Text>
          {diagnosis.contradicting.map((item) => (
            <Text key={item} className={cn('font-body text-xs leading-4', mutedClass)}>
              - {item}
            </Text>
          ))}
        </View>
      )}
      {diagnosis.immediateAction && (
        <View className="gap-1">
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Immediate action</Text>
          <Text className={cn('font-body text-xs leading-4', textClass)}>{diagnosis.immediateAction}</Text>
        </View>
      )}
      {diagnosis.inspection.length > 0 && (
        <View className="gap-1">
          <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Inspection</Text>
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

export function AnalysisView({
  mappedChannels,
  devices,
  cards,
  live,
  machineId,
  expectedPoints,
}: AnalysisViewProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const textClass = isDark ? 'text-ink' : 'text-ink-inverse';

  const [bundle, setBundle] = useState<AnalysisBundle | null>(null);
  const demoValues = useDemoValues();

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
    const readings = buildReadings(mappedChannels, devices, cards, live, demoValues);
    return analyzeRotaryAirlock({ readings, now: new Date().toISOString() });
  }, [mappedChannels, devices, cards, live, demoValues]);

  if (mappedChannels.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className={cn('font-body text-sm italic', mutedClass)}>
          No rack channels are mapped to this machine yet — link a box to a channel in Design mode.
        </Text>
      </View>
    );
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

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View className="min-w-0 flex-1 gap-1">
        <Text className={cn('font-body-bold text-2xl', textClass)}>Analysis layer</Text>
        <Text className={cn('font-body text-xs leading-5', mutedClass)}>
          Computed from saved rack mappings and live signals using the rotary-airlock analysis model.
          {expectedPoints ? ` ${mappedChannels.length} of ${expectedPoints} expected points mapped.` : ` ${mappedChannels.length} mapped channels.`}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-3">
        <StatusPanel
          icon={'check-decagram-outline' as IconName}
          title="Readiness"
          value={analysis.readiness.ready ? 'Ready' : 'Not ready'}
          detail={analysis.readiness.limitations[0] ?? 'Mapped evidence is ready for live condition analysis.'}
          tone={readinessTone(analysis.readiness.score)}
          meta={`${analysis.readiness.score}%`}
        />
        <StatusPanel
          icon={'help-circle-outline' as IconName}
          title="Operating state"
          value={analysis.operatingState.state}
          detail={
            analysis.operatingState.supporting[0] ??
            analysis.operatingState.limitations[0] ??
            'State inferred from speed/load evidence.'
          }
          tone={stateTone(analysis.operatingState.state)}
          meta={`${Math.round(analysis.operatingState.confidence * 100)}%`}
        />
        <StatusPanel
          icon={'eye-outline' as IconName}
          title="Condition"
          value={conditionLabel}
          detail={conditionDetail}
          tone={conditionTone}
        />
      </View>

      <DeepAnalyzerPanel analysis={analysis} />

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
      </View>

      <View className="gap-3">
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
                  <Text className={cn('font-body text-[11px] leading-4', mutedClass)}>{contributor.description}</Text>
                  <Text
                    style={{ color: TONE_COLOUR[contributorTone] }}
                    className="font-mono text-[11px] font-bold"
                  >
                    {contributor.direction} · {contributor.score.toFixed(1)}
                  </Text>
                </Panel>
              );
            })}
          </View>
        )}
      </View>

      {analysis.maintenance.caseRequired && (
        <View className="gap-3">
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
        </View>
      )}

      {bundle && bundle.cases.length > 0 && (
        <View className="gap-3">
          <SectionTitle title="Maintenance cases" />
          {bundle.cases.map((maintenanceCase) => (
            <Panel key={maintenanceCase.id} className="gap-2">
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Text className={cn('font-body-bold text-sm', textClass)}>{maintenanceCase.title}</Text>
                <Text className={cn('font-body-medium text-[11px]', mutedClass)}>
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
          ))}
        </View>
      )}

      {bundle && bundle.episodes.length > 0 && (
        <View className="gap-3">
          <SectionTitle title="Anomaly episodes" />
          {bundle.episodes.map((episode) => {
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
                  <Text className={cn('font-body-bold text-sm', textClass)}>
                    {ep.state.replace(/_/g, ' ')}
                  </Text>
                  <Text style={{ color: TONE_COLOUR[tone] }} className="font-body-medium text-[11px]">
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
          })}
        </View>
      )}
    </ScrollView>
  );
}
