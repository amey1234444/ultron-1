export const SAP_RESOURCE_NAMES = [
  "equipment",
  "notifications",
  "maintenanceOrders",
  "materialStock",
  "measurementDocuments",
  "productionOrders",
] as const;

export type SapResourceName = (typeof SAP_RESOURCE_NAMES)[number];
export type SapAuthType = "oauth_client_credentials" | "basic";
export type SapEdition =
  "cloud_public" | "cloud_private" | "on_premise" | "integration_suite";

export type SapCredentials = {
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  scope?: string;
};

export type SapServicePaths = Record<SapResourceName, string>;

export type SapConnection = {
  id: string;
  name: string;
  edition: SapEdition;
  baseUrl: string;
  authType: SapAuthType;
  tokenUrl: string;
  credentials: SapCredentials;
  defaultPlant: string;
  servicePaths: SapServicePaths;
  enabled: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string;
  lastTestDetail: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicSapConnection = Omit<SapConnection, "credentials"> & {
  credentialStatus: "configured" | "missing";
};

export type SapConnectionInput = {
  id?: string;
  name: string;
  edition: SapEdition;
  baseUrl: string;
  authType: SapAuthType;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  scope?: string;
  defaultPlant?: string;
  servicePaths?: Partial<SapServicePaths>;
  enabled?: boolean;
};

export type SapODataPage = {
  records: Record<string, unknown>[];
  nextLink: string | null;
  count: number | null;
};

export const DEFAULT_SAP_SERVICE_PATHS: SapServicePaths = {
  equipment: "/sap/opu/odata/sap/API_EQUIPMENT/Equipment",
  notifications:
    "/sap/opu/odata4/sap/api_maintenancenotification/srvd_a2x/sap/api_maintenancenotification/0001/Notification",
  maintenanceOrders:
    "/sap/opu/odata/sap/API_MAINTENANCEORDER_0002/MaintenanceOrder",
  materialStock: "/sap/opu/odata/sap/API_MATERIAL_STOCK_SRV/A_MatlStkInAcctMod",
  measurementDocuments:
    "/sap/opu/odata4/sap/api_measurementdocument/srvd_a2x/sap/MeasurementDocument/0001/MeasurementDocument",
  productionOrders:
    "/sap/opu/odata/sap/API_PRODUCTION_ORDER_2_SRV/A_ProductionOrder_2",
};
