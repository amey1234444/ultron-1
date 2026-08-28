import type { NextApiRequest, NextApiResponse } from 'next';

import { storeCompressedHistoryMeasurements, type ChannelHistoryWrite } from '../../../../server/channelHistory';
import { isDbEnabled } from '../../../../server/db';
import { sendApiError } from '../../../../server/errors';
import { enforceRateLimit } from '../../../../server/rateLimit';
import { guardRequest } from '../../../../server/security';
import { getSessionUser } from '../../../../server/session';
import type { LiveMeasurement } from '../../../../../lib/liveTelemetry';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

function measurementToWrite(measurement: LiveMeasurement): ChannelHistoryWrite | null {
  if (!measurement.gatewayId.startsWith('sim-')) return null;
  if (typeof measurement.value !== 'number' || !Number.isFinite(measurement.value)) return null;
  const timestampMs = Date.parse(measurement.updatedAt);
  if (!Number.isFinite(timestampMs)) return null;
  return {
    gatewayId: measurement.gatewayId,
    rackId: measurement.rackId,
    slotId: measurement.slotId,
    channelId: measurement.channelId,
    measurementType: measurement.measurementType,
    value: measurement.value,
    timestampMs,
    unit: measurement.unit,
    quality: measurement.quality,
    cardType: measurement.cardType,
    sensor: measurement.sensor,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    await enforceRateLimit(req, res, 'api');
    if (!isDbEnabled()) return res.status(200).json({ persisted: false, stored: 0 });

    const raw: unknown[] = Array.isArray(req.body?.measurements) ? req.body.measurements : [];
    const writes = raw.slice(0, 5000).map((entry) => measurementToWrite(entry as LiveMeasurement)).filter((entry): entry is ChannelHistoryWrite => entry !== null);
    const stored = await storeCompressedHistoryMeasurements(writes);
    return res.status(200).json({ persisted: true, stored, accepted: writes.length });
  } catch (err) {
    return sendApiError(res, err, 'api/live/history/chunks');
  }
}
