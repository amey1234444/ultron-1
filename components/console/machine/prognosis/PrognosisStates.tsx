// The three screens the prognosis page shows when there is no forecast.
//
// They are kept distinct on purpose. "No degradation trend" and "not enough
// history" look identical to a component that renders an empty area, and they
// mean opposite things to an engineer: one says the machine is fine, the other
// says the console does not yet know. Collapsing them into one empty state is
// how a monitoring system quietly reports missing data as good news.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import type { PrognosisState } from '../analysis/prognosisViewModel';
import { alpha, consolePalette, radius, text, type IconName } from '../../../ui';

const FACE: Record<Exclude<PrognosisState, 'ready'>, { icon: IconName; eyebrow: string; tone: 'accent' | 'neutral' | 'critical' }> = {
  healthy: { icon: 'check-circle-outline', eyebrow: 'NO ACTIVE DEGRADATION PROJECTION', tone: 'accent' },
  insufficient: { icon: 'database-clock-outline', eyebrow: 'INSUFFICIENT HISTORY', tone: 'neutral' },
  unavailable: { icon: 'alert-circle-outline', eyebrow: 'PROGNOSIS DATA UNAVAILABLE', tone: 'critical' },
};

export function PrognosisStatePanel({
  state,
  headline,
  summary,
  footnote,
}: {
  state: Exclude<PrognosisState, 'ready'>;
  headline: string;
  summary: string;
  footnote?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const face = FACE[state];
  const colour = face.tone === 'accent' ? palette.accent : face.tone === 'critical' ? palette.critical : palette.neutral;

  return (
    <View
      className="items-center gap-3 border px-6 py-12"
      style={{ borderColor: palette.line, borderRadius: radius.md, backgroundColor: palette.panel }}
    >
      <View
        className="items-center justify-center"
        style={{ width: 38, height: 38, borderRadius: radius.sm, backgroundColor: alpha(colour, 0.12), borderWidth: 1, borderColor: alpha(colour, 0.26) }}
      >
        <MaterialCommunityIcons name={face.icon} size={19} color={colour} />
      </View>
      <Text className={text.label} style={{ color: colour }}>
        {face.eyebrow}
      </Text>
      <Text className="font-body-bold text-[17px] leading-[22px] tracking-[-0.02em]" style={{ color: palette.ink }}>
        {headline}
      </Text>
      <Text className={cn('max-w-[560px] text-center', text.body)} style={{ color: palette.inkMuted }}>
        {summary}
      </Text>
      {footnote ? (
        <Text className={text.micro} style={{ color: palette.inkFaint }}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The loading face.
 *
 * Blocks in the shape of the real page rather than a spinner in the middle, so
 * nothing jumps when the data lands.
 */
export function PrognosisLoadingState() {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const block = (height: number, key: string) => (
    <View key={key} style={{ height, borderRadius: radius.md, backgroundColor: palette.panelRaised, borderWidth: 1, borderColor: palette.line }} />
  );

  return (
    <View className="gap-4" accessibilityLabel="Loading prognosis">
      {block(128, 'hero')}
      {block(76, 'facts')}
      {block(340, 'chart')}
      <View className="flex-row flex-wrap" style={{ gap: 12 }}>
        {[0, 1, 2].map((index) => (
          <View key={index} style={{ flexGrow: 1, flexBasis: 300, minWidth: 260 }}>
            {block(180, `panel-${index}`)}
          </View>
        ))}
      </View>
    </View>
  );
}
