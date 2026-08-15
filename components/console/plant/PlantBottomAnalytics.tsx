/**
 * The five analytical regions under the plant.
 *
 * Subordinate by construction: short, hairline-ruled, 8px axis type, and no
 * chart taller than it needs to be. The plant above is the instrument; these
 * are its margin notes.
 *
 * Series colour
 * -------------
 * Operating Power's three feeders wear violet / teal / blue rather than the
 * green-amber-red of a status readout. The console reserves those three hues
 * for state (see `components/ui/tokens.ts`), and painting "Unit 3" red would
 * assert that Unit 3 is in alarm when it is only the third feeder.
 */
import { Text, View } from 'react-native';

import type { ConsolePalette } from '../../../lib/consoleTheme';
import type { PlantAnalytics } from '../../../lib/plantAnalytics';
import { AreaChart, BarChart, Measured, MultiLineChart, SeverityBars } from './PlantCharts';
import { Legend, MicroLabel, MetricValue, PlantCard, STEP } from './PlantSurfaces';

/** Categorical hues for measured series. Deliberately outside the signal set. */
export const UNIT_COLORS = ['#8E86D6', '#4FD1C5', '#7FA0D8'];

function Delta({ value, palette, suffix }: { value: number; palette: ConsolePalette; suffix: string }) {
  const tone = value > 0 ? palette.accent : value < 0 ? palette.critical : palette.inkFaint;
  return (
    <Text className="font-mono" style={{ fontSize: 9, color: tone }} numberOfLines={1}>
      {value > 0 ? '+' : ''}
      {value}% {suffix}
    </Text>
  );
}

/** Shared frame: header, headline reading, then the plot fills what is left. */
function AnalyticsCard({
  label,
  unit,
  meta,
  metaColor,
  palette,
  isDark,
  headline,
  children,
  flex = 1,
  minWidth = 208,
}: {
  label: string;
  unit?: string;
  meta?: string;
  metaColor?: string;
  palette: ConsolePalette;
  isDark: boolean;
  headline?: React.ReactNode;
  children: React.ReactNode;
  flex?: number;
  minWidth?: number;
}) {
  return (
    <PlantCard
      palette={palette}
      isDark={isDark}
      style={{ flex, minWidth, minHeight: 0, padding: STEP * 2.5, paddingBottom: STEP * 1.5 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: STEP * 1.5 }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: STEP }}>
          <MicroLabel palette={palette}>{label}</MicroLabel>
          {unit ? (
            <Text className="font-mono" style={{ fontSize: 8.5, color: palette.inkFaint }}>
              {unit}
            </Text>
          ) : null}
        </View>
        {meta ? (
          <Text className="font-mono" style={{ fontSize: 8.5, color: metaColor ?? palette.inkFaint }} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {headline ? <View style={{ marginTop: 2 }}>{headline}</View> : null}
      <View style={{ flex: 1, minHeight: 0, marginTop: STEP }}>{children}</View>
    </PlantCard>
  );
}

export function PlantBottomAnalytics({
  analytics,
  alarmBars,
  alarmCounts,
  live,
  palette,
  isDark,
  stacked,
}: {
  analytics: PlantAnalytics;
  alarmBars: { labels: string[]; critical: number[]; warning: number[]; info: number[] };
  alarmCounts: { critical: number; warning: number; info: number };
  live: boolean;
  palette: ConsolePalette;
  isDark: boolean;
  stacked: boolean;
}) {
  const { electricityDemand, operatingPower, energyCost } = analytics;
  const liveMeta = live ? 'Live' : 'Demo';
  const liveColor = live ? palette.accent : palette.inkFaint;

  return (
    // `flex: 1` matters: without it the row sizes to its tallest card's content
    // and spills past the bottom of the page instead of the cards sharing the
    // fixed strip the dashboard budgeted for them.
    <View
      style={{
        flex: stacked ? undefined : 1,
        flexDirection: stacked ? 'column' : 'row',
        gap: STEP * 2,
        minHeight: 0,
      }}
    >
      {/* --- electricity demand ------------------------------------------- */}
      <AnalyticsCard
        label="Electricity demand"
        unit="(kW)"
        meta={liveMeta}
        metaColor={liveColor}
        palette={palette}
        isDark={isDark}
        headline={
          <>
            <MetricValue
              value={Math.round(electricityDemand.latest).toLocaleString()}
              unit="kW"
              palette={palette}
              size={19}
            />
            <Delta value={electricityDemand.deltaPct} palette={palette} suffix="vs window start" />
          </>
        }
      >
        <Measured>
          {({ width, height }) => (
            <AreaChart
              values={electricityDemand.values}
              width={width}
              height={height}
              palette={palette}
              color={palette.accent}
              xLabels={electricityDemand.hourLabels}
            />
          )}
        </Measured>
      </AnalyticsCard>

      {/* --- operating power ---------------------------------------------- */}
      <AnalyticsCard
        label="Operating power"
        unit="(MW)"
        meta={liveMeta}
        metaColor={liveColor}
        palette={palette}
        isDark={isDark}
        headline={
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: STEP * 2 }}>
            <View style={{ minWidth: 0 }}>
              <MetricValue value={operatingPower.totalMw.toFixed(2)} unit="MW" palette={palette} size={19} />
              <Delta value={operatingPower.deltaPct} palette={palette} suffix="vs window start" />
            </View>
            <View style={{ paddingBottom: 2 }}>
              <Legend
                items={operatingPower.units.map((unit, index) => ({
                  color: UNIT_COLORS[index % UNIT_COLORS.length],
                  label: unit.label,
                }))}
                palette={palette}
              />
            </View>
          </View>
        }
      >
        <Measured>
          {({ width, height }) => (
            <MultiLineChart
              series={operatingPower.units.map((unit, index) => ({
                id: unit.id,
                values: unit.values,
                color: UNIT_COLORS[index % UNIT_COLORS.length],
              }))}
              width={width}
              height={height}
              palette={palette}
              xLabels={operatingPower.hourLabels}
            />
          )}
        </Measured>
      </AnalyticsCard>

      {/* --- energy cost --------------------------------------------------- */}
      <AnalyticsCard
        label="Energy cost"
        unit={`(${energyCost.currency})`}
        meta={liveMeta}
        metaColor={liveColor}
        palette={palette}
        isDark={isDark}
        headline={
          <>
            <MetricValue
              value={`${energyCost.currency} ${Math.round(energyCost.latest).toLocaleString()}`}
              palette={palette}
              size={19}
            />
            <Delta value={energyCost.deltaPct} palette={palette} suffix="vs window start" />
          </>
        }
      >
        <Measured>
          {({ width, height }) => (
            <BarChart
              values={energyCost.values}
              labels={energyCost.labels}
              width={width}
              height={height}
              palette={palette}
              color={palette.accent}
            />
          )}
        </Measured>
      </AnalyticsCard>

      {/* --- alarms -------------------------------------------------------- */}
      <AnalyticsCard
        label="Alarms by day"
        meta={alarmCounts.critical > 0 ? `${alarmCounts.critical} critical` : `${alarmCounts.warning + alarmCounts.info} open`}
        metaColor={alarmCounts.critical > 0 ? palette.critical : palette.inkFaint}
        palette={palette}
        isDark={isDark}
        minWidth={196}
      >
        <View style={{ flex: 1, minHeight: 0 }}>
          <Measured>
            {({ width, height }) => (
              <SeverityBars
                labels={alarmBars.labels}
                groups={[
                  { id: 'critical', color: palette.critical, values: alarmBars.critical },
                  { id: 'warning', color: palette.warning, values: alarmBars.warning },
                  { id: 'info', color: palette.neutral, values: alarmBars.info },
                ]}
                width={width}
                height={height}
                palette={palette}
              />
            )}
          </Measured>
          <View style={{ marginTop: STEP }}>
            <Legend
              items={[
                { color: palette.critical, label: 'Critical' },
                { color: palette.warning, label: 'Warning' },
                { color: palette.neutral, label: 'Info' },
              ]}
              palette={palette}
            />
          </View>
        </View>
      </AnalyticsCard>
    </View>
  );
}
