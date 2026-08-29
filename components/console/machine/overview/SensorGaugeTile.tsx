import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { formatRul, levelHexes, stateTone, STATE_LABEL, TREND_FLAT_BAND, type IsoGroup } from '../../../../lib/condition';
import { cardElevation, consolePalette } from '../../../../lib/consoleTheme';
import type { DeviceNode } from '../../../../lib/devices';
import type { CardNode } from '../../../../lib/rack';
import type { MappedChannel } from '../RackOccupancyView';
import { BarGauge, gaugeColumnWidth, gaugeSpanFor, gaugeTubeHeight, type GaugeSize } from './BarGauge';
import type { LiveState } from '../../../../lib/liveTelemetry';
import { NO_VALUE_TEXT } from '../liveValue';
import { resolveSensorIdentity } from './sensorIdentity';
import { usePointCondition, type PointCondition } from './usePointCondition';

// Below this the tile switches to the compact gauge: no text callouts, smaller
// tube, smaller value. Six tiles across a 1600px window land at ~248px each, so
// the compact form is the one most of this page actually renders; the comfortable
// form appears when a tile gets a column of its own.
const COMFORTABLE_FROM = 420;

const VALUE_COLUMN_MIN = 84;
const PADDING_X = { compact: 12, comfortable: 22 } as const;

// The narrowest a tile can be and still hold a readable gauge plus a live value.
// The grid uses this as its floor.
export const SENSOR_TILE_MIN_WIDTH = gaugeColumnWidth('compact') + VALUE_COLUMN_MIN + PADDING_X.compact * 2;

function trendGlyph(changeFraction: number) {
  if (changeFraction > TREND_FLAT_BAND) return '▲';
  if (changeFraction < -TREND_FLAT_BAND) return '▼';
  return '';
}

function ClockIcon({ colour, size }: { colour: string; size: number }) {
  const r = size / 2 - 1;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colour} strokeWidth={1.3} fill="none" />
      <Line x1={size / 2} y1={size * 0.28} x2={size / 2} y2={size / 2} stroke={colour} strokeWidth={1.3} strokeLinecap="round" />
      <Line x1={size / 2} y1={size / 2} x2={size * 0.7} y2={size / 2} stroke={colour} strokeWidth={1.3} strokeLinecap="round" />
    </Svg>
  );
}

export type SensorGaugeTileProps = {
  mapped: MappedChannel;
  machineId: string;
  machineName: string;
  componentLabel: string | null;
  devices: DeviceNode[];
  cards: CardNode[];
  width: number;
  online?: boolean;
  isoGroup?: IsoGroup;
  componentId?: string | null;
  // Overrides the footer line. Left unset it reports remaining life, which is the
  // useful thing for a degrading channel; a pressure or speed channel may want
  // "stable" or a margin instead.
  footerNote?: string;
  // Must be referentially stable, since the condition recomputes on every tick.
  onCondition?: (condition: PointCondition) => void;
  onPress?: () => void;
  // Live telemetry the host already holds. Needed for racks that are not
  // addressable on the measurement bus — see useMappedChannelReading.
  live?: LiveState;
};

// One sensor as a panel gauge: what it reads now, where that sits against its
// ALERT and DANGER limits, and which piece of hardware it is. One component for
// every measurement kind — vibration, temperature, speed, current, pressure and
// the scaled universal inputs all differ only in their unit, limits and range.
export function SensorGaugeTile({
  mapped,
  machineId,
  machineName,
  componentLabel,
  devices,
  cards,
  live,
  width,
  online = true,
  isoGroup,
  componentId,
  footerNote,
  onCondition,
  onPress,
}: SensorGaugeTileProps) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const levels = levelHexes(isDark);
  const mutedClass = isDark ? 'text-ink-muted' : 'text-ink-inverse-muted';
  const inkClass = isDark ? 'text-ink' : 'text-ink-inverse';
  const hairline = isDark ? 'rgba(255,255,255,0.10)' : palette.lineSubtle;

  const condition = usePointCondition(mapped, machineId, { isoGroup, componentId, online, devices, cards, live });
  // A state is a word, a dot and a number, and each wants a different amount of
  // chroma to read as the same colour on a white ground — see `statusTone`.
  const tone = stateTone(condition.state, isDark);
  const colour = tone.fg;
  const valueColour = tone.value;
  const dotColour = tone.dot;

  useEffect(() => {
    onCondition?.(condition);
  }, [condition, onCondition]);

  const identity = resolveSensorIdentity({ channel: mapped.channel, machineName, componentLabel, devices, cards });

  const size: GaugeSize = width >= COMFORTABLE_FROM ? 'comfortable' : 'compact';
  const compact = size === 'compact';
  const padX = PADDING_X[size];

  const { value, band, thresholds, prognosis } = condition;
  // A mapped channel the gateway has never reported. There is no generator
  // behind this page, so the tile shows the channel and its limits and says
  // plainly that nothing has come back — rather than drawing a plausible needle.
  const hasReading = value !== null;
  const span = gaugeSpanFor(thresholds, identity.engineeringRange);
  const changePercent = Math.round(condition.changeFraction * 100);
  const isFlat = Math.abs(condition.changeFraction) <= TREND_FLAT_BAND;
  const decimals = band.decimals;
  const offline = condition.state === 'offline';

  const valueFontSize = compact ? 25 : 40;

  // Light mode: a healthy card is a white card with a neutral edge. Colour goes
  // on the reading, the dot and the status word, and the border only picks up a
  // hue once the sensor is actually asking for attention. Dark mode keeps the
  // tinted edge it has always had — on a near-black ground it reads as depth
  // rather than as a highlight.
  const quiet = !isDark && condition.state === 'normal';
  const cardBorder = offline
    ? hairline
    : isDark
      ? `${colour}80`
      : condition.state === 'normal'
        ? palette.line
        : tone.border;

  const summaryCell = (label: string, tint: string | undefined, text: string) => (
    <View className="flex-1 items-center">
      <Text
        style={tint ? { color: tint } : undefined}
        className={cn('font-mono', compact ? 'text-[9px]' : 'text-[10px]', !tint && mutedClass)}
      >
        {label}
      </Text>
      <Text className={cn('mt-0.5 font-mono tabular-nums', compact ? 'text-[10px]' : 'text-[12px]', inkClass)}>{text}</Text>
    </View>
  );

  const infoRow = (label: string, text: string, strong?: boolean) => (
    <View className="flex-row items-baseline" style={{ minHeight: compact ? 15 : 22 }}>
      <Text style={{ width: compact ? 54 : 84 }} className={cn('font-mono', compact ? 'text-[9px]' : 'text-[11px]', mutedClass)}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        className={cn('flex-1 font-mono', compact ? 'text-[9px]' : 'text-[11px]', strong ? cn(inkClass, 'font-bold') : mutedClass)}
      >
        {text}
      </Text>
    </View>
  );

  const footerText = footerNote
    ? footerNote
    : offline
      ? 'no live data'
      : prognosis.daysToDanger === null
        ? 'no measurable trend'
        : prognosis.daysToDanger <= 0
          ? 'over limit now'
          : `${formatRul(prognosis.daysToDanger)} to limit`;
  const showClock = !footerNote && !offline && prognosis.daysToDanger !== null;

  const body = (
    <View
      className={cn('overflow-hidden border', compact ? 'rounded-2xl' : 'rounded-[22px]')}
      style={{ width, borderColor: cardBorder, opacity: offline ? 0.72 : 1, ...cardElevation(isDark) }}
    >
      <LinearGradient
        colors={isDark ? ['#141416', '#0B0B0C', '#101011'] : ['#FFFFFF', '#FAFAFA', '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={{ paddingHorizontal: padX, paddingTop: compact ? 11 : 16, paddingBottom: compact ? 10 : 14 }}
      >
        <View className="flex-row items-center justify-between gap-1">
          <View className="flex-row items-center gap-2">
            <View
              className={cn('rounded-md border', compact ? 'px-1.5 py-[1px]' : 'px-2 py-1')}
              style={{ borderColor: quiet ? palette.line : `${colour}8C`, backgroundColor: quiet ? palette.panelRaised : undefined }}
            >
              <Text style={{ color: colour }} className={cn('font-mono font-bold', compact ? 'text-[11px]' : 'text-[13px]')}>
                {condition.code}
              </Text>
            </View>
            <Text numberOfLines={1} className={cn('flex-1 font-mono tracking-wider', compact ? 'text-[8px]' : 'text-[10px]', mutedClass)}>
              {condition.kind.toUpperCase()}
            </Text>
          </View>
          {/* Status is stated in words as well as colour, so the tile does not
              depend on colour vision alone. */}
          <View className="flex-row items-center gap-1.5">
            {!compact && (
              <Text style={{ color: colour }} className="font-mono text-[9px] font-bold tracking-wider">
                {STATE_LABEL[condition.state]}
              </Text>
            )}
            <View style={{ width: compact ? 9 : 12, height: compact ? 9 : 12, borderRadius: 6, backgroundColor: dotColour }} />
          </View>
        </View>

        <View className={compact ? 'mt-2' : 'mt-3'}>
          <Text numberOfLines={1} className={cn('font-body-bold', compact ? 'text-[12px]' : 'text-[17px]', inkClass)}>
            {condition.label}
          </Text>
          <Text numberOfLines={1} className={cn('mt-0.5 font-body', compact ? 'text-[9px]' : 'text-[12px]', mutedClass)}>
            {identity.location}
          </Text>
        </View>

        <View className={cn('flex-row', compact ? 'mt-2' : 'mt-3')} style={{ height: gaugeTubeHeight(size) }}>
          <BarGauge
            value={value ?? span.min}
            span={span}
            thresholds={thresholds}
            state={condition.state}
            decimals={decimals}
            size={size}
          />

          <View className={cn('flex-1 justify-center', compact ? 'pl-1.5' : 'pl-3')}>
            <Text className={cn('font-mono tracking-widest', compact ? 'text-[8px]' : 'text-[10px]', mutedClass)}>
              {/* Keyed off where the buffer came from, not off the condition.
                  A held buffer whose feed has gone quiet is still a real
                  measurement, but it is not a current one, and labelling it LIVE
                  is how a page ends up asserting a value nobody is sending. */}
              {condition.source === 'none' ? 'NO DATA' : condition.source === 'stale' ? 'LAST' : 'LIVE'}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: valueColour, fontSize: valueFontSize, lineHeight: valueFontSize + 4, letterSpacing: -1 }}
              className="mt-0.5 font-mono font-bold tabular-nums"
            >
              {hasReading ? value.toFixed(decimals) : NO_VALUE_TEXT}
            </Text>
            <Text className={cn('font-mono', compact ? 'text-[10px]' : 'text-[14px]', mutedClass)}>{condition.unit}</Text>

            {!offline && (
              <Text
                style={isFlat ? undefined : { color: colour }}
                className={cn('font-mono font-bold tabular-nums', compact ? 'mt-1.5 text-[10px]' : 'mt-3 text-[15px]', isFlat && mutedClass)}
              >
                {trendGlyph(condition.changeFraction)}
                {isFlat ? '' : ' '}
                {changePercent >= 0 ? '+' : ''}
                {changePercent}%
              </Text>
            )}

            {compact && (
              <Text style={{ color: colour }} className="mt-1.5 font-mono text-[8px] font-bold tracking-wider">
                {STATE_LABEL[condition.state]}
              </Text>
            )}

            {condition.isoZone && !offline ? (
              <View
                className={cn('self-start rounded border', compact ? 'mt-1.5 px-1 py-[1px]' : 'mt-3 px-2.5 py-1')}
                style={{ borderColor: quiet ? palette.line : `${colour}99` }}
              >
                <Text style={{ color: colour }} className={cn('font-mono font-bold', compact ? 'text-[8px]' : 'text-[11px]')}>
                  ISO {condition.isoZone}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View
          className={cn('flex-row items-center rounded-lg border', compact ? 'mt-2 py-1.5' : 'mt-3 py-2')}
          style={{ borderColor: hairline }}
        >
          {thresholds.lowDanger !== undefined ? (
            <>
              {summaryCell('LL', levels.danger, thresholds.lowDanger.toFixed(decimals))}
              <View style={{ width: 1, height: compact ? 22 : 32, backgroundColor: hairline }} />
            </>
          ) : null}
          {thresholds.lowAlert !== undefined ? (
            <>
              {summaryCell('L', levels.alert, thresholds.lowAlert.toFixed(decimals))}
              <View style={{ width: 1, height: compact ? 22 : 32, backgroundColor: hairline }} />
            </>
          ) : null}
          {summaryCell('ALERT', levels.alert, thresholds.alert.toFixed(decimals))}
          <View style={{ width: 1, height: compact ? 22 : 32, backgroundColor: hairline }} />
          {summaryCell('DANGER', levels.danger, thresholds.danger.toFixed(decimals))}
          <View style={{ width: 1, height: compact ? 22 : 32, backgroundColor: hairline }} />
          {summaryCell(
            'F.S.',
            undefined,
            identity.engineeringRange ? `${identity.engineeringRange.min}–${identity.engineeringRange.max}` : 'not set',
          )}
        </View>

        {/* Limits nobody configured must not read as commissioned ones. */}
        {!thresholds.configured && (
          <Text style={{ color: palette.accent }} className={cn('mt-1 text-center font-mono', compact ? 'text-[8px]' : 'text-[10px]')}>
            limits inferred, not configured
          </Text>
        )}

        <View className={cn('rounded-lg border', compact ? 'mt-2 px-2 py-1.5' : 'mt-3 px-3 py-2')} style={{ borderColor: hairline }}>
          {infoRow('TAG', identity.tag, true)}
          {infoRow('SENSOR', identity.sensor)}
          {infoRow('RACK', `${identity.rackName} - ${identity.address}`)}
          {infoRow('GATEWAY', identity.gateway)}
        </View>

        <View
          className={cn('flex-row items-center justify-center gap-2', compact ? 'mt-2 pt-1.5' : 'mt-3 pt-2.5')}
          style={{ borderTopWidth: 1, borderTopColor: hairline }}
        >
          {showClock && <ClockIcon colour={colour} size={compact ? 11 : 15} />}
          <Text
            style={showClock ? { color: colour } : undefined}
            className={cn('font-mono', compact ? 'text-[9px]' : 'text-[12px]', showClock && 'font-bold', !showClock && mutedClass)}
          >
            {footerText}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${condition.label}. ${hasReading ? `${value.toFixed(decimals)} ${condition.unit}` : 'no reading reported'}. ${STATE_LABEL[condition.state]}. ${
        thresholds.lowDanger !== undefined ? `Low low ${thresholds.lowDanger.toFixed(decimals)}, ` : ''
      }${thresholds.lowAlert !== undefined ? `low ${thresholds.lowAlert.toFixed(decimals)}, ` : ''}alert ${thresholds.alert.toFixed(decimals)}, danger ${thresholds.danger.toFixed(decimals)}.`}
    >
      {body}
    </Pressable>
  );
}
