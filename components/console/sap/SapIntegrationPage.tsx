import { RefreshCw, Settings } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";

import { useAppTheme } from "../../../hooks/useAppTheme";
import { cn } from "../../../lib/cn";
import type { PublicUser } from "../../../src/lib/roles";
import { SapConnectionDialog } from "./SapConnectionDialog";
import { SapButton, StatusPill, useSapPalette } from "./SapUi";
import { EquipmentMappingTab } from "./tabs/EquipmentMappingTab";
import { MaintenanceTab } from "./tabs/MaintenanceTab";
import { MaterialsTab } from "./tabs/MaterialsTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { ProductionTab } from "./tabs/ProductionTab";
import { SyncAuditTab } from "./tabs/SyncAuditTab";
import { SAP_TABS, type SapTabId } from "./types";

export function SapIntegrationPage({
  plantId,
  plantName,
  currentUser,
}: {
  plantId?: string | null;
  plantName?: string | null;
  currentUser?: PublicUser | null;
}) {
  const { isDark } = useAppTheme();
  const palette = useSapPalette();
  const { width } = useWindowDimensions();
  const narrow = width > 0 && width < 720;
  const [tab, setTab] = useState<SapTabId>("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncSeconds, setLastSyncSeconds] = useState(0);
  const [notificationCreated, setNotificationCreated] = useState(false);
  const [dashboard, setDashboard] = useState<SapDashboard | null>(null);
  const [message, setMessage] = useState("");

  const loadDashboard = async () => {
    try {
      const response = await fetch("/api/sap/dashboard", {
        credentials: "include",
      });
      const data = (await response.json()) as SapDashboard & { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "Unable to load SAP data.");
      setDashboard(data);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load SAP data.",
      );
    }
  };

  useEffect(() => {
    void loadDashboard();
    if (typeof EventSource === "undefined") return;
    const events = new EventSource("/api/sap/stream");
    events.addEventListener("refresh", () => void loadDashboard());
    return () => events.close();
  }, []);

  useEffect(() => {
    const timer = setInterval(
      () => setLastSyncSeconds((value) => value + 1),
      1_000,
    );
    return () => clearInterval(timer);
  }, []);

  const lastSyncLabel = useMemo(
    () =>
      lastSyncSeconds < 60
        ? `${lastSyncSeconds} sec ago`
        : `${Math.floor(lastSyncSeconds / 60)} min ago`,
    [lastSyncSeconds],
  );

  const runSync = async () => {
    if (syncing) return;
    if (!dashboard?.connection?.id) {
      setSettingsOpen(true);
      return;
    }
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/sap/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ connectionId: dashboard.connection.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "SAP sync failed.");
      setLastSyncSeconds(0);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SAP sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const createNotification = async () => {
    if (!dashboard?.connection?.id) {
      setSettingsOpen(true);
      return;
    }
    setMessage("");
    try {
      const response = await fetch(
        `/api/sap/resource/notifications?connectionId=${encodeURIComponent(dashboard.connection.id)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            payload: {
              NotificationType: "M1",
              MaintenanceNotificationDesc: `ULTRON predictive alert · ${plantName ?? plantId ?? "Plant"}`,
            },
          }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error ?? "Notification was not accepted.");
      setNotificationCreated(true);
      await loadDashboard();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Notification was not accepted.",
      );
    }
  };

  const connected =
    dashboard?.configured &&
    dashboard.connection?.lastTestStatus === "connected";
  const latestSync = dashboard?.syncRuns?.[0];

  return (
    <View className="flex-1" style={{ backgroundColor: palette.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: narrow ? 14 : 24,
          paddingTop: narrow ? 16 : 22,
          paddingBottom: 48,
        }}
      >
        <View className="mb-5 flex-row flex-wrap items-start justify-between gap-4">
          <View className="min-w-[260px] flex-1">
            <Text
              className={cn(
                "font-heading-medium text-[22px]",
                isDark ? "text-ink" : "text-ink-inverse",
              )}
            >
              SAP Integration
            </Text>
            <Text
              className={cn(
                "mt-1 max-w-[720px] font-body text-[11.5px] leading-[18px]",
                isDark ? "text-ink-muted" : "text-ink-inverse-muted",
              )}
            >
              Connect ULTRON machine intelligence with SAP equipment,
              maintenance, materials, measurements and production execution.
            </Text>
            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <StatusPill
                label={
                  connected
                    ? "SAP connected"
                    : dashboard?.configured
                      ? "Configured · test required"
                      : "Not configured"
                }
                tone={
                  connected
                    ? "success"
                    : dashboard?.configured
                      ? "warning"
                      : "neutral"
                }
              />
              <Text
                className="font-body text-[10.5px]"
                style={{ color: palette.inkMuted }}
              >
                {dashboard?.connection?.name ?? "SAP S/4HANA"} ·{" "}
                {plantName ??
                  plantId ??
                  dashboard?.connection?.defaultPlant ??
                  "Plant"}
              </Text>
              <Text
                className="font-body text-[10.5px]"
                style={{ color: palette.inkFaint }}
              >
                ·
              </Text>
              <Text
                className="font-body text-[10.5px]"
                style={{ color: palette.inkMuted }}
              >
                {latestSync
                  ? `Last sync ${lastSyncLabel}`
                  : "No completed sync yet"}
              </Text>
            </View>
            {message ? (
              <Text
                className="mt-2 font-body text-[10px]"
                style={{ color: palette.criticalValue }}
              >
                {message}
              </Text>
            ) : null}
          </View>
          <View className="flex-row flex-wrap gap-2">
            <SapButton
              label="Connection settings"
              icon={Settings}
              onPress={() => setSettingsOpen(true)}
            />
            <SapButton
              label={syncing ? "Syncing…" : "Sync now"}
              icon={RefreshCw}
              primary
              onPress={runSync}
              disabled={syncing}
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4 border-b"
          style={{ borderColor: palette.line }}
        >
          <View className="flex-row">
            {SAP_TABS.map((entry) => {
              const active = entry.id === tab;
              return (
                <Text
                  key={entry.id}
                  accessibilityRole="button"
                  onPress={() => setTab(entry.id)}
                  className="border-b-2 px-3 py-3 font-body-medium text-[11px]"
                  style={{
                    color: active ? palette.ink : palette.inkMuted,
                    borderColor: active ? palette.accent : "transparent",
                  }}
                >
                  {entry.label}
                </Text>
              );
            })}
          </View>
        </ScrollView>

        {tab === "overview" ? (
          <OverviewTab
            notificationCreated={notificationCreated}
            onCreateNotification={createNotification}
            live={Boolean(connected)}
            counts={{
              equipment: dashboard?.resources?.equipment?.length ?? 0,
              notifications: dashboard?.resources?.notifications?.length ?? 0,
              maintenanceOrders:
                dashboard?.resources?.maintenanceOrders?.length ?? 0,
              materialStock: dashboard?.resources?.materialStock?.length ?? 0,
            }}
          />
        ) : null}
        {tab === "mapping" ? <EquipmentMappingTab /> : null}
        {tab === "maintenance" ? (
          <MaintenanceTab
            notificationCreated={notificationCreated}
            onCreateNotification={createNotification}
          />
        ) : null}
        {tab === "materials" ? <MaterialsTab /> : null}
        {tab === "production" ? (
          <ProductionTab
            orders={dashboard?.resources?.productionOrders ?? []}
            live={Boolean(connected)}
          />
        ) : null}
        {tab === "audit" ? (
          <SyncAuditTab
            live={Boolean(connected)}
            audit={dashboard?.audit ?? []}
            outbox={dashboard?.outbox ?? []}
          />
        ) : null}
      </ScrollView>
      <SapConnectionDialog
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        connection={dashboard?.connection ?? null}
        canConfigure={
          currentUser?.role === "super_admin" ||
          Boolean(currentUser?.permissions.includes("sap.connection.configure"))
        }
        onSaved={() => void loadDashboard()}
      />
    </View>
  );
}

type SapDashboard = {
  configured: boolean;
  connection?: {
    id: string;
    name: string;
    edition: string;
    baseUrl: string;
    authType: string;
    tokenUrl: string;
    defaultPlant: string;
    lastTestStatus: string;
    lastTestDetail: string;
    credentialStatus: string;
  };
  resources?: {
    equipment?: Record<string, unknown>[];
    notifications?: Record<string, unknown>[];
    maintenanceOrders?: Record<string, unknown>[];
    materialStock?: Record<string, unknown>[];
    productionOrders?: Record<string, unknown>[];
  };
  syncRuns?: Array<{ startedAt?: string }>;
  outbox?: Record<string, unknown>[];
  audit?: Record<string, unknown>[];
};
