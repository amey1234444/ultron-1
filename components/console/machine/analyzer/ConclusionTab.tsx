/**
 * DIAGNOSIS — the fast overall conclusion.
 *
 * The page a plant operator opens first and often only. What is raised, what
 * has moved, what ULTRON concludes, and what to do about it.
 *
 * Deliberately the simplest screen in the layer. Rule ids and match scores are
 * real and traceable, so every finding carries its id in small mono type — but
 * the line read first is a sentence, never `WP3-FROZEN`. The reasoning behind
 * the conclusion is one tab across, in Advance Diagnosis, beside the part it
 * belongs to.
 *
 * The machine's four headline counts are NOT here. They live in the shell's
 * tile row above the tab bar, because "how is this machine" does not change
 * when the reader moves to another screen.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import type { KeyChange, MachinePart } from '../../../../lib/analysis/extruder';
import { alpha, consolePalette, variantStyle, type Variant } from '../../../ui';
import { Block, EmptyNote, PressSurface } from './AnalyzerParts';

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

const DIRECTION_ICON: Record<KeyChange['direction'], 'arrow-up' | 'arrow-down' | 'minus'> = {
  UP: 'arrow-up',
  DOWN: 'arrow-down',
  FLAT: 'minus',
};

/** The small rule that opens each severity group. */
function GroupHeading({ kind, count }: { kind: AttentionItem['kind']; count: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent = variantStyle(palette, KIND_VARIANT[kind]).accent;

  return (
    <View className="flex-row items-center gap-2 px-4 pb-1 pt-4">
      <View style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: accent }} />
      <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
        {KIND_GROUP[kind]}
      </Text>
      <Text className="font-mono text-[8.5px]" style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
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
      className="mx-2 flex-row items-center gap-3 rounded-xl px-2 py-2.5"
    >
      <View style={{ width: 7, height: 7, borderRadius: 7, backgroundColor: style.accent }} />
      <View className="min-w-0 flex-1">
        <Text className="font-body-bold text-[12.5px]" style={{ color: palette.ink }} numberOfLines={1}>
          {item.message}
        </Text>
        <Text
          className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em]"
          style={{ color: palette.inkFaint }}
          numberOfLines={1}
        >
          {item.reference}
        </Text>
      </View>
      <View className="rounded-full px-2 py-[3px]" style={{ backgroundColor: style.tint }}>
        <Text className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: style.accent }}>
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
  changes,
  diagnosis,
  action,
  wide,
  onOpenPart,
}: {
  /** Already filtered by the shell's toolbar. */
  attention: AttentionItem[];
  /** Unfiltered count, so the heading can say "3 of 13". */
  attentionTotal: number;
  changes: KeyChange[];
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
      {/* The two halves of "what is happening right now": what is raised, and
          what has moved. Ruled apart rather than boxed apart, so the pair reads
          as one region with two columns instead of two cards competing. */}
      <View className={wide ? 'flex-row items-stretch' : undefined}>
        <View className="min-w-0 flex-1 pb-3">
          <View className="px-4 pb-1 pt-3.5">
            <View className="flex-row items-baseline gap-2">
              <Text className="font-body-bold text-[14px] tracking-[-0.015em]" style={{ color: palette.ink }}>
                Needs attention
              </Text>
              <Text className="font-mono text-[9.5px]" style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
                {attention.length === attentionTotal ? attentionTotal : `${attention.length} of ${attentionTotal}`}
              </Text>
            </View>
            <Text className="mt-1 font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
              Faults first, then breached limits, then crossed boundaries.
            </Text>
          </View>

          {grouped.length === 0 ? (
            <EmptyNote>Nothing is currently raised on this machine.</EmptyNote>
          ) : (
            grouped.map((group) => (
              <View key={group.kind}>
                <GroupHeading kind={group.kind} count={group.items.length} />
                {group.items.map((item) => (
                  <AttentionRow key={item.key} item={item} onOpenPart={onOpenPart} />
                ))}
              </View>
            ))
          )}
        </View>

        <View
          style={
            wide
              ? { width: 1, backgroundColor: palette.line }
              : { height: 1, backgroundColor: palette.line }
          }
        />

        <View className="min-w-0 flex-1">
          <View className="px-4 pb-1 pt-3.5">
            <Text className="font-body-bold text-[14px] tracking-[-0.015em]" style={{ color: palette.ink }}>
              Key changes
            </Text>
            <Text className="mt-1 font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
              What has actually moved, this session.
            </Text>
          </View>

          {changes.length === 0 ? (
            <EmptyNote>Not enough history has been collected this session to report a change.</EmptyNote>
          ) : (
            <View className="px-4 pt-2.5" style={{ gap: 8 }}>
              {changes.map((change) => {
                const moving = change.direction !== 'FLAT';
                const accent = moving ? palette.warning : palette.inkMuted;
                return (
                  <View
                    key={change.tag}
                    className="flex-row items-center gap-3 rounded-xl border px-3 py-2.5"
                    style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="font-body-bold text-[12px]" style={{ color: palette.ink }} numberOfLines={1}>
                        {change.label}
                      </Text>
                      <Text
                        className="mt-0.5 font-mono text-[11px]"
                        style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}
                        numberOfLines={1}
                      >
                        {change.from} → {change.to}
                      </Text>
                    </View>
                    <View
                      className="flex-row items-center gap-1 rounded-full px-2 py-[3px]"
                      style={{ backgroundColor: moving ? alpha(accent, 0.12) : palette.panel }}
                    >
                      <MaterialCommunityIcons name={DIRECTION_ICON[change.direction]} size={11} color={accent} />
                      <Text className="font-mono text-[9.5px]" style={{ color: accent, fontVariant: ['tabular-nums'] }}>
                        {change.note}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          <Text className="px-4 pb-3.5 pt-3 font-body text-[10px] leading-[14px]" style={{ color: palette.inkFaint }}>
            Signals without enough history are left out rather than listed as unchanged, which the data could not
            support.
          </Text>
        </View>
      </View>

      <Block
        title="Current diagnosis"
        accent={diagnosis ? 'warning' : 'success'}
        actions={
          diagnosis?.part ? (
            <PressSurface
              onPress={() => onOpenPart(diagnosis.part as MachinePart)}
              accessibilityLabel={`Open ${diagnosis.part} in Advance Diagnosis`}
              className="flex-row items-center gap-1.5 rounded-full border px-2.5 py-1"
              style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
            >
              <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkMuted }}>
                Why
              </Text>
              <MaterialCommunityIcons name="arrow-right" size={12} color={palette.inkFaint} />
            </PressSurface>
          ) : undefined
        }
        footnote="No percentage confidence is reported for this machine: it has no calibrated fault-probability model, so the ranking is an ordinal engineering match rather than a probability."
      >
        {diagnosis === null ? (
          <Text className="font-body text-[12px] leading-[17px]" style={{ color: palette.inkMuted }}>
            No controlled fault signature is met by the current measurements. Nothing on this machine needs a decision
            right now.
          </Text>
        ) : (
          <View className="flex-row flex-wrap" style={{ gap: 24 }}>
            <View style={{ minWidth: 210, flexGrow: 1, flexBasis: 0 }}>
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
                Likely cause
              </Text>
              <Text className="mt-1.5 font-body-bold text-[15px] tracking-[-0.015em]" style={{ color: palette.ink }}>
                {diagnosis.likelyCause}
              </Text>
            </View>
            <View style={{ minWidth: 140, flexGrow: 1, flexBasis: 0 }}>
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
                Affected part
              </Text>
              <Text className="mt-1.5 font-body-bold text-[15px] tracking-[-0.015em]" style={{ color: palette.ink }}>
                {diagnosis.affectedPart}
              </Text>
            </View>
            <View style={{ minWidth: 160, flexGrow: 1, flexBasis: 0 }}>
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
                How it ranked
              </Text>
              <Text className="mt-1.5 font-body-bold text-[15px] tracking-[-0.015em]" style={{ color: palette.ink }}>
                {diagnosis.ranking}
              </Text>
              {diagnosis.alternatives > 0 ? (
                <Text className="mt-1 font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
                  {diagnosis.alternatives} other hypothes{diagnosis.alternatives === 1 ? 'is' : 'es'} the installed
                  sensors cannot separate from it.
                </Text>
              ) : null}
            </View>
            <View style={{ minWidth: 230, flexGrow: 1, flexBasis: 0 }}>
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
                What ULTRON cannot confirm
              </Text>
              <Text className="mt-1.5 font-body text-[12.5px] leading-[17px]" style={{ color: palette.ink }}>
                {diagnosis.cannotConfirm[0] ?? 'Nothing further is outstanding on this conclusion.'}
              </Text>
            </View>
          </View>
        )}
      </Block>

      {action ? (
        <Block
          title="What to do"
          accent={PRIORITY_VARIANT[action.priority] ?? 'warning'}
          meta="The work the model recommends, and the checks that confirm it worked."
          actions={
            <View
              className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{ backgroundColor: variantStyle(palette, PRIORITY_VARIANT[action.priority] ?? 'warning').tint }}
            >
              <MaterialCommunityIcons
                name="flag-variant-outline"
                size={11}
                color={variantStyle(palette, PRIORITY_VARIANT[action.priority] ?? 'warning').accent}
              />
              <Text
                className="font-mono text-[9px] uppercase tracking-[0.14em]"
                style={{ color: variantStyle(palette, PRIORITY_VARIANT[action.priority] ?? 'warning').accent }}
              >
                {action.priority} priority
              </Text>
            </View>
          }
        >
          <View className={wide ? 'flex-row items-start' : undefined} style={{ gap: wide ? 20 : 14 }}>
            {/* Do this — ordered, because the order is part of the instruction. */}
            <View className="min-w-0 flex-1" style={{ gap: 8 }}>
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
                Do this
              </Text>
              {action.steps.slice(0, 5).map((step, index) => (
                <View
                  key={index}
                  className="flex-row items-start gap-2.5 rounded-xl border px-3 py-2.5"
                  style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
                >
                  <View
                    className="h-5 w-5 items-center justify-center rounded-full"
                    style={{ backgroundColor: palette.ink }}
                  >
                    <Text
                      className="font-mono text-[9px]"
                      style={{ color: palette.panel, fontVariant: ['tabular-nums'] }}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <Text className="min-w-0 flex-1 font-body text-[12px] leading-[17px]" style={{ color: palette.ink }}>
                    {step}
                  </Text>
                </View>
              ))}
            </View>

            {/* Then confirm — unordered checks, so they take ticks, not numbers. */}
            {action.verification.length > 0 ? (
              <View className="min-w-0 flex-1" style={{ gap: 8 }}>
                <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
                  Then confirm
                </Text>
                {action.verification.slice(0, 5).map((step, index) => (
                  <View key={index} className="flex-row items-start gap-2.5 px-1 py-1">
                    <MaterialCommunityIcons
                      name="check-circle-outline"
                      size={15}
                      color={palette.accent}
                      style={{ marginTop: 1 }}
                    />
                    <Text
                      className="min-w-0 flex-1 font-body text-[12px] leading-[17px]"
                      style={{ color: palette.inkMuted }}
                    >
                      {step}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </Block>
      ) : null}
    </View>
  );
}
