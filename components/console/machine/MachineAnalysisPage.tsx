import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  countAnalysis,
  deriveVerdict,
  unverifiedSignals,
  type AnalysisSignal,
  type Finding,
  type Hypothesis,
} from '../../../lib/analysisDiagnosis';
import {
  CONDITION_LABEL,
  conditionHexes,
  type Issue,
  type OverviewCondition,
  type ProgressionEvent,
} from '../../../lib/analysisOverview';
import type { AnalystHypothesis, ChainStep, Conclusion, DataQuality } from '../../../lib/advancedDiagnosis';
import { cn } from '../../../lib/cn';
import { consolePalette } from '../../../lib/consoleTheme';
import { Panel } from '../../Panel';
import { AnalysisTabs, type AnalysisDepth } from './analysis/AnalysisTabs';
import { DoThisList, ThenConfirmList, type ActionPriority } from './analysis/ActionList';
import { CountsPanel } from './analysis/CountsPanel';
import { EvidenceSplit } from './analysis/EvidenceSplit';
import { EvidenceTable } from './analysis/EvidenceTable';
import { SignalStrip } from './analysis/SignalStrip';
import { VerdictBanner } from './analysis/VerdictBanner';
import {
  buildDiagnosisModel,
  type DiagnosisChainStep,
  type DiagnosisDifferential,
  type DiagnosisProblem,
  type DiagnosisSensorEvidence,
} from './analysis/diagnosisModel';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';

// Two-column blocks: grow to fill, drop to one column rather than squeezing a
// rule table and a checklist into 150px each.
const WIDE = { flexGrow: 3, flexBasis: 560, minWidth: 320 } as const;
const NARROW = { flexGrow: 1, flexBasis: 280, minWidth: 260 } as const;

const SIGNAL_GAP = 12;
const SIGNAL_MIN_WIDTH = 236;
const PROBLEM_RAIL = { flexGrow: 3, flexBasis: 320, minWidth: 280 } as const;
const CASE_DETAIL = { flexGrow: 7, flexBasis: 700, minWidth: 320 } as const;
const REPORT_COLUMN = { flexGrow: 1, flexBasis: 245, minWidth: 220 } as const;
const IMPACT_CELL = { flexGrow: 1, flexBasis: 220, minWidth: 190 } as const;

const DEFAULT_CONCLUSION: Conclusion = {
  suggested: 'No automatic conclusion is active.',
  analystAssessment: null,
  failureMechanism: null,
  rootCause: null,
  remainingUncertainty: 'No unresolved diagnostic uncertainty has been recorded for this snapshot.',
  status: 'under-investigation',
};

function EmptyCase({ modelCaveat }: { modelCaveat?: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="items-center gap-2 rounded-xl border px-5 py-8" style={{ borderColor: hairline, borderStyle: 'dashed' }}>
      <Text className={cn('font-heading-medium text-[18px]', inkClass)}>No active Pro Diagnosis case</Text>
      <Text className={cn('max-w-[540px] text-center font-body text-[11px] leading-[17px]', mutedClass)}>
        Available findings are inside the configured diagnostic envelope, so the page is holding a healthy state instead of inventing a fault.
      </Text>
      {modelCaveat ? <Text className={cn('max-w-[540px] text-center font-mono text-[9px]', mutedClass)}>{modelCaveat}</Text> : null}
    </View>
  );
}

function ProblemCaseButton({
  problem,
  selected,
  onPress,
}: {
  problem: DiagnosisProblem;
  selected: boolean;
  onPress: () => void;
}) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const line = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  const tint = conditionHex[problem.condition];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Open Pro Diagnosis case ${problem.title}`}
      className={cn('rounded-lg border px-3 py-2.5', selected && 'bg-accent/10')}
      style={{ borderColor: selected ? `${tint}99` : line }}
    >
      <View className="flex-row items-start gap-2">
        <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: tint }} />
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text numberOfLines={1} className={cn('flex-1 font-body-medium text-[12px]', selected ? 'text-accent' : inkClass)}>
              {problem.title}
            </Text>
            <Text style={{ color: tint }} className="font-mono text-[8px] font-bold tracking-wider">
              {CONDITION_LABEL[problem.condition]}
            </Text>
          </View>
          <Text numberOfLines={1} className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>
            {problem.component.toUpperCase()} / {problem.category}
          </Text>
          <Text numberOfLines={2} className={cn('font-body text-[10px] leading-[14px]', mutedClass)}>
            {problem.primaryFinding}
          </Text>
          <View className="flex-row flex-wrap gap-x-3 gap-y-1">
            <Text className={cn('font-mono text-[8px]', mutedClass)}>{problem.scoreLabel}</Text>
            <Text className={cn('font-mono text-[8px]', mutedClass)}>{problem.coverageLabel}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function FactTile({ label, value, tint }: { label: string; value: string; tint?: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="gap-1 rounded-lg border px-3 py-2" style={{ flexGrow: 1, flexBasis: 160, minWidth: 140, borderColor: hairline }}>
      <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{label}</Text>
      <Text style={tint ? { color: tint } : undefined} className={cn('font-mono text-[12px] tabular-nums', !tint && inkClass)}>
        {value}
      </Text>
    </View>
  );
}

function ProSection({ title, children }: { title: string; children: ReactNode }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  return (
    <View className="gap-2">
      <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>{title}</Text>
      {children}
    </View>
  );
}

function ChainStepper({ steps }: { steps: DiagnosisChainStep[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const palette = consolePalette(isDark);
  const line = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="flex-row flex-wrap gap-2">
      {steps.map((step, index) => (
        <View key={`${step.label}-${index}`} className="rounded-lg border px-3 py-2.5" style={{ flexGrow: 1, flexBasis: 220, minWidth: 190, borderColor: line }}>
          <View className="mb-1 flex-row items-center justify-between gap-2">
            <Text className={cn('font-mono text-[8px] font-bold tracking-wider', mutedClass)}>
              {String(index + 1).padStart(2, '0')} / {step.label.toUpperCase()}
            </Text>
            <Text style={{ color: step.established ? palette.accent : palette.warning }} className="font-mono text-[8px] font-bold tracking-wider">
              {step.established ? 'ESTABLISHED' : 'TO CONFIRM'}
            </Text>
          </View>
          <Text className={cn('font-body text-[11px] leading-[16px]', inkClass)}>{step.value}</Text>
        </View>
      ))}
    </View>
  );
}

function CauseRanking({ differentials }: { differentials: DiagnosisDifferential[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="gap-2">
      {differentials.map((item, index) => (
        <View key={item.id} className="flex-row gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: hairline }}>
          <Text className="font-mono text-[11px] font-bold tabular-nums text-accent">{String(index + 1).padStart(2, '0')}</Text>
          <View className="min-w-0 flex-1 gap-1">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text className={cn('font-body-medium text-[12px]', inkClass)}>{item.name}</Text>
              <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>
                {item.status} / {item.matchScore === null ? 'MATCH SCORE NOT RATED' : `MATCH SCORE ${item.matchScore}`}
              </Text>
            </View>
            <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>{item.mechanism}</Text>
            <Text className={cn('font-mono text-[8px]', mutedClass)}>
              {item.limiting.length > 0 ? `Limited by: ${item.limiting.join(' / ')}` : 'Available expected evidence is present.'}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function EvidenceRows({ items }: { items: DiagnosisSensorEvidence[] }) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  if (items.length === 0) {
    return <Text className={cn('font-body text-[11px] italic', mutedClass)}>No sensor rows are scoped to this problem.</Text>;
  }

  return (
    <View className="gap-1">
      {items.map((item) => (
        <View key={item.id} className="flex-row flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: hairline }}>
          <Text numberOfLines={1} className={cn('min-w-[180px] flex-1 font-body-medium text-[11px]', inkClass)}>
            {item.measurement}
          </Text>
          <Text className={cn('w-[92px] font-mono text-[10px] tabular-nums', inkClass)}>{item.value}</Text>
          <Text className={cn('w-[108px] font-mono text-[9px]', mutedClass)}>{item.trend}</Text>
          <Text className={cn('w-[92px] font-mono text-[9px]', mutedClass)}>{item.quality}</Text>
          <Text style={{ color: conditionHex[item.condition] }} className="w-[78px] font-mono text-[8px] font-bold tracking-wider">
            {CONDITION_LABEL[item.condition]}
          </Text>
        </View>
      ))}
    </View>
  );
}

function EvidenceColumn({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="gap-2 rounded-lg border px-3 py-2.5" style={{ ...REPORT_COLUMN, borderColor: hairline }}>
      <Text className={cn('font-body-medium text-[11px]', inkClass)}>{title}</Text>
      {items.length > 0 ? (
        items.map((item) => (
          <View key={item} className="flex-row gap-2">
            <Text className={cn('font-mono text-[9px]', mutedClass)}>+</Text>
            <Text className={cn('flex-1 font-body text-[10px] leading-[15px]', mutedClass)}>{item}</Text>
          </View>
        ))
      ) : (
        <Text className={cn('font-body text-[10px] italic leading-[15px]', mutedClass)}>{empty}</Text>
      )}
    </View>
  );
}

function ImpactGrid({ impacts }: { impacts: DiagnosisProblem['impacts'] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="flex-row flex-wrap gap-2">
      {impacts.map((impact) => (
        <View key={impact.label} className="gap-1 rounded-lg border px-3 py-2.5" style={{ ...IMPACT_CELL, borderColor: hairline }}>
          <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{impact.label}</Text>
          <Text className={cn('font-body text-[10px] leading-[15px]', inkClass)}>{impact.value}</Text>
        </View>
      ))}
    </View>
  );
}

export type MachineAnalysisPageProps = {
  machineName: string;
  template: string;
  hierarchyPath?: string;
  feed: FeedStatus;
  ageSeconds?: number | null;
  // "Producing · 6 h 14 m".
  runState?: string;

  signals: AnalysisSignal[];
  findings: Finding[];
  hypothesis: Hypothesis | null;
  issues?: Issue[];
  progression?: ProgressionEvent[];
  condition?: OverviewCondition;
  dataQuality?: DataQuality;
  hypotheses?: AnalystHypothesis[];
  chain?: ChainStep[];
  conclusion?: Conclusion;

  doThis: string[];
  doThisPriority?: ActionPriority;
  thenConfirm: string[];
  // Standing caveat about what this model is and is not allowed to do.
  modelCaveat?: string;

  onVerifyChain?: () => void;
  onOpenTrend?: () => void;
  onSelectDepth?: (depth: AnalysisDepth) => void;
  selectedProblemId?: string | null;
  onSelectProblem?: (problemId: string) => void;
  // Rendered at the end of the depth row — used for the link out to the machine
  // overview, so that cross-link lives in an existing row.
  tabsTrailing?: ReactNode;
  onSelectMachine?: () => void;
  onRefresh?: () => void;
};

// The analysis view for one machine: what the model thinks is wrong, whether that
// is the machine or the instrument measuring it, every rule that supports the
// claim, and what to do about it.
//
// All judgement lives in lib/analysis.ts. This file arranges it, and the order it
// arranges it in is the argument: verdict, then what the evidence is even about,
// then the evidence, then the action. A reader who stops after the first screen
// should still have been told the most important thing — which on this page is
// often "do not touch the machine, check the sensor".
export function MachineAnalysisPage({
  machineName,
  template,
  hierarchyPath,
  feed,
  ageSeconds,
  runState,
  signals,
  findings,
  hypothesis,
  issues = [],
  progression = [],
  condition = 'healthy',
  dataQuality = 'good',
  hypotheses = [],
  chain = [],
  conclusion = DEFAULT_CONCLUSION,
  doThis,
  doThisPriority = 'medium',
  thenConfirm,
  modelCaveat,
  onVerifyChain,
  onOpenTrend,
  onSelectDepth,
  selectedProblemId,
  onSelectProblem,
  tabsTrailing,
  onSelectMachine,
  onRefresh,
}: MachineAnalysisPageProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  const conditionHex = conditionHexes(isDark);

  const [stripWidth, setStripWidth] = useState<number | null>(null);
  const [localProblemId, setLocalProblemId] = useState(selectedProblemId ?? '');

  const counts = useMemo(() => countAnalysis(findings), [findings]);
  const verdict = useMemo(() => deriveVerdict(findings, hypothesis), [findings, hypothesis]);
  const unverified = useMemo(() => unverifiedSignals(findings), [findings]);
  const diagnosisModel = useMemo(
    () =>
      buildDiagnosisModel({
        issues,
        signals,
        findings,
        hypothesis,
        hypotheses,
        doThis,
        thenConfirm,
        modelCaveat,
        chain,
        conclusion,
        dataQuality,
      }),
    [chain, conclusion, dataQuality, doThis, findings, hypothesis, hypotheses, issues, modelCaveat, signals, thenConfirm],
  );
  const selectedProblem =
    diagnosisModel.problems.find((problem) => problem.id === (selectedProblemId ?? localProblemId)) ??
    diagnosisModel.problems[0] ??
    null;
  const selectedFindings = selectedProblem
    ? findings.filter((finding) =>
        selectedProblem.sensorEvidence.some(
          (evidence) => evidence.code === finding.signalCode || evidence.measurement === finding.signalLabel,
        ),
      )
    : findings;

  useEffect(() => {
    if (selectedProblemId) setLocalProblemId(selectedProblemId);
  }, [selectedProblemId]);

  useEffect(() => {
    if (diagnosisModel.problems.length === 0) {
      setLocalProblemId('');
      return;
    }
    const requested = selectedProblemId ?? localProblemId;
    if (!diagnosisModel.problems.some((problem) => problem.id === requested)) {
      setLocalProblemId(diagnosisModel.problems[0].id);
    }
  }, [diagnosisModel.problems, localProblemId, selectedProblemId]);

  const selectProblem = (id: string) => {
    setLocalProblemId(id);
    onSelectProblem?.(id);
  };

  // Signal strips divide the row exactly rather than leaving a ragged gap.
  const perRow = stripWidth
    ? Math.max(1, Math.floor((stripWidth + SIGNAL_GAP) / (SIGNAL_MIN_WIDTH + SIGNAL_GAP)))
    : Math.min(4, signals.length || 1);
  const stripItemWidth = stripWidth ? Math.floor((stripWidth - SIGNAL_GAP * (perRow - 1)) / perRow) : undefined;

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 20 }}>
      <MachineHeader
        machineName={machineName}
        template={template}
        path={hierarchyPath}
        subtitle="Pro Diagnosis rule evidence and measurement-chain validation"
        section="ANALYSIS / PRO DIAGNOSIS"
        feed={feed}
        ageSeconds={ageSeconds}
        onSelectMachine={onSelectMachine}
        onRefresh={onRefresh}
      />

      <AnalysisTabs active="diagnosis" onSelect={onSelectDepth} trailing={tabsTrailing} />

      <VerdictBanner
        verdict={verdict}
        hypothesis={hypothesis}
        runState={runState}
        onPrimaryAction={onVerifyChain}
        primaryActionLabel={verdict.chainSuspected ? 'Verify sensor chain' : 'Open work order'}
        onOpenTrend={onOpenTrend}
      />

      <View className="gap-3">
        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>Signals</Text>
        <View
          className="flex-row flex-wrap"
          style={{ gap: SIGNAL_GAP }}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            setStripWidth((prev) => (prev !== null && Math.abs(prev - w) < 1 ? prev : w));
          }}
        >
          {signals.map((signal) => (
            <SignalStrip key={signal.code} signal={signal} unverified={unverified.has(signal.code)} width={stripItemWidth} />
          ))}
        </View>
      </View>

      <View className="flex-row flex-wrap items-stretch gap-4">
        <View style={PROBLEM_RAIL}>
          <Panel fill>
            <View className="gap-3">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>
                    Pro Diagnosis cases
                  </Text>
                  <Text className={cn('mt-1 font-mono text-[9px]', mutedClass)}>
                    {diagnosisModel.problems.length} active / data {diagnosisModel.dataQuality}
                  </Text>
                </View>
                <Text style={{ color: conditionHex[selectedProblem?.condition ?? condition] }} className="font-mono text-[9px] font-bold tracking-wider">
                  {CONDITION_LABEL[selectedProblem?.condition ?? condition]}
                </Text>
              </View>

              {diagnosisModel.problems.length > 0 ? (
                <View className="gap-2">
                  {diagnosisModel.problems.map((problem) => (
                    <ProblemCaseButton
                      key={problem.id}
                      problem={problem}
                      selected={problem.id === selectedProblem?.id}
                      onPress={() => selectProblem(problem.id)}
                    />
                  ))}
                </View>
              ) : (
                <EmptyCase modelCaveat={diagnosisModel.modelCaveat} />
              )}
            </View>
          </Panel>
        </View>

        <View style={CASE_DETAIL}>
          <Panel fill>
            {selectedProblem ? (
              <View className="gap-5">
                <View className="flex-row flex-wrap items-start justify-between gap-3">
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">
                      MACHINE DOCTOR / SELECTED PROBLEM
                    </Text>
                    <Text className={cn('font-heading-medium text-[22px]', inkClass)}>{selectedProblem.title}</Text>
                    <Text className={cn('font-mono text-[9px]', mutedClass)}>
                      {machineName} / {selectedProblem.component} / {selectedProblem.category}
                    </Text>
                  </View>
                  <View className="rounded-lg border px-3 py-2" style={{ borderColor: `${conditionHex[selectedProblem.condition]}66` }}>
                    <Text style={{ color: conditionHex[selectedProblem.condition] }} className="font-mono text-[10px] font-bold tracking-wider">
                      {CONDITION_LABEL[selectedProblem.condition]}
                    </Text>
                  </View>
                </View>

                <ChainStepper steps={selectedProblem.chain} />

                <View className="flex-row flex-wrap gap-2">
                  <FactTile label="MATCH SCORE" value={selectedProblem.matchScore === null ? 'NOT RATED' : String(selectedProblem.matchScore)} />
                  <FactTile label="COVERAGE" value={selectedProblem.coverageLabel} />
                  <FactTile label="PROGRESSION" value={selectedProblem.trend.toUpperCase()} />
                  <FactTile label="LIFECYCLE" value={selectedProblem.lifecycle.toUpperCase()} />
                  <FactTile label="CONSEQUENCE" value={selectedProblem.consequence.toUpperCase()} />
                </View>

                <ProSection title="Differential Cause Ranking">
                  <>
                    <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>
                      Engineering support ranking only. These numbers are not calibrated failure probabilities.
                    </Text>
                    <CauseRanking differentials={selectedProblem.differentials} />
                  </>
                </ProSection>

                <View className="flex-row flex-wrap gap-2">
                  <EvidenceColumn
                    title="Supporting evidence"
                    items={selectedProblem.supportingEvidence}
                    empty="No supporting evidence is scoped to this problem yet."
                  />
                  <EvidenceColumn
                    title="Contradicting evidence"
                    items={selectedProblem.contradictingEvidence}
                    empty="No material contradiction detected."
                  />
                  <EvidenceColumn
                    title="Missing evidence"
                    items={selectedProblem.missingEvidence}
                    empty="No expected evidence is currently missing."
                  />
                </View>

                <ProSection title="Supporting Sensor Evidence">
                  <EvidenceRows items={selectedProblem.sensorEvidence} />
                </ProSection>

                <ProSection title="Rule Evidence">
                  <EvidenceTable findings={selectedFindings.length > 0 ? selectedFindings : findings} onOpenTrend={onOpenTrend ? () => onOpenTrend() : undefined} />
                </ProSection>

                <ProSection title="Impact Summary">
                  <ImpactGrid impacts={selectedProblem.impacts} />
                </ProSection>

                <View className="flex-row flex-wrap items-stretch gap-4">
                  <View style={NARROW}>
                    <Panel fill>
                      <DoThisList steps={selectedProblem.differentials[0]?.correctiveActions.length ? selectedProblem.differentials[0].correctiveActions : doThis} priority={doThisPriority} title="Corrective options" />
                    </Panel>
                  </View>
                  <View style={NARROW}>
                    <Panel fill>
                      <ThenConfirmList criteria={selectedProblem.verification.length > 0 ? selectedProblem.verification : thenConfirm} footnote={diagnosisModel.modelCaveat} />
                    </Panel>
                  </View>
                  <View style={NARROW}>
                    <Panel fill>
                      <View className="gap-3">
                        <Text className={cn('font-body-medium text-[11px] uppercase tracking-wider', mutedClass)}>
                          Confirmation checks
                        </Text>
                        {(selectedProblem.confirmationChecks.length > 0 ? selectedProblem.confirmationChecks : thenConfirm).map((item, index) => (
                          <View key={`${item}-${index}`} className="flex-row gap-2.5">
                            <Text className="w-[14px] font-mono text-[10px] text-accent">{index + 1}</Text>
                            <Text className={cn('flex-1 font-body text-[11px] leading-[17px]', inkClass)}>{item}</Text>
                          </View>
                        ))}
                        {onVerifyChain ? (
                          <Pressable
                            onPress={onVerifyChain}
                            accessibilityRole="button"
                            accessibilityLabel="Verify this Pro Diagnosis chain"
                            className="rounded-lg border border-accent/35 bg-accent/10 px-3 py-2"
                          >
                            <Text className="text-center font-mono text-[9px] font-bold tracking-wider text-accent">
                              VERIFY CHAIN
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </Panel>
                  </View>
                </View>

                {progression.length > 0 ? (
                  <ProSection title="Progression History">
                    <View className="gap-1.5">
                      {progression.slice(0, 4).map((item) => (
                        <View key={item.id} className="flex-row flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: hairline }}>
                          <Text style={{ width: 86, color: conditionHex[item.condition] }} className="font-mono text-[8px] font-bold tracking-wider">
                            {CONDITION_LABEL[item.condition]}
                          </Text>
                          <Text className={cn('w-[68px] font-mono text-[9px]', mutedClass)}>{item.at}</Text>
                          <Text className={cn('min-w-[220px] flex-1 font-body text-[10px] leading-[15px]', inkClass)}>{item.text}</Text>
                        </View>
                      ))}
                    </View>
                  </ProSection>
                ) : null}
              </View>
            ) : (
              <EmptyCase modelCaveat={diagnosisModel.modelCaveat} />
            )}
          </Panel>
        </View>
      </View>

      <View className="flex-row flex-wrap items-stretch gap-4">
        <View style={WIDE}>
          <Panel fill>
            <EvidenceSplit counts={counts} unverifiedCount={unverified.size} />
          </Panel>
        </View>

        <View style={NARROW} className="gap-4">
          <Panel fill>
            <CountsPanel counts={counts} />
          </Panel>
        </View>
      </View>
    </ScrollView>
  );
}
