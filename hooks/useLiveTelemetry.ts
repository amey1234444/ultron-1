import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { EMPTY_LIVE_STATE, type LiveState } from '../lib/liveTelemetry';
import { apiFetch } from '../src/lib/apiClient';

const VISIBLE_POLL_INTERVAL_MS = 300;
const HIDDEN_POLL_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 4000;

function normalizeLiveState(json: Partial<LiveState>): LiveState {
  return {
    gateways: json.gateways ?? [],
    racks: json.racks ?? [],
    slots: json.slots ?? [],
    measurements: json.measurements ?? [],
    alerts: json.alerts ?? [],
  };
}

// Polls the backend's live MQTT state (gateways / racks / latest measurements)
// so the UI reflects real gateway connectivity in near-real time. Web-only:
// the Expo native target has no session against the Next.js API.
export function useLiveTelemetry(): LiveState {
  const [state, setState] = useState<LiveState>(EMPTY_LIVE_STATE);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastPayload = '';
    let inFlight: AbortController | null = null;

    const nextDelay = () => (document.visibilityState === 'visible' ? VISIBLE_POLL_INTERVAL_MS : HIDDEN_POLL_INTERVAL_MS);

    const schedule = (delay = nextDelay()) => {
      if (!cancelled) timer = setTimeout(poll, delay);
    };

    const poll = async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await apiFetch('/api/live/state', {
          cache: 'no-store',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const payload = await res.text();
          if (payload === lastPayload) return;
          const json = JSON.parse(payload) as Partial<LiveState> & { persisted?: boolean };
          if (!cancelled && json.persisted) {
            lastPayload = payload;
            setState(normalizeLiveState(json));
          }
        }
      } catch {
        // Offline / transient - next tick retries.
      } finally {
        clearTimeout(timeout);
        if (inFlight === controller) inFlight = null;
        schedule();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      schedule(0);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void poll();
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      inFlight?.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return state;
}
