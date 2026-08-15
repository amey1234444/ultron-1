/**
 * Signals — the monitoring workspace.
 *
 * One row per signal the model knows about, in one table: what it is, what it
 * reads, where it came from, how healthy it is and where it has been going. The
 * old tab had four separate cards saying overlapping things about the same set
 * of signals — a wiring table, a resolved-tag table, a missing-tag list and a
 * quality table — and a reader had to join them by eye.
 */
import { useMemo, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { Badge, consolePalette, StatusDot, variantStyle, type Variant } from '../../../ui';
import { EmptyNote, ExpandableRow, Fact, FilterChips, SearchField, Section, SummaryStrip } from './AnalyzerParts';
import { TagTrend } from './LiveInstrumentReadout';

export type SignalHealth = 'healthy' | 'warning' | 'abnormal' | 'frozen' | 'unavailable';

/** One signal, joined from the mapping, the model's resolution and live quality. */
export type SignalRow = {
  key: string;
  /** Pilot tag, or an em dash where the point resolved onto none. */
  tag: string;
  /** What this instrument measures, in plain words. */
  measures: string;
  /** The point's name on the machine drawing. */
  point: string;
  value: number | null;
  unit: string;
  health: SignalHealth;
  /** One line explaining the health state. */
  note: string;
  source: string;
  channel: string;
  lastUpdate: string;
  history: (number | null)[];
  /** Set when this row is a tag the model wants and nothing is mapped to. */
  missing?: { essential: boolean };
};

const HEALTH_VARIANT: Record<SignalHealth, Variant> = {
  healthy: 'success',
  warning: 'warning',
  abnormal: 'destructive',
  frozen: 'warning',
  unavailable: 'muted',
};

const HEALTH_LABEL: Record<SignalHealth, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  abnormal: 'Abnormal',
  frozen: 'Frozen',
  unavailable: 'Unavailable',
};

type HealthFilter = 'all' | SignalHealth;

function formatNumber(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : Number(value.toPrecision(digits));
  return String(rounded);
}

export function SignalsTab({
  signals,
  unconsumed,
}: {
  signals: SignalRow[];
  /** Points the model declines by design, with the reason it declines them. */
  unconsumed: { label: string; reason: string }[];
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const { width } = useWindowDimensions();
  const tabular = width >= 1100;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HealthFilter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const counts = useMemo(() => {
    const by = (health: SignalHealth) => signals.filter((row) => row.health === health).length;
    return {
      total: signals.length,
      connected: signals.filter((row) => !row.missing).length,
      healthy: by('healthy'),
      warning: by('warning'),
      abnormal: by('abnormal'),
      frozen: by('frozen'),
      unavailable: by('unavailable'),
    };
  }, [signals]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return signals.filter((row) => {
      if (filter !== 'all' && row.health !== filter) return false;
      if (!needle) return true;
      return (
        row.tag.toLowerCase().includes(needle) ||
        row.measures.toLowerCase().includes(needle) ||
        row.point.toLowerCase().includes(needle) ||
        row.channel.toLowerCase().includes(needle)
      );
    });
  }, [filter, query, signals]);

  return (
    <View className="gap-3">
      <SummaryStrip
        items={[
          { key: 'total', label: 'Signals tracked', value: String(counts.total), detail: `${counts.connected} connected` },
          { key: 'healthy', label: 'Healthy', value: String(counts.healthy), variant: 'success' },
          { key: 'warning', label: 'Warning', value: String(counts.warning), variant: counts.warning > 0 ? 'warning' : 'muted' },
          { key: 'abnormal', label: 'Abnormal', value: String(counts.abnormal), variant: counts.abnormal > 0 ? 'destructive' : 'muted' },
          { key: 'frozen', label: 'Frozen', value: String(counts.frozen), variant: counts.frozen > 0 ? 'warning' : 'muted' },
          { key: 'unavailable', label: 'Unavailable', value: String(counts.unavailable), variant: 'muted' },
        ]}
      />

      <Section
        title="Signal monitor"
        eyebrow="Acquisition"
        meta="Every instrument the model reads, plus the tags it wants and does not have."
        padded={false}
        actions={
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Search tag or point…" width={190} />
            <FilterChips
              label="Filter signals by health"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: counts.total },
                { value: 'healthy', label: 'Healthy', count: counts.healthy, variant: 'success' },
                { value: 'warning', label: 'Warning', count: counts.warning, variant: 'warning' },
                { value: 'abnormal', label: 'Abnormal', count: counts.abnormal, variant: 'destructive' },
                { value: 'unavailable', label: 'Unavailable', count: counts.unavailable, variant: 'muted' },
              ]}
            />
          </>
        }
      >
        {tabular ? (
          <View
            className="flex-row items-center gap-3 px-3 py-1.5"
            style={{ backgroundColor: palette.panelRaised, borderBottomWidth: 1, borderBottomColor: palette.line }}
          >
            {[
              { key: 'tag', label: 'Tag', flex: 0.8, align: 'left' as const },
              { key: 'measures', label: 'Parameter', flex: 2.4, align: 'left' as const },
              { key: 'value', label: 'Current', flex: 1, align: 'right' as const },
              { key: 'trend', label: 'Trend', flex: 0.9, align: 'left' as const },
              { key: 'status', label: 'Status', flex: 1.1, align: 'left' as const },
              { key: 'source', label: 'Source', flex: 1, align: 'left' as const },
              { key: 'seen', label: 'Last update', flex: 1, align: 'left' as const },
            ].map((column) => (
              <Text
                key={column.key}
                numberOfLines={1}
                className="font-mono text-[8.5px] uppercase tracking-[0.15em]"
                style={{ color: palette.inkFaint, flex: column.flex, textAlign: column.align }}
              >
                {column.label}
              </Text>
            ))}
          </View>
        ) : null}

        {rows.length === 0 ? (
          <EmptyNote>No signal matches the current filter.</EmptyNote>
        ) : (
          rows.map((row, index) => {
            const variant = HEALTH_VARIANT[row.health];
            const style = variantStyle(palette, variant);
            const open = openKey === row.key;
            return (
              <ExpandableRow
                key={row.key}
                first={index === 0}
                expanded={open}
                onToggle={() => setOpenKey(open ? null : row.key)}
                accessibilityLabel={`${row.tag}, ${row.measures}, ${HEALTH_LABEL[row.health]}`}
                tone={row.health === 'abnormal' ? style.accent : undefined}
                summary={
                  tabular ? (
                    <View className="flex-row items-center gap-3">
                      <View className="min-w-0 flex-row items-center gap-1.5" style={{ flex: 0.8 }}>
                        <StatusDot variant={variant} size={6} />
                        <Text className="min-w-0 flex-1 font-mono text-[11px]" style={{ color: palette.ink }} numberOfLines={1}>
                          {row.tag}
                        </Text>
                      </View>
                      <View className="min-w-0" style={{ flex: 2.4 }}>
                        <Text className="font-body text-[12px]" style={{ color: palette.ink }} numberOfLines={1}>
                          {row.measures}
                        </Text>
                        <Text className="font-body text-[10px]" style={{ color: palette.inkFaint }} numberOfLines={1}>
                          {row.point}
                        </Text>
                      </View>
                      <Text
                        className="font-mono text-[12px]"
                        style={{ flex: 1, textAlign: 'right', color: palette.ink, fontVariant: ['tabular-nums'] }}
                        numberOfLines={1}
                      >
                        {formatNumber(row.value)}
                        <Text className="text-[9.5px]" style={{ color: palette.inkFaint }}>
                          {row.unit ? ` ${row.unit}` : ''}
                        </Text>
                      </Text>
                      <View style={{ flex: 0.9 }}>
                        <TagTrend values={row.history} colour={style.accent} width={56} height={18} />
                      </View>
                      <View style={{ flex: 1.1 }}>
                        <Badge variant={variant}>{HEALTH_LABEL[row.health]}</Badge>
                      </View>
                      <Text
                        className="font-mono text-[10px] uppercase tracking-[0.1em]"
                        style={{ flex: 1, color: palette.inkMuted }}
                        numberOfLines={1}
                      >
                        {row.source}
                      </Text>
                      <Text className="font-mono text-[10px]" style={{ flex: 1, color: palette.inkMuted }} numberOfLines={1}>
                        {row.lastUpdate}
                      </Text>
                    </View>
                  ) : (
                    <View className="gap-1.5">
                      <View className="flex-row items-center gap-2">
                        <StatusDot variant={variant} size={6} />
                        <Text className="font-mono text-[11px]" style={{ color: palette.ink }}>
                          {row.tag}
                        </Text>
                        <Text className="min-w-0 flex-1 font-body text-[12px]" style={{ color: palette.ink }} numberOfLines={1}>
                          {row.measures}
                        </Text>
                        <Text className="font-mono text-[12px]" style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}>
                          {formatNumber(row.value)} {row.unit}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <Badge variant={variant}>{HEALTH_LABEL[row.health]}</Badge>
                        <Text className="min-w-0 flex-1 font-body text-[10.5px]" style={{ color: palette.inkMuted }} numberOfLines={1}>
                          {row.point}
                        </Text>
                        <TagTrend values={row.history} colour={style.accent} width={52} height={16} />
                      </View>
                    </View>
                  )
                }
                detail={
                  <View className="gap-2 pt-1.5">
                    <Text className="font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
                      {row.note}
                    </Text>
                    <View className="flex-row flex-wrap gap-x-6 gap-y-1.5">
                      <Fact label="Point" value={row.point} mono={false} width={190} />
                      <Fact label="Rack channel" value={row.channel} width={190} />
                      <Fact label="Reading" value={`${formatNumber(row.value)} ${row.unit}`.trim()} width={110} />
                      <Fact label="Source" value={row.source} mono={false} width={110} />
                      <Fact label="Last update" value={row.lastUpdate} mono={false} width={120} />
                      {row.missing ? (
                        <Fact label="Requirement" value={row.missing.essential ? 'Essential' : 'Diagnostic'} mono={false} width={110} />
                      ) : null}
                    </View>
                  </View>
                }
              />
            );
          })
        )}
      </Section>

      {unconsumed.length > 0 ? (
        <Section
          title="Points the model does not consume"
          eyebrow="Out of scope"
          meta="Mapped points that carry no diagnostic tag, plus any the model declines by design."
          padded={false}
        >
          {unconsumed.map((item, index) => (
            <View
              key={`${item.label}-${index}`}
              className="gap-0.5 px-3 py-2"
              style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
            >
              <Text className="font-body text-[12px]" style={{ color: palette.ink }}>
                {item.label}
              </Text>
              <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
                {item.reason}
              </Text>
            </View>
          ))}
        </Section>
      ) : null}
    </View>
  );
}
