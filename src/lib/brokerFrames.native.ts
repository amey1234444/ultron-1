// Native builds never subscribe to the broker directly: useLiveTelemetry is
// web-only, and this stub keeps the MQTT/WebSocket client (and its Node shims)
// out of the Metro bundle. Metro prefers this file over brokerFrames.ts.

import type { LiveFrame } from '../../lib/liveTelemetry';

export type BrokerConfig = { enabled: boolean };
export type BrokerSubscription = { close: () => void };

export async function fetchBrokerConfig(): Promise<BrokerConfig> {
  return { enabled: false };
}

export async function subscribeBrokerFrames(
  _config: BrokerConfig,
  _onFrame: (frame: LiveFrame) => void,
  _onStatus?: (connected: boolean) => void,
): Promise<BrokerSubscription | null> {
  return null;
}
