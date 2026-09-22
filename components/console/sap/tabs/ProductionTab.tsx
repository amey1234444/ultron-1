import { CalendarClock } from "lucide-react-native";
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

export function ProductionTab() {
  const palette = useSapPalette();
  return (
    <View>
      <View className="mb-3 flex-row flex-wrap items-start justify-between gap-3">
        <View className="min-w-[260px] flex-1">
          <Text
            className="font-body-medium text-[14px]"
            style={{ color: palette.ink }}
          >
            Production risk planner
          </Text>
          <Text
            className="mt-1 font-body text-[11px]"
            style={{ color: palette.inkMuted }}
          >
            Overlay SAP production orders with ULTRON health and
            remaining-useful-life forecasts.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <StatusPill label="Order delta 22 sec ago" tone="success" />
          <SapButton label="Change work centre" compact />
        </View>
      </View>
      <MetricRow>
        <MetricCard
          label="Active order"
          value="10009248"
          detail="HDPE compound · 68% complete"
        />
        <MetricCard
          label="Orders at risk"
          value="3"
          detail="Inside the 9-day RUL window"
          tone="warning"
        />
        <MetricCard
          label="Protected output"
          value="36.4t"
          detail="If maintenance starts tonight"
          tone="success"
        />
        <MetricCard
          label="Best maintenance window"
          value="19:00"
          detail="4.5 hours before next order"
        />
      </MetricRow>

      <SectionCard style={{ marginBottom: 12 }}>
        <SectionHeader
          title="Seven-day work-centre timeline · EXT-01"
          description="Production orders, recommended maintenance and the predicted critical-risk boundary"
          action={<StatusPill label="RUL 9 days" tone="warning" />}
        />
        <View className="mb-2 flex-row justify-between">
          <Text
            className="font-mono text-[8px]"
            style={{ color: palette.inkFaint }}
          >
            Today 08:00
          </Text>
          <Text
            className="font-mono text-[8px]"
            style={{ color: palette.inkFaint }}
          >
            Tue
          </Text>
          <Text
            className="font-mono text-[8px]"
            style={{ color: palette.inkFaint }}
          >
            Thu
          </Text>
          <Text
            className="font-mono text-[8px]"
            style={{ color: palette.inkFaint }}
          >
            Sat
          </Text>
          <Text
            className="font-mono text-[8px]"
            style={{ color: palette.inkFaint }}
          >
            Mon
          </Text>
        </View>
        <View
          className="relative overflow-hidden rounded-lg p-3"
          style={{ minHeight: 104, backgroundColor: palette.panelRaised }}
        >
          <View
            className="absolute bottom-0 top-0"
            style={{ left: "92%", width: 2, backgroundColor: palette.critical }}
          />
          <View className="flex-row gap-2">
            <TimelineBlock
              label="10009248 · 12.0t"
              flex={15}
              tone="production"
            />
            <TimelineBlock
              label="Maintenance · 4.5h"
              flex={9}
              tone="maintenance"
            />
            <TimelineBlock
              label="10009261 · 18.4t"
              flex={19}
              tone="production"
            />
            <TimelineBlock label="Idle" flex={6} />
            <TimelineBlock
              label="10009272 · 9.2t"
              flex={15}
              tone="production"
            />
            <TimelineBlock label="Idle" flex={5} />
            <TimelineBlock
              label="10009280 · 21.0t"
              flex={19}
              tone="production"
            />
            <TimelineBlock label="Risk" flex={7} tone="risk" />
          </View>
          <Text
            className="mt-5 font-body text-[9px]"
            style={{ color: palette.inkMuted }}
          >
            Recommended window: today 19:00–23:30 · no production order
            displaced · spare readiness 67%
          </Text>
        </View>
      </SectionCard>

      <View className="flex-row flex-wrap gap-3">
        <SectionCard style={{ flexGrow: 1, flexBasis: 520, minWidth: 290 }}>
          <SectionHeader
            title="Active production context"
            description="Associated through explicit machine ↔ SAP work-centre mapping"
            action={<StatusPill label="In process" tone="success" />}
          />
          <View className="flex-row flex-wrap items-end justify-between gap-3">
            <View>
              <Text
                className="font-mono text-[20px]"
                style={{ color: palette.ink }}
              >
                10009248
              </Text>
              <Text
                className="mt-1 font-body text-[10px]"
                style={{ color: palette.inkMuted }}
              >
                HDPE compound · MAT-445001 · Batch B260921-07
              </Text>
            </View>
            <View>
              <Text
                className="font-mono text-[9px] uppercase"
                style={{ color: palette.inkFaint }}
              >
                Completed
              </Text>
              <Text
                className="mt-1 font-mono text-[14px]"
                style={{ color: palette.ink }}
              >
                8,160 / 12,000 kg
              </Text>
            </View>
          </View>
          <View
            className="mt-3 overflow-hidden rounded-full"
            style={{ height: 5, backgroundColor: palette.track }}
          >
            <View
              style={{
                width: "68%",
                height: 5,
                backgroundColor: palette.accent,
              }}
            />
          </View>
          <View className="mt-3 flex-row flex-wrap gap-3">
            <Fact label="Machine" value="TSE-01" />
            <Fact label="Work centre" value="EXT-01" />
            <Fact label="Planned finish" value="18:30 today" />
            <Fact label="Machine risk" value="Elevated" tone="warning" />
          </View>
        </SectionCard>
        <SectionCard style={{ flexGrow: 1, flexBasis: 420, minWidth: 290 }}>
          <SectionHeader
            title="Maintenance Window Finder"
            description="Advisory only — it never changes the SAP schedule automatically"
            action={<CalendarClock size={17} color={palette.warning} />}
          />
          <View className="flex-row flex-wrap gap-3">
            <Fact label="Recommended start" value="Today 19:00" />
            <Fact label="Required duration" value="4.5 hours" />
            <Fact label="Spare readiness" value="67%" tone="warning" />
            <Fact label="Orders displaced" value="0" tone="success" />
          </View>
          <Text
            className="mt-3 font-body text-[10px] leading-[16px]"
            style={{ color: palette.inkMuted }}
          >
            This window finishes before the next order, stays inside the RUL
            safety margin and requires one bearing shortage to be resolved.
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            <SapButton label="Open planning proposal" primary compact />
            <SapButton label="Compare another window" compact />
          </View>
        </SectionCard>
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
  const palette = useSapPalette();
  const colors =
    tone === "production"
      ? {
          bg: palette.accentSoft,
          border: palette.accentBorder,
          text: palette.accent,
        }
      : tone === "maintenance"
        ? {
            bg: palette.warningSoft,
            border: palette.warningBorder,
            text: palette.warningValue,
          }
        : tone === "risk"
          ? {
              bg: palette.criticalSoft,
              border: palette.criticalBorder,
              text: palette.criticalValue,
            }
          : { bg: palette.panel, border: palette.line, text: palette.inkFaint };
  return (
    <View
      className="min-w-0 rounded-md border px-2 py-2"
      style={{ flex, backgroundColor: colors.bg, borderColor: colors.border }}
    >
      <Text
        numberOfLines={1}
        className="font-mono text-[8px]"
        style={{ color: colors.text }}
      >
        {label}
      </Text>
    </View>
  );
}
