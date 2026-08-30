import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import {
  findingEvidenceClass,
  formatDuration,
  formatExceedance,
  SEVERITY_BLURB,
  severityHexes,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  type Finding,
  type Severity,
} from '../../../../lib/analysisDiagnosis';

// Every rule that fired, grouped by what kind of claim it makes, with each rule's
// reference, observation and exceedance so a verdict can be audited rather than
// taken on trust.
//
// Two changes from the design this replaces. The class of each rule — machine or
// measurement chain — is shown on the row, because that is the distinction the
// whole page turns on and it was previously only recoverable by reading rule codes.
// And the column that held durations is labelled "active for" rather than "stage",
// because that is what the values in it were.

type Filter = 'all' | Severity | 'chain';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'ALL',
  fault: 'FAULTS',
  limit: 'LIMITS',
  boundary: 'BOUNDARIES',
  chain: 'CHAIN',
};

export function EvidenceTable({ findings, onOpenTrend }: { findings: Finding[]; onOpenTrend?: (finding: Finding) => void }) {
  const { isDark } = useAppTheme();
  const severityHex = severityHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
  const rowTint = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)';

  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const allExpanded = findings.length > 0 && findings.every((f) => expanded[f.id]);

  const matches = (finding: Finding) => {
    if (filter === 'all') return true;
    if (filter === 'chain') return finding.rules.some((r) => r.evidenceClass === 'chain');
    return finding.severity === filter;
  };

  const shown = findings.filter(matches);
  const chainCount = findings.filter((f) => f.rules.some((r) => r.evidenceClass === 'chain')).length;

  const countFor = (f: Filter) =>
    f === 'all' ? findings.length : f === 'chain' ? chainCount : findings.filter((x) => x.severity === f).length;

  const toggleAll = () => {
    if (allExpanded) return setExpanded({});
    const next: Record<string, boolean> = {};
    for (const f of findings) next[f.id] = true;
    setExpanded(next);
  };

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-end justify-between gap-3">
        <View>
          <Text className={cn('font-body-medium text-[12.5px] uppercase tracking-wider', mutedClass)}>What raised it</Text>
          <Text className={cn('mt-1 font-body text-[12.5px]', mutedClass)}>
            Grouped by the kind of claim. One signal can trip several rules.
          </Text>
        </View>

        <View className="flex-row flex-wrap items-center gap-1.5">
          {(['all', 'fault', 'limit', 'boundary', 'chain'] as Filter[]).map((f) => {
            const active = filter === f;
            const tint = f === 'chain' ? '#8A8A8A' : f === 'all' ? undefined : severityHex[f];
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${FILTER_LABEL[f]}`}
                className="rounded border px-1.5 py-0.5"
                style={{ borderColor: active ? tint ?? '#C9A15C' : hairline, backgroundColor: active ? `${tint ?? '#C9A15C'}1A` : undefined }}
              >
                <Text style={active ? { color: tint ?? '#C9A15C' } : undefined} className={cn('font-mono text-[10.5px]', !active && mutedClass)}>
                  {FILTER_LABEL[f]} {countFor(f)}
                </Text>
              </Pressable>
            );
          })}

          <Pressable onPress={toggleAll} accessibilityRole="button" accessibilityLabel="Expand all findings" className="px-1.5 py-0.5">
            <Text className="font-mono text-[10.5px] text-accent">{allExpanded ? 'COLLAPSE ALL' : 'EXPAND ALL'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Column header. Kept once at the top rather than repeated per group. */}
      <View className="flex-row items-center gap-2 pb-1" style={{ borderBottomWidth: 1, borderBottomColor: hairline }}>
        <Text className={cn('flex-1 font-mono text-[9.5px] uppercase tracking-wider', mutedClass)}>Finding</Text>
        <Text style={{ width: 84 }} className={cn('font-mono text-[9.5px] uppercase tracking-wider', mutedClass)}>Class</Text>
        <Text style={{ width: 92 }} className={cn('text-right font-mono text-[9.5px] uppercase tracking-wider', mutedClass)}>Exceedance</Text>
        <Text style={{ width: 66 }} className={cn('text-right font-mono text-[9.5px] uppercase tracking-wider', mutedClass)}>Active for</Text>
        <Text style={{ width: 14 }} className="font-mono text-[9.5px]"> </Text>
      </View>

      {shown.length === 0 ? (
        <Text className={cn('py-3 font-body text-[12.5px] italic', mutedClass)}>Nothing matches this filter.</Text>
      ) : (
        SEVERITY_ORDER.map((severity) => {
          const group = shown.filter((f) => f.severity === severity);
          if (group.length === 0) return null;
          const tint = severityHex[severity];

          return (
            <View key={severity} className="gap-0">
              <View className="mt-1 flex-row items-center gap-2 rounded px-2 py-1" style={{ backgroundColor: `${tint}14` }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: tint }} />
                <Text style={{ color: tint }} className="font-mono text-[10.5px] font-bold tracking-wider">
                  {SEVERITY_LABEL[severity].toUpperCase()} {group.length}
                </Text>
                <Text className={cn('font-mono text-[10.5px]', mutedClass)}>· {SEVERITY_BLURB[severity]}</Text>
              </View>

              {group.map((finding) => {
                const open = Boolean(expanded[finding.id]);
                const cls = findingEvidenceClass(finding);
                const worstRule = finding.rules.reduce<null | (typeof finding.rules)[number]>(
                  (worst, r) => (worst === null || r.activeForMinutes > worst.activeForMinutes ? r : worst),
                  null,
                );

                return (
                  <View key={finding.id} style={{ borderBottomWidth: 1, borderBottomColor: hairline }}>
                    <Pressable
                      onPress={() => setExpanded((prev) => ({ ...prev, [finding.id]: !prev[finding.id] }))}
                      accessibilityRole="button"
                      accessibilityLabel={`${finding.headline}. ${finding.rules.length} rules. ${open ? 'Collapse' : 'Expand'}`}
                      className="flex-row items-center gap-2 py-2.5"
                    >
                      <View className="flex-1 gap-0.5">
                        <Text numberOfLines={1} className={cn('font-body text-[13.5px]', inkClass)}>
                          {finding.headline}
                        </Text>
                        <Text numberOfLines={1} className={cn('font-mono text-[10.5px]', mutedClass)}>
                          {finding.signalCode} · {finding.signalLabel} · {finding.unit} · {finding.rules.length}{' '}
                          {finding.rules.length === 1 ? 'rule' : 'rules'}
                        </Text>
                      </View>

                      {/* Mixed means some rules describe the machine and some the
                          instrument — the case most worth noticing. */}
                      <View style={{ width: 84 }}>
                        <Text
                          style={{ color: cls === 'machine' ? inkColour(isDark) : cls === 'chain' ? '#8A8A8A' : severityHex.limit }}
                          className="font-mono text-[9.5px] font-bold tracking-wider"
                        >
                          {cls === 'machine' ? 'MACHINE' : cls === 'chain' ? 'CHAIN' : 'MIXED'}
                        </Text>
                      </View>

                      <Text style={{ width: 92, color: tint }} className="text-right font-mono text-[11.5px] font-bold tabular-nums">
                        {formatExceedance(worstRule?.exceedance ?? null)}
                      </Text>
                      <Text style={{ width: 66 }} className={cn('text-right font-mono text-[11.5px] tabular-nums', mutedClass)}>
                        {worstRule ? formatDuration(worstRule.activeForMinutes) : '--'}
                      </Text>
                      <Text style={{ width: 14 }} className={cn('text-right font-mono text-[10.5px]', mutedClass)}>
                        {open ? '▾' : '▸'}
                      </Text>
                    </Pressable>

                    {open ? (
                      <View className="gap-0 pb-2.5" style={{ backgroundColor: rowTint }}>
                        {finding.rules.map((rule) => (
                          <View key={rule.id} className="flex-row items-center gap-2 py-1.5 pl-3">
                            <View className="flex-1 flex-row items-baseline gap-2">
                              <Text className={cn('font-mono text-[10.5px]', mutedClass)}>{rule.code}</Text>
                              <Text numberOfLines={1} className={cn('flex-1 font-body text-[12.5px]', inkClass)}>
                                {rule.label}
                              </Text>
                            </View>

                            <View style={{ width: 84 }}>
                              <Text
                                style={{ color: rule.evidenceClass === 'chain' ? '#8A8A8A' : inkColour(isDark) }}
                                className="font-mono text-[9.5px] tracking-wider"
                              >
                                {rule.evidenceClass === 'chain' ? 'CHAIN' : 'MACHINE'}
                              </Text>
                            </View>

                            <Text style={{ width: 92 }} className={cn('text-right font-mono text-[10.5px] tabular-nums', mutedClass)}>
                              {rule.reference} → {rule.observed}
                            </Text>
                            <Text style={{ width: 66 }} className={cn('text-right font-mono text-[10.5px] tabular-nums', mutedClass)}>
                              {formatDuration(rule.activeForMinutes)}
                            </Text>
                            <Text style={{ width: 14 }} className="font-mono text-[10.5px]"> </Text>
                          </View>
                        ))}

                        {finding.note ? (
                          <View className="flex-row items-start gap-2 px-3 pt-2">
                            <Text className={cn('flex-1 font-body text-[12.5px] leading-[18px]', mutedClass)}>{finding.note}</Text>
                            {onOpenTrend ? (
                              <Pressable onPress={() => onOpenTrend(finding)} accessibilityRole="button" accessibilityLabel="Open trend">
                                <Text className="font-body-medium text-[11.5px] text-accent">Open trend ›</Text>
                              </Pressable>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          );
        })
      )}
    </View>
  );
}

function inkColour(isDark: boolean) {
  return isDark ? '#F5F5F5' : '#0A0A0A';
}
