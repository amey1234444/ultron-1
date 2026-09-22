import { RefreshCw, Settings } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";

import { useAppTheme } from "../../../hooks/useAppTheme";
import { cn } from "../../../lib/cn";
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
}: {
  plantId?: string | null;
  plantName?: string | null;
}) {
  const { isDark } = useAppTheme();
  const palette = useSapPalette();
  const { width } = useWindowDimensions();
  const narrow = width > 0 && width < 720;
  const [tab, setTab] = useState<SapTabId>("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncSeconds, setLastSyncSeconds] = useState(44);
  const [notificationCreated, setNotificationCreated] = useState(false);

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

  const runSync = () => {
    if (syncing) return;
    setSyncing(true);
    setTimeout(() => {
      setLastSyncSeconds(0);
      setSyncing(false);
    }, 900);
  };

  const createNotification = () => setNotificationCreated(true);

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
              <StatusPill label="UI preview" tone="info" />
              <Text
                className="font-body text-[10.5px]"
                style={{ color: palette.inkMuted }}
              >
                S/4HANA Sandbox · {plantName ?? plantId ?? "Plant 1000"}
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
                Last simulated sync {lastSyncLabel}
              </Text>
            </View>
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
        {tab === "production" ? <ProductionTab /> : null}
        {tab === "audit" ? <SyncAuditTab /> : null}
      </ScrollView>
      <SapConnectionDialog
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </View>
  );
}
