/**
 * CONNECTIVITY — where each measurement physically comes from.
 *
 * Signal answers "what is this reading, and is it inside its limits". This
 * answers the question directly underneath it: *which piece of hardware is
 * producing that number*. Gateway, rack, slot, card, terminal, channel — the
 * whole chain, with the real slot card drawn from the rack configuration rather
 * than described in words.
 *
 * It replaces the live instrument rail that used to sit beside every screen.
 * The rail was a second copy of the Signal table pinned to the side of the
 * page; this is the half of that subject the Signal table genuinely could not
 * carry, and it earns a tab instead of a gutter.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { relativeAge, type ConnectionQuality, type ParameterConnection } from '../../../../lib/analysis/connectivity';
import type { DeviceNode } from '../../../../lib/devices';
import type { LiveState } from '../../../../lib/liveTelemetry';
import type { CardNode } from '../../../../lib/rack';
import { alpha, consolePalette, variantStyle, type Variant } from '../../../ui';
import { SlotCard } from '../../rack/SlotCard';
import { Block, EmptyNote, PressSurface } from './AnalyzerParts';

const QUALITY_VARIANT: Record<ConnectionQuality, Variant> = {
  good: 'success',
  warning: 'warning',
  bad: 'destructive',
  offline: 'muted',
};

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  good: 'Live',
  warning: 'Degraded',
  bad: 'Bad',
  offline: 'Silent',
};

/** One hop of the chain. Reads left to right, the way the signal travels. */
function Hop({
  label,
  value,
  icon,
  tone,
  last = false,
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tone?: string;
  last?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View className="flex-row items-center">
      <View
        className="min-w-0 rounded-xl border px-2.5 py-1.5"
        style={{ borderColor: tone ? alpha(tone, 0.35) : palette.line, backgroundColor: palette.panelRaised }}
      >
        <View className="flex-row items-center gap-1.5">
          <MaterialCommunityIcons name={icon} size={11} color={tone ?? palette.inkFaint} />
          <Text className="font-mono text-[8px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
            {label}
          </Text>
        </View>
        <Text className="mt-0.5 font-mono text-[11.5px]" style={{ color: palette.ink }} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {last ? null : (
        <MaterialCommunityIcons name="chevron-right" size={14} color={palette.inkFaint} style={{ marginHorizontal: 3 }} />
      )}
    </View>
  );
}

/**
 * One parameter, and the hardware behind it.
 *
 * Selecting a row draws the physical slot card it is wired into, at the size
 * the rack view draws it, so "slot 05" is a card an engineer can recognise on
 * the floor rather than a number in a table.
 */
function ConnectionRow({
  row,
  device,
  card,
  live,
  selected,
  onSelect,
}: {
  row: ParameterConnection;
  device: DeviceNode | undefined;
  card: CardNode | null;
  live?: LiveState;
  selected: boolean;
  onSelect: () => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, QUALITY_VARIANT[row.quality]);
  const unmapped = row.state === 'unmapped';

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
      <PressSurface
        onPress={onSelect}
        selected={selected}
        accent={style.accent}
        accessibilityRole="button"
        accessibilityLabel={`${row.parameter}, ${QUALITY_LABEL[row.quality]}. ${selected ? 'Hide' : 'Show'} its slot card.`}
        className="flex-row flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
        style={{ backgroundColor: selected ? palette.panelRaised : palette.panel, borderRadius: 12 }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 6, backgroundColor: style.accent }} />

        <View className="min-w-[168px] flex-1">
          <Text className="font-body-bold text-[12.5px]" style={{ color: palette.ink }} numberOfLines={1}>
            {row.parameter}
          </Text>
          <Text className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }} numberOfLines={1}>
            {row.tag ? `${row.tag} · ${row.tagLabel ?? ''}` : 'Not resolved onto a diagnostic tag'}
          </Text>
        </View>

        {unmapped ? (
          <Text className="min-w-0 flex-1 font-body text-[11px]" style={{ color: palette.warning }} numberOfLines={2}>
            {row.note}
          </Text>
        ) : (
          <View className="flex-row flex-wrap items-center gap-y-1.5">
            <Hop label="Gateway" value={row.gatewayName} icon="router-wireless" tone={row.gatewayOnline ? palette.accent : palette.neutral} />
            <Hop label="Rack" value={row.rackName} icon="server" tone={row.rackOnline ? palette.accent : palette.neutral} />
            <Hop label="Slot" value={String(row.slot).padStart(2, '0')} icon="card-outline" />
            <Hop label="Channel" value={row.channelCode} icon="access-point" />
            <Hop label="Terminal" value={row.inputId} icon="power-plug-outline" last />
          </View>
        )}

        <View className="items-end" style={{ minWidth: 92 }}>
          <View className="rounded-full px-2 py-[3px]" style={{ backgroundColor: style.tint }}>
            <Text className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: style.accent }}>
              {QUALITY_LABEL[row.quality]}
            </Text>
          </View>
          <Text className="mt-1 font-mono text-[9.5px]" style={{ color: palette.inkFaint }} numberOfLines={1}>
            {relativeAge(row.lastUpdatedAt)}
          </Text>
        </View>

        <MaterialCommunityIcons name={selected ? 'chevron-up' : 'chevron-down'} size={15} color={palette.inkFaint} />
      </PressSurface>

      {selected && !unmapped ? (
        <View
          className="flex-row flex-wrap items-start gap-5 px-4 pb-4 pt-1"
          style={{ backgroundColor: palette.panelRaised }}
        >
          {/* The card as the rack draws it, so a slot number becomes a thing you
              can walk up to and recognise. */}
          <View className="items-center gap-2">
            <SlotCard
              slot={row.slot}
              card={card}
              device={device}
              live={live}
              width={82}
              editable={false}
              onPressEmpty={() => {}}
              onPressCard={() => {}}
            />
            <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
              Slot {String(row.slot).padStart(2, '0')}
            </Text>
          </View>

          <View className="min-w-[220px] flex-1" style={{ gap: 10 }}>
            <View className="flex-row flex-wrap" style={{ gap: 18 }}>
              {[
                { label: 'Card', value: row.cardType },
                { label: 'Signal type', value: row.signalType },
                { label: 'Carries', value: row.dataType },
                { label: 'Channel id', value: row.channelId },
                { label: 'Reading', value: row.value === null ? '—' : `${row.value} ${row.unit}`.trim() },
              ].map((fact) => (
                <View key={fact.label} style={{ minWidth: 116 }}>
                  <Text className="font-mono text-[8.5px] uppercase tracking-[0.18em]" style={{ color: palette.inkFaint }}>
                    {fact.label}
                  </Text>
                  <Text className="mt-1 font-mono text-[11.5px]" style={{ color: palette.ink }} numberOfLines={1}>
                    {fact.value || '—'}
                  </Text>
                </View>
              ))}
            </View>

            {row.note ? (
              <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
                {row.note}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function ConnectivityTab({
  connections,
  devices,
  cards,
  live,
}: {
  connections: ParameterConnection[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [selected, setSelected] = useState<string | null>(null);

  // Grouped by the rack the channels physically sit in, because that is how an
  // engineer walks to them: one cabinet, one faceplate, the slots in order.
  const racks = useMemo(() => {
    const order: string[] = [];
    const byRack = new Map<string, ParameterConnection[]>();
    for (const row of connections) {
      const key = row.state === 'unmapped' ? '' : row.rackId;
      if (!byRack.has(key)) {
        byRack.set(key, []);
        order.push(key);
      }
      byRack.get(key)!.push(row);
    }
    return order.map((rackId) => ({
      rackId,
      rack: devices.find((device) => device.id === rackId),
      rows: byRack.get(rackId)!.slice().sort((a, b) => a.slot - b.slot),
    }));
  }, [connections, devices]);

  if (connections.length === 0) {
    return (
      <Block first title="Nothing mapped">
        <EmptyNote>
          No saved Mappable Box links exist for this machine, so there is no acquisition chain to trace yet.
        </EmptyNote>
      </Block>
    );
  }

  return (
    <View>
      {racks.map((group, index) => (
        <Block
          key={group.rackId || 'unmapped'}
          first={index === 0}
          padded={false}
          title={group.rackId ? (group.rack?.name ?? 'Unknown rack') : 'Not wired to a rack channel'}
          meta={
            group.rackId
              ? `${group.rows.length} parameter${group.rows.length === 1 ? '' : 's'} acquired here. Select one to see the card it is wired into.`
              : 'These points are mapped on the canvas but resolve onto no rack channel.'
          }
        >
          {group.rows.map((row) => (
            <ConnectionRow
              key={row.parameterId}
              row={row}
              device={group.rack}
              card={cards.find((entry) => entry.deviceId === row.rackId && entry.slot === row.slot) ?? null}
              live={live}
              selected={selected === row.parameterId}
              onSelect={() => setSelected((current) => (current === row.parameterId ? null : row.parameterId))}
            />
          ))}
        </Block>
      ))}

      <View className="px-4 pb-3.5 pt-3" style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
        <Text className="font-body text-[10px] leading-[14px]" style={{ color: palette.inkFaint }}>
          The chain is read from the saved canvas mappings and the device tree, and the tag column resolves through the
          same function the diagnostic model itself uses — so a tag shown here can never disagree with the tag the model
          read.
        </Text>
      </View>
    </View>
  );
}
