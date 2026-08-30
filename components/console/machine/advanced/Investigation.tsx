import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { conditionHexes } from '../../../../lib/analysisOverview';
import {
  CONCLUSION_STATUS_LABEL,
  HYPOTHESIS_STATUS_LABEL,
  MATCH_SCORE_CAVEAT,
  rankHypotheses,
  type AnalystHypothesis,
  type ChainStep,
  type Conclusion,
} from '../../../../lib/advancedDiagnosis';
import { cn } from '../../../../lib/cn';
import { ActionButton } from '../../ActionButton';
import { WorkAreaHeader } from './WorkAreas';

// Resolved per theme rather than at module load: light mode carries its own,
// deeper status ramp. See `conditionHexes` in lib/analysisOverview.ts.
function statusHexes(isDark: boolean): Record<AnalystHypothesis['status'], string> {
  const hex = conditionHexes(isDark);
  return {
    confirmed: hex.danger,
    probable: hex.alert,
    possible: hex.attention,
    unresolved: hex.offline,
    unlikely: hex.offline,
    rejected: hex.offline,
  };
}

// Competing explanations, with what argues against each shown at the same weight
// as what argues for it.
//
// The discriminator line is the part that makes this a workbench rather than a
// summary: a hypothesis with nothing that would settle it cannot be closed, and
// naming the test is how an analyst decides what to do next.
function HypothesisCard({ hypothesis }: { hypothesis: AnalystHypothesis }) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
  const tint = statusHexes(isDark)[hypothesis.status];

  return (
    <View className="gap-2.5 rounded-xl border px-3.5 py-3" style={{ borderColor: hairline }}>
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <Text className={cn('font-body-bold text-[13.5px]', inkClass)}>{hypothesis.name}</Text>
          <Text style={{ color: tint }} className="mt-0.5 font-mono text-[9.5px] font-bold tracking-wider">
            {HYPOTHESIS_STATUS_LABEL[hypothesis.status]}
          </Text>
        </View>

        {/* Labelled as a ranking every time it appears. */}
        {hypothesis.matchScore !== undefined ? (
          <View className="items-end">
            <Text className={cn('font-mono text-[15px] tabular-nums', inkClass)}>{hypothesis.matchScore}</Text>
            <Text className={cn('font-mono text-[8.5px] tracking-wider', mutedClass)}>MATCH RANK</Text>
          </View>
        ) : null}
      </View>

      <View className="flex-row flex-wrap gap-3">
        <View style={{ flexGrow: 1, flexBasis: 170, minWidth: 150 }} className="gap-1">
          <Text style={{ color: conditionHex.healthy }} className="font-mono text-[9.5px] font-bold tracking-wider">
            SUPPORTS
          </Text>
          {hypothesis.supporting.map((line) => (
            <Text key={line} className={cn('font-body text-[11.5px] leading-[17px]', mutedClass)}>
              + {line}
            </Text>
          ))}
        </View>

        <View style={{ flexGrow: 1, flexBasis: 170, minWidth: 150 }} className="gap-1">
          <Text style={{ color: conditionHex.danger }} className="font-mono text-[9.5px] font-bold tracking-wider">
            CONTRADICTS
          </Text>
          {hypothesis.contradicting.length === 0 ? (
            <Text className={cn('font-body text-[11.5px] italic', mutedClass)}>nothing recorded against it</Text>
          ) : (
            hypothesis.contradicting.map((line) => (
              <Text key={line} className={cn('font-body text-[11.5px] leading-[17px]', mutedClass)}>
                − {line}
              </Text>
            ))
          )}
        </View>
      </View>

      {hypothesis.discriminator ? (
        <View className="pt-2" style={{ borderTopWidth: 1, borderTopColor: hairline }}>
          <Text className={cn('font-mono text-[9.5px] tracking-wider', mutedClass)}>WOULD SETTLE IT</Text>
          <Text className={cn('mt-0.5 font-body text-[11.5px] leading-[17px]', inkClass)}>{hypothesis.discriminator}</Text>
        </View>
      ) : (
        <View className="pt-2" style={{ borderTopWidth: 1, borderTopColor: hairline }}>
          <Text style={{ color: conditionHex.attention }} className="font-mono text-[9.5px] tracking-wider">
            NO DISCRIMINATING TEST RECORDED
          </Text>
        </View>
      )}
    </View>
  );
}

// Cause → mechanism → fault → symptom, with each link marked established or
// assumed. Usually only the last links are measured, and a chain drawn without that
// distinction reads as proven the whole way down.
function RootCauseChain({ steps }: { steps: ChainStep[] }) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  return (
    <View>
      {steps.map((step, index) => (
        <View key={step.id}>
          <View
            className="gap-1 rounded-lg border px-3 py-2"
            style={{ borderColor: hairline, borderStyle: step.established ? 'solid' : 'dashed' }}
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text className={cn('font-mono text-[9.5px] tracking-wider', mutedClass)}>{step.label}</Text>
              <Text
                style={{ color: step.established ? conditionHex.healthy : conditionHex.attention }}
                className="font-mono text-[8.5px] font-bold tracking-wider"
              >
                {step.established ? 'MEASURED' : 'ASSUMED'}
              </Text>
            </View>
            <Text className={cn('font-body text-[12.5px]', inkClass)}>{step.value}</Text>
          </View>

          {index < steps.length - 1 ? (
            <View className="items-center py-0.5">
              <Text className={cn('font-mono text-[12.5px]', mutedClass)}>↓</Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

// The engineering record. The model suggests; the analyst decides; the difference is
// recorded. Nothing here auto-fills from the suggestion, because a conclusion nobody
// reviewed is not a conclusion.
function AnalystConclusion({
  conclusion,
  onAction,
}: {
  conclusion: Conclusion;
  onAction?: (action: string) => void;
}) {
  const { isDark } = useAppTheme();
  const conditionHex = conditionHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';

  const field = (label: string, value: string | null, pending?: string) => (
    <View style={{ flexGrow: 1, flexBasis: 220, minWidth: 200, borderColor: hairline }} className="gap-1 rounded-lg border px-3 py-2">
      <Text className={cn('font-mono text-[9.5px] tracking-wider', mutedClass)}>{label}</Text>
      <Text className={cn('font-body text-[12.5px]', value === null ? mutedClass : inkClass)}>
        {value ?? pending ?? 'not recorded'}
      </Text>
    </View>
  );

  // Reuses the app's own ActionButton, which already carries the permission hook
  // and the primary/secondary/danger variants. Reject is destructive to a standing
  // suggestion, so it takes the danger variant rather than a bespoke style.
  const actions: Array<{ label: string; variant: 'primary' | 'secondary' | 'danger' }> = [
    { label: 'Accept', variant: 'primary' },
    { label: 'Modify', variant: 'secondary' },
    { label: 'Partially accept', variant: 'secondary' },
    { label: 'Reject', variant: 'danger' },
    { label: 'Request more evidence', variant: 'secondary' },
  ];

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className={cn('font-body-medium text-[12.5px] uppercase tracking-wider', mutedClass)}>Analyst conclusion</Text>
        <Text style={{ color: conditionHex.attention }} className="font-mono text-[10.5px] font-bold tracking-wider">
          {CONCLUSION_STATUS_LABEL[conclusion.status]}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {field('MODEL SUGGESTED', conclusion.suggested)}
        {field('ANALYST ASSESSMENT', conclusion.analystAssessment, 'not reviewed')}
        {field('FAILURE MECHANISM', conclusion.failureMechanism, 'pending assessment')}
        {field('ROOT CAUSE', conclusion.rootCause, 'not established')}
        {field('REMAINING UNCERTAINTY', conclusion.remainingUncertainty)}
      </View>

      <View className="flex-row flex-wrap gap-2">
        {actions.map((action) => (
          <ActionButton
            key={action.label}
            label={action.label}
            variant={action.variant}
            onPress={() => onAction?.(action.label.toUpperCase())}
          />
        ))}
      </View>
    </View>
  );
}

export function InvestigationWorkArea({
  hypotheses,
  chain,
  conclusion,
  onAction,
}: {
  hypotheses: AnalystHypothesis[];
  chain: ChainStep[];
  conclusion: Conclusion;
  onAction?: (action: string) => void;
}) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const ranked = rankHypotheses(hypotheses);

  return (
    <View className="gap-4">
      <WorkAreaHeader
        step="06 · CONCLUDE"
        title="Investigation"
        description="Weigh the competing explanations against the evidence collected, then record a decision that can be defended and re-walked later."
      />

      <View className="flex-row flex-wrap gap-4">
        <View style={{ flexGrow: 2, flexBasis: 420, minWidth: 300 }} className="gap-2">
          <Text className={cn('font-mono text-[10.5px] tracking-wider', mutedClass)}>HYPOTHESES · RANKED</Text>
          {ranked.map((hypothesis) => (
            <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} />
          ))}
          <Text className={cn('font-body text-[11.5px] leading-[17px]', mutedClass)}>{MATCH_SCORE_CAVEAT}</Text>
        </View>

        <View style={{ flexGrow: 1, flexBasis: 300, minWidth: 260 }} className="gap-2">
          <Text className={cn('font-mono text-[10.5px] tracking-wider', mutedClass)}>CAUSE → MECHANISM → FAULT → SYMPTOM</Text>
          <RootCauseChain steps={chain} />
        </View>
      </View>

      <AnalystConclusion conclusion={conclusion} onAction={onAction} />
    </View>
  );
}
