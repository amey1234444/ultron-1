/**
 * The right-hand analytics column.
 *
 * Four stacked sections in one card, divided by hairlines rather than split
 * into four cards: they are one continuous reading of the plant, and separate
 * crates would imply separate subjects.
 *
 * The status readings at the bottom used to be a row of four cards across the
 * top of the page. They were costing the plant ~110px of height across the full
 * width to say what fits in a 260px column, so they moved here and the world
 * took the height back. That is the trade this layout keeps making: the plant is
 * the instrument, and anything that reads fine in a column has no claim on the
 * middle of the screen.
 *
 * Consumes `PlantAnalytics` and computes nothing itself.
 */
import { ScrollView, Text, View } from 'react-native';

import type { ConsolePalette } from '../../../lib/consoleTheme';
import type { PlantAnalytics } from '../../../lib/plantAnalytics';
import { BarRow, MicroLabel, Meter, PanelSection, PlantCard, STEP, TelemetryCell } from './PlantSurfaces';

/** One headline measure: reading, meter against plan, and a one-word state. */
export type PlantKpi = {
  id: string;
  label: string;
  value: string;
  unit?: string;
  /** 0-1 meter fill. */
  progress: number;
  /** 0-1 plan marker. */
  target?: number;
  /** One short line: state, rate or latency. */
  caption: string;
  tone: string;
};

/**
 * Performance colouring uses the same thresholds the health score does, so a
 * bar painted amber here agrees with the reading above it.
 */
function performanceTone(palette: ConsolePalette, value: number): string {
  if (value >= 85) return palette.accent;
  if (value >= 60) return palette.warning;
  return palette.critical;
}

/**
 * Energy figures, formatted to fit.
 *
 * Locale is pinned: the browser default put Indian digit grouping on kWh
 * readings (`2,79,892.8`), which is correct for a rupee amount and wrong for an
 * instrument. Decimals are dropped once the figure passes five digits, where
 * they are noise rather than precision — and where they were overflowing the
 * cell and truncating mid-number.
 */
function formatKwh(value: number): string {
  return value >= 10_000
    ? value.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * A headline measure as a column row.
 *
 * Same three facts the KPI cards carried — reading, plan, state — in a third of
 * the space. The plan is the marker on the meter rather than a second number,
 * which is what made the card version need a whole extra row.
 */
function KpiRow({ kpi, palette, first }: { kpi: PlantKpi; palette: ConsolePalette; first: boolean }) {
  return (
    <View
      style={{
        paddingTop: first ? 0 : STEP * 2,
        marginTop: first ? 0 : STEP * 2,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: palette.line,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: STEP * 1.5 }}>
        <View style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: kpi.tone }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <MicroLabel palette={palette} size={8}>
            {kpi.label}
          </MicroLabel>
        </View>
        <Text
          className="font-body tabular-nums"
          style={{ fontSize: 15, fontWeight: '300', letterSpacing: -0.3, color: palette.ink }}
          numberOfLines={1}
        >
          {kpi.value}
        </Text>
        {kpi.unit ? (
          <Text className="font-mono" style={{ fontSize: 8.5, color: palette.inkMuted }}>
            {kpi.unit}
          </Text>
        ) : null}
      </View>

      <View style={{ marginTop: STEP * 1.25 }}>
        <Meter value={kpi.progress} target={kpi.target} tone={kpi.tone} palette={palette} />
      </View>

      <Text className="font-mono" style={{ marginTop: STEP, fontSize: 8, color: palette.inkFaint }} numberOfLines={1}>
        {kpi.caption}
      </Text>
    </View>
  );
}

export function PlantAnalyticsPanel({
  analytics,
  kpis,
  palette,
  isDark,
}: {
  analytics: PlantAnalytics;
  /** The four headline measures, moved down from the old top strip. */
  kpis: PlantKpi[];
  palette: ConsolePalette;
  isDark: boolean;
}) {
  const { energy, system, performance } = analytics;

  return (
    <PlantCard palette={palette} isDark={isDark} style={{ flex: 1, minHeight: 0 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: STEP * 3 }}
        style={{ flex: 1, minHeight: 0 }}
      >
        <PanelSection title="Energy consumption" unit="(kWh)" palette={palette} first>
          {energy.map((row, index) => (
            <BarRow
              key={row.id}
              index={String(index + 1).padStart(2, '0')}
              label={row.label}
              value={formatKwh(row.kwh)}
              share={row.share}
              // Consumption is not a status, so it is never green/amber/red —
              // it wears the neutral series grey, with the accent marking the
              // largest consumer, the only actionable fact in the list.
              tone={index === 0 ? palette.accent : palette.series2}
              palette={palette}
            />
          ))}
        </PanelSection>

        <PanelSection title="System telemetry" palette={palette}>
          <View style={{ gap: STEP * 3 }}>
            <View style={{ flexDirection: 'row', gap: STEP * 3 }}>
              <TelemetryCell
                label="Total power"
                value={system.totalPowerMw.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                unit="MW"
                palette={palette}
              />
              <TelemetryCell label="Total energy" value={formatKwh(system.totalEnergyKwh)} unit="kWh" palette={palette} />
            </View>
            <View style={{ flexDirection: 'row', gap: STEP * 3 }}>
              <TelemetryCell
                label="Active machines"
                value={String(system.activeMachines).padStart(2, '0')}
                palette={palette}
              />
              <TelemetryCell
                label="Connected gateways"
                value={String(system.connectedGateways).padStart(2, '0')}
                palette={palette}
              />
            </View>
          </View>
        </PanelSection>

        <PanelSection title="Plant performance" palette={palette}>
          {performance.map((row) => (
            <BarRow
              key={row.label}
              label={row.label}
              value={`${row.value}%`}
              share={row.value / 100}
              tone={performanceTone(palette, row.value)}
              palette={palette}
            />
          ))}
        </PanelSection>

        <PanelSection title="Status" palette={palette}>
          {kpis.map((kpi, index) => (
            <KpiRow key={kpi.id} kpi={kpi} palette={palette} first={index === 0} />
          ))}
        </PanelSection>
      </ScrollView>
    </PlantCard>
  );
}
