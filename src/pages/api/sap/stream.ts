import type { NextApiRequest, NextApiResponse } from "next";

import { guardRequest } from "../../../server/security";
import { requireUser } from "../../../server/session";

export const config = { api: { bodyParser: false } };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (guardRequest(req, res)) return;
  const user = await requireUser(req).catch(() => null);
  if (!user) return res.status(401).end();
  if (req.method !== "GET") return res.status(405).end();
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(
    `event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
  );
  const timer = setInterval(
    () =>
      res.write(
        `event: refresh\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
      ),
    15000,
  );
  req.on("close", () => {
    clearInterval(timer);
    res.end();
  });
}
