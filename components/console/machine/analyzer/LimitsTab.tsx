/**
 * Limits — the engineering threshold workspace.
 *
 * A constraint answers whether the machine is inside its declared safe
 * operating envelope right now. That is a different question from what is wrong
 * with it: an in-limit machine can carry a developing fault, and an out-of-limit
 * machine can be mechanically healthy. So the two never merge, and this tab
 * stays a register of boundaries rather than a second opinion.
 *
 * Presented as a sortable, filterable table of compact rows that expand to the
 * bar, the reason and the provenance — the old version printed all of that for
 * every constraint at once and ran to four screens.
 */
import { useMemo, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import type { ConstraintCheck } from '../../../../lib/analysis/extruder';
import { Badge, consolePalette, LimitBar, variantStyle, type Variant } from '../../../ui';
import {
  EmptyNote,
  Fact,
  ExpandableRow,
  FilterChips,
  SearchField,
  Section,
  SortButton,
  SummaryStrip,
} from './AnalyzerParts';

type StatusFilter = 'all' | 'violation' | 'pass' | 'not-evaluated';
type SortKey = 'status' | 'name' | 'deviation';

function variantFor(status: ConstraintCheck['status']): Variant {
  if (status === 'VIOLATION') return 'destructive';
  if (status === 'PASS') return 'success';
  return 'muted';
}

function statusLabel(status: ConstraintCheck['status']): string {
  if (status === 'NOT_EVALUATED_MISSING_INPUT') return 'Not evaluated';
  if (status === 'VIOLATION') return 'Crossed';
  return 'Inside';
}

function formatNumber(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : Number(value.toPrecision(digits));
  return String(rounded);
}

/** How far past (or short of) the limit, as a share of the limit. */
function deviationPct(check: ConstraintCheck): number | null {
  if (check.value === null || !Number.isFinite(check.value) || check.limit === 0) return null;
  return ((check.value - check.limit) / Math.abs(check.limit)) * 100;
}

function formatDeviation(check: ConstraintCheck): string {
  const pct = deviationPct(check);
  if (pct === null) return '—';
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

export function LimitsTab({
  constraints,
  /** How many of the model's declared boundaries carry a field calibration. */
  fieldCalibrated,
}: {
  constraints: ConstraintCheck[];
  fieldCalibrated: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const { width } = useWindowDimensions();
  // Below this the eight columns stop fitting honestly, so each row becomes a
  // stacked card instead of a table row squeezed to illegibility.
  const tabular = width >= 1024;

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [descending, setDescending] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  // The register carries calibration state per model, not per constraint, so the
  // column states the model's position rather than inventing a per-row one.
  const calibrationLabel = fieldCalibrated > 0 ? 'Mixed' : 'Dev';

  const counts = useMemo(
    () => ({
      total: constraints.length,
      violation: constraints.filter((check) => check.status === 'VIOLATION').length,
      pass: constraints.filter((check) => check.status === 'PASS').length,
      notEvaluated: constraints.filter((check) => check.status === 'NOT_EVALUATED_MISSING_INPUT').length,
      hard: constraints.filter((check) => check.hardSoft === 'HARD').length,
    }),
    [constraints],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = constraints.filter((check) => {
      if (status === 'violation' && check.status !== 'VIOLATION') return false;
      if (status === 'pass' && check.status !== 'PASS') return false;
      if (status === 'not-evaluated' && check.status !== 'NOT_EVALUATED_MISSING_INPUT') return false;
      if (!needle) return true;
      return (
        check.name.toLowerCase().includes(needle) ||
        check.constraintId.toLowerCase().includes(needle) ||
        check.unit.toLowerCase().includes(needle)
      );
    });

    const rank = (check: ConstraintCheck) =>
      check.status === 'VIOLATION' ? 2 : check.status === 'PASS' ? 1 : 0;

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'deviation') return (deviationPct(a) ?? -Infinity) - (deviationPct(b) ?? -Infinity);
      return rank(a) - rank(b);
    });
    return descending ? sorted.reverse() : sorted;
  }, [constraints, descending, query, sortKey, status]);

  return (
    <View className="gap-3">
      <SummaryStrip
        items={[
          { key: 'total', label: 'Limits declared', value: String(counts.total), detail: `${counts.hard} hard` },
          {
            key: 'violation',
            label: 'Crossed',
            value: String(counts.violation),
            variant: counts.violation > 0 ? 'destructive' : 'success',
          },
          { key: 'pass', label: 'Inside limits', value: String(counts.pass), variant: 'success' },
          { key: 'unevaluated', label: 'Not evaluated', value: String(counts.notEvaluated), variant: 'muted' },
          {
            key: 'cal',
            label: 'Field calibrated',
            value: String(fieldCalibrated),
            variant: fieldCalibrated > 0 ? 'success' : 'warning',
            detail: fieldCalibrated > 0 ? undefined : 'engineering values',
          },
        ]}
      />

      <Section
        title="Process constraints"
        eyebrow="Threshold register"
        meta="Every boundary the model checks the machine against, with the measurement it was checked with."
        padded={false}
        actions={
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Search limits…" width={186} />
            <FilterChips
              label="Filter limits by status"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All', count: counts.total },
                { value: 'violation', label: 'Crossed', count: counts.violation, variant: 'destructive' },
                { value: 'pass', label: 'Inside', count: counts.pass, variant: 'success' },
                { value: 'not-evaluated', label: 'Unevaluated', count: counts.notEvaluated, variant: 'muted' },
              ]}
            />
            <SortButton
              value={sortKey}
              descending={descending}
              onChange={(key, desc) => {
                setSortKey(key);
                setDescending(desc);
              }}
              options={[
                { value: 'status', label: 'Status' },
                { value: 'deviation', label: 'Deviation' },
                { value: 'name', label: 'Name' },
              ]}
            />
          </>
        }
        footnote="A limit is a safe-operating boundary, reported beside the diagnosis and never folded into it. None of these boundaries has been field calibrated on this machine."
      >
        {tabular ? (
          <View
            className="flex-row items-center gap-3 px-3 py-1.5"
            style={{ backgroundColor: palette.panelRaised, borderBottomWidth: 1, borderBottomColor: palette.line }}
          >
            {[
              { key: 'parameter', label: 'Parameter', flex: 2.4, numeric: false },
              { key: 'current', label: 'Current', flex: 1, numeric: true },
              { key: 'limit', label: 'Limit', flex: 1.2, numeric: true },
              { key: 'dev', label: 'Deviation', flex: 1, numeric: true },
              { key: 'status', label: 'Status', flex: 1.1, numeric: false },
              { key: 'source', label: 'Source', flex: 0.9, numeric: false },
              { key: 'cal', label: 'Calibration', flex: 1, numeric: false },
            ].map((column) => (
              <Text
                key={column.key}
                numberOfLines={1}
                className="font-mono text-[8.5px] uppercase tracking-[0.15em]"
                style={{ color: palette.inkFaint, flex: column.flex, textAlign: column.numeric ? 'right' : 'left' }}
              >
                {column.label}
              </Text>
            ))}
          </View>
        ) : null}

        {rows.length === 0 ? (
          <EmptyNote>No limit matches the current filter.</EmptyNote>
        ) : (
          rows.map((check, index) => {
            const variant = variantFor(check.status);
            const style = variantStyle(palette, variant);
            const open = openId === check.constraintId;
            const evaluated = check.value !== null;

            return (
              <ExpandableRow
                key={check.constraintId}
                first={index === 0}
                expanded={open}
                onToggle={() => setOpenId(open ? null : check.constraintId)}
                accessibilityLabel={`${check.name}, ${statusLabel(check.status)}`}
                tone={check.status === 'VIOLATION' ? style.accent : undefined}
                summary={
                  tabular ? (
                    <View className="flex-row items-center gap-3">
                      <View className="min-w-0" style={{ flex: 2.4 }}>
                        <Text className="font-body text-[12px]" style={{ color: palette.ink }} numberOfLines={1}>
                          {check.name}
                        </Text>
                        <Text className="font-mono text-[9.5px]" style={{ color: palette.inkFaint }} numberOfLines={1}>
                          {check.constraintId}
                        </Text>
                      </View>
                      <Text
                        className="font-mono text-[11.5px]"
                        style={{ flex: 1, textAlign: 'right', color: palette.ink, fontVariant: ['tabular-nums'] }}
                        numberOfLines={1}
                      >
                        {formatNumber(check.value)}
                      </Text>
                      <Text
                        className="font-mono text-[11px]"
                        style={{ flex: 1.2, textAlign: 'right', color: palette.inkMuted, fontVariant: ['tabular-nums'] }}
                        numberOfLines={1}
                      >
                        {check.operator} {check.limit} {check.unit}
                      </Text>
                      <Text
                        className="font-mono text-[11px]"
                        style={{
                          flex: 1,
                          textAlign: 'right',
                          color: evaluated ? style.accent : palette.inkFaint,
                          fontVariant: ['tabular-nums'],
                        }}
                        numberOfLines={1}
                      >
                        {formatDeviation(check)}
                      </Text>
                      <View style={{ flex: 1.1 }}>
                        <Badge variant={variant}>{statusLabel(check.status)}</Badge>
                      </View>
                      <Text
                        className="font-mono text-[10px] uppercase tracking-[0.1em]"
                        style={{ flex: 0.9, color: palette.inkMuted }}
                        numberOfLines={1}
                      >
                        {check.hardSoft}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Badge variant={fieldCalibrated > 0 ? 'success' : 'muted'} icon={null} outline>
                          {calibrationLabel}
                        </Badge>
                      </View>
                    </View>
                  ) : (
                    <View className="gap-1.5">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="min-w-0 flex-1 font-body text-[12.5px]" style={{ color: palette.ink }} numberOfLines={2}>
                          {check.name}
                        </Text>
                        <Badge variant={variant}>{statusLabel(check.status)}</Badge>
                      </View>
                      <View className="flex-row flex-wrap gap-x-5 gap-y-1">
                        <Fact label="Current" value={`${formatNumber(check.value)} ${check.unit}`} width={92} />
                        <Fact label="Limit" value={`${check.operator} ${check.limit}`} width={80} />
                        <Fact label="Deviation" value={formatDeviation(check)} width={80} />
                        <Fact label="Source" value={check.hardSoft} width={64} />
                      </View>
                    </View>
                  )
                }
                detail={
                  <View className="gap-2 pt-1.5">
                    {evaluated ? (
                      <>
                        <LimitBar value={check.value as number} limit={check.limit} variant={variant} />
                        <View className="flex-row flex-wrap gap-x-6 gap-y-1.5">
                          <Fact label="Measured" value={`${formatNumber(check.value)} ${check.unit}`} width={120} />
                          <Fact label="Boundary" value={`${check.operator} ${check.limit} ${check.unit}`} width={140} />
                          <Fact label="Deviation" value={formatDeviation(check)} width={92} />
                          <Fact label="Constraint" value={check.constraintId} width={150} />
                          <Fact label="Class" value={check.hardSoft} width={72} />
                          <Fact
                            label="Calibration"
                            value={fieldCalibrated > 0 ? 'Field calibrated' : 'Engineering development'}
                            mono={false}
                            width={170}
                          />
                        </View>
                      </>
                    ) : null}
                    {check.reason ? (
                      <Text className="font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
                        {check.reason}
                      </Text>
                    ) : null}
                  </View>
                }
              />
            );
          })
        )}
      </Section>
    </View>
  );
}
