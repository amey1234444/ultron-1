import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import {
  buildDashboardMetrics,
  pushSample,
  type AttentionRow,
  type DashboardAlarm,
  type DashboardMetrics,
  type Insight,
  type PlantArea,
  type ServiceStatus,
} from '../../lib/dashboardMetrics';
import type { DeviceNode } from '../../lib/devices';
import type { FolderNode, ProjectNode } from '../../lib/hierarchy';
import type { LiveState } from '../../lib/liveTelemetry';
import type { MachineNode } from '../../lib/machines';
import type { CardNode } from '../../lib/rack';
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

const DEMO_SPARK_HEALTH = [78, 80, 82, 79, 84, 83, 86, 84];
const DEMO_SPARK_BLUE = [54, 59, 56, 65, 62, 71, 69, 74];
const DEMO_SPARK_AMBER = [10, 18, 13, 24, 31, 21, 29, 25];
const DEMO_HEALTH_TREND = [86, 88, 92, 96, 79, 88, 94, 82, 98, 91, 99, 90, 84];
const DEMO_PREVIOUS_HEALTH_TREND = [76, 79, 81, 84, 77, 80, 82, 83, 85, 86, 84, 88, 87];
const DEMO_THROUGHPUT = [150, 160, 140, 182, 153, 169, 126, 201, 224, 228, 282, 338, 289, 238, 190, 176];
const DEMO_ENERGY = [18, 24, 20, 27, 19, 23, 16, 22, 24, 30, 27, 43, 48, 34, 30, 26];
const DEMO_ALARM_DAYS = ['May 18', 'May 19', 'May 20', 'May 21', 'May 22', 'May 23', 'May 24'];
const DEMO_ALARM_BARS = {
  critical: [10, 11, 18, 15, 20, 13, 16],
  warning: [22, 29, 34, 27, 31, 36, 30],
  info: [14, 18, 16, 12, 20, 15, 18],
};
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

function severityColor(severity: DashboardAlarm['severity']) {
  return severity === 'Critical' ? '#ef4444' : severity === 'Warning' ? '#f59e0b' : '#2f80ed';
}

function Sparkline({ values, color = '#16a34a', bars = false, compact = false }: { values: readonly number[]; color?: string; bars?: boolean; compact?: boolean }) {
  const width = compact ? 62 : 82;
  const height = compact ? 20 : 30;
  const series = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const spread = Math.max(1, max - min);
  const points = series
    .map((value, index) => {
      const x = (index / Math.max(1, series.length - 1)) * width;
      const y = height - ((value - min) / spread) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  if (bars) {
    const barWidth = width / series.length - 2;
    return (
      <Svg width={width} height={height}>
        {series.map((value, index) => {
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
  deltaTone = 'up',
  tone,
  spark,
  bars,
  compact = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  detail: string;
  delta: string;
  deltaTone?: 'up' | 'down' | 'flat';
  tone: Tone;
  spark: number[];
  bars?: boolean;
  compact?: boolean;
  onPress?: () => void;
}) {
  const { isDark } = useAppTheme();
  const color = toneColor(tone);
  const deltaColor = deltaTone === 'down' ? '#dc2626' : deltaTone === 'flat' ? '#64748b' : '#16a34a';
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className={cn(
        'h-full min-w-0 flex-1 overflow-hidden rounded-xl border',
        compact ? 'px-2.5 py-2' : 'min-w-[170px] p-3',
        isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white',
      )}
    >
      <View className="flex-row items-center gap-2">
        <View className={cn(compact ? 'h-6 w-6' : 'h-8 w-8', 'items-center justify-center rounded-lg')} style={{ backgroundColor: `${color}16` }}>
          <MaterialCommunityIcons name={icon} size={compact ? 14 : 18} color={color} />
        </View>
        <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body-medium', compact ? 'text-[10px]' : 'text-[12px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {label}
        </Text>
      </View>
      <View className={cn('flex-row items-end gap-1', compact ? 'mt-1' : 'mt-2')}>
        <Text className={cn('font-display', compact ? 'text-[20px] leading-6' : 'text-2xl', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
        {unit ? (
          <Text numberOfLines={1} className={cn('pb-1 font-body-medium', compact ? 'text-[10px]' : 'text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{unit}</Text>
        ) : null}
      </View>
      <View className={cn('flex-row items-end justify-between gap-1', compact ? 'mt-0.5' : 'mt-1.5')}>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1">
            <MaterialCommunityIcons
              name={deltaTone === 'down' ? 'arrow-down' : deltaTone === 'flat' ? 'minus' : 'arrow-up'}
              size={compact ? 10 : 12}
              color={deltaColor}
            />
            <Text numberOfLines={1} className={cn('font-body', compact ? 'text-[9px]' : 'text-[11px]')} style={{ color: deltaColor }}>
              {delta}
            </Text>
          </View>
          {!compact && (
            <Text numberOfLines={1} className={cn('mt-0.5 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              {detail}
            </Text>
          )}
        </View>
        <Sparkline values={spark} color={color} bars={bars} compact={compact} />
      </View>
    </Pressable>
  );
}

function sectionClass(isDark: boolean) {
  return cn('h-full overflow-hidden rounded-xl border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white');
}

function SectionHeader({ icon, title, subtitle, action, compact = false }: { icon?: IconName; title: string; subtitle?: string; action?: string; compact?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <View className={cn('flex-row items-center justify-between border-b', compact ? 'px-3 py-2' : 'px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        {icon && <MaterialCommunityIcons name={icon} size={compact ? 14 : 16} color={isDark ? '#F5F5F5' : '#111827'} />}
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className={cn('font-body-bold', compact ? 'text-xs' : 'text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
          {subtitle ? (
            <Text numberOfLines={1} className={cn('font-body', compact ? 'text-[9px]' : 'text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {action && <Text numberOfLines={1} className={cn('font-body-medium text-primary-blue', compact ? 'text-[10px]' : 'text-[11px]')}>{action}</Text>}
    </View>
  );
}

function HealthGauge({ score, label, compact = false }: { score: number; label: string; compact?: boolean }) {
  const size = compact ? 172 : 196;
  const stroke = compact ? 15 : 18;
  const cx = size / 2;
  const cy = size / 2 + (compact ? 12 : 16);
  const radius = size / 2 - stroke / 2 - 6;
  // Half-ring gauge (180° sweep) as in the reference dashboard.
  const sweep = Math.PI * radius;
  const value = clamp(score, 0, 100);
  const angle = 180 + (value / 100) * 180;
  const needleX = cx + (radius + stroke / 2 + 4) * Math.cos((Math.PI * angle) / 180);
  const needleY = cy + (radius + stroke / 2 + 4) * Math.sin((Math.PI * angle) / 180);
  const bands = [
    { color: '#ef4444', from: 0, to: 0.28 },
    { color: '#f59e0b', from: 0.28, to: 0.55 },
    { color: '#facc15', from: 0.55, to: 0.72 },
    { color: '#22c55e', from: 0.72, to: 1 },
  ];
  const arc = (from: number, to: number) => {
    const a0 = 180 + from * 180;
    const a1 = 180 + to * 180;
    const p0 = { x: cx + radius * Math.cos((Math.PI * a0) / 180), y: cy + radius * Math.sin((Math.PI * a0) / 180) };
    const p1 = { x: cx + radius * Math.cos((Math.PI * a1) / 180), y: cy + radius * Math.sin((Math.PI * a1) / 180) };
    return `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 0 1 ${p1.x} ${p1.y}`;
  };
  const toneColorForScore = value >= 85 ? '#16a34a' : value >= 70 ? '#16a34a' : value >= 50 ? '#d97706' : '#dc2626';
  return (
    <Svg width={size} height={compact ? size * 0.72 : size * 0.74} viewBox={`0 0 ${size} ${size * 0.78}`}>
      <Path d={arc(0, 1)} fill="none" stroke="#e5e7eb" strokeWidth={stroke} strokeLinecap="round" />
      {bands.map((band) => (
        <Path key={band.color} d={arc(band.from, band.to)} fill="none" stroke={band.color} strokeWidth={stroke} opacity={value / 100 >= band.from ? 1 : 0.28} />
      ))}
      <Line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke="#111827" strokeWidth={3} strokeLinecap="round" />
      <Circle cx={cx} cy={cy} r={4} fill="#111827" />
      <SvgText x={cx} y={cy - (compact ? 16 : 22)} textAnchor="middle" fontSize={compact ? 30 : 38} fontWeight="700" fill="#111827">
        {value}
      </SvgText>
      <SvgText x={cx + (compact ? 30 : 38)} y={cy - (compact ? 16 : 22)} fontSize={compact ? 10 : 12} fill="#475569">
        /100
      </SvgText>
      <SvgText x={cx} y={cy - (compact ? 2 : 4)} textAnchor="middle" fontSize={compact ? 12 : 14} fontWeight="700" fill={toneColorForScore}>
        {label}
      </SvgText>
      <SvgText x={0} y={0} opacity={0}>{String(sweep)}</SvgText>
    </Svg>
  );
}

function HealthAnalysis({ metrics, updatedAt, compact = false }: { metrics: DashboardMetrics; updatedAt: string; compact?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <View className={sectionClass(isDark)} style={{ flex: 1 }}>
      <SectionHeader icon="heart-pulse" title="Overall Health" compact={compact} />
      <View className={cn('justify-between', compact ? 'px-3 pb-3 pt-2' : 'px-4 pb-4 pt-3')} style={{ flex: 1, minHeight: 0 }}>
        <View className="items-center justify-center" style={{ flex: 1 }}>
          <HealthGauge score={metrics.healthScore} label={metrics.healthLabel} compact={compact} />
        </View>
        <View className="gap-2">
          {metrics.healthFactors.map((factor) => (
            <View key={factor.label}>
              <View className="mb-0.5 flex-row items-center justify-between">
                <View className="flex-row items-center gap-1">
                  <Text className={cn('font-body-medium', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{factor.label}</Text>
                  <MaterialCommunityIcons name="information-outline" size={compact ? 10 : 11} color="#94a3b8" />
                </View>
                <Text className={cn('font-mono', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{factor.value}%</Text>
              </View>
              <View className={cn('h-1.5 rounded-full', isDark ? 'bg-white/10' : 'bg-slate-100')}>
                <View
                  className="h-1.5 rounded-full"
                  style={{ width: `${clamp(factor.value, 0, 100)}%`, backgroundColor: factor.value >= 75 ? '#16a34a' : factor.value >= 50 ? '#f59e0b' : '#ef4444' }}
                />
              </View>
            </View>
          ))}
        </View>
        {!compact && metrics.healthContributors.length > 0 && (
          <View className={cn('mt-3 rounded-lg px-3 py-2', isDark ? 'bg-white/5' : 'bg-slate-50')}>
            <Text className={cn('font-body-medium text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>Reduced by</Text>
            <Text className={cn('mt-1 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{metrics.healthContributors.join(', ')}</Text>
            <Text className={cn('mt-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Calculated {updatedAt}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function TrendLine({
  values,
  previous,
  color = '#16a34a',
  height = 170,
  fill = true,
  maxValue = 100,
}: {
  values: number[];
  previous?: number[];
  color?: string;
  height?: number;
  fill?: boolean;
  maxValue?: number;
}) {
  const width = 520;
  const pad = 26;
  const series = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const max = Math.max(maxValue, ...series);
  const pointFor = (value: number, index: number, source: number[]) => {
    const x = pad + (index / Math.max(1, source.length - 1)) * (width - pad * 2);
    const y = height - pad - (value / max) * (height - pad * 2);
    return { x, y };
  };
  const currentPoints = series.map((v, i) => pointFor(v, i, series));
  const currentPath = currentPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const previousPath = previous && previous.length > 1 ? previous.map((v, i) => `${pointFor(v, i, previous).x},${pointFor(v, i, previous).y}`).join(' ') : undefined;
  const areaPath = `M ${currentPoints[0]?.x ?? pad} ${height - pad} L ${currentPath.split(' ').join(' L ')} L ${currentPoints[currentPoints.length - 1]?.x ?? width - pad} ${height - pad} Z`;
  const last = series[series.length - 1] ?? 0;
  const lastPoint = currentPoints[currentPoints.length - 1];

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {[0, 25, 50, 75, 100].map((tick) => {
        const y = height - pad - (tick / 100) * (height - pad * 2);
        return (
          <G key={tick}>
            <Line x1={pad} x2={width - pad} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 5" strokeWidth={1} />
            <SvgText x={pad - 8} y={y + 3} fontSize={9} fill="#94a3b8" textAnchor="end">
              {Math.round((tick / 100) * max)}
            </SvgText>
          </G>
        );
      })}
      {fill && <Path d={areaPath} fill={color} opacity={0.12} />}
      {previousPath && <Polyline points={previousPath} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" />}
      <Polyline points={currentPath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {currentPoints.map((point, index) => (
        <Circle key={index} cx={point.x} cy={point.y} r={2.5} fill={color} />
      ))}
      {lastPoint && (
        <G>
          <Circle cx={lastPoint.x} cy={lastPoint.y} r={4.5} fill={color} stroke="#fff" strokeWidth={2} />
          <SvgText x={lastPoint.x - 6} y={lastPoint.y - 10} fill={color} fontWeight="700" fontSize={11} textAnchor="end">
            {Math.round(last)}
          </SvgText>
        </G>
      )}
    </Svg>
  );
}

function StackedBars({ labels, critical, warning, info, height = 170 }: { labels: string[]; critical: number[]; warning: number[]; info: number[]; height?: number }) {
  const width = 520;
  const baseY = height - 30;
  const top = 16;
  const max = Math.max(10, ...labels.map((_, index) => (critical[index] ?? 0) + (warning[index] ?? 0) + (info[index] ?? 0)));
  const usable = baseY - top;
  const step = (width - 60) / Math.max(1, labels.length);
  const barW = Math.min(30, step * 0.55);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = baseY - ratio * usable;
        return (
          <G key={ratio}>
            <Line x1={34} x2={width - 20} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 5" />
            <SvgText x={28} y={y + 3} fontSize={9} fill="#94a3b8" textAnchor="end">
              {Math.round(ratio * max)}
            </SvgText>
          </G>
        );
      })}
      {labels.map((label, index) => {
        const x = 44 + index * step;
        const cH = ((critical[index] ?? 0) / max) * usable;
        const wH = ((warning[index] ?? 0) / max) * usable;
        const iH = ((info[index] ?? 0) / max) * usable;
        return (
          <G key={`${label}-${index}`}>
            <Rect x={x} y={baseY - cH} width={barW} height={cH} fill="#ef4444" />
            <Rect x={x} y={baseY - cH - wH} width={barW} height={wH} fill="#f59e0b" />
            <Rect x={x} y={baseY - cH - wH - iH} width={barW} height={iH} fill="#2f80ed" rx={2} />
            <SvgText x={x + barW / 2} y={height - 10} fontSize={9} fill="#64748b" textAnchor="middle">
              {label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function DonutChart({ segments, total, size = 150 }: { segments: { label: string; value: number; color: string }[]; total: number; size?: number }) {
  const scale = size / 150;
  const radius = 46 * scale;
  const circumference = 2 * Math.PI * radius;
  const sum = Math.max(1, total);
  let offset = 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#e5e7eb" strokeWidth={17 * scale} fill="none" />
      {segments.map((segment) => {
        const length = (segment.value / sum) * circumference;
        const item = (
          <Circle
            key={segment.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={segment.color}
            strokeWidth={17 * scale}
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
      <SvgText x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize={22 * scale} fontWeight="700" fill="#111827">
        {total}
      </SvgText>
      <SvgText x={size / 2} y={size / 2 + 15 * scale} textAnchor="middle" fontSize={11 * scale} fill="#64748b">
        Total
      </SvgText>
    </Svg>
  );
}

function PlantMapPanel({ areas, compact = false }: { areas: PlantArea[]; compact?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <View className={sectionClass(isDark)}>
      <View className={cn('flex-row items-center justify-between border-b', compact ? 'px-3 py-2' : 'px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
        <Text className={cn('font-body-bold', compact ? 'text-xs' : 'text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>Plant Overview</Text>
        <View className={cn('flex-row', compact ? 'gap-3' : 'gap-4')}>
          {(['healthy', 'warning', 'critical', 'offline'] as const).map((status) => (
            <View key={status} className="flex-row items-center gap-1">
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: STATUS_COLORS[status] }} />
              <Text className={cn('font-body-medium text-[10px] capitalize', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{status}</Text>
            </View>
          ))}
        </View>
      </View>
      <View className={cn('relative overflow-hidden', isDark ? 'bg-slate-950' : 'bg-[#f7fbff]')} style={{ flex: 1, minHeight: compact ? 230 : 320 }}>
        <Svg width="100%" height="100%" viewBox="0 0 640 330" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          <Rect x={0} y={0} width={640} height={330} fill={isDark ? '#07111f' : '#f7fbff'} />
          {Array.from({ length: 17 }).map((_, index) => (
            <Line key={`v-${index}`} x1={index * 40} x2={index * 40} y1={0} y2={330} stroke={isDark ? '#1e293b' : '#e6eff8'} strokeWidth={1} />
          ))}
          {Array.from({ length: 10 }).map((_, index) => (
            <Line key={`h-${index}`} x1={0} x2={640} y1={index * 36} y2={index * 36} stroke={isDark ? '#1e293b' : '#e6eff8'} strokeWidth={1} />
          ))}
        </Svg>
        <Image
          source={{ uri: PLANT_OVERVIEW_IMAGE_URI }}
          resizeMode="contain"
          style={{ position: 'absolute', left: 46, right: 22, top: 12, bottom: 6, opacity: isDark ? 0.86 : 0.98 }}
        />
        <Svg width="100%" height="100%" viewBox="0 0 640 330" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          {areas.map((area) => {
            const color = STATUS_COLORS[area.status];
            const labelX = area.x < 160 ? area.x - 18 : area.x > 460 ? area.x - 128 : area.x - 54;
            const labelY = area.y < 110 ? area.y - 46 : area.y + 18;
            return (
              <G key={area.name}>
                <Line x1={area.x} y1={area.y} x2={labelX + 68} y2={labelY + 34} stroke={color} strokeWidth={2} />
                <Circle cx={area.x} cy={area.y} r={11} fill={`${color}22`} stroke={color} strokeWidth={2} />
                <Circle cx={area.x} cy={area.y} r={5} fill={color} stroke="#ffffff" strokeWidth={2} />
                <Rect x={labelX} y={labelY} width={compact ? 122 : 136} height={compact ? 42 : 48} rx={8} fill="#ffffff" opacity={0.96} stroke="#dbe3ec" />
                <SvgText x={labelX + 10} y={labelY + 17} fontSize={compact ? 9 : 11} fontWeight="700" fill="#111827">
                  {area.name}
                </SvgText>
                <Circle cx={labelX + 11} cy={labelY + (compact ? 29 : 33)} r={3.5} fill={color} />
                <SvgText x={labelX + 21} y={labelY + (compact ? 32 : 36)} fontSize={compact ? 8 : 10} fill="#334155">
                  {area.status === 'healthy' ? 'Healthy' : area.status === 'warning' ? 'Warning' : area.status === 'critical' ? 'Critical' : 'Offline'}
                </SvgText>
              </G>
            );
          })}
        </Svg>
        <View className="absolute left-3 top-3 gap-1.5">
          {['target', 'plus', 'minus', 'crosshairs-gps'].map((icon) => (
            <Pressable key={icon} className={cn('h-7 w-7 items-center justify-center rounded-md border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <MaterialCommunityIcons name={icon as IconName} size={14} color={isDark ? '#F5F5F5' : '#111827'} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function LiveAlarmFeed({ alarms, compact = false }: { alarms: DashboardAlarm[]; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const visible = compact ? alarms.slice(0, 8) : alarms;
  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader icon="bell-alert-outline" title="Live Alarm Feed" action="View all alarms" compact={compact} />
      <View className="flex-1" style={{ minHeight: 0 }}>
        <View className={cn('flex-row items-center border-b px-3 py-2', isDark ? 'border-line-dark bg-white/5' : 'border-line-light bg-slate-50')}>
          <Text className={cn('w-16 font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Severity</Text>
          <Text className={cn('min-w-0 flex-[1.4] px-2 font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Alarm</Text>
          <Text className={cn('min-w-0 flex-1 font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Source</Text>
          <Text className={cn('w-[68px] font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Time</Text>
          <Text className={cn('w-8 text-right font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Ack</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          {visible.length === 0 ? (
            <View className="items-center justify-center px-3 py-8">
              <MaterialCommunityIcons name="check-circle-outline" size={22} color="#16a34a" />
              <Text className={cn('mt-2 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>No active alarms</Text>
            </View>
          ) : (
            visible.map((alarm) => {
              const color = severityColor(alarm.severity);
              return (
                <View key={alarm.id} className={cn('flex-row items-center border-b px-3 py-2', isDark ? 'border-line-dark' : 'border-line-light')}>
                  <Text numberOfLines={1} className="w-16 rounded px-1.5 py-0.5 text-center font-body-bold text-[9px]" style={{ color, backgroundColor: `${color}16` }}>
                    {alarm.severity}
                  </Text>
                  <Text numberOfLines={1} className={cn('min-w-0 flex-[1.4] px-2 font-body-medium text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{alarm.message}</Text>
                  <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm.source}</Text>
                  <Text numberOfLines={1} className={cn('w-[68px] font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm.time}</Text>
                  <View className="w-8 items-end">
                    <MaterialCommunityIcons name={alarm.state === 'Ack' ? 'check-circle' : 'check-circle-outline'} size={14} color={alarm.state === 'Ack' ? '#16a34a' : '#94a3b8'} />
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
        <View className={cn('flex-row items-center justify-between border-t px-3 py-2', isDark ? 'border-line-dark' : 'border-line-light')}>
          <Text className={cn('font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            Showing {visible.length} of {alarms.length} alarms
          </Text>
          <Text className="font-body-medium text-[10px] text-primary-blue">View all</Text>
        </View>
      </View>
    </View>
  );
}

function SystemStatus({ services, compact = false }: { services: ServiceStatus[]; compact?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader icon="server-network" title="System Status" action="View all" compact={compact} />
      <View className={cn('flex-row flex-wrap', compact ? 'gap-x-4 gap-y-1.5 px-3 py-2' : 'gap-2 p-3')}>
        {services.map((service) => {
          const color = service.status === 'healthy' ? '#16a34a' : service.status === 'degraded' ? '#f59e0b' : '#ef4444';
          return (
            <View key={service.name} className={cn('flex-row items-center gap-1.5', compact ? 'min-w-[120px] basis-[30%]' : 'min-w-[180px] flex-1 rounded-md px-2 py-1.5', !compact && (isDark ? 'bg-white/5' : 'bg-slate-50'))}>
              <MaterialCommunityIcons name={service.status === 'healthy' ? 'check-circle' : 'alert-circle'} size={13} color={color} />
              <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body-medium', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{service.name}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TelemetrySnapshot({ metrics, compact = false }: { metrics: DashboardMetrics; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const snapshots: [string, string, string, number[]][] = [
    ['Packet Rate', metrics.packetRate.toLocaleString(), 'pkt/s', DEMO_SPARK_BLUE],
    ['Avg Latency', String(metrics.avgLatencyMs), 'ms', [44, 28, 35, 26, 32, 24, 33, 31]],
    ['Last Payload', metrics.lastPayload, '', DEMO_SPARK_HEALTH],
    ['Devices Streaming', String(metrics.devicesStreaming), `/ ${metrics.machinesTotal}`, DEMO_SPARK_HEALTH],
  ];
  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader icon="pulse" title="Live Telemetry Snapshot" compact={compact} />
      <View className={cn('flex-row flex-wrap', compact ? 'gap-1.5 p-2' : 'gap-2 p-3')}>
        {snapshots.map(([label, value, unit, spark]) => (
          <View key={label} className={cn('min-w-[110px] flex-1 rounded-md', compact ? 'px-2 py-1.5' : 'px-3 py-2', isDark ? 'bg-white/5' : 'bg-slate-50')}>
            <Text numberOfLines={1} className={cn('font-body-medium', compact ? 'text-[9px]' : 'text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
            <View className="mt-0.5 flex-row items-end justify-between gap-1">
              <View className="flex-row items-end gap-1">
                <Text numberOfLines={1} className={cn('font-display', compact ? 'text-sm' : 'text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
                <Text className={cn('pb-0.5 font-body', compact ? 'text-[9px]' : 'text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{unit}</Text>
              </View>
              <Sparkline values={spark} color="#2563eb" compact />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ChartCard({ title, action, children, compact = false, legend }: { title: string; action?: string; children: ReactNode; compact?: boolean; legend?: ReactNode }) {
  const { isDark } = useAppTheme();
  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader title={title} action={action} compact={compact} />
      {legend ? <View className={cn('flex-row flex-wrap items-center gap-3 px-3 pt-2')}>{legend}</View> : null}
      <View className={cn('flex-1 justify-center', compact ? 'px-2 py-1' : 'p-3')}>{children}</View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const { isDark } = useAppTheme();
  return (
    <View className="flex-row items-center gap-1">
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text className={cn('font-body-medium text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
    </View>
  );
}

function MachinesAttention({ rows, onOpenMachine, compact = false }: { rows: AttentionRow[]; onOpenMachine: (id: string) => void; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const headings = compact
    ? ['Machine', 'Area', 'Health Score', 'Issue', 'Last Alarm', 'Action']
    : ['Machine', 'Area', 'Health Score', 'Issue', 'Alarms', 'Last Alarm', 'Telemetry', 'Risk', 'Owner', 'Action'];
  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader icon="alert-decagram-outline" title="Machines Requiring Attention" compact={compact} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View className="px-3 py-1">
          <View className={cn('flex-row border-b px-1 py-2', isDark ? 'border-line-dark' : 'border-line-light')}>
            {headings.map((heading, index) => (
              <Text key={heading} className={cn('font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted', index === 0 ? 'flex-[1.3]' : index === 3 ? 'flex-[1.2]' : 'flex-1')}>
                {heading}
              </Text>
            ))}
          </View>
          {rows.length === 0 ? (
            <View className="items-center py-8">
              <MaterialCommunityIcons name="shield-check-outline" size={22} color="#16a34a" />
              <Text className={cn('mt-2 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>All machines nominal</Text>
            </View>
          ) : (
            rows.slice(0, compact ? 5 : rows.length).map((row) => (
              <View key={row.id} className={cn('flex-row items-center border-b px-1 py-2', isDark ? 'border-line-dark/60' : 'border-line-light/70')}>
                <Text numberOfLines={1} className={cn('flex-[1.3] font-body-bold text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{row.name}</Text>
                <Text numberOfLines={1} className={cn('flex-1 font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row.area}</Text>
                <View className="flex-1">
                  <Text
                    className="w-9 rounded px-1.5 py-0.5 text-center font-body-bold text-[10px]"
                    style={{
                      color: row.health < 50 ? '#dc2626' : row.health < 75 ? '#d97706' : '#16a34a',
                      backgroundColor: row.health < 50 ? '#fee2e2' : row.health < 75 ? '#fef3c7' : '#dcfce7',
                    }}
                  >
                    {row.health}
                  </Text>
                </View>
                <Text numberOfLines={1} className={cn('flex-[1.2] font-body text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{row.issue}</Text>
                {!compact && (
                  <>
                    <Text className={cn('flex-1 font-mono text-[10px] text-status-danger')}>{row.alarms}</Text>
                  </>
                )}
                <Text numberOfLines={1} className={cn('flex-1 font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row.lastAlarm}</Text>
                {!compact && (
                  <>
                    <Text className={cn('flex-1 font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row.telemetry}</Text>
                    <Text className="flex-1 font-body-bold text-[10px]" style={{ color: row.risk === 'High' ? '#ef4444' : row.risk === 'Medium' ? '#f59e0b' : '#16a34a' }}>{row.risk}</Text>
                    <Text numberOfLines={1} className={cn('flex-1 font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{row.owner}</Text>
                  </>
                )}
                <Pressable disabled={!row.machineId} onPress={() => row.machineId && onOpenMachine(row.machineId)} className="flex-1">
                  <Text className="font-body-medium text-[10px] text-primary-blue">View Details</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function InsightsPanel({ insights, compact = false }: { insights: Insight[]; compact?: boolean }) {
  const { isDark } = useAppTheme();
  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader icon="lightbulb-on-outline" title="Insights & Recommended Actions" action="View all" compact={compact} />
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: compact ? 8 : 12, gap: compact ? 6 : 8 }}>
        {insights.length === 0 ? (
          <View className="items-center py-8">
            <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>No recommendations right now</Text>
          </View>
        ) : (
          insights.map((insight) => {
            const color = insight.priority === 'High' ? '#ef4444' : insight.priority === 'Medium' ? '#f59e0b' : '#16a34a';
            return (
              <View key={insight.id} className={cn('flex-row items-center gap-2 rounded-lg px-2.5 py-2', isDark ? 'bg-white/5' : 'bg-slate-50')}>
                <MaterialCommunityIcons name="alert-decagram" size={15} color={color} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className={cn('font-body-medium text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
                    {insight.subject}: {insight.finding}. {insight.recommendation}.
                  </Text>
                  {!compact && (
                    <Text numberOfLines={1} className={cn('mt-0.5 font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                      {insight.evidence} · Confidence {insight.confidence}
                    </Text>
                  )}
                </View>
                <Text className="rounded px-2 py-0.5 font-body-bold text-[9px]" style={{ color, backgroundColor: `${color}16` }}>{insight.priority}</Text>
                <MaterialCommunityIcons name="chevron-right" size={15} color="#94a3b8" />
              </View>
            );
          })
        )}
      </ScrollView>
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
    <View className={sectionClass(isDark)}>
      <SectionHeader icon="cursor-default-click-outline" title="Quick Actions / Shortcuts" compact={compact} />
      <View className={cn('flex-1 flex-row flex-wrap content-start', compact ? 'gap-2 p-2.5' : 'gap-2 p-3')}>
        {actions.map(([icon, label]) => (
          <Pressable
            key={label}
            onPress={label === 'Offline Devices' ? onOpenDevices : label === 'Open Canvas' ? onOpenCanvas : undefined}
            className={cn(
              'flex-row items-center gap-2 rounded-lg border px-3',
              compact ? 'h-[42px] min-w-[120px] basis-[30%] flex-1' : 'h-[46px] min-w-[150px] flex-1',
              isDark ? 'border-line-dark bg-white/5' : 'border-line-light bg-white',
            )}
          >
            <MaterialCommunityIcons name={icon} size={16} color={label.includes('Critical') ? '#ef4444' : label === 'Open Canvas' ? '#2563eb' : isDark ? '#F5F5F5' : '#111827'} />
            <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body-medium text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{label}</Text>
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
  compactPanel = false,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  compactPanel?: boolean;
}) {
  const { isDark } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const modalWidth = compactPanel ? Math.min(Math.max(width - 48, 320), 520) : Math.min(Math.max(width - 32, 320), 1280);
  const modalHeight = compactPanel ? Math.min(Math.max(height - 160, 260), 380) : Math.min(Math.max(height - 64, 360), 820);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 p-4">
        <View className={cn('overflow-hidden rounded-xl border shadow-2xl', isDark ? 'border-line-dark bg-surface' : 'border-line-light bg-white')} style={{ width: modalWidth, maxHeight: modalHeight }}>
          <View className={cn('flex-row items-center justify-between border-b px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
            <Text className={cn('font-body-bold text-base', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
            <Pressable onPress={onClose} className={cn('rounded-lg border px-3 py-1.5', isDark ? 'border-line-dark bg-white/5' : 'border-line-light bg-slate-50')}>
              <Text className={cn('font-body-bold text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>Close</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 12, gap: 12, flexGrow: compactPanel ? 0 : undefined }}>{children}</ScrollView>
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
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  const [timeRange, setTimeRange] = useState('Last 24 Hours');
  const [activePanel, setActivePanel] = useState<DetailPanel | null>(null);
  const [activeKpiIndex, setActiveKpiIndex] = useState<number | null>(null);
  const isCompact = width > 0 && width < 1100;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const metrics = useMemo(
    () => buildDashboardMetrics({ projects, folders, machines, devices, cards, live, realMode, nowMs: now.getTime() }),
    [cards, devices, folders, live, machines, now, projects, realMode],
  );

  // Real mode has no historical aggregate endpoint, so the trend charts are fed
  // by sampling the derived metrics once a second while the dashboard is open.
  const [healthSeries, setHealthSeries] = useState<number[]>([]);
  const [alarmSeries, setAlarmSeries] = useState<{ critical: number; warning: number; info: number; label: string }[]>([]);
  const [throughputSeries, setThroughputSeries] = useState<number[]>([]);
  const [energySeries, setEnergySeries] = useState<number[]>([]);
  const lastSampleRef = useRef(0);

  useEffect(() => {
    if (!metrics.live) return;
    const stamp = now.getTime();
    if (stamp - lastSampleRef.current < 5_000) return;
    lastSampleRef.current = stamp;
    setHealthSeries((series) => pushSample(series, metrics.healthScore));
    setThroughputSeries((series) => pushSample(series, metrics.packetRate));
    setEnergySeries((series) => pushSample(series, metrics.energyMwh));
    setAlarmSeries((series) => {
      const next = [
        ...series,
        {
          critical: metrics.criticalCount,
          warning: metrics.warningCount,
          info: metrics.infoCount,
          label: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
      return next.length > 8 ? next.slice(next.length - 8) : next;
    });
  }, [metrics, now]);

  const healthTrend = metrics.live ? (healthSeries.length > 1 ? healthSeries : [metrics.healthScore, metrics.healthScore]) : DEMO_HEALTH_TREND;
  const previousHealthTrend = metrics.live ? undefined : DEMO_PREVIOUS_HEALTH_TREND;
  const throughputTrend = metrics.live ? (throughputSeries.length > 1 ? throughputSeries : [metrics.packetRate, metrics.packetRate]) : DEMO_THROUGHPUT;
  const energyTrend = metrics.live ? (energySeries.length > 1 ? energySeries : [metrics.energyMwh, metrics.energyMwh]) : DEMO_ENERGY;
  const alarmBars = metrics.live
    ? {
        labels: alarmSeries.map((sample) => sample.label),
        critical: alarmSeries.map((sample) => sample.critical),
        warning: alarmSeries.map((sample) => sample.warning),
        info: alarmSeries.map((sample) => sample.info),
      }
    : { labels: DEMO_ALARM_DAYS.map((day) => day.slice(4)), ...DEMO_ALARM_BARS };

  const severitySegments = [
    { label: 'Critical', value: metrics.criticalCount, color: '#ef4444' },
    { label: 'Warning', value: metrics.warningCount, color: '#f59e0b' },
    { label: 'Info', value: metrics.infoCount, color: '#2f80ed' },
    { label: 'Acknowledge', value: metrics.ackCount, color: '#64748b' },
  ];
  const severityTotal = severitySegments.reduce((sum, segment) => sum + segment.value, 0);

  const lastUpdate = formatClock(now);
  const firstMachine = machines[0];
  const userName = currentUser?.name || currentUser?.username || 'Admin User';
  const roleLabel = currentUser ? ROLE_LABEL[currentUser.role] : 'Administrator';

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
    insights: 'Insights & Recommended Actions',
    actions: 'Quick Actions / Shortcuts',
  };
  const openPanel = (panel: DetailPanel) => setActivePanel(panel);
  const closePanel = () => {
    setActivePanel(null);
    setActiveKpiIndex(null);
  };

  const kpiSpark = (values: number[], fallback: number[]) => (metrics.live && values.length > 1 ? values : fallback);

  const getKpiCards = (compact: boolean) => {
    const press = (index: number) => () => {
      setActiveKpiIndex(index);
      openPanel('kpis');
    };
    return [
      <KpiCard key="health" icon="heart-pulse" label="Overall Health" value={String(metrics.healthScore)} unit="/100" detail={metrics.healthLabel} delta={metrics.live ? metrics.healthLabel : '4 pts vs yesterday'} tone="green" spark={kpiSpark(healthSeries, DEMO_SPARK_HEALTH)} compact={compact} onPress={compact ? press(0) : undefined} />,
      <KpiCard key="oee" icon="bullseye-arrow" label="OEE" value={metrics.oee.toFixed(1)} unit="%" detail="Availability weighted" delta={metrics.live ? 'Derived from live channels' : '2.2% vs yesterday'} tone="blue" spark={kpiSpark(healthSeries, DEMO_SPARK_BLUE)} compact={compact} onPress={compact ? press(1) : undefined} />,
      <KpiCard key="machines" icon="robot-industrial-outline" label="Machines Online" value={String(metrics.machinesOnline)} unit={`/ ${metrics.machinesTotal}`} detail="Online versus total" delta={metrics.live ? `${metrics.machinesTotal - metrics.machinesOnline} offline` : '6 vs yesterday'} deltaTone={metrics.live && metrics.machinesOnline < metrics.machinesTotal ? 'down' : 'up'} tone="slate" spark={kpiSpark(healthSeries, DEMO_SPARK_HEALTH)} compact={compact} onPress={compact ? press(2) : undefined} />,
      <KpiCard key="channels" icon="pulse" label="Active Channels" value={metrics.activeChannels.toLocaleString()} unit={`/ ${metrics.configuredChannels.toLocaleString()}`} detail="Streaming now" delta={metrics.live ? 'Live from broker' : '96 vs yesterday'} tone="blue" spark={kpiSpark(throughputSeries, DEMO_SPARK_BLUE)} compact={compact} onPress={compact ? press(3) : undefined} />,
      <KpiCard key="gateways" icon="router-network" label="Gateways Connected" value={String(metrics.connectedGateways)} unit={`/ ${metrics.totalGateways}`} detail="Edge transport" delta={metrics.live ? `${metrics.totalGateways - metrics.connectedGateways} down` : '1 vs yesterday'} deltaTone={metrics.live && metrics.connectedGateways < metrics.totalGateways ? 'down' : 'up'} tone="slate" spark={kpiSpark(healthSeries, DEMO_SPARK_HEALTH)} compact={compact} onPress={compact ? press(4) : undefined} />,
      <KpiCard key="alarms" icon="bell-alert-outline" label="Alarm Count" value={String(metrics.alarmCount)} detail={`${metrics.criticalCount} Critical, ${metrics.warningCount} Warning`} delta={`${metrics.criticalCount} Critical · ${metrics.warningCount} Warn`} deltaTone={metrics.criticalCount > 0 ? 'down' : 'up'} tone="red" spark={kpiSpark(alarmSeries.map((sample) => sample.critical + sample.warning), DEMO_SPARK_AMBER)} bars compact={compact} onPress={compact ? press(5) : undefined} />,
      <KpiCard key="energy" icon="lightning-bolt-outline" label="Energy Today" value={metrics.energyMwh.toFixed(1)} unit="MWh" detail="Plant consumption" delta={metrics.live ? 'Estimated from load' : '4.5% vs yesterday'} tone="green" spark={kpiSpark(energySeries, DEMO_ENERGY.slice(0, 8))} compact={compact} onPress={compact ? press(6) : undefined} />,
      <KpiCard key="uptime" icon="shield-check-outline" label="Uptime" value={metrics.uptimePct.toFixed(2)} unit="%" detail="System uptime" delta={metrics.live ? 'Gateway availability' : '0.18% vs yesterday'} tone="blue" spark={kpiSpark(healthSeries, DEMO_SPARK_HEALTH)} compact={compact} onPress={compact ? press(7) : undefined} />,
    ];
  };

  const severityLegend = (
    <View className="gap-1.5">
      {severitySegments.map((segment) => (
        <View key={segment.label} className="flex-row items-center gap-2">
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: segment.color }} />
          <Text className={cn('w-[70px] font-body-medium text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{segment.label}</Text>
          <Text className={cn('font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {segment.value} ({severityTotal > 0 ? Math.round((segment.value / severityTotal) * 100) : 0}%)
          </Text>
        </View>
      ))}
    </View>
  );

  const renderDetail = () => {
    switch (activePanel) {
      case 'kpis':
        if (activeKpiIndex !== null) return <View style={{ height: 130 }}>{getKpiCards(false)[activeKpiIndex]}</View>;
        return <View className="flex-row flex-wrap gap-3">{getKpiCards(false)}</View>;
      case 'plant':
        return (
          <View style={{ height: 420 }}>
            <PlantMapPanel areas={metrics.areas} />
          </View>
        );
      case 'health':
        return (
          <View style={{ height: 460 }}>
            <HealthAnalysis metrics={metrics} updatedAt={lastUpdate} />
          </View>
        );
      case 'alarms':
        return (
          <View style={{ height: 480 }}>
            <LiveAlarmFeed alarms={metrics.alarms} />
          </View>
        );
      case 'system':
        return (
          <View style={{ height: 220 }}>
            <SystemStatus services={metrics.services} />
          </View>
        );
      case 'telemetry':
        return (
          <View style={{ height: 220 }}>
            <TelemetrySnapshot metrics={metrics} />
          </View>
        );
      case 'healthTrend':
        return (
          <View style={{ height: 280 }}>
            <ChartCard title="Health Trend" action={timeRange}>
              <TrendLine values={healthTrend} previous={previousHealthTrend} />
            </ChartCard>
          </View>
        );
      case 'alarmTrend':
        return (
          <View style={{ height: 280 }}>
            <ChartCard title="Alarm Trend" action="New vs active">
              <StackedBars labels={alarmBars.labels} critical={alarmBars.critical} warning={alarmBars.warning} info={alarmBars.info} />
            </ChartCard>
          </View>
        );
      case 'severity':
        return (
          <View style={{ height: 280 }}>
            <ChartCard title="Alarm by Severity" action="Clickable filters">
              <View className="flex-row items-center justify-around">
                <DonutChart segments={severitySegments} total={severityTotal} />
                {severityLegend}
              </View>
            </ChartCard>
          </View>
        );
      case 'throughput':
        return (
          <View style={{ height: 280 }}>
            <ChartCard title="Throughput vs Energy" action={timeRange}>
              <TrendLine values={throughputTrend} previous={energyTrend} color="#2563eb" maxValue={Math.max(10, ...throughputTrend)} />
            </ChartCard>
          </View>
        );
      case 'machines':
        return (
          <View style={{ height: 460 }}>
            <MachinesAttention rows={metrics.attention} onOpenMachine={onOpenMachine} />
          </View>
        );
      case 'insights':
        return (
          <View style={{ height: 420 }}>
            <InsightsPanel insights={metrics.insights} />
          </View>
        );
      case 'actions':
        return (
          <View style={{ height: 220 }}>
            <QuickActions onOpenDevices={onOpenDevices} onOpenCanvas={() => firstMachine && onOpenMachine(firstMachine.id)} />
          </View>
        );
      default:
        return null;
    }
  };

  const rowHeights = { kpi: 96, main: 360, mid: 132, charts: 210, bottom: 300 };

  return (
    <View className={cn('flex-1', isDark ? 'bg-surface' : 'bg-slate-50')} style={{ minHeight: 0 }}>
      <ScrollView className="flex-1" style={{ minHeight: 0 }} showsVerticalScrollIndicator contentContainerStyle={{ flexGrow: 1, padding: 12, paddingBottom: 24 }}>
        <View className="gap-3" style={{ flexGrow: 1, width: '100%' }}>
          {/* Top bar */}
          <View className="flex-row flex-wrap items-center gap-2">
            <Pressable className={cn('h-10 min-w-[190px] flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <MaterialCommunityIcons name="office-building-marker-outline" size={17} color={isDark ? '#F5F5F5' : '#111827'} />
              <Text numberOfLines={1} className={cn('flex-1 font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{metrics.plantName}</Text>
              <MaterialCommunityIcons name="chevron-down" size={17} color={isDark ? '#999' : '#64748b'} />
            </Pressable>

            <View className={cn('h-10 min-w-[240px] flex-1 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <MaterialCommunityIcons name="magnify" size={17} color={isDark ? '#999' : '#64748b'} />
              <Text numberOfLines={1} className={cn('flex-1 font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Search assets, tags, gateways, racks...</Text>
              {!isCompact && <Text className={cn('rounded bg-slate-100 px-2 py-1 font-mono text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>⌘ K</Text>}
            </View>

            <Pressable
              onPress={() => setTimeRange((value) => (value === 'Last Hour' ? 'Last 24 Hours' : value === 'Last 24 Hours' ? 'Last 7 Days' : value === 'Last 7 Days' ? 'Custom' : 'Last Hour'))}
              className={cn('h-10 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}
            >
              <MaterialCommunityIcons name="calendar-clock" size={16} color={isDark ? '#F5F5F5' : '#111827'} />
              <Text className={cn('font-body-bold text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>{timeRange}</Text>
              <MaterialCommunityIcons name="chevron-down" size={17} color={isDark ? '#999' : '#64748b'} />
            </Pressable>

            <Pressable onPress={() => setNow(new Date())} className={cn('h-10 w-10 items-center justify-center rounded-lg border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <MaterialCommunityIcons name="refresh" size={18} color={isDark ? '#F5F5F5' : '#111827'} />
            </Pressable>

            <View className={cn('h-10 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <View className={cn('h-2 w-2 rounded-full', metrics.streamHealthy ? 'bg-status-success' : 'bg-status-warning')} />
              <Text className={cn('font-body-bold text-xs', metrics.streamHealthy ? 'text-status-success' : 'text-status-warning')}>LIVE</Text>
            </View>

            <View className={cn('h-10 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <MaterialCommunityIcons name={metrics.streamHealthy ? 'access-point-check' : 'access-point-off'} size={16} color={metrics.streamHealthy ? '#16a34a' : '#f59e0b'} />
              <Text className={cn('font-body-bold text-xs', metrics.streamHealthy ? 'text-status-success' : 'text-status-warning')}>{metrics.streamHealthy ? 'Stream Healthy' : 'Stream Stale'}</Text>
            </View>

            {!isCompact && (
              <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Last update: {lastUpdate}</Text>
            )}

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

          {/* KPI strip */}
          <View className={cn('flex-row gap-2', isCompact && 'flex-wrap')} style={{ minHeight: rowHeights.kpi, width: '100%' }}>
            {getKpiCards(true).map((card) => (
              <View key={card.key} className={isCompact ? 'min-w-[150px] basis-[23%]' : 'min-w-0 flex-1'} style={{ height: rowHeights.kpi }}>
                {card}
              </View>
            ))}
          </View>

          {/* Plant overview / health / alarms */}
          <View className={cn('gap-3', isCompact ? 'flex-col' : 'flex-row')} style={{ width: '100%' }}>
            <View style={{ flex: isCompact ? undefined : 1.9, height: rowHeights.main + rowHeights.mid + 12 }} className="gap-3">
              <Pressable onPress={() => openPanel('plant')} style={{ height: rowHeights.main }}>
                <PlantMapPanel areas={metrics.areas} compact />
              </Pressable>
              <View className="flex-row gap-3" style={{ height: rowHeights.mid }}>
                <Pressable onPress={() => openPanel('system')} className="flex-1">
                  <SystemStatus services={metrics.services} compact />
                </Pressable>
                <Pressable onPress={() => openPanel('telemetry')} className="flex-1">
                  <TelemetrySnapshot metrics={metrics} compact />
                </Pressable>
              </View>
            </View>
            <Pressable onPress={() => openPanel('health')} style={{ flex: isCompact ? undefined : 0.75, height: rowHeights.main + rowHeights.mid + 12 }}>
              <HealthAnalysis metrics={metrics} updatedAt={lastUpdate} compact />
            </Pressable>
            <Pressable onPress={() => openPanel('alarms')} style={{ flex: isCompact ? undefined : 1.35, height: rowHeights.main + rowHeights.mid + 12 }}>
              <LiveAlarmFeed alarms={metrics.alarms} compact />
            </Pressable>
          </View>

          {/* Charts */}
          <View className={cn('gap-3', isCompact ? 'flex-col' : 'flex-row')} style={{ width: '100%' }}>
            <Pressable onPress={() => openPanel('healthTrend')} className="flex-1" style={{ height: rowHeights.charts }}>
              <ChartCard title="Health Trend" action={metrics.live ? 'Live session' : 'Last 7 Days'} compact>
                <TrendLine values={healthTrend} previous={previousHealthTrend} height={140} />
              </ChartCard>
            </Pressable>
            <Pressable onPress={() => openPanel('alarmTrend')} className="flex-1" style={{ height: rowHeights.charts }}>
              <ChartCard
                title="Alarm Trend"
                action={metrics.live ? 'Live session' : 'Last 7 Days'}
                compact
                legend={
                  <>
                    <LegendDot color="#ef4444" label="Critical" />
                    <LegendDot color="#f59e0b" label="Warning" />
                    <LegendDot color="#2f80ed" label="Info" />
                  </>
                }
              >
                <StackedBars labels={alarmBars.labels} critical={alarmBars.critical} warning={alarmBars.warning} info={alarmBars.info} height={126} />
              </ChartCard>
            </Pressable>
            <Pressable onPress={() => openPanel('severity')} className="flex-1" style={{ height: rowHeights.charts }}>
              <ChartCard title="Alarm by Severity" action="Filters" compact>
                <View className="flex-row items-center justify-around">
                  <DonutChart segments={severitySegments} total={severityTotal} size={118} />
                  {severityLegend}
                </View>
              </ChartCard>
            </Pressable>
            <Pressable onPress={() => openPanel('throughput')} className="flex-1" style={{ height: rowHeights.charts }}>
              <ChartCard
                title="Throughput vs Energy"
                action={timeRange}
                compact
                legend={
                  <>
                    <LegendDot color="#2563eb" label="Throughput" />
                    <LegendDot color="#16a34a" label="Energy" />
                  </>
                }
              >
                <TrendLine values={throughputTrend} previous={energyTrend} color="#2563eb" height={126} maxValue={Math.max(10, ...throughputTrend)} />
              </ChartCard>
            </Pressable>
          </View>

          {/* Bottom row */}
          <View className={cn('gap-3', isCompact ? 'flex-col' : 'flex-row')} style={{ width: '100%' }}>
            <Pressable onPress={() => openPanel('machines')} style={{ flex: isCompact ? undefined : 1.6, height: rowHeights.bottom }}>
              <MachinesAttention rows={metrics.attention} onOpenMachine={onOpenMachine} compact />
            </Pressable>
            <Pressable onPress={() => openPanel('insights')} style={{ flex: isCompact ? undefined : 1.2, height: rowHeights.bottom }}>
              <InsightsPanel insights={metrics.insights} compact />
            </Pressable>
            <Pressable onPress={() => openPanel('actions')} style={{ flex: isCompact ? undefined : 0.9, height: rowHeights.bottom }}>
              <QuickActions onOpenDevices={onOpenDevices} onOpenCanvas={() => firstMachine && onOpenMachine(firstMachine.id)} compact />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <DashboardDetailModal visible={activePanel !== null} title={activePanel ? detailTitles[activePanel] : ''} onClose={closePanel} compactPanel={activePanel === 'kpis' && activeKpiIndex !== null}>
        {renderDetail()}
      </DashboardDetailModal>
    </View>
  );
}
