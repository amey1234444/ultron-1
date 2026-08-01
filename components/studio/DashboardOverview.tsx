import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
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
type DetailPanel =
  | 'kpis'
  | 'plant'
  | 'health'
  | 'alarms'
  | 'system'
  | 'telemetry'
  | 'healthTrend'
  | 'alarmTrend'
  | 'severity'
  | 'throughput'
  | 'machines'
  | 'insights'
  | 'actions';

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
const PLANT_OVERVIEW_IMAGE_URI = '/dashboard/plant-overview.png';

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

function Sparkline({ values, color = '#16a34a', bars = false, compact = false }: { values: readonly number[]; color?: string; bars?: boolean; compact?: boolean }) {
  const width = compact ? 56 : 78;
  const height = compact ? 18 : 28;
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
  compact = false,
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
  compact?: boolean;
}) {
  const { isDark } = useAppTheme();
  const color = toneColor(tone);
  return (
    <View className={cn(compact ? 'min-w-[148px] flex-1 rounded-lg border p-2' : 'min-w-[170px] flex-1 rounded-lg border p-2', 'h-full overflow-hidden', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
      <View className={cn('flex-row items-start', compact ? 'gap-2' : 'gap-3')}>
        <View className={cn(compact ? 'h-7 w-7' : 'h-8 w-8', 'items-center justify-center rounded-lg')} style={{ backgroundColor: `${color}16` }}>
          <MaterialCommunityIcons name={icon} size={compact ? 16 : 18} color={color} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className={cn('font-body-bold', compact ? 'text-[10px]' : 'text-[12px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
            {label}
          </Text>
          <View className={cn('flex-row items-end gap-1', compact ? 'mt-0.5' : 'mt-1')}>
            <Text className={cn('font-display', compact ? 'text-lg' : 'text-xl', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
            {unit && <Text className={cn('pb-0.5 font-body-medium', compact ? 'text-[10px]' : 'text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{unit}</Text>}
          </View>
          <Text numberOfLines={1} className={cn('font-body', compact ? 'text-[9px]' : 'text-[11px]', color === '#dc2626' ? 'text-status-danger' : 'text-status-success')}>
            {delta}
          </Text>
        </View>
      </View>
      <View className={cn('flex-row items-end justify-between', compact ? 'mt-0.5' : 'mt-2')}>
        <Text numberOfLines={1} className={cn('font-body', compact ? 'max-w-[58px] text-[9px]' : 'text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {detail}
        </Text>
        <Sparkline values={spark} color={color} bars={bars} compact={compact} />
      </View>
    </View>
  );
}

function sectionClass(isDark: boolean) {
  return cn('h-full overflow-hidden rounded-lg border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white');
}

function SectionHeader({ icon, title, action, compact = false }: { icon?: IconName; title: string; action?: string; compact?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <View className={cn('flex-row items-center justify-between border-b', compact ? 'px-3 py-2' : 'px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
      <View className="flex-row items-center gap-2">
        {icon && <MaterialCommunityIcons name={icon} size={compact ? 14 : 16} color={isDark ? '#F5F5F5' : '#111827'} />}
        <Text numberOfLines={1} className={cn('font-body-bold', compact ? 'text-xs' : 'text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
      </View>
      {action && <Text numberOfLines={1} className={cn('font-body-medium text-primary-blue', compact ? 'text-[10px]' : 'text-[11px]')}>{action}</Text>}
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

function HealthGauge({ score, compact = false }: { score: number; compact?: boolean }) {
  const valueAngle = -180 + clamp(score, 0, 100) * 1.8;
  const height = compact ? 106 : 170;
  return (
    <Svg width="100%" height={height} viewBox="0 0 240 170">
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

function HealthAnalysis({ score, updatedAt, compact = false }: { score: number; updatedAt: string; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const contributors = ['Boiler Feed Pump-02', 'Compressor-03', 'Cooling Tower-01'];
  const metrics = [
    ['Availability', 89],
    ['Performance', 78],
    ['Reliability', 83],
    ['Maintainability', 74],
  ] as const;

  return (
    <View className={cn(sectionClass(isDark), 'flex-[0.7]')}>
      <SectionHeader icon="heart-pulse" title="Overall Health" compact={compact} />
      <View className={compact ? 'px-3 pb-2 pt-1' : 'px-4 pb-4 pt-2'}>
        <HealthGauge score={score} compact={compact} />
        <View className={compact ? 'gap-1.5' : 'gap-2'}>
          {metrics.map(([label, value]) => (
            <View key={label}>
              <View className="mb-0.5 flex-row justify-between">
                <Text className={cn('font-body-medium', compact ? 'text-[9px]' : 'text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{label}</Text>
                <Text className={cn('font-mono', compact ? 'text-[9px]' : 'text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{value}%</Text>
              </View>
              <View className={cn(compact ? 'h-1' : 'h-1.5', 'rounded-full', isDark ? 'bg-white/10' : 'bg-slate-100')}>
                <View className={cn(compact ? 'h-1' : 'h-1.5', 'rounded-full bg-status-success')} style={{ width: `${value}%` }} />
              </View>
            </View>
          ))}
        </View>
        {!compact && <View className={cn('mt-3 rounded-md px-3 py-2', isDark ? 'bg-white/5' : 'bg-slate-50')}>
          <Text className={cn('font-body-medium text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>Reduced by</Text>
          <Text className={cn('mt-1 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {contributors.join(', ')}
          </Text>
          <Text className={cn('mt-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Calculated {updatedAt}</Text>
        </View>}
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

function StackedBars({ height = 170 }: { height?: number } = {}) {
  const days = ['May 18', 'May 19', 'May 20', 'May 21', 'May 22', 'May 23', 'May 24'];
  const critical = [10, 11, 18, 15, 20, 13, 16];
  const warning = [22, 29, 34, 27, 31, 36, 30];
  const info = [14, 18, 16, 12, 20, 15, 18];
  const width = 520;
  const baseY = height - 34;
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
            <SvgText x={x - 8} y={height - 12} fontSize={10} fill="#64748b">
              {day.slice(4)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function DonutChart({ total, size = 150 }: { total: number; size?: number }) {
  const scale = size / 150;
  const radius = 46 * scale;
  const circumference = 2 * Math.PI * radius;
  const segments = [
    { label: 'Critical', value: 10, color: '#ef4444' },
    { label: 'Warning', value: 28, color: '#f59e0b' },
    { label: 'Info', value: 14, color: '#2f80ed' },
    { label: 'Acknowledge', value: 4, color: '#64748b' },
  ];
  let offset = 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth={18 * scale} fill="none" />
      {segments.map((segment) => {
        const length = (segment.value / total) * circumference;
        const item = (
          <Circle
            key={segment.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={segment.color}
            strokeWidth={18 * scale}
            fill="none"
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        offset += length;
        return item;
      })}
      <SvgText x={size / 2} y={size / 2 - 3} textAnchor="middle" fontSize={22 * scale} fontWeight="700" fill="#111827">
        {total}
      </SvgText>
      <SvgText x={size / 2} y={size / 2 + 16 * scale} textAnchor="middle" fontSize={12 * scale} fill="#64748b">
        Total
      </SvgText>
    </Svg>
  );
}

function PlantMapPanel({ compact = false }: { compact?: boolean } = {}) {
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
    <View className={cn(sectionClass(isDark), 'flex-[1.35]')}>
      <View className={cn('flex-row items-center justify-between border-b', compact ? 'px-3 py-2' : 'px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
        <View>
          <Text className={cn('font-body-bold', compact ? 'text-xs' : 'text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>Plant Overview</Text>
          <Text numberOfLines={1} className={cn('font-body', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Location markers use saved map coordinates when configured</Text>
        </View>
        <View className={cn('flex-row', compact ? 'gap-2' : 'gap-4')}>
          {(['healthy', 'warning', 'critical', 'offline'] as const).map((status) => (
            <View key={status} className="flex-row items-center gap-1">
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: STATUS_COLORS[status] }} />
              <Text className={cn('font-body-medium text-[10px] capitalize', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{status}</Text>
            </View>
          ))}
        </View>
      </View>
      <View
        className={cn('relative overflow-hidden px-3 py-2', isDark ? 'bg-slate-950' : 'bg-[#f7fbff]')}
        style={{ height: compact ? 230 : 350 }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 640 330" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          <Rect x={0} y={0} width={640} height={330} fill={isDark ? '#07111f' : '#f7fbff'} />
          {Array.from({ length: 17 }).map((_, index) => (
            <Line key={`v-${index}`} x1={index * 40} x2={index * 40} y1={0} y2={330} stroke={isDark ? '#1e293b' : '#e2edf7'} strokeWidth={1} />
          ))}
          {Array.from({ length: 10 }).map((_, index) => (
            <Line key={`h-${index}`} x1={0} x2={640} y1={index * 36} y2={index * 36} stroke={isDark ? '#1e293b' : '#e2edf7'} strokeWidth={1} />
          ))}
          <Path d="M58 285 C174 316 410 316 580 257" fill="none" stroke={isDark ? '#1f2937' : '#d7e6f4'} strokeWidth={28} opacity={0.5} />
        </Svg>
        <Image
          source={{ uri: PLANT_OVERVIEW_IMAGE_URI }}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: compact ? 48 : 46,
            right: compact ? 18 : 24,
            top: compact ? 10 : 24,
            bottom: compact ? -8 : 8,
            opacity: isDark ? 0.86 : 0.98,
          }}
        />
        <Svg width="100%" height="100%" viewBox="0 0 640 330" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          {areas.map((area) => {
            const color = STATUS_COLORS[area.status];
            const labelX = area.x < 160 ? area.x - 18 : area.x > 460 ? area.x - 128 : area.x - 54;
            const labelY = area.y < 110 ? area.y - 44 : area.y + 18;
            return (
              <G key={area.name}>
                <Line x1={area.x} y1={area.y} x2={labelX + 68} y2={labelY + 34} stroke={color} strokeWidth={2.25} />
                <Circle cx={area.x} cy={area.y} r={11} fill={`${color}22`} stroke={color} strokeWidth={2} />
                <Circle cx={area.x} cy={area.y} r={5} fill={color} stroke="#ffffff" strokeWidth={2} />
                <Rect x={labelX} y={labelY} width={compact ? 120 : 134} height={compact ? 42 : 54} rx={7} fill="#ffffff" opacity={0.94} stroke="#dbe3ec" />
                <SvgText x={labelX + 10} y={labelY + 17} fontSize={compact ? 9 : 11} fontWeight="700" fill="#111827">
                  {area.name}
                </SvgText>
                <Circle cx={labelX + 11} cy={labelY + (compact ? 29 : 35)} r={3.5} fill={color} />
                <SvgText x={labelX + 21} y={labelY + (compact ? 32 : 39)} fontSize={compact ? 8 : 10} fill="#334155">
                  {area.status === 'healthy' ? 'Healthy' : 'Warning'} - {area.count} machines
                </SvgText>
              </G>
            );
          })}
        </Svg>
        <View className={cn('absolute gap-1.5', compact ? 'left-3 top-12' : 'left-5 top-16')}>
          {['target', 'plus', 'minus', 'crosshairs-gps'].map((icon) => (
            <Pressable key={icon} className={cn(compact ? 'h-7 w-7' : 'h-8 w-8', 'items-center justify-center rounded-md border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <MaterialCommunityIcons name={icon as IconName} size={compact ? 14 : 16} color={isDark ? '#F5F5F5' : '#111827'} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function LiveAlarmFeed({ compact = false }: { compact?: boolean } = {}) {
  const { isDark } = useAppTheme();
  const alarms = [
    ['Critical', 'High vibration detected', 'Compressor-03', 'Compressor Area', 'V1', '10:24:12 AM', '12.8 mm/s', '> 10.0', 'Ack', 'R. Singh', '12m'],
    ['Warning', 'High temperature', 'Boiler Feed Pump-02', 'Boiler Area', 'T2', '10:23:45 AM', '82 C', '> 78', 'Open', 'A. Patel', '21m'],
    ['Warning', 'Flow deviation', 'Pump Line-04', 'Process Pump Line', 'P3', '10:22:58 AM', '71%', '< 80', 'Open', 'M. Khan', '28m'],
    ['Warning', 'Motor overcurrent', 'Turbine-01', 'Turbine Hall', 'C1', '10:22:31 AM', '41 A', '> 38', 'Ack', 'S. Rao', '34m'],
    ['Info', 'Gateway recovered', 'rack-gw-01', 'Utility Area', '-', '10:18:47 AM', 'Online', '-', 'Ack', 'System', '4m'],
  ];
  return (
    <View className={cn(sectionClass(isDark), 'flex-1')}>
      <SectionHeader icon="bell-alert-outline" title="Live Alarm Feed" action="View all alarms" compact={compact} />
      <View className={compact ? 'px-2 py-1.5' : 'px-3 py-2'}>
        <View className={cn('flex-row items-center gap-2', compact ? 'mb-1' : 'mb-2')}>
          {['Severity', 'Area', 'Source', 'Ack', 'History'].map((filter) => (
            <Pressable key={filter} className={cn('rounded-full border', compact ? 'px-2 py-0.5' : 'px-2.5 py-1', isDark ? 'border-line-dark' : 'border-line-light')}>
              <Text className={cn('font-body-medium', compact ? 'text-[9px]' : 'text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{filter}</Text>
            </Pressable>
          ))}
        </View>
        <View className={cn('rounded-md border', isDark ? 'border-line-dark' : 'border-line-light')}>
          {alarms.slice(0, compact ? 4 : alarms.length).map((alarm, index) => {
            const severity = alarm[0];
            const color = severity === 'Critical' ? '#ef4444' : severity === 'Warning' ? '#f59e0b' : '#2f80ed';
            return (
              <View key={`${alarm[1]}-${index}`} className={cn('flex-row items-center border-b last:border-b-0', compact ? 'gap-1 px-2 py-1' : 'gap-2 px-2 py-2', isDark ? 'border-line-dark' : 'border-line-light')}>
                <Text className={cn('rounded px-1.5 text-center font-body-bold', compact ? 'w-12 py-0.5 text-[9px]' : 'w-14 py-1 text-[10px]')} style={{ color, backgroundColor: `${color}16` }}>
                  {severity}
                </Text>
                <View className="min-w-0 flex-[1.4]">
                  <Text numberOfLines={1} className={cn('font-body-bold', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{alarm[1]}</Text>
                  {!compact && <Text numberOfLines={1} className={cn('font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[2]} - {alarm[3]}</Text>}
                </View>
                <Text className={cn(compact ? 'w-8 text-[9px]' : 'w-8 text-[10px]', 'font-mono', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[4]}</Text>
                <Text className={cn(compact ? 'w-11 text-[9px]' : 'w-16 text-[10px]', 'font-mono', isDark ? 'text-ink' : 'text-ink-inverse')}>{alarm[6]}</Text>
                {!compact && <Text className={cn('w-14 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[7]}</Text>}
                <Text className={cn(compact ? 'w-11 text-[9px]' : 'w-20 text-[10px]', 'font-mono', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[5]}</Text>
                <Text className={cn(compact ? 'w-9 text-[9px]' : 'w-14 text-[10px]', 'font-body-medium', alarm[8] === 'Ack' ? 'text-status-success' : 'text-status-warning')}>{alarm[8]}</Text>
                {!compact && <Text numberOfLines={1} className={cn('w-16 font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[9]}</Text>}
                <Text className={cn(compact ? 'w-8 text-[9px]' : 'w-10 text-[10px]', 'font-mono', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm[10]}</Text>
                <View className="flex-row gap-1">
                  {['check', 'comment-text-outline', 'account-arrow-right-outline', 'clock-outline', 'chart-line'].map((icon) => (
                    <Pressable key={icon} className={cn(compact ? 'h-5 w-5' : 'h-6 w-6', 'items-center justify-center rounded border', isDark ? 'border-line-dark' : 'border-line-light')}>
                      <MaterialCommunityIcons name={icon as IconName} size={compact ? 11 : 13} color={isDark ? '#F5F5F5' : '#111827'} />
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

function SystemStatus({ connectedGateways, totalGateways, compact = false }: { connectedGateways: number; totalGateways: number; compact?: boolean }) {
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
    <View className={cn(sectionClass(isDark), 'flex-1')}>
      <SectionHeader icon="server-network" title="System Status" action="View all" compact={compact} />
      <View className={cn('flex-row flex-wrap', compact ? 'gap-1.5 p-2' : 'gap-2 p-3')}>
        {services.slice(0, compact ? 4 : services.length).map(([service, status]) => {
          const color = status === 'healthy' ? '#16a34a' : status === 'degraded' ? '#f59e0b' : '#ef4444';
          return (
            <View key={service} className={cn(compact ? 'min-w-[150px] px-2 py-1' : 'min-w-[210px] px-2 py-1.5', 'flex-1 flex-row items-center justify-between rounded-md', isDark ? 'bg-white/5' : 'bg-slate-50')}>
              <Text numberOfLines={1} className={cn('font-body-medium', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{service}</Text>
              <View className="flex-row items-center gap-1">
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
                <Text className={cn('font-body-medium', compact ? 'text-[9px]' : 'text-[10px]', status === 'healthy' ? 'text-status-success' : 'text-status-warning')}>{status}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TelemetrySnapshot({ activeChannels, configuredChannels, lastUpdate, compact = false }: { activeChannels: number; configuredChannels: number; lastUpdate: string; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const snapshots = [
    ['Packet Rate', '2,845', 'pkt/s', SPARK_BLUE],
    ['Avg Latency', '32', 'ms', [44, 28, 35, 26, 32, 24, 33, 31]],
    ['Last Payload', lastUpdate, '', SPARK_HEALTH],
    ['Devices Streaming', String(activeChannels), `/ ${configuredChannels}`, SPARK_HEALTH],
  ] as const;
  return (
    <View className={cn(sectionClass(isDark), 'flex-1')}>
      <SectionHeader icon="pulse" title="Live Telemetry Snapshot" compact={compact} />
      <View className={cn('flex-row flex-wrap', compact ? 'gap-1.5 p-2' : 'gap-2 p-3')}>
        {snapshots.map(([label, value, unit, spark]) => (
          <View key={label} className={cn(compact ? 'min-w-[118px] px-2 py-1.5' : 'min-w-[150px] px-3 py-2', 'flex-1 rounded-md', isDark ? 'bg-white/5' : 'bg-slate-50')}>
            <Text className={cn('font-body-medium', compact ? 'text-[9px]' : 'text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
            <View className={cn('flex-row items-end gap-1', compact ? 'mt-0.5' : 'mt-1')}>
              <Text className={cn('font-display', compact ? 'text-sm' : 'text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
              <Text className={cn('pb-0.5 font-body', compact ? 'text-[9px]' : 'text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{unit}</Text>
            </View>
            {!compact && <Sparkline values={spark} color="#2563eb" />}
          </View>
        ))}
      </View>
    </View>
  );
}

function ChartCard({ title, action, children, compact = false }: { title: string; action?: string; children: ReactNode; compact?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <View className={cn(sectionClass(isDark), 'flex-1')}>
      <SectionHeader title={title} action={action ?? 'Last 7 Days'} compact={compact} />
      <View className={compact ? 'p-2' : 'p-3'}>{children}</View>
    </View>
  );
}

function MachinesAttention({ machines, onOpenMachine, compact = false }: { machines: MachineNode[]; onOpenMachine: (id: string) => void; compact?: boolean }) {
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
    <View className={cn(sectionClass(isDark), 'flex-[1.25]')}>
      <SectionHeader icon="alert-decagram-outline" title="Machines Requiring Attention" compact={compact} />
      <View className={compact ? 'px-2 py-1.5' : 'px-3 py-2'}>
        <View className="flex-row px-2 py-1">
          {(compact ? ['Machine', 'Area', 'Health', 'Issue', 'Alarms', 'Action'] : ['Machine', 'Area', 'Health', 'Issue', 'Alarms', 'Last Alarm', 'Telemetry', 'Risk', 'Owner', 'Action']).map((heading, index) => (
            <Text key={heading} className={cn('font-body-bold', compact ? 'text-[9px]' : 'text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted', index < 2 ? 'flex-[1.1]' : index === 3 ? 'flex-[1.2]' : 'flex-1')}>
              {heading}
            </Text>
          ))}
        </View>
        {rows.slice(0, compact ? 3 : rows.length).map((row, index) => {
          const health = Number(row[2]);
          const riskColor = row[7] === 'High' ? '#ef4444' : row[7] === 'Medium' ? '#f59e0b' : '#16a34a';
          return (
            <View key={row[0]} className={cn('flex-row items-center rounded-md px-2', compact ? 'py-1' : 'py-2', index % 2 === 0 && (isDark ? 'bg-white/5' : 'bg-slate-50'))}>
              <Text numberOfLines={compact ? 1 : undefined} className={cn('flex-[1.1] font-body-bold', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{row[0]}</Text>
              <Text numberOfLines={compact ? 1 : undefined} className={cn('flex-[1.1] font-body', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row[1]}</Text>
              <Text className={cn('flex-1 rounded px-2 text-center font-body-bold', compact ? 'py-0.5 text-[9px]' : 'py-1 text-[10px]')} style={{ color: health < 50 ? '#ef4444' : health < 75 ? '#f59e0b' : '#16a34a', backgroundColor: health < 50 ? '#fee2e2' : health < 75 ? '#fef3c7' : '#dcfce7' }}>
                {row[2]}
              </Text>
              <Text numberOfLines={1} className={cn('flex-[1.2] font-body', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{row[3]}</Text>
              <Text className={cn('flex-1 font-mono text-status-danger', compact ? 'text-[10px]' : 'text-[11px]')}>{row[4]}</Text>
              {!compact && <>
                <Text className={cn('flex-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row[5]}</Text>
                <Text className={cn('flex-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row[6]}</Text>
                <Text className="flex-1 font-body-bold text-[10px]" style={{ color: riskColor }}>{row[7]}</Text>
                <Text className={cn('flex-1 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row[8]}</Text>
              </>}
              <Pressable disabled={!fallbackMachineId} onPress={() => fallbackMachineId && onOpenMachine(fallbackMachineId)} className="flex-1 rounded-md bg-primary-blue/10 px-2 py-1">
                <Text className={cn('text-center font-body-bold text-primary-blue', compact ? 'text-[9px]' : 'text-[10px]')}>View Details</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function InsightsPanel({ compact = false }: { compact?: boolean } = {}) {
  const { isDark } = useAppTheme();
  const insights = [
    ['Compressor-03', 'Unbalanced motor detected', 'Check bearing condition', 'V1 12.8 mm/s, T2 82 C', '92%', 'High'],
    ['Boiler Feed Pump-02', 'Temperature trending upward', 'Inspect cooling system', 'T2 +8.4% in 24h', '86%', 'Medium'],
    ['Cooling Tower-01', 'Efficiency dropped', 'Clean inlet and verify fan speed', 'OEE -4.2%', '78%', 'Medium'],
    ['Rotary Airlock', 'Check media and valves', 'Schedule lubrication inspection', 'Current stable, vibration rising', '71%', 'Low'],
  ];
  return (
    <View className={cn(sectionClass(isDark), 'flex-1')}>
      <SectionHeader icon="lightbulb-on-outline" title="Insights and Recommended Actions" action="View all" compact={compact} />
      <View className={cn(compact ? 'gap-1.5 p-2' : 'gap-2 p-3')}>
        {insights.slice(0, compact ? 2 : insights.length).map((item) => {
          const color = item[5] === 'High' ? '#ef4444' : item[5] === 'Medium' ? '#f59e0b' : '#16a34a';
          return (
            <View key={`${item[0]}-${item[1]}`} className={cn('rounded-md border-l-4', compact ? 'px-2 py-1.5' : 'px-3 py-2', isDark ? 'bg-white/5' : 'bg-slate-50')} style={{ borderLeftColor: color }}>
              <View className="flex-row items-start justify-between gap-2">
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className={cn('font-body-bold', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{item[0]}: {item[1]}</Text>
                  <Text numberOfLines={1} className={cn('mt-0.5 font-body', compact ? 'text-[9px]' : 'text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Probable cause: process drift. Recommended: {item[2]}</Text>
                  {!compact && <Text numberOfLines={1} className={cn('font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{item[3]} - Confidence {item[4]}</Text>}
                </View>
                <Text className={cn('rounded px-2 font-body-bold', compact ? 'py-0.5 text-[9px]' : 'py-1 text-[10px]')} style={{ color, backgroundColor: `${color}16` }}>{item[5]}</Text>
              </View>
              {!compact && <View className="mt-2 flex-row gap-2">
                {['Create WO', 'Assign', 'Accept', 'Dismiss'].map((action) => (
                  <Pressable key={action} className={cn('rounded-md border px-2 py-1', isDark ? 'border-line-dark' : 'border-line-light')}>
                    <Text className={cn('font-body-medium text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{action}</Text>
                  </Pressable>
                ))}
              </View>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function QuickActions({ onOpenDevices, onOpenCanvas, compact = false }: { onOpenDevices: () => void; onOpenCanvas: () => void; compact?: boolean }) {
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
    <View className={cn(sectionClass(isDark), 'flex-1')}>
      <SectionHeader icon="cursor-default-click-outline" title="Quick Actions and Shortcuts" compact={compact} />
      <View className={cn('flex-row flex-wrap', compact ? 'gap-1.5 p-2' : 'gap-2 p-3')}>
        {actions.map(([icon, label]) => (
          <Pressable key={label} onPress={label === 'Offline Devices' ? onOpenDevices : label === 'Open Canvas' ? onOpenCanvas : undefined} className={cn(compact ? 'min-w-[122px] px-2 py-2' : 'min-w-[150px] px-3 py-3', 'flex-1 flex-row items-center gap-2 rounded-md border', isDark ? 'border-line-dark bg-white/5' : 'border-line-light bg-white')}>
            <MaterialCommunityIcons name={icon} size={compact ? 15 : 17} color={label.includes('Critical') ? '#ef4444' : label === 'Open Canvas' ? '#2563eb' : isDark ? '#F5F5F5' : '#111827'} />
            <Text numberOfLines={1} className={cn('font-body-bold', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function DashboardDetailModal({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const { isDark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const modalWidth = Math.min(Math.max(width - 32, 320), 1280);
  const modalHeight = Math.min(Math.max(height - 64, 360), 820);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 p-4">
        <View
          className={cn('overflow-hidden rounded-xl border shadow-2xl', isDark ? 'border-line-dark bg-surface' : 'border-line-light bg-white')}
          style={{ width: modalWidth, maxHeight: modalHeight }}
        >
          <View className={cn('flex-row items-center justify-between border-b px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
            <Text className={cn('font-body-bold text-base', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
            <Pressable onPress={onClose} className={cn('rounded-lg border px-3 py-1.5', isDark ? 'border-line-dark bg-white/5' : 'border-line-light bg-slate-50')}>
              <Text className={cn('font-body-bold text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>Cancel</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
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
  const { width, height } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  const [timeRange, setTimeRange] = useState('Last 24 Hours');
  const [activePanel, setActivePanel] = useState<DetailPanel | null>(null);
  const isCompact = width > 0 && width < 900;
  const isShortViewport = height > 0 && height < 950;
  const dashboardSizes = { top: 44, kpi: 106, main: 324, system: 96, charts: 176, bottom: 220, chartLine: 116, donut: 108 };

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
  const detailTitles: Record<DetailPanel, string> = {
    kpis: 'Primary Realtime KPIs',
    plant: 'Interactive Plant Overview',
    health: 'Overall Health Analysis',
    alarms: 'Live Alarm Feed',
    system: 'System Status',
    telemetry: 'Live Telemetry Snapshot',
    healthTrend: 'Health Trend',
    alarmTrend: 'Alarm Trend',
    severity: 'Alarm Distribution by Severity',
    throughput: 'Throughput vs Energy',
    machines: 'Machines Requiring Attention',
    insights: 'Insights and Recommended Actions',
    actions: 'Quick Actions and Shortcuts',
  };
  const openPanel = (panel: DetailPanel) => setActivePanel(panel);
  const closePanel = () => setActivePanel(null);

  const getKpiCards = (compact: boolean) => [
    <KpiCard key="health" icon="heart-pulse" label="Overall Health" value="84" unit="/100" detail="Good classification" delta="+4 pts vs yesterday" tone="green" spark={SPARK_HEALTH} compact={compact} />,
    <KpiCard key="oee" icon="bullseye-arrow" label="OEE" value="72.6" unit="%" detail="Availability weighted" delta="+2.2% vs yesterday" tone="blue" spark={SPARK_BLUE} compact={compact} />,
    <KpiCard key="machines" icon="robot-industrial-outline" label="Machines Online" value={String(machinesOnline)} unit={`/ ${machinesTotal}`} detail="Online versus total" delta="+6 vs yesterday" tone="slate" spark={SPARK_HEALTH} compact={compact} />,
    <KpiCard key="channels" icon="pulse" label="Active Channels" value={activeChannels.toLocaleString()} unit={`/ ${configuredChannels.toLocaleString()}`} detail="Streaming now" delta="+96 vs yesterday" tone="blue" spark={SPARK_BLUE} compact={compact} />,
    <KpiCard key="gateways" icon="router-network" label="Gateways Connected" value={String(connectedGateways)} unit={`/ ${totalGateways}`} detail="Edge transport" delta="+1 vs yesterday" tone="slate" spark={SPARK_HEALTH} compact={compact} />,
    <KpiCard key="alarms" icon="bell-alert-outline" label="Alarm Count" value="12" detail="3 Critical, 9 Warning" delta="-3 vs yesterday" tone="red" spark={SPARK_AMBER} bars compact={compact} />,
    <KpiCard key="energy" icon="lightning-bolt-outline" label="Energy Today" value="18.7" unit="MWh" detail="Plant consumption" delta="+4.5% vs yesterday" tone="green" spark={ENERGY.slice(0, 8)} compact={compact} />,
    <KpiCard key="uptime" icon="shield-check-outline" label="Uptime" value="99.33" unit="%" detail="System uptime" delta="+0.18% vs yesterday" tone="blue" spark={SPARK_HEALTH} compact={compact} />,
  ];

  const renderKpiCards = (compact: boolean) => getKpiCards(compact);

  const renderDetail = () => {
    switch (activePanel) {
      case 'kpis':
        return <View className="flex-row flex-wrap gap-3">{renderKpiCards(false)}</View>;
      case 'plant':
        return <PlantMapPanel />;
      case 'health':
        return <HealthAnalysis score={84} updatedAt={lastUpdate} />;
      case 'alarms':
        return <LiveAlarmFeed />;
      case 'system':
        return <SystemStatus connectedGateways={connectedGateways} totalGateways={totalGateways} />;
      case 'telemetry':
        return <TelemetrySnapshot activeChannels={activeChannels} configuredChannels={configuredChannels} lastUpdate={lastUpdate} />;
      case 'healthTrend':
        return (
          <ChartCard title="Health Trend" action={timeRange}>
            <TrendLine values={HEALTH_TREND} previous={PREVIOUS_HEALTH_TREND} />
          </ChartCard>
        );
      case 'alarmTrend':
        return (
          <ChartCard title="Alarm Trend" action="New vs active">
            <StackedBars />
          </ChartCard>
        );
      case 'severity':
        return (
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
        );
      case 'throughput':
        return (
          <ChartCard title="Throughput vs Energy" action={timeRange}>
            <TrendLine values={THROUGHPUT.map((value) => value / 3.6)} previous={ENERGY.map((value) => value * 1.6)} color="#2563eb" />
          </ChartCard>
        );
      case 'machines':
        return <MachinesAttention machines={machines} onOpenMachine={onOpenMachine} />;
      case 'insights':
        return <InsightsPanel />;
      case 'actions':
        return <QuickActions onOpenDevices={onOpenDevices} onOpenCanvas={() => firstMachine && onOpenMachine(firstMachine.id)} />;
      default:
        return null;
    }
  };
  const dashboardKpiCards = getKpiCards(true);

  return (
    <View className={cn('flex-1', isDark ? 'bg-surface' : 'bg-slate-50')} style={{ minHeight: 0 }}>
      <ScrollView
        className="flex-1"
        style={{ minHeight: 0 }}
        showsVerticalScrollIndicator
        contentContainerStyle={{ flexGrow: 1, padding: 8, paddingBottom: 24 }}
      >
        <View className={cn(isShortViewport ? 'gap-1.5' : 'gap-2')} style={{ flexGrow: 1, width: '100%' }}>
          <View className="flex-row flex-wrap items-center gap-2" style={{ minHeight: dashboardSizes.top }}>
              <Pressable className={cn('h-10 min-w-[190px] flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
                <MaterialCommunityIcons name="office-building-marker-outline" size={17} color={isDark ? '#F5F5F5' : '#111827'} />
                <Text className={cn('flex-1 font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{plantName}</Text>
                <MaterialCommunityIcons name="chevron-down" size={17} color={isDark ? '#999' : '#64748b'} />
              </Pressable>

              <View className={cn('h-10 min-w-[260px] flex-1 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
                <MaterialCommunityIcons name="magnify" size={17} color={isDark ? '#999' : '#64748b'} />
                <Text className={cn('flex-1 font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Search assets, tags, gateways, racks, machines...</Text>
                {!isCompact && <Text className={cn('rounded bg-slate-100 px-2 py-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Ctrl + K</Text>}
              </View>

              <Pressable
                onPress={() => setTimeRange((value) => (value === 'Last Hour' ? 'Last 24 Hours' : value === 'Last 24 Hours' ? 'Last 7 Days' : value === 'Last 7 Days' ? 'Custom' : 'Last Hour'))}
                className={cn('h-10 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}
              >
                <MaterialCommunityIcons name="calendar-clock" size={16} color={isDark ? '#F5F5F5' : '#111827'} />
                <Text className={cn('font-body-bold text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>{timeRange}</Text>
                <MaterialCommunityIcons name="chevron-down" size={17} color={isDark ? '#999' : '#64748b'} />
              </Pressable>

              <Pressable className={cn('h-10 w-10 items-center justify-center rounded-lg border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
                <MaterialCommunityIcons name="refresh" size={18} color={isDark ? '#F5F5F5' : '#111827'} />
              </Pressable>

              <View className={cn('h-10 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
                <View className="h-2 w-2 rounded-full bg-status-success" />
                <Text className="font-body-bold text-xs text-status-success">LIVE</Text>
              </View>

              <View className={cn('h-10 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
                <MaterialCommunityIcons name={streamHealthy ? 'access-point-check' : 'access-point-off'} size={16} color={streamHealthy ? '#16a34a' : '#f59e0b'} />
                <Text className={cn('font-body-bold text-xs', streamHealthy ? 'text-status-success' : 'text-status-warning')}>{streamHealthy ? 'Stream Healthy' : 'Stream Stale'}</Text>
              </View>

              <Text className={cn('font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Last update: {lastUpdate}</Text>
              <View className={cn('flex-row items-center gap-2 rounded-lg border px-2 py-1.5', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
                <View className={cn('h-7 w-7 items-center justify-center rounded-full', isDark ? 'bg-white/10' : 'bg-ink-inverse')}>
                  <Text className={cn('font-body-bold text-[10px]', isDark ? 'text-ink' : 'text-white')}>{userName.slice(0, 2).toUpperCase()}</Text>
                </View>
                <View>
                  <Text className={cn('font-body-bold text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{userName}</Text>
                  <Text className={cn('font-body text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{roleLabel}</Text>
                </View>
              </View>
          </View>

          <View className="gap-2" style={{ width: '100%' }}>
            <Pressable onPress={() => openPanel('kpis')} className="flex-row gap-2" style={{ height: dashboardSizes.kpi, width: '100%' }}>
              {dashboardKpiCards.slice(0, 4)}
            </Pressable>
            <Pressable onPress={() => openPanel('kpis')} className="flex-row gap-2" style={{ height: dashboardSizes.kpi, width: '100%' }}>
              {dashboardKpiCards.slice(4)}
            </Pressable>
          </View>

          <View className="flex-row gap-2" style={{ height: dashboardSizes.main, width: '100%' }}>
              <Pressable onPress={() => openPanel('plant')} className="flex-[1.35]">
                <PlantMapPanel compact />
              </Pressable>
              <Pressable onPress={() => openPanel('health')} className="flex-[0.55]">
                <HealthAnalysis score={84} updatedAt={lastUpdate} compact />
              </Pressable>
              <Pressable onPress={() => openPanel('alarms')} className="flex-1">
                <LiveAlarmFeed compact />
              </Pressable>
          </View>

          <View className="flex-row gap-2" style={{ height: dashboardSizes.system, width: '100%' }}>
              <Pressable onPress={() => openPanel('system')} className="flex-1">
                <SystemStatus connectedGateways={connectedGateways} totalGateways={totalGateways} compact />
              </Pressable>
              <Pressable onPress={() => openPanel('telemetry')} className="flex-1">
                <TelemetrySnapshot activeChannels={activeChannels} configuredChannels={configuredChannels} lastUpdate={lastUpdate} compact />
              </Pressable>
          </View>

          <View className="flex-row gap-2" style={{ height: dashboardSizes.charts, width: '100%' }}>
              <Pressable onPress={() => openPanel('healthTrend')} className="flex-1">
                <ChartCard title="Health Trend" action={timeRange} compact>
                  <TrendLine values={HEALTH_TREND} previous={PREVIOUS_HEALTH_TREND} height={dashboardSizes.chartLine} />
                </ChartCard>
              </Pressable>
              <Pressable onPress={() => openPanel('alarmTrend')} className="flex-1">
                <ChartCard title="Alarm Trend" action="New vs active" compact>
                  <StackedBars height={dashboardSizes.chartLine} />
                </ChartCard>
              </Pressable>
          </View>

          <View className="flex-row gap-2" style={{ height: dashboardSizes.charts, width: '100%' }}>
              <Pressable onPress={() => openPanel('severity')} className="flex-1">
                <ChartCard title="Alarm by Severity" action="Clickable filters" compact>
                  <View className="flex-row items-center justify-around">
                    <DonutChart total={56} size={dashboardSizes.donut} />
                    <View className="gap-1">
                      {[
                        ['Critical', '10', '#ef4444'],
                        ['Warning', '28', '#f59e0b'],
                        ['Info', '14', '#2f80ed'],
                        ['Ack', '4', '#64748b'],
                      ].map(([label, value, color]) => (
                        <View key={label} className="flex-row items-center gap-1.5">
                          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
                          <Text className={cn('w-14 font-body-medium text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{label}</Text>
                          <Text className={cn('font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{value}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </ChartCard>
              </Pressable>
              <Pressable onPress={() => openPanel('throughput')} className="flex-1">
                <ChartCard title="Throughput vs Energy" action={timeRange} compact>
                  <TrendLine values={THROUGHPUT.map((value) => value / 3.6)} previous={ENERGY.map((value) => value * 1.6)} color="#2563eb" height={dashboardSizes.chartLine} />
                </ChartCard>
              </Pressable>
          </View>

          <View className="flex-row gap-2" style={{ height: dashboardSizes.bottom, width: '100%' }}>
              <Pressable onPress={() => openPanel('machines')} className="flex-[1.25]">
                <MachinesAttention machines={machines} onOpenMachine={onOpenMachine} compact />
              </Pressable>
              <Pressable onPress={() => openPanel('insights')} className="flex-1">
                <InsightsPanel compact />
              </Pressable>
              <Pressable onPress={() => openPanel('actions')} className="flex-1">
                <QuickActions onOpenDevices={onOpenDevices} onOpenCanvas={() => firstMachine && onOpenMachine(firstMachine.id)} compact />
              </Pressable>
          </View>
        </View>
      </ScrollView>

      <DashboardDetailModal visible={activePanel !== null} title={activePanel ? detailTitles[activePanel] : ''} onClose={closePanel}>
        {renderDetail()}
      </DashboardDetailModal>
    </View>
  );
}
