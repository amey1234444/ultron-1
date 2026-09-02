import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { Badge, Body, Card } from '../../ui';
import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { deviceWithGatewayConnectionState, type DeviceNode } from '../../../lib/devices';
import { CHANNEL_LIVE_GRACE_MS, latestMeasurementForChannel, type LiveMeasurement, type LiveState } from '../../../lib/liveTelemetry';
import type { CardNode } from '../../../lib/rack';
import { analyseTwinScrew, type RuleResult, type TagSample, type TwinScrewAnalysis } from '../../../lib/analysis/twinScrew';
import { twinScrewPointByCode } from '../../../lib/twinScrewExtruderPoints';
import type { MappedChannel } from './RackOccupancyView';

/**
 * Twin-screw Analysis.
 *
 * Fills the same three depths as the other machines — Overview for the
 * operator, Diagnosis for maintenance, Advance Diagnosis for the analyst — but
 * this machine can only honestly fill part of them today.
 *
 * The integrity layer is real. Whether a channel has frozen, dropped out, or
 * arrived in a unit the tag cannot carry is a property of the data, so those
 * findings are as valid here as on any machine, and they are exactly the
 * findings that would otherwise be invisible.
 *
 * Machine *condition* is not reported, because no twin-screw threshold register
 * has been commissioned. The single-screw pilot's limits are process-engineering
 * sign-offs against different equipment; borrowing them would produce confident
 * numbers with nothing behind them. So the page names each rule that is waiting
 * and what it is waiting for, and says plainly that a quiet page is a known gap
 * rather than a clean bill of health.
 */

type TwinScrewAnalysisViewProps = {
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
};

/** Channel number out of a channel id, matching the extruder view's helper. */
function channelNumber(id: string): number {
  const match = /(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

/** A reading only counts when it is valid, good quality and recent. */
function usableValue(measurement: LiveMeasurement | undefined): number | null {
  if (!measurement) return null;
  if (measurement.measurementValid === false) return null;
  if (measurement.quality && measurement.quality !== 'GOOD') return null;
  const ageMs = Date.now() - Date.parse(measurement.updatedAt);
  if (!Number.isFinite(ageMs) || ageMs > CHANNEL_LIVE_GRACE_MS) return null;
  return typeof measurement.value === 'number' && Number.isFinite(measurement.value) ? measurement.value : null;
}

/**
 * Turn the console's mapped channels into analyser input.
 *
 * Only channels snapped to a registry pad are considered: the pad is what
 * declares which instrument a channel is, and a hand-labelled card that was
 * never snapped has no such declaration to offer.
 */
function samplesFromChannels(
  mappedChannels: MappedChannel[],
  devices: DeviceNode[],
  cards: CardNode[],
  live: LiveState | undefined,
): TagSample[] {
  const samples: TagSample[] = [];
  for (const mapped of mappedChannels) {
    const point = twinScrewPointByCode(mapped.templatePointCode);
    if (!point) continue;
    const rack = devices.find((device) => device.id === mapped.channel.rackId);
    const card = cards.find((candidate) => candidate.deviceId === mapped.channel.rackId && candidate.slot === mapped.channel.slot);
    const measurement =
      rack && card && live
        ? latestMeasurementForChannel(deviceWithGatewayConnectionState(rack, devices), card, channelNumber(mapped.channel.id), live)
        : undefined;
    const value = usableValue(measurement);
    samples.push({
      tag: point.analyzerTag,
      label: point.label,
      value,
      unit: measurement?.unit || mapped.channel.unit || '',
      reporting: value !== null,
    });
  }
  return samples;
}

function variantFor(finding: RuleResult): 'destructive' | 'warning' | 'info' {
  if (finding.severity === 'fault' || finding.severity === 'alarm') return 'destructive';
  if (finding.severity === 'warning') return 'warning';
  return 'info';
}

function FindingCard({ finding }: { finding: RuleResult }) {
  const variant = variantFor(finding);
  return (
    <Card className="gap-2">
      <View className="flex-row items-center gap-2">
        <Badge variant={variant}>{finding.status.replace(/_/g, ' ')}</Badge>
        <Text className="font-body-bold">{finding.name}</Text>
      </View>
      <Body muted>{finding.detail}</Body>
      {finding.evidence.length > 0 && (
        <Text className="font-mono text-[11px] opacity-60">
          Evidence: {finding.evidence.join(', ')} · {finding.part}
        </Text>
      )}
      {finding.recommendedAction ? <Body>{finding.recommendedAction}</Body> : null}
      {finding.requires ? <Body muted>Requires: {finding.requires}</Body> : null}
    </Card>
  );
}

export function TwinScrewAnalysisView({ mappedChannels, devices, cards, live }: TwinScrewAnalysisViewProps) {
  const { isDark } = useAppTheme();
  const analysis: TwinScrewAnalysis = useMemo(
    () => analyseTwinScrew(samplesFromChannels(mappedChannels, devices, cards, live)),
    [mappedChannels, devices, cards, live],
  );

  const faults = analysis.findings.filter((f) => f.severity === 'fault' || f.severity === 'alarm');
  const notes = analysis.findings.filter((f) => f.severity !== 'fault' && f.severity !== 'alarm');
  const awaiting = analysis.pending.filter((r) => r.status === 'CONFIGURATION_REQUIRED');
  const unmapped = analysis.pending.filter((r) => r.status === 'INSUFFICIENT_EVIDENCE');
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const heading = (text: string) => (
    <Text className={cn('font-mono text-[11.5px] uppercase tracking-[0.16em]', mutedClass)}>{text}</Text>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* Overview — the operator's few seconds. */}
      <Card className="gap-3">
        <View className="flex-row flex-wrap items-center gap-2">
          <Badge variant={faults.length > 0 ? 'destructive' : 'info'}>
            {faults.length > 0 ? `${faults.length} signal fault${faults.length === 1 ? '' : 's'}` : 'No signal faults'}
          </Badge>
          <Badge variant="warning">Condition model not commissioned</Badge>
        </View>
        <Text className="font-body-bold text-xl">Twin Screw Extruder</Text>
        <Body muted>
          Signal integrity is being checked and is reported below. Machine condition is not: no twin-screw threshold
          register has been commissioned, so no rule is comparing this machine against a limit. The single-screw pilot
          limits are sign-offs against different equipment and are deliberately not applied here. An absence of condition
          findings on this page is a known gap, not a clean bill of health.
        </Body>
      </Card>

      {/* Diagnosis — what maintenance acts on. */}
      {faults.length > 0 && (
        <View className="gap-3">
          {heading('Diagnosis · act on these')}
          {faults.map((finding) => (
            <FindingCard key={`${finding.ruleId}-${finding.evidence.join()}`} finding={finding} />
          ))}
        </View>
      )}

      {notes.length > 0 && (
        <View className="gap-3">
          {heading('Signal notes')}
          {notes.map((finding) => (
            <FindingCard key={`${finding.ruleId}-${finding.evidence.join()}`} finding={finding} />
          ))}
        </View>
      )}

      {/* Advance Diagnosis — derived measurements, with provenance. */}
      <View className="gap-3">
        {heading('Advance diagnosis · derived measurements')}
        {analysis.derived.map((value) => (
          <Card key={value.id} className="gap-1">
            <Text className="font-body-bold">{value.label}</Text>
            {value.value === null ? (
              <Body muted>{value.unavailableReason}</Body>
            ) : (
              <>
                <Text className="font-mono text-lg">
                  {value.value.toFixed(2)} {value.unit}
                </Text>
                <Text className="font-mono text-[11px] opacity-60">
                  Derived from {value.derivedFrom.join(' + ')} — a computed value, not a measured channel.
                </Text>
              </>
            )}
          </Card>
        ))}
      </View>

      {/* The commissioning gap, as a checklist rather than a silence. */}
      <View className="gap-3">
        {heading(`Rules awaiting commissioning (${awaiting.length})`)}
        {awaiting.map((rule) => (
          <Card key={rule.ruleId} className="gap-1">
            <View className="flex-row items-center gap-2">
              <Badge variant="muted">{rule.part}</Badge>
              <Text className="font-body-bold">{rule.name}</Text>
            </View>
            <Body muted>{rule.detail}</Body>
            <Body>Requires: {rule.requires}</Body>
          </Card>
        ))}
      </View>

      {unmapped.length > 0 && (
        <Card className="gap-2">
          <Text className="font-body-bold">Rules with nothing mapped ({unmapped.length})</Text>
          <Body muted>
            {unmapped.map((rule) => rule.name).join(' · ')} — none of the signals these read is wired to a channel on
            this machine yet.
          </Body>
        </Card>
      )}
    </ScrollView>
  );
}
