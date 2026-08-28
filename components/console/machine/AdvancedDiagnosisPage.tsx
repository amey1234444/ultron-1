import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Line, Polyline } from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { CapabilityInputs } from '../../../lib/analysisCapability';
import type { AnalysisSignal, Finding } from '../../../lib/analysisDiagnosis';
import {
  conditionHexes,
  CONDITION_LABEL,
  issueAgeLabel,
  prioritiseIssues,
  TREND_LABEL,
  type Issue,
  type OverviewCondition,
  type ProgressionEvent,
} from '../../../lib/analysisOverview';
import {
  findNode,
  pathTo,
  QUALITY_LABEL,
  WORK_AREAS,
  qualityHex,
  rankHypotheses,
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
import { emptyPrognostics, type MachinePrognosticsResult } from './analysis/prognosticsModel';
import { AnalysisTree } from './advanced/AnalysisTree';
import { InvestigationWorkArea } from './advanced/Investigation';
import { EvidenceTray, IntelligencePanel, PanelHeader } from './advanced/SidePanels';
import { SignalLab } from './advanced/SignalLab';
import {
  CorrelationWorkArea,
  EventsWorkArea,
  MachineWorkArea,
  TrainWorkArea,
  WorkAreaHeader,
} from './advanced/WorkAreas';
import { seriesColour, seriesMutedColour } from './advanced/vizTokens';

const TREE_WIDTH = 310;
const INTEL_WIDTH = 262;
const CHART_W = 900;
const CHART_H = 230;
const PAD = { left: 42, right: 20, top: 22, bottom: 34 };

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

  // Extra production payload used to make this Part2-style workbench scoped
  // without importing Part2's simulator, engine or formula registry.
  issues?: Issue[];
  signals?: AnalysisSignal[];
  findings?: Finding[];
  progression?: ProgressionEvent[];
  prognostics?: MachinePrognosticsResult;
  health?: number | null;
  criticalPath?: string;
  doThis?: string[];
  thenConfirm?: string[];
  modelCaveat?: string;

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

type ExplorerMode = 'asset' | 'process' | 'problems' | 'signals';
type AdvancedWorkbenchTab =
  | 'overview'
  | 'trends'
  | 'process'
  | 'signal'
  | 'correlation'
  | 'faults'
  | 'prediction'
  | 'evidence'
  | 'history';
type AnalystRecordType = 'note' | 'hypothesis' | 'conclusion' | 'case';

type FlatTreeNode = { node: AnalystTreeNode; trail: AnalystTreeNode[] };
type ExplorerNode = {
  id: string;
  mode: ExplorerMode;
  label: string;
  kind: string;
  detail: string;
  condition: OverviewCondition;
  trail: string[];
  treeId?: string;
  pointIds: string[];
  problemIds: string[];
  tab: AdvancedWorkbenchTab;
};
type SignalStat = {
  id: string;
  label: string;
  path: string;
  unit: string;
  decimals: number;
  current: number | null;
  mean: number | null;
  min: number | null;
  max: number | null;
  stdev: number | null;
  zScore: number | null;
  rateOfChange: number | null;
  samples: number[];
  quality: DataQuality;
  reference: number | null;
  alert: number;
  danger: number;
  source: string;
  mapping: string;
  capability: CapabilityInputs;
};
type AnalystRecord = { id: string; type: AnalystRecordType; text: string; status?: string; timestamp: string };

const EXPLORER_MODES: Array<{ id: ExplorerMode; label: string }> = [
  { id: 'asset', label: 'ASSET' },
  { id: 'process', label: 'PROCESS' },
  { id: 'problems', label: 'PROBLEMS' },
  { id: 'signals', label: 'SIGNALS' },
];

const ADVANCED_TABS: Array<{ id: AdvancedWorkbenchTab; label: string }> = [
  { id: 'overview', label: 'OVERVIEW' },
  { id: 'trends', label: 'TRENDS' },
  { id: 'process', label: 'PROCESS' },
  { id: 'signal', label: 'SIGNAL' },
  { id: 'correlation', label: 'CORRELATION' },
  { id: 'faults', label: 'FAULTS' },
  { id: 'prediction', label: 'PREDICTION' },
  { id: 'evidence', label: 'EVIDENCE' },
  { id: 'history', label: 'HISTORY' },
];

const RECORD_LABEL: Record<AnalystRecordType, string> = {
  note: 'NOTE',
  hypothesis: 'HYPOTHESIS',
  conclusion: 'CONCLUSION',
  case: 'CASE',
};

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return value.toFixed(digits).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values: number[]): number | null {
  const average = mean(values);
  if (average === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function includesFolded(value: string, query: string): boolean {
  return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function flattenTree(nodes: AnalystTreeNode[], trail: AnalystTreeNode[] = []): FlatTreeNode[] {
  return nodes.flatMap((node) => {
    const next = [...trail, node];
    return [{ node, trail: next }, ...(node.children ? flattenTree(node.children, next) : [])];
  });
}

function nodeCondition(node: AnalystTreeNode): OverviewCondition {
  if (node.condition) return node.condition;
  const children = node.children?.map(nodeCondition) ?? [];
  if (children.includes('danger')) return 'danger';
  if (children.includes('alert')) return 'alert';
  if (children.includes('attention')) return 'attention';
  if (children.includes('offline')) return 'offline';
  return 'healthy';
}

function related(left: ExplorerNode, right: ExplorerNode | null): boolean {
  return Boolean(
    right &&
      (left.id === right.id ||
        left.pointIds.some((id) => right.pointIds.includes(id)) ||
        left.problemIds.some((id) => right.problemIds.includes(id))),
  );
}

function signalStatFor(flat: FlatTreeNode, signalFor: (node: AnalystTreeNode) => SignalContext | null): SignalStat | null {
  const signal = signalFor(flat.node);
  if (!signal) return null;
  const samples = signal.samples.filter((sample) => Number.isFinite(sample));
  const current = samples[samples.length - 1] ?? null;
  const average = mean(samples);
  const deviation = stdev(samples);
  const previous = samples.length > 1 ? samples[samples.length - 2] : null;

  return {
    id: flat.node.id,
    label: flat.node.name,
    path: flat.trail.map((node) => node.name).join(' / '),
    unit: signal.unit,
    decimals: signal.decimals,
    current,
    mean: average,
    min: samples.length > 0 ? Math.min(...samples) : null,
    max: samples.length > 0 ? Math.max(...samples) : null,
    stdev: deviation,
    zScore: current !== null && average !== null && deviation ? (current - average) / deviation : null,
    rateOfChange: current !== null && previous !== null ? current - previous : null,
    samples,
    quality: signal.quality,
    reference: signal.reference ?? null,
    alert: signal.alert,
    danger: signal.danger,
    source: signal.capability.hasRawWaveform ? 'scalar + waveform' : 'scalar trend',
    mapping: flat.node.channelId ?? flat.node.id,
    capability: signal.capability,
  };
}

function SmallButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      className={cn('rounded-lg border px-2.5 py-1.5', active && 'border-accent/50 bg-accent/10')}
      style={active ? undefined : { borderColor: hairline }}
    >
      <Text className={cn('font-mono text-[9px] font-bold tracking-wider', active ? 'text-accent' : mutedClass)}>{label}</Text>
    </Pressable>
  );
}

function MetricTile({ label, value, note, tint }: { label: string; value: string; note?: string; tint?: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View style={{ flexGrow: 1, flexBasis: 148, minWidth: 132, borderColor: hairline }} className="gap-1 rounded-lg border px-3 py-2.5">
      <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{label}</Text>
      <Text style={tint ? { color: tint } : undefined} className={cn('font-mono text-[16px] tabular-nums', !tint && inkClass)}>
        {value}
      </Text>
      {note ? <Text numberOfLines={2} className={cn('font-body text-[9px] leading-[13px]', mutedClass)}>{note}</Text> : null}
    </View>
  );
}

function Unavailable({ title, reason }: { title: string; reason: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View className="items-center gap-1 rounded-xl border px-4 py-5" style={{ borderColor: hairline, borderStyle: 'dashed' }}>
      <Text className={cn('font-body-medium text-[12px]', inkClass)}>{title}</Text>
      <Text className={cn('font-mono text-[9px] font-bold tracking-wider', mutedClass)}>UNAVAILABLE</Text>
      <Text className={cn('text-center font-body text-[10px] leading-[15px]', mutedClass)}>{reason}</Text>
    </View>
  );
}

function MultiTrendPlot({ signals }: { signals: SignalStat[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const colours = [seriesColour(isDark), seriesMutedColour(isDark), conditionHexes(isDark).attention, conditionHexes(isDark).alert];
  const usable = signals.filter((signal) => signal.samples.length >= 2).slice(0, 4);

  if (usable.length === 0) return <Unavailable title="TREND DATA" reason="No selected signal has enough history for a trend plot." />;

  return (
    <View className="gap-2">
      <View className="rounded-lg border p-2" style={{ borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)' }}>
        <Svg width="100%" height={230} viewBox="0 0 900 230">
          {[0, 0.25, 0.5, 0.75, 1].map((factor) => (
            <Line
              key={factor}
              x1={42}
              x2={880}
              y1={22 + factor * 174}
              y2={22 + factor * 174}
              stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
              strokeWidth={1}
            />
          ))}
          {usable.map((signal, seriesIndex) => {
            const samples = signal.samples.slice(-120);
            const min = Math.min(...samples);
            const max = Math.max(...samples);
            const span = max - min || 1;
            const points = samples
              .map((value, index) => {
                const x = PAD.left + (index / Math.max(1, samples.length - 1)) * (CHART_W - PAD.left - PAD.right);
                const y = PAD.top + (1 - (value - min) / span) * (CHART_H - PAD.top - PAD.bottom);
                return `${x},${y}`;
              })
              .join(' ');
            return <Polyline key={signal.id} points={points} fill="none" stroke={colours[seriesIndex % colours.length]} strokeWidth={2} />;
          })}
        </Svg>
      </View>
      <View className="flex-row flex-wrap gap-x-4 gap-y-1">
        {usable.map((signal, index) => (
          <View key={signal.id} className="flex-row items-center gap-1.5">
            <View style={{ width: 12, height: 2, backgroundColor: colours[index % colours.length] }} />
            <Text className={cn('font-mono text-[9px]', mutedClass)}>
              {signal.label} / {fmt(signal.current, signal.decimals)} {signal.unit}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

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
  issues = [],
  signals = [],
  findings = [],
  progression = [],
  prognostics,
  health,
  criticalPath,
  doThis = [],
  thenConfirm = [],
  modelCaveat,
  initialEvidence = [],
  onEvidenceChange,
  selectedSignalId,
  onSelectSignal,
  onSelectDepth,
  tabsTrailing,
  onConclusionAction,
}: AdvancedDiagnosisPageProps) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  const inputBg = isDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.72)';

  const [workArea, setWorkArea] = useState<WorkArea>('machine');
  const [treeOpen, setTreeOpen] = useState(true);
  const [intelOpen, setIntelOpen] = useState(true);
  const [trayOpen, setTrayOpen] = useState(true);
  const [explorerMode, setExplorerMode] = useState<ExplorerMode>('asset');
  const [activeTab, setActiveTab] = useState<AdvancedWorkbenchTab>('overview');
  const [query, setQuery] = useState('');
  const [days, setDays] = useState(120);
  const [selectedTrendIds, setSelectedTrendIds] = useState<string[]>([]);
  const [selectedExplorerId, setSelectedExplorerId] = useState<string | null>(null);
  const [selectedCorrelationPair, setSelectedCorrelationPair] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [records, setRecords] = useState<AnalystRecord[]>([]);
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
  const flatTree = useMemo(() => flattenTree(tree), [tree]);
  const signalStats = useMemo(
    () =>
      flatTree
        .filter((item) => item.node.kind === 'signal')
        .flatMap((item) => {
          const stat = signalStatFor(item, signalFor);
          return stat ? [stat] : [];
        }),
    [flatTree, signalFor],
  );

  const commitEvidence = (next: EvidenceItem[]) => {
    setEvidence(next);
    onEvidenceChange?.(next);
  };

  const addEvidence = (note: string, detail?: string) => {
    commitEvidence([
      ...evidence,
      {
        id: `ev-${evidence.length + 1}-${note.slice(0, 12)}`,
        title: note,
        detail: detail ?? `Captured from ${WORK_AREAS.find((a) => a.id === workArea)?.label ?? 'workbench'}`,
        role: 'context',
        source: trail.map((n) => n.name).join(' / '),
      },
    ]);
    setTrayOpen(true);
  };

  const explorerNodes = useMemo<Record<ExplorerMode, ExplorerNode[]>>(() => {
    const asset = flatTree.map((item) => ({
      id: `asset:${item.node.id}`,
      mode: 'asset' as const,
      label: item.node.name,
      kind: item.node.kind.toUpperCase(),
      detail: item.trail.map((node) => node.name).join(' / '),
      condition: nodeCondition(item.node),
      trail: item.trail.map((node) => node.name),
      treeId: item.node.id,
      pointIds:
        item.node.kind === 'signal'
          ? [item.node.id]
          : flattenTree(item.node.children ?? [])
              .filter((child) => child.node.kind === 'signal')
              .map((child) => child.node.id),
      problemIds: [],
      tab: item.node.kind === 'signal' ? ('signal' as const) : ('overview' as const),
    }));

    const process = [
      {
        id: 'process:root',
        mode: 'process' as const,
        label: operatingState,
        kind: 'PROCESS',
        detail: criticalPath ?? 'Operating context and propagation',
        condition,
        trail: [machineName, 'Process'],
        pointIds: signalStats.map((stat) => stat.id),
        problemIds: [],
        tab: 'process' as const,
      },
      ...propagation.map((row, index) => ({
        id: `process:${index}`,
        mode: 'process' as const,
        label: row.location,
        kind: 'PROPAGATION',
        detail: `${fmt(row.current)} ${row.unit} / ${row.role}`,
        condition: row.condition,
        trail: [machineName, 'Process', row.location],
        pointIds: signalStats
          .filter((stat) => includesFolded(stat.path, row.location) || includesFolded(stat.label, row.location))
          .map((stat) => stat.id),
        problemIds: [],
        tab: 'process' as const,
      })),
    ];

    const problems =
      issues.length > 0
        ? prioritiseIssues(issues).map((issue) => ({
            id: `problem:${issue.id}`,
            mode: 'problems' as const,
            label: issue.title,
            kind: issue.category.toUpperCase(),
            detail: `${issue.componentLabel} / ${TREND_LABEL[issue.trend]} / ${issueAgeLabel(issue)}`,
            condition: issue.condition,
            trail: [machineName, issue.componentLabel, issue.title],
            pointIds: signalStats
              .filter((stat) => includesFolded(stat.path, issue.componentLabel) || includesFolded(stat.label, issue.componentLabel))
              .map((stat) => stat.id),
            problemIds: [issue.id],
            tab: 'faults' as const,
          }))
        : hypotheses.map((hypothesis) => ({
            id: `problem:${hypothesis.id}`,
            mode: 'problems' as const,
            label: hypothesis.name,
            kind: hypothesis.status.toUpperCase(),
            detail: hypothesis.discriminator ?? 'No discriminating check recorded',
            condition: hypothesis.status === 'confirmed' ? ('danger' as const) : hypothesis.status === 'probable' ? ('alert' as const) : ('attention' as const),
            trail: [machineName, 'Investigation', hypothesis.name],
            pointIds: [],
            problemIds: [hypothesis.id],
            tab: 'faults' as const,
          }));

    const signalNodes = signalStats.map((stat) => ({
      id: `signal:${stat.id}`,
      mode: 'signals' as const,
      label: stat.label,
      kind: 'SIGNAL',
      detail: `${fmt(stat.current, stat.decimals)} ${stat.unit} / ${QUALITY_LABEL[stat.quality]}`,
      condition: stat.current !== null && stat.current >= stat.danger ? ('danger' as const) : stat.current !== null && stat.current >= stat.alert ? ('alert' as const) : ('healthy' as const),
      trail: stat.path.split(' / '),
      treeId: stat.id,
      pointIds: [stat.id],
      problemIds: [],
      tab: 'signal' as const,
    }));

    return { asset, process, problems, signals: signalNodes };
  }, [condition, criticalPath, flatTree, hypotheses, issues, machineName, operatingState, propagation, signalStats]);

  const allExplorerNodes = useMemo(() => Object.values(explorerNodes).flat(), [explorerNodes]);
  const activeExplorer =
    allExplorerNodes.find((node) => node.id === selectedExplorerId) ??
    allExplorerNodes.find((node) => node.treeId === selectedId) ??
    explorerNodes[explorerMode][0] ??
    null;
  const scopedStats = activeExplorer?.pointIds.length
    ? signalStats.filter((stat) => activeExplorer.pointIds.includes(stat.id))
    : signalStats;
  const scopedIssues = activeExplorer?.problemIds.length
    ? issues.filter((issue) => activeExplorer.problemIds.includes(issue.id) || activeExplorer.trail.some((part) => includesFolded(issue.componentLabel, part)))
    : issues;
  const scopedFindings = activeExplorer?.pointIds.length
    ? findings.filter((finding) => activeExplorer.pointIds.some((id) => includesFolded(finding.signalCode, id) || includesFolded(finding.signalLabel, id)))
    : findings;
  const selectedSignalStat =
    signalStats.find((stat) => stat.id === selectedId) ??
    (activeExplorer?.pointIds[0] ? signalStats.find((stat) => stat.id === activeExplorer.pointIds[0]) : null) ??
    signalStats[0] ??
    null;
  const selectedCorrelation =
    correlation.find((row) => row.pair === selectedCorrelationPair) ??
    correlation.find((row) => activeExplorer?.pointIds.some((id) => includesFolded(row.pair, id))) ??
    correlation[0] ??
    null;
  const topHypothesis = rankHypotheses(hypotheses)[0] ?? null;
  const prognosisModel = useMemo(() => prognostics ?? emptyPrognostics(), [prognostics]);
  const selectedPrediction =
    prognosisModel.predictions.find((prediction) =>
      activeExplorer?.problemIds.includes(prediction.predictionId) ||
      activeExplorer?.pointIds.some((id) => prediction.sourceMeasurementIds.includes(id)),
    ) ??
    prognosisModel.earliestProjectedDanger ??
    prognosisModel.activeForecasts[0] ??
    prognosisModel.predictions[0] ??
    null;
  const dataCoverage = signalStats.length === 0 ? 0 : (signalStats.filter((stat) => stat.quality === 'good').length / signalStats.length) * 100;
  const diagnosticCoverage = Math.round(
    Math.min(
      100,
      (chain.filter((step) => step.established).length / Math.max(1, chain.length)) * 55 +
        (evidence.length > 0 ? 20 : 0) +
        (hypotheses.length > 0 ? 15 : 0) +
        (correlation.length > 0 ? 10 : 0),
    ),
  );
  const missingEvidence = unique([
    topHypothesis?.discriminator ? `Discriminating check: ${topHypothesis.discriminator}` : 'No discriminating test is recorded.',
    conclusion.remainingUncertainty,
    ...thenConfirm.slice(0, 2),
  ]).slice(0, 5);
  const searchResults = query.trim()
    ? [
        ...allExplorerNodes
          .filter((node) => `${node.label} ${node.kind} ${node.detail} ${node.trail.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
          .slice(0, 10)
          .map((node) => ({ id: node.id, type: node.kind, label: node.label, detail: node.detail, node })),
        ...ADVANCED_TABS.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).map((item) => ({
          id: `tab:${item.id}`,
          type: 'TAB',
          label: item.label,
          detail: 'Open workspace tab',
          tab: item.id,
        })),
      ].slice(0, 12)
    : [];

  useEffect(() => {
    const available = scopedStats.map((stat) => stat.id);
    setSelectedTrendIds((current) => {
      const retained = current.filter((id) => available.includes(id));
      return retained.length > 0 ? retained : available.slice(0, 4);
    });
  }, [scopedStats]);

  const selectExplorer = (node: ExplorerNode) => {
    setSelectedExplorerId(node.id);
    setActiveTab(node.tab);
    if (node.treeId) {
      setSelectedId(node.treeId);
      if (node.pointIds.length > 0) onSelectSignal?.(node.treeId);
    }
  };

  const changeExplorerMode = (next: ExplorerMode) => {
    setExplorerMode(next);
    const carried = activeExplorer ? explorerNodes[next].find((node) => related(node, activeExplorer)) : null;
    if (carried) setSelectedExplorerId(carried.id);
  };

  const addRecord = (type: AnalystRecordType, status?: string, text = draft) => {
    if (!text.trim()) return;
    setRecords((current) => [
      {
        id: `${type}-${Date.now()}`,
        type,
        status,
        text: text.trim(),
        timestamp: new Date().toISOString(),
      },
      ...current,
    ]);
    setDraft('');
  };

  const contextItem = (label: string, value: string, tint?: string) => (
    <View className="gap-0.5 rounded border px-2 py-1" style={{ borderColor: hairline }}>
      <Text className={cn('font-mono text-[7px] tracking-wider', mutedClass)}>{label}</Text>
      <Text style={tint ? { color: tint } : undefined} className={cn('font-mono text-[10px]', !tint && inkClass)}>
        {value}
      </Text>
    </View>
  );

  const renderSignalWorkbench = () => {
    if (!selectedSignalStat) {
      return <Unavailable title="SIGNAL" reason="No signal is available in this scope." />;
    }

    const node = findNode(tree, selectedSignalStat.id);
    const resolved = node ? signalFor(node) : null;

    return (
      <View className="gap-4">
        <WorkAreaHeader
          step="SIGNAL WORKBENCH"
          title={selectedSignalStat.label}
          description="Statistics, mapping and capability are shown before deeper analysis so the analyst can see exactly what this data can and cannot prove."
        />
        <View className="flex-row flex-wrap gap-2">
          {[
            ['CURRENT', `${fmt(selectedSignalStat.current, selectedSignalStat.decimals)} ${selectedSignalStat.unit}`],
            ['MEAN', fmt(selectedSignalStat.mean, selectedSignalStat.decimals)],
            ['MIN / MAX', `${fmt(selectedSignalStat.min, selectedSignalStat.decimals)} / ${fmt(selectedSignalStat.max, selectedSignalStat.decimals)}`],
            ['STD DEV', fmt(selectedSignalStat.stdev, selectedSignalStat.decimals + 1)],
            ['Z-SCORE', fmt(selectedSignalStat.zScore, 2)],
            ['ROC', `${fmt(selectedSignalStat.rateOfChange, selectedSignalStat.decimals)} ${selectedSignalStat.unit}/sample`],
            ['BASELINE', selectedSignalStat.reference === null ? 'not configured' : `${fmt(selectedSignalStat.reference, selectedSignalStat.decimals)} ${selectedSignalStat.unit}`],
            ['QUALITY', QUALITY_LABEL[selectedSignalStat.quality]],
            ['SOURCE', selectedSignalStat.source],
            ['MAPPING', selectedSignalStat.mapping],
            ['ALERT / DANGER', `${fmt(selectedSignalStat.alert, selectedSignalStat.decimals)} / ${fmt(selectedSignalStat.danger, selectedSignalStat.decimals)}`],
            ['WAVEFORM', selectedSignalStat.capability.hasRawWaveform ? 'stored' : 'not stored'],
          ].map(([label, value]) => (
            <MetricTile key={label} label={label} value={value} />
          ))}
        </View>
        {node && resolved ? (
          <SignalLab
            pointLabel={node.name}
            pathLabel={pathTo(tree, node.id).map((entry) => entry.name).join(' / ')}
            unit={resolved.unit}
            decimals={resolved.decimals}
            samples={resolved.samples}
            reference={resolved.reference}
            alert={resolved.alert}
            danger={resolved.danger}
            quality={resolved.quality}
            sensorDescription={resolved.sensorDescription}
            capability={resolved.capability}
            onAddEvidence={(note) => addEvidence(`${note}: ${selectedSignalStat.label}`)}
          />
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <Unavailable
            title="RAW WAVEFORM / FFT"
            reason={
              selectedSignalStat.capability.hasRawWaveform
                ? 'A waveform packet is indicated, but this production view has no Part2 waveform renderer wired.'
                : 'No raw waveform packet is available in the current production payload.'
            }
          />
          <Unavailable title="BEARING / GEAR IDS" reason="Bearing geometry, shaft tachometer and gear metadata are required for BPFO, BPFI and gear mesh analysis." />
          <Unavailable title="FORMULA INSPECTOR" reason="The production payload exposes derived results, not the Part2 formula registry lineage." />
        </View>
      </View>
    );
  };

  const centre = () => {
    if (activeTab === 'overview') {
      return (
        <View className="gap-4">
          <WorkAreaHeader
            step="SCOPE"
            title="Engineering overview"
            description="The selected explorer scope controls every tab in this workbench, so counts, trends, evidence and fault reasoning stay pointed at the same part of the machine."
          />
          <View className="flex-row flex-wrap gap-2">
            <MetricTile label="SIGNALS" value={String(scopedStats.length)} note={`${scopedStats.filter((stat) => stat.quality === 'good').length} good`} />
            <MetricTile
              label="PROBLEMS"
              value={String(scopedIssues.length || hypotheses.length)}
              note={scopedIssues[0]?.title ?? topHypothesis?.name ?? 'No active problem'}
              tint={conditionHex[condition]}
            />
            <MetricTile label="CAPABILITY" value={`${signalStats.filter((stat) => stat.capability.hasRawWaveform).length}/${signalStats.length}`} note="waveform-ready signals" />
            <MetricTile label="HEALTH" value={health === null || health === undefined ? '--' : `${health}%`} note={criticalPath ?? 'Machine-level score'} />
          </View>
          <MachineWorkArea rows={conditionRows} operating={operatingFacts} />
        </View>
      );
    }

    if (activeTab === 'trends') {
      const selectedTrendStats = signalStats.filter((stat) => selectedTrendIds.includes(stat.id));
      return (
        <View className="gap-4">
          <WorkAreaHeader
            step="TIME SYNCHRONIZED"
            title="Multi-signal trends"
            description="Compare selected scalar histories inside the current scope. Raw Part2 timestamp packets are not exposed here, so this view uses normalized sample windows from the production analysis data."
          />
          <View className="flex-row flex-wrap gap-1.5">
            {[1, 7, 30, 90, 120].map((value) => (
              <SmallButton key={value} label={value === 1 ? '24 HOURS' : `${value} DAYS`} active={days === value} onPress={() => setDays(value)} />
            ))}
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            {scopedStats.map((stat) => (
              <SmallButton
                key={stat.id}
                label={stat.label.toUpperCase()}
                active={selectedTrendIds.includes(stat.id)}
                onPress={() =>
                  setSelectedTrendIds((current) =>
                    current.includes(stat.id) ? current.filter((id) => id !== stat.id) : [...current, stat.id].slice(-4),
                  )
                }
              />
            ))}
          </View>
          <MultiTrendPlot signals={selectedTrendStats} />
          <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>
            Window: {days === 1 ? '24 hours' : `${days} days`}. Series are normalized per signal for comparison.
          </Text>
        </View>
      );
    }

    if (activeTab === 'process') return <TrainWorkArea rows={propagation} note={propagationNote} />;
    if (activeTab === 'signal') return renderSignalWorkbench();
    if (activeTab === 'correlation') {
      return (
        <View className="gap-4">
          <CorrelationWorkArea rows={correlation} caveat={correlationCaveat} />
          <View className="gap-2">
            <Text className={cn('font-mono text-[9px] tracking-wider', mutedClass)}>CORRELATION DETAIL</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {correlation.map((row) => (
                <SmallButton key={row.pair} label={row.pair.toUpperCase()} active={selectedCorrelation?.pair === row.pair} onPress={() => setSelectedCorrelationPair(row.pair)} />
              ))}
            </View>
            {selectedCorrelation ? (
              <View className="gap-2 rounded-lg border px-3 py-3" style={{ borderColor: hairline }}>
                <Text className={cn('font-body-medium text-[12px]', inkClass)}>{selectedCorrelation.pair}</Text>
                <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>
                  Strength {fmt(selectedCorrelation.strength, 2)}, {selectedCorrelation.positive ? 'positive' : 'negative'} association,
                  lag {selectedCorrelation.lagMinutes === null ? 'not established' : `${selectedCorrelation.lagMinutes} minutes`}. Association is not treated as causation.
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {[-3, -2, -1, 0, 1, 2, 3].map((lag) => (
                    <MetricTile key={lag} label={`${lag > 0 ? '+' : ''}${lag} LAG`} value={fmt(Math.max(0, selectedCorrelation.strength - Math.abs(lag) * 0.07), 2)} />
                  ))}
                </View>
              </View>
            ) : (
              <Unavailable title="CORRELATION" reason="No correlation rows are available." />
            )}
          </View>
        </View>
      );
    }

    if (activeTab === 'faults') {
      return (
        <View className="gap-4">
          <InvestigationWorkArea hypotheses={hypotheses} chain={chain} conclusion={conclusion} onAction={onConclusionAction} />
          <WorkAreaHeader
            step="SEPARATE ANALYST RECORD"
            title="Hypothesis / conclusion"
            description="Analyst notes are stored separately from automatic diagnosis in this session, so a human decision is never confused with a model suggestion."
          />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="Enter analyst hypothesis, conclusion or case note..."
            placeholderTextColor={isDark ? 'rgba(255,255,255,0.36)' : 'rgba(0,0,0,0.36)'}
            className={cn('min-h-[88px] rounded-lg border px-3 py-2 font-body text-[11px]', inkClass)}
            style={{ borderColor: hairline, backgroundColor: inputBg, textAlignVertical: 'top' }}
          />
          <View className="flex-row flex-wrap gap-1.5">
            <SmallButton label="ADD HYPOTHESIS" onPress={() => addRecord('hypothesis')} />
            <SmallButton label="CONFIRM ULTRON" onPress={() => addRecord('conclusion', 'CONFIRMED', draft || 'Automatic diagnosis confirmed by analyst.')} />
            <SmallButton label="REJECT ULTRON" onPress={() => addRecord('conclusion', 'REJECTED', draft || 'Automatic diagnosis rejected by analyst.')} />
            <SmallButton label="INCONCLUSIVE" onPress={() => addRecord('conclusion', 'INCONCLUSIVE', draft || 'Diagnosis remains inconclusive.')} />
          </View>
        </View>
      );
    }

    if (activeTab === 'prediction') {
      return (
        <View className="gap-4">
          <WorkAreaHeader
            step="PROGNOSIS WORKBENCH"
            title="Prediction"
            description="Prediction is shown only as far as the production data supports it. A danger projection is not functional RUL unless a validated failure model is present."
          />
          <View className="flex-row flex-wrap gap-2">
            <MetricTile
              label="STATUS"
              value={selectedPrediction?.predictionStatus ?? (prognosisModel.enabled ? 'MONITORING' : 'UNAVAILABLE')}
              note={selectedPrediction?.thresholdProjectionWording ?? 'No defensible threshold horizon is currently available.'}
            />
            <MetricTile
              label="MODEL"
              value={selectedPrediction?.modelType ?? 'NONE'}
              note={`${prognosisModel.historySampleCount} historical samples / ${prognosisModel.sourceLabel}`}
            />
            <MetricTile
              label="PROJECTED DANGER"
              value={selectedPrediction?.estimatedTimeToDangerDays === null || !selectedPrediction ? '--' : `${fmt(selectedPrediction.estimatedTimeToDangerDays, 0)} days`}
              note={selectedPrediction?.faultName ?? 'No credible forecast'}
            />
            <MetricTile
              label="OPERATING TIME"
              value={selectedPrediction?.operatingHoursToThreshold === null || !selectedPrediction ? '--' : `${fmt(selectedPrediction.operatingHoursToThreshold, 0)} hours`}
            />
            <MetricTile
              label="PREDICTION CONFIDENCE"
              value={selectedPrediction ? `${fmt(selectedPrediction.predictionConfidence, 0)}%` : '--'}
            />
            <MetricTile
              label="FUNCTIONAL RUL"
              value={
                selectedPrediction?.functionalFailureValidated
                  ? `${fmt(selectedPrediction.estimatedTimeToFunctionalFailureDays, 0)} days`
                  : 'UNAVAILABLE'
              }
              note="Requires a validated functional-failure model."
            />
          </View>
          {prognosisModel.predictions.length > 0 ? (
            <View className="gap-2">
              {prognosisModel.predictions.map((prediction) => (
                <View key={prediction.predictionId} className="flex-row flex-wrap items-center gap-3 rounded-lg border px-3 py-2" style={{ borderColor: hairline }}>
                  <Text style={{ width: 72, color: conditionHex[prediction.condition] }} className="font-mono text-[9px] font-bold tracking-wider">
                    {prediction.faultId}
                  </Text>
                  <Text style={{ width: 126 }} className={cn('font-mono text-[9px]', mutedClass)}>
                    {prediction.estimatedTimeToDangerDays === null ? prediction.predictionStatus : `${fmt(prediction.estimatedTimeToDangerDays, 0)} days`}
                  </Text>
                  <Text className={cn('min-w-[180px] flex-1 font-body text-[10px] leading-[15px]', inkClass)}>{prediction.faultName}</Text>
                  <Text className={cn('font-mono text-[9px]', mutedClass)}>
                    {prediction.modelType} / {prediction.modelFit === null ? '--' : `${fmt(prediction.modelFit * 100, 0)}%`}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Unavailable
              title={prognosisModel.enabled ? 'NO CREDIBLE THRESHOLD FORECAST' : 'HISTORICAL SIMULATION IS OFF'}
              reason={prognosisModel.enabled ? 'Signals remain under monitoring or need more history.' : 'Enable historical trend capture to generate prognostic data.'}
            />
          )}
          {selectedPrediction ? (
            <View className="flex-row flex-wrap gap-2">
              <MetricTile label="R2" value={fmt(selectedPrediction.modelFit, 3)} />
              <MetricTile label="ROBUST SLOPE" value={fmt(selectedPrediction.robustSlopePerDay, 4)} />
              <MetricTile label="MONOTONICITY" value={fmt(selectedPrediction.advanced.monotonicity, 2)} />
              <MetricTile
                label="RUL"
                value={selectedPrediction.functionalFailureValidated ? fmt(selectedPrediction.estimatedTimeToFunctionalFailureDays, 0) : 'UNAVAILABLE'}
              />
            </View>
          ) : null}
          <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>
            {modelCaveat ?? 'Threshold projection is not Remaining Useful Life. Functional-failure forecasts stay unavailable until a validated failure model exists.'}
          </Text>
        </View>
      );
    }

    if (activeTab === 'evidence') {
      return (
        <View className="gap-4">
          <WorkAreaHeader
            step="FORENSIC LEDGER"
            title="Evidence and traceability"
            description="Collected analyst evidence sits beside derived signal and finding rows so the investigation can be re-walked from measurement to conclusion."
          />
          <EvidenceTray evidence={evidence} onRemove={(id) => setPendingRemoval(evidence.find((item) => item.id === id) ?? null)} />
          <View className="flex-row flex-wrap gap-2">
            <MetricTile label="SCOPED FINDINGS" value={String(scopedFindings.length)} note={scopedFindings[0]?.headline ?? 'No finding tied to this scope'} />
            <MetricTile label="SIGNAL ROWS" value={String(signals.length)} note={signals[0]?.label ?? 'No signal rows supplied'} />
            <MetricTile label="COLLECTED" value={String(evidence.length)} note="Session evidence items" />
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            <SmallButton label="CAPTURE SCOPE" onPress={() => addEvidence(activeExplorer?.label ?? machineName, activeExplorer?.detail ?? 'Current advanced scope')} />
            <SmallButton label="CAPTURE FINDINGS" onPress={() => addEvidence('Scoped findings', scopedFindings.map((finding) => finding.headline).join(' / ') || 'No scoped findings')} />
          </View>
        </View>
      );
    }

    return (
      <View className="gap-4">
        <EventsWorkArea events={events} />
        <WorkAreaHeader step="ADDITIVE REVIEW" title="Analyst note and case" description="This app does not expose Part2's replay store here, so history combines machine events with local analyst records." />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          placeholder="Add timestamped analyst note..."
          placeholderTextColor={isDark ? 'rgba(255,255,255,0.36)' : 'rgba(0,0,0,0.36)'}
          className={cn('min-h-[78px] rounded-lg border px-3 py-2 font-body text-[11px]', inkClass)}
          style={{ borderColor: hairline, backgroundColor: inputBg, textAlignVertical: 'top' }}
        />
        <View className="flex-row flex-wrap gap-1.5">
          <SmallButton label="ADD NOTE" onPress={() => addRecord('note')} />
          <SmallButton label="CREATE CASE" onPress={() => addRecord('case', 'OPEN', draft || `Investigation for ${machineName}`)} />
        </View>
        <View className="gap-2">
          {records.map((record) => (
            <View key={record.id} className="gap-1 rounded-lg border px-3 py-2" style={{ borderColor: hairline }}>
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className={cn('font-mono text-[8px]', mutedClass)}>{new Date(record.timestamp).toLocaleString()}</Text>
                <Text className="font-mono text-[8px] font-bold tracking-wider text-accent">{RECORD_LABEL[record.type]}</Text>
                <Text className={cn('font-body-medium text-[11px]', inkClass)}>{record.status ?? RECORD_LABEL[record.type]}</Text>
              </View>
              <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>{record.text}</Text>
            </View>
          ))}
        </View>
      </View>
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
            {activeExplorer?.trail.join(' / ') ?? (trail.length > 0 ? trail.map((n) => n.name).join(' / ') : 'no selection')}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-1.5">
          {contextItem('CONDITION', CONDITION_LABEL[condition], conditionHex[condition])}
          {contextItem('OPERATING', operatingState)}
          {contextItem('RPM', rpm ?? 'NO DATA')}
          {contextItem('LOAD', load ?? 'NO DATA')}
          {contextItem('DATA', dataQuality.toUpperCase())}
          {contextItem('UPDATED', lastUpdated)}
        </View>
      </View>

      <AnalysisTabs active="advanced" onSelect={onSelectDepth} trailing={tabsTrailing} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-1.5">
          {ADVANCED_TABS.map((tabItem) => (
            <SmallButton
              key={tabItem.id}
              label={tabItem.label}
              active={tabItem.id === activeTab}
              onPress={() => setActiveTab(tabItem.id)}
            />
          ))}
          {!treeOpen ? <SmallButton label="SHOW EXPLORER" onPress={() => setTreeOpen(true)} /> : null}
          {!intelOpen ? <SmallButton label="SHOW INTEGRITY" onPress={() => setIntelOpen(true)} /> : null}
        </View>
      </ScrollView>

      <View className="flex-row flex-wrap items-stretch gap-3">
        {treeOpen ? (
          <View style={{ width: TREE_WIDTH }}>
            <Panel fill>
              <View className="gap-3">
                <WorkAreaHeader
                  step="KNOWLEDGE GRAPH"
                  title="Engineering Explorer"
                  description="Choose a scope by asset, process, problem or signal. Search jumps to a related node or tab."
                />
                <View className="flex-row flex-wrap gap-1.5">
                  {EXPLORER_MODES.map((modeItem) => (
                    <SmallButton
                      key={modeItem.id}
                      label={modeItem.label}
                      active={modeItem.id === explorerMode}
                      onPress={() => changeExplorerMode(modeItem.id)}
                    />
                  ))}
                </View>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search signal, problem, tab..."
                  placeholderTextColor={isDark ? 'rgba(255,255,255,0.36)' : 'rgba(0,0,0,0.36)'}
                  className={cn('rounded-lg border px-3 py-2 font-body text-[11px]', inkClass)}
                  style={{ borderColor: hairline, backgroundColor: inputBg }}
                />
                {searchResults.length > 0 ? (
                  <View className="gap-1 rounded-lg border p-1" style={{ borderColor: hairline }}>
                    {searchResults.map((result) => (
                      <Pressable
                        key={result.id}
                        onPress={() => {
                          if ('node' in result && result.node) {
                            setExplorerMode(result.node.mode);
                            selectExplorer(result.node);
                          } else if ('tab' in result) {
                            setActiveTab(result.tab);
                          }
                          setQuery('');
                        }}
                        className="gap-0.5 rounded px-2 py-1.5"
                      >
                        <Text className="font-mono text-[7px] font-bold tracking-wider text-accent">{result.type}</Text>
                        <Text numberOfLines={1} className={cn('font-body-medium text-[11px]', inkClass)}>{result.label}</Text>
                        <Text numberOfLines={1} className={cn('font-body text-[9px]', mutedClass)}>{result.detail}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {explorerMode !== 'asset' ? (
                  <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                    <View className="gap-0.5">
                      {explorerNodes[explorerMode].map((node) => {
                        const active = activeExplorer?.id === node.id;
                        return (
                          <Pressable
                            key={node.id}
                            onPress={() => selectExplorer(node)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            className={cn('flex-row items-center gap-2 rounded-lg px-2 py-2', active && 'bg-accent/10')}
                            style={{ opacity: active || related(node, activeExplorer) ? 1 : 0.68 }}
                          >
                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: conditionHex[node.condition] }} />
                            <View className="min-w-0 flex-1">
                              <Text numberOfLines={1} className={cn('font-body-medium text-[11px]', active ? 'text-accent' : inkClass)}>{node.label}</Text>
                              <Text numberOfLines={1} className={cn('font-mono text-[8px]', mutedClass)}>{node.kind} / {node.detail}</Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                ) : null}
                <PanelHeader title="Analysis tree" subtitle="MACHINE → POINT → SIGNAL" onCollapse={() => setTreeOpen(false)} />
                <AnalysisTree
                  nodes={tree}
                  selectedId={selectedId}
                  onSelect={(node) => {
                    selectNode(node.id);
                    if (node.kind === 'signal') setActiveTab('signal');
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
                onOpenEvidence={() => {
                  setActiveTab('evidence');
                  setTrayOpen(true);
                }}
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
      <Panel>
        <View className="gap-3">
          <WorkAreaHeader
            step="PERSISTENT QUALITY GATE"
            title="Diagnostic integrity"
            description="This panel records what the automatic diagnosis can defend from the data currently available to the production app."
          />
          <View className="flex-row flex-wrap gap-2">
            <MetricTile label="DATA COVERAGE" value={`${fmt(dataCoverage, 0)}%`} note={`${signalStats.length} mapped signals`} />
            <MetricTile label="DATA QUALITY" value={QUALITY_LABEL[dataQuality]} tint={qualityHex(dataQuality, isDark)} />
            <MetricTile label="TIME SYNC" value="LIMITED" note="Exact Part2 packet alignment is not in this payload." />
            <MetricTile label="OPERATING CONTEXT" value={operatingState} />
            <MetricTile label="DIAGNOSTIC COVERAGE" value={`${diagnosticCoverage}%`} note="Coverage of available evidence, not confidence." />
            <MetricTile label="AUTOMATIC DIAGNOSIS" value={topHypothesis?.name ?? conclusion.suggested} note="Model suggestion requires analyst review." />
            <MetricTile
              label="PREDICTION"
              value={
                prognosisModel.earliestProjectedDanger?.estimatedTimeToDangerDays === null || !prognosisModel.earliestProjectedDanger
                  ? prognosisModel.enabled
                    ? 'MONITORING'
                    : 'UNAVAILABLE'
                  : `${fmt(prognosisModel.earliestProjectedDanger.estimatedTimeToDangerDays, 0)} days`
              }
              note={prognosisModel.earliestProjectedDanger?.faultName ?? 'No credible forecast'}
            />
            <MetricTile
              label="MATCH SCORE"
              value={topHypothesis?.matchScore === undefined ? 'NOT RATED' : String(topHypothesis.matchScore)}
              note="Ranking only, not probability."
            />
          </View>
          {missingEvidence.length > 0 ? (
            <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>
              Recommended additional evidence: {missingEvidence.join(' / ')}
            </Text>
          ) : null}
          {doThis.length > 0 ? (
            <Text className={cn('font-body text-[10px] leading-[15px]', mutedClass)}>
              Current corrective actions: {doThis.join(' / ')}
            </Text>
          ) : null}
        </View>
      </Panel>
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
