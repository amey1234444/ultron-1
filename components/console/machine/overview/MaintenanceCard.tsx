import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { formatRul, levelHexes } from '../../../../lib/condition';

// There is no maintenance model in lib/ yet, so this is the shape the card needs
// rather than a schema anything currently produces. Move it to lib/maintenance.ts
// when a real source exists — a work-order system, or a table the app owns.
export type MaintenanceRecord = {
  id: string;
  // ISO date, so ordering does not depend on locale parsing.
  date: string;
  kind: 'completed' | 'scheduled' | 'overdue';
  summary: string;
  componentLabel?: string;
};

const KIND_LABEL: Record<MaintenanceRecord['kind'], string> = {
  completed: 'done',
  scheduled: 'planned',
  overdue: 'overdue',
};

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

// The predictive half of predictive maintenance only pays off if the prediction
// meets a schedule, so the overview shows both: what the model expects, and what
// is actually planned.
export function MaintenanceCard({
  records,
  soonestRulDays,
}: {
  records?: MaintenanceRecord[];
  soonestRulDays: number | null;
}) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const levels = levelHexes(isDark);

  const scheduled = (records ?? []).filter((r) => r.kind !== 'completed');
  const nextPlanned = scheduled[0] ?? null;

  return (
    <View className="gap-3">
      <Text className={cn('font-body-medium text-[11.5px] uppercase tracking-wider', mutedClass)}>Maintenance</Text>

      <View className="flex-row items-baseline gap-4">
        <View>
          <Text className={cn('font-body text-[11.5px]', mutedClass)}>predicted</Text>
          <Text className={cn('font-mono text-lg font-bold tabular-nums', inkClass)}>{formatRul(soonestRulDays)}</Text>
        </View>
        <View>
          <Text className={cn('font-body text-[11.5px]', mutedClass)}>planned</Text>
          <Text className={cn('font-mono text-lg font-bold tabular-nums', inkClass)}>
            {nextPlanned ? formatDate(nextPlanned.date) : '--'}
          </Text>
        </View>
      </View>

      {/* Not fabricating a service history: an invented "last serviced" date on a
          maintenance screen is the kind of number someone plans around. */}
      {!records || records.length === 0 ? (
        <Text className={cn('font-body text-[12.5px] italic', mutedClass)}>
          No maintenance source is wired to this machine yet, so nothing here is scheduled against the prediction.
        </Text>
      ) : (
        <View className="gap-1.5">
          {records.slice(0, 4).map((record) => (
            <View key={record.id} className={cn('flex-row items-center gap-2 rounded-lg border px-2.5 py-1.5', lineClass)}>
              <Text className={cn('w-12 font-mono text-[11.5px]', mutedClass)}>{formatDate(record.date)}</Text>
              <Text numberOfLines={1} className={cn('flex-1 font-body text-[12.5px]', inkClass)}>
                {record.summary}
                {record.componentLabel ? ` · ${record.componentLabel}` : ''}
              </Text>
              <Text
                style={record.kind === 'overdue' ? { color: levels.danger } : undefined}
                className={cn('font-body-medium text-[10.5px] uppercase tracking-wide', record.kind !== 'overdue' && mutedClass)}
              >
                {KIND_LABEL[record.kind]}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
