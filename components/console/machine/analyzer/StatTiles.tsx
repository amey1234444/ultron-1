/**
 * The machine's condition, as four numbers.
 *
 * These sit above the tab bar rather than inside the Diagnosis screen: they
 * answer "how is this machine" and that question does not change when the
 * reader moves to Advance Diagnosis or Signal. Keeping them at shell level is
 * also what lets each screen below start with its own subject instead of
 * re-stating the machine's status first.
 *
 * The status tile carries a tint; the three counts do not. Four tinted cards in
 * a row is a traffic light with nothing to say — the tint has to mean "this one
 * is the state of the machine".
 */
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { alpha, consolePalette, variantStyle, type Variant } from '../../../ui';
import { TagTrend } from './AnalyzerParts';

export type StatTile = {
  key: string;
  label: string;
  /** The number, or the status word. */
  value: string;
  detail: string;
  variant: Variant;
  /** Fills the card rather than only the dot. Reserved for the status tile. */
  filled?: boolean;
  /** Recent samples for the tile's own sparkline, when the number has a history. */
  history?: (number | null)[];
  /** A short qualifier pill on the right, e.g. the layer that owns the answer. */
  note?: string;
};

export function StatTiles({ tiles, wide }: { tiles: StatTile[]; wide: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View className="flex-row flex-wrap" style={{ gap: 12 }}>
      {tiles.map((tile) => {
        const style = variantStyle(palette, tile.variant);
        const filled = Boolean(tile.filled);
        return (
          <View
            key={tile.key}
            className="justify-between rounded-2xl border px-4 py-3.5"
            style={{
              flexGrow: 1,
              flexBasis: wide ? 0 : '46%',
              minWidth: wide ? 190 : 150,
              backgroundColor: filled ? style.tint : palette.panel,
              borderColor: filled ? alpha(style.accent, 0.28) : palette.line,
            }}
          >
            <View className="flex-row items-center gap-1.5">
              <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: style.accent }} />
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 font-mono text-[8.5px] uppercase tracking-[0.18em]"
                style={{ color: filled ? style.accent : palette.inkFaint }}
              >
                {tile.label}
              </Text>
            </View>

            <View className="mt-2 flex-row items-end justify-between gap-2">
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 font-body text-[30px] leading-[34px] tracking-[-0.03em]"
                style={{
                  color: filled ? style.accent : tile.variant === 'muted' ? palette.ink : style.accent,
                  fontWeight: '300',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {tile.value}
              </Text>

              {tile.note ? (
                <View
                  className="rounded-full border px-2 py-[3px]"
                  style={{ borderColor: alpha(style.accent, 0.3), backgroundColor: style.tint }}
                >
                  <Text className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: style.accent }}>
                    {tile.note}
                  </Text>
                </View>
              ) : tile.history && tile.history.length > 1 ? (
                <View className="pb-1">
                  <TagTrend values={tile.history} colour={style.accent} width={72} height={24} />
                </View>
              ) : null}
            </View>

            <Text numberOfLines={1} className="mt-1.5 font-body text-[11px]" style={{ color: palette.inkMuted }}>
              {tile.detail}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
