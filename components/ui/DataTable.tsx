import type React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { consolePalette } from './tokens';

export type Column<Row> = {
  key: string;
  header: string;
  /** Flex weight within the row. */
  width: number;
  /** Right-aligns and applies tabular figures — use for every numeric column. */
  numeric?: boolean;
  render: (row: Row) => React.ReactNode;
};

/**
 * DataTable — a compact tabular view.
 *
 * The Analysis layer needs real tables (thresholds crossed, resolved signals,
 * baseline provenance) rather than bullet lists: these are records with a fixed
 * set of fields, and a reader scans them by column.
 *
 * Numeric columns carry `tabular-nums` so digits align down the column, which is
 * exactly the case those figures exist for.
 *
 * On a narrow viewport the table scrolls horizontally at a fixed minimum width
 * instead of collapsing columns into an unreadable wrap.
 */
export function DataTable<Row>({
  columns,
  rows,
  keyOf,
  minWidth = 560,
  emptyLabel = 'Nothing to show.',
  className,
}: {
  columns: Column<Row>[];
  rows: Row[];
  keyOf: (row: Row, index: number) => string;
  minWidth?: number;
  emptyLabel?: string;
  className?: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  if (rows.length === 0) {
    return (
      <Text className={cn('font-body text-xs leading-[17px]', className)} style={{ color: palette.inkMuted }}>
        {emptyLabel}
      </Text>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className={className}>
      <View style={{ minWidth }} className="w-full">
        <View
          className="flex-row items-center gap-3 rounded-md px-2.5 py-1.5"
          style={{ backgroundColor: palette.panelRaised }}
        >
          {columns.map((column) => (
            <Text
              key={column.key}
              className={cn('font-mono text-[8.5px] uppercase tracking-[0.14em]', column.numeric && 'text-right')}
              style={{ color: palette.inkFaint, flex: column.width }}
              numberOfLines={1}
            >
              {column.header}
            </Text>
          ))}
        </View>
        {rows.map((row, index) => (
          <View
            key={keyOf(row, index)}
            className="flex-row items-start gap-3 px-2.5 py-2"
            style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
          >
            {columns.map((column) => (
              <View
                key={column.key}
                style={{ flex: column.width }}
                className={cn('min-w-0', column.numeric && 'items-end')}
              >
                {column.render(row)}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/** Standard cell text. `numeric` switches on tabular figures for column alignment. */
export function Cell({
  children,
  muted = false,
  mono = false,
  numeric = false,
  numberOfLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  mono?: boolean;
  numeric?: boolean;
  numberOfLines?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <Text
      numberOfLines={numberOfLines}
      className={cn(mono || numeric ? 'font-mono text-[10.5px]' : 'font-body text-[11.5px]', 'leading-[16px]')}
      style={{
        color: muted ? palette.inkMuted : palette.ink,
        ...(numeric ? { fontVariant: ['tabular-nums' as const] } : null),
      }}
    >
      {children}
    </Text>
  );
}
