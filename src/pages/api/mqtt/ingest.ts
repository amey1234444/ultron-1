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

function clientIp(req: NextApiRequest): string {
  const forwarded = headerValue(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return req.socket.remoteAddress ?? 'unknown';
}

function messageMeta(message: unknown) {
  if (!message || typeof message !== 'object') return {};
  const m = message as Record<string, unknown>;
  return {
    messageId: typeof m.message_id === 'string' ? m.message_id : undefined,
    schema: typeof m.schema === 'string' ? m.schema : undefined,
    gatewayId: typeof m.gateway_id === 'string' ? m.gateway_id : undefined,
    gatewayIp: typeof m.gateway_ip === 'string' ? m.gateway_ip : undefined,
    rackId: Number.isInteger(m.rack_id) ? m.rack_id : undefined,
  };
}

function logMqttInfo(event: string, details: Record<string, unknown>) {
  console.info(`[api/mqtt/ingest] ${event}`, details);
}

function logMqttFailure(reason: string, details: Record<string, unknown>) {
  const err = new Error(reason);
  console.error(`[api/mqtt/ingest] failed: ${reason}\n${err.stack ?? '(no stack available)'}`, details);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startedAt = Date.now();
  const requestMeta = {
    method: req.method,
    ip: clientIp(req),
    userAgent: headerValue(req, 'user-agent'),
  };
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      logMqttFailure('method not allowed', { ...requestMeta });
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const expectedSecret = process.env.MQTT_INGEST_SECRET;
    if (!expectedSecret) {
      logMqttFailure('MQTT_INGEST_SECRET is not configured', { ...requestMeta });
      return res.status(503).json({ error: 'MQTT_INGEST_SECRET is not configured.' });
    }

    const receivedSecret = headerValue(req, 'x-ultron-ingest-secret');
    if (receivedSecret !== expectedSecret) {
      logMqttFailure('unauthorized mqtt ingest request', { ...requestMeta });
      return res.status(401).json({ error: 'Unauthorized.' });
    }

    const { topic: bodyTopic, message, sourceEvent } = normalizeWebhookMessage(req.body);
    const topic = topicFromRequest(req, bodyTopic);
    const meta = { ...requestMeta, topic, ...messageMeta(message) };
    logMqttInfo('broker request received', meta);

    if (!topic) {
      logMqttFailure('missing MQTT topic', meta);
      return res.status(400).json({ error: 'Missing MQTT topic.' });
    }

    const result = await ingestMqttMessage(topic, message, sourceEvent);
    const resultMeta = { ...meta, ...result, durationMs: Date.now() - startedAt };
    if (result.quarantined || result.bindingStatus === 'QUARANTINED') {
      logMqttFailure(result.reason ?? result.bindingEvent ?? 'mqtt message quarantined', resultMeta);
    } else if (!result.fresh) {
      logMqttInfo('broker request ignored as duplicate or unsupported', resultMeta);
    } else {
      logMqttInfo('broker request stored', resultMeta);
    }
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    logMqttFailure(err instanceof Error ? err.message : 'unhandled mqtt ingest error', {
      ...requestMeta,
      durationMs: Date.now() - startedAt,
    });
    return sendApiError(res, err, 'api/mqtt/ingest');
  }
}
