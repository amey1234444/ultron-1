import type { NextApiRequest, NextApiResponse } from "next";

import { USER_PERMISSIONS, userHasPermission } from "../../../lib/roles";
import { sendApiError } from "../../../server/errors";
import { enforceRateLimit } from "../../../server/rateLimit";
import { guardRequest } from "../../../server/security";
import { requireUser } from "../../../server/session";
import { syncSapConnection } from "../../../server/sap/service";
import {
  SAP_RESOURCE_NAMES,
  type SapResourceName,
} from "../../../server/sap/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (guardRequest(req, res)) return;
    const user = await requireUser(req);
    await enforceRateLimit(req, res, "api");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    if (!userHasPermission(user, USER_PERMISSIONS.SAP_VIEW))
      return res.status(403).json({ error: "You do not have SAP access." });
    const connectionId =
      typeof req.body?.connectionId === "string" ? req.body.connectionId : "";
    if (!connectionId)
      return res.status(400).json({ error: "Connection ID is required." });
    const requested = Array.isArray(req.body?.resources)
      ? req.body.resources
      : [];
    const resources = requested.filter(
      (value: unknown): value is SapResourceName =>
        SAP_RESOURCE_NAMES.includes(value as SapResourceName),
    );
    return res
      .status(200)
      .json(
        await syncSapConnection(
          connectionId,
          user.id,
          resources.length ? resources : undefined,
        ),
      );
  } catch (error) {
    return sendApiError(res, error, "api/sap/sync");
  }
}
