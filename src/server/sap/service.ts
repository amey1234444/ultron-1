import crypto from "crypto";

import { ensureSchema, query, withClient } from "../db";
import { ApiError } from "../errors";
import {
  readSapContinuation,
  readSapResource,
  testSapConnection,
  writeSapResource,
} from "./client";
import {
  cacheSapObjects,
  getSapConnection,
  publicConnection,
  publishSapChange,
  recordConnectionTest,
  sapRecordKey,
  writeSapAudit,
} from "./repository";
import { SAP_RESOURCE_NAMES, type SapResourceName } from "./types";

const maxPageSize = () =>
  Math.min(Math.max(Number(process.env.SAP_SYNC_PAGE_SIZE ?? 100), 1), 500);
const maxPages = () =>
  Math.min(Math.max(Number(process.env.SAP_SYNC_MAX_PAGES ?? 5), 1), 25);

export async function verifySapConnection(
  connectionId: string,
  userId: string,
) {
  const connection = await getSapConnection(connectionId);
  const started = Date.now();
  try {
    const result = await testSapConnection(connection);
    await recordConnectionTest(
      connection.id,
      true,
      `Connected · ${result.durationMs} ms`,
    );
    await writeSapAudit({
      connectionId,
      userId,
      action: "connection.test",
      direction: "from_sap",
      status: "success",
      httpStatus: result.status,
      durationMs: result.durationMs,
      correlationId: result.correlationId,
    });
    return {
      ok: true,
      latencyMs: result.durationMs,
      message: "SAP connection and Equipment API are reachable.",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connection failed.";
    await recordConnectionTest(connection.id, false, message);
    await writeSapAudit({
      connectionId,
      userId,
      action: "connection.test",
      status: "failed",
      durationMs: Date.now() - started,
      detail: { message },
    });
    throw error;
  }
}

export async function syncSapConnection(
  connectionId: string,
  userId: string,
  scope?: SapResourceName[],
) {
  await ensureSchema();
  const connection = await getSapConnection(connectionId);
  const resources = scope?.length ? scope : [...SAP_RESOURCE_NAMES];
  const run = await query<{ id: string }>(
    `INSERT INTO sap_sync_runs (connection_id, scope, requested_by) VALUES ($1,$2,$3) RETURNING id::text`,
    [connectionId, resources.join(","), userId],
  );
  const runId = run.rows[0]!.id;
  let objectsRead = 0;
  const errors: Record<string, string> = {};
  const counts: Record<string, number> = {};
  for (const resource of resources) {
    try {
      let result = await readSapResource(connection, resource, {
        $top: String(maxPageSize()),
      });
      const records = [...result.data.records];
      let nextLink = result.data.nextLink;
      let pages = 1;
      while (nextLink && pages < maxPages()) {
        result = await readSapContinuation(connection, nextLink);
        records.push(...result.data.records);
        nextLink = result.data.nextLink;
        pages += 1;
      }
      await cacheSapObjects(connectionId, resource, records, (record, index) =>
        sapRecordKey(resource, record, index),
      );
      counts[resource] = records.length;
      objectsRead += records.length;
      await writeSapAudit({
        connectionId,
        userId,
        action: "resource.sync",
        objectType: resource,
        direction: "from_sap",
        status: "success",
        httpStatus: result.status,
        durationMs: result.durationMs,
        correlationId: result.correlationId,
        detail: {
          count: records.length,
          pages,
          truncated: Boolean(nextLink),
        },
      });
    } catch (error) {
      errors[resource] =
        error instanceof Error ? error.message : "Sync failed.";
      await writeSapAudit({
        connectionId,
        userId,
        action: "resource.sync",
        objectType: resource,
        direction: "from_sap",
        status: "failed",
        detail: { message: errors[resource] },
      });
    }
  }
  const errorCount = Object.keys(errors).length;
  await query(
    `UPDATE sap_sync_runs SET state=$2, objects_read=$3, error_count=$4, detail=$5::jsonb, finished_at=now() WHERE id=$1`,
    [
      runId,
      errorCount === 0
        ? "completed"
        : errorCount === resources.length
          ? "failed"
          : "partial",
      objectsRead,
      errorCount,
      JSON.stringify({ counts, errors }),
    ],
  );
  await publishSapChange({ type: "sync", connectionId, runId });
  return {
    runId,
    state: errorCount === 0 ? "completed" : "partial",
    objectsRead,
    counts,
    errors,
  };
}

const WRITABLE: Partial<Record<SapResourceName, string>> = {
  notifications: "notification.create",
  measurementDocuments: "measurement.create",
};

export async function enqueueSapWrite(input: {
  connectionId: string;
  resource: SapResourceName;
  payload: Record<string, unknown>;
  userId: string;
  idempotencyKey?: string;
}) {
  const operation = WRITABLE[input.resource];
  if (!operation)
    throw new ApiError(400, "This SAP resource is read-only in ULTRON.");
  const key = input.idempotencyKey?.trim() || crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const inserted = await query<{ id: string; state: string }>(
    `INSERT INTO sap_outbox (connection_id, operation, object_type, payload, idempotency_key, correlation_id, created_by)
     VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
     ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
     RETURNING id::text,state`,
    [
      input.connectionId,
      operation,
      input.resource,
      JSON.stringify(input.payload),
      key,
      correlationId,
      input.userId,
    ],
  );
  const job = inserted.rows[0]!;
  if (job.state === "pending" || job.state === "retry")
    await processSapOutboxJob(job.id, input.userId);
  return getOutboxJob(job.id);
}

export async function getOutboxJob(id: string) {
  const result = await query<Record<string, unknown>>(
    `SELECT id::text, operation, object_type AS "objectType", object_key AS "objectKey", state, attempts,
            next_attempt_at AS "nextAttemptAt", last_error AS "lastError", correlation_id AS "correlationId",
            created_at AS "createdAt", processed_at AS "processedAt" FROM sap_outbox WHERE id=$1`,
    [id],
  );
  if (!result.rows[0]) throw new ApiError(404, "SAP outbox job not found.");
  return result.rows[0];
}

export async function processSapOutboxJob(id: string, userId: string) {
  const claimed = await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const result = await client.query<{
        id: string;
        connection_id: string;
        object_type: SapResourceName;
        payload: Record<string, unknown>;
        attempts: number;
        correlation_id: string;
      }>(
        `SELECT id::text,connection_id,object_type,payload,attempts,correlation_id FROM sap_outbox WHERE id=$1 AND state IN ('pending','retry') AND next_attempt_at<=now() FOR UPDATE SKIP LOCKED`,
        [id],
      );
      if (!result.rows[0]) {
        await client.query("COMMIT");
        return null;
      }
      await client.query(
        `UPDATE sap_outbox SET state='processing', attempts=attempts+1, updated_at=now() WHERE id=$1`,
        [id],
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  if (!claimed) return;
  const connection = await getSapConnection(claimed.connection_id);
  try {
    const result = await writeSapResource(
      connection,
      claimed.object_type,
      claimed.payload,
    );
    const objectKey = sapRecordKey(claimed.object_type, result.data, 0);
    await query(
      `UPDATE sap_outbox SET state='completed', object_key=$2, last_error='', processed_at=now(), updated_at=now() WHERE id=$1`,
      [id, objectKey],
    );
    await writeSapAudit({
      connectionId: connection.id,
      userId,
      action: "outbox.write",
      objectType: claimed.object_type,
      objectKey,
      direction: "to_sap",
      status: "success",
      httpStatus: result.status,
      durationMs: result.durationMs,
      correlationId: result.correlationId,
    });
  } catch (error) {
    const attempts = claimed.attempts + 1;
    const terminal = attempts >= 6;
    const delay = [30, 120, 600, 1800, 3600][Math.min(attempts - 1, 4)]!;
    const message =
      error instanceof Error
        ? error.message.slice(0, 500)
        : "SAP write failed.";
    await query(
      `UPDATE sap_outbox SET state=$2,last_error=$3,next_attempt_at=now()+($4::text||' seconds')::interval,updated_at=now() WHERE id=$1`,
      [id, terminal ? "failed" : "retry", message, String(delay)],
    );
    await writeSapAudit({
      connectionId: connection.id,
      userId,
      action: "outbox.write",
      objectType: claimed.object_type,
      direction: "to_sap",
      status: "failed",
      correlationId: claimed.correlation_id,
      detail: { attempts, message },
    });
    throw error;
  } finally {
    await publishSapChange({
      type: "outbox",
      connectionId: claimed.connection_id,
      id,
    });
  }
}

export async function processDueSapOutbox(userId: string, limit = 10) {
  const due = await query<{ id: string }>(
    `SELECT id::text FROM sap_outbox
     WHERE state IN ('pending','retry') AND next_attempt_at <= now()
     ORDER BY next_attempt_at, created_at LIMIT $1`,
    [Math.min(Math.max(limit, 1), 25)],
  );
  const results: Array<{ id: string; state: "completed" | "deferred" }> = [];
  for (const job of due.rows) {
    try {
      await processSapOutboxJob(job.id, userId);
      results.push({ id: job.id, state: "completed" });
    } catch {
      results.push({ id: job.id, state: "deferred" });
    }
  }
  return results;
}

export async function sapDashboard(connectionId?: string | null) {
  const connection = await getSapConnection(connectionId);
  const [cache, runs, outbox, audit, mappingCounts] = await Promise.all([
    query<{
      object_type: SapResourceName;
      payload: Record<string, unknown>;
      synced_at: string;
    }>(
      `SELECT object_type,payload,synced_at FROM (
         SELECT object_type,payload,synced_at,
                row_number() OVER (PARTITION BY object_type ORDER BY synced_at DESC) AS row_num
         FROM sap_object_cache WHERE connection_id=$1
       ) ranked WHERE row_num <= 100 ORDER BY synced_at DESC`,
      [connection.id],
    ),
    query<Record<string, unknown>>(
      `SELECT id::text,state,scope,objects_read AS "objectsRead",error_count AS "errorCount",started_at AS "startedAt",finished_at AS "finishedAt" FROM sap_sync_runs WHERE connection_id=$1 ORDER BY started_at DESC LIMIT 10`,
      [connection.id],
    ),
    query<Record<string, unknown>>(
      `SELECT id::text,operation,object_type AS "objectType",object_key AS "objectKey",state,attempts,last_error AS "lastError",created_at AS "createdAt" FROM sap_outbox WHERE connection_id=$1 ORDER BY created_at DESC LIMIT 20`,
      [connection.id],
    ),
    query<Record<string, unknown>>(
      `SELECT id::text,action,object_type AS "objectType",object_key AS "objectKey",direction,status,http_status AS "httpStatus",duration_ms AS "durationMs",created_at AS "createdAt" FROM sap_audit_log WHERE connection_id=$1 ORDER BY created_at DESC LIMIT 30`,
      [connection.id],
    ),
    query<{ assets: string; materials: string }>(
      `SELECT
         (SELECT count(*)::text FROM sap_asset_mappings WHERE connection_id=$1) AS assets,
         (SELECT count(*)::text FROM sap_material_mappings WHERE connection_id=$1) AS materials`,
      [connection.id],
    ),
  ]);
  const resources: Record<SapResourceName, Record<string, unknown>[]> = {
    equipment: [],
    notifications: [],
    maintenanceOrders: [],
    materialStock: [],
    measurementDocuments: [],
    productionOrders: [],
  };
  for (const row of cache.rows) resources[row.object_type].push(row.payload);
  return {
    configured: true,
    connection: publicConnection(connection),
    resources,
    syncRuns: runs.rows,
    outbox: outbox.rows,
    audit: audit.rows,
    mappings: {
      assets: Number(mappingCounts.rows[0]?.assets ?? 0),
      materials: Number(mappingCounts.rows[0]?.materials ?? 0),
    },
  };
}
