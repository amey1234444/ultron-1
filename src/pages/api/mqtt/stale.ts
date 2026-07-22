import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { markStaleGateways } from '../../../server/mqttIngest';

const DEFAULT_STALE_AFTER_S = 15;

function headerValue(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function expectedBearerSecret(): string | undefined {
  return process.env.CRON_SECRET || process.env.MQTT_INGEST_SECRET;
}

function staleAfterSeconds(): number {
  const value = Number(process.env.MQTT_STALE_AFTER_S ?? DEFAULT_STALE_AFTER_S);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_STALE_AFTER_S;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const expectedSecret = expectedBearerSecret();
    if (!expectedSecret) return res.status(503).json({ error: 'CRON_SECRET or MQTT_INGEST_SECRET is not configured.' });

    const authorization = headerValue(req, 'authorization');
    if (authorization !== `Bearer ${expectedSecret}`) return res.status(401).json({ error: 'Unauthorized.' });

    const staleAfterS = staleAfterSeconds();
    await markStaleGateways(staleAfterS);
    return res.status(200).json({ ok: true, staleAfterS });
  } catch (err) {
    return sendApiError(res, err, 'api/mqtt/stale');
  }
}
