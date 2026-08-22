/**
 * DIAGNOSIS — the advice card, then what raised it.
 *
 * Two cards. The advice card is a two-column plate: the ordered work on the
 * left on the card face, the checks on the right in a sunk column. That inset
 * is the whole separation — no border, no heading rule, just a step of depth,
 * which is how the reference design keeps a dense page from becoming a grid of
 * boxes. The caveat closes the right column because it qualifies the advice
 * above it rather than the machine.
 *
 * `Findings` is a card of its own; see that file for the grouping.
 *
 * What is deliberately not here: a "current diagnosis" block naming the likely
 * cause and part. The status card above states both, at display size, and two
 * statements of one conclusion is the reader wondering whether the second says
 * something the first did not. The qualifiers that block genuinely added — how
 * it ranked, how many hypotheses cannot be separated, what cannot be confirmed
 * — are the caveat line.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import type { MachinePart } from '../../../../lib/analysis/extruder';
import { cn } from '../../../../lib/cn';
import { severityRamp, type Severity } from '../../../../lib/severity';
import { consolePalette, tabular, text } from '../../../ui';
import { FindingsCard, type FindingCluster, type FindingFilter } from './Findings';

export type CurrentDiagnosis = {
  likelyCause: string;
  affectedPart: string;
  part: MachinePart | null;
  /**
   * How the candidate ranked, in words. Never a percentage: this machine has no
   * calibrated fault-probability model, and a number with a % sign beside it
   * would be a fabricated confidence.
   */
  ranking: string;
  alternatives: number;
  cannotConfirm: string[];
};

/** Maintenance priority, mapped onto the findings ramp so the whole layer agrees. */
const PRIORITY_SEVERITY: Record<string, Severity> = {
  critical: 'fault',
  high: 'fault',
  medium: 'limit',
  low: 'advisory',
};

/**
 * The work, and the checks that close it out.
 *
 * Numbered on the left because the order is part of the instruction; ticked on
 * the right because a verification is a checklist, not a sequence. Both are
 * rows on a hairline rather than cards — five bordered boxes in a column is
 * five objects to parse before the first instruction is read.
 */
function AdviceCard({
  action,
  diagnosis,
  wide,
  onOpenPart,
}: {
  action: { priority: string; steps: string[]; verification: string[] };
  diagnosis: CurrentDiagnosis | null;
  wide: boolean;
  onOpenPart: (part: MachinePart) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ramp = severityRamp(isDark);
  const tones = ramp[PRIORITY_SEVERITY[action.priority] ?? 'limit'];

  const caveat = diagnosis
    ? [
        `Ranked ${diagnosis.ranking.toLowerCase()}`,
        diagnosis.alternatives > 0
          ? `${diagnosis.alternatives} other hypothes${diagnosis.alternatives === 1 ? 'is' : 'es'} the installed sensors cannot separate from it`
          : null,
        diagnosis.cannotConfirm[0]
          ? `cannot confirm: ${diagnosis.cannotConfirm[0].replace(/\.$/, '').toLowerCase()}`
          : null,
      ]
        .filter((entry): entry is string => entry !== null)
        .join(' · ')
    : null;

  return (
    <View
      className={cn('overflow-hidden rounded-[14px] border', wide && 'flex-row')}
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      <View className="min-w-0 flex-1 px-6 pb-6 pt-5">
        <View className="flex-row flex-wrap items-baseline gap-3">
          <Text className={text.title} style={{ color: palette.ink }}>
            Do this
          </Text>
          <View className="rounded-[6px] px-2 py-1" style={{ backgroundColor: tones.head }}>
            <Text className={text.chip} style={{ color: tones.text }}>
              {action.priority} priority
            </Text>
          </View>
        </View>

        <View className="mt-3">
          {action.steps.slice(0, 5).map((step, index) => (
            <View
              key={index}
              className="flex-row items-start gap-3.5 py-3"
              style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
            >
              <Text className={text.data} style={[tabular, { color: palette.inkFaint, width: 20 }]}>
                {index + 1}
              </Text>
              <Text className={cn('min-w-0 flex-1', text.lede)} style={{ color: palette.ink }}>
                {step}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* The sunk column. One step of depth doing the work a border would. */}
      <View
        className="min-w-0 flex-1 px-6 pb-6 pt-5"
        style={{
          backgroundColor: palette.panelRaised,
          borderLeftWidth: wide ? 1 : 0,
          borderTopWidth: wide ? 0 : 1,
          borderColor: palette.line,
        }}
      >
        <Text className={text.title} style={{ color: palette.ink }}>
          Then confirm
        </Text>

        <View className="mt-3">
          {action.verification.slice(0, 5).map((step, index) => (
            <View
              key={index}
              className="flex-row items-start gap-3.5 py-3"
              style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
            >
              <MaterialCommunityIcons
                name="check"
                size={13}
                color={ramp.advisory.dot}
                style={{ marginTop: 3, width: 20 }}
              />
              <Text className={cn('min-w-0 flex-1', text.lede)} style={{ color: palette.inkMuted }}>
                {step}
              </Text>
            </View>
          ))}
        </View>

        {caveat ? (
          <View className="mt-4 pt-4" style={{ borderTopWidth: 1, borderTopColor: palette.lineStrong }}>
            <Text className={text.micro} style={{ color: palette.inkFaint }}>
              {caveat}. No percentage confidence is reported: this machine has no calibrated fault-probability model.
            </Text>
            {diagnosis?.part ? (
              <Text
                onPress={() => diagnosis.part && onOpenPart(diagnosis.part)}
                accessibilityRole="button"
                className={cn('mt-3', text.body)}
                style={{ color: ramp.advisory.text, textDecorationLine: 'underline' }}
              >
                Why — open {diagnosis.affectedPart} →
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function ConclusionTab({
  clusters,
  filter,
  onFilter,
  diagnosis,
  action,
  wide,
  onOpenPart,
}: {
  clusters: FindingCluster[];
  /** Shared with the status card's severity mix — see `Findings.tsx`. */
  filter: FindingFilter;
  onFilter: (filter: FindingFilter) => void;
  diagnosis: CurrentDiagnosis | null;
  action: { priority: string; steps: string[]; verification: string[] } | null;
  wide: boolean;
  onOpenPart: (part: MachinePart) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ramp = severityRamp(isDark);

  return (
    <View style={{ gap: 14 }}>
      {action ? (
        <AdviceCard action={action} diagnosis={diagnosis} wide={wide} onOpenPart={onOpenPart} />
      ) : (
        <View
          className="items-center rounded-[14px] border px-6 py-10"
          style={{ backgroundColor: palette.panel, borderColor: palette.line }}
        >
          <MaterialCommunityIcons name="shield-check-outline" size={22} color={ramp.advisory.dot} />
          <Text className={cn('mt-3', text.title)} style={{ color: palette.ink }}>
            No work is recommended
          </Text>
          <Text className={cn('mt-1.5 text-center', text.body)} style={{ color: palette.inkMuted }}>
            No controlled fault signature is met by the current measurements and no hard limit is breached, so the model
            has nothing to ask for.
          </Text>
        </View>
      )}

      <View
        className="overflow-hidden rounded-[14px] border"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <FindingsCard clusters={clusters} filter={filter} onFilter={onFilter} onOpenPart={onOpenPart} />
      </View>
    </View>
  );
}
