/**
 * The line above the KPI row: what this page is, and whether it is live.
 *
 * Open, not boxed — it is the top of the page, not another card sitting on it.
 */
import { Pressable, Text, View } from 'react-native';

import { alpha, type ConsolePalette } from '../../../lib/consoleTheme';
import { LivePill, STEP } from './PlantSurfaces';

function HeaderAction({
  label,
  onPress,
  palette,
  tone,
  /**
   * Marks the one action on this header that changes what page you are on.
   *
   * Entering the twin used to also happen on any click into the yard, so the
   * button was one of two equal ways in and was styled like its neighbour.
   * It is now the only way in, and a sole entrance that looks like a secondary
   * control is an entrance people do not find.
   */
  primary = false,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  palette: ConsolePalette;
  tone?: string;
  primary?: boolean;
  accessibilityHint?: string;
}) {
  const ink = tone ?? palette.inkMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={{
        paddingHorizontal: STEP * (primary ? 3.5 : 3),
        paddingVertical: STEP * 1.5,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: primary ? alpha(ink, 0.45) : palette.line,
        backgroundColor: primary ? alpha(ink, 0.13) : palette.panel,
      }}
    >
      <Text
        className="font-mono"
        style={{ fontSize: primary ? 10.5 : 10, letterSpacing: 1.3, textTransform: 'uppercase', color: ink }}
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
  /** Enters the fullscreen twin. The only way in — clicking the yard selects
   *  an asset, it does not change the page. */
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
        {onEnter ? (
          <HeaderAction
            label="Enter map"
            onPress={onEnter}
            palette={palette}
            tone={palette.accent}
            primary
            accessibilityHint="Opens the plant map fullscreen"
          />
        ) : null}
      </View>
    </View>
  );
}
