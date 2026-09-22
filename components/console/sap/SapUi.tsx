import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useAppTheme } from "../../../hooks/useAppTheme";
import { cn } from "../../../lib/cn";
import { consolePalette, type ConsolePalette } from "../../../lib/consoleTheme";
import type { SapTone } from "./types";

export function useSapPalette(): ConsolePalette {
  const { isDark } = useAppTheme();
  return consolePalette(isDark);
}

export function SapButton({
  label,
  onPress,
  icon: Icon,
  primary = false,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress?: () => void;
  icon?: LucideIcon;
  primary?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const palette = useSapPalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      className={cn(
        "flex-row items-center justify-center gap-2 rounded-lg border",
        compact ? "px-3 py-2" : "px-4 py-2.5",
        disabled && "opacity-40",
      )}
      style={{
        backgroundColor: primary ? palette.ink : "transparent",
        borderColor: primary ? palette.ink : palette.lineStrong,
      }}
    >
      {Icon ? (
        <Icon
          size={14}
          color={primary ? palette.bg : palette.ink}
          strokeWidth={1.8}
        />
      ) : null}
      <Text
        className="font-body-medium text-[12px]"
        style={{ color: primary ? palette.bg : palette.ink }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function StatusPill({
  label,
  tone = "neutral",
  dot = true,
}: {
  label: string;
  tone?: SapTone;
  dot?: boolean;
}) {
  const palette = useSapPalette();
  const colors: Record<
    SapTone,
    { color: string; background: string; border: string }
  > = {
    success: {
      color: palette.accent,
      background: palette.accentSoft,
      border: palette.accentBorder,
    },
    warning: {
      color: palette.warningValue,
      background: palette.warningSoft,
      border: palette.warningBorder,
    },
    critical: {
      color: palette.criticalValue,
      background: palette.criticalSoft,
      border: palette.criticalBorder,
    },
    info: {
      color: palette.info,
      background: palette.selected,
      border: palette.lineStrong,
    },
    neutral: {
      color: palette.inkMuted,
      background: palette.panelRaised,
      border: palette.line,
    },
  };
  const value = colors[tone];
  return (
    <View
      className="self-start flex-row items-center gap-1.5 rounded-full border px-2 py-1"
      style={{ backgroundColor: value.background, borderColor: value.border }}
    >
      {dot ? (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: value.color,
          }}
        />
      ) : null}
      <Text
        className="font-body-medium text-[10px]"
        style={{ color: value.color }}
      >
        {label}
      </Text>
    </View>
  );
}

export function SectionCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: object;
}) {
  const palette = useSapPalette();
  return (
    <View
      className="rounded-xl border p-4"
      style={[
        { backgroundColor: palette.panel, borderColor: palette.line },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  const palette = useSapPalette();
  return (
    <View className="mb-3 flex-row flex-wrap items-start justify-between gap-3">
      <View className="min-w-[220px] flex-1">
        <Text
          className="font-body-medium text-[13px]"
          style={{ color: palette.ink }}
        >
          {title}
        </Text>
        {description ? (
          <Text
            className="mt-1 font-body text-[11px] leading-[17px]"
            style={{ color: palette.inkMuted }}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: SapTone;
}) {
  const palette = useSapPalette();
  const valueColor =
    tone === "warning"
      ? palette.warningValue
      : tone === "critical"
        ? palette.criticalValue
        : tone === "success"
          ? palette.accentValue
          : palette.ink;
  return (
    <SectionCard style={{ flexGrow: 1, flexBasis: 210, minWidth: 190 }}>
      <Text
        className="font-mono text-[9px] uppercase tracking-[0.16em]"
        style={{ color: palette.inkFaint }}
      >
        {label}
      </Text>
      <Text
        className="mt-2 font-mono text-[22px]"
        style={{ color: valueColor }}
      >
        {value}
      </Text>
      <Text
        className="mt-1 font-body text-[10.5px]"
        style={{ color: palette.inkMuted }}
      >
        {detail}
      </Text>
    </SectionCard>
  );
}

export function MetricRow({ children }: { children: ReactNode }) {
  return <View className="mb-3 flex-row flex-wrap gap-3">{children}</View>;
}

export function SapTable({
  columns,
  widths,
  rows,
  minWidth,
}: {
  columns: string[];
  widths: number[];
  rows: ReactNode[][];
  minWidth?: number;
}) {
  const palette = useSapPalette();
  const total = minWidth ?? widths.reduce((sum, width) => sum + width, 0);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -1 }}
    >
      <View style={{ minWidth: total, flexGrow: 1 }}>
        <View
          className="flex-row border-b px-1 py-2"
          style={{
            backgroundColor: palette.panelRaised,
            borderColor: palette.line,
          }}
        >
          {columns.map((column, index) => (
            <Text
              key={column}
              className="px-2 font-mono text-[9px] uppercase tracking-[0.12em]"
              style={{ width: widths[index], color: palette.inkFaint }}
            >
              {column}
            </Text>
          ))}
        </View>
        {rows.map((row, rowIndex) => (
          <View
            key={rowIndex}
            className="flex-row items-center border-b px-1 py-2.5 last:border-b-0"
            style={{ borderColor: palette.lineSubtle }}
          >
            {row.map((cell, cellIndex) => (
              <View
                key={cellIndex}
                className="px-2"
                style={{ width: widths[cellIndex] }}
              >
                {typeof cell === "string" || typeof cell === "number" ? (
                  <Text
                    className="font-body text-[11px]"
                    style={{ color: palette.ink }}
                  >
                    {cell}
                  </Text>
                ) : (
                  cell
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function ActivityRow({
  age,
  text,
  status,
  tone,
}: {
  age: string;
  text: string;
  status: string;
  tone: SapTone;
}) {
  const palette = useSapPalette();
  return (
    <View
      className="flex-row flex-wrap items-center gap-3 border-t py-3 first:border-t-0"
      style={{ borderColor: palette.lineSubtle }}
    >
      <Text
        className="w-[86px] font-mono text-[9px] uppercase"
        style={{ color: palette.inkFaint }}
      >
        {age}
      </Text>
      <Text
        className="min-w-[220px] flex-1 font-body text-[11px]"
        style={{ color: palette.ink }}
      >
        {text}
      </Text>
      <StatusPill label={status} tone={tone} />
    </View>
  );
}

export function Fact({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: SapTone;
}) {
  const palette = useSapPalette();
  const color =
    tone === "warning"
      ? palette.warningValue
      : tone === "critical"
        ? palette.criticalValue
        : tone === "success"
          ? palette.accentValue
          : palette.ink;
  return (
    <View
      className="min-w-[150px] flex-1 border-t pt-2.5"
      style={{ borderColor: palette.lineSubtle }}
    >
      <Text
        className="font-mono text-[9px] uppercase tracking-[0.12em]"
        style={{ color: palette.inkFaint }}
      >
        {label}
      </Text>
      <Text className="mt-1 font-body-medium text-[12px]" style={{ color }}>
        {value}
      </Text>
    </View>
  );
}

export function toneForStatus(status: string): SapTone {
  const normalized = status.toLowerCase();
  if (
    normalized.includes("duplicate") ||
    normalized.includes("short") ||
    normalized.includes("timeout")
  )
    return "critical";
  if (
    normalized.includes("review") ||
    normalized.includes("retry") ||
    normalized.includes("pending") ||
    normalized.includes("not published")
  )
    return "warning";
  if (
    normalized.includes("valid") ||
    normalized.includes("ready") ||
    normalized.includes("success") ||
    normalized.includes("published") ||
    normalized === "201"
  )
    return "success";
  return "neutral";
}
