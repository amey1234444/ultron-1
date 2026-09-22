import { Download, RotateCcw } from "lucide-react-native";
import { Text, View } from "react-native";

import { API_HEALTH, AUDIT_ROWS } from "../sapDemoData";
import {
  MetricCard,
  MetricRow,
  SapButton,
  SapTable,
  SectionCard,
  SectionHeader,
  StatusPill,
  useSapPalette,
} from "../SapUi";
import type { SapTone } from "../types";

export function SyncAuditTab({
  live = false,
  audit = [],
  outbox = [],
}: {
  live?: boolean;
  audit?: Record<string, unknown>[];
  outbox?: Record<string, unknown>[];
}) {
  const palette = useSapPalette();
  const successful = audit.filter((entry) => entry.status === "success").length;
  const latencyValues = audit
    .map((entry) => Number(entry.durationMs))
    .filter((entry) => Number.isFinite(entry));
  const latency = latencyValues.length
    ? Math.round(
        latencyValues.reduce((sum, entry) => sum + entry, 0) /
          latencyValues.length,
      )
    : 0;
  const queueDepth = outbox.filter(
    (entry) => entry.state !== "completed",
  ).length;
  return (
    <View>
      <View className="mb-3 flex-row flex-wrap items-start justify-between gap-3">
        <View className="min-w-[260px] flex-1">
          <Text
            className="font-body-medium text-[14px]"
            style={{ color: palette.ink }}
          >
            Sync operations & audit
          </Text>
          <Text
            className="mt-1 font-body text-[11px]"
            style={{ color: palette.inkMuted }}
          >
            Connector health, durable delivery, field-level traceability and
            reconciliation.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <StatusPill
            label={
              live ? "Live event channel ready" : "Waiting for SAP connection"
            }
            tone={live ? "success" : "neutral"}
          />
          <SapButton label="Export audit CSV" icon={Download} compact />
        </View>
      </View>
      <MetricRow>
        <MetricCard
          label="Success rate · 24h"
          value={
            live && audit.length
              ? `${Math.round((successful / audit.length) * 1000) / 10}%`
              : "99.7%"
          }
          detail={
            live
              ? `${successful} successful recent operations`
              : "3,842 successful operations"
          }
          tone="success"
        />
        <MetricCard
          label="Median SAP latency"
          value={live ? `${latency}ms` : "312ms"}
          detail={live ? "Recent request average" : "P95 1.8 seconds"}
        />
        <MetricCard
          label="Queue depth"
          value={live ? String(queueDepth) : "2"}
          detail={
            live
              ? "Pending, processing or retrying"
              : "One retry, one scheduled"
          }
          tone="warning"
        />
        <MetricCard
          label="Reconciliation drift"
          value="1"
          detail="Priority differs from SAP"
          tone="warning"
        />
      </MetricRow>

      <View className="mb-3 flex-row flex-wrap gap-3">
        <SectionCard style={{ flexGrow: 1, flexBasis: 560, minWidth: 290 }}>
          <SectionHeader
            title="API health matrix"
            description="Only enabled SAP capabilities are monitored"
            action={<StatusPill label="Healthy" tone="success" />}
          />
          <View className="flex-row flex-wrap gap-2">
            {API_HEALTH.map(([name, api, state, tone]) => (
              <View
                key={api}
                className="min-w-[180px] flex-1 rounded-lg border p-3"
                style={{
                  backgroundColor: palette.panelRaised,
                  borderColor: palette.line,
                }}
              >
                <Text
                  className="font-body-medium text-[10.5px]"
                  style={{ color: palette.ink }}
                >
                  {name}
                </Text>
                <View className="mt-2">
                  <StatusPill label={state} tone={tone as SapTone} />
                </View>
                <Text
                  className="mt-2 font-mono text-[8px]"
                  style={{ color: palette.inkFaint }}
                >
                  {api}
                </Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard style={{ flexGrow: 1, flexBasis: 420, minWidth: 290 }}>
          <SectionHeader
            title="Durable outbox queue"
            description="Approved writes survive restarts and timeouts"
            action={<StatusPill label="1 retry" tone="warning" />}
          />
          {[
            ["Retrying", "material.read · BRG-6208", "attempt 2/5", "warning"],
            ["Scheduled", "equipment.delta · plant 1000", "in 3m", "neutral"],
            ["Complete", "notification.create · MC-198", "10004711", "success"],
          ].map(([state, operation, meta, tone]) => (
            <View
              key={operation}
              className="flex-row flex-wrap items-center gap-3 border-t py-2.5 first:border-t-0"
              style={{ borderColor: palette.lineSubtle }}
            >
              <View className="w-[82px]">
                <StatusPill label={state} tone={tone as SapTone} />
              </View>
              <Text
                className="min-w-[170px] flex-1 font-body text-[10px]"
                style={{ color: palette.ink }}
              >
                {operation}
              </Text>
              <Text
                className="font-mono text-[9px]"
                style={{ color: palette.inkMuted }}
              >
                {meta}
              </Text>
            </View>
          ))}
          <View
            className="mt-3 border-l-2 pl-3"
            style={{ borderColor: palette.info }}
          >
            <Text
              className="font-body text-[9.5px] leading-[15px]"
              style={{ color: palette.inkMuted }}
            >
              Retries reuse the original idempotency key, preventing duplicate
              notifications and measurement documents.
            </Text>
          </View>
          <View className="mt-3">
            <SapButton
              label="Retry selected operation"
              icon={RotateCcw}
              compact
            />
          </View>
        </SectionCard>
      </View>

      <View className="flex-row flex-wrap gap-3">
        <SectionCard style={{ flexGrow: 1, flexBasis: 720, minWidth: 300 }}>
          <SectionHeader
            title="Audit event stream"
            description="Actor, SAP object, response and correlation identity"
            action={
              <StatusPill label="Last 24 hours" tone="neutral" dot={false} />
            }
          />
          <SapTable
            columns={[
              "Time",
              "Operation",
              "Object",
              "Actor",
              "Result",
              "Correlation",
            ]}
            widths={[95, 190, 130, 120, 130, 140]}
            rows={AUDIT_ROWS.map(
              ([time, operation, object, actor, result, correlation]) => [
                <Text
                  className="font-mono text-[9px]"
                  style={{ color: palette.inkMuted }}
                >
                  {time}
                </Text>,
                operation,
                <Text
                  className="font-mono text-[9px]"
                  style={{ color: palette.ink }}
                >
                  {object}
                </Text>,
                actor,
                <StatusPill
                  label={result}
                  tone={result === "Timeout" ? "warning" : "success"}
                  dot={false}
                />,
                <Text
                  className="font-mono text-[9px]"
                  style={{ color: palette.inkFaint }}
                >
                  {correlation}
                </Text>,
              ],
            )}
          />
        </SectionCard>

        <SectionCard style={{ flexGrow: 1, flexBasis: 320, minWidth: 280 }}>
          <SectionHeader
            title="Field-level reconciliation"
            description="SAP remains owner of priority and schedule"
            action={<StatusPill label="1 mismatch" tone="warning" />}
          />
          {[
            ["Object", "Notification 10004711"],
            ["Field", "Priority · SAP-owned"],
            ["ULTRON cache", "Medium · 2h old"],
            ["SAP current", "High · now"],
          ].map(([label, value]) => (
            <View
              key={label}
              className="flex-row items-center gap-3 border-t py-2.5 first:border-t-0"
              style={{ borderColor: palette.lineSubtle }}
            >
              <Text
                className="w-[100px] font-mono text-[9px] uppercase"
                style={{ color: palette.inkFaint }}
              >
                {label}
              </Text>
              <Text
                className="flex-1 font-body text-[10.5px]"
                style={{
                  color:
                    label === "SAP current"
                      ? palette.warningValue
                      : palette.ink,
                }}
              >
                {value}
              </Text>
            </View>
          ))}
          <View className="mt-3 flex-row flex-wrap gap-2">
            <SapButton label="Accept SAP value" primary compact />
            <SapButton label="Open full diff" compact />
          </View>
        </SectionCard>
      </View>
    </View>
  );
}
