/**
 * The live instrument readout.
 *
 * Every conclusion in this layer is read off these numbers, so they stay beside
 * the conclusion instead of a tab away. One row per resolved tag: identity,
 * what it measures, where it has been going, and what it reads now.
 *
 * It is deliberately NOT the Signal screen in miniature. Signal answers "is
 * this reading inside its limits" and carries limits, status, quality and the
 * acquisition chain to do it. This answers "what is the machine reading right
 * now", which is a glance, not a table — so it holds no limits and no status
 * column, and the two never print the same fact.
 *
 * The list scrolls inside itself rather than growing the rail, so a machine
 * with fourteen mapped instruments does not push the footer under the fold on a
 * 1366×768 laptop.
 */
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { alpha, consolePalette, variantStyle, type Variant } from '../../../ui';
import { TagTrend } from './AnalyzerParts';

export type InstrumentRow = {
  key: string;
  tag: string;
  /** The sentence a plant operator would use for this instrument. */
  name: string;
  value: number | null;
  unit: string;
  variant: Variant;
  /** Why the row is not green, in one or two words. Absent when it is fine. */
  flag?: string;
  history: (number | null)[];
};

function formatValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return Math.abs(value) >= 1000 ? value.toFixed(0) : Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(1);
}

export function InstrumentRail({
  rows,
  missing,
  goodCount,
  updatedLabel,
  onOpenSignals,
  maxHeight,
}: {
  rows: InstrumentRow[];
  /** Tags with no point mapped to them. Counted, never faked as a reading. */
  missing: number;
  goodCount: number;
  updatedLabel: string;
  onOpenSignals: () => void;
  maxHeight: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const total = rows.length;
  const share = total > 0 ? goodCount / total : 0;

  return (
    <View
      className="overflow-hidden rounded-2xl border"
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      <View className="flex-row items-center justify-between gap-3 px-4 pb-2.5 pt-3.5">
        <Text className="min-w-0 flex-1 font-body-bold text-[13.5px] tracking-[-0.015em]" style={{ color: palette.ink }}>
          Live instrument readout
        </Text>
        <View
          className="rounded-full border px-2 py-[3px]"
          style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
        >
          <Text className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: palette.inkMuted }}>
            {total} tag{total === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      {/* Data quality, as one bar. It is the qualifier on every number below it,
          so it reads before them rather than as a column beside each. */}
      <View className="flex-row items-center gap-2.5 px-4 pb-3">
        <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
          {goodCount}/{total} good
        </Text>
        <View className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: palette.panelRaised }}>
          <View
            style={{
              width: `${Math.round(share * 100)}%`,
              height: '100%',
              backgroundColor: share === 1 ? palette.accent : share >= 0.6 ? palette.warning : palette.critical,
            }}
          />
        </View>
      </View>

      <View style={{ height: 1, backgroundColor: palette.line }} />

      <ScrollView style={{ maxHeight }} showsVerticalScrollIndicator={false}>
        {rows.map((row, index) => {
          const style = variantStyle(palette, row.variant);
          const alert = row.variant !== 'success' && row.variant !== 'muted';
          return (
            <View
              key={row.key}
              className="flex-row items-center gap-2.5 px-4 py-2.5"
              style={{
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: palette.line,
                backgroundColor: alert ? alpha(style.accent, 0.05) : undefined,
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: style.accent }} />

              <View className="min-w-0 flex-1">
                <Text className="font-mono text-[11px]" style={{ color: palette.ink }} numberOfLines={1}>
                  {row.tag}
                </Text>
                <Text className="font-body text-[10.5px]" style={{ color: palette.inkMuted }} numberOfLines={1}>
                  {row.name}
                  {row.flag ? ` · ${row.flag}` : ''}
                </Text>
              </View>

              <TagTrend values={row.history} colour={style.accent} width={54} height={20} />

              <View className="items-end" style={{ width: 74 }}>
                <Text
                  className="font-body text-[15px] leading-[18px]"
                  style={{ color: palette.ink, fontWeight: '400', fontVariant: ['tabular-nums'] }}
                  numberOfLines={1}
                >
                  {formatValue(row.value)}
                </Text>
                <Text className="font-mono text-[8.5px] uppercase tracking-[0.12em]" style={{ color: palette.inkFaint }} numberOfLines={1}>
                  {row.unit}
                </Text>
              </View>
            </View>
          );
        })}

        {missing > 0 ? (
          <View className="px-4 py-2.5" style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
            <Text className="font-body text-[10.5px] leading-[15px]" style={{ color: palette.inkMuted }}>
              {missing} diagnostic tag{missing === 1 ? '' : 's'} have no point mapped to them. Nothing on this machine is
              measuring what they cover.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View
        className="flex-row items-center justify-between gap-3 px-4 py-2.5"
        style={{ borderTopWidth: 1, backgroundColor: palette.panelRaised, borderTopColor: palette.line }}
      >
        <View className="flex-row items-center gap-1.5">
          <View style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: palette.accent }} />
          <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkMuted }}>
            Updated {updatedLabel}
          </Text>
        </View>
        <Text
          onPress={onOpenSignals}
          accessibilityRole="button"
          accessibilityLabel="Open the Signal screen"
          className="font-mono text-[9px] uppercase tracking-[0.14em]"
          style={{ color: palette.accent }}
        >
          All signals →
        </Text>
      </View>
    </View>
  );
}
