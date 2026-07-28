// Broker access for the browser.
//
// The lowest-latency path from gateway to canvas is no backend at all: the
// browser subscribes to EMQX over MQTT/WebSocket and renders each message as it
// arrives, while the broker's HTTP action keeps feeding persistence. Vercel
// cannot hold a broker connection open (a function only lives for one request),
// so the subscriber is the client and this route only hands out the credentials.
//
// The credentials are therefore session-gated and must belong to a
// subscribe-only broker user: anything served here is visible to the browser.

import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';

const DEFAULT_TOPICS = [
  'ultron/v1/gateways/+/status',
  'ultron/v1/gateways/+/topology',
  'ultron/v1/gateways/+/racks/+/health',
  'ultron/v1/gateways/+/racks/+/inventory',
  'ultron/v1/gateways/+/racks/+/telemetry',
  'ultron/v1/gateways/+/racks/+/telemetry/latest',
];

export type BrokerConfig = {
  enabled: boolean;
  url?: string;
  username?: string;
  password?: string;
  topics?: string[];
  clientIdPrefix?: string;
};

function topics(): string[] {
  const configured = process.env.MQTT_BROWSER_TOPICS;
  if (!configured) return DEFAULT_TOPICS;
  return configured.split(',').map((topic) => topic.trim()).filter(Boolean);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<BrokerConfig | { error: string }>) {
  try {
    if (guardRequest(req, res)) return;
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const url = process.env.MQTT_BROWSER_WS_URL;
    res.setHeader('Cache-Control', 'no-store');
    // Not configured is a normal state, not an error: the client falls back to
    // the SSE stream and polling.
    if (!url) return res.status(200).json({ enabled: false });

    return res.status(200).json({
      enabled: true,
      url,
      username: process.env.MQTT_BROWSER_USERNAME,
      password: process.env.MQTT_BROWSER_PASSWORD,
      topics: topics(),
      clientIdPrefix: process.env.MQTT_BROWSER_CLIENT_ID_PREFIX ?? 'ultron-ui',
    });
  } catch (err) {
    return sendApiError(res, err, 'api/live/broker');
  }
}
