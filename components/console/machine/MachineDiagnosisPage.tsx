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
  FAULTY_SSE_CAUSE_RANKING,
  FAULTY_SSE_DIAGNOSIS_ROWS,
  FAULTY_SSE_LIMITING_EVIDENCE,
  FAULTY_SSE_MACHINE_DOCTOR,
  FAULTY_SSE_RECOMMENDED_ACTION,
  FAULTY_SSE_SUPPORTING_EVIDENCE,
  HEALTHY_SSE_DIAGNOSIS_EVIDENCE,
  HEALTHY_SSE_DIAGNOSIS_MESSAGE,
  HEALTHY_SSE_DIAGNOSIS_RESULT,
  HEALTHY_SSE_EVIDENCE_STATUS,
  PREDICTIVE_SSE_DIAGNOSIS_MESSAGE,
  PREDICTIVE_SSE_DIAGNOSIS_ROWS,
  PREDICTIVE_SSE_LIMITING_EVIDENCE,
  PREDICTIVE_SSE_MACHINE_DOCTOR,
  PREDICTIVE_SSE_SUPPORTING_EVIDENCE,
} from './demoSseDocs';
import {
  buildDiagnosisModel,
  type DiagnosisChainStep,
  type DiagnosisDifferential,
  type DiagnosisModelSource,
  type DiagnosisProblem,
  type DiagnosisSensorEvidence,
} from './analysis/diagnosisModel';
import { MachineHeader, type FeedStatus } from './overview/MachineHeader';
import {
  ConditionPill,
  DoctorCard,
  EvidenceCard,
  FactStrip,
  RegionHeading,
  SensorEvidenceGrid,
  StateTagGrid,
  VerdictHeader,
} from './analysis/DiagnosisPresentation';
import { Button, alpha, radius, tabular, text } from '../../ui';

const MASTER_WIDE = { flexBasis: 300, flexGrow: 3, minWidth: 280 } as const;
const DETAIL_WIDE = { flexBasis: 660, flexGrow: 7, minWidth: 280 } as const;
const COLUMN = { flexBasis: 240, flexGrow: 1, minWidth: 220 } as const;
const IMPACT = { flexBasis: 210, flexGrow: 1, minWidth: 190 } as const;
// Two panels that share a row on a desktop and stack on anything narrower. The
// pair has to break together — one full-width panel beside a half-width one
// reads as a layout accident rather than as two peers.
const TAG_COLUMN = { flexBasis: 420, flexGrow: 1, minWidth: 300 } as const;

/** How many things a region is listing. Sits on the region heading, not in it. */
function CountChip({ count, suffix }: { count: number; suffix?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className="flex-row items-baseline gap-1 px-2 py-[3px]"
      style={{ backgroundColor: alpha(palette.neutral, 0.12), borderRadius: radius.sm }}
    >
      <Text className={text.code} style={[tabular, { color: palette.ink }]}>
        {count}
      </Text>
      {suffix ? (
        <Text className={text.meta} style={{ color: palette.inkMuted }}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  trailing?: ReactNode;
};

function SectionHeading({ eyebrow, title, trailing }: SectionHeadingProps) {
  return <RegionHeading eyebrow={eyebrow} title={title} trailing={trailing} />;
}

// One pill for every condition rung on this page, so the badge on a problem row
// and the one on a sensor card cannot drift apart. See DiagnosisPresentation.
function ConditionBadge({ condition }: { condition: OverviewCondition }) {
  return <ConditionPill condition={condition} />;
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
          ? 'Increasing resistance to polymer flow is increasing screw torque demand and drive load.'
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
          ? 'Melt pressure is elevated while drive power rises and motor/screw speed fall together.'
          : (valueFor('mechanism') ?? valueFor('cause') ?? 'Telemetry has not separated the physical cause yet.'),
    },
    ...(problem.id === 'dx-process-downstream-restriction'
      ? [
          {
            label: 'SEVERITY',
            value: 'ALERT - developing fault; machine is still running.',
          },
        ]
      : []),
    {
      label: 'IMPACT',
      value:
        problem.id === 'dx-process-downstream-restriction'
          ? 'Higher mechanical load, reduced process efficiency and risk of escalation if restriction increases.'
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

function DemoDocList({ title, items }: { title: string; items: readonly string[] }) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  return (
    <View className="gap-2">
      <Text className={cn('font-mono text-[9px] font-bold uppercase tracking-wider', mutedClass)}>{title}</Text>
      <View className="gap-1.5">
        {items.map((item) => (
          <Text key={item} className={cn('font-body text-[11px] leading-4', inkClass)}>
            {item}
          </Text>
        ))}
      </View>
    </View>
  );
}

function DemoDiagnosisDocBlock({
  rows,
  doctor,
  sections,
  valueTone = 'warning',
}: {
  rows: readonly (readonly [string, string])[];
  doctor: readonly (readonly [string, string])[];
  sections: Array<{ title: string; items: readonly string[] }>;
  valueTone?: 'warning' | 'accent';
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const valueColor = valueTone === 'accent' ? palette.accent : palette.warning;

  return (
    <View className="gap-4 border-b pb-4" style={{ borderColor: palette.line }}>
      <View className="gap-3">
        {rows.map(([label, value]) => (
          <View key={label} className="flex-row flex-wrap items-baseline gap-x-8 gap-y-1">
            <Text className={cn('font-body-medium text-[11px]', mutedClass)} style={{ width: 240 }}>
              {label}
            </Text>
            <Text className="min-w-0 flex-1 font-body-bold text-[12px]" style={{ color: valueColor }}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        {doctor.map(([label, value]) => (
          <View
            key={label}
            className="gap-3 border px-3 py-3"
            style={{ flexBasis: 230, flexGrow: 1, minWidth: 210, borderColor: palette.line, backgroundColor: palette.panelRaised, borderRadius: 6 }}
          >
            <Text className="font-mono text-[9px] font-bold tracking-wider text-accent">{label}</Text>
            <Text className={cn('font-body-medium text-[12px] leading-5', inkClass)}>{value}</Text>
          </View>
        ))}
      </View>

      {sections.map((section) => (
        <DemoDocList key={section.title} title={section.title} items={section.items} />
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

function HealthyState({
  data,
  isPredictiveSseDemo,
  isHealthySseDemo,
  onOpenPrognosis,
}: {
  data: DiagnosisModelSource;
  isPredictiveSseDemo?: boolean;
  isHealthySseDemo?: boolean;
  onOpenPrognosis?: () => void;
}) {
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
        'Gearbox Output Vibration remains HEALTHY but has risen progressively toward its H threshold.',
        'Historical raw waveform snapshots show increasing impulsive content on the gearbox output side.',
        'Part 2-calculated kurtosis and crest factor trend upward across snapshots.',
        'Part 2-calculated envelope energy / bearing-frequency family trend increases over time.',
        'Gearbox Input Vibration remains comparatively stable, helping localize the pattern to the output side.',
        'RPM and operating context remain sufficiently comparable for the trend to be meaningful.',
      ]
    : HEALTHY_EVIDENCE;

  return (
    <View className="gap-4">
      <Panel>
        <View className="gap-5">
          {isHealthySseDemo ? (
            <DemoDiagnosisDocBlock
              rows={[
                ['Complete Machine', 'HEALTHY'],
                ['Problem groups', '0'],
                ['Highest-priority problem', 'None'],
                ['Corrective action', 'None required; continue normal monitoring.'],
              ]}
              doctor={[
                ['Diagnosis', 'No active mechanical, thermal, feeding, pressure, speed or process fault detected.'],
              ]}
              valueTone="accent"
              sections={[
                { title: 'DIAGNOSIS RESULT', items: HEALTHY_SSE_DIAGNOSIS_RESULT },
                { title: 'HEALTHY EVIDENCE', items: HEALTHY_SSE_DIAGNOSIS_EVIDENCE },
                { title: 'EVIDENCE STATUS', items: HEALTHY_SSE_EVIDENCE_STATUS },
                { title: 'DEMO MESSAGE', items: [HEALTHY_SSE_DIAGNOSIS_MESSAGE] },
              ]}
            />
          ) : null}

          <VerdictHeader
            condition="healthy"
            eyebrow={predictive ? 'CURRENT DIAGNOSIS' : 'DIAGNOSIS RESULT'}
            title={predictive ? 'HEALTHY - no current ALERT/DANGER fault' : 'No active fault detected'}
            detail={
              predictive
                ? 'Current machine condition is HEALTHY. Historical vibration processing indicates an early localized degradation pattern at the gearbox output side that warrants predictive monitoring, not an immediate current-fault alarm.'
                : 'Diagnosis: no active mechanical, thermal, feeding, pressure, speed or process fault detected. No immediate corrective action is required; continue normal monitoring.'
            }
            action={
              onOpenPrognosis ? (
                <Button onPress={onOpenPrognosis} tone="secondary" size="sm" iconRight="arrow-right" accessibilityLabel="Open Prognosis">
                  Open prognosis
                </Button>
              ) : null
            }
          />

          {predictive && isPredictiveSseDemo ? (
            <DemoDiagnosisDocBlock
              rows={PREDICTIVE_SSE_DIAGNOSIS_ROWS}
              doctor={PREDICTIVE_SSE_MACHINE_DOCTOR}
              valueTone="accent"
              sections={[
                { title: 'SUPPORTING EVIDENCE SHOWN', items: PREDICTIVE_SSE_SUPPORTING_EVIDENCE },
                { title: 'CONTRADICTING / DIFFERENTIAL EVIDENCE SHOWN', items: PREDICTIVE_SSE_LIMITING_EVIDENCE },
                { title: 'DIAGNOSIS MESSAGE', items: [PREDICTIVE_SSE_DIAGNOSIS_MESSAGE] },
              ]}
            />
          ) : null}

          <FactStrip
            facts={[
              { label: 'OVERALL CONDITION', value: 'HEALTHY', tone: 'healthy' },
              { label: 'CURRENT FAULTS', value: '0' },
              { label: 'PREDICTIVE FINDINGS', value: predictive ? '1' : '0', tone: predictive ? 'attention' : undefined },
              {
                label: 'OBSERVED EARLY PATTERN',
                value: predictive ? 'Gearbox-output bearing-related degradation indicators under observation' : 'NONE',
                wide: Boolean(predictive),
              },
              {
                label: 'CURRENT FAULT SEVERITY',
                value: predictive ? 'No current fault escalation; predictive evidence only' : 'NONE',
                wide: Boolean(predictive),
              },
              { label: 'PROJECTED ALERT', value: predictive ? dayPhrase(predictive.estimatedTimeToAlertDays).toLocaleUpperCase() : '--' },
              { label: 'PROJECTED DANGER', value: predictive ? dayPhrase(predictive.estimatedTimeToDangerDays).toLocaleUpperCase() : '--' },
              { label: 'DATA QUALITY', value: data.dataQuality.toUpperCase(), tone: data.dataQuality === 'good' ? 'healthy' : 'attention' },
            ]}
          />
        </View>
      </Panel>

      <View className="flex-row flex-wrap" style={{ gap: 16 }}>
        <View style={TAG_COLUMN}>
          <Panel>
            <View className="gap-4">
              <SectionHeading
                eyebrow="COMPLETE MACHINE AND PROCESS HEALTH"
                title="Healthy subsystem tags"
                trailing={<CountChip count={SYSTEM_HEALTH_TAGS.length} />}
              />
              <StateTagGrid items={SYSTEM_HEALTH_TAGS.map((label) => ({ label, condition: 'healthy' as const }))} minWidth={190} />
            </View>
          </Panel>
        </View>

        <View style={TAG_COLUMN}>
          <Panel>
            <View className="gap-4">
              <SectionHeading
                eyebrow="MACHINE TRAIN / PART HEALTH"
                title="Healthy part tags"
                trailing={<CountChip count={TRAIN_HEALTH_TAGS.length} />}
              />
              <StateTagGrid items={TRAIN_HEALTH_TAGS.map((label) => ({ label, condition: 'healthy' as const }))} minWidth={190} />
            </View>
          </Panel>
        </View>
      </View>

      {predictive ? (
        <Panel>
          <View className="gap-4">
            <SectionHeading eyebrow="MACHINE DOCTOR" title="Predictive diagnosis separation" />
            <View className="flex-row flex-wrap" style={{ gap: 12 }}>
              <DoctorCard label="WHAT" value="No present operating limit is exceeded; the machine is currently HEALTHY." />
              <DoctorCard label="WHERE" value="Historical evidence is localized primarily to the gearbox output-side vibration measurement." />
              <DoctorCard
                label="WHY IT IS BEING WATCHED"
                value="waveform-derived impulsiveness/envelope features are progressively increasing even though overall RMS remains below ALERT."
              />
              <DoctorCard label="IMPACT NOW" value="no confirmed current process or production impairment." />
              <DoctorCard label="RISK IF CONTINUES" value="A gearbox-output bearing condition may develop into an ALERT condition in the future." />
            </View>
          </View>
        </Panel>
      ) : null}

      <Panel>
        <View className="gap-4">
          <SectionHeading eyebrow="HEALTHY EVIDENCE" title={predictive ? 'Why this is not a current fault' : 'Why no fault was raised'} />
          <View className="flex-row flex-wrap" style={{ gap: 12 }}>
            <EvidenceCard
              title="Supporting evidence"
              variant="success"
              icon="check-decagram-outline"
              items={evidenceItems}
              empty="No healthy evidence is available."
            />
            <EvidenceCard
              title="Contradicting evidence"
              variant="warning"
              icon="scale-balance"
              items={
                predictive
                  ? [
                      'Motor vibration remains healthy and comparatively stable.',
                      'Motor power and melt pressure remain healthy, arguing against process-overload as the primary explanation.',
                      'Gear-mesh indicators should remain stable if real FFT processing does not support a gear fault.',
                      'Current gearbox temperature remains healthy.',
                      'No specific outer-race/inner-race conclusion should be shown unless the actual envelope spectrum and metadata support it.',
                    ]
                  : []
              }
              empty="No material contradiction against a healthy conclusion."
            />
            <EvidenceCard
              title="Additional evidence required"
              variant="info"
              icon="clipboard-text-search-outline"
              items={
                predictive
                  ? ['No specific outer-race/inner-race conclusion should be shown unless the actual envelope spectrum and metadata support it.']
                  : []
              }
              empty="None for this healthy machine snapshot."
            />
          </View>
        </View>
      </Panel>

      <Panel>
        <View className="gap-4">
          <SectionHeading
            eyebrow="LIVE EVIDENCE AND TREND"
            title="Current healthy sensor values"
            trailing={<CountChip count={sensorEvidence.length} suffix="points" />}
          />
          <SensorEvidenceGrid
            items={sensorEvidence}
            empty="No sensor evidence can be scoped to this problem from the current live analysis contract."
          />
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
  const isHealthySseDemo = machineName === 'Healthy SSE Demo';
  const isPredictiveSseDemo = machineName === 'SSE Prediction Demo';
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
        <HealthyState
          data={data}
          isHealthySseDemo={isHealthySseDemo}
          isPredictiveSseDemo={isPredictiveSseDemo}
          onOpenPrognosis={onSelectDepth ? () => onSelectDepth('diagnosis') : undefined}
        />
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
                  {selected.id === 'dx-process-downstream-restriction' ? (
                    <DemoDiagnosisDocBlock
                      rows={FAULTY_SSE_DIAGNOSIS_ROWS}
                      doctor={FAULTY_SSE_MACHINE_DOCTOR}
                      sections={[
                        { title: 'SUPPORTING EVIDENCE SHOWN', items: FAULTY_SSE_SUPPORTING_EVIDENCE },
                        { title: 'CONTRADICTING / LIMITING EVIDENCE', items: FAULTY_SSE_LIMITING_EVIDENCE },
                        { title: 'CAUSE RANKING SHOWN', items: FAULTY_SSE_CAUSE_RANKING },
                        { title: 'RECOMMENDED ACTION', items: [FAULTY_SSE_RECOMMENDED_ACTION] },
                      ]}
                    />
                  ) : null}

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

                  <View className="flex-row flex-wrap" style={{ gap: 12 }}>
                    <EvidenceCard
                      title="Supporting evidence"
                      variant="destructive"
                      icon="check-decagram-outline"
                      items={selected.supportingEvidence}
                      empty="No supporting evidence is scoped to this problem."
                    />
                    <EvidenceCard
                      title="Contradicting evidence"
                      variant="warning"
                      icon="scale-balance"
                      items={selected.contradictingEvidence}
                      empty="No material contradiction is recorded in the current analysis."
                    />
                    <EvidenceCard
                      title="Missing evidence"
                      variant="info"
                      icon="clipboard-text-search-outline"
                      items={selected.missingEvidence}
                      empty="No expected evidence gap is recorded."
                    />
                  </View>

                  <View className="gap-3">
                    <SectionHeading eyebrow="SCOPED LIVE INPUTS" title="Supporting sensor evidence" />
                    <SensorEvidenceGrid
                      items={selected.sensorEvidence}
                      empty="No sensor evidence can be scoped to this problem from the current live analysis contract."
                    />
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
