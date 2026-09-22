import { RefreshCw, Send } from "lucide-react-native";
import { Text, View } from "react-native";

import { MAINTENANCE_LANES } from "../sapDemoData";
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

export function MaintenanceTab({
  notificationCreated,
  onCreateNotification,
}: {
  notificationCreated: boolean;
  onCreateNotification: () => void;
}) {
  const palette = useSapPalette();
  return (
    <View>
      <View className="mb-3 flex-row flex-wrap items-start justify-between gap-3">
        <View className="min-w-[260px] flex-1">
          <Text
            className="font-body-medium text-[14px]"
            style={{ color: palette.ink }}
          >
            Maintenance control tower
          </Text>
          <Text
            className="mt-1 font-body text-[11px]"
            style={{ color: palette.inkMuted }}
          >
            ULTRON findings linked to SAP notifications, orders and completion.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <StatusPill label="Live preview" tone="success" />
          <SapButton label="Reconcile status" icon={RefreshCw} compact />
          <SapButton
            label={
              notificationCreated
                ? "Notification created"
                : "Create notification"
            }
            icon={Send}
            primary
            compact
            disabled={notificationCreated}
            onPress={onCreateNotification}
          />
        </View>
      </View>

      <MetricRow>
        <MetricCard
          label="Awaiting approval"
          value={notificationCreated ? "0" : "1"}
          detail="High-confidence ULTRON case"
          tone={notificationCreated ? "success" : "warning"}
        />
        <MetricCard
          label="SAP notifications"
          value={notificationCreated ? "4" : "3"}
          detail="Two linked to orders"
        />
        <MetricCard
          label="Orders in execution"
          value="2"
          detail="One planned for tonight"
        />
        <MetricCard
          label="Status mismatches"
          value="1"
          detail="SAP planner changed priority"
          tone="warning"
        />
      </MetricRow>

      <SectionCard style={{ marginBottom: 12 }}>
        <SectionHeader
          title="Live maintenance lifecycle"
          description="Every card preserves one idempotent ULTRON → SAP business thread"
        />
        <View className="flex-row flex-wrap gap-3">
          {MAINTENANCE_LANES.map((lane, laneIndex) => (
            <View
              key={lane.title}
              className="min-w-[220px] flex-1 rounded-lg border p-3"
              style={{
                backgroundColor: palette.panelRaised,
                borderColor: palette.line,
              }}
            >
              <View className="mb-2 flex-row items-center justify-between">
                <Text
                  className="font-body-medium text-[10.5px]"
                  style={{ color: palette.ink }}
                >
                  {lane.title}
                </Text>
                <StatusPill
                  label={String(lane.items.length)}
                  tone={
                    laneIndex === 0 && !notificationCreated
                      ? "warning"
                      : "neutral"
                  }
                  dot={false}
                />
              </View>
              {lane.items.map((item) => (
                <View
                  key={item.title}
                  className="mt-2 rounded-lg border p-3"
                  style={{
                    backgroundColor: palette.panel,
                    borderColor: palette.lineSubtle,
                  }}
                >
                  <Text
                    className="font-body-medium text-[10.5px]"
                    style={{ color: palette.ink }}
                  >
                    {item.title}
                  </Text>
                  <Text
                    className="mt-1 font-body text-[9.5px] leading-[14px]"
                    style={{ color: palette.inkMuted }}
                  >
                    {item.detail}
                  </Text>
                  <View className="mt-2 flex-row items-center justify-between gap-2">
                    <StatusPill
                      label={item.meta}
                      tone={item.tone}
                      dot={false}
                    />
                    <Text
                      className="font-mono text-[8px]"
                      style={{ color: palette.inkFaint }}
                    >
                      OPEN
                    </Text>
                  </View>
                </View>
              ))}
              {laneIndex === 0 && notificationCreated ? (
                <View
                  className="mt-2 rounded-lg border p-3"
                  style={{
                    backgroundColor: palette.accentSoft,
                    borderColor: palette.accentBorder,
                  }}
                >
                  <Text
                    className="font-body-medium text-[10.5px]"
                    style={{ color: palette.ink }}
                  >
                    TSE-01 · Notification 10004782
                  </Text>
                  <Text
                    className="mt-1 font-body text-[9.5px]"
                    style={{ color: palette.inkMuted }}
                  >
                    Created from MC-204 with the same idempotency key.
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </SectionCard>

      <View className="flex-row flex-wrap gap-3">
        <SectionCard style={{ flexGrow: 1, flexBasis: 500, minWidth: 290 }}>
          <SectionHeader
            title="Selected case · MC-204"
            description="TSE-01 · Gearbox bearing degradation"
            action={
              <StatusPill
                label={notificationCreated ? "Submitted" : "Approval required"}
                tone={notificationCreated ? "success" : "warning"}
              />
            }
          />
          <View className="flex-row flex-wrap gap-3">
            <Fact label="Confidence" value="92%" />
            <Fact label="Estimated RUL" value="9 days" tone="warning" />
            <Fact label="Data quality" value="98%" tone="success" />
          </View>
          <View
            className="mt-3 border-l-2 pl-3"
            style={{ borderColor: palette.info }}
          >
            <Text
              className="font-body text-[10.5px] leading-[17px]"
              style={{ color: palette.inkMuted }}
            >
              Drive-end vibration rose 38% above the 30-day baseline and is
              confirmed by a 6.4 °C temperature increase.
            </Text>
          </View>
          <View className="mt-3 flex-row flex-wrap gap-2">
            <SapButton label="Review SAP payload" primary compact />
            <SapButton label="Open machine evidence" compact />
          </View>
        </SectionCard>

        <SectionCard style={{ flexGrow: 1, flexBasis: 420, minWidth: 290 }}>
          <SectionHeader
            title="SAP object thread"
            description="Real-time status plus explicit field ownership"
            action={<StatusPill label="Synced 18 sec ago" tone="success" />}
          />
          {[
            [
              "Notification 10004711",
              "Description owned by ULTRON",
              "Created",
              "success",
            ],
            [
              "Order 4000216",
              "Priority and schedule owned by SAP",
              "PCNF",
              "success",
            ],
            [
              "Operation 0010",
              "Mechanical inspection in progress",
              "42%",
              "warning",
            ],
            [
              "Post-maintenance verification",
              "ULTRON watches the signal for 48 hours",
              "Pending",
              "neutral",
            ],
          ].map(([title, detail, state, tone]) => (
            <View
              key={title}
              className="flex-row items-center gap-3 border-t py-2.5 first:border-t-0"
              style={{ borderColor: palette.lineSubtle }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    tone === "success"
                      ? palette.accent
                      : tone === "warning"
                        ? palette.warning
                        : palette.neutral,
                }}
              />
              <View className="min-w-[170px] flex-1">
                <Text
                  className="font-body-medium text-[10.5px]"
                  style={{ color: palette.ink }}
                >
                  {title}
                </Text>
                <Text
                  className="mt-0.5 font-body text-[9.5px]"
                  style={{ color: palette.inkMuted }}
                >
                  {detail}
                </Text>
              </View>
              <StatusPill label={state} tone={tone as any} dot={false} />
            </View>
          ))}
        </SectionCard>
      </View>
    </View>
  );
}
