import type { NextApiRequest, NextApiResponse } from "next";

import { ApiError, sendApiError } from "../../../server/errors";
import { enforceRateLimit } from "../../../server/rateLimit";
import { guardRequest } from "../../../server/security";
import { requireUser } from "../../../server/session";
import { sapDashboard } from "../../../server/sap/service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (guardRequest(req, res)) return;
    await requireUser(req);
    await enforceRateLimit(req, res, "api");
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed." });
    }
    const id =
      typeof req.query.connectionId === "string"
        ? req.query.connectionId
        : undefined;
    return res.status(200).json(await sapDashboard(id));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404)
      return res.status(200).json({ configured: false, resources: {} });
    return sendApiError(res, error, "api/sap/dashboard");
  }
}
