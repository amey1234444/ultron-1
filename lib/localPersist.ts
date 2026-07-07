// Thin wrapper around window.localStorage — web-only (the app currently has no
// persistence layer at all; everything else resets on reload too). Guarded so it
// degrades to a silent no-op on native instead of throwing, since localStorage
// doesn't exist there.
export function saveLocal<T>(key: string, value: T): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {
    // storage unavailable/full — this is a nice-to-have, not a critical path
  }
}

export function loadLocal<T>(key: string): T | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
  } catch {
    // corrupt/unavailable — fall back to null
  }
  return null;
}
