import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import { useAppTheme } from '../../hooks/useAppTheme';
import { cn } from '../../lib/cn';
import {
  consolePalette,
  deltaColor,
  severityColor as severityToneColor,
  statusColor,
  type ConsolePalette,
} from '../../lib/consoleTheme';
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
import {
  DEFAULT_PLANT_OVERVIEW,
  normalizePlantOverview,
  type PlantOverviewConfig,
} from '../../lib/plantOverview';
import { apiFetch } from '../../src/lib/apiClient';
import { ROLE_LABEL, type PublicUser } from '../../src/lib/roles';
import { PlantOverviewEditor } from './PlantOverviewEditor';

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
/**
 * Semantic tone for a card or series — what the number *means*, not what colour
 * to paint it. The palette decides the colour, which is why "blue" and "purple"
 * no longer exist: on this palette a value is either live, a warning, a fault
 * or neutral.
 */
type Tone = 'accent' | 'warning' | 'critical' | 'neutral';
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
  | 'assets'
  | 'recent'
  | 'insights'
  | 'actions';

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

function toneColor(palette: ConsolePalette, tone: Tone) {
  switch (tone) {
    case 'accent':
      return palette.accent;
    case 'warning':
      return palette.warning;
    case 'critical':
      return palette.critical;
    default:
      return palette.neutral;
  }
}

function severityColor(palette: ConsolePalette, severity: DashboardAlarm['severity']) {
  return severityToneColor(palette, severity);
}

function Sparkline({ values, color, bars = false, compact = false }: { values: readonly number[]; color?: string; bars?: boolean; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const stroke = color ?? consolePalette(isDark).accent;
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
          return <Rect key={index} x={index * (barWidth + 2)} y={height - h} width={barWidth} height={h} rx={1.5} fill={stroke} opacity={0.85} />;
        })}
      </Svg>
    );
  }

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * A KPI, stated against its plan.
 *
 * The previous card showed a value and a sparkline, which tells an operator
 * what a number is but not whether it is acceptable. This one carries the
 * target track underneath: the fill is where the asset actually sits, the notch
 * is where the plan says it should, and the delta reads against that. A glance
 * down the strip now answers "is anything off plan?" without opening anything.
 */
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
  /** Actual and target as 0–1 fractions of the same track. */
  progress,
  target,
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
  progress?: number;
  target?: number;
  compact?: boolean;
  onPress?: () => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const color = toneColor(palette, tone);
  const deltaTint = deltaColor(palette, deltaTone);
  const fill = progress === undefined ? undefined : clamp(progress, 0, 1);

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}${unit ?? ''}. ${delta}`}
      className={cn(
        'h-full min-w-0 flex-1 overflow-hidden rounded-xl border',
        compact ? 'px-3 py-2.5' : 'min-w-[170px] p-3.5',
        isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-white',
      )}
    >
      <View className="flex-row items-center gap-2">
        <MaterialCommunityIcons name={icon} size={compact ? 12 : 14} color={palette.inkFaint} />
        <Text
          numberOfLines={1}
          className={cn(
            'min-w-0 flex-1 font-mono uppercase',
            compact ? 'text-[8.5px] tracking-[0.15em]' : 'text-[9.5px] tracking-[0.16em]',
            isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
          )}
        >
          {label}
        </Text>
        <Sparkline values={spark} color={color} bars={bars} compact />
      </View>

      <View className={cn('flex-row items-end gap-1', compact ? 'mt-1.5' : 'mt-2.5')}>
        <Text
          className={cn(
            'font-display',
            compact ? 'text-[23px] leading-7' : 'text-[30px] leading-9',
            isDark ? 'text-ink' : 'text-ink-inverse',
          )}
        >
          {value}
        </Text>
        {unit ? (
          <Text
            numberOfLines={1}
            className={cn(
              'pb-1 font-body-medium',
              compact ? 'text-[10px]' : 'text-xs',
              isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
            )}
          >
            {unit}
          </Text>
        ) : null}
      </View>

      {fill !== undefined ? (
        <View className={cn('relative h-[3px] w-full overflow-hidden rounded-full', compact ? 'mt-2' : 'mt-2.5')} style={{ backgroundColor: palette.grid }}>
          <View style={{ width: `${fill * 100}%`, height: '100%', borderRadius: 999, backgroundColor: color }} />
          {/* Plan notch. Absolute rather than a second bar so it reads as a
              marker on the same track, not as a competing value. */}
          {target !== undefined ? (
            <View
              style={{
                position: 'absolute',
                left: `${clamp(target, 0, 1) * 100}%`,
                top: -2,
                width: 1.5,
                height: 7,
                backgroundColor: palette.ink,
                opacity: 0.55,
              }}
            />
          ) : null}
        </View>
      ) : null}

      <View className={cn('flex-row items-center gap-1', compact ? 'mt-2' : 'mt-2.5')}>
        <MaterialCommunityIcons
          name={deltaTone === 'down' ? 'arrow-down' : deltaTone === 'flat' ? 'minus' : 'arrow-up'}
          size={compact ? 10 : 12}
          color={deltaTint}
        />
        <Text
          numberOfLines={1}
          className={cn('min-w-0 flex-1 font-mono', compact ? 'text-[9px]' : 'text-[10.5px]')}
          style={{ color: deltaTint }}
        >
          {delta}
        </Text>
      </View>

      {!compact && (
        <Text
          numberOfLines={1}
          className={cn('mt-1 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}
        >
          {detail}
        </Text>
      )}
    </Pressable>
  );
}

function sectionClass(isDark: boolean) {
  return cn('h-full overflow-hidden rounded-2xl border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white');
}

function SectionHeader({ icon, title, subtitle, action, compact = false }: { icon?: IconName; title: string; subtitle?: string; action?: string; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className={cn('flex-row items-center justify-between border-b', compact ? 'px-3 py-2' : 'px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        {icon && <MaterialCommunityIcons name={icon} size={compact ? 14 : 16} color={palette.ink} />}
        <View className="min-w-0 flex-1">
          {/* Sentence case, not the wide uppercase the old condensed display
              face needed. Inter at panel-title size reads better tight and
              cased, and it leaves uppercase mono free to mean "micro-label". */}
          <Text
            numberOfLines={1}
            className={cn(
              'font-body-bold tracking-[-0.01em]',
              compact ? 'text-[12.5px]' : 'text-[14px]',
              isDark ? 'text-ink' : 'text-ink-inverse',
            )}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} className={cn('font-body', compact ? 'text-[9px]' : 'text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {action && (
        <Text
          numberOfLines={1}
          className={cn('font-mono uppercase tracking-[0.14em] text-accent', compact ? 'text-[9px]' : 'text-[10px]')}
        >
          {action}
        </Text>
      )}
    </View>
  );
}

function HealthGauge({ score, label, compact = false }: { score: number; label: string; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const size = compact ? 172 : 196;
  const stroke = compact ? 15 : 18;
  const cx = size / 2;
  const cy = size / 2 + (compact ? 12 : 16);
  const radius = size / 2 - stroke / 2 - 6;
  // Half-ring gauge (180° sweep) as in the reference dashboard.
  const value = clamp(score, 0, 100);
  const angle = 180 + (value / 100) * 180;
  // Tick marking the current score, drawn just outside the ring so it never
  // crosses the score text in the middle.
  const tickInner = radius - stroke / 2 - 1;
  const tickOuter = radius + stroke / 2 + 1;
  const tickX1 = cx + tickInner * Math.cos((Math.PI * angle) / 180);
  const tickY1 = cy + tickInner * Math.sin((Math.PI * angle) / 180);
  const tickX2 = cx + tickOuter * Math.cos((Math.PI * angle) / 180);
  const tickY2 = cy + tickOuter * Math.sin((Math.PI * angle) / 180);
  // Green at the healthy end, ramping to red — matching the reference gauge.
  const bands = [
    { color: palette.accent, from: 0, to: 0.62 },
    { color: palette.warning, from: 0.62, to: 0.78 },
    { color: palette.warning, from: 0.78, to: 0.9 },
    { color: palette.critical, from: 0.9, to: 1 },
  ];
  const arc = (from: number, to: number) => {
    const a0 = 180 + from * 180;
    const a1 = 180 + to * 180;
    const p0 = { x: cx + radius * Math.cos((Math.PI * a0) / 180), y: cy + radius * Math.sin((Math.PI * a0) / 180) };
    const p1 = { x: cx + radius * Math.cos((Math.PI * a1) / 180), y: cy + radius * Math.sin((Math.PI * a1) / 180) };
    return `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 0 1 ${p1.x} ${p1.y}`;
  };
  const trackColour = isDark ? 'rgba(255,255,255,0.08)' : palette.line;
  const inkColour = palette.ink;
  const mutedColour = palette.inkMuted;
  const toneColour = value >= 70 ? (isDark ? palette.accent : palette.accent) : value >= 50 ? palette.warning : palette.critical;
  return (
    <Svg width={size} height={compact ? size * 0.72 : size * 0.74} viewBox={`0 0 ${size} ${size * 0.78}`}>
      <Path d={arc(0, 1)} fill="none" stroke={trackColour} strokeWidth={stroke} strokeLinecap="round" />
      {bands.map((band) => (
        <Path key={band.color} d={arc(band.from, band.to)} fill="none" stroke={band.color} strokeWidth={stroke} />
      ))}
      <Line x1={tickX1} y1={tickY1} x2={tickX2} y2={tickY2} stroke={inkColour} strokeWidth={2.5} strokeLinecap="round" />
      <SvgText x={cx - (compact ? 6 : 8)} y={cy - (compact ? 14 : 18)} textAnchor="middle" fontSize={compact ? 30 : 38} fontWeight="700" fill={inkColour}>
        {value}
      </SvgText>
      <SvgText x={cx + (compact ? 18 : 24)} y={cy - (compact ? 14 : 18)} fontSize={compact ? 10 : 12} fill={mutedColour}>
        /100
      </SvgText>
      <SvgText x={cx} y={cy + (compact ? 4 : 4)} textAnchor="middle" fontSize={compact ? 12 : 14} fontWeight="700" fill={toneColour}>
        {label}
      </SvgText>
    </Svg>
  );
}

function HealthAnalysis({ metrics, compact = false }: { metrics: DashboardMetrics; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
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
                  <MaterialCommunityIcons name="information-outline" size={compact ? 10 : 11} color={palette.neutral} />
                </View>
                <Text className={cn('font-mono', compact ? 'text-[10px]' : 'text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{factor.value}%</Text>
              </View>
              <View className={cn('h-1.5 rounded-full', isDark ? 'bg-white/10' : 'bg-black/10')}>
                <View
                  className="h-1.5 rounded-full"
                  style={{ width: `${clamp(factor.value, 0, 100)}%`, backgroundColor: factor.value >= 75 ? palette.accent : factor.value >= 50 ? palette.warning : palette.critical }}
                />
              </View>
            </View>
          ))}
        </View>
        {!compact && metrics.healthContributors.length > 0 && (
          <View className={cn('mt-3 rounded-lg px-3 py-2', isDark ? 'bg-white/5' : 'bg-black/[0.035]')}>
            <Text className={cn('font-body-medium text-[11px]', isDark ? 'text-ink' : 'text-ink-inverse')}>Reduced by</Text>
            <Text className={cn('mt-1 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{metrics.healthContributors.join(', ')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function TrendLine({
  values,
  previous,
  color,
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
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const stroke = color ?? palette.accent;
  const gridColour = palette.grid;
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
            <Line x1={pad} x2={width - pad} y1={y} y2={y} stroke={gridColour} strokeDasharray="3 5" strokeWidth={1} />
            <SvgText x={pad - 8} y={y + 3} fontSize={9} fill={palette.inkFaint} textAnchor="end">
              {Math.round((tick / 100) * max)}
            </SvgText>
          </G>
        );
      })}
      {fill && <Path d={areaPath} fill={stroke} opacity={0.12} />}
      {previousPath && <Polyline points={previousPath} fill="none" stroke={palette.series2} strokeWidth={2} strokeDasharray="5 5" />}
      <Polyline points={currentPath} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {currentPoints.map((point, index) => (
        <Circle key={index} cx={point.x} cy={point.y} r={2.5} fill={stroke} />
      ))}
      {lastPoint && (
        <G>
          <Circle cx={lastPoint.x} cy={lastPoint.y} r={4.5} fill={stroke} stroke={palette.panel} strokeWidth={2} />
          <SvgText x={lastPoint.x - 6} y={lastPoint.y - 10} fill={stroke} fontWeight="700" fontSize={11} textAnchor="end">
            {Math.round(last)}
          </SvgText>
        </G>
      )}
    </Svg>
  );
}

function StackedBars({ labels, critical, warning, info, height = 170 }: { labels: string[]; critical: number[]; warning: number[]; info: number[]; height?: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
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
            <Line x1={34} x2={width - 20} y1={y} y2={y} stroke={isDark ? 'rgba(255,255,255,0.08)' : palette.line} strokeDasharray="3 5" />
            <SvgText x={28} y={y + 3} fontSize={9} fill={palette.inkFaint} textAnchor="end">
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
            <Rect x={x} y={baseY - cH} width={barW} height={cH} fill={palette.critical} />
            <Rect x={x} y={baseY - cH - wH} width={barW} height={wH} fill={palette.warning} />
            <Rect x={x} y={baseY - cH - wH - iH} width={barW} height={iH} fill={palette.neutral} rx={2} />
            <SvgText x={x + barW / 2} y={height - 10} fontSize={9} fill={palette.inkFaint} textAnchor="middle">
              {label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function DonutChart({ segments, total, size = 150 }: { segments: { label: string; value: number; color: string }[]; total: number; size?: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const scale = size / 150;
  const radius = 46 * scale;
  const circumference = 2 * Math.PI * radius;
  const sum = Math.max(1, total);
  let offset = 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={isDark ? 'rgba(255,255,255,0.08)' : palette.line}
        strokeWidth={17 * scale}
        fill="none"
      />
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
      <SvgText
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        fontSize={22 * scale}
        fontWeight="700"
        fill={palette.ink}
      >
        {total}
      </SvgText>
      <SvgText x={size / 2} y={size / 2 + 15 * scale} textAnchor="middle" fontSize={11 * scale} fill={palette.inkMuted}>
        Total
      </SvgText>
    </Svg>
  );
}

function PlantMapPanel({
  areas,
  compact = false,
  imageScale = 100,
  canEdit = false,
  onEdit,
}: {
  areas: PlantArea[];
  compact?: boolean;
  imageScale?: number;
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const imageInset = (100 - imageScale) / 2;
  return (
    <View className={sectionClass(isDark)}>
      <View className={cn('flex-row items-center justify-between border-b', compact ? 'px-3 py-2' : 'px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
        <Text className={cn('font-body-bold', compact ? 'text-xs' : 'text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>Plant Overview</Text>
        <View className={cn('flex-row items-center', compact ? 'gap-3' : 'gap-4')}>
          {canEdit && onEdit ? (
            <Pressable
              onPress={onEdit}
              accessibilityRole="button"
              className={cn('flex-row items-center gap-1 rounded-md border px-2 py-1', isDark ? 'border-line-dark' : 'border-line-light')}
            >
              <MaterialCommunityIcons name="pencil-outline" size={12} color={palette.accent} />
              <Text className="font-body-medium text-[10px] text-accent">Edit map</Text>
            </Pressable>
          ) : null}
          {(['healthy', 'warning', 'critical', 'offline'] as const).map((status) => (
            <View key={status} className="flex-row items-center gap-1">
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(palette, status) }} />
              <Text className={cn('font-body-medium text-[10px] capitalize', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{status}</Text>
            </View>
          ))}
        </View>
      </View>
      <View className="relative overflow-hidden" style={{ flex: 1, minHeight: compact ? 230 : 320, backgroundColor: palette.bg }}>
        <Svg width="100%" height="100%" viewBox="0 0 640 330" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          <Rect x={0} y={0} width={640} height={330} fill={isDark ? palette.bg : palette.panelRaised} />
          {Array.from({ length: 17 }).map((_, index) => (
            <Line key={`v-${index}`} x1={index * 40} x2={index * 40} y1={0} y2={330} stroke={isDark ? palette.panelRaised : palette.panelRaised} strokeWidth={1} />
          ))}
          {Array.from({ length: 10 }).map((_, index) => (
            <Line key={`h-${index}`} x1={0} x2={640} y1={index * 36} y2={index * 36} stroke={isDark ? palette.panelRaised : palette.panelRaised} strokeWidth={1} />
          ))}
        </Svg>
        <Image
          source={{ uri: PLANT_OVERVIEW_IMAGE_URI }}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: `${imageInset}%`,
            right: `${imageInset}%`,
            top: `${imageInset}%`,
            bottom: `${imageInset}%`,
            opacity: isDark ? 0.86 : 0.98,
          }}
        />
        <Svg width="100%" height="100%" viewBox="0 0 640 330" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
          {areas.map((area) => {
            const color = statusColor(palette, area.status);
            const boxW = compact ? 118 : 132;
            const boxH = compact ? 40 : 46;
            const labelX = clamp(area.labelX, 4, 640 - boxW - 4);
            const labelY = clamp(area.labelY, 4, 330 - boxH - 4);
            // Anchor the leader line on whichever edge of the callout faces the pin.
            const anchorX = clamp(area.x, labelX, labelX + boxW);
            const anchorY = area.y > labelY + boxH ? labelY + boxH : area.y < labelY ? labelY : area.y;
            return (
              <G key={area.id}>
                <Line x1={area.x} y1={area.y} x2={anchorX} y2={anchorY} stroke={color} strokeWidth={1.6} />
                <Circle cx={area.x} cy={area.y} r={10} fill={`${color}22`} stroke={color} strokeWidth={1.8} />
                <Circle cx={area.x} cy={area.y} r={4.5} fill={color} stroke={palette.panel} strokeWidth={2} />
                <Rect x={labelX} y={labelY} width={boxW} height={boxH} rx={7} fill={palette.panel} opacity={0.97} stroke={palette.lineStrong} />
                <SvgText x={labelX + 10} y={labelY + (compact ? 16 : 18)} fontSize={compact ? 9 : 10.5} fontWeight="700" fill={palette.ink}>
                  {area.name}
                </SvgText>
                <Circle cx={labelX + 13} cy={labelY + (compact ? 29 : 33)} r={3.2} fill={color} />
                <SvgText x={labelX + 21} y={labelY + (compact ? 32 : 36)} fontSize={compact ? 8 : 9.5} fill={palette.inkMuted}>
                  {area.status === 'healthy' ? 'Healthy' : area.status === 'warning' ? 'Warning' : area.status === 'critical' ? 'Critical' : 'Offline'}
                </SvgText>
              </G>
            );
          })}
        </Svg>
        <View className="absolute left-3 top-3 gap-1.5">
          {['target', 'plus', 'minus', 'crosshairs-gps'].map((icon) => (
            <Pressable key={icon} className={cn('h-7 w-7 items-center justify-center rounded-md border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <MaterialCommunityIcons name={icon as IconName} size={14} color={palette.ink} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function LiveAlarmFeed({ alarms, compact = false }: { alarms: DashboardAlarm[]; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const visible = compact ? alarms.slice(0, 8) : alarms;
  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader icon="bell-alert-outline" title="Live Alarm Feed" action="View all alarms" compact={compact} />
      <View className="flex-1" style={{ minHeight: 0 }}>
        <View className={cn('flex-row items-center border-b px-3 py-2', isDark ? 'border-line-dark bg-white/5' : 'border-line-light bg-black/[0.035]')}>
          <Text className={cn('w-16 font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Severity</Text>
          <Text className={cn('min-w-0 flex-[1.4] px-2 font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Alarm</Text>
          <Text className={cn('min-w-0 flex-1 font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Source</Text>
          <Text className={cn('w-[68px] font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Time</Text>
          <Text className={cn('w-8 text-right font-body-bold text-[9px] uppercase', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Ack</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          {visible.length === 0 ? (
            <View className="items-center justify-center px-3 py-8">
              <MaterialCommunityIcons name="check-circle-outline" size={22} color={palette.accent} />
              <Text className={cn('mt-2 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>No active alarms</Text>
            </View>
          ) : (
            visible.map((alarm) => {
              const color = severityColor(palette, alarm.severity);
              return (
                <View key={alarm.id} className={cn('flex-row items-center border-b px-3 py-2', isDark ? 'border-line-dark' : 'border-line-light')}>
                  <Text numberOfLines={1} className="w-16 rounded px-1.5 py-0.5 text-center font-body-bold text-[9px]" style={{ color, backgroundColor: `${color}16` }}>
                    {alarm.severity}
                  </Text>
                  <Text numberOfLines={1} className={cn('min-w-0 flex-[1.4] px-2 font-body-medium text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{alarm.message}</Text>
                  <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm.source}</Text>
                  <Text numberOfLines={1} className={cn('w-[68px] font-mono text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{alarm.time}</Text>
                  <View className="w-8 items-end">
                    <MaterialCommunityIcons name={alarm.state === 'Ack' ? 'check-circle' : 'check-circle-outline'} size={14} color={alarm.state === 'Ack' ? palette.accent : palette.neutral} />
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
  const palette = consolePalette(isDark);
  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader icon="server-network" title="System Status" action="View all" compact={compact} />
      <View className={cn('flex-row flex-wrap', compact ? 'gap-x-4 gap-y-1.5 px-3 py-2' : 'gap-2 p-3')}>
        {services.map((service) => {
          const color = service.status === 'healthy' ? palette.accent : service.status === 'degraded' ? palette.warning : palette.critical;
          return (
            <View key={service.name} className={cn('flex-row items-center gap-1.5', compact ? 'min-w-[120px] basis-[30%]' : 'min-w-[180px] flex-1 rounded-md px-2 py-1.5', !compact && (isDark ? 'bg-white/5' : 'bg-black/[0.035]'))}>
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
  const palette = consolePalette(isDark);
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
          <View key={label} className={cn('min-w-[110px] flex-1 rounded-md', compact ? 'px-2 py-1.5' : 'px-3 py-2', isDark ? 'bg-white/5' : 'bg-black/[0.035]')}>
            <Text numberOfLines={1} className={cn('font-body-medium', compact ? 'text-[9px]' : 'text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
            <View className="mt-0.5 flex-row items-end justify-between gap-1">
              <View className="flex-row items-end gap-1">
                <Text numberOfLines={1} className={cn('font-display', compact ? 'text-sm' : 'text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
                <Text className={cn('pb-0.5 font-body', compact ? 'text-[9px]' : 'text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{unit}</Text>
              </View>
              <Sparkline values={spark} color={palette.series2} compact />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function ChartCard({ title, action, children, compact = false, legend }: { title: string; action?: string; children: ReactNode; compact?: boolean; legend?: ReactNode }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
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
  const palette = consolePalette(isDark);
  return (
    <View className="flex-row items-center gap-1">
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text className={cn('font-body-medium text-[9px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
    </View>
  );
}

function MachinesAttention({ rows, onOpenMachine, compact = false }: { rows: AttentionRow[]; onOpenMachine: (id: string) => void; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
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
              <MaterialCommunityIcons name="shield-check-outline" size={22} color={palette.accent} />
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
                      color: row.health < 50 ? palette.critical : row.health < 75 ? palette.warning : palette.accent,
                      backgroundColor: row.health < 50 ? palette.critical : row.health < 75 ? palette.warning : palette.accentSoft,
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
                    <Text className="flex-1 font-body-bold text-[10px]" style={{ color: row.risk === 'High' ? palette.critical : row.risk === 'Medium' ? palette.warning : palette.accent }}>{row.risk}</Text>
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
  const palette = consolePalette(isDark);
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
            const color = insight.priority === 'High' ? palette.critical : insight.priority === 'Medium' ? palette.warning : palette.accent;
            return (
              <View key={insight.id} className={cn('flex-row items-center gap-2 rounded-lg px-2.5 py-2', isDark ? 'bg-white/5' : 'bg-black/[0.035]')}>
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
                <MaterialCommunityIcons name="chevron-right" size={15} color={palette.neutral} />
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Asset performance against plan.
 *
 * The dashboard could previously tell you *that* a machine needed attention but
 * not *how far off* it was, which is the first thing a control-room operator
 * asks. This states each asset as target vs actual with the gap between them,
 * and encodes the size of that gap as a five-step scale so the column can be
 * skimmed vertically without reading a single number.
 */
function DeviationScale({ gap, palette }: { gap: number; palette: ConsolePalette }) {
  // Five steps centred on zero: two of under-performance, on-plan, two of over.
  const magnitude = Math.min(2, Math.round(Math.abs(gap) / 6));
  const index = gap === 0 ? 2 : gap < 0 ? 2 - magnitude : 2 + magnitude;
  const tint = Math.abs(gap) <= 3 ? palette.accent : Math.abs(gap) <= 12 ? palette.warning : palette.critical;

  return (
    <View className="flex-row items-center gap-[3px]">
      {[0, 1, 2, 3, 4].map((step) => (
        <View
          key={step}
          style={{
            width: 11,
            height: 7,
            borderRadius: 2,
            backgroundColor: step === index ? tint : palette.grid,
          }}
        />
      ))}
    </View>
  );
}

function AssetPerformanceTable({
  rows,
  onOpenMachine,
  compact = false,
}: {
  rows: AttentionRow[];
  onOpenMachine: (id: string) => void;
  compact?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  // Health is scored against a 90 target; the gap is what the operator acts on.
  const target = 90;
  const visible = compact ? rows.slice(0, 6) : rows;

  const headCell = cn(
    'font-mono uppercase tracking-[0.14em]',
    compact ? 'text-[8px]' : 'text-[9px]',
    isDark ? 'text-ink-muted' : 'text-ink-inverse-muted',
  );
  const cell = cn('font-mono', compact ? 'text-[10px]' : 'text-[11px]');

  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader
        icon="table-large"
        title="Asset performance vs plan"
        subtitle={`${rows.length} assets · health target ${target}`}
        action="Live"
        compact={compact}
      />

      <View
        className={cn('flex-row items-center gap-2 border-b px-3 py-2', isDark ? 'border-line-dark' : 'border-line-light')}
        style={{ backgroundColor: palette.panelRaised }}
      >
        <Text className={cn(headCell, 'flex-[2.2]')}>Asset</Text>
        <Text className={cn(headCell, 'w-[74px]')}>Deviation</Text>
        <Text className={cn(headCell, 'w-[46px] text-right')}>Target</Text>
        <Text className={cn(headCell, 'w-[46px] text-right')}>Actual</Text>
        <Text className={cn(headCell, 'w-[44px] text-right')}>Gap</Text>
        {!compact && <Text className={cn(headCell, 'flex-[1.6]')}>System intent</Text>}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {visible.length === 0 ? (
          <View className="items-center py-8">
            <MaterialCommunityIcons name="shield-check-outline" size={22} color={palette.accent} />
            <Text className={cn('mt-2 font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              Every asset is on plan
            </Text>
          </View>
        ) : (
          visible.map((row) => {
            const gap = row.health - target;
            const gapTint = gap >= -3 ? palette.accent : gap >= -12 ? palette.warning : palette.critical;
            return (
              <Pressable
                key={row.id}
                onPress={() => row.machineId && onOpenMachine(row.machineId)}
                accessibilityRole="button"
                accessibilityLabel={`${row.name}, health ${row.health} against target ${target}. ${row.action}`}
                className={cn(
                  'flex-row items-center gap-2 border-b px-3 py-2',
                  isDark ? 'border-line-dark' : 'border-line-light',
                )}
              >
                <View className="min-w-0 flex-[2.2] flex-row items-center gap-2">
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: gapTint }} />
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className={cn('font-body-medium', compact ? 'text-[11px]' : 'text-[12.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
                      {row.name}
                    </Text>
                    <Text numberOfLines={1} className={cn('font-body', compact ? 'text-[9px]' : 'text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                      {row.area} · {row.issue}
                    </Text>
                  </View>
                </View>

                <View className="w-[74px]">
                  <DeviationScale gap={gap} palette={palette} />
                </View>

                <Text className={cn(cell, 'w-[46px] text-right', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{target}</Text>
                <Text className={cn(cell, 'w-[46px] text-right', isDark ? 'text-ink' : 'text-ink-inverse')}>{row.health}</Text>
                <Text className={cn(cell, 'w-[44px] text-right')} style={{ color: gapTint }}>
                  {gap > 0 ? `+${gap}` : gap}
                </Text>

                {!compact && (
                  <Text numberOfLines={1} className={cn('flex-[1.6] font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    {row.action}
                  </Text>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

/**
 * What the platform has done recently, newest first.
 *
 * Every other panel answers "what is the plant doing". This one answers "what
 * did ULTRON do about it", which is the difference between a dashboard you
 * watch and one you trust.
 */
function RecentActions({ insights, alarms, compact = false }: { insights: Insight[]; alarms: DashboardAlarm[]; compact?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  // Interleave the two feeds so the rail reads chronologically rather than as
  // two stacked lists.
  const entries = [
    ...insights.slice(0, 4).map((insight) => ({
      id: `i-${insight.id}`,
      time: insight.confidence,
      title: insight.recommendation,
      meta: insight.subject,
      tone: insight.priority === 'High' ? palette.critical : insight.priority === 'Medium' ? palette.warning : palette.accent,
    })),
    ...alarms.slice(0, 3).map((alarm) => ({
      id: `a-${alarm.id}`,
      time: alarm.age,
      title: alarm.message,
      meta: `${alarm.source} · ${alarm.value}`,
      tone: severityColor(palette, alarm.severity),
    })),
  ];

  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader icon="history" title="Recent actions" subtitle="Newest first" compact={compact} />
      <ScrollView showsVerticalScrollIndicator={false}>
        {entries.map((entry, index) => (
          <View
            key={entry.id}
            className={cn('border-b px-3 py-2.5', isDark ? 'border-line-dark' : 'border-line-light')}
            // Older entries recede down the rail — recency without a timestamp
            // column taking up width.
            style={{ opacity: 1 - Math.min(0.45, index * 0.08) }}
          >
            <View className="flex-row items-center gap-2">
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: entry.tone }} />
              <Text className={cn('font-mono text-[9px] tracking-[0.12em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                {entry.time}
              </Text>
            </View>
            <Text numberOfLines={2} className={cn('mt-1.5 font-body-medium text-[11.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
              {entry.title}
            </Text>
            <Text numberOfLines={1} className={cn('mt-0.5 font-body text-[10px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              {entry.meta}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function QuickActions({
  onOpenDevices,
  onOpenCanvas,
  onOpenPanel,
  compact = false,
}: {
  onOpenDevices: () => void;
  onOpenCanvas: () => void;
  onOpenPanel: (panel: DetailPanel) => void;
  compact?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  // Every shortcut resolves to a real destination: the devices table, the
  // machine canvas, or the matching dashboard detail panel.
  const actions: { icon: IconName; label: string; onPress: () => void; tone?: string }[] = [
    { icon: 'bell-alert-outline', label: 'View Critical Alarms', onPress: () => onOpenPanel('alarms'), tone: palette.critical },
    { icon: 'lan-disconnect', label: 'Offline Devices', onPress: onOpenDevices },
    { icon: 'wrench-clock-outline', label: 'Maintenance Due', onPress: () => onOpenPanel('machines') },
    { icon: 'file-chart-outline', label: 'Open Reports', onPress: () => onOpenPanel('insights') },
    { icon: 'vector-polyline', label: 'Open Canvas', onPress: onOpenCanvas, tone: palette.series2 },
    { icon: 'magnify', label: 'Asset Search', onPress: onOpenDevices },
  ];
  return (
    <View className={sectionClass(isDark)}>
      <SectionHeader icon="cursor-default-click-outline" title="Quick Actions / Shortcuts" compact={compact} />
      <View className={cn('flex-1 flex-row flex-wrap content-start', compact ? 'gap-2 p-2.5' : 'gap-2 p-3')}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            accessibilityRole="button"
            className={cn(
              'flex-row items-center gap-2 rounded-xl border px-3',
              compact ? 'h-[42px] min-w-[120px] basis-[30%] flex-1' : 'h-[46px] min-w-[150px] flex-1',
              isDark ? 'border-line-dark bg-white/5' : 'border-line-light bg-white',
            )}
          >
            <MaterialCommunityIcons name={action.icon} size={16} color={action.tone ?? (palette.ink)} />
            <Text numberOfLines={1} className={cn('min-w-0 flex-1 font-body-medium text-[10px]', isDark ? 'text-ink' : 'text-ink-inverse')}>
              {action.label}
            </Text>
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
  const palette = consolePalette(isDark);
  const { width, height } = useWindowDimensions();
  const modalWidth = compactPanel ? Math.min(Math.max(width - 48, 320), 520) : Math.min(Math.max(width - 32, 320), 1280);
  const modalHeight = compactPanel ? Math.min(Math.max(height - 160, 260), 380) : Math.min(Math.max(height - 64, 360), 820);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/45 p-4">
        <View className={cn('overflow-hidden rounded-xl border shadow-2xl', isDark ? 'border-line-dark bg-surface' : 'border-line-light bg-white')} style={{ width: modalWidth, maxHeight: modalHeight }}>
          <View className={cn('flex-row items-center justify-between border-b px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
            <Text className={cn('font-body-bold text-lg tracking-[-0.02em]', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
            <Pressable onPress={onClose} className={cn('rounded-lg border px-3 py-1.5', isDark ? 'border-line-dark bg-white/5' : 'border-line-light bg-black/[0.035]')}>
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
  const palette = consolePalette(isDark);
  const { width } = useWindowDimensions();
  const [now, setNow] = useState(() => new Date());
  const [timeRange, setTimeRange] = useState('Last 24 Hours');
  const [activePanel, setActivePanel] = useState<DetailPanel | null>(null);
  const [activeKpiIndex, setActiveKpiIndex] = useState<number | null>(null);
  const [plantConfig, setPlantConfig] = useState<PlantOverviewConfig>(DEFAULT_PLANT_OVERVIEW);
  const [plantEditorOpen, setPlantEditorOpen] = useState(false);
  const [plantSaving, setPlantSaving] = useState(false);
  const [plantError, setPlantError] = useState<string | null>(null);
  const isCompact = width > 0 && width < 1100;
  const canEditPlant = currentUser?.role === 'super_admin';

  // The plant overview layout is shared: super admins save it, everyone else
  // renders whatever was saved.
  useEffect(() => {
    let cancelled = false;
    void apiFetch('/api/workspace/plant-overview')
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { config?: unknown };
        if (!cancelled) setPlantConfig(normalizePlantOverview(data.config));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const savePlantConfig = async (config: PlantOverviewConfig) => {
    setPlantSaving(true);
    setPlantError(null);
    try {
      const response = await apiFetch('/api/workspace/plant-overview', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = (await response.json().catch(() => ({}))) as { config?: unknown; error?: string };
      if (!response.ok) {
        setPlantError(data.error ?? 'Could not save the plant overview.');
        return;
      }
      setPlantConfig(normalizePlantOverview(data.config ?? config));
      setPlantEditorOpen(false);
    } catch {
      setPlantError('Could not reach the server.');
    } finally {
      setPlantSaving(false);
    }
  };

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
    { label: 'Critical', value: metrics.criticalCount, color: palette.critical },
    { label: 'Warning', value: metrics.warningCount, color: palette.warning },
    { label: 'Info', value: metrics.infoCount, color: palette.neutral },
    { label: 'Acknowledge', value: metrics.ackCount, color: palette.inkFaint },
  ];
  const severityTotal = severitySegments.reduce((sum, segment) => sum + segment.value, 0);

  // Saved tags drive the map; `auto` tags borrow the live status of the area
  // with the same name so the layout stays fixed while colours stay live.
  const plantAreas: PlantArea[] = plantConfig.tags.map((tag) => {
    const derived = metrics.areas.find((area) => area.name === tag.name);
    return {
      id: tag.id,
      name: tag.name,
      x: tag.x,
      y: tag.y,
      labelX: tag.labelX,
      labelY: tag.labelY,
      status: tag.status === 'auto' ? derived?.status ?? 'healthy' : tag.status,
      count: derived?.count ?? 0,
    };
  });
  const plantAutoColors: Record<string, string> = {};
  for (const area of plantAreas) plantAutoColors[area.name] = statusColor(palette, area.status);

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
    assets: 'Asset Performance vs Plan',
    recent: 'Recent Actions',
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
    // Ratios are expressed against the same 0–1 track the plan notch sits on, so
    // "how far along" and "where it should be" are directly comparable.
    const ratio = (actual: number, total: number) => (total > 0 ? actual / total : 0);
    const alarmLoad = clamp(metrics.alarmCount / 20, 0, 1);

    return [
      <KpiCard key="health" icon="heart-pulse" label="Overall Health" value={String(metrics.healthScore)} unit="/100" detail={metrics.healthLabel} delta={metrics.live ? metrics.healthLabel : '+4 pts vs yesterday'} tone={metrics.healthScore >= 85 ? 'accent' : metrics.healthScore >= 60 ? 'warning' : 'critical'} spark={kpiSpark(healthSeries, DEMO_SPARK_HEALTH)} progress={metrics.healthScore / 100} target={0.9} compact={compact} onPress={compact ? press(0) : undefined} />,
      <KpiCard key="oee" icon="bullseye-arrow" label="OEE" value={metrics.oee.toFixed(1)} unit="%" detail="Availability weighted" delta={metrics.live ? 'Derived from live channels' : '+2.2% vs yesterday'} tone={metrics.oee >= 75 ? 'accent' : 'warning'} spark={kpiSpark(healthSeries, DEMO_SPARK_BLUE)} progress={metrics.oee / 100} target={0.85} compact={compact} onPress={compact ? press(1) : undefined} />,
      <KpiCard key="machines" icon="robot-industrial-outline" label="Machines Online" value={String(metrics.machinesOnline)} unit={`/ ${metrics.machinesTotal}`} detail="Online versus total" delta={metrics.live ? `${metrics.machinesTotal - metrics.machinesOnline} offline` : 'All reporting'} deltaTone={metrics.machinesOnline < metrics.machinesTotal ? 'down' : 'up'} tone={metrics.machinesOnline < metrics.machinesTotal ? 'warning' : 'accent'} spark={kpiSpark(healthSeries, DEMO_SPARK_HEALTH)} progress={ratio(metrics.machinesOnline, metrics.machinesTotal)} target={1} compact={compact} onPress={compact ? press(2) : undefined} />,
      <KpiCard key="channels" icon="pulse" label="Active Channels" value={metrics.activeChannels.toLocaleString()} unit={`/ ${metrics.configuredChannels.toLocaleString()}`} detail="Streaming now" delta={metrics.live ? 'Live from broker' : '+96 vs yesterday'} tone="accent" spark={kpiSpark(throughputSeries, DEMO_SPARK_BLUE)} progress={ratio(metrics.activeChannels, metrics.configuredChannels)} target={1} compact={compact} onPress={compact ? press(3) : undefined} />,
      <KpiCard key="gateways" icon="router-network" label="Gateways Connected" value={String(metrics.connectedGateways)} unit={`/ ${metrics.totalGateways}`} detail="Edge transport" delta={metrics.live ? `${metrics.totalGateways - metrics.connectedGateways} down` : 'All connected'} deltaTone={metrics.connectedGateways < metrics.totalGateways ? 'down' : 'up'} tone={metrics.connectedGateways < metrics.totalGateways ? 'critical' : 'accent'} spark={kpiSpark(healthSeries, DEMO_SPARK_HEALTH)} progress={ratio(metrics.connectedGateways, metrics.totalGateways)} target={1} compact={compact} onPress={compact ? press(4) : undefined} />,
      <KpiCard key="alarms" icon="bell-alert-outline" label="Alarm Count" value={String(metrics.alarmCount)} detail={`${metrics.criticalCount} Critical, ${metrics.warningCount} Warning`} delta={`${metrics.criticalCount} Critical · ${metrics.warningCount} Warn`} deltaTone={metrics.criticalCount > 0 ? 'down' : 'up'} tone={metrics.criticalCount > 0 ? 'critical' : 'accent'} spark={kpiSpark(alarmSeries.map((sample) => sample.critical + sample.warning), DEMO_SPARK_AMBER)} bars progress={alarmLoad} target={0.25} compact={compact} onPress={compact ? press(5) : undefined} />,
      <KpiCard key="energy" icon="lightning-bolt-outline" label="Energy Today" value={metrics.energyMwh.toFixed(1)} unit="MWh" detail="Plant consumption" delta={metrics.live ? 'Estimated from load' : '-4.5% vs yesterday'} tone="accent" spark={kpiSpark(energySeries, DEMO_ENERGY.slice(0, 8))} progress={clamp(metrics.energyMwh / 60, 0, 1)} target={0.75} compact={compact} onPress={compact ? press(6) : undefined} />,
      <KpiCard key="uptime" icon="shield-check-outline" label="Uptime" value={metrics.uptimePct.toFixed(2)} unit="%" detail="System uptime" delta={metrics.live ? 'Gateway availability' : '+0.18% vs yesterday'} tone={metrics.uptimePct >= 99 ? 'accent' : 'warning'} spark={kpiSpark(healthSeries, DEMO_SPARK_HEALTH)} progress={metrics.uptimePct / 100} target={0.99} compact={compact} onPress={compact ? press(7) : undefined} />,
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
            <PlantMapPanel areas={plantAreas} imageScale={plantConfig.imageScale} canEdit={canEditPlant} onEdit={() => setPlantEditorOpen(true)} />
          </View>
        );
      case 'health':
        return (
          <View style={{ height: 460 }}>
            <HealthAnalysis metrics={metrics} />
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
              <TrendLine values={throughputTrend} previous={energyTrend} color={palette.series2} maxValue={Math.max(10, ...throughputTrend)} />
            </ChartCard>
          </View>
        );
      case 'machines':
        return (
          <View style={{ height: 460 }}>
            <MachinesAttention rows={metrics.attention} onOpenMachine={onOpenMachine} />
          </View>
        );
      case 'assets':
        return (
          <View style={{ height: 520 }}>
            <AssetPerformanceTable rows={metrics.attention} onOpenMachine={onOpenMachine} />
          </View>
        );
      case 'recent':
        return (
          <View style={{ height: 480 }}>
            <RecentActions insights={metrics.insights} alarms={metrics.alarms} />
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
            <QuickActions
              onOpenDevices={onOpenDevices}
              onOpenCanvas={() => firstMachine && onOpenMachine(firstMachine.id)}
              onOpenPanel={openPanel}
            />
          </View>
        );
      default:
        return null;
    }
  };

  const rowHeights = { kpi: 108, table: 336, main: 360, mid: 128, charts: 210, bottom: 288 };

  return (
    <View className={cn('flex-1', isDark ? 'bg-surface-dark' : 'bg-surface-light')} style={{ minHeight: 0 }}>
      <ScrollView className="flex-1" style={{ minHeight: 0 }} showsVerticalScrollIndicator contentContainerStyle={{ flexGrow: 1, padding: 12, paddingBottom: 24 }}>
        <View className="gap-3" style={{ flexGrow: 1, width: '100%' }}>
          {/* Top bar */}
          <View className="flex-row flex-wrap items-center gap-2">
            <Pressable
              onPress={() => openPanel('plant')}
              accessibilityRole="button"
              className={cn('h-10 min-w-[190px] flex-row items-center gap-2 rounded-xl border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}
            >
              <MaterialCommunityIcons name="office-building-marker-outline" size={17} color={palette.ink} />
              <Text numberOfLines={1} className={cn('flex-1 font-body-bold text-[14px] tracking-[-0.015em]', isDark ? 'text-ink' : 'text-ink-inverse')}>{metrics.plantName}</Text>
              <MaterialCommunityIcons name="chevron-down" size={17} color={palette.inkFaint} />
            </Pressable>

            <Pressable
              onPress={onOpenDevices}
              accessibilityRole="button"
              className={cn('h-10 min-w-[240px] flex-1 flex-row items-center gap-2 rounded-xl border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}
            >
              <MaterialCommunityIcons name="magnify" size={17} color={palette.inkFaint} />
              <Text numberOfLines={1} className={cn('flex-1 font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>Browse assets, tags, gateways and racks</Text>
            </Pressable>

            <Pressable
              onPress={() => setTimeRange((value) => (value === 'Last Hour' ? 'Last 24 Hours' : value === 'Last 24 Hours' ? 'Last 7 Days' : value === 'Last 7 Days' ? 'Custom' : 'Last Hour'))}
              className={cn('h-10 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}
            >
              <MaterialCommunityIcons name="calendar-clock" size={16} color={palette.ink} />
              <Text className={cn('font-mono text-[10px] uppercase tracking-[0.14em]', isDark ? 'text-ink' : 'text-ink-inverse')}>{timeRange}</Text>
              <MaterialCommunityIcons name="chevron-down" size={17} color={palette.inkFaint} />
            </Pressable>

            <Pressable onPress={() => setNow(new Date())} className={cn('h-10 w-10 items-center justify-center rounded-lg border', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <MaterialCommunityIcons name="refresh" size={18} color={palette.ink} />
            </Pressable>

            <View className={cn('h-10 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <View className={cn('h-2 w-2 rounded-full', metrics.streamHealthy ? 'bg-status-success' : 'bg-status-warning')} />
              <Text className={cn('font-mono text-[10px] uppercase tracking-[0.2em]', metrics.streamHealthy ? 'text-status-success' : 'text-status-warning')}>Live</Text>
            </View>

            <View className={cn('h-10 flex-row items-center gap-2 rounded-lg border px-3', isDark ? 'border-line-dark bg-surface-card' : 'border-line-light bg-white')}>
              <MaterialCommunityIcons name={metrics.streamHealthy ? 'access-point-check' : 'access-point-off'} size={16} color={metrics.streamHealthy ? palette.accent : palette.warning} />
              <Text className={cn('font-mono text-[10px] uppercase tracking-[0.14em]', metrics.streamHealthy ? 'text-status-success' : 'text-status-warning')}>{metrics.streamHealthy ? 'Stream healthy' : 'Stream stale'}</Text>
            </View>

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

          {/* Asset performance against plan, with what the platform did about
              it alongside. This is the row an operator reads first, so it sits
              directly under the KPI strip and above the map. */}
          <View className={cn('gap-3', isCompact ? 'flex-col' : 'flex-row')} style={{ width: '100%' }}>
            <Pressable onPress={() => openPanel('assets')} style={{ flex: isCompact ? undefined : 2.2, height: rowHeights.table }}>
              <AssetPerformanceTable rows={metrics.attention} onOpenMachine={onOpenMachine} compact />
            </Pressable>
            <Pressable onPress={() => openPanel('recent')} style={{ flex: isCompact ? undefined : 1, height: rowHeights.table }}>
              <RecentActions insights={metrics.insights} alarms={metrics.alarms} compact />
            </Pressable>
          </View>

          {/* Plant overview / health / alarms */}
          <View className={cn('gap-3', isCompact ? 'flex-col' : 'flex-row')} style={{ width: '100%' }}>
            <Pressable onPress={() => openPanel('plant')} style={{ flex: isCompact ? undefined : 1.9, height: rowHeights.main }}>
              <PlantMapPanel areas={plantAreas} imageScale={plantConfig.imageScale} compact canEdit={canEditPlant} onEdit={() => setPlantEditorOpen(true)} />
            </Pressable>
            <Pressable onPress={() => openPanel('health')} style={{ flex: isCompact ? undefined : 0.85, height: rowHeights.main }}>
              <HealthAnalysis metrics={metrics} compact />
            </Pressable>
            <Pressable onPress={() => openPanel('alarms')} style={{ flex: isCompact ? undefined : 1.35, height: rowHeights.main }}>
              <LiveAlarmFeed alarms={metrics.alarms} compact />
            </Pressable>
          </View>

          {/* Transport health. Thin band — it only matters when it is wrong. */}
          <View className={cn('gap-3', isCompact ? 'flex-col' : 'flex-row')} style={{ width: '100%' }}>
            <Pressable onPress={() => openPanel('system')} className="flex-1" style={{ height: rowHeights.mid }}>
              <SystemStatus services={metrics.services} compact />
            </Pressable>
            <Pressable onPress={() => openPanel('telemetry')} className="flex-1" style={{ height: rowHeights.mid }}>
              <TelemetrySnapshot metrics={metrics} compact />
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
                    <LegendDot color={palette.critical} label="Critical" />
                    <LegendDot color={palette.warning} label="Warning" />
                    <LegendDot color={palette.neutral} label="Info" />
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
                    <LegendDot color={palette.series2} label="Throughput" />
                    <LegendDot color={palette.accent} label="Energy" />
                  </>
                }
              >
                <TrendLine values={throughputTrend} previous={energyTrend} color={palette.series2} height={126} maxValue={Math.max(10, ...throughputTrend)} />
              </ChartCard>
            </Pressable>
          </View>

          {/* Bottom row. The machines-needing-attention list that used to live
              here is gone — the performance table above says the same thing
              with the gap attached, and two lists of the same assets is how a
              dashboard starts being ignored. */}
          <View className={cn('gap-3', isCompact ? 'flex-col' : 'flex-row')} style={{ width: '100%' }}>
            <Pressable onPress={() => openPanel('insights')} style={{ flex: isCompact ? undefined : 1.6, height: rowHeights.bottom }}>
              <InsightsPanel insights={metrics.insights} compact />
            </Pressable>
            <Pressable onPress={() => openPanel('actions')} style={{ flex: isCompact ? undefined : 1, height: rowHeights.bottom }}>
              <QuickActions
                onOpenDevices={onOpenDevices}
                onOpenCanvas={() => firstMachine && onOpenMachine(firstMachine.id)}
                onOpenPanel={openPanel}
                compact
              />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <DashboardDetailModal visible={activePanel !== null} title={activePanel ? detailTitles[activePanel] : ''} onClose={closePanel} compactPanel={activePanel === 'kpis' && activeKpiIndex !== null}>
        {renderDetail()}
      </DashboardDetailModal>

      <DashboardDetailModal visible={plantEditorOpen} title="Edit Plant Overview" onClose={() => setPlantEditorOpen(false)}>
        {plantEditorOpen ? (
        <PlantOverviewEditor
          initialConfig={plantConfig}
          imageUri={PLANT_OVERVIEW_IMAGE_URI}
          autoColors={plantAutoColors}
          saving={plantSaving}
          error={plantError}
          onCancel={() => setPlantEditorOpen(false)}
          onSave={(config) => void savePlantConfig(config)}
        />
        ) : null}
      </DashboardDetailModal>
    </View>
  );
}
