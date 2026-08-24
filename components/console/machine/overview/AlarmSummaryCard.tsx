import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { loadLocal } from '../../../../lib/localPersist';
import { LEVEL_HEX } from '../../../../lib/condition';
import type { MachineSummary } from './rollup';
import type { PointCondition } from './usePointCondition';

// Mirrors the latch map AlarmView persists, keyed by box id. Read-only here: the
// overview reports how many active alarms nobody has picked up yet, but
// acknowledging and clearing stay in the view that owns that state. AlarmView
// keeps this type module-private — export it from there and import it here
// instead of restating it, the first time either side changes.
type PersistedAckStatus = 'active-unacked' | 'active-acked' | 'return-unacked' | 'normal';

const alarmStateStorageKey = (machineId: string) => `ultron.alarmstate.${machineId}`;

function Count({ label, count, colour }: { label: string; count: number; colour: string }) {
  return (
    <View className="flex-row items-baseline gap-1.5">
      <Text style={{ color: colour }} className="font-mono text-lg font-bold tabular-nums">
        {count}
      </Text>
      <Text style={{ color: colour }} className="font-body-medium text-[10px] uppercase tracking-wider">
        {label}
      </Text>
    </View>
  );
}

export function AlarmSummaryCard({
  summary,
  conditions,
  machineId,
  onOpenAlarms,
}: {
  summary: MachineSummary;
  conditions: PointCondition[];
  machineId: string;
  onOpenAlarms?: () => void;
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';

  // Read once per machine rather than polling: the operator acknowledges alarms
  // on the Alarm tab, and remounting this view is what brings the fresh count.
  const [latched, setLatched] = useState<Record<string, PersistedAckStatus>>({});
  useEffect(() => {
    setLatched(loadLocal<Record<string, PersistedAckStatus>>(alarmStateStorageKey(machineId)) ?? {});
  }, [machineId]);

  const unacked = conditions.filter((c) => latched[c.id] === 'active-unacked').length;
  const elevated = conditions
    .filter((c): c is PointCondition & { value: number; health: number } =>
      c.level !== 'normal' && c.value !== null && c.health !== null,
    )
    .sort((a, b) => a.health - b.health)
    .slice(0, 3);

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className={cn('font-body-medium text-[10px] uppercase tracking-wider', mutedClass)}>Alarm State</Text>
        {onOpenAlarms ? (
          <Pressable onPress={onOpenAlarms}>
            <Text className="font-body-medium text-[10px] text-accent">Open alarms ›</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row flex-wrap items-baseline gap-4">
        <Count label="danger" count={summary.dangerCount} colour={LEVEL_HEX.danger} />
        <Count label="alert" count={summary.alertCount} colour={LEVEL_HEX.alert} />
        <Count label="normal" count={summary.normalCount} colour={LEVEL_HEX.normal} />
      </View>

      {/* Unacknowledged is the number that says whether anyone has looked, which
          is a different question from how many are active. */}
      <Text className={cn('font-body text-[11px]', mutedClass)}>
        {unacked === 0 ? 'Nothing awaiting acknowledgement.' : `${unacked} active, not yet acknowledged.`}
      </Text>

      {elevated.length > 0 && (
        <View className="gap-1.5">
          {elevated.map((condition) => (
            <View key={condition.id} className={cn('flex-row items-center gap-2 rounded-lg border px-2.5 py-1.5', lineClass)}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: LEVEL_HEX[condition.level] }} />
              <Text className={cn('font-mono text-[10px]', mutedClass)}>{condition.code}</Text>
              <Text numberOfLines={1} className={cn('flex-1 font-body text-[11px]', inkClass)}>
                {condition.label}
              </Text>
              <Text style={{ color: LEVEL_HEX[condition.level] }} className="font-mono text-[11px] font-bold tabular-nums">
                {condition.value.toFixed(condition.band.decimals)} {condition.unit}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
