// The trend window catalogue.
//
// One control, not a row of buttons. Fourteen windows laid out horizontally is
// a toolbar that has stopped being a toolbar; grouped inside a single
// `Window ▾` the same fourteen become a menu a reader scans by unit — ticks,
// seconds, minutes, hours, days — and the toolbar keeps its width for the
// controls that are actually pressed on every visit.
//
// Two kinds of window, and the difference is not cosmetic:
//
//   ticks     the last N samples, whatever rate they arrived at. This is the
//             honest window on a buffer with no clock behind it, and it is the
//             one the console had before timestamps existed.
//   duration  the last N milliseconds of wall time. Needs `TrendSample.t`,
//             which is why it could not exist until the buffer carried it.
//
// Availability is computed against the buffer, not assumed: a "12 hours" window
// on a channel that has been reporting for four minutes is disabled and says
// why, rather than drawing four minutes of data across a twelve-hour axis and
// leaving the reader to assume the plant was quiet.

export type WindowUnit = 'ticks' | 'seconds' | 'minutes' | 'hours' | 'days';

export type TrendWindow = {
  /** Stable id, also the persistence key. */
  id: string;
  /** What the menu row says. */
  label: string;
  /** What the closed control says. Short, because it sits in a toolbar. */
  short: string;
  unit: WindowUnit;
} & ({ kind: 'ticks'; ticks: number } | { kind: 'duration'; ms: number });

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ticks(n: number): TrendWindow {
  return {
    id: `t${n}`,
    label: `${n} tick${n === 1 ? '' : 's'}`,
    short: `${n}t`,
    unit: 'ticks',
    kind: 'ticks',
    ticks: n,
  };
}

function duration(id: string, label: string, short: string, unit: WindowUnit, ms: number): TrendWindow {
  return { id, label, short, unit, kind: 'duration', ms };
}

export const TREND_WINDOWS: TrendWindow[] = [
  ticks(1),
  ticks(10),
  ticks(100),
  ticks(1000),

  duration('s1', '1 second', '1 s', 'seconds', SECOND),
  duration('s5', '5 seconds', '5 s', 'seconds', 5 * SECOND),
  duration('s10', '10 seconds', '10 s', 'seconds', 10 * SECOND),
  duration('s15', '15 seconds', '15 s', 'seconds', 15 * SECOND),
  duration('s30', '30 seconds', '30 s', 'seconds', 30 * SECOND),
  duration('s45', '45 seconds', '45 s', 'seconds', 45 * SECOND),

  duration('m1', '1 minute', '1 m', 'minutes', MINUTE),
  duration('m2', '2 minutes', '2 m', 'minutes', 2 * MINUTE),
  duration('m3', '3 minutes', '3 m', 'minutes', 3 * MINUTE),
  duration('m5', '5 minutes', '5 m', 'minutes', 5 * MINUTE),
  duration('m10', '10 minutes', '10 m', 'minutes', 10 * MINUTE),
  duration('m15', '15 minutes', '15 m', 'minutes', 15 * MINUTE),
  duration('m30', '30 minutes', '30 m', 'minutes', 30 * MINUTE),
  duration('m45', '45 minutes', '45 m', 'minutes', 45 * MINUTE),

  duration('h1', '1 hour', '1 h', 'hours', HOUR),
  duration('h2', '2 hours', '2 h', 'hours', 2 * HOUR),
  duration('h4', '4 hours', '4 h', 'hours', 4 * HOUR),
  duration('h6', '6 hours', '6 h', 'hours', 6 * HOUR),
  duration('h12', '12 hours', '12 h', 'hours', 12 * HOUR),

  duration('d1', '1 day', '1 d', 'days', DAY),
  duration('d7', '7 days', '7 d', 'days', 7 * DAY),
  duration('d30', '30 days', '30 d', 'days', 30 * DAY),
];

export const WINDOW_GROUP_ORDER: WindowUnit[] = ['ticks', 'seconds', 'minutes', 'hours', 'days'];

export const WINDOW_GROUP_LABEL: Record<WindowUnit, string> = {
  ticks: 'Ticks',
  seconds: 'Seconds',
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
};

export const DEFAULT_WINDOW_ID = 'm5';

export function windowById(id: string): TrendWindow {
  return TREND_WINDOWS.find((option) => option.id === id) ?? TREND_WINDOWS.find((o) => o.id === DEFAULT_WINDOW_ID)!;
}

/**
 * A window the reader typed in themselves.
 *
 * Parsed rather than free-form: "45s", "90 min", "2h", "500 ticks". Returning
 * null is a rejection the dialog reports, not a silent fallback — a custom
 * window that quietly becomes 30 seconds is worse than one that says no.
 */
export function parseCustomWindow(input: string): TrendWindow | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(input);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const suffix = match[2].toLowerCase();

  if (suffix === 't' || suffix === 'tick' || suffix === 'ticks') {
    const n = Math.round(amount);
    return n >= 1 ? { ...ticks(n), id: `custom-t${n}` } : null;
  }

  const scale: Record<string, { ms: number; unit: WindowUnit; name: string }> = {
    '': { ms: SECOND, unit: 'seconds', name: 'second' },
    s: { ms: SECOND, unit: 'seconds', name: 'second' },
    sec: { ms: SECOND, unit: 'seconds', name: 'second' },
    secs: { ms: SECOND, unit: 'seconds', name: 'second' },
    m: { ms: MINUTE, unit: 'minutes', name: 'minute' },
    min: { ms: MINUTE, unit: 'minutes', name: 'minute' },
    mins: { ms: MINUTE, unit: 'minutes', name: 'minute' },
    h: { ms: HOUR, unit: 'hours', name: 'hour' },
    hr: { ms: HOUR, unit: 'hours', name: 'hour' },
    hrs: { ms: HOUR, unit: 'hours', name: 'hour' },
    d: { ms: DAY, unit: 'days', name: 'day' },
    day: { ms: DAY, unit: 'days', name: 'day' },
    days: { ms: DAY, unit: 'days', name: 'day' },
  };
  const found = scale[suffix];
  if (!found) return null;

  const shortUnit = found.unit === 'seconds' ? 's' : found.unit === 'minutes' ? 'm' : found.unit === 'hours' ? 'h' : 'd';
  return {
    id: `custom-${suffix || 's'}${amount}`,
    label: `${amount} ${found.name}${amount === 1 ? '' : 's'}`,
    short: `${amount} ${shortUnit}`,
    unit: found.unit,
    kind: 'duration',
    ms: amount * found.ms,
  };
}

/**
 * Whether a window can be honoured by the samples actually held, and — when it
 * cannot — what to say instead of drawing it.
 *
 * A tick window needs that many samples. A duration window needs a buffer that
 * spans at least that long. Neither is a failure: it is a young buffer, and the
 * only wrong answer is to draw it anyway.
 */
export function windowAvailability(
  option: TrendWindow,
  sampleCount: number,
  spanMs: number,
): { available: boolean; note?: string } {
  if (sampleCount < 2) return { available: false, note: 'no data yet' };
  if (option.kind === 'ticks') {
    return option.ticks <= sampleCount ? { available: true } : { available: false, note: `${sampleCount} held` };
  }
  return option.ms <= spanMs ? { available: true } : { available: false, note: 'beyond buffer' };
}
