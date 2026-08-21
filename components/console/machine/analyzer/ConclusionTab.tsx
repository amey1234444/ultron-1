/**
 * DIAGNOSIS — what to do, and what raised it.
 *
 * Two regions. That is the whole screen, and getting to two took removing
 * things that were true but already stated somewhere the reader had just been:
 *
 *  - **Current diagnosis** was a block naming the likely cause and the affected
 *    part. The status band directly above the tab bar is a sentence naming the
 *    likely cause and the affected part. Two statements of one conclusion, a
 *    tab bar apart, is not emphasis — it is the reader wondering whether the
 *    second one says something the first did not. What the block genuinely
 *    added beyond the band is three qualifiers: how it ranked, how many
 *    hypotheses the sensors cannot separate, and what cannot be confirmed.
 *    Those are now one line of small print under the recommended work, which is
 *    the thing they qualify.
 *
 *  - **Key changes** listed what had moved this session. The Signals table has a
 *    Behaviour column on every row and the moving-by-how-much sentence in every
 *    expanded row, so this was a second, shorter copy of a column that already
 *    exists on the screen whose subject is monitoring.
 *
 * What is left is what nothing else says: the work to do, and the findings that
 * called for it. A reader who stops after the first region has still been told
 * what to do; a reader who does not trust it reads down into the raised rows.
 *
 * Rule ids and match scores are real and traceable, so every finding carries
 * its id in small mono type — but the line read first is a sentence, never
 * `WP3-FROZEN`. The reasoning behind the conclusion is one tab across, in
 * Advance Diagnosis, beside the part it belongs to.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import type { MachinePart } from '../../../../lib/analysis/extruder';
import { cn } from '../../../../lib/cn';
import { alpha, consolePalette, tabular, text, variantStyle, type Variant } from '../../../ui';
import { Block, EmptyState, PressSurface } from './AnalyzerParts';

/**
 * One raised finding.
 *
 * `kind` mirrors the engine's three registries exactly: a matched fault
 * signature is a FAULT, a breached hard process limit is an ALARM, a crossed
 * decision boundary is a WARNING. Severity and inference are parallel axes — a
 * fault is a root-cause inference, not the rung above an alarm — which is why
 * these are grouped side by side rather than merged into one severity ladder.
 */
export type AttentionItem = {
  key: string;
  kind: 'FAULT' | 'ALARM' | 'WARNING';
  /** Plain-language line. No rule ids. */
  message: string;
  /** Traceable identity, shown small underneath: id · feature · part. */
  reference: string;
  part: MachinePart | null;
};

export type AttentionFilter = 'all' | 'faults' | 'limits' | 'boundaries';

export type CurrentDiagnosis = {
  likelyCause: string;
  affectedPart: string;
  /** The part to open when the reader wants the reasoning. */
  part: MachinePart | null;
  /**
   * How the candidate ranked, in words. Never a percentage: this machine has no
   * calibrated fault-probability model, and a number with a % sign beside it
   * would be a fabricated confidence.
   */
  ranking: string;
  /** Hypotheses beyond the top one that the installed sensors cannot separate. */
  alternatives: number;
  cannotConfirm: string[];
};

const KIND_VARIANT: Record<AttentionItem['kind'], Variant> = {
  FAULT: 'destructive',
  ALARM: 'destructive',
  WARNING: 'warning',
};

const KIND_LABEL: Record<AttentionItem['kind'], string> = {
  FAULT: 'Fault',
  ALARM: 'Alarm',
  WARNING: 'Warning',
};

const KIND_GROUP: Record<AttentionItem['kind'], string> = {
  FAULT: 'Faults',
  ALARM: 'Limits exceeded',
  WARNING: 'Boundaries crossed',
};

const GROUP_ORDER: AttentionItem['kind'][] = ['FAULT', 'ALARM', 'WARNING'];

export const ATTENTION_FILTERS: { value: AttentionFilter; label: string; kind: AttentionItem['kind'] | null }[] = [
  { value: 'all', label: 'All', kind: null },
  { value: 'faults', label: 'Faults', kind: 'FAULT' },
  { value: 'limits', label: 'Limits', kind: 'ALARM' },
  { value: 'boundaries', label: 'Boundaries', kind: 'WARNING' },
];

export function filterAttention(items: AttentionItem[], filter: AttentionFilter): AttentionItem[] {
  const kind = ATTENTION_FILTERS.find((entry) => entry.value === filter)?.kind ?? null;
  return kind === null ? items : items.filter((item) => item.kind === kind);
}

/** Maintenance priority drives the section's accent, so urgency is visible before it is read. */
const PRIORITY_VARIANT: Record<string, Variant> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'warning',
  low: 'info',
};

// ---------------------------------------------------------------------------
// The work
// ---------------------------------------------------------------------------

/**
 * Everything the conclusion still owes the reader, on one line.
 *
 * The band above says what is wrong. This says how firmly, what else it could
 * be, and what the installed sensors cannot settle — the three things that
 * decide whether you act on the recommendation above it or go and measure
 * something first. As small print under the work rather than as a block of its
 * own, because it qualifies the work; it is not a second conclusion.
 */
function ConclusionNote({
  diagnosis,
  onOpenPart,
}: {
  diagnosis: CurrentDiagnosis;
  onOpenPart: (part: MachinePart) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const parts = [
    `Ranked ${diagnosis.ranking.toLowerCase()}`,
    diagnosis.alternatives > 0
      ? `${diagnosis.alternatives} other hypothes${diagnosis.alternatives === 1 ? 'is' : 'es'} the installed sensors cannot separate from it`
      : null,
    diagnosis.cannotConfirm[0] ? `cannot confirm: ${diagnosis.cannotConfirm[0].replace(/\.$/, '').toLowerCase()}` : null,
  ].filter((entry): entry is string => entry !== null);

  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
      <Text className={cn('min-w-[240px] flex-1', text.micro)} style={{ color: palette.inkFaint }}>
        {parts.join(' · ')}. No percentage confidence is reported: this machine has no calibrated fault-probability
        model.
      </Text>
      {diagnosis.part ? (
        <PressSurface
          onPress={() => onOpenPart(diagnosis.part as MachinePart)}
          accessibilityLabel={`Open ${diagnosis.part} in Advance Diagnosis`}
          className="flex-row items-center gap-1.5 rounded-full border px-2.5 py-1"
          style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
        >
          <Text className={text.label} style={{ color: palette.inkMuted }}>
            Why
          </Text>
          <MaterialCommunityIcons name="arrow-right" size={12} color={palette.inkFaint} />
        </PressSurface>
      ) : null}
    </View>
  );
}

/**
 * The work, and the checks that close it out.
 *
 * Ordered on the left because the order is part of the instruction; ticked on
 * the right because a verification is a checklist, not a sequence.
 */
function ActionBlock({
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
  const style = variantStyle(palette, PRIORITY_VARIANT[action.priority] ?? 'warning');

  return (
    <Block
      first
      title="What to do"
      accent={PRIORITY_VARIANT[action.priority] ?? 'warning'}
      meta="The work the model recommends, and the checks that confirm it worked."
      actions={
        <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: style.tint }}>
          <MaterialCommunityIcons name="flag-variant-outline" size={11} color={style.accent} />
          <Text className={text.label} style={{ color: style.accent }}>
            {action.priority} priority
          </Text>
        </View>
      }
      footnote={diagnosis ? <ConclusionNote diagnosis={diagnosis} onOpenPart={onOpenPart} /> : undefined}
    >
      {/* No boxes. Five bordered cards in a column is five objects to parse
          before the first instruction is read, and the border was carrying no
          meaning the ordinal and the indent were not already carrying. A step
          is a number and a sentence; the rail down the left is what makes it a
          sequence. */}
      <View className={wide ? 'flex-row items-start' : undefined} style={{ gap: wide ? 28 : 18 }}>
        <View className="min-w-0 flex-1">
          <Text className={text.label} style={{ color: palette.inkFaint }}>
            Do this
          </Text>
          <View className="mt-2.5" style={{ borderLeftWidth: 1, borderLeftColor: palette.line, gap: 10 }}>
            {action.steps.slice(0, 5).map((step, index) => (
              <View key={index} className="flex-row items-start gap-3 pl-3.5">
                <Text className={text.data} style={[tabular, { color: palette.inkFaint, width: 14 }]}>
                  {index + 1}
                </Text>
                <Text className={cn('min-w-0 flex-1', text.lede)} style={{ color: palette.ink }}>
                  {step}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {action.verification.length > 0 ? (
          <View className="min-w-0 flex-1">
            <Text className={text.label} style={{ color: palette.inkFaint }}>
              Then confirm
            </Text>
            <View className="mt-2.5" style={{ gap: 10 }}>
              {action.verification.slice(0, 5).map((step, index) => (
                <View key={index} className="flex-row items-start gap-3">
                  <MaterialCommunityIcons
                    name="check"
                    size={13}
                    color={palette.accent}
                    style={{ marginTop: 3, width: 14 }}
                  />
                  <Text className={cn('min-w-0 flex-1', text.lede)} style={{ color: palette.inkMuted }}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Block>
  );
}

// ---------------------------------------------------------------------------
// What raised it
// ---------------------------------------------------------------------------

/** The small rule that opens each severity group. */
function GroupHeading({ kind, count }: { kind: AttentionItem['kind']; count: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent = variantStyle(palette, KIND_VARIANT[kind]).accent;

  return (
    <View className="flex-row items-center gap-2 px-4 pb-1 pt-4">
      <View style={{ width: 5, height: 5, borderRadius: 6, backgroundColor: accent }} />
      <Text className={text.label} style={{ color: palette.inkFaint }}>
        {KIND_GROUP[kind]}
      </Text>
      <Text className={text.label} style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
        {count}
      </Text>
    </View>
  );
}

function AttentionRow({ item, onOpenPart }: { item: AttentionItem; onOpenPart: (part: MachinePart) => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, KIND_VARIANT[item.kind]);

  return (
    <PressSurface
      onPress={item.part ? () => onOpenPart(item.part as MachinePart) : undefined}
      accent={style.accent}
      accessibilityLabel={item.part ? `${item.message}. Open ${item.part}.` : item.message}
      className="mx-2 flex-row items-center gap-3 rounded-[10px] px-2 py-2.5"
    >
      <View style={{ width: 7, height: 7, borderRadius: 6, backgroundColor: style.accent }} />
      <View className="min-w-0 flex-1">
        <Text className={text.bodyStrong} style={{ color: palette.ink }} numberOfLines={1}>
          {item.message}
        </Text>
        <Text
          className={cn('mt-0.5', text.label)}
          style={{ color: palette.inkFaint }}
          numberOfLines={1}
        >
          {item.reference}
        </Text>
      </View>
      <View className="rounded-full px-2 py-[3px]" style={{ backgroundColor: style.tint }}>
        <Text className={text.label} style={{ color: style.accent }}>
          {KIND_LABEL[item.kind]}
        </Text>
      </View>
      {item.part ? <MaterialCommunityIcons name="chevron-right" size={15} color={palette.inkFaint} /> : null}
    </PressSurface>
  );
}

export function ConclusionTab({
  attention,
  attentionTotal,
  diagnosis,
  action,
  wide,
  onOpenPart,
}: {
  /** Already filtered by the shell's toolbar. */
  attention: AttentionItem[];
  /** Unfiltered count, so the heading can say "3 of 13". */
  attentionTotal: number;
  diagnosis: CurrentDiagnosis | null;
  /** The work the model recommends, and how to confirm it worked. */
  action: { priority: string; steps: string[]; verification: string[] } | null;
  wide: boolean;
  onOpenPart: (part: MachinePart) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const grouped = GROUP_ORDER.map((kind) => ({ kind, items: attention.filter((item) => item.kind === kind) })).filter(
    (group) => group.items.length > 0,
  );

  return (
    <View>
      {action ? (
        <ActionBlock action={action} diagnosis={diagnosis} wide={wide} onOpenPart={onOpenPart} />
      ) : (
        <Block first title="Nothing to do" accent="success">
          <EmptyState
            icon="shield-check-outline"
            variant="success"
            title="No work is recommended"
            detail="No controlled fault signature is met by the current measurements and no hard limit is breached, so the model has nothing to ask for."
          />
        </Block>
      )}

      <Block
        title="What raised it"
        meta="Faults first, then breached limits, then crossed boundaries. Open a row for the part it belongs to."
        padded={false}
        actions={
          <Text className={text.label} style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
            {attention.length === attentionTotal ? attentionTotal : `${attention.length} of ${attentionTotal}`}
          </Text>
        }
      >
        {grouped.length === 0 ? (
          <View className="px-4 pb-4 pt-1">
            <EmptyState
              icon="check-circle-outline"
              variant="success"
              title="Nothing is raised"
              detail="No fault signature, hard limit or decision boundary is currently active on this machine."
            />
          </View>
        ) : (
          <View className="pb-3">
            {grouped.map((group) => (
              <View key={group.kind}>
                <GroupHeading kind={group.kind} count={group.items.length} />
                {group.items.map((item) => (
                  <AttentionRow key={item.key} item={item} onOpenPart={onOpenPart} />
                ))}
              </View>
            ))}
          </View>
        )}
      </Block>
    </View>
  );
}
