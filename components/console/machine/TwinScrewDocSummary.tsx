import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import type { MachineNode } from '../../../lib/machines';
import type { CardNode } from '../../../lib/rack';
import { operatingStateDefinition } from '../../../lib/knowledge/doc02/operatingState';
import { runTwinScrewPipeline } from '../../../lib/knowledge/tse/pipeline';
import { PRIORITY_MEANING } from '../../../lib/knowledge/doc05/types';
import { Badge, Body, Card } from '../../ui';
import type { MappedChannel } from './RackOccupancyView';

/**
 * The DOC-01..04 conclusion, condensed for the Overview page.
 *
 * The Overview already has its own assessment from the generic condition model,
 * and this does not replace it — the two are different readings of the same
 * machine and disagreeing with each other silently would be worse than either
 * alone. So this is a band that says what the document chain concluded and
 * points at the Analysis tab for the evidence behind it.
 *
 * It leads with the operating state, because everything below it is gated on
 * that: a machine in STOPPED has no production anomalies by construction, and
 * an operator who cannot see the state will read the empty finding list as a
 * clean bill of health.
 */

type Props = {
  machine: MachineNode;
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
};

export function TwinScrewDocSummary({ machine, mappedChannels, devices, cards, live }: Props) {
  const { isDark } = useAppTheme();
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const result = useMemo(
    () =>
      runTwinScrewPipeline({
        machineId: machine.id,
        variantId: machine.variantId ?? null,
        configurationVersion: null,
        channels: mappedChannels.map((mapped) => ({
          templatePointCode: mapped.templatePointCode,
          channel: {
            rackId: mapped.channel.rackId,
            slot: mapped.channel.slot,
            id: mapped.channel.id,
            unit: mapped.channel.unit,
          },
          label: mapped.label,
        })),
        devices,
        cards,
        live,
      }),
    [machine.id, machine.variantId, mappedChannels, devices, cards, live],
  );

  const stateDef = operatingStateDefinition(result.state.operatingState);
  const diagnosis = result.diagnosis;
  const badCount = result.quality.filter((entry) => entry.verdict === 'BAD' || entry.verdict === 'MISSING').length;
  const anomalyCount = result.anomalies.filter(
    (entry) => entry.verdict === 'HIGH_ANOMALY' || entry.verdict === 'LOW_ANOMALY',
  ).length;

  const decision = result.decision;
  const severityVariant =
    decision.severity === 'DANGER' ? 'destructive' : decision.severity === 'ALERT' ? 'warning' : 'success';
  const priorityVariant =
    decision.priority === 'P1' ? 'destructive' : decision.priority === 'P2' ? 'warning' : 'muted';

  return (
    <Card className="gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className={cn('font-mono text-[10px] uppercase tracking-[0.18em]', muted)}>Knowledge model</Text>
        <Badge variant="muted">{stateDef?.name ?? result.state.operatingState}</Badge>
        <Badge variant={severityVariant}>{decision.severity}</Badge>
        <Badge variant={priorityVariant}>
          {decision.priority} · {PRIORITY_MEANING[decision.priority].name}
        </Badge>
        <Badge variant="muted">{diagnosis.primaryDiagnosis.replace(/_/g, ' ')}</Badge>
        {diagnosis.patternId ? <Badge variant="muted">{diagnosis.patternId}</Badge> : null}
        <Badge variant="warning">NOT FIELD CALIBRATED</Badge>
      </View>

      <Body muted>{diagnosis.what}</Body>
      {/* DOC-05 §27 — what to actually do, not just what is wrong. */}
      <Body>{decision.recommendation.text}</Body>

      <View className="flex-row flex-wrap items-center gap-x-5 gap-y-1">
        <Text className={cn('font-body text-[12.5px]', muted)}>
          {result.reportingCount} signal{result.reportingCount === 1 ? '' : 's'} reporting
        </Text>
        <Text className={cn('font-body text-[12.5px]', muted)}>
          {anomalyCount} anomal{anomalyCount === 1 ? 'y' : 'ies'}
        </Text>
        <Text className={cn('font-body text-[12.5px]', muted)}>
          {badCount} signal{badCount === 1 ? '' : 's'} BAD or MISSING
        </Text>
        <Text className={cn('font-body text-[12.5px]', muted)}>
          {result.unboundMandatory.length} mandatory signal{result.unboundMandatory.length === 1 ? '' : 's'} unavailable
        </Text>
        <Text className={cn('font-body text-[12.5px]', muted)}>
          context confidence {result.context.confidence.toFixed(2)}
        </Text>
      </View>

      <Text className={cn('font-body text-[12px] italic', muted)}>
        Open the Analysis tab for the evidence, the data-quality findings and the signal gap behind this.
      </Text>
    </Card>
  );
}
