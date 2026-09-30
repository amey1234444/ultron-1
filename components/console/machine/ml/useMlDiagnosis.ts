import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MlDiagnosisResponse } from '../../../../lib/knowledge/ml/contract';
import { ML_CONTRACT_VERSION } from '../../../../lib/knowledge/ml/contract';

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
/**
 * What a non-200 from our own route actually means.
 *
 * Every problem with the ML service — unset, unreachable, timed out, no
 * champion — comes back from that route as a 200 carrying `degraded` and a
 * sentence. Deliberately: an advisory subsystem being down is a normal state
 * and must not read as a broken page.
 *
 * So a non-200 is never the ML service. It is this application: the session
 * lookup, the database behind it, or the route itself. Reporting it as "the
 * analysis service answered 503" sends whoever reads it to the wrong machine,
 * and the status alone does not say which. The body does, so it is read.
 */
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
          const said = await result
            .json()
            .then((body: { error?: string; detail?: string }) => body.error ?? body.detail ?? null)
            .catch(() => null);
          setUnavailable(
            said
              ? `${said} (HTTP ${result.status} from this application, not the analysis service.)`
              : `This application answered ${result.status} for the analysis request. The deterministic analysis on the other tabs is unaffected.`,
          );
          return;
        }

        const payload = (await result.json()) as {
          degraded?: boolean;
          detail?: string;
          diagnosis?: MlDiagnosisResponse;
        };
        if (!mounted.current) return;

        if (payload.degraded || !payload.diagnosis) {
          setResponse(null);
          setUnavailable(payload.detail ?? 'No predictive analysis is available for this machine.');
          return;
        }

        // Already parsed. `/api/ml/diagnosis` calls `latestDiagnosis`, which
        // runs the payload through `parseDiagnosis` on the server and sends
        // the domain object — so what arrives here carries `schemaVersion`,
        // not `schema_version`. Parsing it a second time looked for the wire
        // shape in a value that had stopped being the wire shape, threw on
        // the very first field, and did so for every diagnosis that had ever
        // succeeded. The panel reported it as "could not reach the analysis
        // service", which is the one thing it was not.
        //
        // Checked rather than cast: the server validated the payload, but a
        // deployed server and a cached client bundle can be different builds,
        // and a contract change between them would otherwise arrive as a
        // render error somewhere further down.
        const diagnosis = payload.diagnosis as MlDiagnosisResponse;
        if (diagnosis.schemaVersion !== ML_CONTRACT_VERSION) {
          setResponse(null);
          setUnavailable(
            `This page understands ML contract ${ML_CONTRACT_VERSION}; the server sent ` +
            `${diagnosis.schemaVersion ?? 'no version'}. Reload to pick up the current build.`,
          );
          return;
        }
        setResponse(diagnosis);
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
