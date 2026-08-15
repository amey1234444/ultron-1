/**
 * Diagnosis — the answer, and the working behind it.
 *
 * The old version was one column of full-width prose cards: verdict, then a
 * paragraph, then a hypothesis block the height of the viewport, then another,
 * then maintenance. A reader had to scroll past the evidence to find out what
 * to do about it.
 *
 * It is now four regions with a fixed reading order — what was concluded, how
 * it was reached, what else it could be, what to do — each compact enough that
 * the first three fit one screen on a laptop and the hypotheses expand only
 * when a reader asks for one.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import type { FaultAssessmentRecord } from '../../../../lib/analysis/extruder';
import {
  Badge,
  Body,
  Collapsible,
  consolePalette,
  Meter,
  Separator,
  StatusDot,
  variantStyle,
  type IconName,
  type Variant,
} from '../../../ui';
import { EmptyNote, Fact, Section, StepRow } from './AnalyzerParts';

function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : Number(value.toPrecision(digits));
  return String(rounded);
}

function humanise(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}

const MATCH_CLASS_VARIANT: Record<string, Variant> = {
  STRONG_CANDIDATE: 'destructive',
  CANDIDATE: 'warning',
  WEAK: 'info',
  INSUFFICIENT: 'muted',
  ELIMINATED: 'muted',
};

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export type DiagnosisSummaryProps = {
  variant: Variant;
  /** The one-line conclusion. */
  headline: string;
  /** `<layer> layer · <category>`, or "no fault signature". */
  eyebrow: string;
  /** The model's own summary sentence. */
  detail: string;
  /** Ambiguity class, e.g. "not identifiable with installed sensors". */
  identifiability: string;
  /** 0-100 evidence readiness, and whether it clears the bar. */
  readiness: { score: number; ready: boolean; variant: Variant; missing: string[] };
  machineState: { label: string; variant: Variant; basis: string };
  hypotheses: number;
  /** Strongest engineering match score on screen. Ordinal, never a probability. */
  topScore: number | null;
  unresolvedSignals: number;
  severity: { label: string; variant: Variant };
};

export function DiagnosisSummary({
  variant,
  headline,
  eyebrow,
  detail,
  identifiability,
  readiness,
  machineState,
  hypotheses,
  topScore,
  unresolvedSignals,
  severity,
}: DiagnosisSummaryProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, variant);

  const facts: { label: string; value: string; tone?: string }[] = [
    { label: 'Machine state', value: machineState.label, tone: variantStyle(palette, machineState.variant).accent },
    { label: 'Severity', value: severity.label, tone: variantStyle(palette, severity.variant).accent },
    { label: 'Hypotheses', value: String(hypotheses) },
    { label: 'Match score', value: topScore === null ? '—' : String(topScore) },
    { label: 'Unresolved signals', value: String(unresolvedSignals) },
  ];

  return (
    <View
      className="overflow-hidden rounded-xl border"
      style={{ backgroundColor: palette.panel, borderColor: palette.line, borderLeftWidth: 3, borderLeftColor: style.accent }}
    >
      <View className="gap-3 px-4 py-3.5 lg:flex-row lg:items-start lg:justify-between">
        <View className="min-w-0 flex-1 gap-1.5">
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name={style.icon} size={14} color={style.accent} />
            <Text className="font-mono text-[8.5px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
              {eyebrow}
            </Text>
          </View>
          <Text className="font-body-bold text-[19px] leading-[25px] tracking-[-0.025em]" style={{ color: palette.ink }}>
            {headline}
          </Text>
          <Text className="font-body text-[12px] leading-[17px]" style={{ color: palette.inkMuted }}>
            {detail}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5 pt-1">
            <Badge variant={variant}>{identifiability}</Badge>
            <Badge variant="muted" icon="flask-outline">
              Engineering development
            </Badge>
            <Badge variant="muted" icon="hand-back-right-outline">
              Advisory only
            </Badge>
          </View>
        </View>

        {/* Readiness rides with the verdict rather than in its own card: a
            strong conclusion drawn from half the instrument set means something
            different from the same conclusion drawn from all of it. */}
        <View
          className="min-w-[196px] gap-2 rounded-lg px-3 py-2.5 lg:max-w-[232px]"
          style={{ backgroundColor: palette.panelRaised }}
        >
          <View className="flex-row items-center justify-between gap-2">
            <Text className="font-mono text-[8.5px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
              Evidence readiness
            </Text>
            <Text
              className="font-body text-[17px] leading-[19px]"
              style={{ color: variantStyle(palette, readiness.variant).accent, fontWeight: '300', fontVariant: ['tabular-nums'] }}
            >
              {Math.round(readiness.score)}
            </Text>
          </View>
          <Meter value={readiness.score} variant={readiness.variant} height={5} />
          <Text className="font-body text-[10.5px] leading-[14px]" style={{ color: palette.inkMuted }} numberOfLines={3}>
            {readiness.ready
              ? 'Every essential instrument is mapped and reporting.'
              : `${readiness.missing.length} essential tag${readiness.missing.length === 1 ? '' : 's'} not mapped: ${readiness.missing.join(', ') || '—'}`}
          </Text>
        </View>
      </View>

      <Separator />

      <View className="flex-row flex-wrap gap-x-6 gap-y-2 px-4 py-2.5">
        {facts.map((fact) => (
          <Fact key={fact.label} label={fact.label} value={fact.value} tone={fact.tone} width={104} />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// How the conclusion was reached
// ---------------------------------------------------------------------------

export type ConclusionPanelProps = {
  machineState: string;
  stateBasis: string[];
  /** One line per remaining ambiguity, from the model. */
  separatingMeasurements: string[];
  hypotheses: number;
  /** The model's full explanation. Long, so it opens on demand. */
  explanation: string;
  /** Short bullets naming what the conclusion actually rests on. */
  evidenceBasis: string[];
};

export function ConclusionPanel({
  machineState,
  stateBasis,
  separatingMeasurements,
  hypotheses,
  explanation,
  evidenceBasis,
}: ConclusionPanelProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [open, setOpen] = useState(false);

  const blocks: { label: string; icon: IconName; lines: string[] }[] = [
    { label: 'Current machine state', icon: 'state-machine', lines: [machineState, ...stateBasis.slice(0, 1)] },
    {
      label: 'Diagnostic ambiguity',
      icon: 'call-split',
      lines: [
        hypotheses === 0
          ? 'No hypothesis survived the evidence.'
          : `${hypotheses} hypothes${hypotheses === 1 ? 'is' : 'es'} remain.`,
      ],
    },
    {
      label: 'Information required to separate them',
      icon: 'target',
      lines: separatingMeasurements.length > 0 ? separatingMeasurements : ['Nothing further — the evidence already separates them.'],
    },
    { label: 'Evidence basis', icon: 'clipboard-check-outline', lines: evidenceBasis },
  ];

  return (
    <Section
      title="How this conclusion was reached"
      eyebrow="Reasoning"
      actions={
        <Pressable
          onPress={() => setOpen((previous) => !previous)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          className="flex-row items-center gap-1 rounded-lg border px-2 py-1"
          style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
        >
          <Text className="font-mono text-[9.5px] uppercase tracking-[0.12em]" style={{ color: palette.inkMuted }}>
            {open ? 'Hide details' : 'View details'}
          </Text>
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={palette.inkFaint} />
        </Pressable>
      }
    >
      <View className="gap-2.5">
        {blocks.map((block, index) => (
          <View key={block.label}>
            {index > 0 ? <View className="mb-2.5" style={{ height: 1, backgroundColor: palette.line }} /> : null}
            <View className="flex-row items-start gap-2.5">
              <View
                className="mt-[1px] h-[22px] w-[22px] items-center justify-center rounded-md"
                style={{ backgroundColor: palette.panelRaised }}
              >
                <MaterialCommunityIcons name={block.icon} size={12} color={palette.inkMuted} />
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                  {block.label}
                </Text>
                {block.lines.filter(Boolean).map((line, lineIndex) => (
                  <Text
                    key={`${line}-${lineIndex}`}
                    className={cn('font-body leading-[17px]', lineIndex === 0 ? 'text-[12.5px]' : 'text-[11.5px]')}
                    style={{ color: lineIndex === 0 ? palette.ink : palette.inkMuted }}
                  >
                    {lineIndex === 0 ? line : `· ${line}`}
                  </Text>
                ))}
              </View>
            </View>
          </View>
        ))}

        {open ? (
          <View className="mt-1 rounded-lg px-3 py-2.5" style={{ backgroundColor: palette.panelRaised }}>
            <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
              Model explanation
            </Text>
            <Text className="mt-1 font-body text-[11.5px] leading-[17px]" style={{ color: palette.inkMuted }}>
              {explanation}
            </Text>
          </View>
        ) : null}
      </View>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Hypotheses
// ---------------------------------------------------------------------------

export function HypothesisCard({
  assessment,
  ordinal,
  maxScore,
  defaultOpen,
}: {
  assessment: FaultAssessmentRecord;
  ordinal: number;
  maxScore: number;
  defaultOpen: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const variant = MATCH_CLASS_VARIANT[assessment.matchClass] ?? 'info';
  const style = variantStyle(palette, variant);
  const [open, setOpen] = useState(defaultOpen);
  const evidence = [...assessment.primary, ...assessment.supporting, ...assessment.weak];

  return (
    <View
      className="overflow-hidden rounded-lg border"
      style={{ backgroundColor: palette.panel, borderColor: open ? palette.lineStrong : palette.line }}
    >
      <Pressable
        onPress={() => setOpen((previous) => !previous)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${assessment.faultName}, ${humanise(assessment.matchClass)}, ${evidence.length} evidence items`}
        className="gap-2 px-3 py-2.5"
        style={{ borderLeftWidth: 2, borderLeftColor: style.accent, paddingLeft: 10 }}
      >
        <View className="flex-row items-center gap-2.5">
          <Text
            className="font-mono text-[11px]"
            style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'], width: 18 }}
          >
            {String(ordinal).padStart(2, '0')}
          </Text>
          <Text className="min-w-0 flex-1 font-body-bold text-[13px] tracking-[-0.015em]" style={{ color: palette.ink }} numberOfLines={2}>
            {assessment.faultName}
          </Text>
          <Badge variant={variant}>{humanise(assessment.matchClass)}</Badge>
          <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={palette.inkFaint} />
        </View>

        <View className="flex-row flex-wrap items-center gap-x-5 gap-y-1 pl-[28px]">
          <Fact label="Fault" value={assessment.faultId} width={112} />
          <Fact label="Subsystem" value={humanise(assessment.category)} mono={false} width={112} />
          <Fact
            label="Evidence"
            value={`${assessment.primary.length} primary · ${assessment.supporting.length} supporting`}
            mono={false}
            width={150}
          />
        </View>

        {/* The score is ordinal, so it is drawn against the strongest candidate
            on screen rather than as a percentage of anything. */}
        <View className="gap-1 pl-[28px]">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
              Engineering match — ordinal, not a probability
            </Text>
            <Text className="font-mono text-[11px]" style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}>
              {assessment.engineeringMatchScore}
            </Text>
          </View>
          <Meter value={maxScore > 0 ? (assessment.engineeringMatchScore / maxScore) * 100 : 0} variant={variant} height={4} />
        </View>
      </Pressable>

      {open ? (
        <View className="gap-2 px-3 py-2.5" style={{ backgroundColor: palette.panelRaised, borderTopWidth: 1, borderTopColor: palette.line }}>
          <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
            Evidence · {evidence.length}
          </Text>
          {evidence.length === 0 ? (
            <EmptyNote>No evidence item was recorded for this hypothesis.</EmptyNote>
          ) : (
            evidence.map((item, index) => (
              <View key={`${item.feature}-${index}`} className="flex-row items-start gap-2">
                <Badge
                  variant={item.strength === 'PRIMARY_MATCH' ? 'destructive' : item.strength === 'SUPPORTING_MATCH' ? 'warning' : 'muted'}
                  icon={null}
                  outline
                >
                  {item.strength.replace('_MATCH', '')}
                </Badge>
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="font-body text-[11.5px] leading-[16px]" style={{ color: palette.ink }}>
                    {item.description}
                  </Text>
                  <Text className="font-mono text-[10px] leading-[14px]" style={{ color: palette.inkMuted }}>
                    {item.sensor} · {item.feature} = {formatNumber(item.observedValue)} · expected {item.expectedDirection}
                  </Text>
                </View>
              </View>
            ))
          )}

          {assessment.contradicting.length > 0 ? (
            <>
              <View style={{ height: 1, backgroundColor: palette.line }} />
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                Contradicting · {assessment.contradicting.length}
              </Text>
              {assessment.contradicting.map((item, index) => (
                <Text
                  key={`${item.feature}-${index}`}
                  className="font-body text-[11px] leading-[15px]"
                  style={{ color: palette.inkMuted }}
                >
                  · {item.sensor}: {item.description}
                </Text>
              ))}
            </>
          ) : null}

          <View style={{ height: 1, backgroundColor: palette.line }} />
          <View className="flex-row flex-wrap gap-x-6 gap-y-1.5">
            <Fact label="Identifiability" value={humanise(assessment.identifiability)} mono={false} width={180} />
            {assessment.separatingMeasurement ? (
              <Fact label="Separating measurement" value={assessment.separatingMeasurement} mono={false} width={220} />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function HypothesisList({
  assessments,
  maxScore,
}: {
  assessments: FaultAssessmentRecord[];
  maxScore: number;
}) {
  return (
    <Section
      title="Diagnostic candidates"
      eyebrow="Hypotheses"
      meta={
        assessments.length === 0
          ? undefined
          : 'Ranked by engineering match. Open a candidate to see the evidence it rests on.'
      }
      actions={<Badge variant={assessments.length > 1 ? 'warning' : 'muted'} icon={null} outline>{assessments.length}</Badge>}
    >
      {assessments.length === 0 ? (
        <EmptyNote>
          No known fault pattern matches the current readings. That is not a clean bill of health — it means nothing the
          model recognises is happening.
        </EmptyNote>
      ) : (
        <View className="gap-2">
          {assessments.map((assessment, index) => (
            <HypothesisCard
              key={assessment.faultId}
              assessment={assessment}
              ordinal={index + 1}
              maxScore={maxScore}
              defaultOpen={assessments.length === 1 && index === 0}
            />
          ))}
        </View>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export function MaintenanceGuidance({
  priority,
  actions,
  verification,
  variant,
}: {
  priority: string;
  actions: string[];
  verification: string[];
  variant: Variant;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <Section
      title="Maintenance guidance"
      eyebrow="What to do next"
      accent={variant}
      actions={<Badge variant={variant}>{priority} priority</Badge>}
      footnote="Advisory only. This model has not been field calibrated on this machine and actuates nothing — it is evidence for a human decision, not an instruction to the plant."
    >
      <View className="gap-3.5 lg:flex-row">
        <View className="min-w-0 flex-1 gap-2">
          <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
            Recommended actions
          </Text>
          {actions.length === 0 ? (
            <EmptyNote>No action is recommended while the evidence stands as it is.</EmptyNote>
          ) : (
            actions.map((action, index) => <StepRow key={`${action}-${index}`} index={index + 1} text={action} />)
          )}
        </View>

        <View className="min-w-0 flex-1 gap-2">
          <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
            Verification
          </Text>
          {verification.length === 0 ? (
            <EmptyNote>No verification step is defined for this case.</EmptyNote>
          ) : (
            verification.map((step, index) => <StepRow key={`${step}-${index}`} index={index + 1} text={step} muted />)
          )}
        </View>
      </View>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Eliminated
// ---------------------------------------------------------------------------

export function EliminatedList({ assessments }: { assessments: FaultAssessmentRecord[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  if (assessments.length === 0) return null;

  return (
    <Collapsible
      title="Eliminated hypotheses"
      count={assessments.length}
      icon="close-circle-outline"
      summary="Ruled out because the measurement that most directly observes the mechanism says it is not acting."
    >
      {assessments.map((assessment, index) => (
        <View
          key={assessment.faultId}
          className="flex-row items-start gap-2.5 py-1.5"
          style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
        >
          <StatusDot variant="muted" size={6} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Body>{assessment.faultName}</Body>
            <Body muted>{assessment.contradicting[0]?.description ?? 'Primary observable contradicted.'}</Body>
          </View>
        </View>
      ))}
    </Collapsible>
  );
}
