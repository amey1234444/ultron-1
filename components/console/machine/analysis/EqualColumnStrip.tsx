// The ruled reading strip used across the analysis layer.
//
// Every strip on these screens had the same defect: cells were sized from their
// own content (`flexGrow: 1` over a `flexBasis` the text could outvote), so a
// long label like GEARBOX VIBRATION AT IN claimed more width than B ZONE 2 TEMP
// and the dividers landed wherever the text happened to stop. Six readings that
// are peers were drawn as six different sizes, and the eye reads that as
// meaning something it does not mean.
//
// So the width is taken away from the content. The column count is decided from
// the measured width of the strip, every cell is given exactly `100 / columns`
// percent, and nothing inside a cell can change that. The rule sits on the
// boundary between two equal columns because that is the only place it can be.
import { useMemo, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { Hoverable, consolePalette, radius } from '../../../ui';

export type StripCell = {
  key: string;
  node: ReactNode;
};

export function EqualColumnStrip({
  cells,
  minColumnWidth = 150,
  cornerRadius = radius.sm,
}: {
  cells: StripCell[];
  /**
   * The narrowest a column may get before the strip drops to fewer columns.
   * Not a width — only the divisor that picks the column count.
   */
  minColumnWidth?: number;
  cornerRadius?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [width, setWidth] = useState(0);

  // Before the first layout pass the width is unknown. Laying every cell out on
  // one row is the right guess on the desktop this is designed for, and it
  // corrects on the same frame rather than flashing a stacked column.
  const columns = useMemo(() => {
    if (cells.length === 0) return 1;
    if (width === 0) return cells.length;
    return Math.min(cells.length, Math.max(1, Math.floor(width / minColumnWidth)));
  }, [cells.length, width, minColumnWidth]);

  if (cells.length === 0) return null;

  const columnWidth = `${100 / columns}%` as const;

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - next) < 1 ? current : next));
  };

  return (
    <View
      onLayout={onLayout}
      className="overflow-hidden border"
      style={{ borderColor: palette.line, borderRadius: cornerRadius, backgroundColor: palette.panelRaised }}
    >
      <View className="flex-row flex-wrap">
        {cells.map((cell, index) => {
          // A rule belongs between two cells, never before the first, after the
          // last, or hanging off the end of a wrapped row against the frame.
          const endOfRow = (index + 1) % columns === 0;
          const last = index === cells.length - 1;
          const divided = !endOfRow && !last;

          return (
            <Hoverable
              key={cell.key}
              className="gap-1 px-3.5 py-3"
              style={({ hovered }) => ({
                flexBasis: columnWidth,
                width: columnWidth,
                maxWidth: columnWidth,
                flexGrow: 0,
                flexShrink: 0,
                minWidth: 0,
                position: 'relative',
                backgroundColor: hovered ? palette.hoverSurface : undefined,
              })}
            >
              {cell.node}
              {divided ? (
                // Inset, so the rule reads as a separator between two readings
                // rather than as a continuation of the frame it sits inside.
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 10,
                    bottom: 10,
                    width: 1,
                    backgroundColor: palette.line,
                  }}
                />
              ) : null}
            </Hoverable>
          );
        })}
      </View>
    </View>
  );
}
