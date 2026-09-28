/**
 * Health index and remaining useful life, per component.
 *
 * The container: it fetches, switches on status, and lays the pieces out. It
 * derives no health value of its own — every number on screen came from the
 * service and went through the parser, and where the service sent nothing this
 * says so rather than filling the gap.
 *
 * Seven statuses, each with its own shape. The distinction that matters most is
 * between "healthy" and "we cannot tell": NOT_DEGRADING means the model looked
 * and found no onset, while INSUFFICIENT_HISTORY means it could not look. Both
 * render without a projection, and conflating them would turn an absence of
 * evidence into a clean bill of health.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { isStale, type ComponentRul } from '../../../../lib/knowledge/ml/rulContract';
import { consolePalette } from '../../../ui';
import { HiProjectionChart } from './HiProjectionChart';
import {
  Banner,
  DataTable,
  FailureProbabilityPanel,
  HealthSummaryStrip,
  hairline,
  Panel,
  ProvenanceFooter,
  RulConvergenceChart,
  stateColour,
  TopDriversPanel,
} from './HealthRulPanels';
import type { ChartRange } from './rulSeries';
import { useComponentRul } from './useComponentRul';

export type RulComponentOption = { componentId: string; displayName: string };

type Props = {
  machineId: string;
  /** The machine's registered components, in the order to offer them. */
  components: readonly RulComponentOption[];
  /** Selected component, held by the host so it can live in the URL. */
  selectedComponentId?: string | null;
  onSelectComponent?: (componentId: string) => void;
  todayIso?: string;
  /** Narrow layouts get a shorter chart and stacked panels. */
  compact?: boolean;
};

const RANGES: Array<{ key: ChartRange; label: string }> = [
  { key: '30d', label: '30 d' },
  { key: '90d', label: '90 d' },
  { key: 'life', label: 'Current life' },
  { key: 'all', label: 'All history' },
];

export function HealthRulSection({
  machineId,
  components,
  selectedComponentId,
  onSelectComponent,
  todayIso = new Date().toISOString().slice(0, 10),
  compact = false,
}: Props) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const ink = isDark ? 'text-ink' : 'text-ink-inverse';
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';

  const [internalId, setInternalId] = useState<string | null>(components[0]?.componentId ?? null);
  const componentId = selectedComponentId ?? internalId;
  const select = (id: string) => {
    setInternalId(id);
    onSelectComponent?.(id);
  };

  const [range, setRange] = useState<ChartRange>('life');
  const [unit, setUnit] = useState<'days' | 'hours'>('days');
  const [showBand, setShowBand] = useState(true);
  const [showEvents, setShowEvents] = useState(true);
  const [tableOpen, setTableOpen] = useState(false);

  const rul = useComponentRul(machineId, componentId);
  const stale = useMemo(() => (rul.value ? isStale(rul.value) : false), [rul.value]);

  const selector = (
    <View className="gap-1.5">
      <Text className={cn('font-mono text-[9.5px] tracking-wider', muted)}>COMPONENT</Text>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {components.map((option) => {
          const active = option.componentId === componentId;
          const dot =
            active && rul.value ? stateColour(rul.value.summary.healthState, isDark) : palette.inkDisabled;
          return (
            <Pressable
              key={option.componentId}
              onPress={() => select(option.componentId)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{ borderColor: active ? palette.accentBorder : hairline(isDark) }}
              className={cn('flex-row items-center gap-2 rounded-lg border px-3 py-1.5', active && 'bg-accent/10')}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
              <Text className={cn('font-body text-[11px]', active ? ink : muted)}>{option.displayName}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  if (rul.loading && !rul.value) return <Frame selector={selector}><Skeleton compact={compact} /></Frame>;

  if (rul.invalid) {
    return (
      <Frame selector={selector}>
        <Banner tone="critical">Invalid health data received — nothing is shown rather than something unverified.</Banner>
        <Panel title="VALIDATION ERRORS" caption="The payload did not satisfy the contract. This is for whoever maintains the service.">
          {rul.invalid.map((error) => (
            <Text key={error} className={cn('font-mono text-[10.5px] leading-[16px]', muted)}>
              {error}
            </Text>
          ))}
        </Panel>
      </Frame>
    );
  }

  if (!rul.value) {
    return (
      <Frame selector={selector}>
        <Banner tone="info">{rul.unavailable ?? 'No health data for this component.'}</Banner>
      </Frame>
    );
  }

  const value = rul.value;

  if (value.status === 'ML_UNAVAILABLE') {
    return (
      <Frame selector={selector}>
        <Banner tone="info">
          {value.detail ?? 'ML service unavailable — engineering diagnostics unaffected.'}
        </Banner>
      </Frame>
    );
  }

  const banner = bannerFor(value);
  const hasChart = value.history.length > 0;

  return (
    <Frame selector={selector}>
      {rul.usingFixtures ? (
        <Banner tone="warning">
          Showing synthetic fixture data. No health model is published for this component yet.
        </Banner>
      ) : null}
      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}

      <HealthSummaryStrip value={value} unit={unit} stale={stale} />

      <Controls
        range={range}
        onRange={setRange}
        unit={unit}
        onUnit={setUnit}
        showBand={showBand}
        onShowBand={setShowBand}
        showEvents={showEvents}
        onShowEvents={setShowEvents}
        onOpenTable={() => setTableOpen((open) => !open)}
        tableOpen={tableOpen}
        projectionAvailable={value.projection.length > 0}
      />

      {hasChart ? (
        <HiProjectionChart
          value={value}
          range={range}
          todayIso={todayIso}
          showBand={showBand}
          showEvents={showEvents}
          height={compact ? 260 : 360}
          width={compact ? 520 : 960}
        />
      ) : (
        <Text className={cn('font-body text-[11.5px] italic', muted)}>No observations to plot yet.</Text>
      )}

      <Legend />

      {tableOpen ? <DataTable value={value} onClose={() => setTableOpen(false)} /> : null}

      <View className="flex-row flex-wrap items-stretch" style={{ gap: 12 }}>
        <FailureProbabilityPanel value={value} />
        <TopDriversPanel drivers={value.summary.topDrivers} />
      </View>

      <RulConvergenceChart value={value} width={compact ? 480 : 720} height={compact ? 130 : 160} />

      <ProvenanceFooter value={value} />
    </Frame>
  );
}

/* -- chrome ---------------------------------------------------------------- */

function Frame({ selector, children }: { selector: React.ReactNode; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      {selector}
      {children}
    </View>
  );
}

function bannerFor(value: ComponentRul): { tone: 'info' | 'warning' | 'critical'; text: string } | null {
  if (value.status === 'NOT_DEGRADING') {
    return { tone: 'info', text: value.detail ?? 'No degradation onset detected.' };
  }
  if (value.status === 'INSUFFICIENT_HISTORY') {
    return {
      tone: 'warning',
      text: value.detail ?? 'Not enough valid steady-production data yet.',
    };
  }
  if (value.status === 'THRESHOLD_NOT_CONFIGURED') {
    return {
      tone: 'warning',
      text: value.detail ?? 'Failure threshold not configured for this component — RUL cannot be computed.',
    };
  }
  if (value.status === 'RUL_NOT_AVAILABLE' || value.status === 'DEGRADED') {
    return { tone: 'warning', text: value.detail ?? 'A remaining-life estimate is not available.' };
  }
  return null;
}

function Controls(props: {
  range: ChartRange;
  onRange: (range: ChartRange) => void;
  unit: 'days' | 'hours';
  onUnit: (unit: 'days' | 'hours') => void;
  showBand: boolean;
  onShowBand: (next: boolean) => void;
  showEvents: boolean;
  onShowEvents: (next: boolean) => void;
  onOpenTable: () => void;
  tableOpen: boolean;
  projectionAvailable: boolean;
}) {
  const { isDark } = useAppTheme();
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const ink = isDark ? 'text-ink' : 'text-ink-inverse';

  const chip = (label: string, active: boolean, onPress: () => void, disabled = false) => (
    <Pressable
      key={label}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={{ borderColor: hairline(isDark) }}
      className={cn('rounded-md border px-2.5 py-1', active && 'bg-accent/10', disabled && 'opacity-45')}
    >
      <Text className={cn('font-mono text-[10.5px]', active ? ink : muted)}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
        {RANGES.map((entry) => chip(entry.label, props.range === entry.key, () => props.onRange(entry.key)))}
        <View style={{ width: 8 }} />
        {chip('Days', props.unit === 'days', () => props.onUnit('days'))}
        {chip('Operating hours', props.unit === 'hours', () => props.onUnit('hours'))}
        <View style={{ width: 8 }} />
        {chip('80% interval', props.showBand, () => props.onShowBand(!props.showBand), !props.projectionAvailable)}
        {chip('Events', props.showEvents, () => props.onShowEvents(!props.showEvents))}
        {chip(props.tableOpen ? 'Hide data' : 'View data', props.tableOpen, props.onOpenTable)}
      </View>
    </ScrollView>
  );
}

/** Colour and dash pattern both, so the key works in grayscale. */
function Legend() {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const muted = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const items: Array<[string, string, string]> = [
    ['Observed health index', palette.chartNormal, 'solid'],
    ['Median projection', palette.forecast, 'dashed'],
    ['80% interval', palette.forecast, 'band'],
    ['Failure threshold', palette.critical, 'dotted'],
    ['Warning threshold', palette.warning, 'dashed'],
  ];
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 14 }}>
      {items.map(([label, colour, kind]) => (
        <View key={label} className="flex-row items-center" style={{ gap: 6 }}>
          <View
            style={{
              width: 18,
              height: kind === 'band' ? 8 : 0,
              borderRadius: kind === 'band' ? 2 : 0,
              backgroundColor: kind === 'band' ? `${colour}2E` : undefined,
              borderTopWidth: kind === 'band' ? 0 : 2,
              borderColor: colour,
              borderStyle: kind === 'solid' ? 'solid' : kind === 'dotted' ? 'dotted' : 'dashed',
            }}
          />
          <Text className={cn('font-body text-[10.5px]', muted)}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function Skeleton({ compact }: { compact: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const block = (height: number) => (
    <View style={{ height, width: '100%', backgroundColor: palette.panelRaised, borderRadius: 8 }} />
  );
  return (
    <View className="gap-3" accessibilityLabel="Loading component health">
      <View className="flex-row flex-wrap" style={{ gap: 10 }}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={{ flexGrow: 1, flexBasis: 170, minWidth: 150 }}>{block(58)}</View>
        ))}
      </View>
      {block(compact ? 260 : 360)}
    </View>
  );
}
