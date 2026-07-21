import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { EMPTY_LIVE_STATE, type LiveState } from '../lib/liveTelemetry';
import { apiFetch } from '../src/lib/apiClient';

const POLL_INTERVAL_MS = 1000;

// Polls the backend's live MQTT state (gateways / racks / latest measurements)
// so the UI reflects real gateway connectivity in near-real time. Web-only:
// the Expo native target has no session against the Next.js API.
export function useLiveTelemetry(): LiveState {
  const [state, setState] = useState<LiveState>(EMPTY_LIVE_STATE);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await apiFetch('/api/live/state');
        if (res.ok) {
          const json = (await res.json()) as Partial<LiveState> & { persisted?: boolean };
          if (!cancelled && json.persisted) {
            setState({
              gateways: json.gateways ?? [],
              racks: json.racks ?? [],
              slots: json.slots ?? [],
              measurements: json.measurements ?? [],
              alerts: json.alerts ?? [],
            });
          }
        }
      } catch {
        // Offline / transient — next tick retries.
      }
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return state;
}
