import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { parseComponentRul, type ComponentRul, type RulStatus } from '../../../../lib/knowledge/ml/rulContract';
import { RUL_FIXTURES } from '../../../../lib/knowledge/ml/rulFixtures';

/**
 * Component health and remaining life, from the service.
 *
 * The service is asked first, always. Fixtures are a fallback and only when
 * `ULTRON_RUL_FIXTURES` is on, so the day a real endpoint exists this hook
 * starts using it with no change here and no change at the call site. A
 * production build has no path to fixture data.
 *
 * Failure is a state rather than an exception, and the three ways this can fail
 * are kept apart because they mean different things to whoever is reading:
 *
 *   unavailable  the service could not be reached, or said so itself
 *   invalid      it answered, and the answer did not survive the parser
 *   value        it answered something the parser accepted
 *
 * An invalid payload is never rendered. That is the point of the parser
 * rejecting rather than repairing, and it would be undone here by falling back
 * to "show it anyway".
 */
export type ComponentRulState = {
  value: ComponentRul | null;
  /** Human-readable reason there is nothing to show, or null. */
  unavailable: string | null;
  /** Parser errors, for the engineer-facing disclosure. */
  invalid: string[] | null;
  loading: boolean;
  /** True when the data on screen came from fixtures rather than the service. */
  usingFixtures: boolean;
  refresh: () => void;
};

const FIXTURES_ENABLED =
  typeof process !== 'undefined' && process.env?.ULTRON_RUL_FIXTURES === '1';

function fixtureFor(componentId: string): unknown | null {
  if (!FIXTURES_ENABLED) return null;
  return RUL_FIXTURES[componentId] ?? null;
}

/** A status the service can report that means "nothing to draw, and here is why". */
const SELF_REPORTED_UNAVAILABLE: RulStatus[] = ['ML_UNAVAILABLE'];

export function useComponentRul(
  machineId: string | null | undefined,
  componentId: string | null | undefined,
  options: { enabled?: boolean } = {},
): ComponentRulState {
  const enabled = options.enabled ?? true;

  const [value, setValue] = useState<ComponentRul | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [usingFixtures, setUsingFixtures] = useState(false);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const accept = useCallback((payload: unknown, fromFixture: boolean) => {
    const parsed = parseComponentRul(payload);
    if (!parsed.ok) {
      setValue(null);
      setInvalid(parsed.errors);
      setUnavailable(null);
      return;
    }
    setInvalid(null);
    setValue(parsed.value);
    setUsingFixtures(fromFixture);
    setUnavailable(
      SELF_REPORTED_UNAVAILABLE.includes(parsed.value.status)
        ? parsed.value.detail ?? 'ML service unavailable — engineering diagnostics unaffected.'
        : null,
    );
  }, []);

  const fetchOnce = useCallback(async () => {
    if (!machineId || !componentId || !enabled) return;
    setLoading(true);
    try {
      const path = `/api/ml/health/${encodeURIComponent(machineId)}/components/${encodeURIComponent(componentId)}/rul`;
      const result = await fetch(path, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!mounted.current) return;

      if (!result.ok) {
        // A 404 is the expected answer until the endpoint ships, so it falls
        // back quietly where fixtures are on and reports plainly where they
        // are not. Any other status is the service failing and says so.
        const fixture = fixtureFor(componentId);
        if (fixture) {
          accept(fixture, true);
          return;
        }
        setValue(null);
        setInvalid(null);
        setUnavailable(
          result.status === 404
            ? 'No health model is published for this component yet.'
            : `The health service answered ${result.status}. The rest of the prognosis is unaffected.`,
        );
        return;
      }

      accept(await result.json(), false);
    } catch {
      if (!mounted.current) return;
      const fixture = fixtureFor(componentId);
      if (fixture) {
        accept(fixture, true);
        return;
      }
      setValue(null);
      setInvalid(null);
      setUnavailable('ML service unavailable — engineering diagnostics unaffected.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [machineId, componentId, enabled, accept]);

  useEffect(() => {
    void fetchOnce();
  }, [fetchOnce]);

  const refresh = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return useMemo(
    () => ({ value, unavailable, invalid, loading, usingFixtures, refresh }),
    [value, unavailable, invalid, loading, usingFixtures, refresh],
  );
}
