import { Send } from "lucide-react-native";
import { Text, View } from "react-native";

import { SAP_ACTIVITY } from "../sapDemoData";
import {
  ActivityRow,
  Fact,
  MetricCard,
  MetricRow,
  SapButton,
  SectionCard,
  SectionHeader,
  StatusPill,
  useSapPalette,
} from "../SapUi";

export function OverviewTab({
  notificationCreated,
  onCreateNotification,
  live = false,
  counts,
}: {
  notificationCreated: boolean;
  onCreateNotification: () => void;
  live?: boolean;
  counts?: {
    equipment: number;
    notifications: number;
    maintenanceOrders: number;
    materialStock: number;
  };
}) {
  const palette = useSapPalette();
  return (
    <View>
      <MetricRow>
        <MetricCard
          label={live ? "Equipment synchronized" : "Equipment mapped"}
          value={live ? String(counts?.equipment ?? 0) : "24/26"}
          detail={live ? "Latest SAP cache" : "92% mapping coverage"}
        />
        <MetricCard
          label="Open notifications"
          value={live ? String(counts?.notifications ?? 0) : "3"}
          detail={
            live ? "Latest synchronized set" : "One awaiting planner review"
          }
        />
        <MetricCard
          label="Maintenance orders"
          value={live ? String(counts?.maintenanceOrders ?? 0) : "2"}
          detail={live ? "Latest synchronized set" : "One scheduled this week"}
        />
        <MetricCard
          label={live ? "Stock records" : "Spare risks"}
          value={live ? String(counts?.materialStock ?? 0) : "1"}
          detail={
            live
              ? "Material stock rows received"
              : "Bearing stock below requirement"
          }
          tone="warning"
        />
      </MetricRow>

      <View className="mb-3 flex-row flex-wrap gap-3">
        <SectionCard style={{ flexGrow: 1, flexBasis: 560, minWidth: 300 }}>
          <SectionHeader
            title="Action queue"
            description="ULTRON cases requiring an SAP business decision"
            action={
              <StatusPill
                label={notificationCreated ? "Sent to SAP" : "1 approval"}
                tone={notificationCreated ? "success" : "warning"}
                dot
              />
            }
          />
          <View
            className="rounded-lg border p-3"
            style={{
              backgroundColor: palette.panelRaised,
              borderColor: notificationCreated
                ? palette.accentBorder
                : palette.warningBorder,
            }}
          >
            <View className="flex-row flex-wrap items-start justify-between gap-3">
              <View className="min-w-[220px] flex-1">
                <Text
                  className="font-body-medium text-[13px]"
                  style={{ color: palette.ink }}
                >
                  TSE-01 · Gearbox bearing degradation
                </Text>
                <Text
                  className="mt-1 font-body text-[11px] leading-[17px]"
                  style={{ color: palette.inkMuted }}
                >
                  Persistent vibration rise confirmed by temperature and
                  operating-context checks.
                </Text>
              </View>
              <StatusPill label="High" tone="warning" dot={false} />
            </View>
            <View className="mt-3 flex-row flex-wrap gap-3">
              <Fact label="Confidence" value="92%" />
              <Fact label="Estimated RUL" value="9 days" tone="warning" />
              <Fact label="SAP equipment" value="EQ-100034" />
            </View>
            <View className="mt-3 flex-row flex-wrap gap-2">
              <SapButton
                label={
                  notificationCreated
                    ? "Notification 10004782 created"
                    : "Review & create notification"
                }
                icon={Send}
                primary
                disabled={notificationCreated}
                onPress={onCreateNotification}
              />
              <SapButton label="Open machine evidence" />
            </View>
          </View>
        </SectionCard>

        <SectionCard style={{ flexGrow: 1, flexBasis: 320, minWidth: 280 }}>
          <SectionHeader
            title="Digital lifecycle"
            description="TSE-01 · one traceable business thread"
          />
          {[
            ["Fault confirmed", "ULTRON case MC-204", "09:12", true],
            [
              notificationCreated
                ? "Notification created"
                : "Notification approval",
              notificationCreated ? "SAP 10004782" : "Waiting for operator",
              notificationCreated ? "Created" : "Pending",
              notificationCreated,
            ],
            ["Maintenance order", "Created by SAP planner", "—", false],
            ["Parts and schedule", "Synced from SAP", "—", false],
          ].map(([title, detail, time, done], index, all) => (
            <View key={String(title)} className="flex-row gap-3">
              <View className="items-center">
                <View
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    borderWidth: 2,
                    borderColor: done
                      ? palette.accent
                      : index === 1 && !notificationCreated
                        ? palette.warning
                        : palette.lineStrong,
                    backgroundColor: done ? palette.accent : palette.panel,
                  }}
                />
                {index < all.length - 1 ? (
                  <View
                    style={{
                      width: 1,
                      height: 38,
                      backgroundColor: palette.line,
                    }}
                  />
                ) : null}
              </View>
              <View className="min-w-0 flex-1 pb-4">
                <Text
                  className="font-body-medium text-[11px]"
                  style={{ color: palette.ink }}
                >
                  {title}
                </Text>
                <Text
                  className="mt-0.5 font-body text-[10px]"
                  style={{ color: palette.inkMuted }}
                >
                  {detail}
                </Text>
              </View>
              <Text
                className="font-mono text-[9px] uppercase"
                style={{ color: palette.inkFaint }}
              >
                {time}
              </Text>
            </View>
          ))}
        </SectionCard>
      </View>

      <SectionCard>
        <SectionHeader
          title="Recent integration activity"
          description="Latest successful and retried exchanges"
        />
        {SAP_ACTIVITY.map((activity) => (
          <ActivityRow key={`${activity.age}-${activity.text}`} {...activity} />
        ))}
      </SectionCard>
    </View>
  );
}
