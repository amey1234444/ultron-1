/**
 * WHAT RAISED IT — findings, grouped by signal.
 *
 * The idea this screen is built on
 * --------------------------------
 * The old list printed one row per *rule*, which meant "Motor shaft speed
 * crossed a registered boundary" appeared three times in a row because one
 * point tripped three different rules, and the only thing distinguishing the
 * three was a rule id buried in grey mono at the end of the line. A reader
 * scanning that list counts three problems on the motor. There is one.
 *
 * So one row is one *signal*. The rules it tripped are a table inside it,
 * revealed on expand, and they share the page's column grid — Rule, Reference,
 * Observed, Exceedance — so the columns line up whether you are reading a
 * collapsed cluster or an opened one, and the column names are stated once at
 * the top rather than repeated inside every group.
 *
 * Severity, and why boundaries are slate
 * --------------------------------------
 * See `lib/severity.ts`. The short version: a crossed reference and a breached
 * hard limit used to both come out amber, so a machine with twelve crossed
 * references looked like a machine with twelve warnings. Boundaries are slate
 * now. Amber means something is genuinely out of bounds.
 *
 * Selection is carried by underlines, not pills
 * ---------------------------------------------
 * A filter is a mono label with a rule under it, drawn in that filter's own
 * severity hue when it is the active one. No filled chips: a row of coloured
 * pills competes with the severity colour in the list underneath, which is the
 * only place colour is supposed to be carrying meaning.
 *
 * The exceedance bar
 * ------------------
 * `observed ÷ reference`, log-compressed. It is the one graphic here and it
 * carries real information: how far past its reference a rule actually is,
 * comparable across rules whose units have nothing to do with each other.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import type { MachinePart } from '../../../../lib/analysis/extruder';
import {
  exceedanceFill,
  exceedanceLabel,
  severityRamp,
  SEVERITY_HINT,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  SEVERITY_SHORT,
  type Severity,
} from '../../../../lib/severity';
import { consolePalette, tabular, text } from '../../../ui';

/** One rule that fired on a signal. */
export type FindingRule = {
  /** The registered id — `TH-FROZEN-REPEAT`, `PC-MELT-PRESSURE`. */
  code: string;
  /** What the rule tests, in words. */
  rule: string;
  /** The registered bound, formatted with its unit. */
  reference: string;
  /** What was actually measured, formatted with its unit. */
  observed: string;
  /**
   * `observed ÷ reference` as a multiple, or null when the two are not on a
   * ratio scale and dividing them would invent a number. A null renders as
   * "not comparable" rather than as a bar of zero length.
   */
  ratio: number | null;
};

/** One signal, and everything that fired on it. */
export type FindingCluster = {
  id: string;
  severity: Severity;
  /** The finding, as a sentence. */
  title: string;
  /** `S17 · motor shaft speed · rpm` — tag, what it measures, unit. */
  signal: string;
  /** Why this matters, or what it does not prove. One paragraph. */
  note: string;
  part: MachinePart | null;
  rules: FindingRule[];
};

export type FindingFilter = 'all' | Severity;

/** Rules, not clusters: a filter counting "3" must mean three rules fired. */
function countRules(clusters: FindingCluster[]): number {
  return clusters.reduce((total, cluster) => total + cluster.rules.length, 0);
}

function countBySeverity(clusters: FindingCluster[], severity: Severity): number {
  return countRules(clusters.filter((cluster) => cluster.severity === severity));
}

/**
 * The column grid, declared once.
 *
 * Every row on this card — the header, a collapsed cluster, an expanded rule —
 * lays out on these widths, which is what lets Reference and Observed line up
 * down the whole card instead of drifting per section.
 */
const COLS = {
  dot: 26,
  rule: 190,
  reference: 92,
  observed: 92,
  exceedance: 122,
  caret: 22,
};

function ColumnHeader() {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const head = (label: string, width: number, align: 'left' | 'right' = 'left') => (
    <Text
      key={label}
      className={text.label}
      style={{ color: palette.inkMuted, width, textAlign: align }}
      numberOfLines={1}
    >
      {label}
    </Text>
  );

  return (
    <View className="flex-row items-center gap-3.5 px-6 pb-2.5">
      <View style={{ width: COLS.dot }} />
      <Text className={text.label} style={{ color: palette.inkMuted, flex: 1, minWidth: 0 }}>
        Signal
      </Text>
      {head('Rule', COLS.rule)}
      {head('Reference', COLS.reference, 'right')}
      {head('Observed', COLS.observed, 'right')}
      {head('Exceedance', COLS.exceedance)}
      <View style={{ width: COLS.caret }} />
    </View>
  );
}

/** The one graphic on this card. See the note at the top of the file. */
function ExceedanceBar({ ratio, severity }: { ratio: number | null; severity: Severity }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const tones = severityRamp(isDark)[severity];
  const over = ratio !== null && Number.isFinite(ratio) && ratio > 1;

  return (
    <View style={{ width: COLS.exceedance }}>
      <View style={{ height: 4, borderRadius: 999, backgroundColor: palette.panelRaised, overflow: 'hidden' }}>
        <View
          style={{
            height: '100%',
            borderRadius: 999,
            width: `${exceedanceFill(ratio ?? 0).toFixed(0)}%` as `${number}%`,
            backgroundColor: over ? tones.dot : palette.inkFaint,
          }}
        />
      </View>
      <Text className={cn('mt-1', text.label)} style={{ color: over ? tones.text : palette.inkFaint }} numberOfLines={1}>
        {exceedanceLabel(ratio)}
      </Text>
    </View>
  );
}

function ClusterRow({
  cluster,
  open,
  onToggle,
  onOpenPart,
}: {
  cluster: FindingCluster;
  open: boolean;
  onToggle: () => void;
  onOpenPart: (part: MachinePart) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const tones = severityRamp(isDark)[cluster.severity];
  const [hover, setHover] = useState(false);

  // The worst rule on the signal is what the collapsed row reports: a cluster
  // is only as reassuring as the furthest-past-reference thing inside it.
  const worst = cluster.rules.reduce<number | null>((highest, rule) => {
    if (rule.ratio === null || !Number.isFinite(rule.ratio)) return highest;
    return highest === null ? rule.ratio : Math.max(highest, rule.ratio);
  }, null);

  return (
    <View style={{ backgroundColor: open ? tones.wash : 'transparent' }}>
      <Pressable
        onPress={onToggle}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${cluster.title}. ${cluster.rules.length} rule${cluster.rules.length === 1 ? '' : 's'}.`}
        className="flex-row items-center gap-3.5 px-6 py-3"
        style={{
          // The rail is the severity, always present, saturated once opened.
          borderLeftWidth: 3,
          borderLeftColor: open ? tones.dot : tones.edge,
          backgroundColor: !open && hover ? palette.panelRaised : 'transparent',
        }}
      >
        <View style={{ width: COLS.dot, alignItems: 'flex-start', paddingLeft: 8 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 8,
              backgroundColor: tones.dot,
              // A halo in the section's own band colour, so the dot reads as
              // belonging to its group rather than floating on the row.
              borderWidth: 3,
              borderColor: tones.head,
            }}
          />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className={text.bodyStrong} style={{ color: palette.ink }} numberOfLines={1}>
            {cluster.title}
          </Text>
          <Text className={cn('mt-0.5', text.label)} style={{ color: palette.inkMuted }} numberOfLines={1}>
            {cluster.signal}
          </Text>
        </View>

        <Text className={text.data} style={[tabular, { color: palette.inkMuted, width: COLS.rule }]} numberOfLines={1}>
          {cluster.rules.length === 1 ? '1 rule' : `${cluster.rules.length} rules`}
        </Text>
        <View style={{ width: COLS.reference }} />
        <View style={{ width: COLS.observed }} />
        <ExceedanceBar ratio={worst} severity={cluster.severity} />

        <View style={{ width: COLS.caret, alignItems: 'center' }}>
          <MaterialCommunityIcons
            name={open ? 'chevron-down' : 'chevron-right'}
            size={16}
            color={palette.inkFaint}
          />
        </View>
      </Pressable>

      {open ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: tones.dot }}>
          {cluster.rules.map((rule) => {
            const over = rule.ratio !== null && Number.isFinite(rule.ratio) && rule.ratio > 1;
            return (
              <View
                key={rule.code + rule.rule}
                className="flex-row items-center gap-3.5 px-6 py-2.5"
                style={{ borderTopWidth: 1, borderTopColor: tones.edge }}
              >
                <View style={{ width: COLS.dot }} />
                <Text
                  className={text.label}
                  style={{ color: palette.inkMuted, flex: 1, minWidth: 0, paddingLeft: 16 }}
                  numberOfLines={1}
                >
                  {rule.code}
                </Text>
                <Text className={text.body} style={{ color: palette.ink, width: COLS.rule }} numberOfLines={1}>
                  {rule.rule}
                </Text>
                <Text
                  className={text.data}
                  style={[tabular, { color: palette.inkMuted, width: COLS.reference, textAlign: 'right' }]}
                  numberOfLines={1}
                >
                  {rule.reference}
                </Text>
                <Text
                  className={over ? text.bodyStrong : text.data}
                  style={[tabular, { color: over ? tones.text : palette.ink, width: COLS.observed, textAlign: 'right' }]}
                  numberOfLines={1}
                >
                  {rule.observed}
                </Text>
                <ExceedanceBar ratio={rule.ratio} severity={cluster.severity} />
                <View style={{ width: COLS.caret }} />
              </View>
            );
          })}

          <View
            className="flex-row items-start gap-3.5 px-6 pb-4 pt-3"
            style={{ borderTopWidth: 1, borderTopColor: tones.edge }}
          >
            <View style={{ width: COLS.dot }} />
            <Text
              className={text.body}
              style={{ color: palette.inkMuted, flex: 1, minWidth: 0, paddingLeft: 16, maxWidth: 720 }}
            >
              {cluster.note}
            </Text>
            {cluster.part ? (
              <Pressable
                onPress={() => onOpenPart(cluster.part as MachinePart)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${cluster.part} in Advance Diagnosis`}
                className="flex-row items-center gap-1.5"
              >
                <Text className={text.body} style={{ color: tones.text }}>
                  Open {cluster.part}
                </Text>
                <MaterialCommunityIcons name="arrow-right" size={13} color={tones.text} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * A filter, carried by an underline in its own severity hue.
 *
 * Pressing the active one clears it. A filter that traps you is a filter you
 * have to find the exit from.
 */
function FilterButton({
  label,
  count,
  tone,
  active,
  onPress,
}: {
  label: string;
  count: number;
  tone: string;
  active: boolean;
  onPress: () => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [hover, setHover] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count}`}
      className="flex-row items-center gap-1.5 pb-1"
      style={{
        borderBottomWidth: active ? 1.5 : 1,
        borderBottomColor: active ? tone : hover ? palette.lineStrong : 'transparent',
        opacity: count === 0 && !active ? 0.5 : 1,
      }}
    >
      <Text className={text.label} style={{ color: active ? tone : palette.inkMuted }}>
        {label}
      </Text>
      <Text className={text.label} style={[tabular, { color: active ? tone : palette.inkFaint }]}>
        {count}
      </Text>
    </Pressable>
  );
}

export function FindingsCard({
  clusters,
  filter,
  onFilter,
  onOpenPart,
}: {
  clusters: FindingCluster[];
  /**
   * Controlled, because the severity mix on the status card above is the same
   * filter drawn as a bar. Two controls over one list have to be one state or
   * the graphic and the rows stop agreeing.
   */
  filter: FindingFilter;
  onFilter: (filter: FindingFilter) => void;
  onOpenPart: (part: MachinePart) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ramp = severityRamp(isDark);

  const setFilter = onFilter;
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const visible = useMemo(
    () => clusters.filter((cluster) => filter === 'all' || cluster.severity === filter),
    [clusters, filter],
  );

  // Scope-aware: expand-all opens what the current filter shows, not the whole
  // dataset. Expanding rows a filter is hiding is a change you cannot see.
  const visibleIds = visible.map((cluster) => cluster.id);
  const allOpen = visibleIds.length > 0 && visibleIds.every((id) => open[id]);

  const present = SEVERITY_ORDER.filter((severity) => countBySeverity(clusters, severity) > 0);

  return (
    <View>
      {/* Toolbar */}
      <View className="px-6 pb-3 pt-5">
        <View className="flex-row flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <View className="min-w-0">
            <Text className={text.title} style={{ color: palette.ink }}>
              What raised it
            </Text>
            <Text className={cn('mt-1', text.body)} style={{ color: palette.inkMuted }}>
              Grouped by signal — one signal can trip several rules.
            </Text>
          </View>

          <View className="flex-row flex-wrap items-end gap-x-4 gap-y-2">
            <FilterButton
              label="All"
              count={countRules(clusters)}
              tone={palette.ink}
              active={filter === 'all'}
              onPress={() => setFilter('all')}
            />
            {present.map((severity) => (
              <FilterButton
                key={severity}
                label={SEVERITY_SHORT[severity]}
                count={countBySeverity(clusters, severity)}
                tone={ramp[severity].dot}
                active={filter === severity}
                onPress={() => setFilter(filter === severity ? 'all' : severity)}
              />
            ))}

            <View style={{ width: 1, height: 15, backgroundColor: palette.line, marginBottom: 4 }} />

            <Pressable
              onPress={() =>
                setOpen(allOpen ? {} : Object.fromEntries(visibleIds.map((id) => [id, true])))
              }
              accessibilityRole="button"
              className="pb-1"
              style={{ borderBottomWidth: 1, borderBottomColor: palette.line }}
            >
              <Text className={text.label} style={{ color: palette.inkMuted }}>
                {allOpen ? 'Collapse all' : 'Expand all'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {visible.length === 0 ? (
        <View className="items-center px-6 pb-16 pt-14" style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
          <Text className={text.title} style={{ color: palette.inkMuted }}>
            {clusters.length === 0 ? 'Nothing is raised on this machine' : 'Nothing raised at this severity'}
          </Text>
          <Text className={cn('mt-1.5', text.body)} style={{ color: palette.inkFaint }}>
            {clusters.length === 0
              ? 'No fault signature, hard limit or registered reference is currently exceeded.'
              : `Clear the filter to see the ${countRules(clusters)} findings on this machine.`}
          </Text>
          {clusters.length > 0 ? (
            <Pressable onPress={() => setFilter('all')} accessibilityRole="button" className="mt-4">
              <Text className={text.body} style={{ color: ramp.advisory.text }}>
                Show all
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          <View style={{ borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 10 }}>
            <ColumnHeader />
          </View>

          {SEVERITY_ORDER.map((severity) => {
            const items = visible.filter((cluster) => cluster.severity === severity);
            if (items.length === 0) return null;
            const tones = ramp[severity];

            return (
              <View key={severity}>
                {/* The section band. Its fill is the severity's own `head`
                    tone, which is the only place a band colour appears — so a
                    band always means "everything below is this kind". */}
                <View
                  className="flex-row items-center gap-2.5 px-6 py-2.5"
                  style={{
                    backgroundColor: tones.head,
                    borderTopWidth: 1,
                    borderTopColor: tones.edge,
                    borderBottomWidth: 1,
                    borderBottomColor: tones.edge,
                  }}
                >
                  <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: tones.dot }} />
                  <Text className={text.label} style={{ color: tones.text }}>
                    {SEVERITY_LABEL[severity]}
                  </Text>
                  <Text className={text.label} style={[tabular, { color: palette.inkMuted }]}>
                    {countRules(items)}
                  </Text>
                  <Text className={text.body} style={{ color: palette.inkMuted }}>
                    {SEVERITY_HINT[severity]}
                  </Text>
                </View>

                {items.map((cluster) => (
                  <ClusterRow
                    key={cluster.id}
                    cluster={cluster}
                    open={Boolean(open[cluster.id])}
                    onToggle={() => setOpen((current) => ({ ...current, [cluster.id]: !current[cluster.id] }))}
                    onOpenPart={onOpenPart}
                  />
                ))}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}
