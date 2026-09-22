import crypto from "crypto";

import { ensureSchema, isDbEnabled, query } from "../db";
import { ApiError } from "../errors";
import { decryptSapCredentials, encryptSapCredentials } from "./crypto";
import {
  DEFAULT_SAP_SERVICE_PATHS,
  type PublicSapConnection,
  type SapConnection,
  type SapConnectionInput,
  type SapCredentials,
  type SapResourceName,
  type SapServicePaths,
} from "./types";
import { normalizeSapBaseUrl } from "./url";

type ConnectionRow = {
  id: string;
  name: string;
  edition: SapConnection["edition"];
  base_url: string;
  auth_type: SapConnection["authType"];
  token_url: string;
  encrypted_credentials: string;
  default_plant: string;
  service_paths: Partial<SapServicePaths> | null;
  enabled: boolean;
  last_tested_at: Date | string | null;
  last_test_status: string;
  last_test_detail: string;
  created_at: Date | string;
  updated_at: Date | string;
};

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function requireDatabase(): void {
  if (!isDbEnabled())
    throw new ApiError(503, "DATABASE_URL is required for SAP integration.");
}

function normalizeServicePaths(
  value: Partial<SapServicePaths> | undefined,
): SapServicePaths {
  const merged = { ...DEFAULT_SAP_SERVICE_PATHS, ...(value ?? {}) };
  for (const [name, path] of Object.entries(merged)) {
    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      path.startsWith("//")
    ) {
      throw new ApiError(
        400,
        `SAP service path ${name} must be an absolute path on the configured SAP host.`,
      );
    }
  }
  return merged;
}

function rowToConnection(row: ConnectionRow): SapConnection {
  return {
    id: row.id,
    name: row.name,
    edition: row.edition,
    baseUrl: row.base_url,
    authType: row.auth_type,
    tokenUrl: row.token_url,
    credentials: decryptSapCredentials(row.encrypted_credentials),
    defaultPlant: row.default_plant,
    servicePaths: normalizeServicePaths(row.service_paths ?? undefined),
    enabled: row.enabled,
    lastTestedAt: iso(row.last_tested_at),
    lastTestStatus: row.last_test_status,
    lastTestDetail: row.last_test_detail,
    createdAt: iso(row.created_at)!,
    updatedAt: iso(row.updated_at)!,
  };
}

export function publicConnection(
  connection: SapConnection,
): PublicSapConnection {
  const { credentials, ...safe } = connection;
  const configured =
    connection.authType === "basic"
      ? Boolean(credentials.username && credentials.password)
      : Boolean(
          credentials.clientId &&
          credentials.clientSecret &&
          connection.tokenUrl,
        );
  return { ...safe, credentialStatus: configured ? "configured" : "missing" };
}

export async function listSapConnections(): Promise<PublicSapConnection[]> {
  requireDatabase();
  await ensureSchema();
  const result = await query<ConnectionRow>(
    "SELECT * FROM sap_connections ORDER BY enabled DESC, updated_at DESC",
  );
  return result.rows.map(rowToConnection).map(publicConnection);
}

export async function getSapConnection(
  id?: string | null,
): Promise<SapConnection> {
  requireDatabase();
  await ensureSchema();
  const result = id
    ? await query<ConnectionRow>(
        "SELECT * FROM sap_connections WHERE id = $1",
        [id],
      )
    : await query<ConnectionRow>(
        "SELECT * FROM sap_connections WHERE enabled = true ORDER BY updated_at DESC LIMIT 1",
      );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, "No enabled SAP connection is configured.");
  return rowToConnection(row);
}

function credentialsFromInput(
  input: SapConnectionInput,
  existing?: SapCredentials,
  tokenUrl = "",
): SapCredentials {
  const credentials: SapCredentials =
    input.authType === "basic"
      ? {
          username: input.username?.trim() || existing?.username,
          password: input.password || existing?.password,
        }
      : {
          clientId: input.clientId?.trim() || existing?.clientId,
          clientSecret: input.clientSecret || existing?.clientSecret,
          scope: input.scope?.trim() || existing?.scope,
        };
  if (
    input.authType === "basic" &&
    (!credentials.username || !credentials.password)
  ) {
    throw new ApiError(400, "SAP username and password are required.");
  }
  if (
    input.authType === "oauth_client_credentials" &&
    (!credentials.clientId || !credentials.clientSecret || !tokenUrl)
  ) {
    throw new ApiError(
      400,
      "OAuth token URL, client ID and client secret are required.",
    );
  }
  return credentials;
}

export async function saveSapConnection(
  input: SapConnectionInput,
  userId: string,
): Promise<PublicSapConnection> {
  requireDatabase();
  await ensureSchema();
  if (
    ![
      "cloud_public",
      "cloud_private",
      "on_premise",
      "integration_suite",
    ].includes(input.edition)
  ) {
    throw new ApiError(400, "Unsupported SAP edition.");
  }
  if (!["oauth_client_credentials", "basic"].includes(input.authType)) {
    throw new ApiError(400, "Unsupported SAP authentication method.");
  }
  if (!input.name?.trim())
    throw new ApiError(400, "Connection name is required.");
  const id = input.id?.trim() || crypto.randomUUID();
  let existing: SapConnection | undefined;
  if (input.id) {
    try {
      existing = await getSapConnection(input.id);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) throw error;
    }
  }
  const baseUrl = normalizeSapBaseUrl(input.baseUrl);
  const tokenUrl =
    input.authType === "oauth_client_credentials"
      ? normalizeSapBaseUrl(input.tokenUrl?.trim() || existing?.tokenUrl || "")
      : "";
  const credentials = credentialsFromInput(
    input,
    existing?.credentials,
    tokenUrl,
  );
  const servicePaths = normalizeServicePaths(
    input.servicePaths ?? existing?.servicePaths,
  );
  const result = await query<ConnectionRow>(
    `INSERT INTO sap_connections
       (id, name, edition, base_url, auth_type, token_url, encrypted_credentials, default_plant,
        service_paths, enabled, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$11)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, edition = EXCLUDED.edition, base_url = EXCLUDED.base_url,
       auth_type = EXCLUDED.auth_type, token_url = EXCLUDED.token_url,
       encrypted_credentials = EXCLUDED.encrypted_credentials, default_plant = EXCLUDED.default_plant,
       service_paths = EXCLUDED.service_paths, enabled = EXCLUDED.enabled,
       updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING *`,
    [
      id,
      input.name.trim() || "SAP S/4HANA",
      input.edition,
      baseUrl,
      input.authType,
      tokenUrl,
      encryptSapCredentials(credentials),
      input.defaultPlant?.trim() ?? "",
      JSON.stringify(servicePaths),
      input.enabled ?? true,
      userId,
    ],
  );
  return publicConnection(rowToConnection(result.rows[0]!));
}

export async function recordConnectionTest(
  id: string,
  ok: boolean,
  detail: string,
): Promise<void> {
  await query(
    `UPDATE sap_connections SET last_tested_at = now(), last_test_status = $2,
       last_test_detail = $3, updated_at = now() WHERE id = $1`,
    [id, ok ? "connected" : "failed", detail.slice(0, 500)],
  );
}

export async function writeSapAudit(input: {
  connectionId?: string | null;
  userId?: string;
  action: string;
  objectType?: string;
  objectKey?: string;
  direction?: "to_sap" | "from_sap" | "internal";
  status: "success" | "warning" | "failed";
  httpStatus?: number;
  durationMs?: number;
  correlationId?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  if (!isDbEnabled()) return;
  await ensureSchema();
  await query(
    `INSERT INTO sap_audit_log
       (connection_id, user_id, action, object_type, object_key, direction, status,
        http_status, duration_ms, correlation_id, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [
      input.connectionId ?? null,
      input.userId ?? "",
      input.action,
      input.objectType ?? "",
      input.objectKey ?? "",
      input.direction ?? "internal",
      input.status,
      input.httpStatus ?? null,
      input.durationMs ?? null,
      input.correlationId ?? "",
      JSON.stringify(input.detail ?? {}),
    ],
  );
  await publishSapChange({
    type: "audit",
    connectionId: input.connectionId ?? null,
    action: input.action,
  });
}

export async function publishSapChange(
  event: Record<string, unknown>,
): Promise<void> {
  if (!isDbEnabled()) return;
  await query(`SELECT pg_notify('ultron_sap', $1)`, [
    JSON.stringify({ ...event, at: new Date().toISOString() }).slice(0, 7900),
  ]);
}

export async function cacheSapObjects(
  connectionId: string,
  objectType: SapResourceName,
  records: Record<string, unknown>[],
  keyFor: (record: Record<string, unknown>, index: number) => string,
): Promise<void> {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    const key = keyFor(record, index);
    await query(
      `INSERT INTO sap_object_cache (connection_id, object_type, object_key, payload, synced_at)
       VALUES ($1,$2,$3,$4::jsonb,now())
       ON CONFLICT (connection_id, object_type, object_key)
       DO UPDATE SET payload = EXCLUDED.payload, synced_at = now()`,
      [connectionId, objectType, key, JSON.stringify(record)],
    );
  }
}

export function sapRecordKey(
  resource: SapResourceName,
  record: Record<string, unknown>,
  index: number,
): string {
  const candidates: Record<SapResourceName, string[]> = {
    equipment: ["Equipment", "EquipmentUUID"],
    notifications: ["MaintenanceNotification", "Notification"],
    maintenanceOrders: ["MaintenanceOrder"],
    materialStock: [
      "Material",
      "Plant",
      "StorageLocation",
      "Batch",
      "InventoryStockType",
    ],
    measurementDocuments: ["MeasurementDocument"],
    productionOrders: ["ProductionOrder"],
  };
  const parts = candidates[resource]
    .map((key) => record[key])
    .filter((value) => value !== undefined && value !== null && value !== "");
  return parts.length > 0
    ? parts.map(String).join("|")
    : `${resource}-${index}`;
}
