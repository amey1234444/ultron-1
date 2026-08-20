/**
 * ADVANCE DIAGNOSIS — the machine-part deep dive.
 *
 * Diagnosis answers *what is wrong*. This screen answers *why, and where*, and
 * it is organised by the physical machine rather than by the model's tags: an
 * operator walks to the gearbox, not to `V2`.
 *
 * Two things used to be pages of their own and are now contextual here, which
 * is the whole point of the redesign:
 *
 *  - **Evidence.** The reasoning behind a conclusion belongs beside the
 *    conclusion, not in a separate tab a user has to know to open.
 *  - **Signal analysis.** Trend, waveform, spectrum, envelope and the
 *    engineering features appear inside the part that owns the signal, and the
 *    tools offered depend on what kind of measurement it is. A temperature
 *    channel is structurally unable to show an FFT, so it is offered thermal
 *    tools instead of vibration tools greyed out.
 *
 * This component performs no analysis. Every state, cause, reasoning step and
 * behaviour string is computed in `lib/analysis/extruder/partView.ts` and
 * rendered here verbatim.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import {
  BEHAVIOUR_LABEL,
  KIND_LABEL,
  matchClassLabel,
  PART_FLOW,
  PART_ORDER,
  PART_STATE_LABEL,
  TOOLS_FOR_KIND,
  type AnalysisTool,
  type MachinePart,
  type PartState,
  type PartView,
  type SignalView,
} from '../../../../lib/analysis/extruder';
import { cn } from '../../../../lib/cn';
import { alpha, Badge, consolePalette, variantStyle, type Variant } from '../../../ui';
import { Block, EmptyNote, Fact, PressSurface, TagTrend } from './AnalyzerParts';


/**
 * A glyph per part.
 *
 * The part list was seven identical text chips; on a screen an operator scans
 * for "the gearbox", a shape is found faster than a word, and the icon is what
 * makes the row navigable at a glance rather than readable at a stop.
 */
const PART_ICON: Record<MachinePart, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Motor: 'engine-outline',
  Gearbox: 'cog-outline',
  'Screw / Drive': 'rotate-right',
  Hopper: 'silo-outline',
  Barrel: 'thermometer',
  'Melt / Process': 'water-outline',
  'Electrical / Power': 'flash-outline',
};

const STATE_VARIANT: Record<PartState, Variant> = {
  NORMAL: 'success',
  WATCH: 'warning',
  ATTENTION: 'warning',
  ALARM: 'destructive',
  FAULT: 'destructive',
  UNAVAILABLE: 'muted',
};

function formatValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const decimals = Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ''}`;
}

// ---------------------------------------------------------------------------
// Part navigation
// ---------------------------------------------------------------------------

/** A dot in the part's own state colour, so the chip row is scannable at a glance. */
function StateDot({ state, size = 6 }: { state: PartState; size?: number }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const accent = variantStyle(palette, STATE_VARIANT[state]).accent;
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: accent }} />;
}

function PartChips({
  parts,
  selected,
  onSelect,
}: {
  parts: PartView[];
  selected: MachinePart | null;
  onSelect: (part: MachinePart | null) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const byPart = new Map(parts.map((view) => [view.part, view]));

  const chip = (
    key: string,
    label: string,
    active: boolean,
    state: PartState | null,
    icon: keyof typeof MaterialCommunityIcons.glyphMap,
    onPress: () => void,
  ) => {
    const accent = state ? variantStyle(palette, STATE_VARIANT[state]).accent : palette.inkMuted;
    return (
      <PressSurface
        key={key}
        onPress={onPress}
        selected={active}
        accessibilityRole="tab"
        accessibilityLabel={state ? `${label}, ${PART_STATE_LABEL[state]}` : label}
        accent={palette.lineStrong}
        className="flex-row items-center gap-1.5 rounded-xl border px-2.5 py-1.5"
        style={{
          borderColor: active ? palette.lineStrong : palette.line,
          backgroundColor: active ? palette.panelRaised : palette.panel,
        }}
      >
        <MaterialCommunityIcons name={icon} size={13} color={active ? palette.ink : accent} />
        <Text
          className="font-mono text-[9.5px] uppercase tracking-[0.12em]"
          style={{ color: active ? palette.ink : palette.inkMuted }}
        >
          {label}
        </Text>
        {state ? <StateDot state={state} size={5} /> : null}
      </PressSurface>
    );
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
      {chip('all', 'All parts', selected === null, null, 'view-grid-outline', () => onSelect(null))}
      {PART_ORDER.map((part) =>
        chip(part, part, selected === part, byPart.get(part)?.state ?? 'UNAVAILABLE', PART_ICON[part], () =>
          onSelect(part),
        ),
      )}
    </ScrollView>
  );
}

/**
 * The material path, drawn as the machine rather than as a list.
 *
 * Hopper → Motor → Gearbox → Screw / Drive → Barrel → Melt / Process is the
 * order material actually travels, so a fault upstream of another one reads as
 * upstream. Electrical / Power is not in the path — it supplies the machine —
 * and is shown beside the strip instead of being forced into it.
 */
function ConditionStrip({ parts, onSelect }: { parts: PartView[]; onSelect: (part: MachinePart) => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const byPart = new Map(parts.map((view) => [view.part, view]));
  const supply = byPart.get('Electrical / Power');

  return (
    <View className="gap-2.5">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', gap: 0 }}>
        {PART_FLOW.map((part, index) => {
          const view = byPart.get(part);
          const state = view?.state ?? 'UNAVAILABLE';
          const style = variantStyle(palette, STATE_VARIANT[state]);
          return (
            <View key={part} className="flex-row items-center">
              {index > 0 ? (
                <MaterialCommunityIcons name="arrow-right" size={13} color={palette.inkFaint} style={{ marginHorizontal: 5 }} />
              ) : null}
              <PressSurface
                onPress={() => onSelect(part)}
                accent={style.accent}
                accessibilityLabel={`Open ${part}, ${PART_STATE_LABEL[state]}`}
                className="min-w-[124px] rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: state === 'NORMAL' ? palette.line : alpha(style.accent, 0.4),
                  backgroundColor: palette.panel,
                }}
              >
                <View
                  className="h-7 w-7 items-center justify-center rounded-lg"
                  style={{ backgroundColor: state === 'NORMAL' ? palette.panelRaised : alpha(style.accent, 0.12) }}
                >
                  <MaterialCommunityIcons name={PART_ICON[part]} size={15} color={style.accent} />
                </View>
                <Text className="mt-2 font-body-bold text-[11.5px]" style={{ color: palette.ink }} numberOfLines={1}>
                  {part}
                </Text>
                <View className="mt-0.5 flex-row items-center gap-1.5">
                  <StateDot state={state} size={5} />
                  <Text className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: style.accent }}>
                    {PART_STATE_LABEL[state]}
                  </Text>
                </View>
              </PressSurface>
            </View>
          );
        })}
      </ScrollView>

      {supply ? (
        <PressSurface
          onPress={() => onSelect('Electrical / Power')}
          accessibilityLabel="Open Electrical / Power"
          className="flex-row items-center gap-2 self-start rounded-xl border px-2.5 py-1.5"
          style={{ borderColor: palette.line, backgroundColor: palette.panel }}
        >
          <MaterialCommunityIcons name="flash-outline" size={13} color={palette.inkFaint} />
          <Text className="font-body text-[11px]" style={{ color: palette.ink }}>
            Electrical / Power
          </Text>
          <StateDot state={supply.state} size={5} />
          <Text className="font-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: palette.inkMuted }}>
            {PART_STATE_LABEL[supply.state]} · supplies the machine
          </Text>
        </PressSurface>
      ) : null}
    </View>
  );
}

/**
 * One part that is not normal, as a card on the entry screen.
 *
 * Only the parts that need a decision get a card. The strip above already
 * states every part's condition, so giving all seven a card printed the same
 * seven states twice on one screen; the cards now carry the thing the strip
 * cannot - what is actually wrong, in a sentence.
 */
function PartCard({ view, onOpen }: { view: PartView; onOpen: () => void }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const style = variantStyle(palette, STATE_VARIANT[view.state]);

  return (
    <PressSurface
      onPress={onOpen}
      accent={style.accent}
      accessibilityLabel={`Open ${view.part} deep dive`}
      className="min-w-[260px] flex-1 rounded-2xl border px-3.5 py-3"
      style={{ borderColor: alpha(style.accent, 0.4), backgroundColor: palette.panel }}
    >
      <View className="flex-row items-start gap-2.5">
        <View
          className="h-8 w-8 items-center justify-center rounded-xl"
          style={{ backgroundColor: alpha(style.accent, 0.12) }}
        >
          <MaterialCommunityIcons name={PART_ICON[view.part]} size={16} color={style.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start justify-between gap-2">
            <Text className="min-w-0 flex-1 font-body-bold text-[13px]" style={{ color: palette.ink }} numberOfLines={1}>
              {view.part}
            </Text>
            <Badge variant={STATE_VARIANT[view.state]} icon={null} outline>
              {PART_STATE_LABEL[view.state]}
            </Badge>
          </View>
          <Text
            className="mt-1 font-body text-[11.5px] leading-[16px]"
            style={{ color: palette.inkMuted }}
            numberOfLines={2}
          >
            {view.headline ?? 'No local fault pattern detected.'}
          </Text>
        </View>
      </View>
    </PressSurface>
  );
}

/**
 * A group of parts that need no card, collapsed onto one line.
 *
 * Parts with nothing to report and parts with nothing measuring them both take
 * one line each instead of a card each. Seven cards on a healthy machine was
 * seven restatements of the strip directly above them.
 */
function PartGroupLine({
  parts,
  title,
  badge,
  variant,
}: {
  parts: PartView[];
  title: string;
  badge: string;
  variant: Variant;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  if (parts.length === 0) return null;

  return (
    <View
      className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border px-3.5 py-2.5"
      style={{ borderColor: palette.line, backgroundColor: palette.panel }}
    >
      <Badge variant={variant} icon={null} outline>
        {badge}
      </Badge>
      <Text className="font-body-bold text-[12px]" style={{ color: palette.ink }}>
        {parts.length} {title}
      </Text>
      <Text className="min-w-0 flex-1 font-body text-[11.5px]" style={{ color: palette.inkMuted }} numberOfLines={1}>
        {parts.map((view) => view.part).join(', ')}
      </Text>
    </View>
  );
}


// ---------------------------------------------------------------------------
// Deep dive
// ---------------------------------------------------------------------------

/**
 * The five stages, drawn as the chain they are.
 *
 * It was a horizontally scrolling row, which clipped the conclusion — the one
 * stage a reader most wants — off the right edge on any window narrower than
 * the whole chain. The stages now wrap: each is a numbered node on a rail, and
 * a stage the measurements could not support is drawn hollow rather than faded,
 * so "not evaluated" is a state you can see rather than a low-contrast guess.
 */
function ReasoningChain({ view }: { view: PartView }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const last = view.reasoning.length - 1;

  return (
    <View className="flex-row flex-wrap" style={{ gap: 10 }}>
      {view.reasoning.map((step, index) => {
        const conclusion = index === last;
        const accent = conclusion && step.evaluated ? palette.accent : palette.inkMuted;
        return (
          <View
            key={step.key}
            className="rounded-xl border px-3 py-2.5"
            style={{
              flexGrow: 1,
              flexShrink: 1,
              flexBasis: 200,
              minWidth: 180,
              borderColor: conclusion ? alpha(accent, 0.35) : palette.line,
              backgroundColor: conclusion ? alpha(accent, 0.06) : palette.panelRaised,
            }}
          >
            <View className="flex-row items-center gap-2">
              {/* Filled node = the stage ran. Hollow = it could not be evaluated. */}
              <View
                className="h-4 w-4 items-center justify-center rounded-full"
                style={
                  step.evaluated
                    ? { backgroundColor: accent }
                    : { borderWidth: 1, borderColor: palette.lineStrong, backgroundColor: 'transparent' }
                }
              >
                <Text
                  className="font-mono text-[8px]"
                  style={{ color: step.evaluated ? palette.panel : palette.inkFaint, fontVariant: ['tabular-nums'] }}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                className="min-w-0 flex-1 font-mono text-[8.5px] uppercase tracking-[0.16em]"
                style={{ color: palette.inkFaint }}
                numberOfLines={1}
              >
                {step.label}
              </Text>
              {index < last ? (
                <MaterialCommunityIcons name="arrow-right" size={12} color={palette.inkFaint} />
              ) : null}
            </View>

            <Text
              className="mt-1.5 font-body-bold text-[12.5px] tracking-[-0.01em]"
              style={{ color: step.evaluated ? palette.ink : palette.inkMuted }}
              numberOfLines={2}
            >
              {step.value}
            </Text>
            <Text className="mt-1 font-body text-[10.5px] leading-[14px]" style={{ color: palette.inkMuted }}>
              {step.detail}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * The ranked hypotheses for this part.
 *
 * The score is an ORDINAL ENGINEERING MATCH SCORE and is never rendered as a
 * percentage: this machine has no calibrated fault-probability model, so a
 * number with a % sign beside it would be a fabricated confidence. The match
 * class carries the meaning; the score only orders the list.
 */
function CauseList({ view }: { view: PartView }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  if (view.causes.length === 0 && view.ruledOut.length === 0) {
    return <EmptyNote>No controlled fault signature is met on this part by the current measurements.</EmptyNote>;
  }

  const top = Math.max(1, ...view.causes.map((cause) => cause.score));

  return (
    <View>
      {view.causes.length === 0 ? (
        <EmptyNote>No controlled fault signature is met on this part by the current measurements.</EmptyNote>
      ) : null}
      {view.causes.map((cause, index) => {
        const variant: Variant =
          cause.matchClass === 'STRONG_CANDIDATE' ? 'destructive' : cause.matchClass === 'CANDIDATE' ? 'warning' : 'muted';
        const accent = variantStyle(palette, variant).accent;
        return (
          <View
            key={cause.faultId}
            className="py-2.5"
            style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="font-body-bold text-[12.5px]" style={{ color: palette.ink }}>
                  {cause.name}
                </Text>
                <Text className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                  {cause.faultId}
                </Text>
              </View>
              <Badge variant={variant} icon={null} outline>
                {matchClassLabel(cause.matchClass)}
              </Badge>
            </View>

            {/* Rank bar, not a confidence bar. Width is share-of-top-score. */}
            <View className="mt-2 h-[3px] overflow-hidden rounded-full" style={{ backgroundColor: palette.panelRaised }}>
              <View style={{ width: `${Math.round((cause.score / top) * 100)}%`, height: '100%', backgroundColor: accent }} />
            </View>

            {cause.primaryEvidence.length > 0 ? (
              <View className="mt-2 gap-1">
                {cause.primaryEvidence.slice(0, 3).map((line, evidenceIndex) => (
                  <View key={evidenceIndex} className="flex-row items-start gap-1.5">
                    <MaterialCommunityIcons name="chevron-right" size={12} color={palette.inkFaint} style={{ marginTop: 2 }} />
                    <Text className="min-w-0 flex-1 font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
                      {line}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {cause.contradicting.length > 0 ? (
              <Text className="mt-1.5 font-body text-[10.5px] leading-[14px]" style={{ color: palette.warning }}>
                Against it: {cause.contradicting[0]}
              </Text>
            ) : null}
          </View>
        );
      })}

      {/* Ruled out lives here rather than in a section of its own: it is the
          tail of the same ranked list, and "considered and eliminated" is only
          meaningful next to what was not. */}
      {view.ruledOut.length > 0 ? (
        <View className="pt-2.5" style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
          <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
            Ruled out
          </Text>
          {view.ruledOut.map((cause) => (
            <Text
              key={cause.faultId}
              className="mt-1 font-body text-[11px] leading-[15px]"
              style={{ color: palette.inkMuted }}
            >
              {cause.name} — {cause.contradicting[0] ?? 'a primary contradiction eliminated this hypothesis.'}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contextual signal analysis
// ---------------------------------------------------------------------------

/**
 * A tool's own read-out.
 *
 * Every tool that can be computed from scalar telemetry computes from the
 * session history the pipeline already keeps. Every tool that cannot says
 * exactly what it would need — that sentence is the useful output, because an
 * operator who does not know a spectrum is unavailable may read its absence as
 * "no bearing fault".
 */
function ToolPanel({ signal, tool }: { signal: SignalView; tool: AnalysisTool }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  const stats = useMemo(() => {
    const usable = signal.history.filter((value): value is number => value !== null && Number.isFinite(value));
    if (usable.length === 0) return null;
    const min = Math.min(...usable);
    const max = Math.max(...usable);
    const mean = usable.reduce((sum, value) => sum + value, 0) / usable.length;
    const spread = max - min;
    const variance = usable.length > 1 ? usable.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (usable.length - 1) : 0;
    return { min, max, mean, spread, sd: Math.sqrt(variance), count: usable.length };
  }, [signal.history]);

  if (!tool.available) {
    return (
      <View className="gap-1.5 rounded-lg border px-3 py-3" style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}>
        <View className="flex-row items-center gap-1.5">
          <MaterialCommunityIcons name="lock-outline" size={13} color={palette.inkFaint} />
          <Text className="font-mono text-[9.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkMuted }}>
            {tool.label} not available on this machine
          </Text>
        </View>
        <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
          {tool.note}
        </Text>
      </View>
    );
  }

  const accent = signal.status === 'ALARM' ? palette.critical : signal.status === 'WARNING' ? palette.warning : palette.accent;

  return (
    <View className="gap-2.5">
      <Text className="font-body text-[11px] leading-[15px]" style={{ color: palette.inkMuted }}>
        {tool.note}
      </Text>

      <View className="items-start rounded-lg border px-3 py-3" style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}>
        <TagTrend values={signal.history} colour={accent} width={360} height={64} />
      </View>

      {stats ? (
        <View className="flex-row flex-wrap gap-x-5 gap-y-2">
          {/* The current value is stated once, in the header row above this
              panel. Every tool adds only what IT computes on top of it. */}
          {tool.key === 'trend' || tool.key === 'level' || tool.key === 'load' ? (
            <>
              <Fact label="Mean" value={formatValue(stats.mean, signal.unit)} width={104} />
              <Fact label="Min" value={formatValue(stats.min, signal.unit)} width={92} />
              <Fact label="Max" value={formatValue(stats.max, signal.unit)} width={92} />
              <Fact label="Samples" value={String(stats.count)} width={84} />
            </>
          ) : null}
          {tool.key === 'rate' ? (
            <>
              <Fact label="Change" value={formatValue(stats.max - stats.min, signal.unit)} width={110} />
              <Fact label="Direction" value={BEHAVIOUR_LABEL[signal.behaviour]} mono={false} width={116} />
              <Fact label="Samples" value={String(stats.count)} width={84} />
            </>
          ) : null}
          {tool.key === 'stability' || tool.key === 'variation' || tool.key === 'consumption' ? (
            <>
              <Fact label="Spread" value={formatValue(stats.spread, signal.unit)} width={104} />
              <Fact label="Std dev" value={formatValue(stats.sd, signal.unit)} width={104} />
              <Fact label="Samples" value={String(stats.count)} width={84} />
            </>
          ) : null}
          {tool.key === 'setpoint' ? (
            <>
              <Fact label="Setpoint" value={formatValue(signal.reference, signal.unit)} width={110} />
              <Fact
                label="Deviation"
                value={
                  signal.value !== null && signal.reference !== null
                    ? formatValue(signal.value - signal.reference, signal.unit)
                    : '—'
                }
                width={110}
                tone={accent}
              />
            </>
          ) : null}
        </View>
      ) : (
        <EmptyNote>No sample has been recorded for this signal yet.</EmptyNote>
      )}

      {tool.key === 'setpoint' && signal.reference === null ? (
        <Text className="font-body text-[10.5px] leading-[14px]" style={{ color: palette.inkFaint }}>
          {signal.referenceNote}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Signal detail for the selected part.
 *
 * This is where Signal Analysis lives now. The signal selector lists only the
 * part's own signals plus the ones that inform it, and the tool row is built
 * from the signal's measurement kind, so what is offered is always what this
 * measurement can actually support.
 */
function SignalDetail({ signals, part }: { signals: SignalView[]; part: MachinePart }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [toolKey, setToolKey] = useState<string | null>(null);

  const signal = signals.find((entry) => entry.tag === selectedTag) ?? signals[0] ?? null;
  const tools = signal ? TOOLS_FOR_KIND[signal.kind] : [];
  const tool = tools.find((entry) => entry.key === toolKey) ?? tools[0] ?? null;

  if (!signal) {
    return <EmptyNote>No signal on this machine is mapped to this part, so there is nothing to analyse here.</EmptyNote>;
  }

  return (
    <View className="gap-3">
      {/* Which signal */}
      {signals.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {signals.map((entry) => {
            const active = entry.tag === signal.tag;
            return (
              <PressSurface
                key={entry.tag}
                onPress={() => {
                  setSelectedTag(entry.tag);
                  setToolKey(null);
                }}
                selected={active}
                accessibilityRole="tab"
                accessibilityLabel={entry.measures}
                className="rounded-xl border px-2.5 py-1.5"
                style={{
                  borderColor: active ? palette.lineStrong : palette.line,
                  backgroundColor: active ? palette.panelRaised : palette.panel,
                }}
              >
                <Text className="font-body text-[11px]" style={{ color: active ? palette.ink : palette.inkMuted }}>
                  {entry.measures}
                </Text>
                <Text className="font-mono text-[8.5px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }}>
                  {entry.tag} · {entry.part === part ? KIND_LABEL[entry.kind] : `context · ${entry.part}`}
                </Text>
              </PressSurface>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Headline numbers for the selected signal */}
      <View className="flex-row flex-wrap gap-x-5 gap-y-2">
        <Fact label="Current" value={formatValue(signal.value, signal.unit)} width={118} />
        <Fact label="Reference" value={formatValue(signal.reference, signal.unit)} width={118} />
        <Fact label="Behaviour" value={BEHAVIOUR_LABEL[signal.behaviour]} mono={false} width={126} />
        <Fact label="Data quality" value={signal.quality.toLowerCase()} mono={false} width={112} />
        <Fact label="Point" value={signal.point} mono={false} width={168} />
      </View>

      {/* Which tool — built from the measurement kind, not from a fixed list */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {tools.map((entry) => {
          const active = entry.key === tool?.key;
          return (
            <PressSurface
              key={entry.key}
              onPress={() => setToolKey(entry.key)}
              selected={active}
              accessibilityRole="tab"
              accessibilityLabel={entry.available ? entry.label : `${entry.label}, not available on this machine`}
              className="flex-row items-center gap-1.5 rounded-xl border px-2.5 py-1.5"
              style={{
                borderColor: active ? palette.lineStrong : palette.line,
                backgroundColor: active ? palette.panelRaised : palette.panel,
                opacity: entry.available ? 1 : 0.55,
              }}
            >
              <Text
                className="font-mono text-[9.5px] uppercase tracking-[0.12em]"
                style={{ color: active ? palette.ink : palette.inkMuted }}
              >
                {entry.label}
              </Text>
              {!entry.available ? <MaterialCommunityIcons name="lock-outline" size={11} color={palette.inkFaint} /> : null}
            </PressSurface>
          );
        })}
      </ScrollView>

      {tool ? <ToolPanel signal={signal} tool={tool} /> : null}

      <Text className="font-body text-[10.5px] leading-[14px]" style={{ color: palette.inkFaint }}>
        {signal.behaviourDetail}
      </Text>
    </View>
  );
}

/**
 * The barrel's thermal profile.
 *
 * The barrel is the one part whose signals are only meaningful as a *set*: three
 * zone temperatures are a profile, and a profile that stops rising is a
 * different fault from any single zone being high. So the barrel deep-dive
 * leads with the profile and the per-zone behaviour before it offers the
 * per-signal tools.
 */
const PROFILE_HEIGHT = 68;

function ThermalProfile({ signals }: { signals: SignalView[] }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const zones = signals.filter((signal) => signal.kind === 'temperature');

  if (zones.length < 2) return null;

  const values = zones.map((zone) => zone.value).filter((value): value is number => value !== null);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const span = max - min || 1;
  const gradual = zones.every(
    (zone, index) => index === 0 || zone.value === null || zones[index - 1].value === null || zone.value >= (zones[index - 1].value ?? 0),
  );

  return (
    <View className="gap-3">
      <View className="flex-row items-end justify-between gap-2">
        {zones.map((zone) => (
          <View key={zone.tag} className="min-w-0 flex-1 items-center">
            <Text className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: palette.inkFaint }} numberOfLines={1}>
              {zone.measures.replace(/ temperature$/i, '')}
            </Text>
            <Text className="mt-0.5 font-body text-[20px] leading-[24px]" style={{ color: palette.ink, fontWeight: '300' }}>
              {formatValue(zone.value, zone.unit)}
            </Text>
          </View>
        ))}
      </View>

      {/* The profile itself: one node per zone, each sitting at a height set by
          its own temperature. That is the point of drawing it at all — a flat
          or inverted profile is a different fault from any single hot zone, and
          it is visible here as a shape before any number is read. */}
      <View style={{ height: PROFILE_HEIGHT }} className="flex-row items-stretch">
        {zones.map((zone) => {
          const share = zone.value === null ? 0 : (zone.value - min) / span;
          const accent =
            zone.status === 'ALARM' ? palette.critical : zone.status === 'WARNING' ? palette.warning : palette.accent;
          return (
            <View key={zone.tag} className="min-w-0 flex-1 items-center justify-end">
              <View
                style={{
                  width: 1,
                  height: 6 + share * (PROFILE_HEIGHT - 18),
                  backgroundColor: palette.line,
                }}
              />
              <View
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: 6,
                  marginTop: -6,
                  backgroundColor: zone.value === null ? palette.inkFaint : accent,
                }}
              />
              <View style={{ height: 6 }} />
            </View>
          );
        })}
      </View>
      <View style={{ height: 1, backgroundColor: palette.line, marginTop: -7 }} />

      <Text className="text-center font-body text-[10.5px]" style={{ color: palette.inkMuted }}>
        {values.length < zones.length
          ? 'Part of the profile is not reporting, so the progression cannot be assessed.'
          : gradual
            ? 'Gradual increase along the screw, as the profile expects.'
            : 'The profile does not rise gradually along the screw — a zone is out of sequence.'}
      </Text>

      <View>
        {zones.map((zone, index) => {
          const variant: Variant = zone.status === 'ALARM' ? 'destructive' : zone.status === 'WARNING' ? 'warning' : 'success';
          return (
            <View
              key={zone.tag}
              className="flex-row items-center justify-between gap-3 py-1.5"
              style={index === 0 ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}
            >
              <Text className="min-w-0 flex-1 font-body text-[11.5px]" style={{ color: palette.ink }} numberOfLines={1}>
                {zone.measures}
              </Text>
              <Text className="font-body text-[11px]" style={{ color: palette.inkMuted }}>
                {BEHAVIOUR_LABEL[zone.behaviour]}
              </Text>
              <Badge variant={variant} icon={null} outline>
                {zone.status === 'UNAVAILABLE' ? 'No data' : zone.status.toLowerCase()}
              </Badge>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function AdvanceDiagnosisTab({
  parts,
  selectedPart,
  onSelectPart,
  wide,
}: {
  parts: PartView[];
  selectedPart: MachinePart | null;
  onSelectPart: (part: MachinePart | null) => void;
  wide: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const view = selectedPart ? (parts.find((entry) => entry.part === selectedPart) ?? null) : null;
  // Only a part that needs a decision earns a card. Normal parts and parts
  // nothing is measuring are each worth one line, not one card apiece.
  const needsDecision = parts.filter((entry) => entry.state !== 'NORMAL' && entry.state !== 'UNAVAILABLE');
  const healthy = parts.filter((entry) => entry.state === 'NORMAL');
  const unmeasured = parts.filter((entry) => entry.state === 'UNAVAILABLE');

  return (
    <View>
      {/* The part picker is the screen's navigation, not a region of its own. It
          sits bare at the top of the card so the first thing the eye lands on is
          the machine, not a heading announcing that a machine is below. */}
      <View className="px-4 pb-1 pt-3.5">
        <PartChips parts={parts} selected={selectedPart} onSelect={onSelectPart} />
      </View>

      {view === null ? (
        <>
          <Block
            first
            title="Machine condition by part"
            meta="Material travels left to right. Select a part to open it."
          >
            <ConditionStrip parts={parts} onSelect={onSelectPart} />
          </Block>

          {needsDecision.length > 0 || healthy.length > 0 || unmeasured.length > 0 ? (
            <Block title="What each part is reporting" padded={false}>
              <View className="px-4 pb-4" style={{ gap: 10 }}>
                {needsDecision.length > 0 ? (
                  <View className={cn(wide && 'flex-row flex-wrap')} style={{ gap: 10 }}>
                    {needsDecision.map((entry) => (
                      <PartCard key={entry.part} view={entry} onOpen={() => onSelectPart(entry.part)} />
                    ))}
                  </View>
                ) : null}
                <PartGroupLine parts={healthy} title="parts normal" badge="Normal" variant="success" />
                <PartGroupLine parts={unmeasured} title="parts not measured" badge="No data" variant="muted" />
              </View>
            </Block>
          ) : null}
        </>
      ) : (
        <>
          {/* One header for the part: what it is, how it is, and what is wrong.
              The counts that used to sit here repeated the strip and the card
              above, so the headline keeps the sentence and drops the tally. */}
          <Block
            first
            title={view.part}
            meta={view.headline ?? view.description}
            accent={STATE_VARIANT[view.state]}
            actions={
              <Badge variant={STATE_VARIANT[view.state]} icon={null} outline>
                {PART_STATE_LABEL[view.state]}
              </Badge>
            }
          >
            <View className="gap-2">
              <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }}>
                How ULTRON reached this conclusion
              </Text>
              <ReasoningChain view={view} />
            </View>
          </Block>

          {view.part === 'Barrel' ? (
            <Block
              title="Barrel temperature profile"
              meta="The zones are read as one profile: a flat or inverted profile is a different fault from any single hot zone."
            >
              <ThermalProfile signals={view.signals} />
            </Block>
          ) : null}

          <View className={cn(wide && 'flex-row items-stretch')} style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
            <View className="min-w-0 flex-1">
              <Block
                first
                title="Possible causes"
                meta="Ranked by engineering match, which orders the list but is not a probability."
                footnote="This machine has no calibrated fault-probability model, so no percentage confidence is reported. Ambiguity is kept wherever the installed sensors cannot separate two candidates, and the measurement that would separate them is named."
              >
                <CauseList view={view} />
              </Block>
            </View>

            <View
              style={wide ? { width: 1, backgroundColor: palette.line } : { height: 1, backgroundColor: palette.line }}
            />

            <View className="min-w-0 flex-1">
              <Block
                first
                title="Signal detail"
                meta="Signals this part owns, plus the ones that inform it. The tools offered are the ones this kind of measurement can support."
              >
                <SignalDetail signals={[...view.signals, ...view.contextSignals]} part={view.part} />
              </Block>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
