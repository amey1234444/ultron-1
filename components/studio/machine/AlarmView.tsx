import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import { loadLocal, saveLocal } from '../../../lib/localPersist';
import type { ChannelRef } from '../../../lib/rack';
import { useLiveValue } from './liveValue';
import type { MappedChannel } from './RackOccupancyView';

const LIVE_COLOUR = '#3FB950';
const WARNING_COLOUR = '#F2A93B';
const CRITICAL_COLOUR = '#EF4444';
const RETURN_COLOUR = '#C9A15C';

type AlarmLevel = 'critical' | 'warning' | 'normal';
// An alarm doesn't just track the live level — it latches, like a real annunciator:
// a live reading that dips back under threshold before anyone acknowledges it
// still needs a deliberate "Clear", not a silent disappearance from the list.
type AckStatus = 'active-unacked' | 'active-acked' | 'return-unacked' | 'normal';

const LEVEL_COLOUR: Record<AlarmLevel, string> = { critical: CRITICAL_COLOUR, warning: WARNING_COLOUR, normal: LIVE_COLOUR };
const LEVEL_RANK: Record<AlarmLevel, number> = { critical: 2, warning: 1, normal: 0 };
const STATUS_RANK: Record<AckStatus, number> = { 'active-unacked': 3, 'active-acked': 2, 'return-unacked': 1, normal: 0 };

function levelFor(channel: ChannelRef, value: number): AlarmLevel {
  if (channel.alarmCritical !== undefined && value >= channel.alarmCritical) return 'critical';
  if (channel.alarmWarning !== undefined && value >= channel.alarmWarning) return 'warning';
  return 'normal';
}

// The only two events that move a channel between latch states: the live level
// going active (transitions in from normal/cleared) or dropping back to normal
// (transitions to "needs clearing" instead of disappearing). Acknowledge/Clear
// are the only other transitions, and those are direct user actions below.
function nextStatus(current: AckStatus, level: AlarmLevel): AckStatus {
  if (level !== 'normal') {
    return current === 'normal' || current === 'return-unacked' ? 'active-unacked' : current;
  }
  return current === 'active-unacked' || current === 'active-acked' ? 'return-unacked' : current;
}

function AlarmRow({
  mapped,
  status,
  onLevelChange,
  onAcknowledge,
  onClear,
}: {
  mapped: MappedChannel;
  status: AckStatus;
  onLevelChange: (level: AlarmLevel) => void;
  onAcknowledge: () => void;
  onClear: () => void;
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const { channel, label } = mapped;
  const value = useLiveValue(channel.letter, true);
  const level = levelFor(channel, value);

  useEffect(() => {
    onLevelChange(level);
  }, [level, onLevelChange]);

  const colour = status === 'return-unacked' ? RETURN_COLOUR : LEVEL_COLOUR[level];
  const statusLabel =
    status === 'active-unacked' ? 'ACTIVE' : status === 'active-acked' ? 'ACKED' : status === 'return-unacked' ? 'RETURN TO NORMAL' : 'NORMAL';

  return (
    <View
      className={cn('flex-row items-center justify-between gap-3 rounded-xl border px-3 py-2.5', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
      style={{ borderColor: `${colour}55`, opacity: status === 'active-acked' ? 0.75 : 1 }}
    >
      <View className="flex-row items-center gap-2.5">
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colour }} />
        <View className={cn('rounded-full border px-1.5 py-0.5', lineClass)}>
          <Text className={cn('font-mono text-[10px]', mutedClass)}>{channel.code}</Text>
        </View>
        <Text numberOfLines={1} className={cn('font-body text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>
          {label}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Text style={{ color: colour }} className="font-mono text-xs font-bold">
          {value.toFixed(2)} {channel.unit}
        </Text>
        <Text style={{ color: colour }} className="font-body-bold text-[11px] uppercase tracking-wider">
          {statusLabel}
        </Text>
        {status === 'active-unacked' && (
          <Pressable onPress={onAcknowledge} className="rounded-full border border-accent/35 bg-accent/10 px-2.5 py-1">
            <Text className="font-body-bold text-[10px] text-accent">Acknowledge</Text>
          </Pressable>
        )}
        {status === 'return-unacked' && (
          <Pressable onPress={onClear} className={cn('rounded-full border px-2.5 py-1', lineClass)}>
            <Text className={cn('font-body-bold text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>Clear</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export type AlarmViewProps = {
  mappedChannels: MappedChannel[];
  machineId: string;
  expectedPoints: number;
};

// Actual View → Alarm: every mapped channel with its current latch status,
// sorted most-urgent first, with a status summary. There's no persistent
// event/history log behind this demo data — just a live level plus a
// localStorage-backed ack/clear latch per channel, so ack state survives a
// tab switch or reload the same way trail/box "Save Config" does.
export function AlarmView({ mappedChannels, machineId, expectedPoints }: AlarmViewProps) {
  const { isDark } = useAppTheme();
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const storageKey = `ultron.alarmstate.${machineId}`;

  // Keyed by the box's own id (`mapped.id`), not the channel's — several boxes
  // can point at the same real channel with independent live values (fewer
  // demo channels than template slots). Keying by channel.id made sibling rows
  // fight over one shared dictionary slot: each row's live tick overwrote the
  // other's, and since each row's onLevelChange callback was a fresh function
  // every render, that overwrite retriggered every row's effect again — an
  // infinite ping-pong ("Maximum update depth exceeded"). Per-box keys plus
  // memoized callbacks below fix both the sharing and the effect churn.
  const [levels, setLevels] = useState<Record<string, AlarmLevel>>({});
  const [statuses, setStatuses] = useState<Record<string, AckStatus>>(() => loadLocal<Record<string, AckStatus>>(storageKey) ?? {});

  const setLevelFor = useCallback(
    (id: string, level: AlarmLevel) => setLevels((prev) => (prev[id] === level ? prev : { ...prev, [id]: level })),
    [],
  );

  // Re-derive latch status whenever any box's live level changes.
  useEffect(() => {
    setStatuses((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const mapped of mappedChannels) {
        const level = levels[mapped.id] ?? 'normal';
        const current = next[mapped.id] ?? 'normal';
        const updated = nextStatus(current, level);
        if (updated !== current) {
          next[mapped.id] = updated;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels]);

  useEffect(() => {
    saveLocal(storageKey, statuses);
  }, [statuses, storageKey]);

  if (mappedChannels.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className={cn('font-body text-sm italic', mutedClass)}>
          No rack channels are mapped to this machine yet — link a box to a channel in Design mode.
        </Text>
      </View>
    );
  }

  const statusOf = (id: string): AckStatus => statuses[id] ?? 'normal';
  const sorted = [...mappedChannels].sort((a, b) => STATUS_RANK[statusOf(b.id)] - STATUS_RANK[statusOf(a.id)]);

  const counts = { 'active-unacked': 0, 'active-acked': 0, 'return-unacked': 0, normal: 0 };
  mappedChannels.forEach((m) => counts[statusOf(m.id)]++);

  return (
    <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, gap: 16 }}>
      {expectedPoints > 0 && (
        <Text className={cn('font-body text-[11px]', mutedClass)}>
          {mappedChannels.length} of {expectedPoints} expected points mapped
        </Text>
      )}

      <View className="flex-row flex-wrap gap-4">
        <Text style={{ color: CRITICAL_COLOUR }} className="font-body-bold text-xs">
          {counts['active-unacked']} Active
        </Text>
        <Text style={{ color: WARNING_COLOUR }} className="font-body-bold text-xs">
          {counts['active-acked']} Acked
        </Text>
        <Text style={{ color: RETURN_COLOUR }} className="font-body-bold text-xs">
          {counts['return-unacked']} Return
        </Text>
        <Text style={{ color: LIVE_COLOUR }} className="font-body-bold text-xs">
          {counts.normal} Normal
        </Text>
      </View>

      <View className="gap-2">
        {sorted.map((mapped) => (
          <AlarmRow
            key={mapped.id}
            mapped={mapped}
            status={statusOf(mapped.id)}
            onLevelChange={(level) => setLevelFor(mapped.id, level)}
            onAcknowledge={() => setStatuses((prev) => ({ ...prev, [mapped.id]: 'active-acked' }))}
            onClear={() => setStatuses((prev) => ({ ...prev, [mapped.id]: 'normal' }))}
          />
        ))}
      </View>
    </ScrollView>
  );
}
