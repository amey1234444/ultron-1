import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { DeviceNode } from '../../../lib/devices';
import type { LiveState } from '../../../lib/liveTelemetry';
import type { MachineNode } from '../../../lib/machines';
import type { CardNode } from '../../../lib/rack';
import { twinScrewPointByTag, type TwinScrewTag } from '../../../lib/twinScrewExtruderPoints';
import { operatingStateDefinition } from '../../../lib/knowledge/doc02/operatingState';
import { PRIORITY_MEANING } from '../../../lib/knowledge/doc05/types';
import { runTwinScrewPipeline, type PipelineResult } from '../../../lib/knowledge/tse/pipeline';
import type { FeatureObject } from '../../../lib/knowledge/doc03/types';
import {
  Alert,
  Badge,
  Body,
  Card,
  CardHeader,
  CardTitle,
  Cell,
  Collapsible,
  consolePalette,
  DataTable,
  KeyValue,
  Meter,
  SectionLabel,
  Separator,
  StatTile,
  Tabs,
  VerdictBanner,
  alpha,
  type Column,
  type IconName,
  type TabItem,
  type Variant,
} from '../../ui';
import { StatusBand, type StatusCount } from './analyzer/StatusBand';
import type { MappedChannel } from './RackOccupancyView';

/**
 * Twin-screw Analysis.
 *
 * Built in the single screw's shape — one status band answering "how is the
 * machine" before anything else, then tabs that go progressively deeper — and
 * filled with the DOC-01..DOC-07 chain. Three tabs, three depths:
 *
 *   Diagnosis  the conclusion and what to do about it
 *   Evidence   what the conclusion rests on, and the gates it passed
 *   Signals    every reading, its expected value and its data quality
 *
 * The presentation follows one rule throughout: a number is never shown without
 * the thing it is measured against. A pressure of 14 MPa means nothing alone;
 * "14.0 against an expected 8.0, +75%" is a finding. So the signal table always
 * carries expected and deviation, every anomaly card carries its baseline, and
 * each confidence is a meter against its own scale rather than a bare
 * percentage floating in text.
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

function priorityVariant(priority: string): Variant {
  if (priority === 'P1') return 'destructive';
  if (priority === 'P2') return 'warning';
  if (priority === 'P3') return 'info';
  return 'muted';
}

function confidenceVariant(level: string): Variant {
  if (level === 'HIGH') return 'success';
  if (level === 'MEDIUM') return 'info';
  if (level === 'INSUFFICIENT_EVIDENCE') return 'destructive';
  return 'warning';
}

function qualityVariant(verdict: string): Variant {
  if (verdict === 'BAD' || verdict === 'MISSING') return 'destructive';
  if (verdict === 'UNCERTAIN') return 'warning';
  return 'success';
}

function anomalyVariant(verdict: string): Variant {
  if (verdict === 'HIGH_ANOMALY' || verdict === 'LOW_ANOMALY') return 'destructive';
  if (verdict === 'RISING_ABNORMAL' || verdict === 'FALLING_ABNORMAL' || verdict === 'DATA_QUALITY_SUSPECT') return 'warning';
  if (verdict === 'EXPECTED_PROCESS_RESPONSE') return 'info';
  return 'muted';
}

function symbolicVariant(state: string): Variant {
  if (state.includes('ANOMALY')) return 'destructive';
  if (state.includes('DEVIATION')) return 'warning';
  if (state === 'NORMAL') return 'success';
  return 'muted';
}

/** The machine's own name for a tag, so a row reads as a place not an id. */
function labelFor(tag: string): string {
  return twinScrewPointByTag(tag as TwinScrewTag)?.label ?? tag;
}

function fmt(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(digits);
}

/**
 * The action sequence as a chain rather than a sentence.
 *
 * CONFIRM → INSPECT → CORRECT → VERIFY is an order of operations, and an
 * operator reading it as prose has to reconstruct that order themselves.
 */
function StepChain({ steps }: { steps: string[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {steps.map((step, index) => (
        <View key={step} className="flex-row items-center gap-1.5">
          <View className="rounded px-2 py-1" style={{ backgroundColor: alpha(palette.accent, 0.12) }}>
            <Text className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: palette.accent }}>
              {step}
            </Text>
          </View>
          {index < steps.length - 1 ? (
            <MaterialCommunityIcons name="chevron-right" size={13} color={palette.inkMuted} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** A labelled fact with an icon, for the WHAT / WHERE / WHY block. */
function FactRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className="flex-row gap-2.5">
      <View className="pt-0.5">
        <MaterialCommunityIcons name={icon} size={15} color={palette.inkMuted} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: palette.inkMuted }}>
          {label}
        </Text>
        <Body>{value}</Body>
      </View>
    </View>
  );
}

type SignalRow = {
  tag: string;
  label: string;
  feature: FeatureObject;
  quality: string;
  suppresses: boolean;
};

export function TwinScrewDiagnosisView({ machine, mappedChannels, devices, cards, live }: Props) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
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

  const { decision, diagnosis, state, context, quality, anomalies, features } = result;
  const stateDef = operatingStateDefinition(state.operatingState);

  const firedAnomalies = anomalies.filter(
    (entry) => entry.verdict !== 'NOT_ANOMALOUS' && entry.verdict !== 'NOT_EVALUATED',
  );
  const badQuality = quality.filter((entry) => entry.verdict === 'BAD' || entry.verdict === 'MISSING');
  const uncertainQuality = quality.filter((entry) => entry.verdict === 'UNCERTAIN');

  // Worst first: anything untrustworthy, then anything deviating, then the rest.
  // A table an operator scans top-down should put what needs them at the top.
  const signalRows: SignalRow[] = useMemo(() => {
    const rank = (row: SignalRow) =>
      row.quality === 'BAD' || row.quality === 'MISSING'
        ? 0
        : row.quality === 'UNCERTAIN'
          ? 1
          : row.feature.symbolicState.includes('ANOMALY')
            ? 2
            : 3;
    return features
      .map((feature) => {
        const found = quality.find((entry) => entry.signalId === feature.featureId);
        return {
          tag: feature.featureId,
          label: labelFor(feature.featureId),
          feature,
          quality: found?.verdict ?? 'MISSING',
          suppresses: found?.suppressesPhysicalDiagnosis ?? false,
        };
      })
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  }, [features, quality]);

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
    {
      value: 'evidence',
      label: 'Evidence',
      icon: 'clipboard-text-outline',
      count: firedAnomalies.length || undefined,
      countVariant: 'warning',
    },
    {
      value: 'signals',
      label: 'Signals',
      icon: 'access-point',
      count: badQuality.length + uncertainQuality.length || undefined,
      countVariant: badQuality.length > 0 ? 'destructive' : 'warning',
    },
  ];

  const signalColumns: Column<SignalRow>[] = [
    {
      key: 'signal',
      header: 'Signal',
      width: 3,
      render: (row) => (
        <View className="min-w-0 gap-0.5">
          <Cell numberOfLines={1}>{row.label}</Cell>
          <Cell mono muted numberOfLines={1}>
            {row.tag}
          </Cell>
        </View>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      width: 1.7,
      numeric: true,
      render: (row) => (
        <Cell numeric mono>
          {fmt(row.feature.currentValue)}
          {row.feature.currentValue !== null ? ` ${row.feature.unit}` : ''}
        </Cell>
      ),
    },
    {
      key: 'expected',
      header: 'Expected',
      width: 1.3,
      numeric: true,
      render: (row) => (
        <Cell numeric mono muted>
          {fmt(row.feature.expectedValue)}
        </Cell>
      ),
    },
    {
      key: 'deviation',
      header: 'Deviation',
      width: 1.4,
      numeric: true,
      render: (row) =>
        row.feature.percentDeviation === null ? (
          <Cell numeric muted>
            —
          </Cell>
        ) : (
          <Cell numeric mono>
            {row.feature.percentDeviation > 0 ? '+' : ''}
            {row.feature.percentDeviation.toFixed(1)}%
          </Cell>
        ),
    },
    {
      key: 'state',
      header: 'State',
      width: 2,
      render: (row) => (
        <Badge variant={symbolicVariant(row.feature.symbolicState)}>
          {row.feature.symbolicState.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'quality',
      header: 'Quality',
      width: 1.3,
      render: (row) => <Badge variant={qualityVariant(row.quality)}>{row.quality}</Badge>,
    },
  ];

  return (
    <View className="min-h-0 flex-1" style={{ backgroundColor: palette.bg }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 32, gap: 12 }}
      >
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

        <Alert variant="warning" icon="flask-outline" title="Engineering-development limits · not field calibrated">
          {result.commissioningNotice}
        </Alert>

        <Tabs items={tabs} value={tab} onChange={setTab} />

        {/* ---------------- Diagnosis ---------------- */}
        {tab === 'diagnosis' ? (
          <View className="gap-3">
            <VerdictBanner
              variant={diagnosis.sendToDoc05 ? severityVariant(decision.severity) : 'muted'}
              eyebrow={`${diagnosis.diagnosisState.replace(/_/g, ' ')} · ${decision.progression}`}
              title={diagnosis.primaryDiagnosis.replace(/_/g, ' ')}
              detail={diagnosis.what}
              meta={
                <View className="flex-row flex-wrap items-center gap-2">
                  {diagnosis.patternId ? <Badge variant="muted">{diagnosis.patternId}</Badge> : null}
                  <Badge variant={severityVariant(decision.severity)}>{decision.severity}</Badge>
                  <Badge variant={priorityVariant(decision.priority)}>
                    {decision.priority} · {PRIORITY_MEANING[decision.priority].name}
                  </Badge>
                </View>
              }
            />

            {/* The DOC-05 outputs, kept visually apart as §3 requires. */}
            <View className="flex-row flex-wrap gap-2">
              <StatTile
                className="min-w-[150px] flex-1"
                label="Severity"
                value={decision.severity}
                detail={
                  decision.severityAuthority
                    ? `Set by ${decision.severityAuthority.replace(/_/g, ' ').toLowerCase()}`
                    : 'No approved limit reached'
                }
                variant={severityVariant(decision.severity)}
                icon="alert-octagon-outline"
              />
              <StatTile
                className="min-w-[150px] flex-1"
                label="Priority"
                value={decision.priority}
                detail={PRIORITY_MEANING[decision.priority].name}
                variant={priorityVariant(decision.priority)}
                icon="clock-fast"
              />
              <StatTile
                className="min-w-[150px] flex-1"
                label="Fault confidence"
                value={decision.confidence.faultLevel}
                detail={`${(decision.confidence.fault * 100).toFixed(0)}% on the evidence available`}
                variant={confidenceVariant(decision.confidence.faultLevel)}
                icon="scale-balance"
                meter={decision.confidence.fault * 100}
              />
              <StatTile
                className="min-w-[150px] flex-1"
                label="Progression"
                value={decision.progression}
                detail={`Trend ${decision.trend.toLowerCase()}`}
                variant="info"
                icon="trending-up"
              />
            </View>

            <Card className="gap-3">
              <CardHeader>
                <CardTitle size="sm">The finding</CardTitle>
              </CardHeader>
              <Separator />
              <FactRow icon="help-circle-outline" label="What" value={diagnosis.what} />
              <FactRow icon="map-marker-outline" label="Where" value={diagnosis.where} />
              <FactRow
                icon="lightbulb-on-outline"
                label="Why"
                value={diagnosis.why || 'Nothing abnormal required explaining.'}
              />
            </Card>

            <Card className="gap-3">
              <CardHeader>
                <View className="flex-row flex-wrap items-center gap-2">
                  <CardTitle size="sm">Recommended action</CardTitle>
                  <Badge variant={priorityVariant(decision.priority)}>
                    {decision.recommendation.level.replace(/_/g, ' ')}
                  </Badge>
                </View>
              </CardHeader>
              <Separator />
              <Body>{decision.recommendation.text}</Body>
              <StepChain steps={decision.recommendation.steps} />
              <KeyValue label="Response window" value={PRIORITY_MEANING[decision.priority].window} />
              <Body muted>
                {decision.recommendation.authority === 'APPROVED_PROCEDURE'
                  ? 'This follows an approved plant procedure.'
                  : 'This is an ULTRON recommendation. An approved plant SOP outranks it.'}
              </Body>
            </Card>

            {/* Three confidences, because §13 says they are three answers. */}
            <Card className="gap-3">
              <CardHeader>
                <CardTitle size="sm">How certain, and of what</CardTitle>
              </CardHeader>
              <Separator />
              {(
                [
                  ['Fault mechanism', decision.confidence.fault, decision.confidence.faultLevel],
                  ['Location', decision.confidence.location, decision.confidence.locationLevel],
                  ['Root cause', decision.confidence.rootCause, decision.confidence.rootCauseLevel],
                ] as const
              ).map(([label, value, level]) => (
                <View key={label} className="gap-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="font-body-medium text-[13px]" style={{ color: palette.ink }}>
                      {label}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <Text className="font-mono text-[12px] tabular-nums" style={{ color: palette.inkMuted }}>
                        {(value * 100).toFixed(0)}%
                      </Text>
                      <Badge variant={confidenceVariant(level)}>{level.replace(/_/g, ' ')}</Badge>
                    </View>
                  </View>
                  <Meter value={value * 100} variant={confidenceVariant(level)} />
                </View>
              ))}
              <Body muted>
                Location can never exceed the fault, and root cause can never exceed location — you cannot be surer where
                a fault is than that it exists.
              </Body>
            </Card>

            <Collapsible
              title="Why this conclusion"
              summary="The four questions every decision must answer"
              icon="comment-question-outline"
            >
              <View className="gap-2.5">
                {decision.explainability.map((entry) => (
                  <View key={entry.question} className="gap-0.5">
                    <Text className="font-body-medium text-[12.5px]" style={{ color: palette.inkMuted }}>
                      {entry.question}
                    </Text>
                    <Body>{entry.answer}</Body>
                  </View>
                ))}
              </View>
            </Collapsible>
          </View>
        ) : null}

        {/* ---------------- Evidence ---------------- */}
        {tab === 'evidence' ? (
          <View className="gap-3">
            <View className="flex-row flex-wrap gap-2">
              <StatTile
                className="min-w-[180px] flex-1"
                label="Operating state"
                value={stateDef?.name ?? state.operatingState}
                detail={`${state.transitionType.toLowerCase()} transition`}
                variant={state.operatingState === 'ST-00' ? 'warning' : 'info'}
                icon="cog-outline"
                meter={state.stateConfidence * 100}
              />
              <StatTile
                className="min-w-[180px] flex-1"
                label="Context"
                value={`${(context.confidence * 100).toFixed(0)}%`}
                detail={
                  context.missing.length > 0
                    ? `Missing: ${context.missing.join(', ')}`
                    : 'All mandatory dimensions present'
                }
                variant={context.confidence >= 0.8 ? 'success' : context.confidence >= 0.5 ? 'warning' : 'destructive'}
                icon="tag-outline"
                meter={context.confidence * 100}
              />
            </View>

            {state.unknownReason ? (
              <Alert variant="warning" icon="help-circle-outline" title="The state could not be determined">
                {state.unknownReason}
              </Alert>
            ) : null}

            {state.stateEvidence.length > 0 ? (
              <Card className="gap-2">
                <CardHeader>
                  <CardTitle size="sm">What established the state</CardTitle>
                </CardHeader>
                <Separator />
                <View className="flex-row flex-wrap gap-1.5">
                  {state.stateEvidence.map((item) => (
                    <Badge key={item} variant="muted">
                      {item}
                    </Badge>
                  ))}
                </View>
              </Card>
            ) : null}

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
                const feature = features.find((item) => item.featureId === entry.signalId);
                return (
                  <Card key={entry.signalId} className="gap-2">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Badge variant={anomalyVariant(entry.verdict)}>{entry.verdict.replace(/_/g, ' ')}</Badge>
                      <Text className="font-body-bold text-[13.5px]" style={{ color: palette.ink }}>
                        {labelFor(entry.signalId)}
                      </Text>
                      {label ? <Badge variant="info">{label.anomalyId}</Badge> : null}
                      {entry.limitStatus !== 'NONE' ? <Badge variant="destructive">{entry.limitStatus}</Badge> : null}
                    </View>
                    {feature && feature.currentValue !== null && feature.expectedValue !== null ? (
                      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
                        <KeyValue label="Reading" value={`${fmt(feature.currentValue)} ${feature.unit}`} />
                        <KeyValue label="Expected" value={`${fmt(feature.expectedValue)} ${feature.unit}`} />
                        {feature.percentDeviation !== null ? (
                          <KeyValue
                            label="Deviation"
                            value={`${feature.percentDeviation > 0 ? '+' : ''}${feature.percentDeviation.toFixed(1)}%`}
                          />
                        ) : null}
                        {feature.baselineLevel ? (
                          <KeyValue label="Baseline" value={feature.baselineLevel.replace(/_/g, ' ').toLowerCase()} />
                        ) : null}
                      </View>
                    ) : null}
                    <Body muted>{entry.reason}</Body>
                  </Card>
                );
              })
            )}

            <SectionLabel>Evidence behind the diagnosis</SectionLabel>
            <Collapsible
              title="Supporting"
              summary={`${diagnosis.supportingEvidence.length} item${diagnosis.supportingEvidence.length === 1 ? '' : 's'}`}
              icon="check-circle-outline"
              variant="success"
              count={diagnosis.supportingEvidence.length}
              defaultOpen
            >
              <View className="gap-1.5">
                {diagnosis.supportingEvidence.length === 0 ? (
                  <Body muted>Nothing supports a fault, which is why none is claimed.</Body>
                ) : (
                  diagnosis.supportingEvidence.map((item) => (
                    <View key={item.statement} className="flex-row items-start gap-2">
                      <Badge variant="muted">{item.evidenceClass}</Badge>
                      <Body>{item.statement}</Body>
                    </View>
                  ))
                )}
              </View>
            </Collapsible>

            <Collapsible
              title="Contradicting"
              summary="Evidence that points somewhere else — never discarded"
              icon="alert-circle-outline"
              variant={diagnosis.contradictingEvidence.length > 0 ? 'warning' : 'muted'}
              count={diagnosis.contradictingEvidence.length}
            >
              <View className="gap-1.5">
                {diagnosis.contradictingEvidence.length === 0 ? (
                  <Body muted>Nothing contradicts the conclusion.</Body>
                ) : (
                  diagnosis.contradictingEvidence.map((item) => <Body key={item.statement}>{item.statement}</Body>)
                )}
              </View>
            </Collapsible>

            <Collapsible
              title="Missing"
              summary="Evidence that would sharpen this, and is unavailable"
              icon="help-circle-outline"
              variant={diagnosis.missingEvidence.length > 0 ? 'warning' : 'muted'}
              count={diagnosis.missingEvidence.length}
            >
              <View className="gap-1.5">
                {diagnosis.missingEvidence.length === 0 ? (
                  <Body muted>No useful evidence is unavailable.</Body>
                ) : (
                  diagnosis.missingEvidence.map((item) => <Body key={item.statement}>{item.statement}</Body>)
                )}
              </View>
            </Collapsible>

            {diagnosis.alternativeDiagnoses.length > 0 ? (
              <Collapsible
                title="Alternative explanations"
                summary="Kept open until the evidence rules them out"
                icon="source-branch"
                count={diagnosis.alternativeDiagnoses.length}
              >
                <View className="flex-row flex-wrap gap-1.5">
                  {diagnosis.alternativeDiagnoses.map((item) => (
                    <Badge key={item} variant="muted">
                      {item}
                    </Badge>
                  ))}
                </View>
              </Collapsible>
            ) : null}

            {diagnosis.groupedSymptoms.length > 0 ? (
              <Collapsible
                title="Grouped symptoms"
                summary="Consequences of the primary fault, not separate faults"
                icon="file-tree-outline"
                count={diagnosis.groupedSymptoms.length}
              >
                <View className="flex-row flex-wrap gap-1.5">
                  {diagnosis.groupedSymptoms.map((item) => (
                    <Badge key={item} variant="muted">
                      {item}
                    </Badge>
                  ))}
                </View>
              </Collapsible>
            ) : null}
          </View>
        ) : null}

        {/* ---------------- Signals ---------------- */}
        {tab === 'signals' ? (
          <View className="gap-3">
            <View className="flex-row flex-wrap gap-2">
              <StatTile
                className="min-w-[150px] flex-1"
                label="Reporting"
                value={`${result.reportingCount}/${signalRows.length}`}
                detail="Mapped signals with a live value"
                variant={result.reportingCount === signalRows.length ? 'success' : 'warning'}
                icon="access-point"
              />
              <StatTile
                className="min-w-[150px] flex-1"
                label="BAD or MISSING"
                value={String(badQuality.length)}
                detail={badQuality.length > 0 ? 'Physical diagnosis suppressed for these' : 'All signals trustworthy'}
                variant={badQuality.length > 0 ? 'destructive' : 'success'}
                icon="alert-circle-outline"
              />
              <StatTile
                className="min-w-[150px] flex-1"
                label="Uncertain"
                value={String(uncertainQuality.length)}
                detail="Usable, but with reduced weight"
                variant={uncertainQuality.length > 0 ? 'warning' : 'success'}
                icon="help-circle-outline"
              />
            </View>

            <Card className="gap-2">
              <CardHeader>
                <CardTitle size="sm">Every mapped signal</CardTitle>
              </CardHeader>
              <Separator />
              <DataTable
                columns={signalColumns}
                rows={signalRows}
                keyOf={(row) => row.tag}
                minWidth={760}
                emptyLabel="No channels are mapped to this machine yet."
              />
            </Card>

            {badQuality.length + uncertainQuality.length > 0 ? (
              <>
                <SectionLabel>Data-quality findings</SectionLabel>
                {[...badQuality, ...uncertainQuality].map((entry) => (
                  <Collapsible
                    key={entry.signalId}
                    title={labelFor(entry.signalId)}
                    summary={`${entry.verdict}${entry.suppressesPhysicalDiagnosis ? ' · suppresses physical diagnosis' : ''}`}
                    icon="alert-circle-outline"
                    variant={qualityVariant(entry.verdict)}
                    count={entry.findings.length}
                    defaultOpen={entry.verdict === 'BAD' || entry.verdict === 'MISSING'}
                  >
                    <View className="gap-2">
                      {entry.findings.map((finding) => (
                        <View key={finding.ruleId + finding.reason} className="gap-0.5">
                          <View className="flex-row flex-wrap items-center gap-2">
                            <Badge variant={qualityVariant(finding.verdict)}>{finding.ruleId}</Badge>
                            <Text className="font-body-medium text-[12.5px]" style={{ color: palette.ink }}>
                              {finding.check}
                            </Text>
                          </View>
                          <Body muted>{finding.reason}</Body>
                          <Body muted>Downstream: {finding.downstreamRule}</Body>
                        </View>
                      ))}
                    </View>
                  </Collapsible>
                ))}
              </>
            ) : null}

            <Collapsible
              title="Signal gap"
              summary={`${result.unboundMandatory.length} DOC-02 mandatory signals have no instrument here`}
              icon="lan-disconnect"
              variant="warning"
              count={result.unboundMandatory.length}
            >
              <View className="gap-2">
                <Body muted>
                  Most of these are control-system values a PLC already holds. Connecting them moves the operating state
                  off inference and lets the context engine select a real baseline instead of the broader-context
                  fallback it uses now.
                </Body>
                <View className="flex-row flex-wrap gap-1.5">
                  {result.unboundMandatory.map((signal) => (
                    <Badge key={signal} variant="muted">
                      {signal}
                    </Badge>
                  ))}
                </View>
              </View>
            </Collapsible>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
