import { Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import type { MeasurementPoint, MeasurementPointKind, MeasurementPointStatus } from '../../../lib/machines';
import { LIVE_RANGE_FOR_LETTER, useLiveValue, type LiveKindLetter } from './liveValue';

const UNIT_FOR_KIND: Record<MeasurementPointKind, string> = {
  Vibration: 'mm/s',
  Temperature: '°C',
  Speed: 'rpm',
  Pressure: 'bar',
  Current: 'A',
  Level: '%',
};

const LIVE_STATUSES: MeasurementPointStatus[] = ['Connected', 'Warning', 'Alarm'];

const KIND_LETTER: Record<MeasurementPointKind, LiveKindLetter> = {
  Vibration: 'V',
  Temperature: 'T',
  Speed: 'S',
  Pressure: 'P',
  Current: 'C',
  // No dedicated level letter — 'X' is the generic 0-100 band, which is what a
  // hopper level percentage is anyway.
  Level: 'X',
};

// Green is reserved for a point that is actually carrying data. The setup
// states between "not configured" and "connected" step up through grey, so the
// list reads as a progress ramp rather than three shades of "done".
const ACCENT_FOR_STATUS: Record<MeasurementPointStatus, string> = {
  'Not Configured': '#5F625F',
  Configured: '#87897F',
  Mapped: '#C9CCC9',
  Connected: '#3FBF6A',
  Disconnected: '#5F625F',
  Warning: '#D9962B',
  Alarm: '#D64545',
};

// Stable per-kind sequence within a component's point list, e.g. "P1", "P2" for the
// first and second Pressure points, independent of other kinds mixed into the list.
export function computePointCode(points: MeasurementPoint[], pointId: string): string {
  const target = points.find((p) => p.id === pointId);
  if (!target) return '--';

  const sameKind = points.filter((p) => p.kind === target.kind);
  const index = sameKind.findIndex((p) => p.id === pointId);
  return `${KIND_LETTER[target.kind]}${index + 1}`;
}

export type PointCardProps = {
  code: string;
  point: MeasurementPoint;
};

export function PointCard({ code, point }: PointCardProps) {
  const { isDark } = useAppTheme();
  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const accent = ACCENT_FOR_STATUS[point.status];
  const unit = UNIT_FOR_KIND[point.kind];

  const isLive = LIVE_STATUSES.includes(point.status);
  const liveValue = useLiveValue(KIND_LETTER[point.kind], isLive);
  const range = LIVE_RANGE_FOR_LETTER[KIND_LETTER[point.kind]];
  const reading = isLive ? `${liveValue.toFixed(range.decimals)} ${unit}` : `-- ${unit}`;

  return (
    <View
      className={cn('gap-1.5 rounded-xl border px-3 py-2.5', isDark ? 'bg-surface-darkpanel' : 'bg-surface-lightpanel')}
      style={{ borderColor: `${accent}55` }}
    >
      <View className="flex-row items-center justify-between">
        <Text style={{ color: accent }} className="font-body-bold text-sm">
          {code}
        </Text>
        <View className={cn('rounded-full border px-1.5 py-0.5', lineClass)}>
          <Text className={cn('font-mono text-[10px]', mutedClass)}>{code}</Text>
        </View>
      </View>

      <Text numberOfLines={1} className={cn('font-body text-xs', mutedClass)}>
        {point.label}
      </Text>

      <Text style={{ color: accent }} className="font-mono text-sm font-bold">
        {reading}
      </Text>
    </View>
  );
}
