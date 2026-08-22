/**
 * The analysis layer's status card.
 *
 * Ported from the Analysis Layer · Depth reference, which rebuilds this as a
 * hero rather than as a strip of tiles. Three things changed in the port and
 * each one is doing work:
 *
 *  - **An accent gradient closes the top edge.** It runs from the severity's
 *    saturated dot out to the canvas, so the card announces its state before a
 *    single word is read, and it does it in 3px rather than by tinting a whole
 *    panel.
 *
 *  - **The status word is set at display size in the severity's text tone**,
 *    with the sentence under it at reading size. The old band gave the word
 *    and the sentence nearly the same weight, which meant neither led.
 *
 *  - **A severity mix sits beside it, and the mix is also the filter.** The
 *    bar is proportional to what the findings list holds, so the shape of the
 *    problem is visible before scrolling, and pressing a segment scopes the
 *    list below. A graphic that is also a control earns its space twice.
 *
 * The four counters underneath are machine-wide and say so; the mix is scoped
 * to what is in view. Both derive from the same array, so they cannot disagree.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import {
  severityRamp,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  type Severity,
} from '../../../../lib/severity';
import { alpha, Button, consolePalette, displayWeight, tabular, text, type Variant } from '../../../ui';

export type StatusCount = {
  key: string;
  /** What is being counted. */
  label: string;
  value: string;
  /** The claim the number makes, in one clause. */
  detail: string;
  /** Which ramp the number wears. */
  severity: Severity;
  /** Scope note — "this machine", "none this session". */
  scope: string;
  onPress?: () => void;
};

/** One severity's share of what the findings list currently holds. */
export type SeverityShare = { severity: Severity; count: number };

/**
 * One counter on the card's lower rule.
 *
 * Warms rather than lifts: inside a card, a cell that rises off the page reads
 * as a card sitting on another card. The arrow arrives only when there is
 * somewhere to go, which is what makes the hover a promise rather than decor.
 */
function Counter({ count, divided }: { count: StatusCount; divided: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const tones = severityRamp(isDark)[count.severity];
  const hover = useRef(new Animated.Value(0)).current;

  const to = (value: number) =>
    Animated.timing(hover, {
      toValue: value,
      duration: value === 0 ? 220 : 150,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: false,
    }).start();

  return (
    <Pressable
      onPress={count.onPress}
      accessibilityRole={count.onPress ? 'button' : undefined}
      accessibilityLabel={count.onPress ? `${count.value} ${count.label}. ${count.detail}` : undefined}
      onHoverIn={() => count.onPress && to(1)}
      onHoverOut={() => to(0)}
      className="min-w-[170px] overflow-hidden px-5 py-4"
      style={{
        flexGrow: 1,
        flexBasis: 0,
        borderLeftWidth: divided ? 1 : 0,
        borderLeftColor: palette.line,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: tones.head,
          opacity: hover,
        }}
      />

      <View className="flex-row items-center gap-2">
        <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: tones.dot }} />
        <Text numberOfLines={1} className={cn('min-w-0 flex-1', text.label)} style={{ color: palette.inkMuted }}>
          {count.label}
        </Text>
        {count.onPress ? (
          <Animated.View style={{ opacity: hover }}>
            <MaterialCommunityIcons name="arrow-right" size={12} color={tones.dot} />
          </Animated.View>
        ) : null}
      </View>

      <View className="mt-2.5 flex-row items-baseline gap-2.5">
        <Text numberOfLines={1} className={text.display} style={[tabular, { color: tones.text }]}>
          {count.value}
        </Text>
        {/* A qualifier on the figure, not the name of a field — so it is
            `meta`, sentence case, and stays out of the number's way. Set in
            `label` it read as a second heading competing with the first.
            Empty when there is nothing to scope: a zero followed by the word
            "none" is the same fact told twice. */}
        {count.scope ? (
          <Text numberOfLines={1} className={text.meta} style={{ color: palette.inkFaint }}>
            {count.scope}
          </Text>
        ) : null}
      </View>

      <Text numberOfLines={2} className={cn('mt-2', text.body)} style={{ color: palette.inkMuted }}>
        {count.detail}
      </Text>
    </Pressable>
  );
}

/**
 * The severity mix — a proportional bar plus its legend, both of them filters.
 *
 * Sunk into the card rather than drawn on it: an inset zone is how this design
 * separates a secondary panel from its host without spending another border.
 */
function SeverityMix({
  shares,
  filter,
  onFilter,
}: {
  shares: SeverityShare[];
  filter: Severity | 'all';
  onFilter: (severity: Severity | 'all') => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ramp = severityRamp(isDark);
  const present = shares.filter((share) => share.count > 0);
  const total = present.reduce((sum, share) => sum + share.count, 0);

  return (
    <View
      className="rounded-[10px] px-4 py-4"
      style={{ backgroundColor: palette.panelRaised, borderWidth: 1, borderColor: palette.line }}
    >
      <Text className={text.label} style={{ color: palette.inkMuted }}>
        Severity mix · in view
      </Text>

      <View
        className="mt-3 flex-row overflow-hidden"
        style={{ height: 8, borderRadius: 999, backgroundColor: palette.line }}
      >
        {present.map((share) => {
          const dimmed = filter !== 'all' && filter !== share.severity;
          return (
            <Pressable
              key={share.severity}
              onPress={() => onFilter(filter === share.severity ? 'all' : share.severity)}
              accessibilityRole="button"
              accessibilityLabel={`${SEVERITY_LABEL[share.severity]}, ${share.count}`}
              style={{
                flexGrow: share.count,
                flexBasis: 0,
                backgroundColor: ramp[share.severity].dot,
                opacity: dimmed ? 0.3 : 1,
              }}
            />
          );
        })}
      </View>

      <View className="mt-3">
        {present.map((share, index) => {
          const active = filter === share.severity;
          const dimmed = filter !== 'all' && !active;
          const tones = ramp[share.severity];
          return (
            <Pressable
              key={share.severity}
              onPress={() => onFilter(active ? 'all' : share.severity)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className="flex-row items-center gap-2.5 py-2"
              style={{
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: palette.line,
                paddingLeft: active ? 6 : 0,
                borderLeftWidth: active ? 2 : 0,
                borderLeftColor: tones.dot,
              }}
            >
              <View
                style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: tones.dot, opacity: dimmed ? 0.4 : 1 }}
              />
              <Text
                className={cn('min-w-0 flex-1', active ? text.bodyStrong : text.body)}
                style={{ color: active ? tones.text : palette.inkMuted }}
                numberOfLines={1}
              >
                {SEVERITY_LABEL[share.severity]}
              </Text>
              <Text className={text.data} style={[tabular, { color: active ? tones.text : palette.inkFaint }]}>
                {share.count}
              </Text>
            </Pressable>
          );
        })}
        {present.length === 0 ? (
          <Text className={cn('py-3', text.body)} style={{ color: palette.inkFaint }}>
            Nothing raised.
          </Text>
        ) : null}
      </View>

      {total > 0 ? (
        <Text className={cn('mt-2.5 pt-2.5', text.meta)} style={{ color: palette.inkFaint, borderTopWidth: 1, borderTopColor: palette.line }}>
          {total} rule{total === 1 ? '' : 's'} fired across {present.length} severit{present.length === 1 ? 'y' : 'ies'}
        </Text>
      ) : null}
    </View>
  );
}

export function StatusBand({
  statusWord,
  statusSeverity,
  statusContext,
  statusChip,
  verdictLine,
  sourceLabel,
  sourceVariant,
  scenarioLabel,
  scenarioActive,
  onToggleLibrary,
  onReturnToLive,
  counts,
  shares,
  filter,
  onFilter,
  notice,
  wide,
}: {
  /** One word, readable across a control room. */
  statusWord: string;
  /** Which ramp the whole card wears. */
  statusSeverity: Severity;
  /** What the machine is doing — running, stopped. */
  statusContext?: string;
  /** The leading hypothesis in three or four words, as a chip beside the word. */
  statusChip?: string;
  /** One sentence: the model's conclusion, in an operator's words. */
  verdictLine: string;
  sourceLabel: string;
  sourceVariant: Variant;
  scenarioLabel: string;
  scenarioActive: boolean;
  onToggleLibrary: () => void;
  onReturnToLive: () => void;
  counts: StatusCount[];
  shares: SeverityShare[];
  filter: Severity | 'all';
  onFilter: (severity: Severity | 'all') => void;
  notice?: {
    title: string;
    detail: string;
    variant: Variant;
    actionLabel?: string;
    onAction?: () => void;
    onDismiss: () => void;
  } | null;
  wide: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ramp = severityRamp(isDark);
  const tones = ramp[statusSeverity];
  const noticeTones = notice ? ramp[notice.variant === 'destructive' ? 'fault' : notice.variant === 'warning' ? 'limit' : 'advisory'] : null;

  return (
    <View
      className="w-full overflow-hidden rounded-[14px] border"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      {/* The accent. Saturated at the leading edge, gone by the far side — the
          card's state, stated in 3px before any word is read. */}
      <View className="w-full flex-row" style={{ height: 3 }}>
        <View style={{ flex: 1, backgroundColor: tones.dot }} />
        <View style={{ flex: 1, backgroundColor: tones.edge }} />
        <View style={{ flex: 1.4, backgroundColor: tones.head }} />
        <View style={{ flex: 2, backgroundColor: palette.line }} />
      </View>

      <View
        className={cn('gap-6 px-6 pb-6 pt-6', wide && 'flex-row items-start justify-between')}
      >
        <View className="min-w-0 flex-1" style={{ maxWidth: wide ? 720 : undefined }}>
          <Text className={text.label} style={{ color: palette.inkMuted }}>
            Machine status{statusContext ? ` · ${statusContext}` : ''} · advisory only
          </Text>

          <View className="mt-3 flex-row flex-wrap items-baseline gap-x-3.5 gap-y-2">
            <Text className={text.display} style={[displayWeight, { color: tones.text }]} numberOfLines={1}>
              {statusWord}
            </Text>
            {statusChip ? (
              <View
                className="flex-row items-center gap-2 rounded-[6px] px-2.5 py-1"
                style={{ backgroundColor: tones.head, borderWidth: 1, borderColor: tones.edge }}
              >
                <View style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: tones.dot }} />
                <Text className={text.chip} style={{ color: tones.text }}>
                  {statusChip}
                </Text>
              </View>
            ) : null}
          </View>

          <Text className={cn('mt-3.5', text.lede)} style={{ color: palette.inkMuted }}>
            {verdictLine}
          </Text>

          <View className="mt-5 flex-row flex-wrap items-center gap-2.5">
            <View
              className="flex-row items-center gap-2 rounded-full border px-2.5 py-1.5"
              style={{
                borderColor: sourceVariant === 'success' ? alpha(palette.accent, 0.32) : palette.line,
                backgroundColor: sourceVariant === 'success' ? alpha(palette.accent, 0.1) : palette.panelRaised,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 6,
                  backgroundColor: sourceVariant === 'success' ? palette.accent : palette.inkFaint,
                }}
              />
              <Text
                className={text.chip}
                style={{ color: sourceVariant === 'success' ? palette.accent : palette.inkMuted }}
              >
                {sourceLabel}
              </Text>
            </View>
            <Button
              tone={scenarioActive ? 'warning' : 'secondary'}
              icon="flask-outline"
              onPress={onToggleLibrary}
              accessibilityLabel="Open the fault scenario library"
            >
              {scenarioLabel}
            </Button>
            {scenarioActive ? (
              <Button tone="secondary" icon="broadcast" onPress={onReturnToLive} accessibilityLabel="Return to live data">
                Live data
              </Button>
            ) : null}
          </View>
        </View>

        <View style={{ width: wide ? 300 : undefined }}>
          <SeverityMix shares={shares} filter={filter} onFilter={onFilter} />
        </View>
      </View>

      {counts.length > 0 ? (
        <View
          className="flex-row flex-wrap"
          style={{ borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.panelRaised }}
        >
          {counts.map((count, index) => (
            <Counter key={count.key} count={count} divided={wide && index > 0} />
          ))}
        </View>
      ) : null}

      {notice && noticeTones ? (
        <View
          className="flex-row flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5"
          style={{ backgroundColor: noticeTones.head, borderTopWidth: 1, borderTopColor: noticeTones.edge }}
        >
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={noticeTones.dot} />
          <View className="min-w-[220px] flex-1">
            <Text className={text.bodyStrong} style={{ color: palette.ink }}>
              {notice.title}
            </Text>
            <Text className={cn('mt-0.5', text.body)} style={{ color: palette.inkMuted }}>
              {notice.detail}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            {notice.actionLabel && notice.onAction ? (
              <Button tone="secondary" onPress={notice.onAction} accessibilityLabel={notice.actionLabel}>
                {notice.actionLabel}
              </Button>
            ) : null}
            <Pressable
              onPress={notice.onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Dismiss this notice"
              hitSlop={8}
              className="h-7 w-7 items-center justify-center rounded-full"
            >
              <MaterialCommunityIcons name="close" size={15} color={palette.inkMuted} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export { SEVERITY_ORDER };
