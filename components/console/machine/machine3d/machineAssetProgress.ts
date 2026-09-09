/**
 * Download progress for the machine asset.
 *
 * The stage already warmed the GLB with a fire-and-forget `fetch`, purely to
 * overlap it with the three.js chunk. That fetch knows exactly how much of a
 * 3.6 MB asset has arrived and was throwing the information away, so the
 * console could only ever say "loading" -- with no way to tell a slow link from
 * a stalled one.
 *
 * This reads the same response as a stream and publishes the count. Nothing
 * extra is fetched: the warm is still one request, its body is still discarded,
 * and `useGLTF` still serves from the HTTP cache afterwards. The only change is
 * that the bytes are counted on their way past.
 *
 * Phases
 * ------
 *   idle         nothing started for this URL yet
 *   downloading  bytes arriving; `ratio` is real when the length is known
 *   preparing    body complete, three.js is parsing and building materials
 *   ready        the stage published its first projection
 *   failed       the warm fetch did not complete
 *
 * `preparing` exists because the download is not the whole wait. Parsing 280k
 * triangles, cloning and re-grading sixteen materials and compiling the shaders
 * is dead time with no network event behind it, and a progress ring that sits
 * at 100% through it looks more broken than one that says what it is doing.
 */

export type MachineLoadPhase = 'idle' | 'downloading' | 'preparing' | 'ready' | 'failed';

export type MachineLoadProgress = {
  phase: MachineLoadPhase;
  /** Bytes received so far. */
  received: number;
  /** Total bytes, or 0 when the response did not declare a usable length. */
  total: number;
  /** 0..1 while the total is trustworthy, otherwise null for indeterminate. */
  ratio: number | null;
};

const IDLE: MachineLoadProgress = { phase: 'idle', received: 0, total: 0, ratio: null };

const state = new Map<string, MachineLoadProgress>();
const listeners = new Map<string, Set<(progress: MachineLoadProgress) => void>>();
/** URLs whose warm has already been started, so a remount never refetches. */
const started = new Set<string>();

function publish(url: string, next: MachineLoadProgress): void {
  state.set(url, next);
  const subscribers = listeners.get(url);
  if (!subscribers) return;
  for (const listener of subscribers) listener(next);
}

export function readMachineProgress(url: string): MachineLoadProgress {
  return state.get(url) ?? IDLE;
}

export function subscribeMachineProgress(
  url: string,
  listener: (progress: MachineLoadProgress) => void,
): () => void {
  let subscribers = listeners.get(url);
  if (!subscribers) {
    subscribers = new Set();
    listeners.set(url, subscribers);
  }
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
    if (subscribers.size === 0) listeners.delete(url);
  };
}

/** The stage calls this the moment the machine is actually on screen. */
export function markMachineReady(url: string): void {
  const current = readMachineProgress(url);
  if (current.phase === 'ready') return;
  publish(url, { ...current, phase: 'ready', ratio: 1 });
}

/**
 * Is the declared length usable as a denominator?
 *
 * `Content-Length` is the length of the *encoded* body, while a stream reader
 * hands back decoded bytes. If the server compressed the GLB the two disagree
 * and the ratio runs past 1 -- so an overshoot is treated as "this header was
 * not describing what I am counting" and the ring goes indeterminate rather
 * than reporting 140%.
 */
function ratioFor(received: number, total: number): number | null {
  if (total <= 0) return null;
  if (received > total * 1.02) return null;
  return Math.min(received / total, 1);
}

/**
 * Start (once) the warm download for `url`, counting bytes as they arrive.
 *
 * Deliberately fire-and-forget, exactly as before: this is a cache warm, not a
 * data dependency. A failure here is published as `failed` for the indicator's
 * benefit and then ignored -- `useGLTF` still fetches the asset itself, and the
 * stage still loads.
 */
export function warmMachineAsset(url: string): void {
  if (typeof window === 'undefined' || started.has(url)) return;
  started.add(url);

  publish(url, { phase: 'downloading', received: 0, total: 0, ratio: null });

  void (async () => {
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`asset warm failed: ${response.status}`);

      const declared = Number(response.headers.get('content-length') ?? 0);
      const total = Number.isFinite(declared) && declared > 0 ? declared : 0;

      // No streaming body available: still consume it so the response lands in
      // the HTTP cache, but there is nothing to report along the way.
      if (!response.body) {
        publish(url, { phase: 'downloading', received: 0, total, ratio: null });
        await response.arrayBuffer();
        publish(url, { phase: 'preparing', received: total, total, ratio: 1 });
        return;
      }

      const reader = response.body.getReader();
      let received = 0;
      // Read to completion and drop each chunk. The bytes are not needed here;
      // the browser cache is what this whole path exists to populate.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value?.byteLength ?? 0;
        publish(url, {
          phase: 'downloading',
          received,
          total,
          ratio: ratioFor(received, total),
        });
      }

      publish(url, { phase: 'preparing', received, total: total || received, ratio: 1 });
    } catch {
      publish(url, { ...readMachineProgress(url), phase: 'failed' });
    }
  })();
}
