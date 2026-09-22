import {
  Activity,
  CalendarClock,
  Factory,
  ShieldCheck,
  Sparkles,
} from "lucide-react-native";
import { Text, View } from "react-native";

import {
  Fact,
  MetricCard,
  MetricRow,
  SapButton,
  SectionCard,
  SectionHeader,
  StatusPill,
  useSapPalette,
} from "../SapUi";

type Order = Record<string, unknown>;
const value = (order: Order | undefined, keys: string[], fallback: string) => {
  for (const key of keys)
    if (order?.[key] !== undefined && order[key] !== null && order[key] !== "")
      return String(order[key]);
  return fallback;
};

export function ProductionTab({
  orders = [],
  live = false,
}: {
  orders?: Order[];
  live?: boolean;
}) {
  const palette = useSapPalette();
  const active = orders[0];
  const orderNumber = value(
    active,
    ["ProductionOrder", "ManufacturingOrder"],
    "10009248",
  );
  const material = value(active, ["Product", "Material"], "MAT-445001");
  const planned = value(
    active,
    ["TotalQuantity", "OrderPlannedTotalQty"],
    "12,000",
  );
  const confirmed = value(
    active,
    ["MfgOrderConfirmedYieldQty", "ConfirmedYieldQuantity"],
    "8,160",
  );
  const status = value(
    active,
    ["OrderIsReleased", "ProductionOrderStatus"],
    "Released",
  );

  return (
    <View>
      <View
        className="mb-3 overflow-hidden rounded-2xl border p-5"
        style={{ backgroundColor: palette.panel, borderColor: palette.line }}
      >
        <View className="flex-row flex-wrap items-start justify-between gap-4">
          <View className="min-w-[280px] flex-1">
            <View className="mb-2 flex-row items-center gap-2">
              <Factory size={18} color={palette.accent} />
              <Text
                className="font-body-medium text-[15px]"
                style={{ color: palette.ink }}
              >
                Production command board
              </Text>
            </View>
            <Text
              className="max-w-[720px] font-body text-[11px] leading-[17px]"
              style={{ color: palette.inkMuted }}
            >
              A decision layer across SAP production orders, ULTRON machine
              condition, maintenance readiness and output risk. Recommendations
              remain advisory until a planner approves them.
            </Text>
          </View>
          <View className="items-end gap-2">
            <StatusPill
              label={
                live
                  ? "Live SAP order feed"
                  : "Illustrative plan · connect SAP for live orders"
              }
              tone={live ? "success" : "info"}
            />
            <Text
              className="font-mono text-[8px]"
              style={{ color: palette.inkFaint }}
            >
              WORK CENTRE · EXT-01
            </Text>
          </View>
        </View>
        <View className="mt-4 flex-row flex-wrap gap-2">
          <Signal
            icon={Activity}
            label="Machine constraint"
            value="Bearing DE · elevated"
            tone="warning"
          />
          <Signal
            icon={ShieldCheck}
            label="Safe run envelope"
            value="9 days predicted RUL"
          />
          <Signal
            icon={CalendarClock}
            label="Planner opportunity"
            value="19:00–23:30 today"
            tone="success"
          />
        </View>
      </View>

      <MetricRow>
        <MetricCard
          label="Active SAP order"
          value={orderNumber}
          detail={`${material} · ${status}`}
        />
        <MetricCard
          label="Order progress"
          value="68%"
          detail={`${confirmed} / ${planned} kg`}
          tone="success"
        />
        <MetricCard
          label="Orders exposed"
          value="3"
          detail="Cross the forecast risk boundary"
          tone="warning"
        />
        <MetricCard
          label="Protected output"
          value="36.4t"
          detail="With the recommended service window"
          tone="success"
        />
      </MetricRow>

      <SectionCard style={{ marginBottom: 12 }}>
        <SectionHeader
          title="Constraint-aware schedule · next 7 days"
          description="SAP order blocks are overlaid with idle capacity, service duration and ULTRON's predicted risk boundary."
          action={<StatusPill label="RUL boundary · day 9" tone="warning" />}
        />
        <View className="mb-2 flex-row justify-between">
          {["NOW", "TUE", "THU", "SAT", "MON"].map((day) => (
            <Text
              key={day}
              className="font-mono text-[8px]"
              style={{ color: palette.inkFaint }}
            >
              {day}
            </Text>
          ))}
        </View>
        <View
          className="relative overflow-hidden rounded-xl border p-3"
          style={{
            minHeight: 142,
            backgroundColor: palette.panelRaised,
            borderColor: palette.line,
          }}
        >
          <View
            className="absolute bottom-0 top-0"
            style={{
              left: "72%",
              width: "28%",
              backgroundColor: palette.criticalSoft,
              opacity: 0.35,
            }}
          />
          <View
            className="absolute bottom-0 top-0"
            style={{ left: "91%", width: 2, backgroundColor: palette.critical }}
          />
          <View className="mb-3 flex-row gap-2">
            <TimelineBlock
              label={`${orderNumber} · ${planned} kg`}
              flex={18}
              tone="production"
            />
            <TimelineBlock
              label="Recommended maintenance · 4.5h"
              flex={11}
              tone="maintenance"
            />
            <TimelineBlock
              label="10009261 · 18.4t"
              flex={22}
              tone="production"
            />
            <TimelineBlock label="Idle · 6h" flex={8} />
            <TimelineBlock
              label="10009272 · 9.2t"
              flex={18}
              tone="production"
            />
            <TimelineBlock label="Risk exposure" flex={12} tone="risk" />
          </View>
          <View
            className="flex-row flex-wrap items-center justify-between gap-3 border-t pt-3"
            style={{ borderColor: palette.line }}
          >
            <View>
              <Text
                className="font-body-medium text-[10px]"
                style={{ color: palette.accentValue }}
              >
                Best intervention · today 19:00
              </Text>
              <Text
                className="mt-1 font-body text-[9px]"
                style={{ color: palette.inkMuted }}
              >
                No order displaced · 4.5 h available · next order protected
              </Text>
            </View>
            <View className="flex-row gap-2">
              <SapButton label="Compare scenarios" compact />
              <SapButton label="Build planning proposal" primary compact />
            </View>
          </View>
        </View>
      </SectionCard>

      <View className="mb-3 flex-row flex-wrap gap-3">
        <SectionCard style={{ flexGrow: 1, flexBasis: 560, minWidth: 300 }}>
          <SectionHeader
            title="Order impact matrix"
            description="Prioritised by overlap with the machine-risk forecast—not only by due date."
            action={<Sparkles size={16} color={palette.warning} />}
          />
          <OrderRow
            order="10009248"
            product="HDPE compound"
            window="Now → 18:30"
            exposure="Protected"
            progress={68}
            tone="success"
          />
          <OrderRow
            order="10009261"
            product="LDPE masterbatch"
            window="Tomorrow 00:30"
            exposure="Low"
            progress={12}
            tone="neutral"
          />
          <OrderRow
            order="10009272"
            product="PP GF30"
            window="Thu 08:00"
            exposure="Elevated"
            progress={0}
            tone="warning"
          />
          <OrderRow
            order="10009280"
            product="Export grade HDPE"
            window="Sun 06:00"
            exposure="Critical overlap"
            progress={0}
            tone="critical"
          />
        </SectionCard>
        <SectionCard style={{ flexGrow: 1, flexBasis: 360, minWidth: 290 }}>
          <SectionHeader
            title="Decision cockpit"
            description="Side-by-side operational consequences for planner review."
          />
          <Scenario
            label="Continue unchanged"
            tone="critical"
            facts={[
              "3 orders enter risk window",
              "52.8t output exposed",
              "Failure margin narrows",
            ]}
          />
          <Scenario
            label="Service tonight · recommended"
            tone="success"
            facts={[
              "0 orders displaced",
              "36.4t output protected",
              "Bearing readiness 67%",
            ]}
          />
          <Text
            className="mt-3 font-body text-[9px] leading-[14px]"
            style={{ color: palette.inkFaint }}
          >
            ULTRON does not reschedule or release a SAP order automatically. An
            approved workflow should create the final maintenance order or
            schedule change in SAP.
          </Text>
        </SectionCard>
      </View>

      <View className="flex-row flex-wrap gap-3">
        <SectionCard style={{ flexGrow: 1, flexBasis: 520, minWidth: 290 }}>
          <SectionHeader
            title="Active SAP production context"
            description={
              live
                ? "Values below are sourced from the latest SAP cache."
                : "Example values remain visible until a SAP connection is synchronized."
            }
            action={<StatusPill label={status} tone="success" />}
          />
          <View className="flex-row flex-wrap items-end justify-between gap-3">
            <View>
              <Text
                className="font-mono text-[21px]"
                style={{ color: palette.ink }}
              >
                {orderNumber}
              </Text>
              <Text
                className="mt-1 font-body text-[10px]"
                style={{ color: palette.inkMuted }}
              >
                {material} · work centre EXT-01
              </Text>
            </View>
            <View>
              <Text
                className="font-mono text-[8px] uppercase"
                style={{ color: palette.inkFaint }}
              >
                Confirmed / planned
              </Text>
              <Text
                className="mt-1 font-mono text-[14px]"
                style={{ color: palette.ink }}
              >
                {confirmed} / {planned} kg
              </Text>
            </View>
          </View>
          <View
            className="mt-3 overflow-hidden rounded-full"
            style={{ height: 6, backgroundColor: palette.track }}
          >
            <View
              style={{
                width: "68%",
                height: 6,
                backgroundColor: palette.accent,
              }}
            />
          </View>
          <View className="mt-4 flex-row flex-wrap gap-3">
            <Fact label="Machine" value="TSE-01" />
            <Fact label="Work centre" value="EXT-01" />
            <Fact label="Finish" value="18:30 today" />
            <Fact label="Health constraint" value="Elevated" tone="warning" />
          </View>
        </SectionCard>
        <SectionCard style={{ flexGrow: 1, flexBasis: 420, minWidth: 290 }}>
          <SectionHeader
            title="Maintenance readiness gate"
            description="The window is only actionable when every gate has an accountable owner."
            action={<CalendarClock size={17} color={palette.warning} />}
          />
          <Readiness
            label="Production clearance"
            detail="No order displaced"
            percent={100}
          />
          <Readiness
            label="Technician capacity"
            detail="Shift B reserved"
            percent={85}
          />
          <Readiness
            label="Bearing and consumables"
            detail="One shortage unresolved"
            percent={67}
            warning
          />
          <Readiness
            label="Permit and isolation"
            detail="Draft checklist ready"
            percent={80}
          />
        </SectionCard>
      </View>
    </View>
  );
}

function Signal({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  tone?: "neutral" | "warning" | "success";
}) {
  const palette = useSapPalette();
  const color =
    tone === "warning"
      ? palette.warningValue
      : tone === "success"
        ? palette.accentValue
        : palette.ink;
  return (
    <View
      className="min-w-[220px] flex-1 flex-row items-center gap-3 rounded-xl border p-3"
      style={{
        backgroundColor: palette.panelRaised,
        borderColor: palette.line,
      }}
    >
      <Icon size={17} color={color} />
      <View>
        <Text
          className="font-mono text-[8px] uppercase"
          style={{ color: palette.inkFaint }}
        >
          {label}
        </Text>
        <Text className="mt-1 font-body-medium text-[10px]" style={{ color }}>
          {value}
        </Text>
      </View>
    </View>
  );
}
function TimelineBlock({
  label,
  flex,
  tone = "idle",
}: {
  label: string;
  flex: number;
  tone?: "production" | "maintenance" | "risk" | "idle";
}) {
  const p = useSapPalette();
  const c =
    tone === "production"
      ? { bg: p.accentSoft, border: p.accentBorder, text: p.accent }
      : tone === "maintenance"
        ? { bg: p.warningSoft, border: p.warningBorder, text: p.warningValue }
        : tone === "risk"
          ? {
              bg: p.criticalSoft,
              border: p.criticalBorder,
              text: p.criticalValue,
            }
          : { bg: p.panel, border: p.line, text: p.inkFaint };
  return (
    <View
      className="min-w-0 rounded-lg border px-2 py-3"
      style={{ flex, backgroundColor: c.bg, borderColor: c.border }}
    >
      <Text
        numberOfLines={2}
        className="font-mono text-[8px] leading-[12px]"
        style={{ color: c.text }}
      >
        {label}
      </Text>
    </View>
  );
}
function OrderRow({
  order,
  product,
  window,
  exposure,
  progress,
  tone,
}: {
  order: string;
  product: string;
  window: string;
  exposure: string;
  progress: number;
  tone: "success" | "neutral" | "warning" | "critical";
}) {
  const p = useSapPalette();
  return (
    <View
      className="mb-2 flex-row flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{ borderColor: p.line, backgroundColor: p.panelRaised }}
    >
      <View style={{ width: 82 }}>
        <Text className="font-mono text-[10px]" style={{ color: p.ink }}>
          {order}
        </Text>
        <Text
          className="mt-1 font-body text-[8px]"
          style={{ color: p.inkFaint }}
        >
          {progress}% complete
        </Text>
      </View>
      <View className="min-w-[130px] flex-1">
        <Text className="font-body-medium text-[10px]" style={{ color: p.ink }}>
          {product}
        </Text>
        <Text
          className="mt-1 font-body text-[8px]"
          style={{ color: p.inkMuted }}
        >
          {window}
        </Text>
      </View>
      <StatusPill label={exposure} tone={tone} />
    </View>
  );
}
function Scenario({
  label,
  tone,
  facts,
}: {
  label: string;
  tone: "success" | "critical";
  facts: string[];
}) {
  const p = useSapPalette();
  return (
    <View
      className="mb-2 rounded-xl border p-3"
      style={{
        backgroundColor: tone === "success" ? p.accentSoft : p.criticalSoft,
        borderColor: tone === "success" ? p.accentBorder : p.criticalBorder,
      }}
    >
      <View className="mb-2 flex-row items-center justify-between">
        <Text
          className="font-body-medium text-[10.5px]"
          style={{ color: p.ink }}
        >
          {label}
        </Text>
        <StatusPill
          label={tone === "success" ? "Preferred" : "Higher risk"}
          tone={tone}
        />
      </View>
      {facts.map((fact) => (
        <Text
          key={fact}
          className="mt-1 font-body text-[9px]"
          style={{ color: p.inkMuted }}
        >
          • {fact}
        </Text>
      ))}
    </View>
  );
}
function Readiness({
  label,
  detail,
  percent,
  warning = false,
}: {
  label: string;
  detail: string;
  percent: number;
  warning?: boolean;
}) {
  const p = useSapPalette();
  const color = warning ? p.warning : p.accent;
  return (
    <View className="mb-3">
      <View className="mb-1.5 flex-row justify-between gap-3">
        <View>
          <Text
            className="font-body-medium text-[9.5px]"
            style={{ color: p.ink }}
          >
            {label}
          </Text>
          <Text
            className="mt-0.5 font-body text-[8px]"
            style={{ color: p.inkMuted }}
          >
            {detail}
          </Text>
        </View>
        <Text className="font-mono text-[9px]" style={{ color }}>
          {percent}%
        </Text>
      </View>
      <View
        className="overflow-hidden rounded-full"
        style={{ height: 4, backgroundColor: p.track }}
      >
        <View
          style={{ width: `${percent}%`, height: 4, backgroundColor: color }}
        />
      </View>
    </View>
  );
}
