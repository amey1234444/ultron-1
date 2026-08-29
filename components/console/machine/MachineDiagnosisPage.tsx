import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { CONDITION_LABEL, conditionHexes, type OverviewCondition } from '../../../lib/analysisOverview';
import { cn } from '../../../lib/cn';
import { consolePalette } from '../../../lib/consoleTheme';
import { Panel } from '../../Panel';
import { AnalysisTabs, type AnalysisDepth } from './analysis/AnalysisTabs';
import {
  buildDiagnosisModel,
  type DiagnosisChainStep,
  type DiagnosisDifferential,
  type DiagnosisModelSource,
  type DiagnosisProblem,
  type DiagnosisSensorEvidence,
} from './analysis/diagnosisModel';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';

const MASTER_WIDE = { flexBasis: 300, flexGrow: 3, minWidth: 280 } as const;
const DETAIL_WIDE = { flexBasis: 660, flexGrow: 7, minWidth: 280 } as const;
const COLUMN = { flexBasis: 240, flexGrow: 1, minWidth: 220 } as const;
const IMPACT = { flexBasis: 210, flexGrow: 1, minWidth: 190 } as const;

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  trailing?: ReactNode;
};

function SectionHeading({ eyebrow, title, trailing }: SectionHeadingProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="flex-row flex-wrap items-end justify-between gap-3">
      <View className="gap-1">
        <Text className={cn('font-mono text-[9px] tracking-wider', mutedClass)}>{eyebrow}</Text>
        <Text className={cn('font-heading-medium text-[16px]', inkClass)}>{title}</Text>
      </View>
      {trailing}
    </View>
  );
}

function ConditionBadge({ condition }: { condition: OverviewCondition }) {
  const { isDark } = useAppTheme();
  const colour = conditionHexes(isDark)[condition];

  return (
    <View
      className="self-start border px-2 py-1"
      style={{ borderColor: `${colour}66`, backgroundColor: `${colour}14`, borderRadius: 4 }}
    >
      <Text className="font-mono text-[9px] font-bold tracking-wider" style={{ color: colour }}>
        {CONDITION_LABEL[condition]}
      </Text>
    </View>
  );
}

function ProblemRow({ problem, selected, onPress }: { problem: DiagnosisProblem; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const conditionColour = conditionHexes(isDark)[problem.condition];
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${problem.title}, ${problem.component}, ${CONDITION_LABEL[problem.condition]}`}
      className="border px-3 py-3"
      style={({ pressed }) => ({
        borderColor: selected ? `${conditionColour}8C` : palette.line,
        borderLeftColor: conditionColour,
        borderLeftWidth: 3,
        backgroundColor: pressed ? palette.hover : selected ? palette.selected : palette.panelRaised,
        borderRadius: 4,
      })}
    >
      <View className="gap-2">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{problem.component.toLocaleUpperCase()}</Text>
            <Text className={cn('font-body-medium text-[12px]', inkClass)}>{problem.title}</Text>
          </View>
          <ConditionBadge condition={problem.condition} />
        </View>
        <Text className={cn('font-body text-[10px] leading-4', mutedClass)}>{problem.primaryFinding}</Text>
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
          <Text className="font-mono text-[9px] font-bold text-accent">{problem.scoreLabel}</Text>
          <Text className={cn('font-mono text-[8px]', mutedClass)}>{problem.trend.toLocaleUpperCase()}</Text>
          <Text className={cn('font-mono text-[8px]', mutedClass)}>{problem.lifecycle}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function DiagnosticChain({ steps }: { steps: DiagnosisChainStep[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="flex-row flex-wrap" style={{ gap: 12 }}>
      {steps.map((step, index) => (
        <View
          key={step.label}
          className="gap-2 border-t pt-4"
          style={{ ...COLUMN, borderColor: step.established ? palette.accentBorder : palette.lineStrong }}
        >
          <View className="flex-row items-center gap-2">
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: step.established ? palette.accent : palette.neutral,
              }}
            />
            <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>
              {String(index + 1).padStart(2, '0')} / {step.label.toLocaleUpperCase()}
            </Text>
          </View>
          <Text className={cn('font-body-medium text-[11px] leading-5', inkClass)}>{step.value}</Text>
        </View>
      ))}
    </View>
  );
}

function MachineDoctorGrid({ problem }: { problem: DiagnosisProblem }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  const valueFor = (label: string) => problem.chain.find((step) => step.label.toLocaleLowerCase().includes(label))?.value;
  const cards = [
    {
      label: 'WHAT',
      value:
        problem.id === 'dx-process-downstream-restriction'
          ? 'Resistance to polymer flow has increased, raising screw torque demand and drive load.'
          : (valueFor('what') ?? problem.primaryFinding),
    },
    {
      label: 'WHERE',
      value:
        problem.id === 'dx-process-downstream-restriction'
          ? 'Downstream melt path, primarily screen-pack / die region.'
          : problem.component,
    },
    {
      label: 'WHY',
      value:
        problem.id === 'dx-process-downstream-restriction'
          ? 'Pressure and power rise while motor and screw speeds fall together.'
          : (valueFor('mechanism') ?? valueFor('cause') ?? 'Telemetry has not separated the physical cause yet.'),
    },
    {
      label: 'IMPACT',
      value:
        problem.id === 'dx-process-downstream-restriction'
          ? 'Higher mechanical loading, reduced efficiency and escalation risk.'
          : (problem.impacts.find((item) => item.label === 'MACHINE IMPACT')?.value ?? problem.consequence),
    },
  ];

  return (
    <View className="gap-3">
      <Text className={cn('font-heading-medium text-[20px]', inkClass)}>{problem.title}</Text>
      <View className="flex-row flex-wrap" style={{ gap: 14 }}>
        {cards.map((card) => (
          <View
            key={card.label}
            className="gap-4 border px-4 py-4"
            style={{
              flexBasis: 300,
              flexGrow: 1,
              minWidth: 260,
              borderColor: palette.line,
              backgroundColor: palette.panelRaised,
              borderRadius: 8,
            }}
          >
            <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">{card.label}</Text>
            <Text className={cn('font-body-medium text-[14px] leading-5', inkClass)}>{card.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MetadataStrip({ problem, dataQuality }: { problem: DiagnosisProblem; dataQuality: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const entries = [
    ['RANKING', problem.scoreLabel],
    ['EVIDENCE COVERAGE', problem.coverageLabel],
    ['PROGRESSION', problem.trend.toLocaleUpperCase()],
    ['LIFECYCLE', problem.lifecycle],
    ['DATA QUALITY', dataQuality],
  ];

  return (
    <View className="flex-row flex-wrap border" style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}>
      {entries.map(([label, value]) => (
        <View key={label} className="gap-1 px-3 py-2.5" style={{ minWidth: 150, flexGrow: 1 }}>
          <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{label}</Text>
          <Text className={cn('font-mono text-[10px] font-bold', inkClass)}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function DifferentialRow({ differential, index }: { differential: DiagnosisDifferential; index: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="flex-row items-start gap-3 border-b py-4" style={{ borderColor: palette.lineSubtle }}>
      <Text className="font-mono text-[10px] font-bold text-accent">{String(index + 1).padStart(2, '0')}</Text>
      <View className="min-w-0 flex-1 gap-2">
        <View className="flex-row flex-wrap items-baseline gap-2">
          <Text className={cn('font-body-medium text-[13px]', inkClass)}>{differential.name}</Text>
          <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{differential.status}</Text>
        </View>
        <Text className={cn('font-body text-[10px] leading-4', mutedClass)}>{differential.mechanism}</Text>
        <Text className={cn('font-mono text-[8px] leading-4', mutedClass)}>
          {differential.limiting.length > 0
            ? `LIMITED BY: ${differential.limiting.join(' / ')}`
            : 'AVAILABLE EXPECTED EVIDENCE IS PRESENT'}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>MATCH</Text>
        <Text className="font-mono text-[22px] text-accent" style={{ fontWeight: '300' }}>
          {differential.matchScore ?? '--'}
        </Text>
      </View>
    </View>
  );
}

function EvidenceColumn({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="gap-3 border-t pt-3" style={{ ...COLUMN, borderColor: palette.line }}>
      <Text className={cn('font-body-medium text-[11px]', inkClass)}>{title}</Text>
      {items.length > 0 ? (
        <View className="gap-2">
          {items.map((item) => (
            <View key={item} className="flex-row items-start gap-2">
              <View className="mt-1.5 h-1 w-1 rounded-full bg-accent" />
              <Text className={cn('min-w-0 flex-1 font-body text-[10px] leading-4', mutedClass)}>{item}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className={cn('font-body text-[10px] leading-4', mutedClass)}>{empty}</Text>
      )}
    </View>
  );
}

function SensorEvidenceTable({ items }: { items: DiagnosisSensorEvidence[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  if (items.length === 0) {
    return (
      <Text className={cn('font-body text-[10px] leading-4', mutedClass)}>
        No sensor evidence can be scoped to this problem from the current live analysis contract.
      </Text>
    );
  }

  const Cell = ({ children, width, flex = 0 }: { children: ReactNode; width?: number; flex?: number }) => (
    <View style={{ width, flexGrow: flex, flexBasis: width ?? 0, minWidth: width }} className="justify-center pr-3">
      {children}
    </View>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: 820 }}>
      <View style={{ minWidth: 820, flex: 1, borderColor: palette.line, borderWidth: 1 }}>
        <View className="flex-row px-3 py-2.5" style={{ backgroundColor: palette.panelRaised }}>
          <Cell width={250}>
            <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>MEASUREMENT</Text>
          </Cell>
          <Cell width={125}>
            <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>VALUE</Text>
          </Cell>
          <Cell width={235}>
            <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>TREND / QUALIFIER</Text>
          </Cell>
          <Cell width={110}>
            <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>QUALITY</Text>
          </Cell>
          <Cell width={100}>
            <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>CONDITION</Text>
          </Cell>
        </View>
        {items.map((item) => (
          <View key={item.id} className="flex-row border-t px-3 py-3" style={{ borderColor: palette.lineSubtle }}>
            <Cell width={250}>
              <Text className={cn('font-body-medium text-[10px]', inkClass)}>{item.measurement}</Text>
              <Text className={cn('font-mono text-[8px]', mutedClass)}>{item.code}</Text>
            </Cell>
            <Cell width={125}>
              <Text className={cn('font-mono text-[10px]', inkClass)}>{item.value}</Text>
            </Cell>
            <Cell width={235}>
              <Text className={cn('font-body text-[9px] leading-4', mutedClass)}>{item.trend}</Text>
            </Cell>
            <Cell width={110}>
              <Text className={cn('font-mono text-[8px]', mutedClass)}>{item.quality}</Text>
            </Cell>
            <Cell width={100}>
              <ConditionBadge condition={item.condition} />
            </Cell>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function OrderedList({ items, empty }: { items: string[]; empty: string }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  if (items.length === 0) return <Text className={cn('font-body text-[10px] leading-4', mutedClass)}>{empty}</Text>;

  return (
    <View className="gap-2">
      {items.map((item, index) => (
        <View key={item} className="flex-row items-start gap-2">
          <Text className="font-mono text-[9px] font-bold text-accent">{String(index + 1).padStart(2, '0')}</Text>
          <Text className={cn('min-w-0 flex-1 font-body text-[10px] leading-4', inkClass)}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function signalCondition(signal: DiagnosisModelSource['diagnosisSignals'][number]): OverviewCondition {
  if (signal.state === 'fault') return 'danger';
  if (signal.state === 'limit') return 'alert';
  if (signal.state === 'boundary') return 'attention';
  return 'healthy';
}

function signalValue(signal: DiagnosisModelSource['diagnosisSignals'][number]): string {
  return `${signal.value.toFixed(signal.decimals)} ${signal.unit}`;
}

function dayPhrase(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  if (value <= 0) return 'now';
  if (value < 1) return '<1 day';
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

const SYSTEM_HEALTH_TAGS = [
  'Mechanical',
  'Drive / Load',
  'Heating / Thermal',
  'Pressure Generation',
  'Material Feeding',
  'Overall Extrusion Process',
];

const TRAIN_HEALTH_TAGS = ['Motor', 'Gearbox', 'Screw / Extrusion section', 'Barrel / Zones', 'Feeding', 'Melt path'];

const HEALTHY_EVIDENCE = [
  'Motor and gearbox vibration remain within the configured healthy region.',
  'Motor and screw speed are at healthy operating values and their ratio is normal.',
  'Motor power/load is normal.',
  'Motor and gearbox temperatures are normal.',
  'Zone temperatures and melt temperature are normal.',
  'Melt pressure and hopper level are normal.',
  'No meaningful contradictory cross-sensor pattern is present.',
];

function HealthyTag({ label }: { label: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View
      className="flex-row items-center justify-between gap-3 border px-3 py-2"
      style={{ borderColor: palette.accentBorder, backgroundColor: palette.accentSoft, borderRadius: 4, minWidth: 210, flexGrow: 1 }}
    >
      <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body-medium text-[11px]', inkClass)}>
        {label}
      </Text>
      <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">HEALTHY</Text>
    </View>
  );
}

function HealthyState({ data, onOpenPrognosis }: { data: DiagnosisModelSource; onOpenPrognosis?: () => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const healthySignals = data.diagnosisSignals.length > 0 ? data.diagnosisSignals : data.signals;
  const predictive = data.prognostics?.predictions.find(
    (prediction) =>
      prediction.condition === 'healthy' &&
      (prediction.predictionStatus === 'FORECAST_AVAILABLE' || prediction.degradationDetected),
  );
  const sensorEvidence: DiagnosisSensorEvidence[] = healthySignals.map((signal) => ({
    id: signal.code,
    measurement: signal.label,
    code: signal.code,
    value: signalValue(signal),
    trend: signal.qualifier ?? 'Inside configured healthy region.',
    quality: data.dataQuality === 'good' ? 'GOOD' : data.dataQuality.toUpperCase(),
    condition: signalCondition(signal),
  }));
  const evidenceItems = predictive
    ? [
        `${predictive.location.join(' / ')} remains inside current healthy limits.`,
        `Current value is ${predictive.currentValue === null ? '--' : predictive.currentValue.toFixed(2)} ${predictive.unit} against a healthy baseline of ${
          predictive.baselineValue === null ? '--' : predictive.baselineValue.toFixed(2)
        } ${predictive.unit}.`,
        `Historical trend is ${predictive.trendDirection.toLocaleLowerCase()} across ${predictive.historyDurationDays.toFixed(0)} days.`,
        'Motor vibration, motor power, melt pressure and thermal context remain healthy, so this is predictive monitoring rather than a current machine alarm.',
      ]
    : HEALTHY_EVIDENCE;

  return (
    <View className="gap-4">
      <Panel>
        <View className="gap-5">
          <View className="flex-row flex-wrap items-start justify-between gap-4">
            <View className="min-w-0 flex-1 gap-2">
              <ConditionBadge condition="healthy" />
              <Text className={cn('font-heading-medium text-[22px]', inkClass)}>
                {predictive ? 'Current diagnosis healthy; predictive pattern under observation' : 'No active fault detected'}
              </Text>
              <Text className={cn('max-w-[820px] font-body text-[11px] leading-5', mutedClass)}>
                {predictive
                  ? 'Diagnosis: no present ALERT or DANGER fault is active. The prognosis layer is tracking an early degradation pattern, so this remains a monitoring and planned-inspection case.'
                  : 'Diagnosis: no active mechanical, thermal, feeding, pressure, speed or process fault detected. No immediate corrective action is required; continue normal monitoring.'}
              </Text>
            </View>
            {onOpenPrognosis ? (
              <Pressable
                onPress={onOpenPrognosis}
                accessibilityRole="button"
                accessibilityLabel="Open Prognosis"
                className="border border-accent/45 bg-accent/10 px-3 py-2"
                style={{ borderRadius: 4 }}
              >
                <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">OPEN PROGNOSIS</Text>
              </Pressable>
            ) : null}
          </View>

          <View className="flex-row flex-wrap border" style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}>
            {[
              ['OVERALL CONDITION', 'HEALTHY'],
              ['CURRENT FAULTS', '0'],
              ['PREDICTIVE FINDINGS', predictive ? '1' : '0'],
              ['HIGHEST PRIORITY', predictive ? predictive.faultName.toLocaleUpperCase() : 'NONE'],
              ['PROJECTED ALERT', predictive ? dayPhrase(predictive.estimatedTimeToAlertDays).toLocaleUpperCase() : '--'],
              ['PROJECTED DANGER', predictive ? dayPhrase(predictive.estimatedTimeToDangerDays).toLocaleUpperCase() : '--'],
              ['DATA QUALITY', data.dataQuality.toUpperCase()],
            ].map(([label, value]) => (
              <View key={label} className="gap-1 px-3 py-2.5" style={{ minWidth: 150, flexGrow: 1 }}>
                <Text className={cn('font-mono text-[8px] tracking-wider', mutedClass)}>{label}</Text>
                <Text className={cn('font-mono text-[10px] font-bold', value === 'HEALTHY' ? 'text-accent' : inkClass)}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Panel>

      <View className="flex-row flex-wrap gap-4">
        <Panel>
          <View className="gap-4">
            <SectionHeading eyebrow="COMPLETE MACHINE AND PROCESS HEALTH" title="Healthy subsystem tags" />
            <View className="flex-row flex-wrap gap-2">
              {SYSTEM_HEALTH_TAGS.map((label) => (
                <HealthyTag key={label} label={label} />
              ))}
            </View>
          </View>
        </Panel>

        <Panel>
          <View className="gap-4">
            <SectionHeading eyebrow="MACHINE TRAIN / PART HEALTH" title="Healthy part tags" />
            <View className="flex-row flex-wrap gap-2">
              {TRAIN_HEALTH_TAGS.map((label) => (
                <HealthyTag key={label} label={label} />
              ))}
            </View>
          </View>
        </Panel>
      </View>

      <Panel>
        <View className="gap-4">
          <SectionHeading eyebrow="HEALTHY EVIDENCE" title={predictive ? 'Why this is not a current fault' : 'Why no fault was raised'} />
          <View className="flex-row flex-wrap" style={{ gap: 16 }}>
            <EvidenceColumn title="Supporting evidence" items={evidenceItems} empty="No healthy evidence is available." />
            <EvidenceColumn
              title="Contradicting evidence"
              items={
                predictive
                  ? [
                      'No current sensor is over an alert or danger limit.',
                      'No motor, process or thermal symptom currently supports an immediate machine fault.',
                    ]
                  : []
              }
              empty="No material contradiction against a healthy conclusion."
            />
            <EvidenceColumn
              title="Additional evidence required"
              items={
                predictive
                  ? ['Raw waveform, envelope spectrum and bearing geometry are required before naming an inner-race, outer-race or gear fault.']
                  : []
              }
              empty="None for this healthy machine snapshot."
            />
          </View>
        </View>
      </Panel>

      <Panel>
        <View className="gap-3">
          <SectionHeading eyebrow="LIVE EVIDENCE AND TREND" title="Current healthy sensor values" />
          <SensorEvidenceTable items={sensorEvidence} />
        </View>
      </Panel>
    </View>
  );
}

export type MachineDiagnosisPageProps = {
  machineName: string;
  template: string;
  hierarchyPath?: string;
  feed: FeedStatus;
  ageSeconds?: number | null;
  data: DiagnosisModelSource;
  selectedProblemId?: string | null;
  onSelectProblem?: (problemId: string) => void;
  onOpenProDiagnosis?: (problemId: string) => void;
  onSelectDepth?: (depth: AnalysisDepth) => void;
  tabsTrailing?: ReactNode;
  onSelectMachine?: () => void;
  onRefresh?: () => void;
};

export function MachineDiagnosisPage({
  machineName,
  template,
  hierarchyPath,
  feed,
  ageSeconds,
  data,
  selectedProblemId,
  onSelectProblem,
  onOpenProDiagnosis,
  onSelectDepth,
  tabsTrailing,
  onSelectMachine,
  onRefresh,
}: MachineDiagnosisPageProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const model = useMemo(() => buildDiagnosisModel(data), [data]);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    selectedProblemId && model.problems.some((problem) => problem.id === selectedProblemId)
      ? selectedProblemId
      : (model.problems[0]?.id ?? null),
  );

  useEffect(() => {
    setSelectedId((current) =>
      selectedProblemId && model.problems.some((problem) => problem.id === selectedProblemId)
        ? selectedProblemId
        : current && model.problems.some((problem) => problem.id === current)
          ? current
          : (model.problems[0]?.id ?? null),
    );
  }, [model.problems, selectedProblemId]);

  const selected = model.problems.find((problem) => problem.id === selectedId) ?? model.problems[0] ?? null;

  const selectProblem = (problemId: string) => {
    setSelectedId(problemId);
    onSelectProblem?.(problemId);
  };

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 20 }}>
      <MachineHeader
        machineName={machineName}
        template={template}
        path={hierarchyPath}
        subtitle="Active problem grouping and immediate diagnostic action"
        section="ANALYSIS / DIAGNOSIS"
        feed={feed}
        ageSeconds={ageSeconds}
        onSelectMachine={onSelectMachine}
        onRefresh={onRefresh}
      />

      <AnalysisTabs active="overview" onSelect={onSelectDepth} trailing={tabsTrailing} />

      {model.problems.length === 0 ? (
        <HealthyState data={data} onOpenPrognosis={onSelectDepth ? () => onSelectDepth('diagnosis') : undefined} />
      ) : (
        <View className="flex-row flex-wrap items-start gap-4">
          <View style={MASTER_WIDE} className="gap-4">
            <Panel>
              <View className="gap-4">
                <SectionHeading
                  eyebrow="ROOT-CAUSE GROUPING"
                  title="Active problem groups"
                  trailing={
                    <View className="border px-2 py-1" style={{ borderColor: palette.line, borderRadius: 4 }}>
                      <Text className={cn('font-mono text-[10px] font-bold', inkClass)}>{model.problems.length}</Text>
                    </View>
                  }
                />
                <View className="gap-2">
                  {model.problems.map((problem) => (
                    <ProblemRow
                      key={problem.id}
                      problem={problem}
                      selected={problem.id === selected?.id}
                      onPress={() => selectProblem(problem.id)}
                    />
                  ))}
                </View>
              </View>
            </Panel>
          </View>

          <View style={DETAIL_WIDE}>
            <Panel>
              {selected ? (
                <View className="gap-6">
                  <View className="flex-row flex-wrap items-start justify-between gap-4 border-b pb-5" style={{ borderColor: palette.line }}>
                    <View className="min-w-0 flex-1 gap-2">
                      <Text className={cn('font-mono text-[9px] tracking-wider', mutedClass)}>
                        MACHINE DOCTOR / SELECTED PROBLEM
                      </Text>
                      <Text className={cn('font-heading-medium text-[22px]', inkClass)}>{selected.title}</Text>
                      <Text className={cn('font-body text-[11px]', mutedClass)}>
                        {selected.component} / {selected.category} / {selected.consequence}
                      </Text>
                    </View>
                    <View className="items-end gap-3">
                      <ConditionBadge condition={selected.condition} />
                      {onOpenProDiagnosis ? (
                        <Pressable
                          onPress={() => onOpenProDiagnosis(selected.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Open Prognosis for ${selected.title}`}
                          className="flex-row items-center gap-2 border border-accent/45 bg-accent/10 px-3 py-2"
                          style={{ borderRadius: 4 }}
                        >
                          <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">OPEN PROGNOSIS</Text>
                          <Text className="font-mono text-[11px] text-accent">&gt;</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>

                  <MachineDoctorGrid problem={selected} />
                  <DiagnosticChain steps={selected.chain} />
                  <MetadataStrip problem={selected} dataQuality={model.dataQuality} />

                  <View
                    className="border-l-2 px-3 py-2"
                    style={{ borderLeftColor: palette.warning, backgroundColor: palette.panelRaised }}
                  >
                    <Text className={cn('font-body text-[10px] leading-4', mutedClass)}>{model.modelCaveat}</Text>
                  </View>

                  <View className="gap-1">
                    <SectionHeading eyebrow="RANKED EXPLANATIONS" title="Differential cause ranking" />
                    <Text className={cn('font-body text-[9px] leading-4', mutedClass)}>
                      Match scores order explanations against each other. They are not calibrated probabilities.
                    </Text>
                    <View>
                      {selected.differentials.map((differential, index) => (
                        <DifferentialRow key={differential.id} differential={differential} index={index} />
                      ))}
                    </View>
                  </View>

                  <View className="flex-row flex-wrap" style={{ gap: 16 }}>
                    <EvidenceColumn
                      title="Supporting evidence"
                      items={selected.supportingEvidence}
                      empty="No supporting evidence is scoped to this problem."
                    />
                    <EvidenceColumn
                      title="Contradicting evidence"
                      items={selected.contradictingEvidence}
                      empty="No material contradiction is recorded in the current analysis."
                    />
                    <EvidenceColumn
                      title="Missing evidence"
                      items={selected.missingEvidence}
                      empty="No expected evidence gap is recorded."
                    />
                  </View>

                  <View className="gap-3">
                    <SectionHeading eyebrow="SCOPED LIVE INPUTS" title="Supporting sensor evidence" />
                    <SensorEvidenceTable items={selected.sensorEvidence} />
                  </View>

                  <View className="gap-3">
                    <SectionHeading eyebrow="CURRENT CONSEQUENCE MAP" title="Impact assessment" />
                    <View className="flex-row flex-wrap border-y" style={{ borderColor: palette.line }}>
                      {selected.impacts.map((impact) => (
                        <View key={impact.label} className="gap-2 px-3 py-4" style={IMPACT}>
                          <Text className="font-mono text-[8px] font-bold tracking-wider text-accent">{impact.label}</Text>
                          <Text className={cn('font-body text-[10px] leading-4', mutedClass)}>{impact.value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View className="flex-row flex-wrap" style={{ gap: 18 }}>
                    <View className="gap-3 border-t pt-4" style={{ ...COLUMN, borderColor: palette.line }}>
                      <SectionHeading eyebrow="TEST BEFORE CONCLUDING" title="Confirmation checks" />
                      <OrderedList items={selected.confirmationChecks} empty="No confirmation checks are available." />
                    </View>
                    <View className="gap-4 border-t pt-4" style={{ ...COLUMN, borderColor: palette.line }}>
                      <SectionHeading eyebrow="CAUSE-SPECIFIC RESPONSE" title="Corrective options by cause" />
                      {selected.differentials.map((differential) => (
                        <View key={differential.id} className="gap-2 border-b pb-3" style={{ borderColor: palette.lineSubtle }}>
                          <Text className={cn('font-body-medium text-[10px]', inkClass)}>{differential.name}</Text>
                          <OrderedList
                            items={differential.correctiveActions}
                            empty="No corrective option is established until the cause is discriminated."
                          />
                        </View>
                      ))}
                    </View>
                    <View className="gap-3 border-t pt-4" style={{ ...COLUMN, borderColor: palette.line }}>
                      <SectionHeading eyebrow="CLOSE ON EVIDENCE" title="Post-maintenance verification" />
                      <OrderedList
                        items={selected.verification}
                        empty="No verification window can be established from the current data."
                      />
                      <Text className={cn('font-mono text-[8px] leading-4', mutedClass)}>
                        Observation window: not established by the current live analysis contract.
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </Panel>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
