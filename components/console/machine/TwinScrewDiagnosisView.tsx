import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import type { MachineNode } from '../../../lib/machines';
import type { CardNode } from '../../../lib/rack';
import { operatingStateDefinition } from '../../../lib/knowledge/doc02/operatingState';
import { PRIORITY_MEANING } from '../../../lib/knowledge/doc05/types';
import { runTwinScrewPipeline, type PipelineResult } from '../../../lib/knowledge/tse/pipeline';
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
import { StatusBand, type StatusCount } from './analyzer/StatusBand';
import type { MappedChannel } from './RackOccupancyView';

/**
 * Twin-screw Analysis, in the single-screw analyser's shape.
 *
 * The single screw already settled how an analysis page should read: one status
 * band that answers "how is the machine" before anything else, then tabs that
 * go progressively deeper — the conclusion, the evidence behind it, the raw
 * signals under that. Two machines in the same console answering the same
 * question in two different layouts is a cost paid by every operator who uses
 * both, so this page borrows the shell and fills it with the DOC-01..DOC-07
 * chain instead of the pilot's register.
 *
 * What it does *not* borrow is the single screw's content. The band's counts
 * are severity and priority from DOC-05, the Diagnosis tab is DOC-04's
 * WHAT/WHERE/WHY, the Evidence tab is the gating that produced it, and the
 * Signals tab is DOC-02's quality verdicts. Nothing is copied across that was
 * commissioned against different equipment.
 */

type Props = {
  machine: MachineNode;
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
};

type TabKey = 'diagnosis' | 'evidence' | 'signals';

function severityVariant(severity: string): Variant {
  if (severity === 'DANGER') return 'destructive';
  if (severity === 'ALERT') return 'warning';
  return 'success';
}

function qualityVariant(verdict: string): Variant {
  if (verdict === 'BAD' || verdict === 'MISSING') return 'destructive';
  if (verdict === 'UNCERTAIN') return 'warning';
  return 'success';
}

function anomalyVariant(verdict: string): Variant {
  if (verdict === 'HIGH_ANOMALY' || verdict === 'LOW_ANOMALY') return 'destructive';
  if (verdict === 'RISING_ABNORMAL' || verdict === 'DATA_QUALITY_SUSPECT') return 'warning';
  return 'muted';
}

export function TwinScrewDiagnosisView({ machine, mappedChannels, devices, cards, live }: Props) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const [tab, setTab] = useState<TabKey>('diagnosis');

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

  const { decision, diagnosis, state, context, quality, anomalies } = result;
  const stateDef = operatingStateDefinition(state.operatingState);

  const firedAnomalies = anomalies.filter(
    (entry) => entry.verdict !== 'NOT_ANOMALOUS' && entry.verdict !== 'NOT_EVALUATED',
  );
  const badQuality = quality.filter((entry) => entry.verdict === 'BAD' || entry.verdict === 'MISSING');
  const uncertainQuality = quality.filter((entry) => entry.verdict === 'UNCERTAIN');

  // The band's numbers. Each is a claim the page can defend on a tab below it.
  const counts: StatusCount[] = [
    {
      key: 'severity',
      label: 'Severity',
      value: decision.severity,
      detail: decision.severityReason,
      scope: 'this machine',
      severity: decision.severity === 'DANGER' ? 'fault' : decision.severity === 'ALERT' ? 'limit' : 'advisory',
    },
    {
      key: 'priority',
      label: 'Priority',
      value: `${decision.priority} ${PRIORITY_MEANING[decision.priority].name}`,
      detail: decision.priorityReason,
      scope: 'response urgency',
      severity: decision.priority === 'P1' ? 'fault' : decision.priority === 'P2' ? 'limit' : 'advisory',
    },
    {
      key: 'confidence',
      label: 'Confidence',
      value: decision.confidence.faultLevel,
      detail: `Fault ${(decision.confidence.fault * 100).toFixed(0)}% · location ${(decision.confidence.location * 100).toFixed(0)}% · root cause ${(decision.confidence.rootCause * 100).toFixed(0)}%`,
      scope: 'fault, location, root cause',
      severity: decision.confidence.faultLevel === 'HIGH' ? 'advisory' : 'boundary',
    },
    {
      key: 'anomalies',
      label: 'Anomalies',
      value: String(firedAnomalies.length),
      detail: `${result.reportingCount} signals reporting · ${badQuality.length} BAD or MISSING`,
      scope: 'mapped signals',
      severity: firedAnomalies.length === 0 ? 'advisory' : 'boundary',
    },
  ];

  const tabs: TabItem<TabKey>[] = [
    { value: 'diagnosis', label: 'Diagnosis', icon: 'stethoscope' },
    { value: 'evidence', label: 'Evidence', icon: 'format-list-bulleted', count: firedAnomalies.length || undefined },
    {
      value: 'signals',
      label: 'Signals',
      icon: 'access-point',
      count: badQuality.length + uncertainQuality.length || undefined,
      countVariant: badQuality.length > 0 ? 'destructive' : 'warning',
    },
  ];

  return (
    <View className="min-h-0 flex-1" style={{ backgroundColor: palette.bg }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32, gap: 12 }}>
        <StatusBand
          statusWord={decision.severity}
          statusSeverity={decision.severity === 'DANGER' ? 'fault' : decision.severity === 'ALERT' ? 'limit' : 'advisory'}
          statusContext={stateDef?.name ?? state.operatingState}
          statusChip={diagnosis.patternId ?? undefined}
          verdictLine={diagnosis.what}
          sourceLabel={`${result.reportingCount} live signals`}
          sourceVariant={result.reportingCount > 0 ? 'success' : 'muted'}
          scenarioLabel="DOC-01..07"
          scenarioActive={false}
          onToggleLibrary={() => undefined}
          onReturnToLive={() => undefined}
          counts={counts}
          shares={[
            { severity: 'fault', count: decision.severity === 'DANGER' ? 1 : 0 },
            { severity: 'limit', count: decision.severity === 'ALERT' ? 1 : 0 },
            { severity: 'boundary', count: firedAnomalies.length },
            { severity: 'advisory', count: badQuality.length + uncertainQuality.length },
          ]}
          filter={'all'}
          onFilter={() => undefined}
          wide
        />

        {/* The caveat is not scoped to a tab, because it invalidates every
            number on all three of them. */}
        <Alert variant="warning" icon="flask-outline" title="Engineering-development limits · not field calibrated">
          {result.commissioningNotice}
        </Alert>

        <Tabs items={tabs} value={tab} onChange={setTab} />

        {tab === 'diagnosis' ? (
          <View className="gap-3">
            <Card className="gap-2">
              <CardHeader>
                <View className="flex-row flex-wrap items-center gap-2">
                  <CardTitle size="sm">{diagnosis.primaryDiagnosis.replace(/_/g, ' ')}</CardTitle>
                  <Badge variant={diagnosis.sendToDoc05 ? severityVariant(decision.severity) : 'muted'}>
                    {diagnosis.diagnosisState.replace(/_/g, ' ')}
                  </Badge>
                  <Badge variant="muted">{decision.progression}</Badge>
                </View>
              </CardHeader>
              <Separator />
              <View className="gap-1.5">
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
              </View>
            </Card>

            {/* DOC-05 — what to do, and how urgently. */}
            <Card className="gap-2">
              <CardHeader>
                <View className="flex-row flex-wrap items-center gap-2">
                  <CardTitle size="sm">Recommended action</CardTitle>
                  <Badge variant={decision.priority === 'P1' ? 'destructive' : decision.priority === 'P2' ? 'warning' : 'muted'}>
                    {decision.priority} · {PRIORITY_MEANING[decision.priority].name}
                  </Badge>
                  <Badge variant="muted">{decision.recommendation.level.replace(/_/g, ' ')}</Badge>
                </View>
              </CardHeader>
              <Separator />
              <Body>{decision.recommendation.text}</Body>
              <Body muted>Sequence: {decision.recommendation.steps.join(' → ')}</Body>
              <Body muted>
                {decision.recommendation.authority === 'APPROVED_PROCEDURE'
                  ? 'This follows an approved plant procedure.'
                  : 'This is an ULTRON recommendation. An approved plant SOP outranks it.'}
              </Body>
              <Body muted>{PRIORITY_MEANING[decision.priority].window}</Body>
            </Card>

            {/* §41 — why this diagnosis, this severity, this confidence, this priority. */}
            <Card className="gap-2">
              <CardHeader>
                <CardTitle size="sm">Why this conclusion</CardTitle>
              </CardHeader>
              <Separator />
              {decision.explainability.map((entry) => (
                <View key={entry.question} className="gap-0.5">
                  <Text className={cn('font-body-medium text-[12.5px]', muted)}>{entry.question}</Text>
                  <Body>{entry.answer}</Body>
                </View>
              ))}
            </Card>
          </View>
        ) : null}

        {tab === 'evidence' ? (
          <View className="gap-3">
            <Card className="gap-2">
              <CardHeader>
                <CardTitle size="sm">Operating state &amp; context</CardTitle>
              </CardHeader>
              <Separator />
              <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
                <KeyValue label="State" value={stateDef?.name ?? state.operatingState} />
                <KeyValue label="State confidence" value={state.stateConfidence.toFixed(2)} />
                <KeyValue label="Transition" value={state.transitionType} />
                <KeyValue label="Context confidence" value={context.confidence.toFixed(2)} />
              </View>
              {state.unknownReason ? <Body muted>{state.unknownReason}</Body> : null}
              {state.stateEvidence.length > 0 ? <Body muted>Evidence: {state.stateEvidence.join(' · ')}</Body> : null}
              {context.missing.length > 0 ? <Body muted>Context missing: {context.missing.join(', ')}</Body> : null}
            </Card>

            <SectionLabel>Anomalies ({firedAnomalies.length})</SectionLabel>
            {firedAnomalies.length === 0 ? (
              <Card>
                <Body muted>
                  No signal is outside its contextual envelope. Signals that were not evaluated give their reason on the
                  Signals tab.
                </Body>
              </Card>
            ) : (
              firedAnomalies.map((entry) => {
                const label = result.labelledAnomalies.find((item) => item.signalId === entry.signalId);
                return (
                  <Card key={entry.signalId} className="gap-1">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Badge variant={anomalyVariant(entry.verdict)}>{entry.verdict.replace(/_/g, ' ')}</Badge>
                      <Text className="font-body-bold">{entry.signalId}</Text>
                      {label ? <Badge variant="muted">{label.anomalyId}</Badge> : null}
                      {entry.limitStatus !== 'NONE' ? <Badge variant="destructive">{entry.limitStatus}</Badge> : null}
                    </View>
                    <Body muted>{entry.reason}</Body>
                  </Card>
                );
              })
            )}

            <SectionLabel>Evidence for the diagnosis</SectionLabel>
            <Card className="gap-1.5">
              {diagnosis.supportingEvidence.length > 0 ? (
                <Body>Supporting: {diagnosis.supportingEvidence.map((item) => item.statement).join('; ')}</Body>
              ) : null}
              {diagnosis.contradictingEvidence.length > 0 ? (
                <Body muted>Contradicting: {diagnosis.contradictingEvidence.map((item) => item.statement).join('; ')}</Body>
              ) : null}
              {diagnosis.missingEvidence.length > 0 ? (
                <Body muted>Missing: {diagnosis.missingEvidence.map((item) => item.statement).join('; ')}</Body>
              ) : null}
              {diagnosis.alternativeDiagnoses.length > 0 ? (
                <Body muted>Alternatives kept open: {diagnosis.alternativeDiagnoses.join(' · ')}</Body>
              ) : null}
              {diagnosis.groupedSymptoms.length > 0 ? (
                <Body muted>Grouped symptoms: {diagnosis.groupedSymptoms.join(' · ')}</Body>
              ) : null}
            </Card>
          </View>
        ) : null}

        {tab === 'signals' ? (
          <View className="gap-3">
            <SectionLabel>Data quality ({result.reportingCount} reporting)</SectionLabel>
            {badQuality.length === 0 && uncertainQuality.length === 0 ? (
              <Card>
                <Body muted>Every mapped signal passed all ten DOC-02 data-quality checks.</Body>
              </Card>
            ) : (
              [...badQuality, ...uncertainQuality].map((entry) => (
                <Card key={entry.signalId} className="gap-1">
                  <View className="flex-row flex-wrap items-center gap-2">
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

            <SectionLabel>Signal gap ({result.unboundMandatory.length} mandatory signals unavailable)</SectionLabel>
            <Card className="gap-1">
              <Body muted>
                These DOC-02 mandatory signals have no instrument or tag on this machine. Most are control-system values
                a PLC already holds; connecting them moves the operating state off inference and lets the context engine
                select a real baseline.
              </Body>
              {result.unboundMandatory.map((signal) => (
                <Text key={signal} className={cn('font-mono text-[11px]', muted)}>
                  {signal}
                </Text>
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
