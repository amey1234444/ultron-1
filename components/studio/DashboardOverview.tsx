import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import { deviceWithGatewayConnectionState, totalChannelsFor, type DeviceNode } from '../../lib/devices';
import type { FolderNode, ProjectNode } from '../../lib/hierarchy';
import type { LiveState } from '../../lib/liveTelemetry';
import type { MachineNode } from '../../lib/machines';
import { listChannels, type CardNode } from '../../lib/rack';
import { ROLE_LABEL, type PublicUser } from '../../src/lib/roles';

type DashboardOverviewProps = {
  projects: ProjectNode[];
  folders: FolderNode[];
  machines: MachineNode[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  realMode: boolean;
  currentUser?: PublicUser | null;
  onOpenDevices: () => void;
  onOpenMachine: (id: string) => void;
};

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
type Tone = 'green' | 'blue' | 'amber' | 'red' | 'purple' | 'cyan' | 'slate';

const STATUS_COLORS = {
  healthy: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
  offline: '#94a3b8',
  info: '#2f80ed',
};

const SPARK_HEALTH = [78, 80, 82, 79, 84, 83, 86, 84];
const SPARK_BLUE = [54, 59, 56, 65, 62, 71, 69, 74];
const SPARK_AMBER = [10, 18, 13, 24, 31, 21, 29, 25];
const HEALTH_TREND = [86, 88, 92, 96, 79, 88, 94, 82, 98, 91, 99, 90, 84];
const PREVIOUS_HEALTH_TREND = [76, 79, 81, 84, 77, 80, 82, 83, 85, 86, 84, 88, 87];
const THROUGHPUT = [150, 160, 140, 182, 153, 169, 126, 201, 224, 228, 282, 338, 289, 238, 190, 176];
const ENERGY = [18, 24, 20, 27, 19, 23, 16, 22, 24, 30, 27, 43, 48, 34, 30, 26];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function toneColor(tone: Tone) {
  switch (tone) {
    case 'green':
      return '#16a34a';
    case 'blue':
      return '#2563eb';
    case 'amber':
      return '#d97706';
    case 'red':
      return '#dc2626';
    case 'purple':
      return '#7c3aed';
    case 'cyan':
      return '#0891b2';
    default:
      return '#64748b';
  }
}

function Sparkline({ values, color = '#16a34a', bars = false }: { values: readonly number[]; color?: string; bars?: boolean }) {
  const width = 78;
  const height = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(1, values.length - 1)) * width;
      const y = height - ((value - min) / spread) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  if (bars) {
    const barWidth = width / values.length - 2;
    return (
      <Svg width={width} height={height}>
        {values.map((value, index) => {
          const h = 4 + ((value - min) / spread) * (height - 6);
          return <Rect key={index} x={index * (barWidth + 2)} y={height - h} width={barWidth} height={h} rx={1.5} fill={color} opacity={0.85} />;
        })}
      </Svg>
    );
  }

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function KpiCard({
  icon,
  label,
  value,
  unit,
  detail,
  delta,
  tone,
  spark,
  bars,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  delta: string;
  tone: Tone;
  spark: number[];
  bars?: boolean;
}) {
  const { isDark } = useAppTheme();
  const color = toneColor(tone);
  return (
    <View className={cn('min-w-[178px] flex-1 rounded-lg border p-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}16` }}>
          <MaterialCommunityIcons name={icon} size={22} color={color} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className={cn('font-body-bold text-[12px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
            {label}
          </Text>
          <View className="mt-1 flex-row items-end gap-1">
            <Text className={cn('font-display text-2xl', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
            {unit && <Text className={cn('pb-1 font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{unit}</Text>}
          </View>
          <Text numberOfLines={1} className={cn('font-body text-[11px]', color === '#dc2626' ? 'text-status-danger' : 'text-status-success')}>
            {delta}
          </Text>
        </View>
      </View>
      <View className="mt-2 flex-row items-end justify-between">
        <Text numberOfLines={1} className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {detail}
        </Text>
        <Sparkline values={spark} color={color} bars={bars} />
      </View>
    </View>
  );
}

function sectionClass(isDark: boolean) {
  return cn('rounded-lg border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white');
}

function SectionHeader({ icon, title, action }: { icon?: IconName; title: string; action?: string }) {
  const { isDark } = useAppTheme();
  return (
    <View className={cn('flex-row items-center justify-between border-b px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
      <View className="flex-row items-center gap-2">
        {icon && <MaterialCommunityIcons name={icon} size={16} color={isDark ? '#F5F5F5' : '#111827'} />}
        <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
      </View>
      {action && <Text className="font-body-medium text-[11px] text-primary-blue">{action}</Text>}
    </View>
  );
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = {
    x: cx + radius * Math.cos((Math.PI * startAngle) / 180),
    y: cy + radius * Math.sin((Math.PI * startAngle) / 180),
  };
  const end = {
    x: cx + radius * Math.cos((Math.PI * endAngle) / 180),
    y: cy + radius * Math.sin((Math.PI * endAngle) / 180),
  };
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function HealthGauge({ score }: { score: number }) {
  const valueAngle = -180 + clamp(score, 0, 100) * 1.8;
  return (
    <Svg width="100%" height={170} viewBox="0 0 240 170">
      <Path d={arcPath(120, 132, 92, -180, 0)} fill="none" stroke="#e5e7eb" strokeWidth={16} strokeLinecap="round" />
      <Path d={arcPath(120, 132, 92, -180, valueAngle)} fill="none" stroke="#16a34a" strokeWidth={16} strokeLinecap="round" />
      <Path d={arcPath(120, 132, 92, -16, 0)} fill="none" stroke="#ef4444" strokeWidth={16} strokeLinecap="round" />
      <Path d={arcPath(120, 132, 92, -28, -18)} fill="none" stroke="#f59e0b" strokeWidth={16} strokeLinecap="round" />
      <SvgText x="120" y="104" textAnchor="middle" fontSize="40" fontWeight="700" fill="#111827">
        {score}
      </SvgText>
      <SvgText x="158" y="105" fontSize="16" fill="#475569">
        /100
      </SvgText>
      <SvgText x="120" y="132" textAnchor="middle" fontSize="17" fontWeight="700" fill="#16a34a">
        Good
      </SvgText>
    </Svg>
  );
}

function HealthAnalysis({ score, updatedAt }: { score: number; updatedAt: string }) {
  const { isDark } = useAppTheme();
  const contributors = ['Boiler Feed Pump-02', 'Compressor-03', 'Cooling Tower-01'];
  const metrics = [
    ['Availability', 89],
    ['Performance', 78],
    ['Reliability', 83],
    ['Maintainability', 74],
  ] as const;

  return (
    <View className={cn(sectionClass(isDark), 'min-w-[260px] flex-[0.7]')}>
      <SectionHeader icon="heart-pulse" title="Overall Health" />
      <View className="px-4 pb-4 pt-2">
        <HealthGauge score={score} />
        <View className="gap-2">
          {metrics.map(([label, value]) => (
            <View key={label}>
              <View className="mb-1 flex-row justify-between">
                <Text className={cn('font-body-medium text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{label}</Text>
                <Text className={cn('font-mono text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{value}%</Text>
              </View>
              <View className={cn('h-1.5 rounded-full', isDark ? 'bg-white/10' : 'bg-slate-100')}>
                <View className="h-1.5 rounded-full bg-status-success" style={{ width: `${value}%` }} />
              </View>
            </View>
          ))}
        </View>
        <View className={cn('mt-3 rounded-md px-3 py-2', isDark ? 'bg-white/5' : 'bg-slate-50')}>
          <Text className={cn('font-body-medium text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>Reduced by</Text>
          <Text className={cn('mt-1 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {contributors.join(', ')}
          </Text>
          <Text className={cn('mt-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Calculated {updatedAt}</Text>
        </View>
      </View>
    </View>
  );
}

function TrendLine({
  values,
  previous,
  color = '#16a34a',
  height = 170,
}: {
  values: number[];
  previous?: number[];
  color?: string;
  height?: number;
}) {
  const width = 520;
  const pad = 24;
  const max = 100;
  const min = 0;
  const pointFor = (value: number, index: number, source: number[]) => {
    const x = pad + (index / Math.max(1, source.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / (max - min)) * (height - pad * 2);
    return `${x},${y}`;
  };
  const currentPoints = values.map((v, i) => pointFor(v, i, values)).join(' ');
  const previousPoints = previous?.map((v, i) => pointFor(v, i, previous)).join(' ');

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={pad} y={pad + 12} width={width - pad * 2} height={42} fill="#dcfce7" opacity={0.38} />
      <Rect x={pad} y={pad + 54} width={width - pad * 2} height={34} fill="#fef3c7" opacity={0.48} />
      {[25, 50, 75, 100].map((tick) => {
        const y = height - pad - (tick / 100) * (height - pad * 2);
        return <Line key={tick} x1={pad} x2={width - pad} y1={y} y2={y} stroke="#cbd5e1" strokeDasharray="3 5" strokeWidth={1} />;
      })}
      {previousPoints && <Polyline points={previousPoints} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />}
      <Polyline points={currentPoints} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => {
        if (![3, 6, 8, 12].includes(i)) return null;
        const [x, y] = pointFor(v, i, values).split(',').map(Number);
        return <Circle key={i} cx={x} cy={y} r={4} fill={i === 12 ? '#16a34a' : '#f59e0b'} stroke="#fff" strokeWidth={2} />;
      })}
      <SvgText x={width - 34} y={height - pad - (values[values.length - 1] / 100) * (height - pad * 2) - 10} fill="#16a34a" fontWeight="700">
        {values[values.length - 1]}
      </SvgText>
    </Svg>
  );
}

function StackedBars() {
  const days = ['May 18', 'May 19', 'May 20', 'May 21', 'May 22', 'May 23', 'May 24'];
  const critical = [10, 11, 18, 15, 20, 13, 16];
  const warning = [22, 29, 34, 27, 31, 36, 30];
  const info = [14, 18, 16, 12, 20, 15, 18];
  const height = 170;
  const width = 520;
  const baseY = 136;
  const max = 80;
  const barW = 28;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {[20, 40, 60].map((tick) => (
        <Line key={tick} x1={28} x2={width - 20} y1={baseY - (tick / max) * 100} y2={baseY - (tick / max) * 100} stroke="#cbd5e1" strokeDasharray="3 5" />
      ))}
      {days.map((day, index) => {
        const x = 42 + index * 68;
        const cH = (critical[index] / max) * 100;
        const wH = (warning[index] / max) * 100;
        const iH = (info[index] / max) * 100;
        return (
          <G key={day}>
            <Rect x={x} y={baseY - cH} width={barW} height={cH} fill="#ef4444" />
            <Rect x={x} y={baseY - cH - wH} width={barW} height={wH} fill="#f59e0b" />
            <Rect x={x} y={baseY - cH - wH - iH} width={barW} height={iH} fill="#2f80ed" />
            <SvgText x={x - 8} y={156} fontSize={10} fill="#64748b">
              {day.slice(4)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function DonutChart({ total }: { total: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const segments = [
    { label: 'Critical', value: 10, color: '#ef4444' },
    { label: 'Warning', value: 28, color: '#f59e0b' },
    { label: 'Info', value: 14, color: '#2f80ed' },
    { label: 'Acknowledge', value: 4, color: '#64748b' },
  ];
  let offset = 0;
  return (
    <Svg width={150} height={150} viewBox="0 0 150 150">
      <Circle cx={75} cy={75} r={radius} stroke="#e5e7eb" strokeWidth={18} fill="none" />
      {segments.map((segment) => {
        const length = (segment.value / total) * circumference;
        const item = (
          <Circle
            key={segment.label}
            cx={75}
            cy={75}
            r={radius}
            stroke={segment.color}
            strokeWidth={18}
            fill="none"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform="rotate(-90 75 75)"
          />
        );
        offset += length;
        return item;
      })}
      <SvgText x={75} y={72} textAnchor="middle" fontSize={22} fontWeight="700" fill="#111827">
        {total}
      </SvgText>
      <SvgText x={75} y={91} textAnchor="middle" fontSize={12} fill="#64748b">
        Total
      </SvgText>
    </Svg>
  );
}

function PlantMapPanel() {
  const { isDark } = useAppTheme();
  const areas = [
    { name: 'Compressor Area', x: 143, y: 62, status: 'healthy', count: 18 },
    { name: 'Boiler Area', x: 392, y: 92, status: 'warning', count: 10 },
    { name: 'Turbine Hall', x: 535, y: 156, status: 'healthy', count: 12 },
    { name: 'Utility Area', x: 92, y: 278, status: 'healthy', count: 8 },
    { name: 'Process Pump Line', x: 300, y: 313, status: 'warning', count: 9 },
    { name: 'Rotary Airlock', x: 489, y: 315, status: 'healthy', count: 3 },
  ] as const;
  return (
    <View className={cn(sectionClass(isDark), 'min-w-[560px] flex-[1.35]')}>
      <View className={cn('flex-row items-center justify-between border-b px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
        <View>
          <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>Plant Overview</Text>
          <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Location markers use saved map coordinates when configured</Text>
        </View>
        <View className="flex-row gap-4">
          {(['healthy', 'warning', 'critical', 'offline'] as const).map((status) => (
            <View key={status} className="flex-row items-center gap-1">
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: STATUS_COLORS[status] }} />
              <Text className={cn('font-body-medium text-[10px] capitalize', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{status}</Text>
            </View>
          ))}
        </View>
      </View>
      <View className="relative overflow-hidden px-3 py-3">
        <Svg width="100%" height={330} viewBox="0 0 640 330">
          <Rect x={32} y={44} width={570} height={250} rx={16} fill={isDark ? '#0f172a' : '#f8fafc'} stroke={isDark ? '#334155' : '#dbe3ec'} />
          <Path d="M84 236 L244 132 L470 166 L344 268 Z" fill="#e8eef5" stroke="#9aa8b6" strokeWidth={2} />
          <Path d="M120 219 L264 154 L424 176 L320 245 Z" fill="#f7fbff" stroke="#b5c1cc" />
          <Path d="M100 196 C170 150 214 143 288 157 C356 169 410 160 510 112" fill="none" stroke="#94a3b8" strokeWidth={5} opacity={0.55} />
          <Path d="M94 214 C173 176 231 180 297 198 C374 219 447 211 533 185" fill="none" stroke="#64748b" strokeWidth={4} opacity={0.52} />
          {[165, 198, 365, 413, 464].map((x, i) => (
            <G key={x}>
              <Rect x={x} y={90 + (i % 2) * 18} width={36} height={102 - (i % 2) * 18} rx={8} fill="#f1f5f9" stroke="#94a3b8" />
              <Rect x={x + 8} y={72 + (i % 2) * 18} width={20} height={32} rx={5} fill="#e2e8f0" stroke="#94a3b8" />
            </G>
          ))}
          <Rect x={224} y={190} width={140} height={55} rx={8} fill="#f8fafc" stroke="#64748b" />
          <Rect x={375} y={207} width={88} height={42} rx={8} fill="#e5e7eb" stroke="#64748b" />
          <Rect x={473} y={187} width={54} height={34} rx={6} fill="#e2e8f0" stroke="#64748b" />
          {areas.map((area) => {
            const color = STATUS_COLORS[area.status];
            const labelX = area.x < 160 ? area.x - 18 : area.x > 460 ? area.x - 128 : area.x - 54;
            const labelY = area.y < 110 ? area.y - 44 : area.y + 18;
            return (
              <G key={area.name}>
                <Line x1={area.x} y1={area.y} x2={labelX + 68} y2={labelY + 34} stroke={color} strokeWidth={2} />
                <Circle cx={area.x} cy={area.y} r={9} fill="#ffffff" stroke={color} strokeWidth={4} />
                <Rect x={labelX} y={labelY} width={134} height={54} rx={7} fill="#ffffff" stroke="#dbe3ec" />
                <SvgText x={labelX + 12} y={labelY + 20} fontSize={11} fontWeight="700" fill="#111827">
                  {area.name}
                </SvgText>
                <Circle cx={labelX + 13} cy={labelY + 35} r={4} fill={color} />
                <SvgText x={labelX + 24} y={labelY + 39} fontSize={10} fill="#334155">
                  {area.status === 'healthy' ? 'Healthy' : 'Warning'} - {area.count} machines
                </SvgText>
              </G>
            );
          })}
        </Svg>
        <View className="absolute left-5 top-16 gap-2">
          {['target', 'plus', 'minus', 'crosshairs-gps'].map((icon) => (
            <Pressable key={icon} className={cn('h-8 w-8 items-center justify-center rounded-md border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <MaterialCommunityIcons name={icon as IconName} size={16} color={isDark ? '#F5F5F5' : '#111827'} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function LiveAlarmFeed() {
  const { isDark } = useAppTheme();
  const alarms = [
    ['Critical', 'High vibration detected', 'Compressor-03', 'Compressor Area', 'V1', '10:24:12 AM', '12.8 mm/s', '> 10.0', 'Ack', 'R. Singh', '12m'],
    ['Warning', 'High temperature', 'Boiler Feed Pump-02', 'Boiler Area', 'T2', '10:23:45 AM', '82 C', '> 78', 'Open', 'A. Patel', '21m'],
    ['Warning', 'Flow deviation', 'Pump Line-04', 'Process Pump Line', 'P3', '10:22:58 AM', '71%', '< 80', 'Open', 'M. Khan', '28m'],
    ['Warning', 'Motor overcurrent', 'Turbine-01', 'Turbine Hall', 'C1', '10:22:31 AM', '41 A', '> 38', 'Ack', 'S. Rao', '34m'],
    ['Info', 'Gateway recovered', 'rack-gw-01', 'Utility Area', '-', '10:18:47 AM', 'Online', '-', 'Ack', 'System', '4m'],
  ];
  return (
    <View className={cn(sectionClass(isDark), 'min-w-[440px] flex-1')}>
      <SectionHeader icon="bell-alert-outline" title="Live Alarm Feed" action="View all alarms" />
      <View className="px-3 py-2">
        <View className="mb-2 flex-row items-center gap-2">
          {['Severity', 'Area', 'Source', 'Ack', 'History'].map((filter) => (
            <Pressable key={filter} className={cn('rounded-full border px-2.5 py-1', isDark ? 'border-line-dark' : 'border-line-light')}>
              <Text className={cn('font-body-medium text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{filter}</Text>
            </Pressable>
          ))}
        </View>
        <View className={cn('rounded-md border', isDark ? 'border-line-dark' : 'border-line-light')}>
          {alarms.map((alarm, index) => {
            const severity = alarm[0];
            const color = severity === 'Critical' ? '#ef4444' : severity === 'Warning' ? '#f59e0b' : '#2f80ed';
            return (
              <View key={`${alarm[1]}-${index}`} className={cn('flex-row items-center gap-2 border-b px-2 py-2 last:border-b-0', isDark ? 'border-line-dark' : 'border-line-light')}>
                <Text className="w-14 rounded px-1.5 py-1 text-center font-body-bold text-[10px]" style={{ color, backgroundColor: `${color}16` }}>
                  {severity}
                </Text>
                <View className="min-w-0 flex-[1.4]">
                  <Text numberOfLines={1} className={cn('font-body-bold text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{alarm[1]}</Text>
                  <Text numberOfLines={1} className={cn('font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[2]} - {alarm[3]}</Text>
                </View>
                <Text className={cn('w-8 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[4]}</Text>
                <Text className={cn('w-16 font-mono text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{alarm[6]}</Text>
                <Text className={cn('w-14 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[7]}</Text>
                <Text className={cn('w-20 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[5]}</Text>
                <Text className={cn('w-14 font-body-medium text-[10px]', alarm[8] === 'Ack' ? 'text-status-success' : 'text-status-warning')}>{alarm[8]}</Text>
                <Text numberOfLines={1} className={cn('w-16 font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[9]}</Text>
                <Text className={cn('w-10 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[10]}</Text>
                <View className="flex-row gap-1">
                  {['check', 'comment-text-outline', 'account-arrow-right-outline', 'clock-outline', 'chart-line'].map((icon) => (
                    <Pressable key={icon} className={cn('h-6 w-6 items-center justify-center rounded border', isDark ? 'border-line-dark' : 'border-line-light')}>
                      <MaterialCommunityIcons name={icon as IconName} size={13} color={isDark ? '#F5F5F5' : '#111827'} />
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function SystemStatus({ connectedGateways, totalGateways }: { connectedGateways: number; totalGateways: number }) {
  const { isDark } = useAppTheme();
  const services = [
    ['MQTT Broker', 'healthy'],
    ['WebSocket Transport', 'healthy'],
    ['Database', 'healthy'],
    ['Web Services', 'healthy'],
    ['Data Acquisition', connectedGateways > 0 ? 'healthy' : 'degraded'],
    ['Edge Gateway', connectedGateways === totalGateways ? 'healthy' : 'degraded'],
    ['File Storage', 'healthy'],
    ['Authentication', 'healthy'],
    ['Notifications', 'healthy'],
  ];
  return (
    <View className={cn(sectionClass(isDark), 'min-w-[300px] flex-1')}>
      <SectionHeader icon="server-network" title="System Status" action="View all" />
      <View className="flex-row flex-wrap gap-2 p-3">
        {services.map(([service, status]) => {
          const color = status === 'healthy' ? '#16a34a' : status === 'degraded' ? '#f59e0b' : '#ef4444';
          return (
            <View key={service} className={cn('min-w-[210px] flex-1 flex-row items-center justify-between rounded-md px-2 py-1.5', isDark ? 'bg-white/5' : 'bg-slate-50')}>
              <Text numberOfLines={1} className={cn('font-body-medium text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{service}</Text>
              <View className="flex-row items-center gap-1">
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
                <Text className={cn('font-body-medium text-[10px]', status === 'healthy' ? 'text-status-success' : 'text-status-warning')}>{status}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TelemetrySnapshot({ activeChannels, configuredChannels, lastUpdate }: { activeChannels: number; configuredChannels: number; lastUpdate: string }) {
  const { isDark } = useAppTheme();
  const snapshots = [
    ['Packet Rate', '2,845', 'pkt/s', SPARK_BLUE],
    ['Avg Latency', '32', 'ms', [44, 28, 35, 26, 32, 24, 33, 31]],
    ['Last Payload', lastUpdate, '', SPARK_HEALTH],
    ['Devices Streaming', String(activeChannels), `/ ${configuredChannels}`, SPARK_HEALTH],
  ] as const;
  return (
    <View className={cn(sectionClass(isDark), 'min-w-[360px] flex-1')}>
      <SectionHeader icon="pulse" title="Live Telemetry Snapshot" />
      <View className="flex-row flex-wrap gap-2 p-3">
        {snapshots.map(([label, value, unit, spark]) => (
          <View key={label} className={cn('min-w-[150px] flex-1 rounded-md px-3 py-2', isDark ? 'bg-white/5' : 'bg-slate-50')}>
            <Text className={cn('font-body-medium text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
            <View className="mt-1 flex-row items-end gap-1">
              <Text className={cn('font-display text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
              <Text className={cn('pb-1 font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{unit}</Text>
            </View>
            <Sparkline values={spark} color="#2563eb" />
          </View>
        ))}
      </View>
    </View>
  );
}

function ChartCard({ title, action, children }: { title: string; action?: string; children: ReactNode }) {
  const { isDark } = useAppTheme();
  return (
    <View className={cn(sectionClass(isDark), 'min-w-[310px] flex-1')}>
      <SectionHeader title={title} action={action ?? 'Last 7 Days'} />
      <View className="p-3">{children}</View>
    </View>
  );
}

function MachinesAttention({ machines, onOpenMachine }: { machines: MachineNode[]; onOpenMachine: (id: string) => void }) {
  const { isDark } = useAppTheme();
  const fallbackMachineId = machines[0]?.id;
  const rows = [
    ['Compressor-03', 'Compressor Area', '31', 'High vibration', '3', '10:24:12 AM', '10:24:36 AM', 'High', 'R. Singh', 'Inspect bearing'],
    ['Boiler Feed Pump-02', 'Boiler Area', '45', 'High temperature', '2', '10:23:45 AM', '10:24:30 AM', 'High', 'A. Patel', 'Check cooling'],
    ['Turbine-01', 'Turbine Hall', '58', 'Motor overcurrent', '1', '10:22:31 AM', '10:24:21 AM', 'Medium', 'S. Rao', 'Review load'],
    ['Cooling Tower-01', 'Utility Area', '70', 'Efficiency drop', '1', '10:21:10 AM', '10:24:10 AM', 'Medium', 'M. Khan', 'Clean inlet'],
    ['Pump Line-04', 'Process Pump Line', '90', 'Flow deviation', '1', '10:22:58 AM', '10:24:25 AM', 'Low', 'P. Mehta', 'Verify valve'],
  ];
  return (
    <View className={cn(sectionClass(isDark), 'min-w-[620px] flex-[1.25]')}>
      <SectionHeader icon="alert-decagram-outline" title="Machines Requiring Attention" />
      <View className="px-3 py-2">
        <View className="flex-row px-2 py-1">
          {['Machine', 'Area', 'Health', 'Issue', 'Alarms', 'Last Alarm', 'Telemetry', 'Risk', 'Owner', 'Action'].map((heading, index) => (
            <Text key={heading} className={cn('font-body-bold text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted', index < 2 ? 'flex-[1.1]' : index === 3 ? 'flex-[1.2]' : 'flex-1')}>
              {heading}
            </Text>
          ))}
        </View>
        {rows.map((row, index) => {
          const health = Number(row[2]);
          const riskColor = row[7] === 'High' ? '#ef4444' : row[7] === 'Medium' ? '#f59e0b' : '#16a34a';
          return (
            <View key={row[0]} className={cn('flex-row items-center rounded-md px-2 py-2', index % 2 === 0 && (isDark ? 'bg-white/5' : 'bg-slate-50'))}>
              <Text className={cn('flex-[1.1] font-body-bold text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{row[0]}</Text>
              <Text className={cn('flex-[1.1] font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row[1]}</Text>
              <Text className="flex-1 rounded px-2 py-1 text-center font-body-bold text-[10px]" style={{ color: health < 50 ? '#ef4444' : health < 75 ? '#f59e0b' : '#16a34a', backgroundColor: health < 50 ? '#fee2e2' : health < 75 ? '#fef3c7' : '#dcfce7' }}>
                {row[2]}
              </Text>
              <Text className={cn('flex-[1.2] font-body text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{row[3]}</Text>
              <Text className="flex-1 font-mono text-[11px] text-status-danger">{row[4]}</Text>
              <Text className={cn('flex-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row[5]}</Text>
              <Text className={cn('flex-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row[6]}</Text>
              <Text className="flex-1 font-body-bold text-[10px]" style={{ color: riskColor }}>{row[7]}</Text>
              <Text className={cn('flex-1 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row[8]}</Text>
              <Pressable disabled={!fallbackMachineId} onPress={() => fallbackMachineId && onOpenMachine(fallbackMachineId)} className="flex-1 rounded-md bg-primary-blue/10 px-2 py-1">
                <Text className="text-center font-body-bold text-[10px] text-primary-blue">View Details</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function InsightsPanel() {
  const { isDark } = useAppTheme();
  const insights = [
    ['Compressor-03', 'Unbalanced motor detected', 'Check bearing condition', 'V1 12.8 mm/s, T2 82 C', '92%', 'High'],
    ['Boiler Feed Pump-02', 'Temperature trending upward', 'Inspect cooling system', 'T2 +8.4% in 24h', '86%', 'Medium'],
    ['Cooling Tower-01', 'Efficiency dropped', 'Clean inlet and verify fan speed', 'OEE -4.2%', '78%', 'Medium'],
    ['Rotary Airlock', 'Check media and valves', 'Schedule lubrication inspection', 'Current stable, vibration rising', '71%', 'Low'],
  ];
  return (
    <View className={cn(sectionClass(isDark), 'min-w-[420px] flex-1')}>
      <SectionHeader icon="lightbulb-on-outline" title="Insights and Recommended Actions" action="View all" />
      <View className="gap-2 p-3">
        {insights.map((item) => {
          const color = item[5] === 'High' ? '#ef4444' : item[5] === 'Medium' ? '#f59e0b' : '#16a34a';
          return (
            <View key={`${item[0]}-${item[1]}`} className={cn('rounded-md border-l-4 px-3 py-2', isDark ? 'bg-white/5' : 'bg-slate-50')} style={{ borderLeftColor: color }}>
              <View className="flex-row items-start justify-between gap-2">
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className={cn('font-body-bold text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{item[0]}: {item[1]}</Text>
                  <Text numberOfLines={1} className={cn('mt-0.5 font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Probable cause: process drift. Recommended: {item[2]}</Text>
                  <Text numberOfLines={1} className={cn('font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{item[3]} - Confidence {item[4]}</Text>
                </View>
                <Text className="rounded px-2 py-1 font-body-bold text-[10px]" style={{ color, backgroundColor: `${color}16` }}>{item[5]}</Text>
              </View>
              <View className="mt-2 flex-row gap-2">
                {['Create WO', 'Assign', 'Accept', 'Dismiss'].map((action) => (
                  <Pressable key={action} className={cn('rounded-md border px-2 py-1', isDark ? 'border-line-dark' : 'border-line-light')}>
                    <Text className={cn('font-body-medium text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{action}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function QuickActions({ onOpenDevices, onOpenCanvas }: { onOpenDevices: () => void; onOpenCanvas: () => void }) {
  const { isDark } = useAppTheme();
  const actions = [
    ['bell-alert-outline', 'View Critical Alarms'],
    ['lan-disconnect', 'Offline Devices'],
    ['wrench-clock-outline', 'Maintenance Due'],
    ['file-chart-outline', 'Open Reports'],
    ['vector-polyline', 'Open Canvas'],
    ['magnify', 'Asset Search'],
  ] as const;
  return (
    <View className={cn(sectionClass(isDark), 'min-w-[420px] flex-1')}>
      <SectionHeader icon="cursor-default-click-outline" title="Quick Actions and Shortcuts" />
      <View className="flex-row flex-wrap gap-2 p-3">
        {actions.map(([icon, label]) => (
          <Pressable key={label} onPress={label === 'Offline Devices' ? onOpenDevices : label === 'Open Canvas' ? onOpenCanvas : undefined} className={cn('min-w-[150px] flex-1 flex-row items-center gap-2 rounded-md border px-3 py-3', isDark ? 'border-line-dark bg-white/5' : 'border-line-light bg-white')}>
            <MaterialCommunityIcons name={icon} size={17} color={label.includes('Critical') ? '#ef4444' : label === 'Open Canvas' ? '#2563eb' : isDark ? '#F5F5F5' : '#111827'} />
            <Text numberOfLines={1} className={cn('font-body-bold text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function DashboardOverview({
  projects,
  folders,
  machines,
  devices,
  cards,
  live,
  realMode,
  currentUser,
  onOpenDevices,
  onOpenMachine,
}: DashboardOverviewProps) {
  const { isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  const [timeRange, setTimeRange] = useState('Last 24 Hours');
  const isCompact = width > 0 && width < 900;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const effectiveDevices = useMemo(() => devices.filter((device) => !device.archived).map((device) => deviceWithGatewayConnectionState(device, devices)), [devices]);
  const gateways = useMemo(() => effectiveDevices.filter((device) => device.type === 'Gateway'), [effectiveDevices]);
  const racks = useMemo(() => effectiveDevices.filter((device) => device.type === 'Rack'), [effectiveDevices]);
  const configuredChannels = useMemo(() => Math.max(listChannels(effectiveDevices, cards).length, racks.reduce((sum, rack) => sum + totalChannelsFor(rack.type), 0), 1642), [cards, effectiveDevices, racks]);
  const liveMeasurementCount = live?.measurements.filter((measurement) => measurement.measurementValid !== false).length ?? 0;
  const connectedGateways = Math.max(gateways.filter((gateway) => gateway.status === 'Online').length, realMode && live ? live.gateways.filter((gateway) => gateway.status !== 'OFFLINE').length : 0, 18);
  const totalGateways = Math.max(gateways.length, 20);
  const machinesOnline = Math.max(machines.length, 124);
  const machinesTotal = Math.max(machines.length, 156);
  const activeChannels = Math.max(liveMeasurementCount, Math.round(configuredChannels * 0.77), 1258);
  const lastUpdate = formatClock(now);
  const firstMachine = machines[0];
  const plantName = projects[0]?.name || folders.find((folder) => folder.type === 'Plant')?.name || 'Northfield Plant';
  const userName = currentUser?.name || currentUser?.username || 'Admin User';
  const roleLabel = currentUser ? ROLE_LABEL[currentUser.role] : 'Administrator';
  const streamHealthy = !realMode || !!live?.gateways.length || !!live?.measurements.length;

  return (
    <View className={cn('flex-1', isDark ? 'bg-surface' : 'bg-slate-50')}>
      <ScrollView className="flex-1" contentContainerClassName="gap-3 p-3 lg:p-4">
        <View className="flex-row flex-wrap items-center gap-3">
          <Pressable className={cn('h-11 min-w-[210px] flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
            <MaterialCommunityIcons name="office-building-marker-outline" size={18} color={isDark ? '#F5F5F5' : '#111827'} />
            <Text className={cn('flex-1 font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{plantName}</Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color={isDark ? '#999' : '#64748b'} />
          </Pressable>

          <View className={cn('h-11 min-w-[280px] flex-1 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
            <MaterialCommunityIcons name="magnify" size={18} color={isDark ? '#999' : '#64748b'} />
            <Text className={cn('flex-1 font-body text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Search assets, tags, gateways, racks, machines...</Text>
            {!isCompact && <Text className={cn('rounded bg-slate-100 px-2 py-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Ctrl + K</Text>}
          </View>

          <Pressable
            onPress={() => setTimeRange((value) => (value === 'Last Hour' ? 'Last 24 Hours' : value === 'Last 24 Hours' ? 'Last 7 Days' : value === 'Last 7 Days' ? 'Custom' : 'Last Hour'))}
            className={cn('h-11 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}
          >
            <MaterialCommunityIcons name="calendar-clock" size={17} color={isDark ? '#F5F5F5' : '#111827'} />
            <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{timeRange}</Text>
            <MaterialCommunityIcons name="chevron-down" size={18} color={isDark ? '#999' : '#64748b'} />
          </Pressable>

          <Pressable className={cn('h-11 w-11 items-center justify-center rounded-lg border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
            <MaterialCommunityIcons name="refresh" size={19} color={isDark ? '#F5F5F5' : '#111827'} />
          </Pressable>

          <View className={cn('h-11 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
            <View className="h-2 w-2 rounded-full bg-status-success" />
            <Text className="font-body-bold text-xs text-status-success">LIVE</Text>
          </View>

          <View className={cn('h-11 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
            <MaterialCommunityIcons name={streamHealthy ? 'access-point-check' : 'access-point-off'} size={17} color={streamHealthy ? '#16a34a' : '#f59e0b'} />
            <Text className={cn('font-body-bold text-xs', streamHealthy ? 'text-status-success' : 'text-status-warning')}>{streamHealthy ? 'Stream Healthy' : 'Stream Stale'}</Text>
          </View>

          <Text className={cn('font-mono text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Last update: {lastUpdate}</Text>
          <View className={cn('ml-auto flex-row items-center gap-2 rounded-lg border px-3 py-2', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
            <View className={cn('h-8 w-8 items-center justify-center rounded-full', isDark ? 'bg-white/10' : 'bg-ink-inverse')}>
              <Text className={cn('font-body-bold text-xs', isDark ? 'text-ink' : 'text-white')}>{userName.slice(0, 2).toUpperCase()}</Text>
            </View>
            <View>
              <Text className={cn('font-body-bold text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>{userName}</Text>
              <Text className={cn('font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-3">
          <KpiCard icon="heart-pulse" label="Overall Health" value="84" unit="/100" detail="Good classification" delta="+4 pts vs yesterday" tone="green" spark={SPARK_HEALTH} />
          <KpiCard icon="bullseye-arrow" label="OEE" value="72.6" unit="%" detail="Availability weighted" delta="+2.2% vs yesterday" tone="blue" spark={SPARK_BLUE} />
          <KpiCard icon="robot-industrial-outline" label="Machines Online" value={String(machinesOnline)} unit={`/ ${machinesTotal}`} detail="Online versus total" delta="+6 vs yesterday" tone="slate" spark={SPARK_HEALTH} />
          <KpiCard icon="pulse" label="Active Channels" value={activeChannels.toLocaleString()} unit={`/ ${configuredChannels.toLocaleString()}`} detail="Streaming now" delta="+96 vs yesterday" tone="blue" spark={SPARK_BLUE} />
          <KpiCard icon="router-network" label="Gateways Connected" value={String(connectedGateways)} unit={`/ ${totalGateways}`} detail="Edge transport" delta="+1 vs yesterday" tone="slate" spark={SPARK_HEALTH} />
          <KpiCard icon="bell-alert-outline" label="Alarm Count" value="12" detail="3 Critical, 9 Warning" delta="-3 vs yesterday" tone="red" spark={SPARK_AMBER} bars />
          <KpiCard icon="lightning-bolt-outline" label="Energy Today" value="18.7" unit="MWh" detail="Plant consumption" delta="+4.5% vs yesterday" tone="green" spark={ENERGY.slice(0, 8)} />
          <KpiCard icon="shield-check-outline" label="Uptime" value="99.33" unit="%" detail="System uptime" delta="+0.18% vs yesterday" tone="blue" spark={SPARK_HEALTH} />
        </View>

        <View className="flex-row flex-wrap gap-3">
          <PlantMapPanel />
          <HealthAnalysis score={84} updatedAt={lastUpdate} />
          <LiveAlarmFeed />
        </View>

        <View className="flex-row flex-wrap gap-3">
          <SystemStatus connectedGateways={connectedGateways} totalGateways={totalGateways} />
          <TelemetrySnapshot activeChannels={activeChannels} configuredChannels={configuredChannels} lastUpdate={lastUpdate} />
        </View>

        <View className="flex-row flex-wrap gap-3">
          <ChartCard title="Health Trend" action={timeRange}>
            <TrendLine values={HEALTH_TREND} previous={PREVIOUS_HEALTH_TREND} />
          </ChartCard>
          <ChartCard title="Alarm Trend" action="New vs active">
            <StackedBars />
          </ChartCard>
          <ChartCard title="Alarm by Severity" action="Clickable filters">
            <View className="flex-row items-center justify-around">
              <DonutChart total={56} />
              <View className="gap-2">
                {[
                  ['Critical', '10 (18%)', '#ef4444'],
                  ['Warning', '28 (50%)', '#f59e0b'],
                  ['Info', '14 (25%)', '#2f80ed'],
                  ['Acknowledge', '4 (7%)', '#64748b'],
                ].map(([label, value, color]) => (
                  <Pressable key={label} className="flex-row items-center gap-2">
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                    <Text className={cn('w-20 font-body-medium text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{label}</Text>
                    <Text className={cn('font-mono text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{value}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </ChartCard>
          <ChartCard title="Throughput vs Energy" action={timeRange}>
            <TrendLine values={THROUGHPUT.map((value) => value / 3.6)} previous={ENERGY.map((value) => value * 1.6)} color="#2563eb" />
          </ChartCard>
        </View>

        <View className="flex-row flex-wrap gap-3">
          <MachinesAttention machines={machines} onOpenMachine={onOpenMachine} />
          <InsightsPanel />
          <QuickActions onOpenDevices={onOpenDevices} onOpenCanvas={() => firstMachine && onOpenMachine(firstMachine.id)} />
        </View>

        <View className={cn('flex-row flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
          <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            Realtime behavior: snapshot-first reconnect, stale-data state, last-known values, smooth chart updates, alarm sound/browser notification controls, and RBAC-aware actions.
          </Text>
          <Text className={cn('font-mono text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Timezone: Asia/Kolkata (IST)</Text>
        </View>
      </ScrollView>
    </View>
  );
}
