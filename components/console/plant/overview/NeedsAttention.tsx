/**
 * The work queue: what moved, and what is furthest from target.
 *
 * Ordering
 * --------
 * An asset whose health has just changed rises to the top, and the rest of the
 * list stays ranked worst-first underneath it. That is the order an operator
 * actually works in: the thing that just moved is the thing they have not
 * looked at yet, and a queue that only ever ranks by severity buries every new
 * event under the same four chronic offenders.
 *
 * Movement
 * --------
 * Rows are positioned rather than laid out, and each one animates to its slot
 * on the console's own easing curve — so a reorder reads as the same four rows
 * changing places, not as a list that blinked and came back different. Three
 * things make it read as motion instead of a jump:
 *
 *  - Every row that has to move moves at once, over one duration. Staggering
 *    them would turn one event into four.
 *  - The hairline dividers are painted into the container at fixed slot
 *    boundaries, so a travelling row passes over the list's structure instead
 *    of dragging its own separator around with it.
 *  - A row that has just changed carries a soft accent wash that decays over a
 *    second and a half, which is what explains the movement — otherwise the
 *    list simply rearranges itself for no visible reason.
 *
 * A row entering the visible window fades in where it belongs rather than
 * sliding in from the top, because it did not come from anywhere.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';

import { statusColor, type ConsolePalette } from '../../../../lib/consoleTheme';
import type { PlantAssetTelemetry } from '../../../../lib/plantAnalytics';
import { STEP } from '../PlantSurfaces';
import {
  ChevronRightIcon,
  IconWell,
  MachineIcon,
  PAD,
  Panel,
  PanelHeader,
  PowerIcon,
  ProcessIcon,
  UtilityIcon,
} from './OverviewChrome';

/** One slot. Rows are absolutely placed on this pitch so they can be animated. */
const ROW_H = 48;
/** Long enough to be followed by eye, short enough not to delay the next tick. */
const REORDER_MS = 520;
/** How long a row stays marked as "this is the one that just moved". */
const FLASH_MS = 1600;
/** The curve the plant transition uses. One console, one deceleration. */
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Which line icon a row wears.
 *
 * Derived from the asset's own name because that is the only thing the model
 * knows about what kind of thing it is. Anything unrecognised gets the generic
 * machine mark rather than a guess.
 */
function AssetIcon({ name, color }: { name: string; color: string }) {
  const key = name.toLowerCase();
  if (key.includes('utility') || key.includes('cooling') || key.includes('water') || key.includes('air')) {
    return <UtilityIcon color={color} size={15} />;
  }
  if (key.includes('power') || key.includes('electric') || key.includes('turbine') || key.includes('substation')) {
    return <PowerIcon color={color} size={15} />;
  }
  if (
    key.includes('preheater') ||
    key.includes('calciner') ||
    key.includes('kiln') ||
    key.includes('process') ||
    key.includes('boiler')
  ) {
    return <ProcessIcon color={color} size={15} />;
  }
  return <MachineIcon color={color} size={15} />;
}

function statusWord(status: PlantAssetTelemetry['status']): string {
  if (status === 'healthy') return 'Healthy';
  if (status === 'warning') return 'At risk';
  if (status === 'critical') return 'Critical';
  return 'Offline';
}

function AttentionRow({
  asset,
  rank,
  target,
  palette,
  selected,
  onPress,
}: {
  asset: PlantAssetTelemetry;
  rank: number;
  target: number;
  palette: ConsolePalette;
  selected: boolean;
  onPress?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const tone = statusColor(palette, asset.status);
  const gap = asset.health - target;

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={`${asset.name}, ${statusWord(asset.status)}, health ${asset.health} of 100`}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: STEP * 2.5,
        paddingHorizontal: STEP * 1.5,
        borderRadius: 4,
        backgroundColor: selected ? palette.selected : hovered ? palette.hover : 'transparent',
      }}
    >
      <Text className="font-mono" style={{ width: 18, fontSize: 10.5, color: palette.inkFaint }}>
        {String(rank).padStart(2, '0')}
      </Text>

      <IconWell palette={palette} size={28}>
        <AssetIcon name={asset.name} color={palette.accent} />
      </IconWell>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} className="font-body-bold" style={{ fontSize: 12.5, color: palette.ink }}>
          {asset.name}
        </Text>
        <Text numberOfLines={1} className="font-body" style={{ marginTop: 2, fontSize: 10.5, color: tone }}>
          {statusWord(asset.status)}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
          <Text className="font-mono" style={{ fontSize: 14, fontWeight: '600', color: palette.ink }}>
            {asset.health}
          </Text>
          <Text className="font-mono" style={{ fontSize: 9.5, color: palette.inkFaint }}>
            /100
          </Text>
        </View>
        <Text
          className="font-mono"
          style={{ marginTop: 1, fontSize: 10, fontWeight: '600', color: gap >= 0 ? palette.accent : palette.critical }}
        >
          {gap >= 0 ? '+' : ''}
          {gap} pts
        </Text>
      </View>

      <ChevronRightIcon color={hovered || selected ? palette.inkMuted : palette.inkDisabled} size={13} />
    </Pressable>
  );
}

export function NeedsAttention({
  assets,
  target,
  maxVisible = 4,
  selectedId,
  onSelect,
  palette,
  isDark,
}: {
  /** The full asset set. This panel does its own ranking. */
  assets: PlantAssetTelemetry[];
  target: number;
  maxVisible?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  palette: ConsolePalette;
  isDark: boolean;
}) {
  // When each asset's health last moved. Assets that have not moved since the
  // console was opened share a stamp of 0 and stay ranked by health.
  const [movedAt, setMovedAt] = useState<Record<string, number>>({});
  const lastHealth = useRef(new Map<string, number>());
  const [listHeight, setListHeight] = useState(0);

  useEffect(() => {
    const seen = lastHealth.current;
    const at = Date.now();
    const moved: Record<string, number> = {};
    const live = new Set<string>();

    for (const asset of assets) {
      live.add(asset.id);
      const before = seen.get(asset.id);
      // A first sighting is not a change — it is the baseline.
      if (before !== undefined && before !== asset.health) moved[asset.id] = at;
      seen.set(asset.id, asset.health);
    }
    for (const id of [...seen.keys()]) if (!live.has(id)) seen.delete(id);

    if (Object.keys(moved).length > 0) setMovedAt((current) => ({ ...current, ...moved }));
  }, [assets]);

  const ranked = useMemo(
    () =>
      [...assets].sort((a, b) => {
        const movedA = movedAt[a.id] ?? 0;
        const movedB = movedAt[b.id] ?? 0;
        if (movedA !== movedB) return movedB - movedA;
        return a.health - b.health;
      }),
    [assets, movedAt],
  );

  // Never draw a row the panel cannot hold: a clipped row at the bottom of a
  // fixed-height strip looks like a rendering fault, not a list that continues.
  const fits = listHeight > 0 ? Math.max(1, Math.floor(listHeight / ROW_H)) : maxVisible;
  const visible = ranked.slice(0, Math.min(maxVisible, fits));
  const order = visible.map((asset) => asset.id).join('|');

  // One animated value per row per property, held across renders so a row keeps
  // its position when the list re-renders for an unrelated reason.
  const slots = useRef(new Map<string, Animated.Value>()).current;
  const fades = useRef(new Map<string, Animated.Value>()).current;
  const flashes = useRef(new Map<string, Animated.Value>()).current;

  const track = (id: string, index: number) => {
    let slot = slots.get(id);
    let fade = fades.get(id);
    let flash = flashes.get(id);
    if (!slot) {
      // A row that has never been placed starts where it belongs and fades up.
      slot = new Animated.Value(index * ROW_H);
      slots.set(id, slot);
    }
    if (!fade) {
      fade = new Animated.Value(0);
      fades.set(id, fade);
    }
    if (!flash) {
      flash = new Animated.Value(0);
      flashes.set(id, flash);
    }
    return { slot, fade, flash };
  };

  useEffect(() => {
    const runs: Animated.CompositeAnimation[] = [];
    visible.forEach((asset, index) => {
      const slot = slots.get(asset.id);
      const fade = fades.get(asset.id);
      if (slot) {
        runs.push(
          Animated.timing(slot, { toValue: index * ROW_H, duration: REORDER_MS, easing: EASE, useNativeDriver: false }),
        );
      }
      if (fade) {
        runs.push(Animated.timing(fade, { toValue: 1, duration: REORDER_MS, easing: EASE, useNativeDriver: false }));
      }
    });
    Animated.parallel(runs).start();

    const live = new Set(visible.map((asset) => asset.id));
    for (const id of [...slots.keys()]) {
      if (live.has(id)) continue;
      slots.delete(id);
      fades.delete(id);
      flashes.delete(id);
    }
    // `order` is the dependency that matters: the list only re-animates when the
    // sequence of ids changes, not on every telemetry tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, listHeight]);

  useEffect(() => {
    const now = Date.now();
    for (const [id, at] of Object.entries(movedAt)) {
      // Only the change that just landed lights up; replaying older stamps on
      // every render would leave the whole list permanently washed.
      if (now - at > 500) continue;
      const flash = flashes.get(id);
      if (!flash) continue;
      flash.setValue(1);
      Animated.timing(flash, {
        toValue: 0,
        duration: FLASH_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movedAt]);

  return (
    <Panel
      palette={palette}
      isDark={isDark}
      style={{ flex: 1, minWidth: 0, minHeight: 0, padding: PAD, paddingHorizontal: PAD - STEP * 1.5 }}
    >
      <View style={{ paddingHorizontal: STEP * 1.5 }}>
        <PanelHeader
          label="Needs attention"
          subtitle="Ranked by latest change, then health"
          palette={palette}
          right={
            ranked.length > visible.length ? (
              <Text className="font-mono" style={{ fontSize: 10.5, color: palette.inkFaint }}>
                {visible.length} of {ranked.length}
              </Text>
            ) : undefined
          }
        />
      </View>

      <View
        style={{ flex: 1, minHeight: 0, marginTop: STEP * 2.5 }}
        onLayout={(event) => {
          const next = event.nativeEvent.layout.height;
          setListHeight((current) => (Math.abs(current - next) < 0.5 ? current : next));
        }}
      >
        {visible.length === 0 ? (
          <Text className="font-body" style={{ paddingHorizontal: STEP * 1.5, fontSize: 11.5, color: palette.inkFaint }}>
            No assets placed on the plant map yet.
          </Text>
        ) : (
          <>
            {/* The list's structure, painted at the slot boundaries. Rows travel
                over it rather than carrying it with them. */}
            {visible.slice(1).map((asset, index) => (
              <View
                key={`rule-${asset.id}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: STEP * 1.5,
                  right: STEP * 1.5,
                  top: (index + 1) * ROW_H,
                  height: 1,
                  backgroundColor: palette.lineSubtle,
                }}
              />
            ))}

            {visible.map((asset, index) => {
              const { slot, fade, flash } = track(asset.id, index);
              return (
                <Animated.View
                  key={asset.id}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: 0,
                    height: ROW_H,
                    opacity: fade,
                    transform: [{ translateY: slot }],
                  }}
                >
                  {/* Why this row moved. Decays; never a permanent state. */}
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 2,
                      bottom: 2,
                      borderRadius: 4,
                      backgroundColor: palette.accentSoft,
                      opacity: flash,
                    }}
                  />
                  <AttentionRow
                    asset={asset}
                    rank={index + 1}
                    target={target}
                    palette={palette}
                    selected={selectedId === asset.id}
                    onPress={onSelect ? () => onSelect(asset.id) : undefined}
                  />
                </Animated.View>
              );
            })}
          </>
        )}
      </View>
    </Panel>
  );
}
