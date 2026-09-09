// Downlink control: publish a command to a gateway and wait for its answer.
//
// The request goes out as an MQTT publication on the gateway's own
// `commands/request` topic and the answer comes back on `commands/response`,
// which this application is already subscribed to. Nothing here opens a
// connection to the plant — a gateway behind NAT could not accept one — so the
// same broker carries control down and telemetry up.
//
// The broker connection lives in the Node server process (server.mjs), outside
// the bundle Next builds for API routes, so the runtime is reached through the
// handle it publishes on globalThis rather than through an import.

import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { guardRequest } from '../../../server/security';
import { requireUser } from '../../../server/session';

type IngestRuntime = {
  sendCommand: (input: {
    gatewayId: string;
    rackId: string;
    command: string;
    args?: Record<string, unknown>;
    timeoutMs?: number;
  }) => Promise<{ requestId: string; topic: string; response: Record<string, unknown> }>;
  brokerStatus: () => { configured: boolean; connected: boolean };
};

function ingestRuntime(): IngestRuntime | null {
  return (globalThis as { __ultronIngest?: IngestRuntime }).__ultronIngest ?? null;
}

function stringField(body: Record<string, unknown>, name: string): string | null {
  const value = body[name];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    res.setHeader('Cache-Control', 'no-store');
    // Commands change plant state; a read-only session must not be able to send
    // one, so this is admin and above rather than any authenticated user.
    await requireUser(req, 'admin');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const runtime = ingestRuntime();
    // Next's own dev server (`npm run dev`) has no ingest runtime; only
    // `npm run start:render` / `node server.mjs` does.
    if (!runtime) return res.status(503).json({ error: 'Ingest runtime is not running in this process.' });

    const status = runtime.brokerStatus();
    if (!status.configured) return res.status(503).json({ error: 'No MQTT broker is configured.' });
    if (!status.connected) return res.status(503).json({ error: 'The MQTT broker is not connected.' });

    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const gatewayId = stringField(body, 'gatewayId');
    const rackId = stringField(body, 'rackId');
    const command = stringField(body, 'command');
    if (!gatewayId || !rackId || !command) {
      return res.status(400).json({ error: 'gatewayId, rackId and command are required.' });
    }
    const args = typeof body.args === 'object' && body.args !== null ? (body.args as Record<string, unknown>) : {};

    const result = await runtime.sendCommand({ gatewayId, rackId, command, args });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    // A gateway that never answers is a plant condition, not a server fault.
    if (err instanceof Error && err.message.includes('no gateway response')) {
      return res.status(504).json({ error: err.message });
    }
    return sendApiError(res, err, 'api/live/command');
  }
}
