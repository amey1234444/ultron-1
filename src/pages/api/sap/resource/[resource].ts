import type { NextApiRequest, NextApiResponse } from "next";

import { USER_PERMISSIONS, userHasPermission } from "../../../../lib/roles";
import { sendApiError } from "../../../../server/errors";
import { enforceRateLimit } from "../../../../server/rateLimit";
import { guardRequest } from "../../../../server/security";
import { requireUser } from "../../../../server/session";
import { readSapResource } from "../../../../server/sap/client";
import {
  getSapConnection,
  writeSapAudit,
} from "../../../../server/sap/repository";
import { enqueueSapWrite } from "../../../../server/sap/service";
import {
  SAP_RESOURCE_NAMES,
  type SapResourceName,
} from "../../../../server/sap/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (guardRequest(req, res)) return;
    const user = await requireUser(req);
    await enforceRateLimit(req, res, "api");
    const resource =
      typeof req.query.resource === "string" ? req.query.resource : "";
    if (!SAP_RESOURCE_NAMES.includes(resource as SapResourceName))
      return res.status(404).json({ error: "Unknown SAP resource." });
    const resourceName = resource as SapResourceName;
    const connectionId =
      typeof req.query.connectionId === "string"
        ? req.query.connectionId
        : typeof req.body?.connectionId === "string"
          ? req.body.connectionId
          : undefined;
    const connection = await getSapConnection(connectionId);
    if (req.method === "GET") {
      const result = await readSapResource(connection, resourceName, {
        $top: String(Math.min(Number(req.query.top ?? 100), 500)),
      });
      await writeSapAudit({
        connectionId: connection.id,
        userId: user.id,
        action: "resource.read",
        objectType: resourceName,
        direction: "from_sap",
        status: "success",
        httpStatus: result.status,
        durationMs: result.durationMs,
        correlationId: result.correlationId,
      });
      return res.status(200).json(result.data);
    }
    if (req.method === "POST") {
      const permission =
        resourceName === "notifications"
          ? USER_PERMISSIONS.SAP_NOTIFICATION_CREATE
          : resourceName === "measurementDocuments"
            ? USER_PERMISSIONS.SAP_MEASUREMENT_WRITE
            : null;
      if (!permission)
        return res
          .status(405)
          .json({ error: "This SAP resource is read-only." });
      if (!userHasPermission(user, permission))
        return res
          .status(403)
          .json({ error: "You do not have permission for this SAP write." });
      const payload = req.body?.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        return res
          .status(400)
          .json({ error: "A SAP payload object is required." });
      const job = await enqueueSapWrite({
        connectionId: connection.id,
        resource: resourceName,
        payload,
        userId: user.id,
        idempotencyKey: req.headers["idempotency-key"] as string | undefined,
      });
      return res.status(202).json({ job });
    }
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return sendApiError(res, error, "api/sap/resource");
  }
}
