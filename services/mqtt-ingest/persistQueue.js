// Persistence runs behind the realtime path: frames are already on their way to
// the UI when a job is queued, so the database can lag without adding latency.
//
// Jobs are keyed by what they write (kind + gateway + rack). Current-state
// writes are last-writer-wins, so a queued job that has not started yet is
// replaced by the newer frame instead of piling up — a slow database costs
// resolution in the history tables, never liveness in the UI. Append-only work
// (events, quarantine) passes a unique key and is therefore never coalesced.

const pending = new Map();
const order = [];
let draining = false;
let coalesced = 0;

export function queueDepth() {
  return pending.size;
}

export function coalescedCount() {
  return coalesced;
}

export function enqueue(key, run) {
  if (pending.has(key)) coalesced += 1;
  else order.push(key);
  pending.set(key, run);
  if (!draining) void drain();
}

async function drain() {
  draining = true;
  try {
    while (order.length > 0) {
      const key = order.shift();
      const run = pending.get(key);
      pending.delete(key);
      if (!run) continue;
      try {
        await run();
      } catch (err) {
        console.error(`[persist] ${key}:`, err.message);
      }
    }
  } finally {
    draining = false;
  }
}

// Lets the process shut down (or tests finish) with the queue emptied.
export async function flushQueue() {
  while (order.length > 0 || draining) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
