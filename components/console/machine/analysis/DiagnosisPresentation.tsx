import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { CONDITION_LABEL, type OverviewCondition } from '../../../../lib/analysisOverview';
import { cn } from '../../../../lib/cn';
import { Hoverable, alpha, consolePalette, radius, tabular, text, type IconName, type Variant } from '../../../ui';
import { EqualColumnStrip } from './EqualColumnStrip';

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

  // Equal columns, for the same reason as every other strip in this layer: a
  // reading is not more important because its value prints longer.
  return (
    <EqualColumnStrip
      minColumnWidth={170}
      cornerRadius={radius.md}
      cells={facts.map((fact) => ({
        key: fact.label,
        node: (
          <>
            <Text className={text.label} style={{ color: palette.inkFaint }} numberOfLines={1}>
              {fact.label}
            </Text>
            <View className="flex-row flex-wrap items-baseline gap-x-1.5">
              <Text
                className={text.dataMd}
                style={[tabular, { color: fact.tone ? conditionColour(fact.tone, isDark) : palette.ink, fontWeight: '600' }]}
                numberOfLines={1}
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
          </>
        ),
      }))}
    />
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

  // One ruled box, not a scatter of tinted tiles.
  //
  // Every tag in these grids is HEALTHY, so twenty individually-tinted, gapped
  // pills spend twenty green boxes saying one thing — the colour carries no
  // information when nothing differs, and the gaps stop the labels lining up
  // into columns a reader can run an eye down. Ruled cells inside a single
  // frame line up, and the state word sits at the same x on every row, so the
  // exception is what catches the eye rather than the fill.
  return (
    <EqualColumnStrip
      minColumnWidth={minWidth}
      cornerRadius={radius.md}
      cells={items.map((item) => {
        const colour = conditionColour(item.condition, isDark);
        return {
          key: item.label,
          node: (
            // Label over state, not label beside state. Side by side, a long
            // subsystem name pushed the state word around and the column of
            // states stopped lining up — which is the only thing a reader is
            // scanning this grid for. Stacked, every state sits at the same
            // place in its cell and the odd one out is visible immediately.
            <>
              <Text numberOfLines={2} className={cn(text.bodyStrong)} style={{ color: palette.ink }}>
                {item.label}
              </Text>
              <View className="flex-row items-center gap-1.5">
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colour }} />
                <Text className={text.chip} style={{ color: colour }}>
                  {CONDITION_LABEL[item.condition]}
                </Text>
              </View>
            </>
          ),
        };
      })}
    />
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
  // `info` has its own token and was being collapsed into the same grey as
  // `muted`, which left the two variants indistinguishable at the one place
  // the distinction is the whole point — a row of cards keyed by kind.
  if (variant === 'info') return palette.info;
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

  // Chrome deliberately kept to lines. A hairline box with one 3px accent rule
  // down its leading edge is enough to say "this is a column, and this is which
  // kind" — the full-width coloured top bar and the bordered icon well this
  // replaces turned a light frame into a heavy filled panel, and three of them
  // in a row read as three black boxes rather than as one ruled split.
  return (
    <Hoverable
      className="overflow-hidden border"
      style={({ hovered }) => ({
        flexBasis: basis,
        flexGrow: 1,
        minWidth,
        borderColor: hovered ? palette.hoverBorder : palette.line,
        borderLeftWidth: 3,
        borderLeftColor: alpha(accent, hovered ? 0.85 : 0.55),
        backgroundColor: hovered ? palette.hoverSurface : palette.panelRaised,
        borderRadius: radius.md,
      })}
    >
      <View className="flex-row items-start gap-2 px-4 pb-2.5 pt-3">
        <MaterialCommunityIcons name={icon} size={13} color={accent} style={{ marginTop: 3 }} />
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
          <View className="px-1.5 py-[1px]" style={{ backgroundColor: alpha(accent, 0.12), borderRadius: radius.sm }}>
            <Text className={text.code} style={[tabular, { color: accent }]}>
              {count}
            </Text>
          </View>
        )}
      </View>

      <View className="px-4 pb-3" style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
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

// The column widths, as flex rules rather than fixed pixels.
//
// The table this restores was five hard-coded columns behind an 820px minimum
// and its own horizontal scrollbar, so on a narrow window the reading — the one
// column anybody came for — sat off-screen. Same columns, but the two prose
// ones flex and the two short ones hold a fixed width, so the grid stays a grid
// at any panel width and never scrolls sideways.
const SENSOR_COL_MEASUREMENT = { flexGrow: 3, flexBasis: 200, minWidth: 150 } as const;
const SENSOR_COL_VALUE = { flexGrow: 1, flexBasis: 120, minWidth: 96 } as const;
const SENSOR_COL_TREND = { flexGrow: 4, flexBasis: 240, minWidth: 160 } as const;
const SENSOR_COL_CONDITION = { flexGrow: 0, flexBasis: 116, minWidth: 116 } as const;

/**
 * Live sensor evidence, in columns.
 *
 * Fifteen readings of the same shape are a table, not fifteen cards: the whole
 * job here is comparing one row against the next, and that only works when the
 * value of row 4 is directly above the value of row 5. Cards put every field at
 * a different x for every row, which is exactly the wrong shape for scanning a
 * column of numbers.
 *
 * The data-quality column stays gone on purpose. It repeated one page-level
 * fact — the feed is either good or it is not — once per row, fifteen times, in
 * the position a reader scans for something that varies. That fact is still
 * stated once, in the fact strip at the top of the page.
 */
export function SensorEvidenceGrid({ items, empty }: { items: SensorEvidenceItem[]; empty: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  if (items.length === 0) {
    return (
      <Text className={text.body} style={{ color: palette.inkMuted }}>
        {empty}
      </Text>
    );
  }

  return (
    <View
      className="overflow-hidden border"
      style={{ borderColor: palette.line, borderRadius: radius.md, backgroundColor: palette.panelRaised }}
    >
      <View
        className="flex-row items-center gap-3 px-3.5 py-2.5"
        style={{ borderBottomWidth: 1, borderBottomColor: palette.lineStrong, backgroundColor: palette.panel }}
      >
        <Text className={text.label} style={[SENSOR_COL_MEASUREMENT, { color: palette.inkFaint }]} numberOfLines={1}>
          MEASUREMENT
        </Text>
        <Text className={text.label} style={[SENSOR_COL_VALUE, { color: palette.inkFaint }]} numberOfLines={1}>
          VALUE
        </Text>
        <Text className={text.label} style={[SENSOR_COL_TREND, { color: palette.inkFaint }]} numberOfLines={1}>
          TREND / QUALIFIER
        </Text>
        <Text className={text.label} style={[SENSOR_COL_CONDITION, { color: palette.inkFaint }]} numberOfLines={1}>
          CONDITION
        </Text>
      </View>

      {items.map((item, index) => {
        const colour = conditionColour(item.condition, isDark);
        return (
          <Hoverable
            key={item.id}
            className="flex-row items-center gap-3 px-3.5 py-2.5"
            style={({ hovered }) => ({
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: palette.line,
              backgroundColor: hovered ? palette.hoverSurface : undefined,
            })}
          >
            <View style={SENSOR_COL_MEASUREMENT} className="gap-0.5">
              <Text numberOfLines={1} className={text.bodyStrong} style={{ color: palette.ink }}>
                {item.measurement}
              </Text>
              <Text numberOfLines={1} className={text.code} style={{ color: palette.inkFaint }}>
                {item.code}
              </Text>
            </View>

            <Text numberOfLines={1} className={text.data} style={[SENSOR_COL_VALUE, tabular, { color: colour }]}>
              {item.value}
            </Text>

            <View style={SENSOR_COL_TREND} className="flex-row items-start gap-2">
              <MaterialCommunityIcons name="chart-line-variant" size={12} color={palette.inkFaint} style={{ marginTop: 2 }} />
              <Text className={cn('min-w-0 flex-1', text.micro)} style={{ color: palette.inkMuted }}>
                {item.trend}
              </Text>
            </View>

            <View style={SENSOR_COL_CONDITION}>
              <ConditionPill condition={item.condition} size="sm" />
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
export function DoctorCard({ label, value, variant = 'success' }: { label: string; value: string; variant?: Variant }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent = variantAccent(palette, variant);

  // The rule runs the full height of the card and is tinted per question, so
  // the five cards read as five different kinds of statement at a glance —
  // what is true now, where it is, why it is watched, what it costs today,
  // what it becomes. Painted in one colour they read as one repeated note.
  return (
    <Hoverable
      className="flex-row gap-3 border py-3.5 pl-3 pr-4"
      style={({ hovered }) => ({
        flexBasis: 250,
        flexGrow: 1,
        minWidth: 220,
        borderColor: hovered ? alpha(accent, 0.4) : palette.line,
        backgroundColor: hovered ? palette.hoverSurface : palette.panelRaised,
        borderRadius: radius.md,
      })}
    >
      <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: alpha(accent, 0.75) }} />
      <View className="min-w-0 flex-1 gap-1.5">
        <Text className={text.label} style={{ color: accent }}>
          {label}
        </Text>
        <Text className={text.body} style={{ color: palette.ink }}>
          {value}
        </Text>
      </View>
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
