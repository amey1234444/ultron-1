/**
 * The analysis layer's one anchor.
 *
 * This replaces two things that used to stack on top of each other: an identity
 * band naming the diagnostic model, and a row of four tiles counting the
 * machine's state. Between them they spent about 200px of the top of the screen
 * saying the machine's status twice — once as a tinted tile reading "Warning",
 * once as a sentence on the screen below — before any actual finding appeared.
 *
 * There is one object here instead, and it answers the three questions a reader
 * has on arrival, in the order they have them:
 *
 *   1. How is this machine?        the status word, at display size
 *   2. Why do you say that?        one sentence, the model's own conclusion
 *   3. What is it counting?        three metrics, on the rule below
 *
 * Everything else that used to be up here — recipe, tag counts, gateway counts,
 * session age, model version — was provenance, and provenance belongs beside
 * the numbers it qualifies. It is on the Signal screen's footer.
 *
 * The three metrics are pressable. A count that cannot be opened is a number a
 * reader has to go and find the meaning of somewhere else; pressing "2
 * warnings" should show the two warnings, so it does. That is also what earns
 * the hover: the cell warms and grows an arrow because there is somewhere to
 * go, not as decoration.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { alpha, Button, consolePalette, displayWeight, tabular, text, variantStyle, type Variant } from '../../../ui';
import { TagTrend } from './AnalyzerParts';

export type StatusCount = {
  key: string;
  label: string;
  /** The number, already formatted. */
  value: string;
  detail: string;
  variant: Variant;
  /** Recent samples, when the number has a history worth a sparkline. */
  history?: (number | null)[];
  /** Where pressing the cell takes the reader. Omitted when there is nowhere. */
  onPress?: () => void;
};

/**
 * One metric on the band's lower rule.
 *
 * Its own hover state rather than a shared surface: inside a card, a cell that
 * lifts off the page reads as a card sitting on another card. A cell warms
 * instead — the tint fades in behind it and the arrow arrives — which says
 * "this is live and it goes somewhere" without breaking the plane.
 */
function MetricCell({
  count,
  divided,
}: {
  count: StatusCount;
  /** Draws the hairline that separates it from the cell before it. */
  divided: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, count.variant);
  const hover = useRef(new Animated.Value(0)).current;
  const [active, setActive] = useState(false);

  const to = (value: number) => {
    setActive(value > 0);
    Animated.timing(hover, {
      toValue: value,
      duration: value === 0 ? 220 : 150,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: false,
    }).start();
  };

  return (
    <Pressable
      onPress={count.onPress}
      accessibilityRole={count.onPress ? 'button' : undefined}
      accessibilityLabel={count.onPress ? `${count.value} ${count.label}. ${count.detail}` : undefined}
      onHoverIn={() => count.onPress && to(1)}
      onHoverOut={() => to(0)}
      className="min-w-[148px] overflow-hidden px-5 py-3"
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
          backgroundColor: style.tint,
          opacity: hover.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }),
        }}
      />

      <View className="flex-row items-center gap-1.5">
        <View style={{ width: 5, height: 5, borderRadius: 6, backgroundColor: style.accent }} />
        <Text
          numberOfLines={1}
          className={cn('min-w-0 flex-1', text.label)}
          style={{ color: palette.inkFaint }}
        >
          {count.label}
        </Text>
        {count.onPress ? (
          <Animated.View style={{ opacity: hover }}>
            <MaterialCommunityIcons name="arrow-right" size={12} color={style.accent} />
          </Animated.View>
        ) : null}
      </View>

      <View className="mt-1.5 flex-row items-end justify-between gap-2">
        <Text
          numberOfLines={1}
          className={cn('min-w-0', text.dataLg)}
          style={[tabular, { color: style.accent }]}
        >
          {count.value}
        </Text>
        {count.history && count.history.length > 1 ? (
          <View className="pb-1" style={{ opacity: active ? 1 : 0.7 }}>
            <TagTrend values={count.history} colour={style.accent} width={64} height={22} />
          </View>
        ) : null}
      </View>

      <Text numberOfLines={1} className={cn('mt-1', text.body)} style={{ color: palette.inkMuted }}>
        {count.detail}
      </Text>
    </Pressable>
  );
}

export function StatusBand({
  statusWord,
  statusVariant,
  statusContext,
  verdictLine,
  sourceLabel,
  sourceVariant,
  scenarioLabel,
  scenarioActive,
  onToggleLibrary,
  onReturnToLive,
  counts,
  notice,
  wide,
}: {
  /** One word, readable across a control room. */
  statusWord: string;
  statusVariant: Variant;
  /** What the machine is doing — running, stopped. Qualifies the word, not the eye. */
  statusContext?: string;
  /** One sentence: the model's conclusion, in an operator's words. */
  verdictLine: string;
  sourceLabel: string;
  sourceVariant: Variant;
  /** Button label — the running scenario's id, or "Scenarios". */
  scenarioLabel: string;
  scenarioActive: boolean;
  onToggleLibrary: () => void;
  onReturnToLive: () => void;
  counts: StatusCount[];
  /**
   * The integrity layer's one standing caveat, when it has one.
   *
   * It closes this card rather than opening the page as a banner of its own,
   * because it qualifies the status directly above it — and because a
   * dismissible strip above the content pushed the whole screen down every time
   * the integrity layer had something to say.
   */
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
  const status = variantStyle(palette, statusVariant);
  const source = variantStyle(palette, sourceVariant);
  const noticeStyle = notice ? variantStyle(palette, notice.variant) : null;

  return (
    <View
      className="w-full overflow-hidden rounded-[14px] border"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      {/* The verdict. */}
      <View className="flex-row flex-wrap items-start justify-between gap-x-5 gap-y-3 px-5 pb-4 pt-4">
        <View className="min-w-[260px] flex-1 flex-row items-start gap-3.5">
          {/* No well, no border, no tint behind the glyph. A boxed icon beside
              a coloured word is the same state said twice in two decorations;
              the glyph alone is what carries the meaning into greyscale. */}
          <MaterialCommunityIcons name={status.icon} size={22} color={status.accent} style={{ marginTop: 12 }} />

          <View className="min-w-0 flex-1">
            <Text className={text.label} style={{ color: palette.inkFaint }}>
              Machine status{statusContext ? ` · ${statusContext}` : ''}
            </Text>
            {/* The one largest thing in the layer, and it is set light. A plant
                console that shouts on a normal day has nothing left for a bad
                one; the colour is doing the work, so the weight need not. */}
            <Text
              className={cn('mt-1', text.display)}
              style={[displayWeight, { color: status.accent }]}
              numberOfLines={1}
            >
              {statusWord}
            </Text>
            <Text className={cn('mt-1.5', text.lede)} style={{ color: palette.ink }}>
              {verdictLine}
            </Text>
          </View>
        </View>

        <View className="flex-row flex-wrap items-center gap-2">
          <View
            className="flex-row items-center gap-2 rounded-full border px-2.5 py-1.5"
            style={{ borderColor: alpha(source.accent, 0.32), backgroundColor: source.tint }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: source.accent }} />
            <Text className={text.label} style={{ color: source.accent }}>
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

      {/* What it is counting. */}
      {counts.length > 0 ? (
        <View
          className="flex-row flex-wrap"
          style={{ borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.panelRaised }}
        >
          {counts.map((count, index) => (
            <MetricCell key={count.key} count={count} divided={wide && index > 0} />
          ))}
        </View>
      ) : null}

      {notice && noticeStyle ? (
        <View
          className="flex-row flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
          style={{ backgroundColor: noticeStyle.tint, borderTopWidth: 1, borderTopColor: alpha(noticeStyle.accent, 0.22) }}
        >
          <View
            className="h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: alpha(noticeStyle.accent, 0.16) }}
          >
            <MaterialCommunityIcons name={noticeStyle.icon} size={15} color={noticeStyle.accent} />
          </View>
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
