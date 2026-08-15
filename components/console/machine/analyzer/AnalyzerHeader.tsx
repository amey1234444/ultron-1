/**
 * The Analyzer's control surface.
 *
 * Identity and provenance never scroll away: every number below the header is
 * conditional on which model is running and where its measurements came from,
 * and a reader who has scrolled past "scenario injection" would be reading
 * fabricated measurements as if they were the plant.
 *
 * One band, two rows of facts, no wasted height — the identity line on top, the
 * conditions the reading depends on beneath it, and the source pill and
 * scenario controls held to the right where the eye ends up.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { Badge, Button, consolePalette, StatusDot, variantStyle, type Variant } from '../../../ui';

export type HeaderFact = { label: string; value: string; variant?: Variant };

export function AnalyzerHeader({
  facts,
  sourceLabel,
  sourceVariant,
  scenarioLabel,
  scenarioActive,
  onToggleLibrary,
  onReturnToLive,
}: {
  facts: HeaderFact[];
  sourceLabel: string;
  sourceVariant: Variant;
  /** Button label — the running scenario's id, or "Scenarios". */
  scenarioLabel: string;
  scenarioActive: boolean;
  onToggleLibrary: () => void;
  onReturnToLive: () => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View
      className="gap-2.5 px-5 py-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-6"
      style={{ backgroundColor: palette.panel, borderBottomWidth: 1, borderBottomColor: palette.line }}
    >
      <View className="min-w-0 flex-1 gap-1.5">
        <View className="flex-row flex-wrap items-center gap-2">
          <MaterialCommunityIcons name="stethoscope" size={16} color={palette.accent} />
          <Text className="font-body-bold text-[17px] tracking-[-0.025em]" style={{ color: palette.ink }}>
            Analysis layer
          </Text>
          <Badge variant="muted" icon="hand-back-right-outline">
            Advisory only
          </Badge>
        </View>

        {/* The conditions the reading is valid under, ruled into one line so
            they read as a set rather than as six loose captions. */}
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
          {facts.map((fact) => {
            const accent = fact.variant ? variantStyle(palette, fact.variant).accent : undefined;
            return (
              <View key={fact.label} className="flex-row items-baseline gap-1.5">
                <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                  {fact.label}
                </Text>
                <View className="flex-row items-center gap-1.5">
                  {accent ? <View style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: accent }} /> : null}
                  <Text className="font-mono text-[11px]" style={{ color: palette.ink }} numberOfLines={1}>
                    {fact.value}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        <View
          className="flex-row items-center gap-2 rounded-lg border px-2.5 py-1.5"
          style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
        >
          <StatusDot variant={sourceVariant} />
          <Text className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkMuted }}>
            {sourceLabel}
          </Text>
        </View>
        <Button
          tone={scenarioActive ? 'warning' : 'secondary'}
          icon="flask-outline"
          onPress={onToggleLibrary}
          accessibilityLabel="Open the fault scenario library"
        >
          {scenarioLabel}
        </Button>
        {scenarioActive ? (
          <Button tone="secondary" icon="broadcast" onPress={onReturnToLive} accessibilityLabel="Return to live data">
            Live data
          </Button>
        ) : null}
      </View>
    </View>
  );
}
