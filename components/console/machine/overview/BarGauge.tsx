import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { levelHexes, type SensorState, type Thresholds } from '../../../../lib/condition';
import { consolePalette } from '../../../../lib/consoleTheme';

// The gauge column of a sensor tile: numbered scale, tick rail, hollow tube, fill,
// ALERT and DANGER lines, live pointer, and — where the tile is wide enough —
// text callouts naming each limit.
//
// Two things worth knowing before changing this.
//
// Every position is computed in pixels from the tube height, never as a
// percentage. React Native transforms do not accept percentage values, so the
// usual web trick of `bottom: 42%; transform: translateY(50%)` to centre a marker
// on its own value has no equivalent — the marker would sit half its own height
// off, at every threshold, on every tile. Pixels from a known height also make
// the callouts outside the tube line up with the lines inside it, which is the
// entire point of the callouts.
//
// The tube is hollow above the reading. Only the measured value is painted; the
// limits are lines the fill crosses, not coloured zones. A gauge with the whole
// track pre-tinted green/amber/red shows where the limits are but not what the
// sensor is doing, which is backwards.

export type GaugeSize = 'compact' | 'comfortable';

type SizePreset = {
  tubeHeight: number;
  tubeWidth: number;
  border: number;
  pad: number;
  // 0 means the tile is too narrow for text callouts. The limits are still drawn
  // across the tube and still named in the tile's summary row, so nothing is lost
  // but the labels' position against the scale.
  calloutWidth: number;
  scaleWidth: number;
  railWidth: number;
  pointerWidth: number;
  scaleFontSize: number;
  radius: number;
  majorTicks: number;
};

const PRESETS: Record<GaugeSize, SizePreset> = {
  compact: {
    tubeHeight: 150,
    tubeWidth: 30,
    border: 2,
    pad: 5,
    calloutWidth: 0,
    scaleWidth: 26,
    railWidth: 7,
    pointerWidth: 16,
    scaleFontSize: 9,
    radius: 12,
    majorTicks: 4,
  },
  comfortable: {
    tubeHeight: 310,
    tubeWidth: 52,
    border: 2,
    pad: 7,
    calloutWidth: 132,
    scaleWidth: 24,
    railWidth: 11,
    pointerWidth: 38,
    scaleFontSize: 11,
    radius: 20,
    majorTicks: 6,
  },
};

export const gaugeColumnWidth = (size: GaugeSize) => {
  const p = PRESETS[size];
  return p.calloutWidth + p.scaleWidth + p.railWidth + p.tubeWidth + p.pointerWidth;
};

export const gaugeTubeHeight = (size: GaugeSize) => PRESETS[size].tubeHeight;

const DANGER_HEADROOM = 1.25;

const hexAlpha = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// Round a scale end up to a number a person would have chosen. Without this a
// danger limit of 78 gives a gauge topping out at 97.5, which reads as a derived
// quantity rather than a scale — the one number on an instrument that has to look
// deliberate.
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const scaled = value / magnitude;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((s) => scaled <= s + 1e-9) ?? 10) * magnitude;
}

// The displayed span is not the sensor's full engineering range. A vibration
// channel configured 0-20 mm/s with limits at 3.5 and 4.8 would put every reading
// and both limits inside the bottom quarter of the tube — a technically accurate
// gauge that shows nothing. The span is anchored on the danger limit instead, and
// the instrument's real range is stated as f.s. on the tile. That is what a panel
// gauge does: the dial covers the operating region, not the transducer's
// capability, which is why gaugeMax and fullScale are separate values.
export function gaugeSpanFor(thresholds: Thresholds, engineeringRange: { min: number; max: number } | null) {
  const lowLimit = thresholds.lowDanger ?? thresholds.lowAlert ?? thresholds.alert;
  const min = engineeringRange ? Math.min(engineeringRange.min, lowLimit) : Math.min(0, lowLimit);
  const wanted = niceCeil(thresholds.danger * DANGER_HEADROOM);
  const max = engineeringRange ? Math.min(Math.max(wanted, thresholds.danger), engineeringRange.max) : wanted;
  return { min, max: max > min ? max : min + 1 };
}

// Shared normalisation, so the fill, both limit lines, the pointer and the scale
// all take their position from one function rather than four.
export function getPercent(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

// A step that lands on round numbers whatever the span — 1 on a 0-6 vibration
// tube, 20 on a 0-100 temperature one, 500 on a speed channel. Integer ticks
// would put 101 labels on the temperature gauge.
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const scaled = raw / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

function formatTick(v: number) {
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function BarGauge({
  value,
  span,
  thresholds,
  state,
  decimals,
  size = 'comfortable',
}: {
  value: number;
  span: { min: number; max: number };
  thresholds: Thresholds;
  state: SensorState;
  decimals: number;
  size?: GaugeSize;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const levels = levelHexes(isDark);
  const p = PRESETS[size];
  // The fill is the one place the gauge is allowed to be saturated — it is the
  // measurement. Everything else (frame, track, ticks) is neutral furniture, and
  // in light mode it is a good deal quieter than the dark instrument's chrome.
  const colour =
    state === 'offline'
      ? palette.neutral
      : state === 'danger'
        ? palette.gaugeDanger
        : state === 'alert'
          ? palette.gaugeWarning
          : palette.gaugeNormal;

  const innerHeight = p.tubeHeight - p.border * 2 - p.pad * 2;
  const innerWidth = p.tubeWidth - p.border * 2 - p.pad * 2;

  const toPx = (v: number) => (getPercent(v, span.min, span.max) / 100) * innerHeight;

  // An unreachable sensor has no live reading to draw. Painting its last value as
  // a filled column would present stale data as current.
  const showFill = state !== 'offline';
  const fillPx = toPx(value);
  const alertPx = toPx(thresholds.alert);
  const dangerPx = toPx(thresholds.danger);
  const lowAlertPx = thresholds.lowAlert === undefined ? null : toPx(thresholds.lowAlert);
  const lowDangerPx = thresholds.lowDanger === undefined ? null : toPx(thresholds.lowDanger);
  const overRange = showFill && value > span.max;

  const majorStep = niceStep((span.max - span.min) / p.majorTicks);
  const minorStep = majorStep / 5;

  const majors: number[] = [];
  for (let v = span.min; v <= span.max + 1e-9; v += majorStep) majors.push(Math.round(v * 1e6) / 1e6);
  const minors: number[] = [];
  for (let v = span.min; v <= span.max + 1e-9; v += minorStep) minors.push(Math.round(v * 1e6) / 1e6);

  // Distance from the bottom of the whole column up to a value inside the tube.
  const fromFloor = (px: number) => p.border + p.pad + px;

  const callout = (label: string, limit: number, tint: string) => (
    <View style={{ position: 'absolute', left: 0, width: p.calloutWidth, bottom: fromFloor(toPx(limit)) - 1 }}>
      <View className="flex-row items-baseline gap-2 pb-1">
        <Text style={{ color: tint }} className="font-mono text-[12.5px] font-bold tracking-wide">
          {label}
        </Text>
        <Text className={cn('font-mono text-[12.5px]', isDark ? 'text-ink' : 'text-ink-inverse')}>{limit.toFixed(decimals)}</Text>
      </View>
      <LinearGradient
        colors={[tint, hexAlpha(tint, 0.7), 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height: 1, width: p.calloutWidth - 6 }}
      />
    </View>
  );

  return (
    <View className="flex-row" style={{ height: p.tubeHeight, width: gaugeColumnWidth(size) }}>
      {p.calloutWidth > 0 && (
        <View style={{ width: p.calloutWidth, height: p.tubeHeight }} className="relative">
          {callout('DANGER', thresholds.danger, levels.danger)}
          {callout('ALERT', thresholds.alert, levels.alert)}
          {thresholds.lowAlert !== undefined ? callout('LOW', thresholds.lowAlert, levels.alert) : null}
          {thresholds.lowDanger !== undefined ? callout('LOW LOW', thresholds.lowDanger, levels.danger) : null}
        </View>
      )}

      <View style={{ width: p.scaleWidth, height: p.tubeHeight }} className="relative">
        {majors.map((v) => (
          <Text
            key={v}
            numberOfLines={1}
            style={{
              position: 'absolute',
              right: 3,
              bottom: fromFloor(toPx(v)) - p.scaleFontSize / 2 - 1,
              width: p.scaleWidth - 3,
              textAlign: 'right',
              fontSize: p.scaleFontSize,
              lineHeight: p.scaleFontSize + 3,
              color: palette.inkMuted,
            }}
            className="font-mono"
          >
            {formatTick(v)}
          </Text>
        ))}
      </View>

      <View style={{ width: p.railWidth, height: p.tubeHeight }} className="relative">
        {minors.map((v) => {
          const isMajor = majors.some((m) => Math.abs(m - v) < minorStep / 100);
          return (
            <View
              key={v}
              style={{
                position: 'absolute',
                right: 0,
                bottom: fromFloor(toPx(v)),
                width: isMajor ? p.railWidth : Math.max(3, p.railWidth - 4),
                height: isMajor ? 1.5 : 1,
                backgroundColor: palette.gaugeTick,
                opacity: isMajor ? 0.95 : 0.5,
              }}
            />
          );
        })}
      </View>

      <View
        style={{
          width: p.tubeWidth,
          height: p.tubeHeight,
          borderWidth: p.border,
          borderColor: palette.gaugeBorder,
          borderRadius: p.radius,
          padding: p.pad,
          backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : palette.bgSoft,
        }}
      >
        <View
          style={{
            width: innerWidth,
            height: innerHeight,
            borderRadius: Math.max(4, p.radius - 6),
            overflow: 'hidden',
            // Hollow: this dark ground is what stays visible above the reading.
            backgroundColor: palette.gaugeTrack,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : palette.line,
          }}
        >
          {showFill && (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: fillPx,
                overflow: 'hidden',
                borderRadius: Math.max(3, p.radius - 8),
              }}
            >
              <LinearGradient
                colors={[hexAlpha(colour, 0.5), colour, hexAlpha(colour, 0.5)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
              <View style={{ position: 'absolute', left: '18%', right: '18%', top: 0, bottom: 0 }}>
                <LinearGradient
                  colors={['rgba(0,0,0,0)', 'rgba(255,255,255,0.16)', 'rgba(0,0,0,0)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          )}

          {/* Drawn after the fill, so a reading past danger does not paint over
              the line it crossed. */}
          {lowDangerPx !== null ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: lowDangerPx - 1, height: 2, backgroundColor: levels.danger }} />
          ) : null}
          {lowAlertPx !== null ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: lowAlertPx - 1, height: 2, backgroundColor: levels.alert }} />
          ) : null}
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: alertPx - 1, height: 2, backgroundColor: levels.alert }} />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: dangerPx - 1, height: 2, backgroundColor: levels.danger }} />

          {showFill && (
            <View
              style={{ position: 'absolute', left: 1, right: 1, bottom: fillPx - 2, height: 4, borderRadius: 2, backgroundColor: colour }}
            />
          )}
        </View>
      </View>

      <View style={{ width: p.pointerWidth, height: p.tubeHeight }} className="relative">
        {showFill && (
          <View style={{ position: 'absolute', left: 0, bottom: fromFloor(fillPx) - 6, flexDirection: 'row', alignItems: 'center' }}>
            <View
              style={{
                width: 0,
                height: 0,
                borderTopWidth: 6,
                borderBottomWidth: 6,
                borderRightWidth: 9,
                borderTopColor: 'rgba(0,0,0,0)',
                borderBottomColor: 'rgba(0,0,0,0)',
                borderRightColor: colour,
              }}
            />
            <View style={{ width: Math.max(4, p.pointerWidth - 22), height: 2, backgroundColor: colour }} />
          </View>
        )}

        {overRange && (
          <Text
            style={{ position: 'absolute', left: 2, bottom: fromFloor(innerHeight) + 4, color: colour, fontSize: 10 }}
            className="font-mono"
          >
            ▲
          </Text>
        )}
      </View>
    </View>
  );
}
