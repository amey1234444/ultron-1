// Small fetch wrapper that attaches a persistent device id header to every API
// call. The id is a random value stored in localStorage; the server combines it
// with the client IP as one input to rate limiting / abuse detection. It is
// advisory only — never a security boundary — but it raises the cost of mass
// automated account creation from a single machine.

const DEVICE_ID_KEY = 'ultron.deviceId';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'no-storage';
  }
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-device-id', getDeviceId());
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers });
}
