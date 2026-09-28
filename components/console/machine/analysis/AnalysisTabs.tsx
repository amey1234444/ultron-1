import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import {
  ANALYSIS_SECTIONS,
  ANALYSIS_VIEWS,
  depthOf,
  sectionOf,
  viewOf,
  type AnalysisDepth,
  type AnalysisSection,
  type AnalysisView,
} from './analysisNav';

export { type AnalysisDepth, type AnalysisSection, type AnalysisView } from './analysisNav';

/**
 * Two rows, because the navigation has two axes.
 *
 * The section row asks which question is being answered; the depth row asks how
 * far into the answer to read. Flattening them into one row of four would make
 * "Prognosis · Advanced" look like a peer of "Diagnosis", and a reader would
 * have to learn the ordering to know that two of the four are the same question
 * at different depths.
 *
 * Switching section keeps the depth. An analyst reading the evidence behind a
 * diagnosis usually wants the evidence behind the forecast too, not a bounce
 * back out to its summary.
 */
export function AnalysisTabs({
  active,
  onSelect,
  available,
  counts,
  trailing,
}: {
  active: AnalysisDepth;
  onSelect?: (depth: AnalysisDepth) => void;
  /** Depths the host cannot open yet render as unavailable rather than vanishing. */
  available?: Partial<Record<AnalysisDepth, boolean>>;
  /**
   * How many things each section has to say, shown as a badge.
   *
   * A reader on the prognosis page could not tell whether the diagnosis page
   * had anything on it without opening it, which on a healthy machine is a
   * wasted trip and on a failing one is a missed one. Absent or zero renders
   * no badge: "nothing to report" is better said by the absence of a count
   * than by a nought.
   */
  counts?: Partial<Record<AnalysisSection, number>>;
  trailing?: ReactNode;
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  const section = sectionOf(active);
  const view = viewOf(active);
  const enabled = (depth: AnalysisDepth) => available?.[depth] !== false;

  const go = (next: AnalysisDepth) => {
    if (next !== active && enabled(next)) onSelect?.(next);
  };

  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap items-center gap-2">
        {ANALYSIS_SECTIONS.map((entry) => {
          // Keep the reader's depth when they change question, falling back to
          // the overview when that depth is not offered for the new section.
          const wanted = depthOf(entry.key, view);
          const target = enabled(wanted) ? wanted : depthOf(entry.key, 'overview');
          const isActive = entry.key === section;
          const usable = enabled(target);
          const count = counts?.[entry.key] ?? 0;

          return (
            <Pressable
              key={entry.key}
              onPress={usable && !isActive ? () => go(target) : undefined}
              disabled={!usable || isActive}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive, disabled: !usable }}
              accessibilityLabel={
                `${entry.label}: ${entry.hint}${count > 0 ? `, ${count} open` : ''}`
              }
              className={cn(
                'flex-row items-center gap-2.5 overflow-hidden rounded-lg border py-2 pr-3.5',
                isActive ? 'border-accent/50 bg-accent/10' : lineClass,
                !usable && 'opacity-45',
              )}
            >
              {/* A filled edge on the active card. The tint alone reads as a
                  hover state at a glance; an edge reads as "you are here". */}
              <View className={cn('h-full w-1 self-stretch', isActive ? 'bg-accent' : 'bg-transparent')} />
              <MaterialCommunityIcons
                name={entry.icon}
                size={16}
                color={isActive ? '#4F9D69' : isDark ? '#A1A3A0' : '#5F625F'}
              />
              <View className="gap-0.5">
                <View className="flex-row items-center gap-1.5">
                  <Text className={cn('font-mono text-[11.5px] font-bold tracking-wider', isActive ? 'text-accent' : mutedClass)}>
                    {entry.label}
                  </Text>
                  {usable && count > 0 ? (
                    <View className={cn('rounded-full px-1.5 py-px', isActive ? 'bg-accent/25' : isDark ? 'bg-surface-dark' : 'bg-surface-light')}>
                      <Text className={cn('font-mono text-[9.5px] font-bold', isActive ? 'text-accent' : mutedClass)}>{count}</Text>
                    </View>
                  ) : null}
                </View>
                <Text className={cn('font-body text-[10.5px]', mutedClass)}>{usable ? entry.hint : 'not available yet'}</Text>
              </View>
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

      {/* Depth row, scoped to the section above it. A segmented control rather
          than more cards: these are two readings of one thing, not two things. */}
      <View className={cn('flex-row self-start rounded-lg border p-0.5', lineClass)}>
        {ANALYSIS_VIEWS.map((entry) => {
          const target = depthOf(section, entry.key);
          const isActive = entry.key === view;
          const usable = enabled(target);

          return (
            <Pressable
              key={entry.key}
              onPress={usable && !isActive ? () => go(target) : undefined}
              disabled={!usable || isActive}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive, disabled: !usable }}
              accessibilityLabel={`${entry.label}: ${entry.hint[section]}`}
              className={cn('flex-row items-center gap-2 rounded-[6px] px-3 py-1.5', isActive && 'bg-accent/10', !usable && 'opacity-45')}
            >
              <Text className={cn('font-mono text-[11px] font-bold tracking-wide', isActive ? 'text-accent' : mutedClass)}>
                {entry.label}
              </Text>
              <Text className={cn('font-body text-[10.5px]', isActive ? inkClass : mutedClass)}>
                {usable ? entry.hint[section] : 'not available yet'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
