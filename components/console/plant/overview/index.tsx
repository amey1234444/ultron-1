/**
 * The Plant Overview's two panel groups.
 *
 * The page is one 3D yard with instrument panels floating over it: a rail down
 * the right that answers "how is the plant, and what should I do", and a strip
 * across the bottom that answers "how did it get here, and which asset first".
 * Those two questions are why the panels are grouped the way they are, and the
 * grouping lives here so `DashboardOverview` places two objects rather than
 * arranging six.
 */
import { ScrollView, View, type ViewStyle } from 'react-native';

import type { ConsolePalette } from '../../../../lib/consoleTheme';
import type { Insight } from '../../../../lib/dashboardMetrics';
import type { PlantAssetTelemetry } from '../../../../lib/plantAnalytics';
import { FindingsPanel } from './FindingsPanel';
import { HealthScoreHistory, type HealthPoint } from './HealthScoreHistory';
import { NeedsAttention } from './NeedsAttention';
import { GAP } from './OverviewChrome';
import { PlantHealthScoreCard, type AssetDistribution } from './PlantHealthScoreCard';

export { FindingsPanel } from './FindingsPanel';
export { HealthScoreHistory, type HealthPoint } from './HealthScoreHistory';
export { NeedsAttention } from './NeedsAttention';
export { GAP, PAD } from './OverviewChrome';
export { PlantHealthScoreCard, type AssetDistribution } from './PlantHealthScoreCard';

/**
 * The right rail: the score, then what to do about it.
 *
 * It scrolls because the findings list is unbounded — a plant with eleven open
 * findings must not push the score off the top of the rail, and it must not
 * make the rail grow past the page either.
 */
export function PlantRightRail({
  score,
  target,
  distribution,
  updatedLabel,
  findings,
  palette,
  isDark,
  style,
}: {
  score: number;
  target: number;
  distribution: AssetDistribution;
  updatedLabel: string;
  findings: Insight[];
  palette: ConsolePalette;
  isDark: boolean;
  style?: ViewStyle;
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      style={[{ flex: 1, minHeight: 0 }, style]}
      contentContainerStyle={{ gap: GAP }}
    >
      <PlantHealthScoreCard
        score={score}
        target={target}
        distribution={distribution}
        updatedLabel={updatedLabel}
        palette={palette}
        isDark={isDark}
      />
      <FindingsPanel findings={findings} palette={palette} isDark={isDark} />
    </ScrollView>
  );
}

/**
 * The bottom strip: the trend, and the queue that comes out of it.
 *
 * The chart takes the larger share because it is the only thing on the page
 * with a time axis, and a trend squeezed narrow stops being a trend.
 */
export function PlantBottomStrip({
  history,
  target,
  rangeLabel,
  assets,
  selectedId,
  onSelectAsset,
  palette,
  isDark,
  stacked = false,
}: {
  history: HealthPoint[];
  target: number;
  rangeLabel: string;
  assets: PlantAssetTelemetry[];
  selectedId?: string | null;
  onSelectAsset?: (id: string) => void;
  palette: ConsolePalette;
  isDark: boolean;
  stacked?: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        flexDirection: stacked ? 'column' : 'row',
        gap: GAP,
      }}
    >
      <View style={{ flex: stacked ? 1 : 1.2, minWidth: 0, minHeight: 0 }}>
        <HealthScoreHistory
          points={history}
          target={target}
          rangeLabel={rangeLabel}
          palette={palette}
          isDark={isDark}
        />
      </View>
      <View style={{ flex: stacked ? 1 : 0.8, minWidth: 0, minHeight: 0 }}>
        <NeedsAttention
          assets={assets}
          target={target}
          selectedId={selectedId}
          onSelect={onSelectAsset}
          palette={palette}
          isDark={isDark}
        />
      </View>
    </View>
  );
}
