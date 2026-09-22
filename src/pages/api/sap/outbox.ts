import type { NextApiRequest, NextApiResponse } from "next";

import { USER_PERMISSIONS, userHasPermission } from "../../../lib/roles";
import { query } from "../../../server/db";
import { sendApiError } from "../../../server/errors";
import { enforceRateLimit } from "../../../server/rateLimit";
import { guardRequest } from "../../../server/security";
import { requireUser } from "../../../server/session";
import { processDueSapOutbox } from "../../../server/sap/service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (guardRequest(req, res)) return;
    const user = await requireUser(req);
    await enforceRateLimit(req, res, "api");
    if (req.method === "GET") {
      const connectionId =
        typeof req.query.connectionId === "string"
          ? req.query.connectionId
          : "";
      if (!connectionId)
        return res.status(400).json({ error: "Connection ID is required." });
      const result = await query<Record<string, unknown>>(
        `SELECT id::text,operation,object_type AS "objectType",object_key AS "objectKey",state,attempts,
                next_attempt_at AS "nextAttemptAt",last_error AS "lastError",correlation_id AS "correlationId",
                created_at AS "createdAt",processed_at AS "processedAt"
         FROM sap_outbox WHERE connection_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [connectionId],
      );
      return res.status(200).json({ jobs: result.rows });
    }
    if (req.method === "POST") {
      if (!userHasPermission(user, USER_PERMISSIONS.SAP_RETRY))
        return res
          .status(403)
          .json({ error: "You do not have permission to retry SAP writes." });
      return res
        .status(200)
        .json({ processed: await processDueSapOutbox(user.id) });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return sendApiError(res, error, "api/sap/outbox");
  }
}
