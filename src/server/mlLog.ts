/**
 * Logging for the ML layer, in the same shape the service uses.
 *
 * The two halves of this path are a Node process and a Python process, and
 * the question asked of the log is nearly always "did the frame this side
 * built arrive as the frame that side scored". That is only answerable if
 * both sides write comparable lines, so the format here matches
 * `services/ml/app/core/logging.py`: one line per event, `key=value`, and the
 * same field names for the same facts. `grep machine=TSE-01` spans both.
 *
 * Silence was the previous behaviour and it cost several rounds of this
 * work: a feeder that posted nothing, a service that received nothing and a
 * panel that said nothing look identical from outside, and none of the three
 * said which it was.
 *
 * Levels follow `ML_LOG_LEVEL`, read here as well as by the service, because
 * turning up one half and not the other is never what anybody wants.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type Level = keyof typeof LEVELS;

function threshold(): number {
  const raw = (process.env.ML_LOG_LEVEL ?? 'info').trim().toLowerCase();
  return LEVELS[raw as Level] ?? LEVELS.info;
}

/** `key=value`, nulls dropped, floats to three places. Matches the service. */
export function fields(pairs: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(pairs)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number' && !Number.isInteger(value)) parts.push(`${key}=${value.toFixed(3)}`);
    else if (typeof value === 'boolean') parts.push(`${key}=${value ? 'yes' : 'no'}`);
    else parts.push(`${key}=${value}`);
  }
  return parts.join(' ');
}

function emit(level: Level, scope: string, pairs: Record<string, unknown>, suffix?: string): void {
  if (LEVELS[level] > threshold()) return;
  const line = `[ml.${scope}] ${fields(pairs)}${suffix ? ` — ${suffix}` : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function mlLog(scope: string) {
  return {
    debug: (pairs: Record<string, unknown>, suffix?: string) => emit('debug', scope, pairs, suffix),
    info: (pairs: Record<string, unknown>, suffix?: string) => emit('info', scope, pairs, suffix),
    warn: (pairs: Record<string, unknown>, suffix?: string) => emit('warn', scope, pairs, suffix),
    error: (pairs: Record<string, unknown>, suffix?: string) => emit('error', scope, pairs, suffix),
  };
}
