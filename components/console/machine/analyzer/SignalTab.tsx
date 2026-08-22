/**
 * SIGNALS — what every sensor reads, and where that reading comes from.
 *
 * Three screens collapsed into this one. Signals and Limits answered halves of
 * the same question — *what is this sensor reading, and is it inside its
 * limits* — and were merged into one table. Connectivity answered the question
 * directly underneath it — *which piece of hardware produced that number* — and
 * is now the second half of the same expanded row.
 *
 * Keeping it a separate tab meant two tables, one row per signal and one row
 * per mapped point, listing overlapping sets of the same things: a reader
 * chasing a suspicious reading had to find the same sensor twice, once by what
 * it measures and once by where it is wired. There is one row per sensor now.
 * Open it and the top half is the reading, the bottom half is the chain that
 * delivered it, down to the physical card drawn as the rack draws it.
 *
 * This screen is **monitoring, not reasoning**. It never repeats a diagnosis;
 * it says what the sensors read, whether that is inside the configured limits,
 * and what hardware is behind it — then hands off to Advance Diagnosis for why.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { relativeAge, type ConnectionQuality, type ParameterConnection } from '../../../../lib/analysis/connectivity';
import {
  BEHAVIOUR_LABEL,
  KIND_LABEL,
  type MachinePart,
  type SignalStatus,
  type SignalView,
} from '../../../../lib/analysis/extruder';
import { cn } from '../../../../lib/cn';
import type { DeviceNode } from '../../../../lib/devices';
import type { LiveState } from '../../../../lib/liveTelemetry';
import type { CardNode } from '../../../../lib/rack';
import { severityRamp, type Severity } from '../../../../lib/severity';
import { alpha, Badge, consolePalette, tabular, text, variantStyle, type Variant } from '../../../ui';
import { SlotCard } from '../../rack/SlotCard';
import { Block, EmptyState, ExpandableRow, Fact, MarginBar, PressSurface, TagTrend } from './AnalyzerParts';

/**
 * A reading's status, on the analysis layer's severity ramp.
 *
 * The findings list uses the ramp to classify what *kind of claim* is being
 * made — a matched signature is red, a breached hard limit amber, a crossed
 * reference slate. This table is not making claims; it is reporting readings
 * against the limits configured on their own channels, so it uses the same
 * hues as a severity ladder: critical limit red, warning limit amber, inside
 * limits green. Slate does not appear here because a channel limit is a limit,
 * not a reference.
 *
 * A reading with no severity at all — never mapped, or not reporting — takes
 * no ramp. `null` is the honest answer, and the palette's muted ink renders it.
 */
const STATUS_SEVERITY: Record<SignalStatus, Severity | null> = {
  NORMAL: 'advisory',
  WARNING: 'limit',
  ALARM: 'fault',
  UNAVAILABLE: null,
  NOT_MAPPED: null,
};

const STATUS_VARIANT: Record<SignalStatus, Variant> = {
  NORMAL: 'success',
  WARNING: 'warning',
  ALARM: 'destructive',
  UNAVAILABLE: 'muted',
  NOT_MAPPED: 'muted',
};

/**
 * The 2px status edge on a table row.
 *
 * Only rows that are actually outside a limit get one. Painting the edge on a
 * normal row would put a coloured stripe down every line of the table, and a
 * marker that is always present marks nothing.
 */
function rowTone(isDark: boolean, status: SignalStatus): string | undefined {
  const severity = STATUS_SEVERITY[status];
  if (!severity || severity === 'advisory') return undefined;
  return severityRamp(isDark)[severity].dot;
}

const STATUS_LABEL: Record<SignalStatus, string> = {
  NORMAL: 'Normal',
  WARNING: 'Warning',
  ALARM: 'Critical',
  UNAVAILABLE: 'No reading',
  NOT_MAPPED: 'Not mapped',
};

const QUALITY_VARIANT: Record<ConnectionQuality, Variant> = {
  good: 'success',
  warning: 'warning',
  bad: 'destructive',
  offline: 'muted',
};

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  good: 'Live',
  warning: 'Degraded',
  bad: 'Bad',
  offline: 'Silent',
};

export type SignalFilter = 'all' | 'attention' | 'nolimit' | 'unmapped';

export const SIGNAL_FILTERS: { value: SignalFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'attention', label: 'Attention' },
  { value: 'nolimit', label: 'No limit' },
  { value: 'unmapped', label: 'Unmapped' },
];

/**
 * How many rows each filter would show.
 *
 * Computed here rather than in the shell so the counts on the chips and the
 * rows they reveal can never disagree — one predicate, used by both.
 */
export function signalFilterCounts(signals: SignalView[]): Record<SignalFilter, number> {
  return {
    all: signals.length,
    attention: signals.filter((signal) => signal.status === 'WARNING' || signal.status === 'ALARM').length,
    nolimit: signals.filter((signal) => !signal.missing && signal.warningLimit === null && signal.criticalLimit === null)
      .length,
    unmapped: signals.filter((signal) => signal.status === 'NOT_MAPPED').length,
  };
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const decimals = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

function formatLimit(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return 'Not set';
  return formatValue(value, unit);
}

/** A small rule that opens a half of the expanded row. */
function DetailHeading({ children }: { children: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <Text className={text.label} style={{ color: palette.inkFaint }}>
      {children}
    </Text>
  );
}

/** One hop of the acquisition chain. Reads left to right, the way the signal travels. */
function Hop({
  label,
  value,
  icon,
  tone,
  last = false,
}: {
  label: string;
  value: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tone?: string;
  last?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View className="flex-row items-center">
      <View
        className="min-w-0 rounded-[10px] border px-2.5 py-1.5"
        style={{ borderColor: tone ? alpha(tone, 0.35) : palette.line, backgroundColor: palette.panel }}
      >
        <View className="flex-row items-center gap-1.5">
          <MaterialCommunityIcons name={icon} size={11} color={tone ?? palette.inkFaint} />
          <Text className={text.label} style={{ color: palette.inkFaint }}>
            {label}
          </Text>
        </View>
        <Text className={cn('mt-0.5', text.data)} style={{ color: palette.ink }} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {last ? null : (
        <MaterialCommunityIcons name="chevron-right" size={14} color={palette.inkFaint} style={{ marginHorizontal: 3 }} />
      )}
    </View>
  );
}

/**
 * The hardware behind one reading.
 *
 * The chain as hops, then the physical slot card drawn at the size the rack
 * view draws it — so "slot 05" is a card an engineer can recognise on the floor
 * rather than a number in a table.
 */
function Acquisition({
  connection,
  device,
  card,
  live,
}: {
  connection: ParameterConnection;
  device: DeviceNode | undefined;
  card: CardNode | null;
  live?: LiveState;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, QUALITY_VARIANT[connection.quality]);
  const unmapped = connection.state === 'unmapped';

  return (
    <View className="gap-2.5">
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5">
        <DetailHeading>Acquisition</DetailHeading>
        <View className="rounded-full px-2 py-[3px]" style={{ backgroundColor: style.tint }}>
          <Text className={text.chip} style={{ color: style.accent }}>
            {QUALITY_LABEL[connection.quality]}
          </Text>
        </View>
        <Text className={text.meta} style={{ color: palette.inkFaint }}>
          {relativeAge(connection.lastUpdatedAt)}
        </Text>
      </View>

      {unmapped ? (
        <Text className={text.body} style={{ color: palette.warning }}>
          {connection.note}
        </Text>
      ) : (
        <>
          <View className="flex-row flex-wrap items-center gap-y-1.5">
            <Hop
              label="Gateway"
              value={connection.gatewayName}
              icon="router-wireless"
              tone={connection.gatewayOnline ? palette.accent : palette.neutral}
            />
            <Hop
              label="Rack"
              value={connection.rackName}
              icon="server"
              tone={connection.rackOnline ? palette.accent : palette.neutral}
            />
            <Hop label="Slot" value={String(connection.slot).padStart(2, '0')} icon="card-outline" />
            <Hop label="Channel" value={connection.channelCode} icon="access-point" />
            <Hop label="Terminal" value={connection.inputId} icon="power-plug-outline" last />
          </View>

          <View className="flex-row flex-wrap items-start gap-5 pt-0.5">
            <View className="items-center gap-2">
              <SlotCard
                slot={connection.slot}
                card={card}
                device={device}
                live={live}
                width={82}
                editable={false}
                onPressEmpty={() => {}}
                onPressCard={() => {}}
              />
              <Text className={text.code} style={{ color: palette.inkFaint }}>
                Slot {String(connection.slot).padStart(2, '0')}
              </Text>
            </View>

            <View className="min-w-[220px] flex-1 flex-row flex-wrap gap-x-5 gap-y-2">
              <Fact label="Mapped point" value={connection.parameter} mono={false} width={168} />
              <Fact label="Card" value={connection.cardType} mono={false} width={132} />
              <Fact label="Signal type" value={connection.signalType} mono={false} width={104} />
              <Fact label="Carries" value={connection.dataType} mono={false} width={112} />
              <Fact label="Channel id" value={connection.channelId} width={104} />
            </View>
          </View>

          {connection.note ? (
            <Text className={text.body} style={{ color: palette.inkMuted }}>
              {connection.note}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** A column header row, so the dense rows below are readable as a table. */
function HeaderRow({ wide }: { wide: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const cell = text.label;

  if (!wide) return null;

  return (
    <View
      className="flex-row items-center gap-2.5 px-3.5 py-1.5"
      style={{ backgroundColor: palette.panelRaised, borderBottomWidth: 1, borderBottomColor: palette.line }}
    >
      <Text className={cell} style={{ color: palette.inkFaint, width: 176 }}>
        Sensor
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 96 }}>
        Current
      </Text>
      {/* The two limit columns became one picture. See `MarginBar`. */}
      <Text className={cell} style={{ color: palette.inkFaint, flex: 1, minWidth: 132 }}>
        Against limits
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 96 }}>
        Behaviour
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 84 }}>
        Status
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 74 }}>
        Wired to
      </Text>
      <View style={{ width: 15 }} />
    </View>
  );
}

function SignalRowSummary({
  signal,
  connection,
  wide,
}: {
  signal: SignalView;
  connection: ParameterConnection | undefined;
  wide: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const variant = STATUS_VARIANT[signal.status];
  // The severity ramp owns the hue; `variant` survives only for the Badge,
  // which is a kit component with its own variant vocabulary.
  const severity = STATUS_SEVERITY[signal.status];
  const accent = severity ? severityRamp(isDark)[severity].dot : palette.inkFaint;
  const valueColour = signal.status === 'NORMAL' || signal.status === 'UNAVAILABLE' ? palette.ink : accent;

  // Where it is wired, in the shortest form that still locates it: the rack's
  // own channel code and its slot. The full chain is one press away.
  const wiredTo =
    connection && connection.state !== 'unmapped'
      ? `${connection.channelCode} · S${String(connection.slot).padStart(2, '0')}`
      : '—';

  const name = (
    <View style={wide ? { width: 176 } : undefined} className="min-w-0">
      <Text className={text.bodyStrong} style={{ color: palette.ink }} numberOfLines={1}>
        {signal.measures}
      </Text>
      {/* The tag and the part it sits on. An identifier, so `code` — and no
          longer tracked capitals, which at this size turned every row's second
          line into a second heading. */}
      <Text className={text.code} style={{ color: palette.inkFaint }} numberOfLines={1}>
        {signal.tag} · {signal.part}
      </Text>
    </View>
  );

  if (!wide) {
    // Narrow: the same fields as a card, so a phone gets the whole row rather
    // than a horizontally scrolled table.
    return (
      <View className="gap-1.5">
        <View className="flex-row items-start justify-between gap-2">
          {name}
          <Badge variant={variant} icon={null} outline>
            {STATUS_LABEL[signal.status]}
          </Badge>
        </View>
        <MarginBar
          value={signal.value}
          history={signal.history}
          warningLimit={signal.warningLimit}
          criticalLimit={signal.criticalLimit}
          variant={variant}
        />
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          <Fact label="Current" value={formatValue(signal.value, signal.unit)} width={98} tone={valueColour} />
          <Fact label="Behaviour" value={BEHAVIOUR_LABEL[signal.behaviour]} mono={false} width={104} />
          <Fact label="Wired to" value={wiredTo} width={98} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-2.5">
      {name}
      <Text className={text.data} style={[tabular, { color: valueColour, width: 96 }]} numberOfLines={1}>
        {formatValue(signal.value, signal.unit)}
      </Text>
      {/* Where that number sits against the limits that judge it. The exact
          warning and critical figures are one press away, in the expanded row;
          on a table you are scanning, the position is the answer. */}
      <View style={{ flex: 1, minWidth: 132 }}>
        <MarginBar
          value={signal.value}
          history={signal.history}
          warningLimit={signal.warningLimit}
          criticalLimit={signal.criticalLimit}
          variant={variant}
        />
      </View>
      <Text className={text.body} style={{ color: palette.inkMuted, width: 96 }} numberOfLines={1}>
        {BEHAVIOUR_LABEL[signal.behaviour]}
      </Text>
      <View style={{ width: 84 }}>
        <Badge variant={variant} icon={null} outline>
          {STATUS_LABEL[signal.status]}
        </Badge>
      </View>
      <Text className={text.code} style={{ color: palette.inkFaint, width: 74 }} numberOfLines={1}>
        {wiredTo}
      </Text>
    </View>
  );
}

function SignalRowDetail({
  signal,
  connection,
  device,
  card,
  live,
  onOpenPart,
}: {
  signal: SignalView;
  connection: ParameterConnection | undefined;
  device: DeviceNode | undefined;
  card: CardNode | null;
  live?: LiveState;
  onOpenPart: (part: MachinePart) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent =
    signal.status === 'ALARM' ? palette.critical : signal.status === 'WARNING' ? palette.warning : palette.accent;

  return (
    <View className="gap-3.5">
      {/* The reading, and the two authorities that judge it. */}
      <View className="gap-2">
        <DetailHeading>Reading</DetailHeading>
        <View className="flex-row flex-wrap items-center gap-x-5 gap-y-2">
          <Fact label="Kind" value={KIND_LABEL[signal.kind]} mono={false} width={96} />
          <Fact label="Reference" value={formatValue(signal.reference, signal.unit)} width={110} />
          <Fact label="Warning limit" value={formatLimit(signal.warningLimit, signal.unit)} width={118} />
          <Fact label="Critical limit" value={formatLimit(signal.criticalLimit, signal.unit)} width={118} />
          <Fact
            label="Process constraint"
            value={
              signal.processLimit
                ? `${signal.processLimit.operator} ${signal.processLimit.limit} ${signal.processLimit.unit}`
                : 'None registered'
            }
            width={150}
          />
          <Fact label="Data quality" value={signal.quality.toLowerCase()} mono={false} width={112} />
        </View>

        {signal.processLimit ? (
          <Text className={text.micro} style={{ color: palette.inkFaint }}>
            The warning and critical limits are configured on the rack channel. {signal.processLimit.name} is the
            model&apos;s own registered engineering constraint and is evaluated separately.
          </Text>
        ) : null}

        {signal.qualityNotes.length > 0 ? (
          <View className="gap-1">
            {signal.qualityNotes.map((note, index) => (
              <Text key={index} className={text.body} style={{ color: palette.inkMuted }}>
                {note}
              </Text>
            ))}
          </View>
        ) : null}

        <Text className={text.body} style={{ color: palette.inkMuted }}>
          {signal.behaviourDetail}
        </Text>

        {signal.history.length > 0 ? (
          <View className="items-start rounded-[6px] border px-3 py-2.5" style={{ borderColor: palette.line }}>
            <TagTrend values={signal.history} colour={accent} width={300} height={44} />
          </View>
        ) : null}
      </View>

      {/* Where the number physically came from. */}
      {connection ? (
        <View style={{ borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12 }}>
          <Acquisition connection={connection} device={device} card={card} live={live} />
        </View>
      ) : (
        <View style={{ borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 12 }} className="gap-1.5">
          <DetailHeading>Acquisition</DetailHeading>
          <Text className={text.body} style={{ color: palette.inkMuted }}>
            {signal.channel}
          </Text>
        </View>
      )}

      {/* The only handoff on this screen. Monitoring asks "is it in limits";
          the answer to "why" lives one tab across, on the part that owns it. */}
      <PressSurface
        onPress={() => onOpenPart(signal.part)}
        accessibilityLabel={`Open ${signal.part} in Advance Diagnosis`}
        className="flex-row items-center justify-between self-start rounded-[10px] border px-2.5 py-1.5"
        style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
      >
        <Text className={text.chip} style={{ color: palette.inkMuted }}>
          Open {signal.part} in Advance Diagnosis
        </Text>
        <MaterialCommunityIcons name="arrow-right" size={13} color={palette.inkFaint} style={{ marginLeft: 8 }} />
      </PressSurface>
    </View>
  );
}

export function SignalTab({
  signals,
  unconsumed,
  connectionByPoint,
  devices,
  cards,
  live,
  wide,
  onOpenPart,
  provenance,
  filter,
  query,
}: {
  signals: SignalView[];
  /** Mapped points the model could not use, with the reason. */
  unconsumed: { label: string; reason: string }[];
  /** The acquisition chain per canvas point label, joined onto `signal.point`. */
  connectionByPoint: Map<string, ParameterConnection>;
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  wide: boolean;
  onOpenPart: (part: MachinePart) => void;
  /**
   * Driven from the shell's toolbar row, beside the tabs.
   *
   * Every screen's controls sit in that one row, so a reader looks in one place
   * whichever screen is open — and this table keeps its full width instead of
   * spending a header band on its own controls.
   */
  filter: SignalFilter;
  query: string;
  /**
   * Model, rule-set and acquisition provenance, as one line.
   *
   * It is stated here and nowhere else. Acquisition is what this screen is
   * about, so the sentence that qualifies every number in the table belongs
   * under the table rather than repeated in the header of all three screens.
   */
  provenance: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return signals.filter((signal) => {
      if (filter === 'attention' && signal.status !== 'WARNING' && signal.status !== 'ALARM') return false;
      if (filter === 'nolimit' && (signal.missing || signal.warningLimit !== null || signal.criticalLimit !== null)) return false;
      if (filter === 'unmapped' && signal.status !== 'NOT_MAPPED') return false;
      if (!needle) return true;
      return [signal.measures, signal.tag, signal.point, signal.part, signal.unit]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [filter, query, signals]);

  return (
    <View>
      <Block
        first
        title="Live signals"
        meta="Current value, reference, behaviour and configured limits. Open a row for its limits, quality and the hardware chain behind the reading."
        padded={false}
        footnote={provenance}
      >
        <HeaderRow wide={wide} />
        {visible.length === 0 ? (
          <View className="px-4 py-4">
            <EmptyState
              icon="filter-remove-outline"
              title="No signal matches this filter"
              detail="Clear the filter or the search above to bring the rest of the table back."
            />
          </View>
        ) : (
          visible.map((signal, index) => {
            const key = `${signal.tag}-${signal.point}`;
            const variant = STATUS_VARIANT[signal.status];
            const connection = connectionByPoint.get(signal.point);
            return (
              <ExpandableRow
                key={key}
                first={index === 0}
                expanded={expanded === key}
                onToggle={() => setExpanded((current) => (current === key ? null : key))}
                accessibilityLabel={`${signal.measures}, ${STATUS_LABEL[signal.status]}`}
                tone={rowTone(isDark, signal.status)}
                summary={<SignalRowSummary signal={signal} connection={connection} wide={wide} />}
                detail={
                  <SignalRowDetail
                    signal={signal}
                    connection={connection}
                    device={devices.find((entry) => entry.id === connection?.rackId)}
                    card={
                      connection
                        ? cards.find((entry) => entry.deviceId === connection.rackId && entry.slot === connection.slot) ?? null
                        : null
                    }
                    live={live}
                    onOpenPart={onOpenPart}
                  />
                }
              />
            );
          })
        )}
      </Block>

      {/* Points that are wired on the canvas but produce nothing the model can
          use. They were a separate screen's problem when Connectivity was its
          own tab; they belong under the table of everything that DID resolve,
          because "what is missing" is only meaningful beside what is not. */}
      {unconsumed.length > 0 ? (
        <Block
          title="Mapped points the model did not read"
          meta="Wired on the canvas but not resolved onto a diagnostic tag, so nothing on this machine is measuring what they were meant to."
          accent="warning"
        >
          <View>
            {unconsumed.map((item, index) => {
              const connection = connectionByPoint.get(item.label);
              return (
                <View
                  key={`${item.label}-${index}`}
                  className="py-2"
                  style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
                >
                  <View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Text className={text.bodyStrong} style={{ color: palette.ink }}>
                      {item.label}
                    </Text>
                    {connection && connection.state !== 'unmapped' ? (
                      <Text className={text.code} style={{ color: palette.inkFaint }}>
                        {connection.rackName} · {connection.channelCode} · slot {String(connection.slot).padStart(2, '0')}
                      </Text>
                    ) : null}
                  </View>
                  <Text className={cn('mt-0.5', text.body)} style={{ color: palette.inkMuted }}>
                    {item.reason}
                  </Text>
                </View>
              );
            })}
          </View>
        </Block>
      ) : null}
    </View>
  );
}
