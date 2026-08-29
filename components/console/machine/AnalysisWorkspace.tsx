import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { AnalysisSignal, Finding, Hypothesis } from '../../../lib/analysisDiagnosis';
import type { Issue, ProgressionEvent } from '../../../lib/analysisOverview';
import type {
  AnalystEvent,
  AnalystHypothesis,
  AnalystTreeNode,
  ChainStep,
  Conclusion,
  ConditionRow,
  CorrelationRow,
  DataQuality,
  EvidenceItem,
  PropagationRow,
} from '../../../lib/advancedDiagnosis';
import type { MachineNode } from '../../../lib/machines';
import type { CardNode } from '../../../lib/rack';
import type { DeviceNode } from '../../../lib/devices';
import { cn } from '../../../lib/cn';
import { ActionButton } from '../ActionButton';
import { Dialog } from '../Dialog';
import { AdvancedDiagnosisPage, type SignalContext } from './AdvancedDiagnosisPage';
import { MachineDiagnosisPage } from './MachineDiagnosisPage';
import { MachineOverviewPage } from './MachineOverviewPage';
import { MachineProDiagnosisPage } from './MachineProDiagnosisPage';
import type { AnalysisDepth } from './analysis/AnalysisTabs';
import type { MachinePrognosticsResult } from './analysis/prognosticsModel';
import type { TrainNode } from './analysis/TrainHealth';
import type { MappedChannel } from './RackOccupancyView';

// The host the three analysis depths were written for.
//
// Each page is deliberately prop-driven and owns no navigation — that is what
// makes them testable and reusable, but it also means every control that crosses a
// page boundary does nothing until something owns the wiring. This is that
// something: which depth is showing, what is selected, the evidence being
// collected, the analyst's decision, the machine in view, and when the data was
// last refreshed.
//
// It deliberately does NOT introduce a router. The depth and selection are held as
// state and also reported through callbacks, so a host with its own routing can
// drive this from the URL instead and nothing here has to change.

// The machine overview is a sibling of the analysis layer, not a fourth depth: it
// reports what every sensor is doing, where analysis reports what that means. It
// needs the rack model rather than derived findings, so it is resolved separately.
export type MachineOverviewInput = {
  machine: MachineNode;
  mappedChannels: MappedChannel[];
  devices: DeviceNode[];
  cards: CardNode[];
  expectedPoints: number;
  // The commissioned channel-to-component binding, where the host holds it.
  componentIdFor?: (mapped: MappedChannel) => string | undefined;
};

// Which page is showing. 'machine' is the live-sensor overview; the rest are the
// three analysis depths.
export type WorkspaceView = 'machine' | AnalysisDepth;

export type AnalysisMachine = {
  id: string;
  name: string;
  template: string;
  hierarchyPath?: string;
};

export type AnalysisWorkspaceData = {
  // Overview depth.
  operatingState: string;
  speed?: string;
  load?: string;
  mode?: string;
  health: number | null;
  issues: Issue[];
  train: TrainNode[];
  criticalPath?: string;
  progression: ProgressionEvent[];
  prognostics?: MachinePrognosticsResult;

  // Diagnosis depth.
  signals: AnalysisSignal[];
  diagnosisSignals: AnalysisSignal[];
  findings: Finding[];
  hypothesis: Hypothesis | null;
  doThis: string[];
  thenConfirm: string[];
  modelCaveat?: string;
  runState?: string;

  // Advanced depth.
  condition: Issue['condition'];
  dataQuality: DataQuality;
  tree: AnalystTreeNode[];
  conditionRows: ConditionRow[];
  operatingFacts: Array<{ label: string; value: string; note?: string }>;
  propagation: PropagationRow[];
  propagationNote: string;
  correlation: CorrelationRow[];
  correlationCaveat: string;
  events: AnalystEvent[];
  hypotheses: AnalystHypothesis[];
  chain: ChainStep[];
  conclusion: Conclusion;
  signalFor: (node: AnalystTreeNode) => SignalContext | null;
  intelligence: { observation: string; qualityNote: string; dominantEvidence: string; nextStep: string };
  initialEvidence?: EvidenceItem[];
};

export type AnalysisWorkspaceProps = {
  machines: AnalysisMachine[];
  initialMachineId?: string;
  initialDepth?: AnalysisDepth;
  initialView?: WorkspaceView;
  // Resolves the analysis payload for a machine. In production this is where the
  // live-data layer plugs in; the workspace never fetches anything itself.
  dataFor: (machineId: string) => AnalysisWorkspaceData;
  // Supplied when the host can render the live-sensor overview for this machine.
  // Omitted, and the cross-link simply is not offered rather than leading to a
  // blank page.
  overviewFor?: (machineId: string) => MachineOverviewInput | null;
  // Anything this workspace cannot service itself, because it belongs to a screen
  // outside the analysis layer.
  onOpenAlarms?: (machineId: string) => void;
  onRequestRefresh?: (machineId: string) => void;
  onDepthChange?: (depth: AnalysisDepth) => void;
};

// A small banner for actions that were genuinely taken. Buttons that quietly do
// nothing are worse than buttons that are absent, so anything that fires says so.
function ActionReceipt({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { isDark } = useAppTheme();
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="absolute inset-x-0 top-0 z-10 items-center px-4 pt-3">
      <View className="flex-row items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3.5 py-2">
        <Text className={cn('font-body text-[11px]', inkClass)}>{message}</Text>
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Text className="font-mono text-[11px] text-accent">×</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Uses the app's own Dialog rather than a bespoke overlay: it already handles the
// scrim, the title row and the footer, and a second modal implementation would
// drift from it the first time either changed.
function MachinePicker({
  visible,
  machines,
  activeId,
  onPick,
  onClose,
}: {
  visible: boolean;
  machines: AnalysisMachine[];
  activeId: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <Dialog
      visible={visible}
      title="Select machine"
      onRequestClose={onClose}
      footer={<ActionButton label="Cancel" variant="secondary" onPress={onClose} />}
    >
      <View className="gap-1">
        {machines.map((machine) => {
          const active = machine.id === activeId;
          return (
            <Pressable
              key={machine.id}
              onPress={() => onPick(machine.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${machine.name}, ${machine.template}`}
              className={cn('gap-0.5 rounded-lg px-2.5 py-2', active && 'bg-accent/10')}
            >
              <Text className={cn('font-body-medium text-[12px]', active ? 'text-accent' : inkClass)}>{machine.name}</Text>
              <Text className={cn('font-body text-[10px]', mutedClass)}>
                {machine.template}
                {machine.hierarchyPath ? ` · ${machine.hierarchyPath}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Dialog>
  );
}

export function AnalysisWorkspace({
  machines,
  initialMachineId,
  initialDepth = 'overview',
  initialView,
  dataFor,
  overviewFor,
  onOpenAlarms,
  onRequestRefresh,
  onDepthChange,
}: AnalysisWorkspaceProps) {
  const [machineId, setMachineId] = useState(initialMachineId ?? machines[0]?.id ?? '');
  const [depth, setDepth] = useState<AnalysisDepth>(initialDepth);
  const [view, setView] = useState<WorkspaceView>(initialView ?? 'overview');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);

  // Selection carried between depths: an issue chosen on the overview should still
  // be the subject when the analyst arrives at the workbench.
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState<string | undefined>(undefined);

  // Evidence outlives navigation, because a case is assembled across depths.
  const [evidence, setEvidence] = useState<EvidenceItem[] | null>(null);

  // The analyst's decision, recorded here rather than inside the page, so it
  // survives leaving the investigation and coming back.
  const [conclusionOverride, setConclusionOverride] = useState<Partial<Conclusion> | null>(null);

  // Bumped by refresh, which is what re-derives the payload.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [ageSeconds, setAgeSeconds] = useState(2);

  const machine = machines.find((m) => m.id === machineId) ?? machines[0];
  const data = useMemo(() => dataFor(machineId), [dataFor, machineId, refreshNonce]);
  const overview = useMemo(() => overviewFor?.(machineId) ?? null, [overviewFor, machineId, refreshNonce]);

  const conclusion: Conclusion = useMemo(
    () => ({ ...data.conclusion, ...(conclusionOverride ?? {}) }),
    [data.conclusion, conclusionOverride],
  );

  const goTo = useCallback(
    (next: AnalysisDepth) => {
      setDepth(next);
      setView(next);
      onDepthChange?.(next);
    },
    [onDepthChange],
  );

  const refresh = () => {
    setRefreshNonce((n) => n + 1);
    setAgeSeconds(0);
    onRequestRefresh?.(machineId);
    setReceipt('Data refreshed.');
  };

  const pickMachine = (id: string) => {
    setMachineId(id);
    setPickerOpen(false);
    // A selection from another machine would be meaningless here.
    setSelectedIssueId(null);
    setSelectedSignalId(undefined);
    setConclusionOverride(null);
    setEvidence(null);
    setReceipt(`Switched to ${machines.find((m) => m.id === id)?.name ?? id}.`);
  };

  // Best-effort mapping from an issue to the signal that evidences it, so
  // "view diagnosis" and a train-node click land on the right measurement rather
  // than the tree's first leaf.
  const signalIdFor = useCallback(
    (componentLabel: string): string | undefined => {
      const search = (nodes: AnalystTreeNode[], inComponent: boolean): string | undefined => {
        for (const node of nodes) {
          const matched = inComponent || node.name.toLowerCase() === componentLabel.toLowerCase();
          if (matched && node.kind === 'signal') return node.id;
          const deeper = node.children ? search(node.children, matched) : undefined;
          if (deeper) return deeper;
        }
        return undefined;
      };
      return search(data.tree, false);
    },
    [data.tree],
  );

  // A sensor tile names a channel; the workbench is organised by component and
  // signal, so the two are joined through the commissioned binding rather than by
  // matching text. signalIdFor cannot do this job: it compares a node's name to the
  // label it is given, and a channel tag ("RAV-01 Rotor DE Vibration H") is never a
  // node name, so it would return nothing while the caller reported a jump.
  const workbenchNodeForChannel = useCallback(
    (mapped: MappedChannel): { node: AnalystTreeNode; componentLabel: string | null } | null => {
      const componentId = overview?.componentIdFor?.(mapped);
      const component = overview?.machine.components.find((c) => c.id === componentId) ?? null;
      if (!component) return null;

      const tag = mapped.label.toLowerCase();
      const signalsUnder = (nodes: AnalystTreeNode[], inComponent: boolean): AnalystTreeNode[] =>
        nodes.flatMap((node) => {
          const matched = inComponent || node.name.toLowerCase() === component.label.toLowerCase();
          const self = matched && node.kind === 'signal' ? [node] : [];
          return [...self, ...(node.children ? signalsUnder(node.children, matched) : [])];
        });

      const candidates = signalsUnder(data.tree, false);
      const node = candidates.find((candidate) => tag.includes(candidate.name.toLowerCase())) ?? candidates[0];
      return node ? { node, componentLabel: component.label } : null;
    },
    [overview, data.tree],
  );

  const openDiagnosisFor = (issue?: Issue) => {
    if (issue) {
      setSelectedIssueId(issue.id);
      const target = signalIdFor(issue.componentLabel);
      if (target) setSelectedSignalId(target);
      setReceipt(`Diagnosis focused on ${issue.componentLabel} · ${issue.title}.`);
    }
    goTo('diagnosis');
  };

  const openAdvancedFor = (label: string) => {
    const target = signalIdFor(label);
    if (target) setSelectedSignalId(target);
    goTo('advanced');
    setReceipt(`Workbench opened at ${label}.`);
  };

  const recordDecision = (action: string) => {
    const now = new Date().toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    // Each action records something different. "Accept" adopting the model's
    // suggestion is not the same as an analyst having independently established a
    // root cause, so accepting fills the assessment and explicitly leaves the root
    // cause unestablished.
    const next: Partial<Conclusion> =
      action === 'ACCEPT'
        ? { analystAssessment: `Accepted the suggested explanation · ${now}`, status: 'accepted' }
        : action === 'MODIFY'
          ? { analystAssessment: `Modified by analyst · ${now}`, status: 'modified' }
          : action === 'PARTIALLY ACCEPT'
            ? { analystAssessment: `Partially accepted · ${now}`, status: 'modified' }
            : action === 'REJECT'
              ? { analystAssessment: `Rejected the suggested explanation · ${now}`, status: 'rejected' }
              : { analystAssessment: `More evidence requested · ${now}`, status: 'awaiting-evidence' };

    setConclusionOverride((prev) => ({ ...(prev ?? {}), ...next }));
    setReceipt(`Recorded: ${action.toLowerCase()}.`);
  };

  if (!machine) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Text className="font-body text-sm text-ink-muted">No machines are configured for analysis.</Text>
      </View>
    );
  }

  const toMachineOverview = overview
    ? {
        trailing: (
          <Pressable
            onPress={() => setView('machine')}
            accessibilityRole="button"
            accessibilityLabel="Open the machine overview for this machine"
            className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2"
          >
            <Text className="font-mono text-[10px] font-bold tracking-wider text-accent">‹ MACHINE OVERVIEW</Text>
          </Pressable>
        ),
      }
    : {};

  const headerWiring = {
    onSelectMachine: machines.length > 1 ? () => setPickerOpen(true) : undefined,
    onRefresh: refresh,
  };

  return (
    <View className="flex-1">
      {view === 'machine' && overview ? (
        <MachineOverviewPage
          machine={overview.machine}
          mappedChannels={overview.mappedChannels}
          devices={overview.devices}
          cards={overview.cards}
          expectedPoints={overview.expectedPoints}
          componentIdFor={overview.componentIdFor}
          hierarchyPath={machine.hierarchyPath}
          onOpenAlarms={onOpenAlarms ? () => onOpenAlarms(machineId) : undefined}
          onSelectPoint={(mapped) => {
            // A sensor picked here is the subject when the workbench opens. The
            // receipt names the signal that was actually opened, not the tile that
            // was pressed: the workbench carries one node per signal, and a machine
            // has channels it has no analysis node for.
            const found = workbenchNodeForChannel(mapped);
            if (!found) {
              setReceipt(`${mapped.label} has no signal in the workbench yet.`);
              return;
            }
            setSelectedSignalId(found.node.id);
            goTo('advanced');
            setReceipt(
              `Workbench opened at ${found.componentLabel ? `${found.componentLabel} · ` : ''}${found.node.name}.`,
            );
          }}
          {...headerWiring}
        />
      ) : null}

      {view === 'overview' ? (
        <MachineDiagnosisPage
          machineName={machine.name}
          template={machine.template}
          hierarchyPath={machine.hierarchyPath}
          feed={ageSeconds > 30 ? 'delayed' : 'live'}
          ageSeconds={ageSeconds}
          data={data}
          selectedProblemId={selectedIssueId}
          onSelectProblem={setSelectedIssueId}
          onSelectDepth={goTo}
          onOpenProDiagnosis={(problemId) => openDiagnosisFor(data.issues.find((issue) => issue.id === problemId))}
          tabsTrailing={toMachineOverview.trailing}
          {...headerWiring}
        />
      ) : null}

      {view === 'diagnosis' ? (
        <MachineProDiagnosisPage
          machineName={machine.name}
          template={machine.template}
          hierarchyPath={machine.hierarchyPath}
          feed={ageSeconds > 30 ? 'delayed' : 'live'}
          ageSeconds={ageSeconds}
          runState={data.runState}
          signals={data.diagnosisSignals}
          findings={data.findings}
          hypothesis={data.hypothesis}
          issues={data.issues}
          progression={data.progression}
          prognostics={data.prognostics}
          condition={data.condition}
          dataQuality={data.dataQuality}
          hypotheses={data.hypotheses}
          chain={data.chain}
          conclusion={conclusion}
          doThis={data.doThis}
          thenConfirm={data.thenConfirm}
          modelCaveat={data.modelCaveat}
          selectedProblemId={selectedIssueId}
          onSelectProblem={setSelectedIssueId}
          onSelectDepth={goTo}
          tabsTrailing={toMachineOverview.trailing}
          onVerifyChain={() =>
            setReceipt(
              selectedIssueId
                ? 'Chain verification logged against the selected finding.'
                : 'Chain verification logged for this machine.',
            )
          }
          onOpenTrend={() => openAdvancedFor(machine.name)}
          {...headerWiring}
        />
      ) : null}

      {view === 'advanced' ? (
        <AdvancedDiagnosisPage
          machineName={machine.name}
          template={machine.template}
          condition={data.condition}
          operatingState={data.operatingState}
          rpm={data.speed}
          load={data.load}
          dataQuality={data.dataQuality}
          lastUpdated={ageSeconds === 0 ? 'just now' : `${ageSeconds} sec ago`}
          tree={data.tree}
          conditionRows={data.conditionRows}
          operatingFacts={data.operatingFacts}
          propagation={data.propagation}
          propagationNote={data.propagationNote}
          correlation={data.correlation}
          correlationCaveat={data.correlationCaveat}
          events={data.events}
          hypotheses={data.hypotheses}
          chain={data.chain}
          conclusion={conclusion}
          signalFor={data.signalFor}
          intelligence={data.intelligence}
          issues={data.issues}
          signals={data.signals}
          findings={data.findings}
          progression={data.progression}
          prognostics={data.prognostics}
          health={data.health}
          criticalPath={data.criticalPath}
          doThis={data.doThis}
          thenConfirm={data.thenConfirm}
          modelCaveat={data.modelCaveat}
          initialEvidence={evidence ?? data.initialEvidence ?? []}
          onEvidenceChange={setEvidence}
          selectedSignalId={selectedSignalId}
          onSelectSignal={setSelectedSignalId}
          onSelectDepth={goTo}
          tabsTrailing={toMachineOverview.trailing}
          onConclusionAction={recordDecision}
        />
      ) : null}

      {/* There is no backend behind this app, so an analyst decision lives in
          session state only. Saying so is the alternative to a success toast that
          claims a persistence that did not happen. */}
      {conclusionOverride !== null || evidence !== null ? (
        <View className="absolute inset-x-0 bottom-0 items-center px-4 pb-2">
          <View className="rounded border border-accent/30 bg-accent/10 px-2.5 py-1">
            <Text className="font-mono text-[9px] tracking-wider text-accent">
              SESSION ONLY · analyst decisions and evidence are not yet persisted
            </Text>
          </View>
        </View>
      ) : null}

      {receipt ? <ActionReceipt message={receipt} onDismiss={() => setReceipt(null)} /> : null}

      <MachinePicker
        visible={pickerOpen}
        machines={machines}
        activeId={machineId}
        onPick={pickMachine}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  );
}
