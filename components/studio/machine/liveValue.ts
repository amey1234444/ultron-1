import { useEffect, useRef, useState } from 'react';

import { loadLocal, saveLocal } from '../../../lib/localPersist';

// Shared by PointCard (machine measurement points) and MappableBox (mapped rack
// channels) — both fake a live reading the same way, keyed by the same V/T/S/P/C
// letter scheme used for point/channel codes.
export type LiveKindLetter = 'V' | 'T' | 'S' | 'P' | 'C' | 'X';

// Plausible operating band per letter, used only to fake a live reading for demo
// data — not derived from any real sensor range.
export const LIVE_RANGE_FOR_LETTER: Record<LiveKindLetter, { min: number; max: number; step: number; decimals: number }> = {
  V: { min: 1.2, max: 5.5, step: 0.3, decimals: 2 },
  T: { min: 45, max: 82, step: 1.5, decimals: 1 },
  S: { min: 1440, max: 1480, step: 3, decimals: 0 },
  P: { min: 1.5, max: 6.2, step: 0.25, decimals: 2 },
  C: { min: 8, max: 32, step: 1.2, decimals: 1 },
  X: { min: 0, max: 100, step: 2, decimals: 1 },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Self-contained fake live reading — a random walk within a plausible band for the
// given letter, nudged every ~1.5s. Demo-only: there's no real sensor behind this.
export function useLiveValue(letter: LiveKindLetter, isLive: boolean) {
  const range = LIVE_RANGE_FOR_LETTER[letter];
  const [value, setValue] = useState(() => randomInRange(range.min, range.max));
  const rangeRef = useRef(range);
  rangeRef.current = range;

  // `letter` can change after mount (e.g. a box goes from unlinked 'X' to a real
  // reading once a channel is picked) — reseed within the new band immediately
  // instead of leaving the old-band value to be merely clamped on the next tick,
  // which would otherwise flash a wildly out-of-range number for ~1.5s.
  const letterRef = useRef(letter);
  useEffect(() => {
    if (letterRef.current === letter) return;
    letterRef.current = letter;
    setValue(randomInRange(range.min, range.max));
  }, [letter, range.min, range.max]);

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => {
      const r = rangeRef.current;
      setValue((prev) => clamp(prev + (Math.random() - 0.5) * 2 * r.step, r.min, r.max));
    }, 1500);
    return () => clearInterval(id);
  }, [isLive]);

  return value;
}

const HISTORY_LENGTH = 40; // ~1 minute of samples at the 1.5s tick below
const PERSIST_EVERY_N_TICKS = 4; // ~6s — avoids writing to localStorage on every single tick

// Same fake random-walk reading as useLiveValue, plus a rolling buffer of the
// last HISTORY_LENGTH samples — for trend sparklines. Each caller runs its own
// independent walk (like useLiveValue elsewhere in the app); this is demo data,
// not a shared source of truth.
//
// `storageKey`, when given, makes the buffer survive a tab switch or page
// reload: seeded from the last-saved buffer instead of a fresh random value,
// and re-saved every few ticks (not every tick, to keep writes infrequent).
export function useLiveHistory(letter: LiveKindLetter, isLive: boolean, storageKey?: string) {
  const range = LIVE_RANGE_FOR_LETTER[letter];
  const [history, setHistory] = useState<number[]>(() => {
    const saved = storageKey ? loadLocal<number[]>(storageKey) : null;
    return saved && saved.length > 0 ? saved : [randomInRange(range.min, range.max)];
  });
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const tickRef = useRef(0);

  const letterRef = useRef(letter);
  useEffect(() => {
    if (letterRef.current === letter) return;
    letterRef.current = letter;
    setHistory([randomInRange(range.min, range.max)]);
  }, [letter, range.min, range.max]);

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => {
      const r = rangeRef.current;
      setHistory((prev) => {
        const last = prev[prev.length - 1];
        const next = clamp(last + (Math.random() - 0.5) * 2 * r.step, r.min, r.max);
        const appended = [...prev, next];
        const trimmed = appended.length > HISTORY_LENGTH ? appended.slice(appended.length - HISTORY_LENGTH) : appended;
        tickRef.current += 1;
        if (storageKey && tickRef.current % PERSIST_EVERY_N_TICKS === 0) saveLocal(storageKey, trimmed);
        return trimmed;
      });
    }, 1500);
    return () => clearInterval(id);
  }, [isLive, storageKey]);

  return history;
}
