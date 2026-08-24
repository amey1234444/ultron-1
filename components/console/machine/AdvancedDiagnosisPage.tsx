import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { CapabilityInputs } from '../../../lib/analysisCapability';
import { CONDITION_HEX, CONDITION_LABEL, type OverviewCondition } from '../../../lib/analysisOverview';
import {
  findNode,
  pathTo,
  WORK_AREAS,
  type AnalystEvent,
  type AnalystHypothesis,
  type AnalystTreeNode,
  type ChainStep,
  type ConditionRow,
  type Conclusion,
  type CorrelationRow,
  type DataQuality,
  type EvidenceItem,
  type PropagationRow,
  type WorkArea,
} from '../../../lib/advancedDiagnosis';
import { cn } from '../../../lib/cn';
import { ConfirmDialog } from '../ConfirmDialog';
import { Panel } from '../../Panel';
import { AnalysisTabs, type AnalysisDepth } from './analysis/AnalysisTabs';
import { AnalysisTree } from './advanced/AnalysisTree';
import { InvestigationWorkArea } from './advanced/Investigation';
import { EvidenceTray, IntelligencePanel, PanelHeader } from './advanced/SidePanels';
import { SignalLab } from './advanced/SignalLab';
import { CorrelationWorkArea, EventsWorkArea, MachineWorkArea, TrainWorkArea } from './advanced/WorkAreas';

const TREE_WIDTH = 226;
const INTEL_WIDTH = 262;

export type SignalContext = {
  unit: string;
  decimals: number;
  samples: number[];
  reference?: number;
  alert: number;
  danger: number;
  quality: DataQuality;
  sensorDescription: string;
  capability: CapabilityInputs;
};

export type AdvancedDiagnosisPageProps = {
  machineName: string;
  template: string;
  condition: OverviewCondition;
  operatingState: string;
  rpm?: string;
  load?: string;
  dataQuality: DataQuality;
  lastUpdated: string;

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

  // Resolved for whichever signal node is selected. Returning null for a
  // non-signal selection is what makes the Signal Lab refuse rather than guess.
  signalFor: (node: AnalystTreeNode) => SignalContext | null;

  intelligence: { observation: string; qualityNote: string; dominantEvidence: string; nextStep: string };

  initialEvidence?: EvidenceItem[];
  // Reported upward so a case survives moving between analysis depths — an
  // investigation is assembled across them, and a tray that empties on navigation
  // is worse than no tray.
  onEvidenceChange?: (evidence: EvidenceItem[]) => void;
  // Lets a caller open the workbench already pointed at a signal, which is what
  // makes "view diagnosis" and a train-node click land somewhere useful.
  selectedSignalId?: string;
  onSelectSignal?: (id: string) => void;
  onSelectDepth?: (depth: AnalysisDepth) => void;
  // Rendered at the end of the depth row — used for the link out to the machine
  // overview, so that cross-link lives in an existing row.
  tabsTrailing?: ReactNode;
  onConclusionAction?: (action: string) => void;
};

// Advanced Diagnosis — the senior analyst's workbench.
//
// Laid out as a workstation rather than a page: fixed context across the top, the
// asset hierarchy on the left, one work area in the centre, contextual assistance on
// the right, and the evidence tray along the bottom. The side panels collapse
// because a spectrum needs width, and an analyst working one signal for an hour
// should be able to give the centre the whole screen.
//
// The work areas follow the analyst's own sequence — observe, decompose, validate,
// correlate, compare, conclude — so the tool is organised around the method rather
// than around the data model.
export function AdvancedDiagnosisPage({
  machineName,
  template,
  condition,
  operatingState,
  rpm,
  load,
  dataQuality,
  lastUpdated,
  tree,
  conditionRows,
  operatingFacts,
  propagation,
  propagationNote,
  correlation,
  correlationCaveat,
  events,
  hypotheses,
  chain,
  conclusion,
  signalFor,
  intelligence,
  initialEvidence = [],
  onEvidenceChange,
  selectedSignalId,
  onSelectSignal,
  onSelectDepth,
  tabsTrailing,
  onConclusionAction,
}: AdvancedDiagnosisPageProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  const [workArea, setWorkArea] = useState<WorkArea>('machine');
  const [treeOpen, setTreeOpen] = useState(true);
  const [intelOpen, setIntelOpen] = useState(true);
  const [trayOpen, setTrayOpen] = useState(true);
  const [evidence, setEvidence] = useState<EvidenceItem[]>(initialEvidence);
  // Evidence is part of an engineering case, so removing it asks first.
  const [pendingRemoval, setPendingRemoval] = useState<EvidenceItem | null>(null);

  // Deepest signal in the tree, so the workbench opens on something worth looking
  // at rather than on the machine root.
  const firstSignalId = useMemo(() => {
    const walk = (nodes: AnalystTreeNode[]): string | null => {
      for (const node of nodes) {
        if (node.kind === 'signal') return node.id;
        const deeper = node.children ? walk(node.children) : null;
        if (deeper) return deeper;
      }
      return null;
    };
    return walk(tree) ?? tree[0]?.id ?? '';
  }, [tree]);

  const [selectedId, setSelectedId] = useState(selectedSignalId ?? firstSignalId);

  // Driveable from outside without giving up local clicking.
  useEffect(() => {
    if (selectedSignalId) setSelectedId(selectedSignalId);
  }, [selectedSignalId]);

  const selectNode = (id: string) => {
    setSelectedId(id);
    onSelectSignal?.(id);
  };
  const selected = useMemo(() => findNode(tree, selectedId), [tree, selectedId]);
  const trail = useMemo(() => pathTo(tree, selectedId), [tree, selectedId]);
  const signal = useMemo(() => (selected ? signalFor(selected) : null), [selected, signalFor]);

  const commitEvidence = (next: EvidenceItem[]) => {
    setEvidence(next);
    onEvidenceChange?.(next);
  };

  const addEvidence = (note: string) => {
    commitEvidence([
      ...evidence,
      {
        id: `ev-${evidence.length + 1}-${note.slice(0, 12)}`,
        title: note,
        detail: `Captured from ${WORK_AREAS.find((a) => a.id === workArea)?.label ?? 'workbench'}`,
        role: 'context',
        source: trail.map((n) => n.name).join(' / '),
      },
    ]);
    setTrayOpen(true);
  };

  const contextItem = (label: string, value: string, tint?: string) => (
    <View className="gap-0.5 rounded border px-2 py-1" style={{ borderColor: hairline }}>
      <Text className={cn('font-mono text-[7px] tracking-wider', mutedClass)}>{label}</Text>
      <Text style={tint ? { color: tint } : undefined} className={cn('font-mono text-[10px]', !tint && inkClass)}>
        {value}
      </Text>
    </View>
  );

  const centre = () => {
    if (workArea === 'machine') return <MachineWorkArea rows={conditionRows} operating={operatingFacts} />;
    if (workArea === 'train') return <TrainWorkArea rows={propagation} note={propagationNote} />;
    if (workArea === 'correlation') return <CorrelationWorkArea rows={correlation} caveat={correlationCaveat} />;
    if (workArea === 'events') return <EventsWorkArea events={events} />;
    if (workArea === 'investigation')
      return <InvestigationWorkArea hypotheses={hypotheses} chain={chain} conclusion={conclusion} onAction={onConclusionAction} />;

    // Signal Lab. A non-signal selection has no measurement to interrogate, and
    // says so rather than showing an empty chart frame.
    if (!selected || !signal) {
      return (
        <View className="gap-2">
          <Text className={cn('font-body-medium text-[12px]', inkClass)}>No signal selected</Text>
          <Text className={cn('font-body text-[11px]', mutedClass)}>
            Select a measurement point in the analysis tree. {selected ? `"${selected.name}" is a ${selected.kind}, not a signal.` : ''}
          </Text>
        </View>
      );
    }

    return (
      <SignalLab
        pointLabel={selected.name}
        pathLabel={trail.map((n) => n.name).join('  /  ')}
        unit={signal.unit}
        decimals={signal.decimals}
        samples={signal.samples}
        reference={signal.reference}
        alert={signal.alert}
        danger={signal.danger}
        quality={signal.quality}
        sensorDescription={signal.sensorDescription}
        capability={signal.capability}
        onAddEvidence={addEvidence}
      />
    );
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, gap: 12 }}>
      {/* Fixed context. An analyst deep in a spectrum must never lose track of
          which machine, which point, and at what speed and load. */}
      <View className="flex-row flex-wrap items-start justify-between gap-3">
        <View className="gap-1">
          <Text className={cn('font-mono text-[9px] tracking-[0.16em]', mutedClass)}>ULTRON / ANALYSIS / ADVANCED DIAGNOSIS</Text>
          <View className="flex-row flex-wrap items-baseline gap-1.5">
            <Text className={cn('font-heading-medium text-[19px]', inkClass)}>{machineName}</Text>
            <Text className={cn('font-body text-[12px]', mutedClass)}>· {template}</Text>
          </View>
          <Text numberOfLines={1} className={cn('font-mono text-[9px]', mutedClass)}>
            {trail.length > 0 ? trail.map((n) => n.name).join('  /  ') : 'no selection'}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-1.5">
          {contextItem('CONDITION', CONDITION_LABEL[condition], CONDITION_HEX[condition])}
          {contextItem('OPERATING', operatingState)}
          {contextItem('RPM', rpm ?? 'NO DATA')}
          {contextItem('LOAD', load ?? 'NO DATA')}
          {contextItem('DATA', dataQuality.toUpperCase())}
          {contextItem('UPDATED', lastUpdated)}
        </View>
      </View>

      <AnalysisTabs active="advanced" onSelect={onSelectDepth} trailing={tabsTrailing} />

      {/* Work areas, labelled with the analytical step each performs. */}
      <View className="flex-row flex-wrap gap-1.5">
        {WORK_AREAS.map((area) => {
          const active = area.id === workArea;
          return (
            <Pressable
              key={area.id}
              onPress={() => setWorkArea(area.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${area.label}: ${area.purpose}`}
              className={cn('gap-0.5 rounded-lg border px-3 py-1.5', active ? 'border-accent/50 bg-accent/10' : '')}
              style={active ? undefined : { borderColor: hairline }}
            >
              <Text className={cn('font-mono text-[9px] font-bold tracking-wider', active ? 'text-accent' : mutedClass)}>
                {area.label}
              </Text>
              <Text className={cn('font-mono text-[7px] tracking-wider', mutedClass)}>{area.step}</Text>
            </Pressable>
          );
        })}

        <View className="flex-1" />

        {!treeOpen ? (
          <Pressable
            onPress={() => setTreeOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Show analysis tree"
            className="rounded-lg border px-2.5 py-1.5"
            style={{ borderColor: hairline }}
          >
            <Text className={cn('font-mono text-[9px] tracking-wider', mutedClass)}>SHOW TREE</Text>
          </Pressable>
        ) : null}

        {!intelOpen ? (
          <Pressable
            onPress={() => setIntelOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Show analyst intelligence"
            className="rounded-lg border px-2.5 py-1.5"
            style={{ borderColor: hairline }}
          >
            <Text className={cn('font-mono text-[9px] tracking-wider', mutedClass)}>SHOW INTELLIGENCE</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row flex-wrap items-stretch gap-3">
        {treeOpen ? (
          <View style={{ width: TREE_WIDTH }}>
            <Panel fill>
              <View className="gap-2">
                <PanelHeader title="Analysis tree" subtitle="MACHINE → POINT → SIGNAL" onCollapse={() => setTreeOpen(false)} />
                <AnalysisTree
                  nodes={tree}
                  selectedId={selectedId}
                  onSelect={(node) => {
                    selectNode(node.id);
                    if (node.kind === 'signal') setWorkArea('signal');
                  }}
                />
              </View>
            </Panel>
          </View>
        ) : null}

        <View style={{ flexGrow: 1, flexBasis: 520, minWidth: 320 }}>
          <Panel fill>{centre()}</Panel>
        </View>

        {intelOpen ? (
          <View style={{ width: INTEL_WIDTH }}>
            <Panel fill>
              <IntelligencePanel
                observation={intelligence.observation}
                quality={signal?.quality ?? dataQuality}
                qualityNote={intelligence.qualityNote}
                dominantEvidence={intelligence.dominantEvidence}
                nextStep={intelligence.nextStep}
                evidenceCount={evidence.length}
                onOpenEvidence={() => setTrayOpen((open) => !open)}
                onCollapse={() => setIntelOpen(false)}
              />
            </Panel>
          </View>
        ) : null}
      </View>

      {trayOpen ? (
        <Panel>
          <EvidenceTray
            evidence={evidence}
            onClose={() => setTrayOpen(false)}
            onRemove={(id) => setPendingRemoval(evidence.find((item) => item.id === id) ?? null)}
          />
        </Panel>
      ) : null}
      <ConfirmDialog
        visible={pendingRemoval !== null}
        title="Remove evidence"
        message={
          pendingRemoval
            ? `Remove "${pendingRemoval.title}" from this investigation? The reasoning that referenced it will no longer show it.`
            : ''
        }
        confirmLabel="Remove"
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval) commitEvidence(evidence.filter((item) => item.id !== pendingRemoval.id));
          setPendingRemoval(null);
        }}
      />
    </ScrollView>
  );
}
