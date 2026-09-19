import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import type { MachineNode } from '../../../lib/machines';
import type { CardNode } from '../../../lib/rack';
import { runTwinScrewPipeline, type PipelineResult } from '../../../lib/knowledge/tse/pipeline';
import { operatingStateDefinition } from '../../../lib/knowledge/doc02/operatingState';
import { Badge, Body, Card } from '../../ui';
import type { MappedChannel } from './RackOccupancyView';

/**
 * The DOC-01 to DOC-04 chain, rendered.
 *
 * Every section on this page is one document's output, in the order the
 * documents run: data quality, operating state, context, features, anomalies,
 * diagnosis. That ordering is not presentational — it is the gating, and a
 * reader who sees state UNKNOWN at the top knows immediately why the anomaly
 * section below it is empty.
 *
 * The page leads with the commissioning notice rather than burying it. The
 * limits behind every finding here are engineering-development values for a
 * machine of this class, not measurements from this machine, and a number shown
 * to an operator without that caveat is worse than no number.
 */

type Props = {
  machine: MachineNode;
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
};

function qualityVariant(verdict: string): 'destructive' | 'warning' | 'muted' | 'default' {
  if (verdict === 'BAD' || verdict === 'MISSING') return 'destructive';
  if (verdict === 'UNCERTAIN') return 'warning';
  return 'default';
}

function anomalyVariant(verdict: string): 'destructive' | 'warning' | 'muted' {
  if (verdict === 'HIGH_ANOMALY' || verdict === 'LOW_ANOMALY') return 'destructive';
  if (verdict === 'RISING_ABNORMAL' || verdict === 'DATA_QUALITY_SUSPECT') return 'warning';
  return 'muted';
}

export function TwinScrewDiagnosisView({ machine, mappedChannels, devices, cards, live }: Props) {
  const { isDark } = useAppTheme();
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const result: PipelineResult = useMemo(
    () =>
      runTwinScrewPipeline({
        machineId: machine.id,
        variantId: machine.variantId ?? null,
        configurationVersion: null,
        channels: mappedChannels.map((mapped) => ({
          templatePointCode: mapped.templatePointCode,
          channel: { rackId: mapped.channel.rackId, slot: mapped.channel.slot, id: mapped.channel.id, unit: mapped.channel.unit },
          label: mapped.label,
        })),
        devices,
        cards,
        live,
      }),
    [machine.id, machine.variantId, mappedChannels, devices, cards, live],
  );

  const heading = (text: string) => (
    <Text className={cn('font-mono text-[11px] uppercase tracking-[0.18em]', muted)}>{text}</Text>
  );

  const stateDef = operatingStateDefinition(result.state.operatingState);
  const badQuality = result.quality.filter((entry) => entry.verdict === 'BAD' || entry.verdict === 'MISSING');
  const uncertainQuality = result.quality.filter((entry) => entry.verdict === 'UNCERTAIN');
  const firedAnomalies = result.anomalies.filter(
    (entry) => entry.verdict !== 'NOT_ANOMALOUS' && entry.verdict !== 'NOT_EVALUATED',
  );
  const diagnosis = result.diagnosis;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 16 }}>
      {/* The caveat leads. Nothing below it was measured on this machine. */}
      <Card className="gap-1.5">
        <View className="flex-row items-center gap-2">
          <Badge variant="warning">NOT FIELD CALIBRATED</Badge>
          <Text className="font-body-bold">Engineering-development limits</Text>
        </View>
        <Body muted>{result.commissioningNotice}</Body>
      </Card>

      {/* DOC-04 — the conclusion, first, because it is what an operator needs. */}
      <View className="gap-3">
        {heading('Diagnosis · DOC-04')}
        <Card className="gap-2">
          <View className="flex-row flex-wrap items-center gap-2">
            <Badge variant={diagnosis.sendToDoc05 ? 'destructive' : 'muted'}>{diagnosis.diagnosisState.replace(/_/g, ' ')}</Badge>
            <Text className="font-body-bold">{diagnosis.primaryDiagnosis.replace(/_/g, ' ')}</Text>
            {diagnosis.patternId ? <Badge variant="muted">{diagnosis.patternId}</Badge> : null}
          </View>
          <Body>
            <Text className="font-body-bold">What: </Text>
            {diagnosis.what}
          </Body>
          <Body>
            <Text className="font-body-bold">Where: </Text>
            {diagnosis.where}
          </Body>
          <Body>
            <Text className="font-body-bold">Why: </Text>
            {diagnosis.why || '—'}
          </Body>
          {diagnosis.groupedSymptoms.length > 0 ? (
            <Body muted>Grouped symptoms: {diagnosis.groupedSymptoms.join(' · ')}</Body>
          ) : null}
          {diagnosis.alternativeDiagnoses.length > 0 ? (
            <Body muted>Alternatives kept open: {diagnosis.alternativeDiagnoses.join(' · ')}</Body>
          ) : null}
          {diagnosis.contradictingEvidence.length > 0 ? (
            <Body muted>
              Contradicting: {diagnosis.contradictingEvidence.map((item) => item.statement).join('; ')}
            </Body>
          ) : null}
          {diagnosis.missingEvidence.length > 0 ? (
            <Body muted>Missing: {diagnosis.missingEvidence.map((item) => item.statement).join('; ')}</Body>
          ) : null}
        </Card>
      </View>

      {/* DOC-02 — state and context, which gate everything above. */}
      <View className="gap-3">
        {heading('Operating state & context · DOC-02')}
        <Card className="gap-1.5">
          <View className="flex-row items-center gap-2">
            <Badge variant={result.state.operatingState === 'ST-00' ? 'warning' : 'default'}>
              {stateDef?.name ?? result.state.operatingState}
            </Badge>
            <Text className={cn('font-mono text-[11px]', muted)}>
              confidence {result.state.stateConfidence.toFixed(2)} · {result.state.transitionType}
            </Text>
          </View>
          {result.state.unknownReason ? <Body muted>{result.state.unknownReason}</Body> : null}
          {result.state.stateEvidence.length > 0 ? (
            <Body muted>Evidence: {result.state.stateEvidence.join(' · ')}</Body>
          ) : null}
          <Body muted>
            Context confidence {result.context.confidence.toFixed(2)}
            {result.context.missing.length > 0 ? ` · missing: ${result.context.missing.join(', ')}` : ''}
          </Body>
        </Card>
      </View>

      {/* DOC-04 §3 — anomalies, with the gate that decided each. */}
      <View className="gap-3">
        {heading(`Anomalies · DOC-04 (${firedAnomalies.length})`)}
        {firedAnomalies.length === 0 ? (
          <Card>
            <Body muted>
              No signal is outside its contextual envelope. Where a signal was not evaluated the reason is shown in the
              data-quality section below.
            </Body>
          </Card>
        ) : (
          firedAnomalies.map((entry) => (
            <Card key={entry.signalId} className="gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Badge variant={anomalyVariant(entry.verdict)}>{entry.verdict.replace(/_/g, ' ')}</Badge>
                <Text className="font-body-bold">{entry.signalId}</Text>
                {/* The DOC-07 catalogue id, where the verdict maps onto one. */}
                {result.labelledAnomalies.find((labelled) => labelled.signalId === entry.signalId) ? (
                  <Badge variant="muted">
                    {result.labelledAnomalies.find((labelled) => labelled.signalId === entry.signalId)?.anomalyId}
                  </Badge>
                ) : null}
                {entry.limitStatus !== 'NONE' ? <Badge variant="destructive">{entry.limitStatus}</Badge> : null}
              </View>
              <Body muted>{entry.reason}</Body>
            </Card>
          ))
        )}
      </View>

      {/* DOC-02 §22 — data quality, the gate everything rests on. */}
      <View className="gap-3">
        {heading(`Data quality · DOC-02 (${result.reportingCount} signals reporting)`)}
        {badQuality.length === 0 && uncertainQuality.length === 0 ? (
          <Card>
            <Body muted>Every mapped signal passed all ten DQ checks.</Body>
          </Card>
        ) : (
          [...badQuality, ...uncertainQuality].map((entry) => (
            <Card key={entry.signalId} className="gap-1">
              <View className="flex-row items-center gap-2">
                <Badge variant={qualityVariant(entry.verdict)}>{entry.verdict}</Badge>
                <Text className="font-body-bold">{entry.signalId}</Text>
                {entry.suppressesPhysicalDiagnosis ? <Badge variant="warning">SUPPRESSES DIAGNOSIS</Badge> : null}
              </View>
              {entry.findings.map((finding) => (
                <Body key={finding.ruleId + finding.reason} muted>
                  {finding.ruleId} · {finding.reason}
                </Body>
              ))}
            </Card>
          ))
        )}
      </View>

      {/* DOC-02 §37 — the gap that limits everything above. */}
      <View className="gap-3">
        {heading(`Signal gap · DOC-02 §15 (${result.unboundMandatory.length} mandatory signals unavailable)`)}
        <Card className="gap-1">
          <Body muted>
            These DOC-02 mandatory signals have no instrument or tag on this machine. Most are control-system values a
            PLC already holds — connecting them is what moves the operating state out of inference and lets the context
            engine select a real baseline.
          </Body>
          {result.unboundMandatory.map((signal) => (
            <Text key={signal} className={cn('font-mono text-[11px]', muted)}>
              {signal}
            </Text>
          ))}
        </Card>
      </View>
    </ScrollView>
  );
}
