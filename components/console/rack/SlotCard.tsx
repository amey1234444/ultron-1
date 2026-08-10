import { useEffect, useMemo, useRef } from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Path,
  Stop,
} from 'react-native-svg';

import { useAppTheme } from '../../../hooks/useAppTheme';
import type { DeviceNode } from '../../../lib/devices';
import { channelAlarmLevel, channelLiveStatus, latestMeasurementForChannel, type LiveState } from '../../../lib/liveTelemetry';
import { channelCountForCardType, channelNamesForCard, type CardNode, type CardType } from '../../../lib/rack';

type SlotCardProps = {
  slot: number;
  card: CardNode | null;
  device?: DeviceNode;
  live?: LiveState;
  width: number;
  editable?: boolean;
  onPressEmpty: (x: number, y: number) => void;
  onPressCard: (x: number, y: number) => void;
};

// Visual-layer only — our data model (lib/rack.ts) tracks a single enabled
// channel per card, not per-point status, so these exist purely to drive
// the physical-module rendering below.
type VisualKind = 'vibration' | 'process' | 'speed-keyphasor' | 'communication';
type PointStatus = 'ok' | 'alert' | 'danger' | 'stale' | 'inactive';

type CardVisualConfig = {
  title: string;
  shortTitle: string;
  defaultModel: string;
};

const LED_SIZE = 7;

// Base design proportions — every other size scales from these so the card
// can be sized to match whatever slot width the rack computes.
const BASE_WIDTH = 72;
const BASE_HEIGHT = 220;

/**
 * Symmetrical peak-waist shape.
 * The upper and lower ends use matching inverted geometry.
 */
const OUTER_CARD_PATH = `
  M 13 12
  L 36 2
  L 59 12
  L 68 19
  L 68 57
  L 61 70
  L 61 150
  L 68 163
  L 68 201
  L 59 208
  L 36 218
  L 13 208
  L 4 201
  L 4 163
  L 11 150
  L 11 70
  L 4 57
  L 4 19
  Z
`;

const INNER_CARD_PATH = `
  M 16 16
  L 36 7
  L 56 16
  L 63 22
  L 63 55
  L 56 68
  L 56 152
  L 63 165
  L 63 198
  L 56 204
  L 36 213
  L 16 204
  L 9 198
  L 9 165
  L 16 152
  L 16 68
  L 9 55
  L 9 22
  Z
`;

const CARD_CONFIG: Record<VisualKind, CardVisualConfig> = {
  vibration: { title: 'Vibration', shortTitle: 'VIB', defaultModel: 'VIB-2200' },
  process: { title: 'Process', shortTitle: 'PROC', defaultModel: 'PROC-4400' },
  'speed-keyphasor': { title: 'Speed / Keyphasor', shortTitle: 'SPD / KPH', defaultModel: 'SPD-2200' },
  communication: { title: 'Communication', shortTitle: 'COMM', defaultModel: 'COMM-1000' },
};

const STATUS_COLOURS: Record<PointStatus, string> = {
  ok: '#16A34A',
  alert: '#D97706',
  danger: '#DC2626',
  stale: '#DC2626',
  inactive: '#A1A1AA',
};

const STATUS_LABELS: Record<PointStatus, string> = {
  ok: 'OK',
  alert: 'WARN',
  danger: 'ALARM',
  stale: 'MISS',
  inactive: 'OFF',
};

function kindFor(type: CardType): VisualKind {
  switch (type) {
    case 'Vibration Card':
      return 'vibration';
    case 'Process Card':
      return 'process';
    case 'Speed Card':
      return 'speed-keyphasor';
    case 'Communication Controller':
      return 'communication';
  }
}

function pointLabelsFor(card: CardNode): string[] {
  if (channelCountForCardType(card.type) > 0) return channelNamesForCard(card).map(() => 'CH');
  if ('controllerName' in card.config) return ['DATA'];
  return [card.type];
}

function visualStatusFor(card: CardNode, device: DeviceNode, channelId: number, live: LiveState): PointStatus {
  const status = channelLiveStatus(device, card, channelId, live);
  if (status === 'stale') return 'stale';
  if (status !== 'active') return 'inactive';
  const level = channelAlarmLevel(latestMeasurementForChannel(device, card, channelId, live));
  return level === 'danger' ? 'danger' : level === 'alert' ? 'alert' : 'ok';
}

function pointStatusesFor(card: CardNode, device: DeviceNode | undefined, live: LiveState | undefined, count: number): PointStatus[] {
  if (!card.enabled) return Array.from({ length: count }, () => 'inactive');
  if (!device) return Array.from({ length: count }, () => 'inactive');
  if (device.status !== 'Online') return Array.from({ length: count }, () => 'stale');
  if (!live) return Array.from({ length: count }, () => 'stale');
  return Array.from({ length: count }, (_, index) => visualStatusFor(card, device, index + 1, live));
}

function aggregateStatus(statuses: PointStatus[]): PointStatus {
  for (const level of ['danger', 'alert', 'ok', 'stale'] as const) {
    if (statuses.some((status) => status === level)) return level;
  }
  return 'inactive';
}

function getPressCoordinates(event: GestureResponderEvent) {
  return { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
}

function StatusLed({ status, size }: { status: PointStatus; size: number }) {
  const colour = STATUS_COLOURS[status];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: `${colour}CC`,
        backgroundColor: colour,
        shadowColor: colour,
        shadowOpacity: status === 'inactive' ? 0 : 0.45,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 0 },
        elevation: 2,
      }}
    />
  );
}

function Screw({ top, bottom, left, right, size }: { top?: number; bottom?: number; left?: number; right?: number; size: number }) {
  return (
    <View
      style={{
        position: 'absolute',
        top,
        bottom,
        left,
        right,
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: '#606770',
        backgroundColor: '#BFC4CA',
      }}
    >
      <View style={{ position: 'absolute', width: size * 0.55, height: 1, backgroundColor: '#4A4F56' }} />
      <View style={{ position: 'absolute', width: 1, height: size * 0.55, backgroundColor: '#4A4F56' }} />
    </View>
  );
}

function ModuleGlyph({ kind, accent, size }: { kind: VisualKind; accent: string; size: number }) {
  if (kind === 'vibration') {
    return (
      <Svg width={28 * size} height={15 * size} viewBox="0 0 28 15">
        <Path d="M1 8 H6 L8 4 L11 12 L14 2 L17 11 L20 6 L22 8 H27" fill="none" stroke={accent} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  if (kind === 'process') {
    return (
      <Svg width={27 * size} height={16 * size} viewBox="0 0 27 16">
        <Line x1="5" y1="8" x2="22" y2="8" stroke={accent} strokeWidth={1.4} />
        <Circle cx="5" cy="8" r="2.5" fill={accent} />
        <Circle cx="13.5" cy="8" r="2.5" fill={accent} />
        <Circle cx="22" cy="8" r="2.5" fill={accent} />
      </Svg>
    );
  }
  if (kind === 'speed-keyphasor') {
    return (
      <Svg width={28 * size} height={17 * size} viewBox="0 0 28 17">
        <Path d="M4 13 A10 10 0 0 1 24 13" fill="none" stroke={accent} strokeWidth={1.5} strokeLinecap="round" />
        <Line x1="14" y1="12" x2="20" y2="6" stroke={accent} strokeWidth={1.8} strokeLinecap="round" />
        <Circle cx="14" cy="12" r="2" fill={accent} />
      </Svg>
    );
  }
  return (
    <Svg width={28 * size} height={18 * size} viewBox="0 0 28 18">
      <Line x1="7" y1="9" x2="21" y2="4" stroke={accent} strokeWidth={1.4} />
      <Line x1="7" y1="9" x2="21" y2="14" stroke={accent} strokeWidth={1.4} />
      <Circle cx="7" cy="9" r="3" fill={accent} />
      <Circle cx="21" cy="4" r="3" fill={accent} />
      <Circle cx="21" cy="14" r="3" fill={accent} />
    </Svg>
  );
}

function PeakWaistBackground({
  slot,
  accent,
  isDark,
  width,
  height,
  empty = false,
}: {
  slot: number;
  accent: string;
  isDark: boolean;
  width: number;
  height: number;
  empty?: boolean;
}) {
  // A grey/silver face reads as real brushed-metal hardware, regardless of
  // the app's light/dark theme — like a photographed module.
  const faceStart = empty ? (isDark ? '#171C23' : '#D9DCE0') : '#D6D9DC';
  const faceEnd = empty ? (isDark ? '#0F1319' : '#C2C6CB') : '#AEB3B9';

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${BASE_WIDTH} ${BASE_HEIGHT}`} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id={`outer-frame-${slot}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4D535B" />
          <Stop offset="0.45" stopColor="#171B20" />
          <Stop offset="1" stopColor="#080A0D" />
        </LinearGradient>
        <LinearGradient id={`inner-face-${slot}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={faceStart} />
          <Stop offset="1" stopColor={faceEnd} />
        </LinearGradient>
      </Defs>

      <Path d={OUTER_CARD_PATH} fill={`url(#outer-frame-${slot})`} stroke={empty ? '#59616B' : '#717780'} strokeWidth={1} />

      <Path
        d={INNER_CARD_PATH}
        fill={`url(#inner-face-${slot})`}
        stroke={empty ? '#59616B' : '#C5C9CE'}
        strokeWidth={1}
        strokeDasharray={empty ? '4 3' : undefined}
      />

      {!empty && <Path d="M16 17 L36 8 L56 17" fill="none" stroke={accent} strokeWidth={1.8} strokeLinecap="round" opacity={0.9} />}
    </Svg>
  );
}

function EmptySlotCard({
  slot,
  isDark,
  width,
  height,
  editable,
  onPress,
}: {
  slot: number;
  isDark: boolean;
  width: number;
  height: number;
  editable: boolean;
  onPress: (event: GestureResponderEvent) => void;
}) {
  const s = width / BASE_WIDTH;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Add card to slot ${slot}`}
      onPress={editable ? onPress : undefined}
      style={({ pressed }) => ({ width, height, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] })}
    >
      <PeakWaistBackground slot={slot} accent="#64748B" isDark={isDark} width={width} height={height} empty />

      {editable && <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: 25 * s,
            height: 25 * s,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 13 * s,
            borderWidth: 1,
            borderColor: isDark ? '#66707C' : '#747D87',
          }}
        >
          <Text style={{ color: isDark ? '#AEB7C2' : '#59616B', fontSize: 20 * s, fontWeight: '300', lineHeight: 22 * s }}>+</Text>
        </View>

        <Text
          style={{
            marginTop: 8 * s,
            color: isDark ? '#89929E' : '#68717C',
            fontSize: 8 * s,
            fontWeight: '600',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Empty
        </Text>
      </View>}
    </Pressable>
  );
}

function InstalledSlotCard({
  slot,
  card,
  device,
  live,
  isDark,
  width,
  height,
  editable,
  onPress,
  onContextMenu,
}: {
  slot: number;
  card: CardNode;
  device?: DeviceNode;
  live?: LiveState;
  isDark: boolean;
  width: number;
  height: number;
  editable: boolean;
  onPress: (event: GestureResponderEvent) => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const kind = useMemo(() => kindFor(card.type), [card.type]);
  const config = CARD_CONFIG[kind];
  const pointLabels = useMemo(() => pointLabelsFor(card), [card]);
  const pointStatuses = useMemo(() => pointStatusesFor(card, device, live, pointLabels.length), [card, device, live, pointLabels.length]);
  const status = aggregateStatus(pointStatuses);
  const s = width / BASE_WIDTH;
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!editable || Platform.OS !== 'web') return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      onContextMenu(e.pageX, e.pageY);
    };
    node.addEventListener('contextmenu', handler);
    return () => node.removeEventListener('contextmenu', handler);
  }, [editable, onContextMenu]);

  const textColour = '#161A1F';

  return (
    <View ref={ref}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${config.title} card in slot ${slot}`}
        onPress={editable ? onPress : undefined}
        style={({ pressed }) => ({
          width,
          height,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
          shadowColor: '#000000',
          shadowOpacity: 0.28,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 4 },
          elevation: 5,
        })}
      >
      <PeakWaistBackground slot={slot} accent={textColour} isDark={isDark} width={width} height={height} />

      <Screw top={18 * s} left={12 * s} size={9 * s} />
      <Screw top={18 * s} right={12 * s} size={9 * s} />
      <Screw bottom={17 * s} left={12 * s} size={9 * s} />
      <Screw bottom={17 * s} right={12 * s} size={9 * s} />

      <View style={{ position: 'absolute', top: 20 * s, right: 11 * s, bottom: 29 * s, left: 11 * s, alignItems: 'center' }}>
        <ModuleGlyph kind={kind} accent={textColour} size={s} />

        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{ width: '100%', marginTop: 6 * s, color: textColour, fontSize: 8 * s, fontWeight: '800', textAlign: 'center', letterSpacing: 0 }}
        >
          {config.defaultModel}
        </Text>

        <View style={{ width: 34 * s, height: 1, marginTop: 6 * s, marginBottom: 7 * s, backgroundColor: textColour, opacity: 0.7 }} />

        {/* Every row is pinned to the same fixed-width column and centered as
            a block, so the LED sits at an identical x regardless of how long
            each row's label text is — keeping all LEDs in a straight line. */}
        <View style={{ width: '100%', alignItems: 'center' }}>
          <View style={{ width: '72%', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', marginBottom: 7 * s }}>
            <StatusLed status={status} size={LED_SIZE * s} />
            <Text numberOfLines={1} style={{ marginLeft: 6 * s, color: textColour, fontSize: 7.2 * s, fontWeight: '800', letterSpacing: 0.35 }}>
              {STATUS_LABELS[status]}
            </Text>
          </View>

          <View style={{ width: '72%', gap: 6 * s }}>
            {pointLabels.map((label, index) => (
              <View key={index} style={{ flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center' }}>
                <StatusLed status={pointStatuses[index] ?? 'inactive'} size={LED_SIZE * s} />
                <Text numberOfLines={1} style={{ marginLeft: 6 * s, color: textColour, fontSize: 7 * s, fontWeight: '600', letterSpacing: 0.15 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ position: 'absolute', bottom: 4 * s, alignItems: 'center' }}>
          <Text style={{ color: textColour, fontSize: 6.4 * s, fontWeight: '800', letterSpacing: 0.7 }}>{config.shortTitle}</Text>
        </View>
      </View>
      </Pressable>
    </View>
  );
}

export function SlotCard({ slot, card, device, live, width, editable = true, onPressEmpty, onPressCard }: SlotCardProps) {
  const { isDark } = useAppTheme();
  const height = width * (BASE_HEIGHT / BASE_WIDTH);

  if (!card) {
    return (
      <EmptySlotCard
        slot={slot}
        isDark={isDark}
        width={width}
        height={height}
        editable={editable}
        onPress={(event) => {
          const { x, y } = getPressCoordinates(event);
          onPressEmpty(x, y);
        }}
      />
    );
  }

  return (
    <InstalledSlotCard
      slot={slot}
      card={card}
      device={device}
      live={live}
      isDark={isDark}
      width={width}
      height={height}
      editable={editable}
      onPress={(event) => {
        const { x, y } = getPressCoordinates(event);
        onPressCard(x, y);
      }}
      onContextMenu={(x, y) => onPressCard(x, y)}
    />
  );
}
