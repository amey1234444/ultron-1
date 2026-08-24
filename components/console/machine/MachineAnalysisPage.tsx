import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import {
  countAnalysis,
  deriveVerdict,
  unverifiedSignals,
  type AnalysisSignal,
  type Finding,
  type Hypothesis,
} from '../../../lib/analysisDiagnosis';
import { cn } from '../../../lib/cn';
import { Panel } from '../../Panel';
import { AnalysisTabs, type AnalysisDepth } from './analysis/AnalysisTabs';
import { DoThisList, ThenConfirmList, type ActionPriority } from './analysis/ActionList';
import { CountsPanel } from './analysis/CountsPanel';
import { EvidenceSplit } from './analysis/EvidenceSplit';
import { EvidenceTable } from './analysis/EvidenceTable';
import { SignalStrip } from './analysis/SignalStrip';
import { VerdictBanner } from './analysis/VerdictBanner';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';

// Two-column blocks: grow to fill, drop to one column rather than squeezing a
// rule table and a checklist into 150px each.
const WIDE = { flexGrow: 3, flexBasis: 560, minWidth: 320 } as const;
const NARROW = { flexGrow: 1, flexBasis: 280, minWidth: 260 } as const;

const SIGNAL_GAP = 12;
const SIGNAL_MIN_WIDTH = 236;

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

  doThis: string[];
  doThisPriority?: ActionPriority;
  thenConfirm: string[];
  // Standing caveat about what this model is and is not allowed to do.
  modelCaveat?: string;

  onVerifyChain?: () => void;
  onOpenTrend?: () => void;
  onSelectDepth?: (depth: AnalysisDepth) => void;
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
  doThis,
  doThisPriority = 'medium',
  thenConfirm,
  modelCaveat,
  onVerifyChain,
  onOpenTrend,
  onSelectDepth,
  tabsTrailing,
  onSelectMachine,
  onRefresh,
}: MachineAnalysisPageProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const [stripWidth, setStripWidth] = useState<number | null>(null);

  const counts = useMemo(() => countAnalysis(findings), [findings]);
  const verdict = useMemo(() => deriveVerdict(findings, hypothesis), [findings, hypothesis]);
  const unverified = useMemo(() => unverifiedSignals(findings), [findings]);

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
        subtitle="Analysis layer"
        section="ANALYSIS"
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

      {/* The split comes before the evidence table: it says what the table is
          about, and it is the finding most likely to change what happens next. */}
      <View className="flex-row flex-wrap items-stretch gap-4">
        <View style={WIDE}>
          <Panel fill>
            <EvidenceSplit counts={counts} unverifiedCount={unverified.size} />
          </Panel>
        </View>
        <View style={NARROW}>
          <Panel fill>
            <CountsPanel counts={counts} />
          </Panel>
        </View>
      </View>

      <View className="flex-row flex-wrap items-stretch gap-4">
        <View style={WIDE}>
          <Panel fill>
            <EvidenceTable findings={findings} onOpenTrend={onOpenTrend ? () => onOpenTrend() : undefined} />
          </Panel>
        </View>

        <View style={NARROW} className="gap-4">
          <Panel>
            <DoThisList steps={doThis} priority={doThisPriority} />
          </Panel>
          <Panel fill>
            <ThenConfirmList criteria={thenConfirm} footnote={modelCaveat} />
          </Panel>
        </View>
      </View>
    </ScrollView>
  );
}
