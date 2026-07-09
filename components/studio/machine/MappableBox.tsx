import { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { ChannelRef } from '../../../lib/rack';
import type { TrailStatus } from './AdjustableTrail';
import { LIVE_RANGE_FOR_LETTER, useLiveValue } from './liveValue';
import { PointCard18 } from './PointCard18';

export type Point = { x: number; y: number };

export const MAPPABLE_BOX_WIDTH = 168;
// Approximate rendered card height (varies slightly with linked/unlinked content) —
// used only for "drop a trail endpoint anywhere on the box" hit-testing.
export const MAPPABLE_BOX_HEIGHT = 130;
const WIDTH = MAPPABLE_BOX_WIDTH;

function statusFor(channel: ChannelRef, value: number): TrailStatus {
  if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) return 'critical';
  if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) return 'warning';
  return 'normal';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
  channels: ChannelRef[];
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
  // Reports the card's actual rendered size — the linked and unlinked layouts
  // differ in height, so callers doing hit-testing/anchoring against this box's
  // boundary should use the real, current size rather than a guess.
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
  channels,
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
  const liveValue = useLiveValue(channel?.letter ?? 'X', !!channel);

  useEffect(() => {
    if (channel) onLiveValueChange?.(liveValue);
  }, [channel, liveValue, onLiveValueChange]);

  const pointRef = useRef({ x, y });
  pointRef.current = { x, y };
  const boundsRef = useRef({ canvasWidth, canvasHeight });
  boundsRef.current = { canvasWidth, canvasHeight };
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
          x: clamp(dragOrigin.current.x + gesture.dx / s, 8, Math.max(8, cw - WIDTH - 24)),
          y: clamp(dragOrigin.current.y + gesture.dy / s, 24, Math.max(24, ch - 24)),
        });
      },
    }),
  ).current;

  const connectorColour = attached ? '#3FB950' : '#C9A15C';

  if (channel) {
    const status = statusFor(channel, liveValue);
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
            value={liveValue.toFixed(LIVE_RANGE_FOR_LETTER[channel.letter].decimals)}
            unit={channel.unit}
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
        style={{ position: 'absolute', left: x + 12, top: y - 30, width: WIDTH }}
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
          <View className={cn('max-h-40 border-t', lineClass)}>
            {channels.length === 0 ? (
              <Text className={cn('px-2.5 py-2 font-body text-[11px] italic', mutedClass)}>No rack channels yet.</Text>
            ) : (
              channels.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    onPickChannel(c);
                    setPickerOpen(false);
                  }}
                  className={cn('border-b px-2.5 py-1.5', lineClass)}
                >
                  <Text numberOfLines={1} className={cn('font-body-medium text-xs', inkClass)}>
                    {c.deviceName}
                  </Text>
                  <Text numberOfLines={1} className={cn('font-mono text-[10px]', mutedClass)}>
                    {c.label}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        )}
      </View>
    </>
  );
}
