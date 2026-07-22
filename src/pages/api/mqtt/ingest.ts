import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { ingestMqttMessage, normalizeWebhookMessage } from '../../../server/mqttIngest';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

function headerValue(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function topicFromRequest(req: NextApiRequest, bodyTopic: string | null): string | null {
  const queryTopic = typeof req.query.topic === 'string' ? req.query.topic : null;
  return bodyTopic ?? headerValue(req, 'x-mqtt-topic') ?? queryTopic;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const expectedSecret = process.env.MQTT_INGEST_SECRET;
    if (!expectedSecret) return res.status(503).json({ error: 'MQTT_INGEST_SECRET is not configured.' });

    const receivedSecret = headerValue(req, 'x-ultron-ingest-secret');
    if (receivedSecret !== expectedSecret) return res.status(401).json({ error: 'Unauthorized.' });

    const { topic: bodyTopic, message, sourceEvent } = normalizeWebhookMessage(req.body);
    const topic = topicFromRequest(req, bodyTopic);
    if (!topic) return res.status(400).json({ error: 'Missing MQTT topic.' });

    const result = await ingestMqttMessage(topic, message, sourceEvent);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return sendApiError(res, err, 'api/mqtt/ingest');
  }
}
