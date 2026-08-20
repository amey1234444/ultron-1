/**
 * The analysis layer's fact bar.
 *
 * One band, directly under the machine's own header, carrying the conditions
 * every number on the screen is valid under: which model is running, against
 * which recipe, in which machine state, off how many resolved tags, from where,
 * and for how long. A reader who has scrolled past "scenario injection" would
 * be reading fabricated measurements as if they were the plant, so this never
 * scrolls away with the content — it is the first thing under the title and it
 * is stated exactly once in the whole layer.
 *
 * The band used to carry a second "Analysis layer" title of its own. The
 * machine header immediately above already names the machine and the screen, so
 * that line was a duplicate heading and a wasted 44px; the advisory badge that
 * mattered moved into this row instead.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { alpha, Badge, Button, consolePalette, variantStyle, type Variant } from '../../../ui';

export type HeaderFact = { label: string; value: string; variant?: Variant };

/** A label above its value, in the fact bar's one type pairing. */
function Fact({ fact }: { fact: HeaderFact }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent = fact.variant ? variantStyle(palette, fact.variant).accent : palette.ink;

  return (
    <View className="min-w-0" style={{ maxWidth: 300 }}>
      <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
        {fact.label}
      </Text>
      <Text
        className="mt-1 font-mono text-[11.5px]"
        style={{ color: accent, fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
      >
        {fact.value}
      </Text>
    </View>
  );
}

export function AnalyzerHeader({
  facts,
  session,
  advisory = true,
  sourceLabel,
  sourceVariant,
  scenarioLabel,
  scenarioActive,
  onToggleLibrary,
  onReturnToLive,
  notice,
}: {
  facts: HeaderFact[];
  /** Elapsed analysis session, e.g. "3 h 12 m · since 11:28". */
  session: string;
  advisory?: boolean;
  sourceLabel: string;
  sourceVariant: Variant;
  /** Button label — the running scenario's id, or "Scenarios". */
  scenarioLabel: string;
  scenarioActive: boolean;
  onToggleLibrary: () => void;
  onReturnToLive: () => void;
  /**
   * The one standing caveat about the reading, when there is one.
   *
   * It lives inside this card rather than as a banner of its own because it
   * qualifies the facts beside it, and because a dismissible strip stacked
   * above the content pushed the whole screen down every time the integrity
   * layer had something to say.
   */
  notice?: {
    title: string;
    detail: string;
    variant: Variant;
    actionLabel?: string;
    onAction?: () => void;
    onDismiss: () => void;
  } | null;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const noticeStyle = notice ? variantStyle(palette, notice.variant) : null;

  return (
    <View
      className="overflow-hidden rounded-2xl border"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      <View className="flex-row flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-3">
        <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-x-8 gap-y-3">
          {advisory ? (
            <Badge variant="muted" icon="hand-back-right-outline">
              Advisory only
            </Badge>
          ) : null}
          {facts.map((fact) => (
            <Fact key={fact.label} fact={fact} />
          ))}
        </View>

        <View className="flex-row items-center gap-2">
          <Fact fact={{ label: 'Session', value: session }} />
          <View
            className="flex-row items-center gap-2 rounded-full border px-2.5 py-1.5"
            style={{
              borderColor: alpha(variantStyle(palette, sourceVariant).accent, 0.32),
              backgroundColor: variantStyle(palette, sourceVariant).tint,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 6,
                backgroundColor: variantStyle(palette, sourceVariant).accent,
              }}
            />
            <Text
              className="font-mono text-[9.5px] uppercase tracking-[0.16em]"
              style={{ color: variantStyle(palette, sourceVariant).accent }}
            >
              {sourceLabel}
            </Text>
          </View>
          <Button
            tone={scenarioActive ? 'warning' : 'primary'}
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

      {notice && noticeStyle ? (
        <View
          className="flex-row flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
          style={{ backgroundColor: noticeStyle.tint, borderTopWidth: 1, borderTopColor: alpha(noticeStyle.accent, 0.22) }}
        >
          <View
            className="h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: alpha(noticeStyle.accent, 0.16) }}
          >
            <MaterialCommunityIcons name={noticeStyle.icon} size={15} color={noticeStyle.accent} />
          </View>
          <View className="min-w-[240px] flex-1">
            <Text className="font-body-bold text-[12.5px]" style={{ color: palette.ink }}>
              {notice.title}
            </Text>
            <Text className="mt-0.5 font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
              {notice.detail}
            </Text>
          </View>
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
      ) : null}
    </View>
  );
}
