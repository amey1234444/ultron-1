import crypto from "crypto";

import type { NextApiRequest, NextApiResponse } from "next";

import { ApiError, sendApiError } from "../../../server/errors";
import { listSapConnections } from "../../../server/sap/repository";
import {
  processDueSapOutbox,
  syncSapConnection,
} from "../../../server/sap/service";

function authorized(req: NextApiRequest): boolean {
  const expected = process.env.SAP_SYNC_CRON_SECRET?.trim();
  if (!expected)
    throw new ApiError(503, "SAP sync scheduler is not configured.");
  const header = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  const suppliedDigest = crypto.createHash("sha256").update(supplied).digest();
  return crypto.timingSafeEqual(expectedDigest, suppliedDigest);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    if (!authorized(req))
      return res.status(401).json({ error: "Invalid scheduler credentials." });
    const connections = (await listSapConnections()).filter(
      (connection) => connection.enabled,
    );
    const runs: Array<{
      connectionId: string;
      state: string;
      objectsRead?: number;
      error?: string;
    }> = [];
    for (const connection of connections) {
      try {
        const result = await syncSapConnection(
          connection.id,
          "system:sap-cron",
        );
        runs.push({
          connectionId: connection.id,
          state: result.state,
          objectsRead: result.objectsRead,
        });
      } catch (error) {
        runs.push({
          connectionId: connection.id,
          state: "failed",
          error: error instanceof Error ? error.message : "Sync failed.",
        });
      }
    }
    const outbox = await processDueSapOutbox("system:sap-cron", 25);
    return res
      .status(200)
      .json({ ok: runs.every((run) => run.state !== "failed"), runs, outbox });
  } catch (error) {
    return sendApiError(res, error, "api/sap/cron");
  }
}
