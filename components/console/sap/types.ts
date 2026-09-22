export type SapTabId =
  "overview" | "mapping" | "maintenance" | "materials" | "production" | "audit";

export type SapTone = "success" | "warning" | "critical" | "neutral" | "info";

export type SapConnectionState = "connected" | "degraded" | "disconnected";

export type SapTabDefinition = {
  id: SapTabId;
  label: string;
};

export const SAP_TABS: SapTabDefinition[] = [
  { id: "overview", label: "Overview" },
  { id: "mapping", label: "Equipment mapping" },
  { id: "maintenance", label: "Maintenance" },
  { id: "materials", label: "Materials" },
  { id: "production", label: "Production" },
  { id: "audit", label: "Sync & audit" },
];
