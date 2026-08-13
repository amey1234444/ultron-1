// Display scaling for channel readings, keyed by the V/T/S/P/C letter scheme
// shared by machine measurement points and mapped rack channels.
//
// This module used to also generate fake readings (`useLiveValue` /
// `useLiveHistory` — an independent random walk per component). Those are gone:
// every displayed value now comes from the measurement bus via
// `lib/liveChannelValue.ts`, so a number on screen is always something a
// gateway actually reported. What remains here is presentation metadata only —
// gauge bounds and decimal places — which is not a measurement and is still
// needed to draw an axis before any sample has arrived.

export type LiveKindLetter = 'V' | 'T' | 'S' | 'P' | 'C' | 'X';

/**
 * Default axis/gauge bounds and precision per letter.
 *
 * Used ONLY to scale a dial or chart and to decide decimal places. A channel's
 * own configured range and alarm limits take precedence wherever they exist —
 * these are the fallback for drawing an empty axis.
 */
export const LIVE_RANGE_FOR_LETTER: Record<LiveKindLetter, { min: number; max: number; step: number; decimals: number }> = {
  V: { min: 1.2, max: 5.5, step: 0.3, decimals: 2 },
  T: { min: 45, max: 82, step: 1.5, decimals: 1 },
  S: { min: 1440, max: 1480, step: 3, decimals: 0 },
  P: { min: 1.5, max: 6.2, step: 0.25, decimals: 2 },
  C: { min: 8, max: 32, step: 1.2, decimals: 1 },
  X: { min: 0, max: 100, step: 2, decimals: 1 },
};

/** Placeholder shown wherever a channel has no reading behind it. */
export const NO_VALUE_TEXT = '—';

/** Formats a real reading, or the no-data placeholder when there is none. */
export function formatReading(value: number | null | undefined, letter: LiveKindLetter): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return NO_VALUE_TEXT;
  return value.toFixed(LIVE_RANGE_FOR_LETTER[letter].decimals);
}
