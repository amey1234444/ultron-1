import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { gatewayForRack, racksForGateway, type DeviceNode } from '../../../lib/devices';
import type { ChannelRef } from '../../../lib/rack';
import type { TrailStatus } from './AdjustableTrail';
import { LIVE_RANGE_FOR_LETTER, useLiveValue } from './liveValue';
import { PointCard18, POINT_CARD_HEIGHT, POINT_CARD_WIDTH } from './PointCard18';

export type Point = { x: number; y: number };

export const UNLINKED_BOX_WIDTH = 236;
export const MAPPABLE_BOX_WIDTH = POINT_CARD_WIDTH;
export const MAPPABLE_BOX_HEIGHT = POINT_CARD_HEIGHT;

function statusFor(channel: ChannelRef, value: number): TrailStatus {
  if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) return 'critical';
  if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) return 'warning';
  return 'normal';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function channelLocation(channel: ChannelRef) {
  const match = channel.id.match(/\.CH(\d+)$/);
  const channelNumber = match?.[1] ?? '?';
  return `S${String(channel.slot).padStart(2, '0')}.CH${channelNumber}`;
}

function searchableChannelText(channel: ChannelRef) {
  return [channel.deviceName, channel.label, channel.code, channelLocation(channel), channel.unit].join(' ').toLowerCase();
}

export type MappableBoxProps = {
  x: number;
  y: number;
  label: string;
  attached: boolean;
  // Where a trail is actually attached right now (any border/corner of the card,
  // or the body) — defaults to (x, y) when nothing's attached yet. The indicator
  // dot renders here instead of a fixed spot, so it always shows the real
  // connection point rather than a stale default.
  connectorPoint: Point;
  channel: ChannelRef | null;
  dataLive?: boolean;
  liveReading?: { value: number; unit?: string };
  channels: ChannelRef[];
  pickableChannels?: ChannelRef[];
  devices?: DeviceNode[];
  canvasWidth: number;
  canvasHeight: number;
  // Current stage scale — converts screen-pixel gesture deltas to stage units.
  stageScale?: number;
  // Actual View: no dragging, no editing, no delete/unlink — just the label or
  // the live channel readout.
  readOnly?: boolean;
  hideUnlink?: boolean;
  onDrag: (point: Point) => void;
  onLabelChange: (label: string) => void;
  onPickChannel: (channel: ChannelRef | null) => void;
  onDelete: () => void;
  onLiveValueChange?: (value: number) => void;
  // Reports the actual rendered size so callers doing hit-testing/anchoring can
  // use the current boundary after a point is linked, unlinked, or expanded.
  onSizeChange?: (size: { width: number; height: number }) => void;
};

// A free-floating, user-labelled connection point. Its (x, y) anchors the card's
// position and drag origin; the connector indicator dot is drawn separately at
// `connectorPoint`, wherever a trail is actually attached.
export function MappableBox({
  x,
  y,
  label,
  attached,
  connectorPoint,
  channel,
  dataLive = true,
  liveReading,
  channels,
  pickableChannels,
  devices = [],
  canvasWidth,
  canvasHeight,
  stageScale = 1,
  readOnly = false,
  hideUnlink = false,
  onDrag,
  onLabelChange,
  onPickChannel,
  onDelete,
  onLiveValueChange,
  onSizeChange,
}: MappableBoxProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  const [pickerOpen, setPickerOpen] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null);
  const liveValue = useLiveValue(channel?.letter ?? 'X', !!channel && dataLive);
  const displayValue = liveReading?.value ?? liveValue;
  const renderedWidth = channel ? POINT_CARD_WIDTH : UNLINKED_BOX_WIDTH;
  const pickerChannels = pickableChannels ?? channels;
  const pickerGateways = useMemo(
    () => devices.filter((device) => device.type === 'Gateway' && !device.archived),
    [devices],
  );
  const selectedGateway = useMemo(
    () => pickerGateways.find((gateway) => gateway.id === selectedGatewayId) ?? null,
    [pickerGateways, selectedGatewayId],
  );
  const selectedGatewayRacks = useMemo(() => (selectedGateway ? racksForGateway(selectedGateway, devices) : []), [devices, selectedGateway]);
  const selectedRack = useMemo(
    () => selectedGatewayRacks.find((rack) => rack.id === selectedRackId) ?? null,
    [selectedGatewayRacks, selectedRackId],
  );
  const pickerChannelsForRack = useMemo(
    () => (selectedRack ? pickerChannels.filter((c) => c.rackId === selectedRack.id) : pickerChannels),
    [pickerChannels, selectedRack],
  );
  const filteredPickerChannels = useMemo(() => {
    const query = channelSearch.trim().toLowerCase();
    if (!query) return pickerChannelsForRack;
    return pickerChannelsForRack.filter((c) => searchableChannelText(c).includes(query));
  }, [channelSearch, pickerChannelsForRack]);

  useEffect(() => {
    if (channel && dataLive) onLiveValueChange?.(displayValue);
  }, [channel, dataLive, displayValue, onLiveValueChange]);

  useEffect(() => {
    if (!pickerOpen || channel) setChannelSearch('');
  }, [channel, pickerOpen]);

  useEffect(() => {
    if (!pickerOpen) {
      setSelectedGatewayId(null);
      setSelectedRackId(null);
      return;
    }
    if (selectedGatewayId && !pickerGateways.some((gateway) => gateway.id === selectedGatewayId)) {
      setSelectedGatewayId(null);
      setSelectedRackId(null);
    }
  }, [pickerGateways, pickerOpen, selectedGatewayId]);

  useEffect(() => {
    if (selectedRackId && !selectedGatewayRacks.some((rack) => rack.id === selectedRackId)) {
      setSelectedRackId(null);
    }
  }, [selectedGatewayRacks, selectedRackId]);

  const pointRef = useRef({ x, y });
  pointRef.current = { x, y };
  const boundsRef = useRef({ canvasWidth, canvasHeight });
  boundsRef.current = { canvasWidth, canvasHeight };
  const renderedWidthRef = useRef(renderedWidth);
  renderedWidthRef.current = renderedWidth;
  // Gesture dx/dy arrive in screen pixels; box coordinates live in stage units
  // under a scale transform, so deltas must be divided by the current stage scale.
  const scaleRef = useRef(stageScale);
  scaleRef.current = stageScale;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  const dragOrigin = useRef({ x, y });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !readOnlyRef.current,
      onMoveShouldSetPanResponder: () => !readOnlyRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragOrigin.current = pointRef.current;
      },
      onPanResponderMove: (_evt, gesture) => {
        const { canvasWidth: cw, canvasHeight: ch } = boundsRef.current;
        const s = scaleRef.current || 1;
        onDragRef.current({
          x: clamp(dragOrigin.current.x + gesture.dx / s, 8, Math.max(8, cw - renderedWidthRef.current - 24)),
          y: clamp(dragOrigin.current.y + gesture.dy / s, 24, Math.max(24, ch - 24)),
        });
      },
    }),
  ).current;

  const connectorColour = attached ? '#3FB950' : '#C9A15C';

  if (channel) {
    const decimals = LIVE_RANGE_FOR_LETTER[channel.letter].decimals;
    const status = dataLive ? statusFor(channel, displayValue) : 'offline';
    return (
      <>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: connectorPoint.x - 7,
            top: connectorPoint.y - 7,
            width: 14,
            height: 14,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: connectorColour,
            backgroundColor: isDark ? '#0A0A0A' : '#FAFAFA',
          }}
        />

        <View
          onLayout={(e) => onSizeChange?.({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          style={{ position: 'absolute', left: x + 14, top: y - 38 }}
        >
          <PointCard18
            tag={channel.code}
            channel={channel.code}
            title={channel.label}
            value={dataLive ? displayValue.toFixed(decimals) : '--'}
            unit={dataLive ? liveReading?.unit ?? channel.unit : ''}
            status={status}
            interactive={!readOnly}
            dragHandlers={panResponder.panHandlers}
            onDelete={onDelete}
            onUnlink={() => onPickChannel(null)}
            hideUnlink={hideUnlink}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: connectorPoint.x - 7,
          top: connectorPoint.y - 7,
          width: 14,
          height: 14,
          borderRadius: 7,
          borderWidth: 2,
          borderColor: connectorColour,
          backgroundColor: isDark ? '#0A0A0A' : '#FAFAFA',
        }}
      />

      <View
        onLayout={(e) => onSizeChange?.({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
        className={cn('overflow-hidden rounded-xl border border-dashed', lineClass, isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
        style={{ position: 'absolute', left: x + 12, top: y - 30, width: UNLINKED_BOX_WIDTH }}
      >
        <View
          {...panResponder.panHandlers}
          // @ts-expect-error web-only: avoid the drag handle picking up text selection.
          style={{ userSelect: 'none', cursor: readOnly ? 'default' : 'grab' }}
          className={cn('flex-row items-center justify-between border-b px-2 py-1', lineClass)}
        >
          <Text className={cn('font-body text-xs', mutedClass)}>{readOnly ? 'point' : '⠿⠿ point'}</Text>
          {!readOnly && (
            <Pressable onPress={onDelete} hitSlop={6}>
              <Text className="font-body-bold text-xs text-status-critical">×</Text>
            </Pressable>
          )}
        </View>

        {readOnly ? (
          <Text className={cn('font-body-medium px-2.5 py-2 text-sm', label ? inkClass : mutedClass)}>{label || 'Unlabelled point'}</Text>
        ) : (
          <>
            <TextInput
              value={label}
              onChangeText={onLabelChange}
              placeholder="Label this point"
              placeholderTextColor={isDark ? '#8A8A8A' : '#6B6B6B'}
              className={cn('font-body-medium px-2.5 py-2 text-sm', inkClass)}
            />

            <Pressable onPress={() => setPickerOpen((v) => !v)} className={cn('border-t px-2.5 py-1.5', lineClass)}>
              <Text className={cn('font-body text-[11px]', mutedClass)}>⚭ Pick rack channel</Text>
            </Pressable>
          </>
        )}

        {pickerOpen && !channel && !readOnly && (
          <View className={cn('border-t', lineClass)}>
            {pickerChannels.length === 0 ? (
              <Text className={cn('px-2.5 py-2 font-body text-[11px] italic', mutedClass)}>No active rack channels yet.</Text>
            ) : devices.length > 0 && !selectedGateway ? (
              <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                <Text className={cn('px-2.5 pb-1 pt-2 font-body-medium text-[10px] uppercase tracking-wider', mutedClass)}>
                  Gateways
                </Text>
                {pickerGateways.map((gateway) => {
                  const racks = racksForGateway(gateway, devices);
                  const activeCount = pickerChannels.filter((c) => {
                    const rack = devices.find((d) => d.id === c.rackId);
                    return rack && gatewayForRack(rack, devices)?.id === gateway.id;
                  }).length;
                  return (
                    <Pressable
                      key={gateway.id}
                      onPress={() => {
                        setSelectedGatewayId(gateway.id);
                        setSelectedRackId(null);
                      }}
                      className={cn('border-b px-2.5 py-1.5', lineClass)}
                    >
                      <View className="flex-row items-center gap-2">
                        <Text numberOfLines={1} style={{ minWidth: 0 }} className={cn('font-body-medium flex-1 text-xs', inkClass)}>
                          {gateway.name}
                        </Text>
                        <Text className={cn('font-body-medium text-[10px]', gateway.status === 'Online' ? 'text-status-success' : mutedClass)}>
                          {gateway.status === 'Online' ? 'active' : 'offline'}
                        </Text>
                      </View>
                      <Text numberOfLines={1} className={cn('font-mono text-[10px]', mutedClass)}>
                        {gateway.ip || 'no ip'} - {racks.length} racks - {activeCount} active channels
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : devices.length > 0 && selectedGateway && !selectedRack ? (
              <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                <Pressable
                  onPress={() => {
                    setSelectedGatewayId(null);
                    setSelectedRackId(null);
                  }}
                  className={cn('border-b px-2.5 py-1.5', lineClass)}
                >
                  <Text className={cn('font-body-medium text-[11px]', mutedClass)}>Back to gateways</Text>
                </Pressable>
                <Text className={cn('px-2.5 pb-1 pt-2 font-body-medium text-[10px] uppercase tracking-wider', mutedClass)}>
                  {selectedGateway.name} racks
                </Text>
                {selectedGatewayRacks.length === 0 ? (
                  <Text className={cn('px-2.5 py-2 font-body text-[11px] italic', mutedClass)}>No racks under this gateway.</Text>
                ) : (
                  selectedGatewayRacks.map((rack) => {
                    const activeCount = pickerChannels.filter((c) => c.rackId === rack.id).length;
                    return (
                      <Pressable
                        key={rack.id}
                        onPress={() => setSelectedRackId(rack.id)}
                        className={cn('border-b px-2.5 py-1.5', lineClass)}
                      >
                        <View className="flex-row items-center gap-2">
                          <Text numberOfLines={1} style={{ minWidth: 0 }} className={cn('font-body-medium flex-1 text-xs', inkClass)}>
                            {rack.name}
                          </Text>
                          <Text className={cn('font-body-medium text-[10px]', rack.status === 'Online' ? 'text-status-success' : mutedClass)}>
                            {rack.status === 'Online' ? 'active' : 'offline'}
                          </Text>
                        </View>
                        <Text numberOfLines={1} className={cn('font-mono text-[10px]', mutedClass)}>
                          {rack.ip || 'no ip'} - {activeCount} active channels
                        </Text>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            ) : (
              <>
                <View className={cn('border-b px-2.5 py-1.5', lineClass)}>
                  {devices.length > 0 && selectedGateway && selectedRack && (
                    <Pressable onPress={() => setSelectedRackId(null)} className="pb-1">
                      <Text className={cn('font-body-medium text-[11px]', mutedClass)}>Back to racks</Text>
                    </Pressable>
                  )}
                  <TextInput
                    value={channelSearch}
                    onChangeText={setChannelSearch}
                    placeholder="Search active channels"
                    placeholderTextColor={isDark ? '#8A8A8A' : '#6B6B6B'}
                    className={cn('font-body text-xs', inkClass)}
                  />
                  <Text className={cn('mt-1 font-body text-[10px]', mutedClass)}>
                    {filteredPickerChannels.length} of {pickerChannelsForRack.length} active channels
                  </Text>
                </View>

                {filteredPickerChannels.length === 0 ? (
                  <Text className={cn('px-2.5 py-2 font-body text-[11px] italic', mutedClass)}>
                    {pickerChannelsForRack.length === 0 ? 'No active channels for this rack.' : 'No channels match this search.'}
                  </Text>
                ) : (
                  <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                    {filteredPickerChannels.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          onPickChannel(c);
                          setPickerOpen(false);
                        }}
                        className={cn('border-b px-2.5 py-1.5', lineClass)}
                      >
                        <View className="flex-row items-center gap-2">
                          <Text className="font-body-bold text-[11px] text-accent">{c.code}</Text>
                          <Text numberOfLines={1} style={{ minWidth: 0 }} className={cn('font-body-medium flex-1 text-xs', inkClass)}>
                            {c.deviceName}
                          </Text>
                        </View>
                        <Text numberOfLines={1} className={cn('font-mono text-[10px]', mutedClass)}>
                          {channelLocation(c)} - {c.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </>
            )}
          </View>
        )}
      </View>
    </>
  );
}
