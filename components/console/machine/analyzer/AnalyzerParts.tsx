/**
 * Shared furniture for the Analyzer workspace.
 *
 * The Analyzer was a single scrolling document: six subjects stacked one under
 * another, each in a full-width card, each with its own idea of how a heading,
 * a filter row and a summary should look. These are the pieces every tab now
 * builds from, so the six tabs read as one instrument rather than six pages
 * that happen to share a tab bar.
 *
 * Nothing here introduces a colour or a size that is not already in the console
 * kit — they resolve out of `ConsolePalette` exactly like `components/ui`.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type React from 'react';
import { useState } from 'react';
import { Pressable, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '../../../../hooks/useAppTheme';
import { cn } from '../../../../lib/cn';
import { alpha, consolePalette, variantStyle, type ConsolePalette, type IconName, type Variant } from '../../../ui';

// ---------------------------------------------------------------------------
// Section shell
// ---------------------------------------------------------------------------

/**
 * One analytical region: a titled plate with an optional right-hand control
 * slot and an optional footnote.
 *
 * Deliberately not `Card` + `CardHeader` + `Separator` assembled by hand at
 * every call site — that is what let the old page drift into eight different
 * header treatments.
 */
export function Section({
  title,
  eyebrow,
  meta,
  actions,
  accent,
  footnote,
  children,
  padded = true,
  className,
  style,
}: {
  title: string;
  /** Small uppercase kicker above the title, for the subject the panel serves. */
  eyebrow?: string;
  /** One short line under the title. */
  meta?: string;
  /** Filters, counts, toggles — anything that operates on the content. */
  actions?: React.ReactNode;
  accent?: Variant;
  /** Small print under the rule at the bottom: caveats, provenance, advisory. */
  footnote?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  const rail = accent ? variantStyle(palette, accent).accent : undefined;

  return (
    <View
      className={cn('overflow-hidden rounded-xl border', className)}
      style={[
        { backgroundColor: palette.panel, borderColor: palette.line },
        rail ? { borderLeftWidth: 3, borderLeftColor: rail } : null,
        style,
      ]}
    >
      <View
        className="flex-row flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-2.5 pt-3"
      >
        <View className="min-w-0 flex-1">
          {eyebrow ? (
            <Text className="font-mono text-[8.5px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
              {eyebrow}
            </Text>
          ) : null}
          <Text className="font-body-bold text-[13.5px] tracking-[-0.015em]" style={{ color: palette.ink }}>
            {title}
          </Text>
          {meta ? (
            <Text className="mt-0.5 font-body text-[11px] leading-[16px]" style={{ color: palette.inkMuted }}>
              {meta}
            </Text>
          ) : null}
        </View>
        {actions ? <View className="flex-row flex-wrap items-center gap-1.5">{actions}</View> : null}
      </View>

      <View style={{ height: 1, backgroundColor: palette.line }} />

      <View className={cn(padded && 'px-4 py-3')}>{children}</View>

      {footnote ? (
        <>
          <View style={{ height: 1, backgroundColor: palette.line }} />
          <View className="px-4 py-2" style={{ backgroundColor: palette.panelRaised }}>
            {typeof footnote === 'string' ? (
              <Text className="font-body text-[10.5px] leading-[15px]" style={{ color: palette.inkFaint }}>
                {footnote}
              </Text>
            ) : (
              footnote
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Summary strip
// ---------------------------------------------------------------------------

export type SummaryItem = {
  key: string;
  label: string;
  value: string;
  variant?: Variant;
  /** Optional second line — a unit, a share, a qualifier. */
  detail?: string;
};

/**
 * A row of counted facts, ruled rather than boxed.
 *
 * Every tab opens with one of these because every tab answers the same first
 * question: how much of this is there, and how much of it needs attention. Four
 * separate `StatTile` cards said the same thing in three times the height.
 */
export function SummaryStrip({ items, className }: { items: SummaryItem[]; className?: string }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View
      className={cn('flex-row flex-wrap overflow-hidden rounded-xl border', className)}
      style={{ backgroundColor: palette.panel, borderColor: palette.line }}
    >
      {items.map((item, index) => {
        const accent = item.variant ? variantStyle(palette, item.variant).accent : palette.ink;
        return (
          <View
            key={item.key}
            className="min-w-[128px] flex-1 px-3.5 py-2.5"
            style={index === 0 ? undefined : { borderLeftWidth: 1, borderLeftColor: palette.line }}
          >
            <View className="flex-row items-center gap-1.5">
              {item.variant ? (
                <View style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: accent }} />
              ) : null}
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 font-mono text-[8.5px] uppercase tracking-[0.15em]"
                style={{ color: palette.inkFaint }}
              >
                {item.label}
              </Text>
            </View>
            <Text
              className="mt-1 font-body text-[19px] leading-[22px]"
              style={{ color: item.variant ? accent : palette.ink, fontWeight: '300', fontVariant: ['tabular-nums'] }}
              numberOfLines={1}
            >
              {item.value}
            </Text>
            {item.detail ? (
              <Text numberOfLines={1} className="mt-0.5 font-body text-[10px]" style={{ color: palette.inkMuted }}>
                {item.detail}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

/** Search box sized for a toolbar rather than a form. */
export function SearchField({
  value,
  onChange,
  placeholder,
  width = 200,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  width?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className="min-w-[150px] flex-row items-center gap-1.5 rounded-lg border px-2 py-1"
      style={{ borderColor: palette.line, backgroundColor: palette.panelRaised, width }}
    >
      <MaterialCommunityIcons name="magnify" size={13} color={palette.inkFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.inkFaint}
        accessibilityLabel={placeholder}
        className="min-w-0 flex-1 font-body text-[11px]"
        style={{ color: palette.ink, outlineStyle: 'none' } as never}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Clear search">
          <MaterialCommunityIcons name="close-circle" size={13} color={palette.inkFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

export type FilterOption<T extends string> = { value: T; label: string; count?: number; variant?: Variant };

/**
 * A segmented filter.
 *
 * Counts live inside the chip rather than in a legend beside it: "3 crossed" is
 * the reason to press the chip, so it belongs on the thing you press.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Screen-reader name for the group. */
  label: string;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      className="flex-row items-center gap-0.5 rounded-lg border p-0.5"
      style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
    >
      {options.map((option) => {
        const active = option.value === value;
        const style = option.variant ? variantStyle(palette, option.variant) : null;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.count === undefined ? option.label : `${option.label}, ${option.count}`}
            className="flex-row items-center gap-1 rounded-md px-2 py-[3px]"
            style={active ? { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.lineStrong } : undefined}
          >
            {option.variant && !active ? (
              <View style={{ width: 4.5, height: 4.5, borderRadius: 5, backgroundColor: style?.accent }} />
            ) : null}
            <Text
              className="font-mono text-[9.5px] uppercase tracking-[0.12em]"
              style={{ color: active ? palette.ink : palette.inkMuted }}
            >
              {option.label}
            </Text>
            {option.count !== undefined ? (
              <Text
                className="font-mono text-[9.5px]"
                style={{ color: active ? (style?.accent ?? palette.inkMuted) : palette.inkFaint, fontVariant: ['tabular-nums'] }}
              >
                {option.count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Sort control: press the active key again to reverse it. */
export function SortButton<T extends string>({
  options,
  value,
  descending,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  descending: boolean;
  onChange: (value: T, descending: boolean) => void;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View
      className="flex-row items-center gap-0.5 rounded-lg border p-0.5"
      style={{ borderColor: palette.line, backgroundColor: palette.panelRaised }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value, active ? !descending : true)}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${option.label}${active ? (descending ? ', descending' : ', ascending') : ''}`}
            className="flex-row items-center gap-1 rounded-md px-2 py-[3px]"
            style={active ? { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.lineStrong } : undefined}
          >
            <Text
              className="font-mono text-[9.5px] uppercase tracking-[0.12em]"
              style={{ color: active ? palette.ink : palette.inkMuted }}
            >
              {option.label}
            </Text>
            {active ? (
              <MaterialCommunityIcons
                name={descending ? 'arrow-down' : 'arrow-up'}
                size={10}
                color={palette.inkMuted}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * A dense record row that expands in place.
 *
 * Used by Limits, Signals, Evidence and Connectivity so a row behaves the same
 * way in all four, and so a narrow viewport gets a card without a second
 * implementation of the same content.
 */
export function ExpandableRow({
  expanded,
  onToggle,
  accessibilityLabel,
  summary,
  detail,
  tone,
  first = false,
}: {
  expanded: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  summary: React.ReactNode;
  detail?: React.ReactNode;
  /** Paints a 2px status edge on the leading side. */
  tone?: string;
  first?: boolean;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  // Hover is held in state rather than read from Pressable's render callback:
  // NativeWind compiles `className` into `style`, and a function-form style is
  // dropped, so the callback form never paints.
  const [hover, setHover] = useState(false);

  return (
    <View style={first ? undefined : { borderTopWidth: 1, borderTopColor: palette.line }}>
      <Pressable
        onPress={detail ? onToggle : undefined}
        disabled={!detail}
        accessibilityRole={detail ? 'button' : undefined}
        accessibilityState={detail ? { expanded } : undefined}
        accessibilityLabel={accessibilityLabel}
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        className="flex-row items-center gap-2.5 px-3 py-2"
        style={[
          hover || expanded ? { backgroundColor: palette.panelRaised } : null,
          tone ? { borderLeftWidth: 2, borderLeftColor: tone, paddingLeft: 10 } : null,
        ]}
      >
        <View className="min-w-0 flex-1">{summary}</View>
        {detail ? (
          <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={15} color={palette.inkFaint} />
        ) : null}
      </Pressable>
      {expanded && detail ? (
        <View className="px-3 pb-3 pt-0.5" style={{ backgroundColor: palette.panelRaised }}>
          {detail}
        </View>
      ) : null}
    </View>
  );
}

/** Label above value, aligned in a wrapping grid. The console's fact cell. */
export function Fact({
  label,
  value,
  mono = true,
  tone,
  width = 96,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: string;
  width?: number;
}) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View style={{ minWidth: width }}>
      <Text className="font-mono text-[8.5px] uppercase tracking-[0.15em]" style={{ color: palette.inkFaint }} numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn('mt-0.5', mono ? 'font-mono text-[11px]' : 'font-body text-[11.5px]')}
        style={{ color: tone ?? palette.ink, fontVariant: mono ? ['tabular-nums'] : undefined }}
      >
        {value}
      </Text>
    </View>
  );
}

/** A numbered instruction step. Ordered work reads as a list, not a paragraph. */
export function StepRow({ index, text, muted = false }: { index: number; text: string; muted?: boolean }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <View className="flex-row items-start gap-2.5">
      <View
        className="mt-[1px] h-[18px] w-[22px] items-center justify-center rounded"
        style={{ backgroundColor: palette.panelRaised }}
      >
        <Text className="font-mono text-[9.5px]" style={{ color: palette.inkMuted, fontVariant: ['tabular-nums'] }}>
          {String(index).padStart(2, '0')}
        </Text>
      </View>
      <Text className="min-w-0 flex-1 font-body text-[12px] leading-[17px]" style={{ color: muted ? palette.inkMuted : palette.ink }}>
        {text}
      </Text>
    </View>
  );
}

/** Empty state inside a section. One sentence, no illustration. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  const { isDark } = useAppTheme();
  const palette = consolePalette(isDark);
  return (
    <Text className="py-4 text-center font-body text-[11.5px] leading-[16px]" style={{ color: palette.inkMuted }}>
      {children}
    </Text>
  );
}

/** Tinted well used for the connection-path steps and topology nodes. */
export function Node({
  label,
  value,
  tone,
  palette,
}: {
  label: string;
  value: string;
  tone?: string;
  palette: ConsolePalette;
}) {
  return (
    <View
      className="min-w-0 rounded-lg border px-2.5 py-1.5"
      style={{ borderColor: tone ? alpha(tone, 0.4) : palette.line, backgroundColor: palette.panelRaised }}
    >
      <Text className="font-mono text-[8px] uppercase tracking-[0.16em]" style={{ color: palette.inkFaint }}>
        {label}
      </Text>
      <Text className="mt-0.5 font-mono text-[11.5px]" style={{ color: palette.ink }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export type { IconName };
