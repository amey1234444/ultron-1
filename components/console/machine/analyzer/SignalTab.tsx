/**
 * SIGNAL — live values and limits, in one table.
 *
 * Signals and Limits used to be two screens. They answered halves of the same
 * question — *what is this sensor reading, and is it inside its limits* — and
 * splitting them meant an operator checking a value had to leave the table to
 * find out whether it mattered. They are one table now, and the expanded row
 * carries the rest: the acquisition chain, the data-quality verdict, and the
 * way through to the part that owns the signal.
 *
 * This screen is **monitoring, not reasoning**. It never repeats a diagnosis;
 * it says what the sensors read and whether that is inside the configured
 * limits, and hands off to Advance Diagnosis for why.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import {
  BEHAVIOUR_LABEL,
  KIND_LABEL,
  type MachinePart,
  type SignalStatus,
  type SignalView,
} from '../../../../lib/analysis/extruder';
import { Badge, consolePalette, variantStyle, type Variant } from '../../../ui';
import { Block, EmptyNote, ExpandableRow, Fact, PressSurface, TagTrend } from './AnalyzerParts';


const STATUS_VARIANT: Record<SignalStatus, Variant> = {
  NORMAL: 'success',
  WARNING: 'warning',
  ALARM: 'destructive',
  UNAVAILABLE: 'muted',
  NOT_MAPPED: 'muted',
};

const STATUS_LABEL: Record<SignalStatus, string> = {
  NORMAL: 'Normal',
  WARNING: 'Warning',
  ALARM: 'Critical',
  UNAVAILABLE: 'No reading',
  NOT_MAPPED: 'Not mapped',
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

/** A column header row, so the dense rows below are readable as a table. */
function HeaderRow({ wide }: { wide: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const cell = 'font-mono text-[8.5px] uppercase tracking-[0.15em]';

  if (!wide) return null;

  return (
    <View
      className="flex-row items-center gap-2.5 px-3.5 py-1.5"
      style={{ backgroundColor: palette.panelRaised, borderBottomWidth: 1, borderBottomColor: palette.line }}
    >
      <Text className={cell} style={{ color: palette.inkFaint, width: 176 }}>
        Sensor
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 92 }}>
        Current
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 86 }}>
        Reference
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 104 }}>
        Behaviour
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 78 }}>
        Warning
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 78 }}>
        Critical
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 84 }}>
        Status
      </Text>
      <Text className={cell} style={{ color: palette.inkFaint, width: 62 }}>
        Updated
      </Text>
      <View style={{ width: 15 }} />
    </View>
  );
}

function SignalRowSummary({ signal, wide }: { signal: SignalView; wide: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const variant = STATUS_VARIANT[signal.status];
  const accent = variantStyle(palette, variant).accent;
  const valueColour = signal.status === 'NORMAL' || signal.status === 'UNAVAILABLE' ? palette.ink : accent;

  const name = (
    <View style={wide ? { width: 176 } : undefined} className="min-w-0">
      <Text className="font-body-bold text-[12px]" style={{ color: palette.ink }} numberOfLines={1}>
        {signal.measures}
      </Text>
      <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }} numberOfLines={1}>
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
        <View className="flex-row flex-wrap gap-x-4 gap-y-1">
          <Fact label="Current" value={formatValue(signal.value, signal.unit)} width={98} tone={valueColour} />
          <Fact label="Reference" value={formatValue(signal.reference, signal.unit)} width={98} />
          <Fact label="Behaviour" value={BEHAVIOUR_LABEL[signal.behaviour]} mono={false} width={104} />
          <Fact label="Warning" value={formatLimit(signal.warningLimit, signal.unit)} width={92} />
          <Fact label="Critical" value={formatLimit(signal.criticalLimit, signal.unit)} width={92} />
        </View>
      </View>
    );
  }

  const cellText = 'font-mono text-[11px]';

  return (
    <View className="flex-row items-center gap-2.5">
      {name}
      <Text className={cellText} style={{ color: valueColour, width: 92, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {formatValue(signal.value, signal.unit)}
      </Text>
      <Text className={cellText} style={{ color: palette.inkMuted, width: 86, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {formatValue(signal.reference, signal.unit)}
      </Text>
      <Text className="font-body text-[11px]" style={{ color: palette.inkMuted, width: 104 }} numberOfLines={1}>
        {BEHAVIOUR_LABEL[signal.behaviour]}
      </Text>
      <Text className={cellText} style={{ color: palette.inkMuted, width: 78, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {formatLimit(signal.warningLimit, '')}
      </Text>
      <Text className={cellText} style={{ color: palette.inkMuted, width: 78, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {formatLimit(signal.criticalLimit, '')}
      </Text>
      <View style={{ width: 84 }}>
        <Badge variant={variant} icon={null} outline>
          {STATUS_LABEL[signal.status]}
        </Badge>
      </View>
      <Text className="font-mono text-[10px]" style={{ color: palette.inkFaint, width: 62 }} numberOfLines={1}>
        {signal.updated}
      </Text>
    </View>
  );
}

function SignalRowDetail({ signal, onOpenPart }: { signal: SignalView; onOpenPart: (part: MachinePart) => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent =
    signal.status === 'ALARM' ? palette.critical : signal.status === 'WARNING' ? palette.warning : palette.accent;

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center gap-x-5 gap-y-2">
        <Fact label="Measures" value={signal.measures} mono={false} width={170} />
        <Fact label="Kind" value={KIND_LABEL[signal.kind]} mono={false} width={96} />
        <Fact label="Mapped point" value={signal.point} mono={false} width={190} />
        <Fact label="Source" value={signal.source} mono={false} width={96} />
      </View>

      {/* Limits: the two authorities, kept apart. */}
      <View className="flex-row flex-wrap items-center gap-x-5 gap-y-2">
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
        <Fact label="Reference" value={formatValue(signal.reference, signal.unit)} width={110} />
      </View>

      {signal.processLimit ? (
        <Text className="font-body text-[10.5px] leading-[14px]" style={{ color: palette.inkFaint }}>
          The warning and critical limits are configured on the rack channel. {signal.processLimit.name} is the model&apos;s own
          registered engineering constraint and is evaluated separately.
        </Text>
      ) : null}

      {/* Where it physically comes from. */}
      <View className="flex-row flex-wrap items-center gap-x-5 gap-y-2">
        <Fact label="Acquisition" value={signal.channel} mono width={280} />
        <Fact label="Data quality" value={signal.quality.toLowerCase()} mono={false} width={112} />
        <Fact label="Updated" value={signal.updated} mono={false} width={96} />
      </View>

      {signal.qualityNotes.length > 0 ? (
        <View className="gap-1">
          {signal.qualityNotes.map((note, index) => (
            <Text key={index} className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
              {note}
            </Text>
          ))}
        </View>
      ) : null}

      <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
        {signal.behaviourDetail}
      </Text>

      {signal.history.length > 0 ? (
        <View className="items-start rounded-lg border px-3 py-2.5" style={{ borderColor: palette.line }}>
          <TagTrend values={signal.history} colour={accent} width={300} height={44} />
        </View>
      ) : null}

      {/* The only handoff on this screen. Monitoring asks "is it in limits";
          the answer to "why" lives one tab across, on the part that owns it. */}
      <PressSurface
        onPress={() => onOpenPart(signal.part)}
        accessibilityLabel={`Open ${signal.part} in Advance Diagnosis`}
        className="flex-row items-center justify-between self-start rounded-xl border px-2.5 py-1.5"
        style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
      >
        <Text className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkMuted }}>
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
  wide,
  onOpenPart,
  provenance,
  filter,
  query,
}: {
  signals: SignalView[];
  /** Mapped points the model could not use, with the reason. */
  unconsumed: { label: string; reason: string }[];
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

  // The four counts used to head this screen as a strip of tiles AND sit inside
  // the filter chips underneath. They are the same four numbers, so only the
  // chips keep them - a count you can press to act on it beats a count you
  // cannot.
  return (
    <View>
      <Block
        first
        title="Live signals"
        meta="Current value, reference, behaviour and configured limits. Open a row for its limits, quality and acquisition chain."
        padded={false}
        footnote={provenance}
      >
        <HeaderRow wide={wide} />
        {visible.length === 0 ? (
          <EmptyNote>No signal matches this filter.</EmptyNote>
        ) : (
          visible.map((signal, index) => {
            const key = `${signal.tag}-${signal.point}`;
            const variant = STATUS_VARIANT[signal.status];
            return (
              <ExpandableRow
                key={key}
                first={index === 0}
                expanded={expanded === key}
                onToggle={() => setExpanded((current) => (current === key ? null : key))}
                accessibilityLabel={`${signal.measures}, ${STATUS_LABEL[signal.status]}`}
                tone={signal.status === 'NORMAL' || signal.status === 'UNAVAILABLE' ? undefined : variantStyle(palette, variant).accent}
                summary={<SignalRowSummary signal={signal} wide={wide} />}
                detail={<SignalRowDetail signal={signal} onOpenPart={onOpenPart} />}
              />
            );
          })
        )}
      </Block>

      {unconsumed.length > 0 ? (
        <Block
          title="Mapped points the model did not read"
          meta="Wired on the canvas but not resolved onto a diagnostic tag, so nothing on this machine is measuring what they were meant to."
          accent="warning"
        >
          <View>
            {unconsumed.map((item, index) => (
              <View
                key={`${item.label}-${index}`}
                className="py-2"
                style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
              >
                <Text className="font-body-bold text-[11.5px]" style={{ color: palette.ink }}>
                  {item.label}
                </Text>
                <Text className="mt-0.5 font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
                  {item.reason}
                </Text>
              </View>
            ))}
          </View>
        </Block>
      ) : null}
    </View>
  );
}
