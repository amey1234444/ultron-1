import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';

// The three analysis depths, as one control.
//
// They are depths, not categories: Overview answers "is the machine okay",
// Diagnosis answers "why, and what should I do", Advanced Diagnosis is where an
// analyst reads spectra. Naming them in one row makes the progression visible, so
// a reader knows there is somewhere deeper to go and roughly what is down there.
export type AnalysisDepth = 'overview' | 'diagnosis' | 'advanced';

const TABS: Array<{ key: AnalysisDepth; label: string; hint: string }> = [
  { key: 'overview', label: 'DIAGNOSIS', hint: 'Is the machine okay' },
  { key: 'diagnosis', label: 'PROGNOSIS', hint: 'Stable outlook and forecasts' },
  { key: 'advanced', label: 'ADVANCED DIAGNOSIS', hint: 'Signal-level evidence' },
];

export function AnalysisTabs({
  active,
  onSelect,
  // Depths the host cannot navigate to yet render as unavailable rather than
  // being hidden — a reader should know the depth exists.
  available,
  trailing,
}: {
  active: AnalysisDepth;
  onSelect?: (depth: AnalysisDepth) => void;
  available?: Partial<Record<AnalysisDepth, boolean>>;
  // Room for a link out of the analysis layer entirely. Kept in this row rather
  // than in a third header strip: the page already carries a title row and a depth
  // row, and a separate nav bar for one button is how headers start competing.
  trailing?: ReactNode;
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const enabled = available?.[tab.key] !== false;

        return (
          <Pressable
            key={tab.key}
            onPress={enabled && !isActive ? () => onSelect?.(tab.key) : undefined}
            disabled={!enabled || isActive}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive, disabled: !enabled }}
            accessibilityLabel={`${tab.label}: ${tab.hint}`}
            className={cn(
              'gap-0.5 rounded-lg border px-3.5 py-2',
              isActive ? 'border-accent/50 bg-accent/10' : lineClass,
              !enabled && 'opacity-45',
            )}
          >
            <Text className={cn('font-mono text-[11.5px] font-bold tracking-wider', isActive ? 'text-accent' : mutedClass)}>
              {tab.label}
            </Text>
            <Text className={cn('font-body text-[10.5px]', mutedClass)}>{enabled ? tab.hint : 'not available yet'}</Text>
          </Pressable>
        );
      })}

      {trailing ? (
        <>
          <View className="flex-1" />
          {trailing}
        </>
      ) : null}
    </View>
  );
}
