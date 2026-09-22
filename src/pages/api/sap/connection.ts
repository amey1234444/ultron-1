import type { NextApiRequest, NextApiResponse } from "next";

import { USER_PERMISSIONS, userHasPermission } from "../../../lib/roles";
import { sendApiError } from "../../../server/errors";
import { enforceRateLimit } from "../../../server/rateLimit";
import { guardRequest } from "../../../server/security";
import { requireUser } from "../../../server/session";
import {
  listSapConnections,
  saveSapConnection,
} from "../../../server/sap/repository";
import { verifySapConnection } from "../../../server/sap/service";
import type { SapConnectionInput } from "../../../server/sap/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (guardRequest(req, res)) return;
    const user = await requireUser(req);
    await enforceRateLimit(req, res, "api");
    if (req.method === "GET")
      return res.status(200).json({ connections: await listSapConnections() });
    if (!userHasPermission(user, USER_PERMISSIONS.SAP_CONNECTION_CONFIGURE)) {
      return res
        .status(403)
        .json({ error: "You do not have permission to configure SAP." });
    }
    if (req.method === "PUT") {
      const connection = await saveSapConnection(
        (req.body ?? {}) as SapConnectionInput,
        user.id,
      );
      return res.status(200).json({ connection });
    }
    if (req.method === "POST") {
      const id = typeof req.body?.id === "string" ? req.body.id : "";
      if (!id)
        return res.status(400).json({ error: "Connection ID is required." });
      return res.status(200).json(await verifySapConnection(id, user.id));
    }
    res.setHeader("Allow", "GET, PUT, POST");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    return sendApiError(res, error, "api/sap/connection");
  }
}
