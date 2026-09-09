// Persistence runs behind the realtime path: frames are already on their way to
// the UI when a job is queued, so the database can lag without adding latency.
//
// Jobs are keyed by what they write (kind + gateway + rack). Current-state
// writes are last-writer-wins, so a queued job that has not started yet is
// replaced by the newer frame instead of piling up — a slow database costs
// resolution in the history tables, never liveness in the UI. Append-only work
// (events, quarantine) passes a unique key and is therefore never coalesced.

// Current-state work coalesces, so it is self-limiting: at most one job per
// kind/gateway/rack. Append-only work (events, quarantine) has a unique key per
// message and does not, so a database that stops answering would otherwise grow
// this queue until the process dies — taking the live path down with it. The cap
// makes storage shed load instead: the oldest queued write is dropped and
// counted, and frames keep flowing the whole time.
const MAX_PENDING = Number(process.env.PERSIST_QUEUE_MAX ?? 10_000);

const pending = new Map();
const order = [];
let draining = false;
let coalesced = 0;
let dropped = 0;
let lastDropLoggedAt = 0;
let failures = 0;
let lastFailureLoggedAt = 0;

export function queueDepth() {
  return pending.size;
}

export function coalescedCount() {
  return coalesced;
}

export function droppedCount() {
  return dropped;
}

export function failureCount() {
  return failures;
}

function dropOldest() {
  while (order.length > 0 && pending.size >= MAX_PENDING) {
    const key = order.shift();
    if (!pending.delete(key)) continue; // already drained
    dropped += 1;
  }
  if (Date.now() - lastDropLoggedAt > 10_000) {
    lastDropLoggedAt = Date.now();
    console.error(`[persist] queue at ${MAX_PENDING}; dropped ${dropped} writes so far (live frames unaffected)`);
  }
}

export function enqueue(key, run) {
  if (pending.has(key)) {
    coalesced += 1;
  } else {
    if (pending.size >= MAX_PENDING) dropOldest();
    order.push(key);
  }
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
        // A database that is down fails every job. Log the first, then at most
        // one every 10s with a running count, so a storage outage cannot bury
        // the log the live path is also writing to.
        failures += 1;
        if (Date.now() - lastFailureLoggedAt > 10_000) {
          lastFailureLoggedAt = Date.now();
          console.error(`[persist] ${key}: ${err.message} (${failures} failed writes so far)`);
        }
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
