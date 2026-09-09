// Browser end of the pub/sub chain: a subscription to the application's live
// socket, which is fed by the application's own broker subscription.
//
//   gateway ──▶ EMQX ──▶ /ws/live (this app) ──▶ this module ──▶ the canvas
//
// The socket is same-origin and authorized by the ultron_session cookie, so
// there is no token to ship in the bundle. Subscriptions are MQTT topic filters:
// pass `topics` to receive only part of the tree, or leave it unset for the full
// feed the dashboard uses.
//
// Reconnection is the client's job — a dropped socket is the one failure mode
// that silently turns a live dashboard into a stale one — so it retries with
// backoff until closed explicitly.

import type { LiveFrame } from '../../lib/liveTelemetry';

declare const process: { env: Record<string, string | undefined> };

export type LiveSocketConfig = {
  enabled: boolean;
  url?: string;
  topics?: string[];
};

export type LiveSocketSubscription = { close: () => void };

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

export function liveSocketConfig(): LiveSocketConfig {
  // Same-origin by default: ingest runs inside this application, so the socket
  // is on the page's own host. The override exists for split deployments.
  const configured = process.env.NEXT_PUBLIC_ULTRON_LIVE_WS_URL;
  const url = configured || (
    typeof window === 'undefined'
      ? undefined
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/live`
  );
  if (!url) return { enabled: false };
  return { enabled: true, url };
}

function frameFromMessage(data: string): LiveFrame | null {
  let packet: unknown;
  try {
    packet = JSON.parse(data);
  } catch {
    return null;
  }
  const object = packet && typeof packet === 'object' ? (packet as Record<string, unknown>) : null;
  if (object?.type && object.type !== 'frame') return null;
  const frame = object?.type === 'frame' ? object.frame : object;
  if (!frame || typeof frame !== 'object') return null;
  return frame as LiveFrame;
}

export function subscribeLiveFrames(
  config: LiveSocketConfig,
  onFrame: (frame: LiveFrame) => void,
  onStatus?: (connected: boolean) => void,
): LiveSocketSubscription | null {
  if (!config.enabled || !config.url || typeof WebSocket === 'undefined') return null;

  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const open = () => {
    if (closed) return;
    const ws = new WebSocket(config.url as string);
    socket = ws;

    ws.onopen = () => {
      attempt = 0;
      onStatus?.(true);
      if (config.topics?.length) ws.send(JSON.stringify({ type: 'subscribe', topics: config.topics }));
    };
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      const frame = frameFromMessage(event.data);
      if (frame) onFrame(frame);
    };
    ws.onerror = () => onStatus?.(false);
    ws.onclose = () => {
      onStatus?.(false);
      if (closed) return;
      attempt += 1;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** (attempt - 1), RECONNECT_MAX_MS);
      retryTimer = setTimeout(open, delay);
    };
  };

  open();

  return {
    close: () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (!socket) return;
      socket.onopen = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    },
  };
}
