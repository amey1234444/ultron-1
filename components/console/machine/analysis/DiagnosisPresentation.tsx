import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { CONDITION_LABEL, type OverviewCondition } from '../../../../lib/analysisOverview';
import { cn } from '../../../../lib/cn';
import { Hoverable, alpha, consolePalette, radius, tabular, text, type IconName, type Variant } from '../../../ui';

/**
 * The presentation layer for the diagnosis pages.
 *
 * Everything here is chrome: it states what the diagnosis model already decided
 * and adds no fact of its own. It exists because the diagnosis screens had grown
 * their own private set of hand-rolled rows — bare `View`s with literal font
 * sizes, a five-column table that scrolled sideways on a 1900px display, and a
 * metadata strip whose cells had no edges — while the console already ships a
 * primitive kit (`components/ui`) with exactly these shapes in it. A screen
 * assembled from one-off rows cannot hold a hierarchy: every element is its own
 * weight, so nothing is emphatic and nothing is quiet.
 *
 * So the rule for this file: no colour literals, no font sizes. Colour resolves
 * through `consolePalette` and the five-rung condition ramp the rest of the
 * analysis layer already speaks; type resolves through the `text` scale.
 */

// The five overview rungs, mapped onto the kit's semantic variants and onto an
// icon each, so the state survives greyscale and colour-blindness. 'attention'
// and 'alert' share the amber accent by design but never share a glyph — the
// difference between "not where you'd like it" and "over the limit" is the one
// distinction an operator must not have to read a legend for.
const CONDITION_VARIANT: Record<OverviewCondition, Variant> = {
  healthy: 'success',
  attention: 'warning',
  alert: 'warning',
  danger: 'destructive',
  offline: 'muted',
};

const CONDITION_ICON: Record<OverviewCondition, IconName> = {
  healthy: 'check-circle-outline',
  attention: 'eye-outline',
  alert: 'alert-outline',
  danger: 'alert-octagon-outline',
  offline: 'lan-disconnect',
};

export function conditionColour(condition: OverviewCondition, isDark: boolean): string {
  const palette = consolePalette(isDark);
  if (condition === 'healthy') return palette.accent;
  if (condition === 'danger') return palette.critical;
  if (condition === 'offline') return palette.neutral;
  return palette.warning;
}

export function conditionVariant(condition: OverviewCondition): Variant {
  return CONDITION_VARIANT[condition];
}

/**
 * A condition pill.
 *
 * The kit's `Badge` covers four variants; this covers the analysis layer's five
 * rungs, which is one more than the palette has signal colours. Same anatomy —
 * tinted well, coloured glyph, ink label — so the two read as one component.
 */
export function ConditionPill({
  condition,
  size = 'md',
}: {
  condition: OverviewCondition;
  size?: 'sm' | 'md';
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const colour = conditionColour(condition, isDark);

  return (
    <View
      className={cn('flex-row items-center gap-1.5 self-start', size === 'sm' ? 'px-1.5 py-[2px]' : 'px-2 py-[3px]')}
      style={{ backgroundColor: alpha(colour, 0.12), borderWidth: 1, borderColor: alpha(colour, 0.3), borderRadius: radius.sm }}
    >
      <MaterialCommunityIcons name={CONDITION_ICON[condition]} size={size === 'sm' ? 10 : 11} color={colour} />
      <Text className={text.chip} style={{ color: palette.ink }}>
        {CONDITION_LABEL[condition]}
      </Text>
    </View>
  );
}

/**
 * The lead verdict on a diagnosis page.
 *
 * One statement, at display size, over a wash of its own status colour, with the
 * page's single primary action beside it. The wash is a gradient rather than a
 * flat tint so the block reads as a surface with a light source rather than as a
 * coloured rectangle, and it fades to the panel colour before the text baseline
 * so the sentence underneath is never read through a tint.
 */
export function VerdictHeader({
  condition,
  eyebrow,
  title,
  detail,
  action,
}: {
  condition: OverviewCondition;
  eyebrow: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const colour = conditionColour(condition, isDark);

  return (
    <View
      className="overflow-hidden border"
      style={{ borderColor: alpha(colour, 0.28), borderRadius: radius.lg, backgroundColor: palette.panelRaised }}
    >
      {/* A hairline of the status colour along the top edge: the first thing the
          eye lands on, and the only place the colour runs at full strength. */}
      <View style={{ height: 2, backgroundColor: alpha(colour, 0.75) }} />
      <LinearGradient
        colors={[alpha(colour, isDark ? 0.13 : 0.08), alpha(colour, 0)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.75, y: 1 }}
        style={{ paddingHorizontal: 20, paddingVertical: 18 }}
      >
        <View className="flex-row flex-wrap items-start justify-between gap-4">
          <View className="min-w-0 flex-1 gap-2.5" style={{ minWidth: 280 }}>
            <View className="flex-row items-center gap-2">
              <ConditionPill condition={condition} />
              <Text className={text.label} style={{ color: palette.inkMuted }}>
                {eyebrow}
              </Text>
            </View>
            <Text className="font-body-bold text-[26px] leading-[33px] tracking-[-0.03em]" style={{ color: palette.ink }}>
              {title}
            </Text>
            <Text className={cn('max-w-[880px]', text.lede)} style={{ color: palette.inkMuted }}>
              {detail}
            </Text>
          </View>
          {action}
        </View>
      </LinearGradient>
    </View>
  );
}

export type Fact = {
  label: string;
  value: string;
  /** The unit the value is in — "days", "%", "hours". Set quietly beside it, never inside it. */
  unit?: string;
  /**
   * One clause qualifying the value: what it is measured against, or what it is
   * not. Small print under the cell — a note is never a second fact, and a cell
   * that needs two facts is two cells.
   */
  note?: string;
  /** Tints the value. Left off, the value is plain ink — most of them should be. */
  tone?: OverviewCondition;
  /** Long prose values wrap instead of being clipped to one line. */
  wide?: boolean;
};

/**
 * The fact strip under a verdict.
 *
 * The previous version was a row of `View`s with no edges between them, which on
 * a wide display spread eight facts across 1800px with nothing to say where one
 * ended and the next began — the reader had to use the label positions to
 * re-derive the grouping. These cells are a real grid: hairlines on two sides of
 * every cell, with the container clipping the outer row so the strip has a
 * border rather than a comb.
 */
export function FactStrip({ facts }: { facts: Fact[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View className="flex-row flex-wrap" style={{ gap: 10 }}>
      {facts.map((fact) => (
        <Hoverable
          key={fact.label}
          className="gap-1.5 border px-4 py-3"
          style={({ hovered }) => ({
            minWidth: fact.wide ? 300 : 178,
            flexGrow: fact.wide ? 2.4 : 1,
            flexBasis: fact.wide ? 300 : 178,
            borderColor: hovered ? palette.hoverBorder : palette.line,
            backgroundColor: hovered ? palette.hoverSurface : palette.panelRaised,
            borderRadius: radius.md,
          })}
        >
          <Text className={text.label} style={{ color: palette.inkFaint }} numberOfLines={1}>
            {fact.label}
          </Text>
          <View className="flex-row flex-wrap items-baseline gap-x-1.5">
            <Text
              className={fact.wide ? text.bodyStrong : text.dataMd}
              style={[
                fact.wide ? null : tabular,
                { color: fact.tone ? conditionColour(fact.tone, isDark) : palette.ink, fontWeight: '600' },
              ]}
            >
              {fact.value}
            </Text>
            {fact.unit ? (
              <Text className={text.meta} style={{ color: palette.inkMuted }}>
                {fact.unit}
              </Text>
            ) : null}
          </View>
          {fact.note ? (
            <Text className={text.micro} style={{ color: palette.inkFaint }} numberOfLines={2}>
              {fact.note}
            </Text>
          ) : null}
        </Hoverable>
      ))}
    </View>
  );
}

/**
 * A row of state tags — subsystems, or elements of the machine train.
 *
 * Each tag is a tile rather than a pill: the state word has to sit at a
 * predictable place on the right for a column of them to be scannable, and a
 * pill that hugs its label puts that word somewhere different on every row.
 */
export function StateTagGrid({
  items,
  minWidth = 200,
}: {
  items: Array<{ label: string; condition: OverviewCondition }>;
  minWidth?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View className="flex-row flex-wrap gap-2">
      {items.map((item) => {
        const colour = conditionColour(item.condition, isDark);
        return (
          <Hoverable
            key={item.label}
            className="flex-row items-center gap-2.5 border px-3 py-2.5"
            style={({ hovered }) => ({
              minWidth,
              flexGrow: 1,
              flexBasis: minWidth,
              borderColor: alpha(colour, hovered ? 0.5 : 0.26),
              backgroundColor: alpha(colour, hovered ? (isDark ? 0.16 : 0.1) : isDark ? 0.08 : 0.05),
              borderRadius: radius.md,
            })}
          >
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colour }} />
            <Text numberOfLines={1} className={cn('min-w-0 flex-1', text.bodyStrong)} style={{ color: palette.ink }}>
              {item.label}
            </Text>
            <Text className={text.chip} style={{ color: colour }}>
              {CONDITION_LABEL[item.condition]}
            </Text>
          </Hoverable>
        );
      })}
    </View>
  );
}

/**
 * A statement list — the console's one way of setting "here are the things we
 * found".
 *
 * This layer had two of these and neither worked. One was a column of "+" glyphs
 * with the prose hung off them; the other was bare stacked paragraphs. Both fail
 * the same way: ten equally weighted sentences with no edge between them read as
 * a wall, and a reader cannot tell where the fourth item stops and the fifth
 * begins without going back to the start. So every item gets an ordinal and a
 * hairline. The ordinal is the part that earns its keep — evidence gets argued
 * about out loud ("item 4 is the one I do not believe"), and a bullet cannot be
 * named.
 */
export function StatementList({
  items,
  empty,
  accent,
  dense = false,
}: {
  items: readonly string[];
  empty: string;
  /** The colour of the ordinals. Defaults to the console accent. */
  accent?: string;
  /** Tighter rows, for a list inside a card rather than a list that is the region. */
  dense?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const rail = accent ?? palette.accent;

  // "Nothing here" is a finding too, so it gets a stated shape rather than an
  // absence: a dashed well says the question was asked and came back empty.
  if (items.length === 0) {
    return (
      <View
        className="flex-row items-center gap-2 px-3 py-3"
        style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: palette.line, borderRadius: radius.sm }}
      >
        <MaterialCommunityIcons name="minus-circle-outline" size={12} color={palette.inkFaint} />
        <Text className={cn('min-w-0 flex-1', text.micro)} style={{ color: palette.inkMuted }}>
          {empty}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {items.map((item, index) => (
        <Hoverable
          key={item}
          className={cn('flex-row items-start', dense ? 'gap-2.5 px-2 py-2' : 'gap-3 px-2 py-2.5')}
          style={({ hovered }) => ({
            marginHorizontal: -8,
            borderRadius: radius.sm,
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: palette.lineSubtle,
            backgroundColor: hovered ? palette.hoverSurface : undefined,
          })}
        >
          <Text
            className={text.code}
            style={[tabular, { color: alpha(rail, 0.85), width: 17, paddingTop: dense ? 1 : 2 }]}
          >
            {String(index + 1).padStart(2, '0')}
          </Text>
          <Text className={cn('min-w-0 flex-1', text.body)} style={{ color: palette.ink }}>
            {item}
          </Text>
        </Hoverable>
      ))}
    </View>
  );
}

/**
 * One column of the evidence split.
 *
 * Three of these sit side by side and have to be told apart from across a
 * control room, so each says what it is four times over: a coloured top rule, a
 * glyph in a tinted well, the count, and the title. Colour alone would not
 * survive greyscale; a glyph alone would not survive being 13px.
 *
 * The count sits on the card rather than being implied by the rows, so
 * "contradicting evidence: 0" is a stated result. A reader must never have to
 * decide whether an empty column means nothing was found or nothing was run.
 */
export function variantAccent(palette: ReturnType<typeof consolePalette>, variant: Variant): string {
  if (variant === 'success') return palette.accent;
  if (variant === 'warning') return palette.warning;
  if (variant === 'destructive') return palette.critical;
  return palette.neutral;
}

/**
 * The box an evidence column lives in, on its own.
 *
 * Split out of `EvidenceCard` because the analysis layer has several regions
 * with the same anatomy — a titled box carrying a count and a body — whose body
 * is not a list of sentences: a maintenance window, a table of plot
 * specifications. Those were being promoted to full-width headed regions
 * instead, which quietly dissolved a row of boxes into a stack of loose
 * sections. Same chrome, any body.
 */
export function EvidenceShell({
  title,
  caption,
  variant,
  icon,
  count,
  children,
  basis = 300,
  minWidth = 268,
}: {
  title: string;
  caption?: string;
  variant: Variant;
  icon: IconName;
  /** Shown in the corner chip. Left off, the chip is not drawn. */
  count?: number;
  children: ReactNode;
  basis?: number;
  minWidth?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent = variantAccent(palette, variant);

  return (
    <Hoverable
      className="overflow-hidden border"
      style={({ hovered }) => ({
        flexBasis: basis,
        flexGrow: 1,
        minWidth,
        borderColor: hovered ? alpha(accent, 0.55) : palette.line,
        backgroundColor: hovered ? palette.hoverSurface : palette.panelRaised,
        borderRadius: radius.md,
      })}
    >
      <View style={{ height: 2, backgroundColor: alpha(accent, 0.6) }} />

      <View className="flex-row items-start gap-2.5 px-4 pb-3 pt-3.5">
        <View
          className="items-center justify-center"
          style={{
            width: 26,
            height: 26,
            borderRadius: radius.sm,
            backgroundColor: alpha(accent, 0.12),
            borderWidth: 1,
            borderColor: alpha(accent, 0.26),
          }}
        >
          <MaterialCommunityIcons name={icon} size={14} color={accent} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className={text.title} style={{ color: palette.ink }}>
            {title}
          </Text>
          {caption ? (
            <Text className={text.micro} style={{ color: palette.inkFaint }}>
              {caption}
            </Text>
          ) : null}
        </View>
        {count === undefined ? null : (
          <View className="px-2 py-[3px]" style={{ backgroundColor: alpha(accent, 0.12), borderRadius: radius.sm }}>
            <Text className={text.data} style={[tabular, { color: accent }]}>
              {count}
            </Text>
          </View>
        )}
      </View>

      <View className="px-4 pb-3.5" style={{ borderTopWidth: 1, borderTopColor: palette.lineSubtle }}>
        {children}
      </View>
    </Hoverable>
  );
}

export function EvidenceCard({
  title,
  items,
  empty,
  variant,
  icon,
  caption,
}: {
  title: string;
  items: readonly string[];
  empty: string;
  variant: Variant;
  icon: IconName;
  /** What this column is for, in one clause. Sits under the title, in small print. */
  caption?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent = variantAccent(palette, variant);

  return (
    <EvidenceShell title={title} caption={caption} variant={variant} icon={icon} count={items.length}>
      <StatementList items={items} empty={empty} accent={accent} dense />
    </EvidenceShell>
  );
}

/**
 * A definition list: the demo scripts' "Current condition / Prediction status /
 * Prediction target" rows.
 *
 * These used to be free-floating baseline-aligned rows with a hard 240px label
 * column and no edges at all, which on a wide panel put the label and its value
 * at opposite ends of a metre of empty space. Boxing them and hairlining between
 * them is what makes each pair read as one statement instead of two.
 */
export function DefinitionRows({
  rows,
  tone = 'accent',
  labelWidth = 190,
}: {
  rows: readonly (readonly [string, string])[];
  tone?: 'accent' | 'warning' | 'critical' | 'ink';
  labelWidth?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const colour =
    tone === 'warning' ? palette.warning : tone === 'critical' ? palette.critical : tone === 'ink' ? palette.ink : palette.accent;

  return (
    <View
      className="overflow-hidden border"
      style={{ borderColor: palette.line, borderRadius: radius.md, backgroundColor: palette.panelRaised }}
    >
      {rows.map(([label, value], index) => (
        <Hoverable
          key={label}
          className="flex-row flex-wrap items-baseline gap-x-6 gap-y-1 px-4 py-3"
          style={({ hovered }) => ({
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: palette.lineSubtle,
            backgroundColor: hovered ? palette.hoverSurface : undefined,
          })}
        >
          <Text className={text.label} style={{ color: palette.inkFaint, width: labelWidth }}>
            {label.toLocaleUpperCase()}
          </Text>
          <Text className={cn('min-w-0 flex-1', text.bodyStrong)} style={{ color: colour }}>
            {value}
          </Text>
        </Hoverable>
      ))}
    </View>
  );
}

export type SensorEvidenceItem = {
  id: string;
  measurement: string;
  code: string;
  value: string;
  trend: string;
  condition: OverviewCondition;
};

/** Two columns once there is room for two readable ones, otherwise one. */
const SENSOR_CARD_MIN = 340;
const SENSOR_GAP = 10;

/**
 * Live sensor evidence, as cards rather than as a table.
 *
 * The table this replaces was five columns wide with a 820px minimum and its own
 * horizontal scrollbar, so on any window narrower than a desktop the reading —
 * the one column anybody came for — was off-screen behind a scroll. Cards carry
 * the same fields at whatever width is available and pack two-up when the region
 * is wide enough, which is most of the time on the console.
 *
 * The data-quality column is gone on purpose. It repeated one page-level fact —
 * the feed is either good or it is not — once per row, fifteen times, in the
 * position a reader scans for something that varies. The fact itself is still
 * stated, once, in the fact strip at the top of the page.
 */
export function SensorEvidenceGrid({ items, empty }: { items: SensorEvidenceItem[]; empty: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [width, setWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((previous) => (Math.abs(previous - next) < 2 ? previous : next));
  }, []);

  if (items.length === 0) {
    return (
      <Text className={text.body} style={{ color: palette.inkMuted }}>
        {empty}
      </Text>
    );
  }

  const columns = width >= SENSOR_CARD_MIN * 2 + SENSOR_GAP ? 2 : 1;
  const cardWidth = columns === 2 ? Math.floor((width - SENSOR_GAP) / 2) : undefined;

  return (
    <View className="flex-row flex-wrap" style={{ gap: SENSOR_GAP }} onLayout={onLayout}>
      {items.map((item) => {
        const colour = conditionColour(item.condition, isDark);
        return (
          <Hoverable
            key={item.id}
            className="gap-2 border px-3.5 py-3"
            style={({ hovered }) => ({
              width: cardWidth,
              flexGrow: columns === 2 ? 0 : 1,
              flexBasis: cardWidth ?? '100%',
              minWidth: 0,
              borderColor: hovered ? alpha(colour, 0.4) : palette.line,
              backgroundColor: hovered ? palette.hoverSurface : palette.panelRaised,
              borderRadius: radius.md,
            })}
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text numberOfLines={1} className={text.bodyStrong} style={{ color: palette.ink }}>
                  {item.measurement}
                </Text>
                <Text className={text.code} style={{ color: palette.inkFaint }}>
                  {item.code}
                </Text>
              </View>
              <ConditionPill condition={item.condition} size="sm" />
            </View>

            <View className="flex-row items-baseline justify-between gap-3">
              <Text className={text.dataLg} style={[tabular, { color: colour }]} numberOfLines={1}>
                {item.value}
              </Text>
            </View>

            <View className="flex-row items-start gap-2 pt-0.5" style={{ borderTopWidth: 1, borderTopColor: palette.lineSubtle, paddingTop: 8 }}>
              <MaterialCommunityIcons name="chart-line-variant" size={11} color={palette.inkFaint} style={{ marginTop: 1 }} />
              <Text className={cn('min-w-0 flex-1', text.micro)} style={{ color: palette.inkMuted }}>
                {item.trend}
              </Text>
            </View>
          </Hoverable>
        );
      })}
    </View>
  );
}

/**
 * A machine-doctor answer: one question, one statement.
 *
 * Same tile in both the healthy and the predictive layouts, so WHAT / WHERE /
 * WHY read as one instrument in both rather than as two similar ones.
 */
export function DoctorCard({ label, value }: { label: string; value: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <Hoverable
      className="gap-2.5 border px-4 py-3.5"
      style={({ hovered }) => ({
        flexBasis: 250,
        flexGrow: 1,
        minWidth: 220,
        borderColor: hovered ? alpha(palette.accent, 0.4) : palette.line,
        backgroundColor: hovered ? palette.hoverSurface : palette.panelRaised,
        borderRadius: radius.md,
      })}
    >
      <View className="flex-row items-center gap-1.5">
        <View style={{ width: 3, height: 10, borderRadius: 2, backgroundColor: alpha(palette.accent, 0.8) }} />
        <Text className={text.label} style={{ color: palette.inkMuted }}>
          {label}
        </Text>
      </View>
      <Text className={text.body} style={{ color: palette.ink }}>
        {value}
      </Text>
    </Hoverable>
  );
}

/** A region heading: eyebrow, title, and whatever the region needs on the right. */
export function RegionHeading({ eyebrow, title, trailing }: { eyebrow: string; title: string; trailing?: ReactNode }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View className="flex-row flex-wrap items-end justify-between gap-3">
      <View className="gap-1.5">
        <Text className={text.label} style={{ color: palette.inkFaint }}>
          {eyebrow}
        </Text>
        <Text className="font-body-bold text-[17px] leading-[23px] tracking-[-0.02em]" style={{ color: palette.ink }}>
          {title}
        </Text>
      </View>
      {trailing}
    </View>
  );
}
