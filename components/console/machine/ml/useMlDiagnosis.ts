import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MlDiagnosisResponse } from '../../../../lib/knowledge/ml/contract';
import { parseDiagnosis } from '../../../../lib/knowledge/ml/contract';

/**
 * Fetch the ML diagnosis for a machine, without ever breaking the page.
 *
 * The hook returns `{ response, unavailable }` and exactly one of them is set.
 * There is no `error` that a component might forget to render: the ML layer
 * being absent is a normal state of this system — no model promoted, service
 * restarting, ML_SERVICE_URL unset — and each of those has a different sentence
 * an engineer should read. `unavailable` carries that sentence.
 *
 * Polling is deliberately slower than the service's own inference cadence.
 * The service runs a model every couple of seconds; the Analyzer asking every
 * couple of seconds would put a request on the wire for every inference and
 * change nothing an operator can perceive.
 */

export type MlDiagnosisState = {
  response: MlDiagnosisResponse | null;
  /** The reason there is no response, or null when there is one. */
  unavailable: string | null;
  loading: boolean;
  /** Fetch now, and force an explanation to be computed. */
  refresh: (options?: { explain?: boolean }) => void;
};

const DEFAULT_INTERVAL_MS = 15_000;

export function useMlDiagnosis(
  machineId: string | null | undefined,
  options: { intervalMs?: number; enabled?: boolean } = {},
): MlDiagnosisState {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const enabled = options.enabled ?? true;

  const [response, setResponse] = useState<MlDiagnosisResponse | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // A ref rather than state: a fetch in flight when the component unmounts
  // must not call setState, and the poll interval must not restart on every
  // render because a callback identity changed.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchOnce = useCallback(
    async (explain = false) => {
      if (!machineId || !enabled) return;
      setLoading(true);
      try {
        const query = explain ? '?explain=1' : '';
        const result = await fetch(`/api/ml/diagnosis/${encodeURIComponent(machineId)}${query}`, {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });

        if (!mounted.current) return;

        if (!result.ok) {
          setResponse(null);
          setUnavailable(
            `The analysis service answered ${result.status}. The deterministic analysis on the other tabs is unaffected.`,
          );
          return;
        }

        const payload = (await result.json()) as {
          degraded?: boolean;
          detail?: string;
          diagnosis?: unknown;
        };
        if (!mounted.current) return;

        if (payload.degraded || !payload.diagnosis) {
          setResponse(null);
          setUnavailable(payload.detail ?? 'No predictive analysis is available for this machine.');
          return;
        }

        setResponse(parseDiagnosis(payload.diagnosis));
        setUnavailable(null);
      } catch (error) {
        if (!mounted.current) return;
        setResponse(null);
        setUnavailable(
          `Could not reach the analysis service: ${(error as Error).message}. The deterministic analysis is unaffected.`,
        );
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [machineId, enabled],
  );

  useEffect(() => {
    if (!machineId || !enabled) return undefined;
    void fetchOnce(false);
    const timer = setInterval(() => void fetchOnce(false), intervalMs);
    return () => clearInterval(timer);
  }, [machineId, enabled, intervalMs, fetchOnce]);

  const refresh = useCallback(
    (refreshOptions?: { explain?: boolean }) => {
      void fetchOnce(refreshOptions?.explain ?? false);
    },
    [fetchOnce],
  );

  return useMemo(
    () => ({ response, unavailable, loading, refresh }),
    [response, unavailable, loading, refresh],
  );
}
