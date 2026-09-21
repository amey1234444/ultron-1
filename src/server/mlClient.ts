/**
 * The Next.js side of the ML service boundary.
 *
 * One rule governs this file: **the ML service being unavailable must never
 * take the Analyzer down.** It is advisory. Every call here has a timeout, a
 * single retry on a transport error, and a degraded result rather than a
 * thrown exception, so a page that would have shown a deterministic verdict
 * still shows it when the Python process is restarting.
 *
 * That is why the return type is `MlResult` rather than the response: a caller
 * cannot use the payload without having handled the case where there is none.
 *
 * Configuration:
 *
 *   ML_SERVICE_URL      where the service listens. Unset means disabled, and
 *                       disabled is not an error — it is the default state of
 *                       a deployment that has not adopted the ML layer yet.
 *   ML_INTERNAL_TOKEN   sent on the internal routes only.
 *   ML_TIMEOUT_MS       per-request budget. Defaults to 4 seconds, which is
 *                       under the Analyzer's own patience and well over the
 *                       measured p99 inference latency.
 */

import type { MlDiagnosisResponse } from '../../lib/knowledge/ml/contract';
import { MlContractError, parseDiagnosis } from '../../lib/knowledge/ml/contract';

export type MlUnavailableReason =
  | 'NOT_CONFIGURED'
  | 'TIMEOUT'
  | 'TRANSPORT'
  | 'SERVICE_ERROR'
  | 'CONTRACT_MISMATCH';

export type MlResult<T> =
  | { ok: true; value: T; latencyMs: number }
  | { ok: false; reason: MlUnavailableReason; detail: string; latencyMs: number };

function serviceUrl(): string | null {
  const url = process.env.ML_SERVICE_URL?.trim();
  return url ? url.replace(/\/$/, '') : null;
}

function timeoutMs(): number {
  const raw = Number(process.env.ML_TIMEOUT_MS ?? '4000');
  return Number.isFinite(raw) && raw > 0 ? raw : 4000;
}

export function mlConfigured(): boolean {
  return serviceUrl() !== null;
}

type CallOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  internal?: boolean;
  timeout?: number;
};

/**
 * One call to the service, with the whole failure surface handled.
 *
 * Retries exactly once, and only on a transport failure or a 5xx. A 4xx is the
 * service telling us we asked wrongly, and asking again identically would be
 * pointless; a timeout is retried because the common cause is a cold model
 * load on the first request after a deploy.
 */
async function call<T>(path: string, options: CallOptions = {}): Promise<MlResult<T>> {
  const base = serviceUrl();
  const started = Date.now();

  if (!base) {
    return {
      ok: false,
      reason: 'NOT_CONFIGURED',
      detail:
        'ML_SERVICE_URL is not set. The deterministic analysis continues; no learned findings are available.',
      latencyMs: 0,
    };
  }

  const budget = options.timeout ?? timeoutMs();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.internal) {
    const token = process.env.ML_INTERNAL_TOKEN;
    if (!token) {
      return {
        ok: false,
        reason: 'NOT_CONFIGURED',
        detail: 'ML_INTERNAL_TOKEN is not set, so internal ML routes are closed.',
        latencyMs: 0,
      };
    }
    headers['X-Ultron-Token'] = token;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budget);
    try {
      const response = await fetch(`${base}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        // A 5xx may be transient; a 4xx will not change on a retry.
        if (response.status >= 500 && attempt === 0) continue;
        return {
          ok: false,
          reason: 'SERVICE_ERROR',
          detail: `ML service returned ${response.status}. ${text.slice(0, 400)}`,
          latencyMs: Date.now() - started,
        };
      }

      const payload = (await response.json()) as T;
      return { ok: true, value: payload, latencyMs: Date.now() - started };
    } catch (error) {
      clearTimeout(timer);
      const aborted = error instanceof Error && error.name === 'AbortError';
      if (attempt === 0) continue;
      return {
        ok: false,
        reason: aborted ? 'TIMEOUT' : 'TRANSPORT',
        detail: aborted
          ? `The ML service did not answer within ${budget}ms. Deterministic analysis is unaffected.`
          : `Could not reach the ML service: ${(error as Error).message}`,
        latencyMs: Date.now() - started,
      };
    }
  }

  return {
    ok: false,
    reason: 'TRANSPORT',
    detail: 'The ML service could not be reached after a retry.',
    latencyMs: Date.now() - started,
  };
}

/** Run one telemetry frame through the chain. */
export async function runInference(
  frame: unknown,
  options: { explain?: boolean; force?: boolean } = {},
): Promise<MlResult<MlDiagnosisResponse>> {
  const result = await call<unknown>('/inference', {
    method: 'POST',
    body: { frame, explain: options.explain ?? false, force: options.force ?? false },
  });
  return parsed(result);
}

/** The most recent diagnosis the service holds for a machine. */
export async function latestDiagnosis(machineId: string): Promise<MlResult<MlDiagnosisResponse>> {
  const result = await call<unknown>(`/diagnosis/${encodeURIComponent(machineId)}`);
  if (!result.ok) return result;
  // The service answers with a placeholder when it has seen no telemetry. That
  // is a legitimate state, not a contract violation, so it is reported as
  // unavailable with the service's own reason rather than a parse failure.
  const payload = result.value as Record<string, unknown>;
  if (payload && payload.diagnosis === null) {
    return {
      ok: false,
      reason: 'SERVICE_ERROR',
      detail: String(payload.reason ?? 'No telemetry has been processed for this machine yet.'),
      latencyMs: result.latencyMs,
    };
  }
  return parsed(result);
}

export async function diagnosisHistory(
  machineId: string,
  limit = 50,
): Promise<MlResult<{ machineId: string; count: number; history: MlDiagnosisResponse[] }>> {
  const result = await call<Record<string, unknown>>(
    `/diagnosis/${encodeURIComponent(machineId)}/history?limit=${limit}`,
  );
  if (!result.ok) return result;
  try {
    const raw = Array.isArray(result.value.history) ? result.value.history : [];
    return {
      ok: true,
      latencyMs: result.latencyMs,
      value: {
        machineId,
        count: raw.length,
        history: raw.map((entry) => parseDiagnosis(entry)),
      },
    };
  } catch (error) {
    return contractFailure(error, result.latencyMs);
  }
}

export async function prognosis(machineId: string): Promise<MlResult<unknown>> {
  return call<unknown>(`/prognosis/${encodeURIComponent(machineId)}`);
}

export async function explanation(predictionId: string): Promise<MlResult<unknown>> {
  return call<unknown>(`/explanations/${encodeURIComponent(predictionId)}`);
}

export async function submitFeedback(payload: unknown): Promise<MlResult<unknown>> {
  return call<unknown>('/feedback', { method: 'POST', body: payload });
}

export async function health(): Promise<MlResult<unknown>> {
  // A shorter budget: a health check that takes four seconds to say the
  // service is unwell is not much of a health check.
  return call<unknown>('/health', { timeout: 1500 });
}

export async function models(): Promise<MlResult<unknown>> {
  return call<unknown>('/models');
}

export async function champion(): Promise<MlResult<unknown>> {
  return call<unknown>('/models/champion');
}

export async function reloadModels(): Promise<MlResult<unknown>> {
  return call<unknown>('/models/reload', { method: 'POST', internal: true });
}

function parsed(result: MlResult<unknown>): MlResult<MlDiagnosisResponse> {
  if (!result.ok) return result;
  try {
    return { ok: true, value: parseDiagnosis(result.value), latencyMs: result.latencyMs };
  } catch (error) {
    return contractFailure(error, result.latencyMs);
  }
}

function contractFailure(error: unknown, latencyMs: number): MlResult<never> {
  const detail =
    error instanceof MlContractError
      ? error.message
      : `The ML service returned an unreadable payload: ${(error as Error).message}`;
  return { ok: false, reason: 'CONTRACT_MISMATCH', detail, latencyMs };
}

/**
 * The shape the Analyzer renders when the service has nothing to say.
 *
 * Returned rather than throwing, so a component always has a defined `ml`
 * block to read. The distinction that matters to an operator — "no model has
 * been promoted" versus "the service is down" — survives into this object.
 */
export function degradedMlBlock(result: Extract<MlResult<unknown>, { ok: false }>) {
  return {
    eligible: false,
    status: result.reason === 'NOT_CONFIGURED' ? ('DISABLED' as const) : ('DEGRADED' as const),
    eligibilityReason: null,
    reasonDetail: result.detail,
    mode: 'disabled' as const,
    surfaced: false,
    degradedComponents: [result.reason],
    inferenceLatencyMs: result.latencyMs,
  };
}
