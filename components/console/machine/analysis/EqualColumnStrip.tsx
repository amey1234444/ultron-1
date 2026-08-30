// The ruled reading strip used across the analysis layer.
//
// Every strip on these screens had the same defect: cells were sized from their
// own content, so a long label like GEARBOX VIBRATION AT IN claimed more width
// than B ZONE 2 TEMP and the dividers landed wherever the text happened to
// stop. Six readings that are peers were drawn as six different sizes, and the
// eye reads that as meaning something it does not mean.
//
// The width is therefore taken away from the content entirely. Cells are
// chunked into explicit rows and every cell in a row is `flex: 1` over
// `flexBasis: 0` — the one layout in this engine that divides a row into parts
// that are mathematically identical, because a zero basis means there is no
// content-derived width left for flex to distribute proportionally to.
//
// A percentage width was tried first and is not equivalent: it leaves the last
// cell of a short row stretched and a band of dead space at the end of the
// strip, which is exactly the artefact this component exists to remove.
import { Children, useMemo, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { Hoverable, consolePalette, radius } from '../../../ui';

/**
 * Equal-width CARD columns — the card equivalent of the strip below.
 *
 * `flexBasis: 300, flexGrow: 1` on a wrapping row, which is what these grids
 * used, sizes each card partly from the space left over after its neighbours,
 * so three cards that are meant to be read side by side came out at three
 * widths and dropped a card onto its own row at awkward widths. Rows are
 * chunked explicitly here and every card is `flex: 1` over a zero basis.
 *
 * A final short row stretches to fill by default, which is what a summary card
 * closing a 2-column grid should do. Pass `padLastRow` when the cells are peers
 * that must keep their column width instead.
 */
export function EqualCardRow({
  children,
  columns = 3,
  minColumnWidth = 260,
  gap = 12,
  padLastRow = false,
}: {
  children: ReactNode;
  columns?: number;
  minColumnWidth?: number;
  gap?: number;
  padLastRow?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const items = Children.toArray(children).filter(Boolean);

  const activeColumns = useMemo(() => {
    if (items.length === 0) return 1;
    const ceiling = Math.min(columns, items.length);
    if (width === 0) return ceiling;
    return Math.min(ceiling, Math.max(1, Math.floor(width / minColumnWidth)));
  }, [items.length, columns, width, minColumnWidth]);

  const rows = useMemo(() => {
    const chunked: ReactNode[][] = [];
    for (let index = 0; index < items.length; index += activeColumns) {
      chunked.push(items.slice(index, index + activeColumns));
    }
    return chunked;
  }, [items, activeColumns]);

  if (items.length === 0) return null;

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (Math.abs(current - next) < 1 ? current : next));
  };

  return (
    <View onLayout={onLayout} style={{ gap }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row items-stretch" style={{ gap }}>
          {/* The wrapper is a ROW, not the default column. These cards set their
              own `flexBasis`/`flexGrow` for the wrapping layout they used to
              live in, and on a column parent that basis would size their HEIGHT
              and collapse them. As a row it means what the card intended, and
              the card fills the equal share this wrapper was given. */}
          {row.map((child, index) => (
            <View key={index} className="flex-row" style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
              {child}
            </View>
          ))}
          {padLastRow && row.length < activeColumns
            ? Array.from({ length: activeColumns - row.length }, (_, filler) => (
                <View key={`filler-${filler}`} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

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

  const rows = useMemo(() => {
    const chunked: StripCell[][] = [];
    for (let index = 0; index < cells.length; index += columns) {
      chunked.push(cells.slice(index, index + columns));
    }
    return chunked;
  }, [cells, columns]);

  if (cells.length === 0) return null;

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
      {rows.map((row, rowIndex) => (
        <View key={row[0]?.key ?? rowIndex} className="flex-row">
          {row.map((cell, index) => (
            <Hoverable
              key={cell.key}
              className="gap-1 px-3.5 py-3"
              style={({ hovered }) => ({
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: 0,
                minWidth: 0,
                position: 'relative',
                backgroundColor: hovered ? palette.hoverSurface : undefined,
              })}
            >
              {cell.node}
              {index < row.length - 1 ? (
                // Inset, so the rule reads as a separator between two readings
                // rather than as a continuation of the frame it sits inside.
                <View
                  pointerEvents="none"
                  style={{ position: 'absolute', right: 0, top: 10, bottom: 10, width: 1, backgroundColor: palette.line }}
                />
              ) : null}
            </Hoverable>
          ))}

          {/* A short final row must not stretch its cells to fill the gap, or
              the last reading in the strip is drawn twice the width of its
              peers. Empty cells of the same flex hold the grid open instead. */}
          {row.length < columns
            ? Array.from({ length: columns - row.length }, (_, filler) => (
                <View key={`filler-${filler}`} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}
