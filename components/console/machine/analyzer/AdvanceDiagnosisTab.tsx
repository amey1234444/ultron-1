/**
 * ADVANCE DIAGNOSIS — the machine-part deep dive.
 *
 * Diagnosis answers *what is wrong*. This screen answers *why, and where*, and
 * it is organised by the physical machine rather than by the model's tags: an
 * operator walks to the gearbox, not to `V2`.
 *
 * Two things used to be pages of their own and are now contextual here, which
 * is the whole point of the redesign:
 *
 *  - **Evidence.** The reasoning behind a conclusion belongs beside the
 *    conclusion, not in a separate tab a user has to know to open.
 *  - **Signal analysis.** Trend, waveform, spectrum, envelope and the
 *    engineering features appear inside the part that owns the signal, and the
 *    tools offered depend on what kind of measurement it is. A temperature
 *    channel is structurally unable to show an FFT, so it is offered thermal
 *    tools instead of vibration tools greyed out.
 *
 * This component performs no analysis. Every state, cause, reasoning step and
 * behaviour string is computed in `lib/analysis/extruder/partView.ts` and
 * rendered here verbatim.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import {
  BEHAVIOUR_LABEL,
  KIND_LABEL,
  matchClassLabel,
  PART_FLOW,
  PART_ORDER,
  PART_STATE_LABEL,
  TOOLS_FOR_KIND,
  type AnalysisTool,
  type MachinePart,
  type PartState,
  type PartView,
  type SignalView,
} from '../../../../lib/analysis/extruder';
import { cn } from '../../../../lib/cn';
import { alpha, Badge, consolePalette, variantStyle, type Variant } from '../../../ui';
import { Block, EmptyState, Fact, HoverLift, PressSurface, RangeRail, TrendChart } from './AnalyzerParts';


/**
 * A glyph per part.
 *
 * The part list was seven identical text chips; on a screen an operator scans
 * for "the gearbox", a shape is found faster than a word, and the icon is what
 * makes the row navigable at a glance rather than readable at a stop.
 */
const PART_ICON: Record<MachinePart, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Motor: 'engine-outline',
  Gearbox: 'cog-outline',
  'Screw / Drive': 'rotate-right',
  Hopper: 'silo-outline',
  Barrel: 'thermometer',
  'Melt / Process': 'water-outline',
  'Electrical / Power': 'flash-outline',
};

const STATE_VARIANT: Record<PartState, Variant> = {
  NORMAL: 'success',
  WATCH: 'warning',
  ATTENTION: 'warning',
  ALARM: 'destructive',
  FAULT: 'destructive',
  UNAVAILABLE: 'muted',
};

function formatValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const decimals = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

// ---------------------------------------------------------------------------
// Part navigation
// ---------------------------------------------------------------------------

/** A dot in the part's own state colour, so the chip row is scannable at a glance. */
function StateDot({ state, size = 6 }: { state: PartState; size?: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent = variantStyle(palette, STATE_VARIANT[state]).accent;
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: accent }} />;
}

function PartChips({
  parts,
  selected,
  onSelect,
}: {
  parts: PartView[];
  selected: MachinePart | null;
  onSelect: (part: MachinePart | null) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const byPart = new Map(parts.map((view) => [view.part, view]));

  const chip = (
    key: string,
    label: string,
    active: boolean,
    state: PartState | null,
    icon: keyof typeof MaterialCommunityIcons.glyphMap,
    onPress: () => void,
  ) => {
    const accent = state ? variantStyle(palette, STATE_VARIANT[state]).accent : palette.inkMuted;
    return (
      <PressSurface
        key={key}
        onPress={onPress}
        selected={active}
        accessibilityRole="tab"
        accessibilityLabel={state ? `${label}, ${PART_STATE_LABEL[state]}` : label}
        accent={palette.lineStrong}
        className="flex-row items-center gap-1.5 rounded-xl border px-2.5 py-1.5"
        style={{
          borderColor: active ? palette.lineStrong : palette.line,
          backgroundColor: active ? palette.panelRaised : palette.panel,
        }}
      >
        <MaterialCommunityIcons name={icon} size={13} color={active ? palette.ink : accent} />
        <Text
          className="font-mono text-[9.5px] uppercase tracking-[0.12em]"
          style={{ color: active ? palette.ink : palette.inkMuted }}
        >
          {label}
        </Text>
        {state ? <StateDot state={state} size={5} /> : null}
      </PressSurface>
    );
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
      {chip('all', 'All parts', selected === null, null, 'view-grid-outline', () => onSelect(null))}
      {PART_ORDER.map((part) =>
        chip(part, part, selected === part, byPart.get(part)?.state ?? 'UNAVAILABLE', PART_ICON[part], () =>
          onSelect(part),
        ),
      )}
    </ScrollView>
  );
}

/**
 * The material path, drawn as the machine rather than as a list.
 *
 * Hopper → Motor → Gearbox → Screw / Drive → Barrel → Melt / Process is the
 * order material actually travels, so a fault upstream of another one reads as
 * upstream. Electrical / Power is not in the path — it supplies the machine —
 * and is shown beside the strip instead of being forced into it.
 */
function ConditionStrip({ parts, onSelect }: { parts: PartView[]; onSelect: (part: MachinePart) => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const byPart = new Map(parts.map((view) => [view.part, view]));
  const supply = byPart.get('Electrical / Power');

  return (
    <View className="gap-2.5">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 0 }}>
        {PART_FLOW.map((part, index) => {
          const view = byPart.get(part);
          const state = view?.state ?? 'UNAVAILABLE';
          const style = variantStyle(palette, STATE_VARIANT[state]);
          return (
            <View key={part} className="flex-row items-center">
              {index > 0 ? (
                <MaterialCommunityIcons name="arrow-right" size={13} color={palette.inkFaint} style={{ marginHorizontal: 5 }} />
              ) : null}
              <PressSurface
                onPress={() => onSelect(part)}
                accent={style.accent}
                accessibilityLabel={`Open ${part}, ${PART_STATE_LABEL[state]}`}
                className="min-w-[124px] rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: state === 'NORMAL' ? palette.line : alpha(style.accent, 0.4),
                  backgroundColor: palette.panel,
                }}
              >
                <View
                  className="h-7 w-7 items-center justify-center rounded-lg"
                  style={{ backgroundColor: state === 'NORMAL' ? palette.panelRaised : alpha(style.accent, 0.12) }}
                >
                  <MaterialCommunityIcons name={PART_ICON[part]} size={15} color={style.accent} />
                </View>
                <Text className="mt-2 font-body-bold text-[11.5px]" style={{ color: palette.ink }} numberOfLines={1}>
                  {part}
                </Text>
                <View className="mt-0.5 flex-row items-center gap-1.5">
                  <StateDot state={state} size={5} />
                  <Text className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: style.accent }}>
                    {PART_STATE_LABEL[state]}
                  </Text>
                </View>
              </PressSurface>
            </View>
          );
        })}
      </ScrollView>

      {supply ? (
        <PressSurface
          onPress={() => onSelect('Electrical / Power')}
          accessibilityLabel="Open Electrical / Power"
          className="flex-row items-center gap-2 self-start rounded-xl border px-2.5 py-1.5"
          style={{ borderColor: palette.line, backgroundColor: palette.panel }}
        >
          <MaterialCommunityIcons name="flash-outline" size={13} color={palette.inkFaint} />
          <Text className="font-body text-[11px]" style={{ color: palette.ink }}>
            Electrical / Power
          </Text>
          <StateDot state={supply.state} size={5} />
          <Text className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: palette.inkMuted }}>
            {PART_STATE_LABEL[supply.state]} · supplies the machine
          </Text>
        </PressSurface>
      ) : null}
    </View>
  );
}

/**
 * One part that is not normal, as a card on the entry screen.
 *
 * Only the parts that need a decision get a card. The strip above already
 * states every part's condition, so giving all seven a card printed the same
 * seven states twice on one screen; the cards now carry the thing the strip
 * cannot - what is actually wrong, in a sentence.
 */
function PartCard({ view, onOpen }: { view: PartView; onOpen: () => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, STATE_VARIANT[view.state]);

  return (
    <PressSurface
      onPress={onOpen}
      accent={style.accent}
      accessibilityLabel={`Open ${view.part} deep dive`}
      className="min-w-[260px] flex-1 rounded-2xl border px-3.5 py-3"
      style={{ borderColor: alpha(style.accent, 0.4), backgroundColor: palette.panel }}
    >
      <View className="flex-row items-start gap-2.5">
        <View
          className="h-8 w-8 items-center justify-center rounded-xl"
          style={{ backgroundColor: alpha(style.accent, 0.12) }}
        >
          <MaterialCommunityIcons name={PART_ICON[view.part]} size={16} color={style.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="min-w-0 flex-1 font-body-bold text-[13px]" style={{ color: palette.ink }} numberOfLines={1}>
              {view.part}
            </Text>
            <Badge variant={STATE_VARIANT[view.state]} icon={null} outline>
              {PART_STATE_LABEL[view.state]}
            </Badge>
          </View>
          <Text
            className="mt-1 font-body text-[11.5px] leading-[16px]"
            style={{ color: palette.inkMuted }}
            numberOfLines={2}
          >
            {view.headline ?? 'No local fault pattern detected.'}
          </Text>
        </View>
      </View>
    </PressSurface>
  );
}

/**
 * A group of parts that need no card, collapsed onto one line.
 *
 * Parts with nothing to report and parts with nothing measuring them both take
 * one line each instead of a card each. Seven cards on a healthy machine was
 * seven restatements of the strip directly above them.
 */
function PartGroupLine({
  parts,
  title,
  badge,
  variant,
}: {
  parts: PartView[];
  title: string;
  badge: string;
  variant: Variant;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  if (parts.length === 0) return null;

  return (
    <View
      className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5"
      style={{ borderColor: palette.line, backgroundColor: palette.panel }}
    >
      <Badge variant={variant} icon={null} outline>
        {badge}
      </Badge>
      <Text className="font-body-bold text-[12px]" style={{ color: palette.ink }}>
        {parts.length} {title}
      </Text>
      <Text className="min-w-0 flex-1 font-body text-[11.5px]" style={{ color: palette.inkMuted }} numberOfLines={1}>
        {parts.map((view) => view.part).join(', ')}
      </Text>
    </View>
  );
}


// ---------------------------------------------------------------------------
// Deep dive
// ---------------------------------------------------------------------------

/**
 * The five stages, drawn as the chain they are.
 *
 * It was a horizontally scrolling row, which clipped the conclusion — the one
 * stage a reader most wants — off the right edge on any window narrower than
 * the whole chain. The stages now wrap: each is a numbered node on a rail, and
 * a stage the measurements could not support is drawn hollow rather than faded,
 * so "not evaluated" is a state you can see rather than a low-contrast guess.
 */
function ReasoningChain({ view }: { view: PartView }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const last = view.reasoning.length - 1;

  return (
    <View className="flex-row flex-wrap" style={{ gap: 10 }}>
      {view.reasoning.map((step, index) => {
        const conclusion = index === last;
        const accent = conclusion && step.evaluated ? palette.accent : palette.inkMuted;
        return (
          <View
            key={step.key}
            className="rounded-xl border px-3 py-2.5"
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 200,
              minWidth: 180,
              borderColor: conclusion ? alpha(accent, 0.35) : palette.line,
              backgroundColor: conclusion ? alpha(accent, 0.06) : palette.panelRaised,
            }}
          >
            <View className="flex-row items-center gap-2">
              {/* Filled node = the stage ran. Hollow = it could not be evaluated. */}
              <View
                className="h-4 w-4 items-center justify-center rounded-full"
                style={
                  step.evaluated
                    ? { backgroundColor: accent }
                    : { borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: 'transparent' }
                }
              >
                <Text
                  className="font-mono text-[8px]"
                  style={{ color: step.evaluated ? palette.panel : palette.inkFaint, fontVariant: ['tabular-nums'] }}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                className="min-w-0 flex-1 font-mono text-[8.5px] uppercase tracking-[0.16em]"
                style={{ color: palette.inkFaint }}
                numberOfLines={1}
              >
                {step.label}
              </Text>
              {index < last ? (
                <MaterialCommunityIcons name="arrow-right" size={12} color={palette.inkFaint} />
              ) : null}
            </View>

            <Text
              className="mt-1.5 font-body-bold text-[12.5px] tracking-[-0.01em]"
              style={{ color: step.evaluated ? palette.ink : palette.inkMuted }}
              numberOfLines={2}
            >
              {step.value}
            </Text>
            <Text className="mt-1 font-body text-[10.5px] leading-[14px]" style={{ color: palette.inkMuted }}>
              {step.detail}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * A signal's severity against its own configured limits.
 *
 * Deliberately not its data quality: a reading can sit comfortably inside every
 * limit and still be untrustworthy, and one colour cannot say both.
 */
const SIGNAL_VARIANT: Record<string, Variant> = {
  NORMAL: 'success',
  WARNING: 'warning',
  ALARM: 'destructive',
  UNAVAILABLE: 'muted',
};

/** A signed change, with the sign kept even when it is positive. */
function formatDelta(value: number, unit: string): string {
  const decimals = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

/**
 * The ranked hypotheses for this part.
 *
 * The score is an ORDINAL ENGINEERING MATCH SCORE and is never rendered as a
 * percentage: this machine has no calibrated fault-probability model, so a
 * number with a % sign beside it would be a fabricated confidence. The match
 * class carries the meaning; the score only orders the list.
 *
 * Each hypothesis is a card rather than a row on a rule. A cause is not one
 * fact — it is a name, a strength, the observations that support it and, often,
 * an observation that argues against it — and four stacked facts separated only
 * by a hairline from the next four read as one long list rather than as three
 * competing explanations. The rank numeral is what makes the ordering explicit:
 * a bar alone says "this one is longer", not "this one is first".
 */
function CauseList({ view }: { view: PartView }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const measured = view.signals.filter((signal) => signal.value !== null).length;

  if (view.causes.length === 0 && view.ruledOut.length === 0) {
    return (
      <EmptyState
        icon="shield-check-outline"
        variant={view.state === 'NORMAL' ? 'success' : 'muted'}
        title="No fault signature matched"
        detail="Every controlled fault pattern this model holds for this part was tested against the current measurements, and none of them is met. That is a result, not an absence of one."
        meta={`${measured} measurement${measured === 1 ? '' : 's'} evaluated`}
      />
    );
  }

  const top = Math.max(1, ...view.causes.map((cause) => cause.score));

  return (
    <View style={{ gap: 8 }}>
      {view.causes.length === 0 ? (
        <EmptyState
          icon="filter-remove-outline"
          title="Every candidate was eliminated"
          detail="Fault patterns for this part were tested and each one is contradicted by a measurement. What was ruled out, and why, is listed below."
          meta={`${view.ruledOut.length} hypothes${view.ruledOut.length === 1 ? 'is' : 'es'} eliminated`}
        />
      ) : null}

      {view.causes.map((cause, index) => {
        const variant: Variant =
          cause.matchClass === 'STRONG_CANDIDATE' ? 'destructive' : cause.matchClass === 'CANDIDATE' ? 'warning' : 'muted';
        const accent = variantStyle(palette, variant).accent;
        const share = Math.round((cause.score / top) * 100);

        return (
          <HoverLift key={cause.faultId} accent={alpha(accent, 0.55)} radius={14} rise={2}>
            <View
              className="rounded-[14px] border px-3.5 py-3"
              style={{
                borderColor: index === 0 ? alpha(accent, 0.34) : palette.line,
                backgroundColor: index === 0 ? alpha(accent, 0.05) : palette.panel,
              }}
            >
              <View className="flex-row items-start gap-2.5">
                {/* The rank. An ordinal, because the list is ordered and the
                    bar below only says "longer than the next one". */}
                <View
                  className="h-[22px] w-[22px] items-center justify-center rounded-lg"
                  style={{ backgroundColor: alpha(accent, 0.14) }}
                >
                  <Text className="font-mono text-[10px]" style={{ color: accent, fontVariant: ['tabular-nums'] }}>
                    {index + 1}
                  </Text>
                </View>

                <View className="min-w-0 flex-1">
                  <View className="flex-row items-start justify-between gap-2.5">
                    <Text className="min-w-0 flex-1 font-body-bold text-[12.5px]" style={{ color: palette.ink }}>
                      {cause.name}
                    </Text>
                    <Badge variant={variant} icon={null} outline>
                      {matchClassLabel(cause.matchClass)}
                    </Badge>
                  </View>
                  <Text className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                    {cause.faultId}
                  </Text>
                </View>
              </View>

              {/* Rank bar, not a confidence bar. Width is share-of-top-score,
                  and it is labelled as such so it cannot be read as a percent
                  likelihood — which is the one thing this machine cannot say. */}
              <View className="mt-2.5 flex-row items-center gap-2">
                <View className="h-[4px] flex-1 overflow-hidden rounded-full" style={{ backgroundColor: palette.panelRaised }}>
                  <View style={{ width: `${share}%`, height: '100%', borderRadius: 4, backgroundColor: accent }} />
                </View>
                <Text className="font-mono text-[8px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                  {index === 0 ? 'best match' : `${share}% of best`}
                </Text>
              </View>

              {cause.primaryEvidence.length > 0 ? (
                <View className="mt-2.5 gap-1.5">
                  {cause.primaryEvidence.slice(0, 3).map((line, evidenceIndex) => (
                    <View key={evidenceIndex} className="flex-row items-start gap-2">
                      <MaterialCommunityIcons name="check" size={11} color={accent} style={{ marginTop: 2.5 }} />
                      <Text className="min-w-0 flex-1 font-body text-[11px] leading-[15.5px]" style={{ color: palette.inkMuted }}>
                        {line}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* A contradiction is not a footnote on the evidence — it is the
                  reason this candidate might be the wrong one, so it gets its
                  own tinted strip instead of a coloured sentence in the flow. */}
              {cause.contradicting.length > 0 ? (
                <View
                  className="mt-2.5 flex-row items-start gap-2 rounded-lg px-2.5 py-2"
                  style={{ backgroundColor: alpha(palette.warning, 0.1) }}
                >
                  <MaterialCommunityIcons name="alert-outline" size={12} color={palette.warning} style={{ marginTop: 1.5 }} />
                  <View className="min-w-0 flex-1">
                    <Text className="font-mono text-[8px] uppercase tracking-[0.15em]" style={{ color: palette.warning }}>
                      Argues against
                    </Text>
                    <Text className="mt-0.5 font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
                      {cause.contradicting[0]}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </HoverLift>
        );
      })}

      {/* Ruled out lives here rather than in a section of its own: it is the
          tail of the same ranked list, and "considered and eliminated" is only
          meaningful next to what was not. */}
      {view.ruledOut.length > 0 ? (
        <View className="mt-1 pt-3" style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
          <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
            Ruled out · {view.ruledOut.length}
          </Text>
          <View className="mt-1.5 gap-1.5">
            {view.ruledOut.map((cause) => (
              <View key={cause.faultId} className="flex-row items-start gap-2">
                <MaterialCommunityIcons name="close-circle-outline" size={12} color={palette.inkFaint} style={{ marginTop: 2 }} />
                <Text className="min-w-0 flex-1 font-body text-[11px] leading-[15.5px]" style={{ color: palette.inkMuted }}>
                  <Text style={{ color: palette.ink }}>{cause.name}</Text>
                  {' — '}
                  {cause.contradicting[0] ?? 'a primary contradiction eliminated this hypothesis.'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contextual signal analysis
// ---------------------------------------------------------------------------

/**
 * The reading itself, before any tool is applied to it.
 *
 * This used to be a row of five equal-weight `Fact` cells, which made the
 * current value — the one number the reader opened the panel for — exactly as
 * loud as the string "degraded". A measurement has a subject, a value and a set
 * of qualifiers, and they are not the same size: the value is set at display
 * scale, its status sits beside it as a pill, and reference, quality and point
 * drop to the caption rail underneath where qualifiers belong.
 */
function ReadingHero({ signal }: { signal: SignalView }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const variant = SIGNAL_VARIANT[signal.status] ?? 'muted';
  const style = variantStyle(palette, variant);
  const rising = signal.behaviour === 'INCREASING';
  const falling = signal.behaviour === 'DECREASING';

  return (
    <View
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: palette.line, backgroundColor: palette.panel }}
    >
      <View className="px-3.5 pb-3 pt-3">
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
          <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: style.accent }} />
          <Text className="min-w-0 font-body-bold text-[12px]" style={{ color: palette.ink }} numberOfLines={1}>
            {signal.measures}
          </Text>
          <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
            {signal.tag} · {KIND_LABEL[signal.kind]}
          </Text>
        </View>

        <View className="mt-1.5 flex-row flex-wrap items-end gap-x-3 gap-y-1.5">
          <Text
            className="font-body text-[30px] leading-[34px] tracking-[-0.03em]"
            style={{ color: palette.ink, fontWeight: '300', fontVariant: ['tabular-nums'] }}
          >
            {signal.value === null ? '—' : formatValue(signal.value, '')}
          </Text>
          <Text className="pb-[5px] font-mono text-[10.5px] uppercase tracking-[0.12em]" style={{ color: palette.inkMuted }}>
            {signal.unit || 'unitless'}
          </Text>

          <View className="flex-1 flex-row flex-wrap items-center justify-end gap-1.5">
            <View
              className="flex-row items-center gap-1.5 rounded-full border px-2 py-[3px]"
              style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
            >
              <MaterialCommunityIcons
                name={rising ? 'trending-up' : falling ? 'trending-down' : 'trending-neutral'}
                size={12}
                color={palette.inkMuted}
              />
              <Text className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: palette.inkMuted }}>
                {BEHAVIOUR_LABEL[signal.behaviour]}
              </Text>
            </View>
            <Badge variant={variant} icon={null} outline>
              {signal.status === 'UNAVAILABLE' ? 'No data' : signal.status.toLowerCase()}
            </Badge>
          </View>
        </View>
      </View>

      {/* The qualifiers. Below the rule because they qualify the number above
          it — reading them first tells you nothing. */}
      <View
        className="flex-row flex-wrap gap-x-5 gap-y-2 px-3.5 py-2.5"
        style={{ borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.panelRaised }}
      >
        <Fact label="Reference" value={formatValue(signal.reference, signal.unit)} width={108} />
        <Fact label="Warning at" value={formatValue(signal.warningLimit, signal.unit)} width={104} />
        <Fact label="Alarm at" value={formatValue(signal.criticalLimit, signal.unit)} width={104} />
        <Fact label="Data quality" value={signal.quality.toLowerCase()} mono={false} width={102} />
        <Fact label="Point" value={signal.point} mono={false} width={150} />
      </View>
    </View>
  );
}

/**
 * A tool's own read-out.
 *
 * Every tool that can be computed from scalar telemetry computes from the
 * session history the pipeline already keeps. Every tool that cannot says
 * exactly what it would need — that sentence is the useful output, because an
 * operator who does not know a spectrum is unavailable may read its absence as
 * "no bearing fault".
 *
 * The chart is the panel's subject, so it is framed as an instrument window: a
 * headline stating the change the tool found, the plot itself against a ruled
 * matrix, and a footer rail placing the current reading inside the range the
 * session has seen. The numbers underneath are only what the *tool* adds on top
 * of that — min, max and mean are read off the rail rather than restated.
 */
function ToolPanel({ signal, tool }: { signal: SignalView; tool: AnalysisTool }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const stats = useMemo(() => {
    const usable = signal.history.filter((value): value is number => value !== null && Number.isFinite(value));
    if (usable.length === 0) return null;
    const min = Math.min(...usable);
    const max = Math.max(...usable);
    const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
    const spread = max - min;
    const variance = usable.length > 1 ? usable.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (usable.length - 1) : 0;
    const delta = usable.length > 1 ? usable[usable.length - 1] - usable[0] : null;
    return { min, max, mean, spread, sd: Math.sqrt(variance), count: usable.length, delta };
  }, [signal.history]);

  if (!tool.available) {
    return (
      <View className="gap-1.5 rounded-lg border px-3 py-3" style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}>
        <View className="flex-row items-center gap-1.5">
          <MaterialCommunityIcons name="lock-outline" size={13} color={palette.inkFaint} />
          <Text className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkMuted }}>
            {tool.label} not available on this machine
          </Text>
        </View>
        <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
          {tool.note}
        </Text>
      </View>
    );
  }

  const accent = signal.status === 'ALARM' ? palette.critical : signal.status === 'WARNING' ? palette.warning : palette.accent;
  const deltaColour =
    stats?.delta === null || stats?.delta === undefined || Math.abs(stats.delta) < 1e-9
      ? palette.inkMuted
      : signal.status === 'NORMAL'
        ? palette.inkMuted
        : accent;

  return (
    <View className="gap-2.5">
      <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
        {tool.note}
      </Text>

      {/* The instrument window. */}
      <View
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: palette.line, backgroundColor: palette.panel }}
      >
        <View
          className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3.5 py-2.5"
          style={{ borderBottomWidth: 1, borderBottomColor: palette.line }}
        >
          <View className="flex-row items-center gap-2">
            <View style={{ width: 14, height: 2, borderRadius: 2, backgroundColor: accent }} />
            <Text className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: palette.inkMuted }}>
              {tool.label} · session history
            </Text>
          </View>

          {stats && stats.delta !== null ? (
            <View
              className="flex-row items-center gap-1.5 rounded-full border px-2 py-[3px]"
              style={{ borderColor: alpha(deltaColour, 0.3), backgroundColor: palette.panelRaised }}
            >
              <MaterialCommunityIcons
                name={stats.delta > 0 ? 'arrow-top-right' : stats.delta < 0 ? 'arrow-bottom-right' : 'arrow-right'}
                size={11}
                color={deltaColour}
              />
              <Text
                className="font-mono text-[9.5px]"
                style={{ color: deltaColour, fontVariant: ['tabular-nums'] }}
              >
                {formatDelta(stats.delta, signal.unit)}
              </Text>
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: palette.inkFaint }}>
                over {stats.count}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="px-3 pb-1 pt-2">
          <TrendChart
            values={signal.history}
            colour={accent}
            unit={signal.unit}
            reference={signal.reference}
            warningLimit={signal.warningLimit}
            criticalLimit={signal.criticalLimit}
            footLeft={stats ? `${stats.count} samples` : 'oldest'}
            footRight="latest"
          />
        </View>

        {/* Where the current reading sits inside everything this session has
            seen. The chart says how it got here; the rail says whether here is
            high, and that is a different question. */}
        {stats && stats.spread > 0 ? (
          <View className="px-3.5 pb-3 pt-1.5" style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
            <RangeRail min={stats.min} max={stats.max} mean={stats.mean} value={signal.value} colour={accent} />
            <View className="mt-1 flex-row items-center justify-between">
              <Text className="font-mono text-[8.5px]" style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
                {formatValue(stats.min, signal.unit)}
              </Text>
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                mean {formatValue(stats.mean, signal.unit)}
              </Text>
              <Text className="font-mono text-[8.5px]" style={{ color: palette.inkFaint, fontVariant: ['tabular-nums'] }}>
                {formatValue(stats.max, signal.unit)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {stats ? (
        <View className="flex-row flex-wrap gap-x-5 gap-y-2">
          {/* The current value is stated once, in the reading above this panel,
              and min/max/mean are read off the rail. Every tool adds only what
              IT computes on top of those. */}
          {tool.key === 'trend' || tool.key === 'level' || tool.key === 'load' ? (
            <>
              <Fact label="Std dev" value={formatValue(stats.sd, signal.unit)} width={104} />
              <Fact label="Direction" value={BEHAVIOUR_LABEL[signal.behaviour]} mono={false} width={116} />
              <Fact label="Samples" value={String(stats.count)} width={84} />
            </>
          ) : null}
          {tool.key === 'rate' ? (
            <>
              <Fact label="Change" value={formatValue(stats.max - stats.min, signal.unit)} width={110} />
              <Fact label="Direction" value={BEHAVIOUR_LABEL[signal.behaviour]} mono={false} width={116} />
              <Fact label="Samples" value={String(stats.count)} width={84} />
            </>
          ) : null}
          {tool.key === 'stability' || tool.key === 'variation' || tool.key === 'consumption' ? (
            <>
              <Fact label="Spread" value={formatValue(stats.spread, signal.unit)} width={104} />
              <Fact label="Std dev" value={formatValue(stats.sd, signal.unit)} width={104} />
              <Fact label="Samples" value={String(stats.count)} width={84} />
            </>
          ) : null}
          {tool.key === 'setpoint' ? (
            <>
              <Fact label="Setpoint" value={formatValue(signal.reference, signal.unit)} width={110} />
              <Fact
                label="Deviation"
                value={
                  signal.value !== null && signal.reference !== null
                    ? formatValue(signal.value - signal.reference, signal.unit)
                    : '—'
                }
                width={110}
                tone={accent}
              />
              <Fact label="Samples" value={String(stats.count)} width={84} />
            </>
          ) : null}
        </View>
      ) : (
        <EmptyState
          icon="chart-line-variant"
          title="No sample recorded yet"
          detail="This signal has produced no reading in the session held for this machine, so there is nothing for this tool to compute from."
        />
      )}

      {tool.key === 'setpoint' && signal.reference === null ? (
        <Text className="font-body text-[10.5px] leading-[14px]" style={{ color: palette.inkFaint }}>
          {signal.referenceNote}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Signal detail for the selected part.
 *
 * This is where Signal Analysis lives now. The signal selector lists only the
 * part's own signals plus the ones that inform it, and the tool row is built
 * from the signal's measurement kind, so what is offered is always what this
 * measurement can actually support.
 *
 * The three things stack in the order a reader needs them: which signal, what
 * it currently reads, and only then which tool to point at it. Choosing a tool
 * before knowing the reading is choosing an answer before hearing the question.
 */
function SignalDetail({ signals, part }: { signals: SignalView[]; part: MachinePart }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [toolKey, setToolKey] = useState<string | null>(null);

  const signal = signals.find((entry) => entry.tag === selectedTag) ?? signals[0] ?? null;
  const tools = signal ? TOOLS_FOR_KIND[signal.kind] : [];
  const tool = tools.find((entry) => entry.key === toolKey) ?? tools[0] ?? null;

  if (!signal) {
    return (
      <EmptyState
        icon="access-point-off"
        title="Nothing measures this part"
        detail="No signal on this machine is mapped to this part, so there is no measurement to analyse here. Link a point to it in Design mode to give the model something to read."
      />
    );
  }

  return (
    <View className="gap-3">
      {/* Which signal. Each carries its own state dot, so the choice is made
          on condition rather than on name alone. */}
      {signals.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
          {signals.map((entry) => {
            const active = entry.tag === signal.tag;
            const entryStyle = variantStyle(palette, SIGNAL_VARIANT[entry.status] ?? 'muted');
            return (
              <PressSurface
                key={entry.tag}
                onPress={() => {
                  setSelectedTag(entry.tag);
                  setToolKey(null);
                }}
                selected={active}
                accessibilityRole="tab"
                accessibilityLabel={entry.measures}
                className="rounded-xl border px-2.5 py-1.5"
                style={{
                  borderColor: active ? palette.lineStrong : palette.line,
                  backgroundColor: active ? palette.panelRaised : palette.panel,
                }}
              >
                <View className="flex-row items-center gap-1.5">
                  <View style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: entryStyle.accent }} />
                  <Text className="font-body text-[11px]" style={{ color: active ? palette.ink : palette.inkMuted }}>
                    {entry.measures}
                  </Text>
                </View>
                <Text className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                  {entry.tag} · {entry.part === part ? KIND_LABEL[entry.kind] : `context · ${entry.part}`}
                </Text>
              </PressSurface>
            );
          })}
        </ScrollView>
      ) : null}

      <ReadingHero signal={signal} />

      {/* Which tool — built from the measurement kind, not from a fixed list */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
        {tools.map((entry) => {
          const active = entry.key === tool?.key;
          return (
            <PressSurface
              key={entry.key}
              onPress={() => setToolKey(entry.key)}
              selected={active}
              accessibilityRole="tab"
              accessibilityLabel={entry.available ? entry.label : `${entry.label}, not available on this machine`}
              className="flex-row items-center gap-1.5 rounded-xl border px-2.5 py-1.5"
              style={{
                borderColor: active ? palette.lineStrong : palette.line,
                backgroundColor: active ? palette.panelRaised : palette.panel,
                opacity: entry.available ? 1 : 0.55,
              }}
            >
              <Text
                className="font-mono text-[9.5px] uppercase tracking-[0.12em]"
                style={{ color: active ? palette.ink : palette.inkMuted }}
              >
                {entry.label}
              </Text>
              {!entry.available ? <MaterialCommunityIcons name="lock-outline" size={11} color={palette.inkFaint} /> : null}
            </PressSurface>
          );
        })}
      </ScrollView>

      {tool ? <ToolPanel signal={signal} tool={tool} /> : null}

      <Text className="font-body text-[10.5px] leading-[14px]" style={{ color: palette.inkFaint }}>
        {signal.behaviourDetail}
      </Text>
    </View>
  );
}

/**
 * The barrel's thermal profile.
 *
 * The barrel is the one part whose signals are only meaningful as a *set*: three
 * zone temperatures are a profile, and a profile that stops rising is a
 * different fault from any single zone being high. So the barrel deep-dive
 * leads with the profile and the per-zone behaviour before it offers the
 * per-signal tools.
 */
const PROFILE_HEIGHT = 68;

function ThermalProfile({ signals }: { signals: SignalView[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const zones = signals.filter((signal) => signal.kind === 'temperature');

  if (zones.length < 2) return null;

  const values = zones.map((zone) => zone.value).filter((value): value is number => value !== null);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const span = max - min || 1;
  const gradual = zones.every(
    (zone, index) => index === 0 || zone.value === null || zones[index - 1].value === null || zone.value >= (zones[index - 1].value ?? 0),
  );

  return (
    <View className="gap-3">
      <View className="flex-row items-end justify-between gap-2">
        {zones.map((zone) => (
          <View key={zone.tag} className="min-w-0 flex-1 items-center">
            <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }} numberOfLines={1}>
              {zone.measures.replace(/ temperature$/i, '')}
            </Text>
            <Text className="mt-0.5 font-body text-[20px] leading-[24px]" style={{ color: palette.ink, fontWeight: '300' }}>
              {formatValue(zone.value, zone.unit)}
            </Text>
          </View>
        ))}
      </View>

      {/* The profile itself: one node per zone, each sitting at a height set by
          its own temperature. That is the point of drawing it at all — a flat
          or inverted profile is a different fault from any single hot zone, and
          it is visible here as a shape before any number is read. */}
      <View style={{ height: PROFILE_HEIGHT }} className="flex-row items-stretch">
        {zones.map((zone) => {
          const share = zone.value === null ? 0 : (zone.value - min) / span;
          const accent =
            zone.status === 'ALARM' ? palette.critical : zone.status === 'WARNING' ? palette.warning : palette.accent;
          return (
            <View key={zone.tag} className="min-w-0 flex-1 items-center justify-end">
              <View
                style={{
                  width: 1,
                  height: 6 + share * (PROFILE_HEIGHT - 18),
                  backgroundColor: palette.line,
                }}
              />
              <View
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 6,
                  marginTop: -6,
                  backgroundColor: zone.value === null ? palette.inkFaint : accent,
                }}
              />
              <View style={{ height: 6 }} />
            </View>
          );
        })}
      </View>
      <View style={{ height: 1, backgroundColor: palette.line, marginTop: -7 }} />

      <Text className="text-center font-body text-[10.5px]" style={{ color: palette.inkMuted }}>
        {values.length < zones.length
          ? 'Part of the profile is not reporting, so the progression cannot be assessed.'
          : gradual
            ? 'Gradual increase along the screw, as the profile expects.'
            : 'The profile does not rise gradually along the screw — a zone is out of sequence.'}
      </Text>

      <View>
        {zones.map((zone, index) => {
          const variant: Variant = zone.status === 'ALARM' ? 'destructive' : zone.status === 'WARNING' ? 'warning' : 'success';
          return (
            <View
              key={zone.tag}
              className="flex-row items-center justify-between gap-3 py-1.5"
              style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
            >
              <Text className="min-w-0 flex-1 font-body text-[11.5px]" style={{ color: palette.ink }} numberOfLines={1}>
                {zone.measures}
              </Text>
              <Text className="font-body text-[11px]" style={{ color: palette.inkMuted }}>
                {BEHAVIOUR_LABEL[zone.behaviour]}
              </Text>
              <Badge variant={variant} icon={null} outline>
                {zone.status === 'UNAVAILABLE' ? 'No data' : zone.status.toLowerCase()}
              </Badge>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AdvanceDiagnosisTab({
  parts,
  selectedPart,
  onSelectPart,
  wide,
}: {
  parts: PartView[];
  selectedPart: MachinePart | null;
  onSelectPart: (part: MachinePart | null) => void;
  wide: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const view = selectedPart ? (parts.find((entry) => entry.part === selectedPart) ?? null) : null;
  // Only a part that needs a decision earns a card. Normal parts and parts
  // nothing is measuring are each worth one line, not one card apiece.
  const needsDecision = parts.filter((entry) => entry.state !== 'NORMAL' && entry.state !== 'UNAVAILABLE');
  const healthy = parts.filter((entry) => entry.state === 'NORMAL');
  const unmeasured = parts.filter((entry) => entry.state === 'UNAVAILABLE');

  return (
    <View>
      {/* The part picker is the screen's navigation, not a region of its own. It
          sits bare at the top of the card so the first thing the eye lands on is
          the machine, not a heading announcing that a machine is below. */}
      <View className="px-4 pb-1 pt-3.5">
        <PartChips parts={parts} selected={selectedPart} onSelect={onSelectPart} />
      </View>

      {view === null ? (
        <>
          <Block
            first
            title="Machine condition by part"
            meta="Material travels left to right. Select a part to open it."
          >
            <ConditionStrip parts={parts} onSelect={onSelectPart} />
          </Block>

          {needsDecision.length > 0 || healthy.length > 0 || unmeasured.length > 0 ? (
            <Block title="What each part is reporting" padded={false}>
              <View className="px-4 pb-4" style={{ gap: 10 }}>
                {needsDecision.length > 0 ? (
                  <View className={cn(wide && 'flex-row flex-wrap')} style={{ gap: 10 }}>
                    {needsDecision.map((entry) => (
                      <PartCard key={entry.part} view={entry} onOpen={() => onSelectPart(entry.part)} />
                    ))}
                  </View>
                ) : null}
                <PartGroupLine parts={healthy} title="parts normal" badge="Normal" variant="success" />
                <PartGroupLine parts={unmeasured} title="parts not measured" badge="No data" variant="muted" />
              </View>
            </Block>
          ) : null}
        </>
      ) : (
        <>
          {/* One header for the part: what it is, how it is, and what is wrong.
              The counts that used to sit here repeated the strip and the card
              above, so the headline keeps the sentence and drops the tally. */}
          <Block
            first
            title={view.part}
            meta={view.headline ?? view.description}
            accent={STATE_VARIANT[view.state]}
            actions={
              <Badge variant={STATE_VARIANT[view.state]} icon={null} outline>
                {PART_STATE_LABEL[view.state]}
              </Badge>
            }
          >
            <View className="gap-2">
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                How ULTRON reached this conclusion
              </Text>
              <ReasoningChain view={view} />
            </View>
          </Block>

          {view.part === 'Barrel' ? (
            <Block
              title="Barrel temperature profile"
              meta="The zones are read as one profile: a flat or inverted profile is a different fault from any single hot zone."
            >
              <ThermalProfile signals={view.signals} />
            </Block>
          ) : null}

          <View className={cn(wide && 'flex-row items-stretch')} style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
            <View className="min-w-0 flex-1">
              <Block
                first
                title="Possible causes"
                meta="Ranked by engineering match. The order is a judgement about fit, not a probability."
                actions={
                  <Badge variant={view.causes.length > 0 ? 'warning' : 'muted'} icon={null} outline>
                    {view.causes.length} candidate{view.causes.length === 1 ? '' : 's'}
                    {view.ruledOut.length > 0 ? ` · ${view.ruledOut.length} ruled out` : ''}
                  </Badge>
                }
                footnote="No calibrated fault-probability model exists for this machine, so no percentage confidence is reported. Where the installed sensors cannot separate two candidates the ambiguity is kept, and the measurement that would settle it is named."
              >
                <CauseList view={view} />
              </Block>
            </View>

            <View
              style={wide ? { width: 1, backgroundColor: palette.line } : { height: 1, backgroundColor: palette.line }}
            />

            <View className="min-w-0 flex-1">
              <Block
                first
                title="Signal detail"
                meta="Signals this part owns, plus the ones that inform it. The tools offered are the ones this kind of measurement can support."
                actions={
                  <Badge variant="muted" icon={null} outline>
                    {view.signals.length + view.contextSignals.length} signal
                    {view.signals.length + view.contextSignals.length === 1 ? '' : 's'}
                  </Badge>
                }
              >
                <SignalDetail signals={[...view.signals, ...view.contextSignals]} part={view.part} />
              </Block>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
