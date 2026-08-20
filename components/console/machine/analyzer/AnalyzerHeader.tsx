/**
 * The analysis layer's identity band.
 *
 * One line: what diagnostic model is running, whether its readings are live,
 * and the control that swaps live data for a scenario. Plus the integrity
 * layer's standing caveat, when it has one.
 *
 * It used to carry a rail of machine/recipe/tag/gateway/session facts too. Every
 * one of those was stated somewhere else as well — the machine header names the
 * machine, the status tile carries its state, and the Signal screen's footer
 * carries the model, recipe, rule-set and tag provenance the numbers depend on.
 * A strip restating them under the title was chrome, not information.
 *
 * What it deliberately does NOT say is "Analysis layer". The machine header
 * above already names the machine, and the nav beside it already has ANALYSIS
 * lit — a third statement of the same thing was a heading spending 40px to
 * repeat the two things either side of it. The line carries the *diagnostic
 * model* instead, which is the one identity nothing else on screen states.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { alpha, Button, consolePalette, variantStyle, type Variant } from '../../../ui';

export function AnalyzerHeader({
  modelName,
  modelVersion,
  advisory = true,
  sourceLabel,
  sourceVariant,
  scenarioLabel,
  scenarioActive,
  onToggleLibrary,
  onReturnToLive,
  notice,
}: {
  /** The diagnostic model, not the machine template. */
  modelName: string;
  modelVersion: string;
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
   * It closes this card rather than opening the page as a banner of its own,
   * because it qualifies the facts directly above it — and because a dismissible
   * strip above the content pushed the whole screen down every time the
   * integrity layer had something to say.
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
  const source = variantStyle(palette, sourceVariant);
  const noticeStyle = notice ? variantStyle(palette, notice.variant) : null;

  return (
    <View
      className="w-full overflow-hidden rounded-2xl border"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      {/* Line 1 — what is running, and what changes it. */}
      <View className="flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 pb-2.5 pt-3">
        <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-2">
          <View
            className="h-6 w-6 items-center justify-center rounded-lg"
            style={{ backgroundColor: palette.accentSoft }}
          >
            <MaterialCommunityIcons name="stethoscope" size={13} color={palette.accent} />
          </View>
          <Text className="font-body-bold text-[14px] tracking-[-0.015em]" style={{ color: palette.ink }} numberOfLines={1}>
            {modelName}
          </Text>
          <View
            className="rounded-full border px-2 py-[2px]"
            style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
          >
            <Text className="font-mono text-[9px] tracking-[0.06em]" style={{ color: palette.inkMuted }} numberOfLines={1}>
              {modelVersion}
            </Text>
          </View>
          {advisory ? (
            <View
              className="flex-row items-center gap-1.5 rounded-full border px-2 py-[3px]"
              style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
            >
              <MaterialCommunityIcons name="hand-back-right-outline" size={10} color={palette.inkMuted} />
              <Text className="font-mono text-[9px] uppercase tracking-[0.16em]" style={{ color: palette.inkMuted }}>
                Advisory only
              </Text>
            </View>
          ) : null}
        </View>

        <View className="flex-row items-center gap-2">
          <View
            className="flex-row items-center gap-2 rounded-full border px-2.5 py-1.5"
            style={{ borderColor: alpha(source.accent, 0.32), backgroundColor: source.tint }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: source.accent }} />
            <Text className="font-mono text-[9.5px] uppercase tracking-[0.16em]" style={{ color: source.accent }}>
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
