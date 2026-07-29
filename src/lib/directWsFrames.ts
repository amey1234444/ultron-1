import type { LiveFrame } from '../../lib/liveTelemetry';

declare const process: { env: Record<string, string | undefined> };

export type DirectWsConfig = {
  enabled: boolean;
  url?: string;
  token?: string;
};

export type DirectWsSubscription = { close: () => void };

export function directWsConfig(): DirectWsConfig {
  const configured = process.env.NEXT_PUBLIC_ULTRON_LIVE_WS_URL;
  const url = configured || (
    typeof window === 'undefined'
      ? undefined
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/live`
  );
  if (!url) return { enabled: false };
  return {
    enabled: true,
    url,
    token: process.env.NEXT_PUBLIC_ULTRON_LIVE_WS_TOKEN,
  };
}

function withToken(url: string, token?: string): string {
  if (!token) return url;
  const parsed = new URL(url);
  parsed.searchParams.set('token', token);
  return parsed.toString();
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

export function subscribeDirectWsFrames(
  config: DirectWsConfig,
  onFrame: (frame: LiveFrame) => void,
  onStatus?: (connected: boolean) => void,
): DirectWsSubscription | null {
  if (!config.enabled || !config.url || typeof WebSocket === 'undefined') return null;
  const socket = new WebSocket(withToken(config.url, config.token));

  socket.onopen = () => onStatus?.(true);
  socket.onclose = () => onStatus?.(false);
  socket.onerror = () => onStatus?.(false);
  socket.onmessage = (event) => {
    if (typeof event.data !== 'string') return;
    const frame = frameFromMessage(event.data);
    if (frame) onFrame(frame);
  };

  return {
    close: () => {
      socket.onopen = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    },
  };
}
