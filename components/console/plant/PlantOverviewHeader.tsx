/**
 * The line above the KPI row: what this page is, and whether it is live.
 *
 * Open, not boxed — it is the top of the page, not another card sitting on it.
 */
import { Pressable, Text, View } from 'react-native';

import type { ConsolePalette } from '../../../lib/consoleTheme';
import { LivePill, STEP } from './PlantSurfaces';

function HeaderAction({
  label,
  onPress,
  palette,
  tone,
}: {
  label: string;
  onPress: () => void;
  palette: ConsolePalette;
  tone?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        paddingHorizontal: STEP * 3,
        paddingVertical: STEP * 1.5,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: palette.line,
        backgroundColor: palette.panel,
      }}
    >
      <Text
        className="font-mono"
        style={{ fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase', color: tone ?? palette.inkMuted }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function PlantOverviewHeader({
  title,
  live,
  facts,
  palette,
  canEdit,
  onEdit,
  onEnter,
}: {
  title: string;
  live: boolean;
  /** Short factual clauses, joined with separators. */
  facts: string[];
  palette: ConsolePalette;
  canEdit?: boolean;
  onEdit?: () => void;
  /** Enters the fullscreen twin. Lives here rather than over the world, where
   *  it collided with the analytics strip along the bottom edge. */
  onEnter?: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: STEP * 2.5 }}>
      <Text className="font-heading" style={{ fontSize: 16, letterSpacing: -0.2, color: palette.ink }}>
        {title}
      </Text>

      <LivePill palette={palette} live={live} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: STEP * 1.5, flexShrink: 1, minWidth: 0 }}>
        {facts.map((fact, index) => (
          <View key={fact} style={{ flexDirection: 'row', alignItems: 'center', gap: STEP * 1.5 }}>
            {index > 0 ? (
              <Text style={{ fontSize: 11.5, color: palette.inkFaint }} accessibilityElementsHidden>
                ·
              </Text>
            ) : null}
            <Text numberOfLines={1} className="font-body" style={{ fontSize: 12.5, color: palette.inkMuted }}>
              {fact}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: STEP * 1.5 }}>
        {canEdit && onEdit ? <HeaderAction label="Edit map" onPress={onEdit} palette={palette} /> : null}
        {onEnter ? <HeaderAction label="Enter plant" onPress={onEnter} palette={palette} tone={palette.accent} /> : null}
      </View>
    </View>
  );
}
