/**
 * Evidence — the investigation workspace.
 *
 * Everything the model actually observed, split by the weight it carries:
 * primary observations that can identify a fault on their own, supporting ones
 * that corroborate, and the observations that are missing and would separate
 * what is left. The old tab printed a bar chart, one long table and a ledger,
 * with no way to ask "show me only what is missing".
 */
import { useMemo, useState } from 'react';
import { Text, View, useWindowDimensions } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import type { FaultAssessmentRecord, TriggeredThreshold } from '../../../../lib/analysis/extruder';
import {
  Badge,
  Body,
  Collapsible,
  consolePalette,
  MagnitudeBars,
  variantStyle,
  type MagnitudeDatum,
  type Variant,
} from '../../../ui';
import { EmptyNote, ExpandableRow, Fact, FilterChips, SearchField, Section, SummaryStrip } from './AnalyzerParts';

type Weight = 'primary' | 'supporting' | 'weak';
type EvidenceFilter = 'all' | Weight | 'missing';

/** One observation, flattened out of the per-hypothesis assessments. */
export type EvidenceItem = {
  key: string;
  weight: Weight;
  faultId: string;
  faultName: string;
  sensor: string;
  feature: string;
  description: string;
  observedValue: number | null;
  expectedDirection: string;
  thresholdId?: string;
  source: string;
};

const WEIGHT_VARIANT: Record<Weight, Variant> = {
  primary: 'destructive',
  supporting: 'warning',
  weak: 'muted',
};

const MATCH_CLASS_VARIANT: Record<string, Variant> = {
  STRONG_CANDIDATE: 'destructive',
  CANDIDATE: 'warning',
  WEAK: 'info',
  INSUFFICIENT: 'muted',
  ELIMINATED: 'muted',
};

function humanise(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase();
}

function formatNumber(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(1) : Number(value.toPrecision(digits));
  return String(rounded);
}

/**
 * Flattens the assessments into one evidence list.
 *
 * Exported so the composition root can count the items for the tab badge
 * without building the list twice.
 */
export function collectEvidence(assessments: FaultAssessmentRecord[]): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  for (const assessment of assessments) {
    const push = (weight: Weight, list: FaultAssessmentRecord['primary']) => {
      list.forEach((item, index) => {
        items.push({
          key: `${assessment.faultId}-${weight}-${item.feature}-${index}`,
          weight,
          faultId: assessment.faultId,
          faultName: assessment.faultName,
          sensor: item.sensor,
          feature: item.feature,
          description: item.description,
          observedValue: item.observedValue,
          expectedDirection: item.expectedDirection,
          thresholdId: item.thresholdId,
          source: item.source,
        });
      });
    };
    push('primary', assessment.primary);
    push('supporting', assessment.supporting);
    push('weak', assessment.weak);
  }
  return items;
}

export function EvidenceTab({
  evidence,
  missing,
  thresholds,
  contributors,
  contributorVariant,
  anomalyLimitation,
  assessments,
  readinessScore,
  thresholdTotal,
}: {
  evidence: EvidenceItem[];
  /** Observations the model needs and does not have. */
  missing: { tag: string; label: string; essential: boolean; note?: string }[];
  thresholds: TriggeredThreshold[];
  contributors: MagnitudeDatum[];
  contributorVariant: Variant;
  anomalyLimitation: string;
  assessments: FaultAssessmentRecord[];
  readinessScore: number;
  /** How many boundaries the model declares in total. */
  thresholdTotal: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const { width } = useWindowDimensions();
  const tabular = width >= 1024;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EvidenceFilter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      primary: evidence.filter((item) => item.weight === 'primary').length,
      supporting: evidence.filter((item) => item.weight === 'supporting').length,
      weak: evidence.filter((item) => item.weight === 'weak').length,
    }),
    [evidence],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return evidence.filter((item) => {
      if (filter !== 'all' && filter !== 'missing' && item.weight !== filter) return false;
      if (!needle) return true;
      return (
        item.sensor.toLowerCase().includes(needle) ||
        item.feature.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.faultName.toLowerCase().includes(needle)
      );
    });
  }, [evidence, filter, query]);

  const showMissing = filter === 'all' || filter === 'missing';

  return (
    <View className="gap-3">
      <SummaryStrip
        items={[
          { key: 'collected', label: 'Evidence collected', value: String(evidence.length) },
          { key: 'primary', label: 'Primary', value: String(counts.primary), variant: counts.primary > 0 ? 'destructive' : 'muted' },
          { key: 'supporting', label: 'Supporting', value: String(counts.supporting), variant: counts.supporting > 0 ? 'warning' : 'muted' },
          { key: 'missing', label: 'Missing', value: String(missing.length), variant: missing.length > 0 ? 'warning' : 'success' },
          {
            key: 'readiness',
            label: 'Evidence readiness',
            value: `${Math.round(readinessScore)}`,
            detail: 'of 100',
            variant: readinessScore >= 85 ? 'success' : readinessScore >= 60 ? 'warning' : 'destructive',
          },
        ]}
      />

      <Section
        title="Observations"
        eyebrow="Evidence ledger"
        meta="Each row is one measurement-derived statement about one hypothesis."
        padded={false}
        actions={
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Search evidence…" width={186} />
            <FilterChips
              label="Filter evidence by weight"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: evidence.length },
                { value: 'primary', label: 'Primary', count: counts.primary, variant: 'destructive' },
                { value: 'supporting', label: 'Supporting', count: counts.supporting, variant: 'warning' },
                { value: 'weak', label: 'Weak', count: counts.weak, variant: 'muted' },
                { value: 'missing', label: 'Missing', count: missing.length, variant: 'warning' },
              ]}
            />
          </>
        }
      >
        {filter === 'missing' ? null : rows.length === 0 ? (
          <EmptyNote>No observation matches the current filter.</EmptyNote>
        ) : (
          rows.map((item, index) => {
            const variant = WEIGHT_VARIANT[item.weight];
            const style = variantStyle(palette, variant);
            const open = openKey === item.key;
            return (
              <ExpandableRow
                key={item.key}
                first={index === 0}
                expanded={open}
                onToggle={() => setOpenKey(open ? null : item.key)}
                accessibilityLabel={`${item.sensor} ${item.feature}, ${item.weight} evidence for ${item.faultName}`}
                tone={item.weight === 'primary' ? style.accent : undefined}
                summary={
                  <View className={tabular ? 'flex-row items-center gap-3' : 'gap-1.5'}>
                    <View className={tabular ? 'min-w-0' : undefined} style={tabular ? { flex: 2.6 } : undefined}>
                      <Text className="font-body text-[12px] leading-[16px]" style={{ color: palette.ink }} numberOfLines={2}>
                        {item.description}
                      </Text>
                      <Text className="font-mono text-[9.5px]" style={{ color: palette.inkFaint }} numberOfLines={1}>
                        {item.sensor} · {item.feature}
                      </Text>
                    </View>
                    <View className={tabular ? 'min-w-0' : undefined} style={tabular ? { flex: 1.6 } : undefined}>
                      <Text className="font-body text-[11px]" style={{ color: palette.inkMuted }} numberOfLines={1}>
                        {item.faultName}
                      </Text>
                    </View>
                    <Text
                      className="font-mono text-[11.5px]"
                      style={
                        tabular
                          ? { flex: 0.9, textAlign: 'right', color: palette.ink, fontVariant: ['tabular-nums'] }
                          : { color: palette.ink, fontVariant: ['tabular-nums'] }
                      }
                      numberOfLines={1}
                    >
                      {formatNumber(item.observedValue)}
                    </Text>
                    <View style={tabular ? { flex: 1 } : undefined}>
                      <Badge variant={variant} icon={null} outline>
                        {item.weight}
                      </Badge>
                    </View>
                  </View>
                }
                detail={
                  <View className="flex-row flex-wrap gap-x-6 gap-y-1.5 pt-1.5">
                    <Fact label="Hypothesis" value={item.faultId} width={130} />
                    <Fact label="Sensor" value={item.sensor} width={90} />
                    <Fact label="Feature" value={item.feature} mono={false} width={190} />
                    <Fact label="Observed" value={formatNumber(item.observedValue)} width={90} />
                    <Fact label="Expected" value={item.expectedDirection} mono={false} width={150} />
                    {item.thresholdId ? <Fact label="Threshold" value={item.thresholdId} width={150} /> : null}
                    <Fact label="Source" value={item.source} mono={false} width={130} />
                  </View>
                }
              />
            );
          })
        )}

        {showMissing && missing.length > 0 ? (
          <View style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
            <View className="px-3 py-2" style={{ backgroundColor: palette.panelRaised }}>
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                Missing · required to separate what remains
              </Text>
            </View>
            {missing.map((item, index) => (
              <View
                key={item.tag}
                className="gap-1 px-3 py-2"
                style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
              >
                <View className="flex-row flex-wrap items-center gap-2">
                  <Badge variant={item.essential ? 'warning' : 'muted'} icon={null} outline>
                    {item.essential ? 'Essential' : 'Diagnostic'}
                  </Badge>
                  <Text className="font-mono text-[11px]" style={{ color: palette.ink }}>
                    {item.tag}
                  </Text>
                  <Text className="min-w-0 flex-1 font-body text-[11.5px]" style={{ color: palette.inkMuted }} numberOfLines={1}>
                    {item.label}
                  </Text>
                </View>
                {item.note ? (
                  <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
                    {item.note}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </Section>

      <View className="gap-3 xl:flex-row">
        <Section
          className="min-w-0 flex-1"
          title="Departure from the healthy reference"
          eyebrow="Anomaly"
          meta="Measured in analytical-redundancy consistency bands — a registered sensitivity value, not a calibrated severity unit."
          footnote="Absolute severity percent is a blocked output for this model, so no percentage is stated."
        >
          {contributors.length > 0 ? (
            <MagnitudeBars data={contributors} variant={contributorVariant} unitSuffix=" bands" />
          ) : (
            <EmptyNote>{anomalyLimitation}</EmptyNote>
          )}
        </Section>

        <Section
          className="min-w-0 flex-1"
          title="Thresholds crossed"
          eyebrow="Boundaries"
          meta={`${thresholds.length} of ${thresholdTotal} registered boundaries were crossed by the current measurements.`}
          padded={false}
        >
          {thresholds.length === 0 ? (
            <View className="px-4 py-3">
              <EmptyNote>No registered threshold was crossed by the current measurements.</EmptyNote>
            </View>
          ) : (
            thresholds.map((row, index) => (
              <View
                key={`${row.thresholdId}-${row.faultId}-${index}`}
                className="gap-1 px-3 py-2"
                style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
              >
                <View className="flex-row items-center gap-2">
                  <Text className="min-w-0 flex-1 font-mono text-[10.5px]" style={{ color: palette.ink }} numberOfLines={1}>
                    {row.thresholdId}
                  </Text>
                  <Text className="font-mono text-[11px]" style={{ color: palette.ink, fontVariant: ['tabular-nums'] }}>
                    {formatNumber(row.observed)}
                  </Text>
                  <Badge variant={row.fieldCalibrated ? 'success' : 'muted'} icon={null} outline>
                    {row.fieldCalibrated ? 'Field' : 'Dev'}
                  </Badge>
                </View>
                <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }} numberOfLines={2}>
                  {row.sensor} · {row.feature} · expected {row.expectedDirection}
                </Text>
              </View>
            ))
          )}
        </Section>
      </View>

      <Collapsible
        title="Full hypothesis ledger"
        count={assessments.length}
        icon="format-list-checks"
        summary="Every fault the model assessed, including those with insufficient or contradicted evidence."
      >
        {assessments.map((assessment, index) => (
          <View
            key={assessment.faultId}
            className="flex-row flex-wrap items-center gap-2 py-1.5"
            style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
          >
            <Badge variant={MATCH_CLASS_VARIANT[assessment.matchClass] ?? 'muted'} icon={null} outline>
              {humanise(assessment.matchClass)}
            </Badge>
            <Body>{assessment.faultName}</Body>
            <Body muted mono>
              {assessment.faultId} · score {assessment.engineeringMatchScore}
            </Body>
          </View>
        ))}
      </Collapsible>
    </View>
  );
}
