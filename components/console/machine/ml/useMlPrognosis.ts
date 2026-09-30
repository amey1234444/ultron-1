import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { parsePrognosis, type MlPrognosisResponse } from '../../../../lib/knowledge/ml/contract';

/**
 * Fault risk per horizon from the ML service, polled.
 *
 * Deliberately separate from `useMlDiagnosis`, for the same reason the routes
 * are separate: a predictive risk is not a present alarm, and a single hook
 * returning both invites a component to render one as the other. It also lets
 * the two poll at different rates — a forecast does not change as fast as a
 * condition, so this polls slower and costs the service less.
 *
 * Failure is a state, not an exception. When the service is unreachable the
 * hook reports `unavailable` and leaves `response` null; the deterministic
 * prognostics the console computes locally are unaffected and stay on screen.
 * That is the whole point of keeping the two side by side.
 */
export type MlPrognosisState = {
  response: MlPrognosisResponse | null;
  /** Human-readable reason the model has nothing to say, or null. */
  unavailable: string | null;
  loading: boolean;
  refresh: () => void;
};

const DEFAULT_INTERVAL_MS = 60_000;

export function useMlPrognosis(
  machineId: string | null | undefined,
  options: { intervalMs?: number; enabled?: boolean } = {},
): MlPrognosisState {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const enabled = options.enabled ?? true;

  const [response, setResponse] = useState<MlPrognosisResponse | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // A ref rather than state: a fetch in flight when the component unmounts must
  // not call setState, and the poll must not restart because an identity moved.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchOnce = useCallback(async () => {
    if (!machineId || !enabled) return;
    setLoading(true);
    try {
      const result = await fetch(`/api/ml/prognosis/${encodeURIComponent(machineId)}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!mounted.current) return;

      // A non-200 here is never the forecasting service. Every problem with
      // it — unset, unreachable, timed out, no champion — comes back from our
      // route as a 200 carrying `degraded` and a sentence, because an
      // advisory subsystem being down is a normal state and must not read as
      // a broken page. So this is the application: the session lookup, the
      // database behind it, or the route. Saying "the forecasting service
      // answered 503" sends the reader to the wrong machine, and the status
      // alone does not say which. The body does.
      if (!result.ok) {
        setResponse(null);
        const said = await result
          .json()
          .then((body: { error?: string; detail?: string }) => body.error ?? body.detail ?? null)
          .catch(() => null);
        setUnavailable(
          said
            ? `${said} (HTTP ${result.status} from this application, not the forecasting service.)`
            : `This application answered ${result.status} for the forecast request. The deterministic prognostics on this page are unaffected.`,
        );
        return;
      }

      const parsed = parsePrognosis(await result.json());

      // The route answers 200 with `degraded: true` when it reached the app but
      // not the model. That is a different fact from an HTTP failure and is
      // reported as the service's own words where it gave any.
      if (parsed.degraded) {
        setResponse(parsed);
        setUnavailable(parsed.detail ?? 'The forecasting service is not reachable.');
        return;
      }

      setResponse(parsed);
      setUnavailable(null);
    } catch {
      if (!mounted.current) return;
      setResponse(null);
      setUnavailable('The forecasting service could not be reached.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [machineId, enabled]);

  useEffect(() => {
    if (!machineId || !enabled) return undefined;
    void fetchOnce();
    const timer = setInterval(() => void fetchOnce(), intervalMs);
    return () => clearInterval(timer);
  }, [machineId, enabled, intervalMs, fetchOnce]);

  const refresh = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return useMemo(() => ({ response, unavailable, loading, refresh }), [response, unavailable, loading, refresh]);
}
