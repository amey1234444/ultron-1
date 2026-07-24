// Durable, rate-limited queue for Abstract Email Reputation checks.
//
// Abstract's free plan allows only ONE request per second (and a small monthly
// quota), so outbound checks MUST be serialized. Signups (and the super-admin
// "re-check" action) enqueue an email here instead of calling the API inline;
// a single-flight worker then drains the queue one row at a time, spacing calls
// at >= 1s. Requests are never lost: they sit in the table until processed.
//
// Serialization across serverless instances is enforced with a Postgres session
// advisory lock — only one `drainReputationQueue` runs at a time, cluster-wide.
// Without a DATABASE_URL (local dev) an in-memory queue with the same semantics
// is used instead.

import { isDbEnabled, query, withClient } from './db';
import { checkEmailReputation, recordReputation } from './emailReputation';
import { logServerError } from './errors';
import { applyReputationByEmail } from './users';

// Minimum spacing between Abstract API calls. Kept just above 1s to stay under
// the free-tier "1 request per second" limit even with a little clock jitter.
const RATE_MS = 1100;
// Arbitrary constant identifying the queue-drain advisory lock ("REPU").
const ADVISORY_LOCK_KEY = 0x52455055;
// A job that keeps throwing (unexpected errors, not API outages) is parked in
// 'error' after this many attempts so it can't wedge the queue.
const MAX_ATTEMPTS = 5;

export type DrainResult = { processed: number; failed: number; remaining: number };

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- in-memory backend (local dev without DATABASE_URL) --------------------

type MemJob = { email: string; emailLc: string; requestedBy: string; attempts: number };
const memRef = globalThis as unknown as {
  __ultronRepQueue?: MemJob[];
  __ultronRepQueueBusy?: boolean;
  __ultronRepQueueLast?: number;
};
function memQueue(): MemJob[] {
  if (!memRef.__ultronRepQueue) memRef.__ultronRepQueue = [];
  return memRef.__ultronRepQueue;
}

async function memDrain(maxJobs: number, maxMs: number, prefer: string): Promise<DrainResult> {
  if (memRef.__ultronRepQueueBusy) return { processed: 0, failed: 0, remaining: memQueue().length };
  memRef.__ultronRepQueueBusy = true;
  let processed = 0;
  let failed = 0;
  const start = Date.now();
  try {
    while (processed + failed < maxJobs && Date.now() - start < maxMs) {
      const q = memQueue();
      // Prioritize the requested email (manual re-check), else FIFO.
      const idx = prefer ? q.findIndex((j) => j.emailLc === prefer) : q.length ? 0 : -1;
      if (idx === -1) break;
      const [job] = q.splice(idx, 1);
      if (!job) break;
      const wait = RATE_MS - (Date.now() - (memRef.__ultronRepQueueLast ?? 0));
      if (wait > 0) await sleep(wait);
      memRef.__ultronRepQueueLast = Date.now();
      try {
        const result = await checkEmailReputation(job.email);
        await recordReputation(job.email, result);
        await applyReputationByEmail(job.email, {
          status: result.status,
          score: result.score,
          checkedAt: result.checkedAt,
          data: result.data,
        });
        processed++;
      } catch (err) {
        logServerError('reputationQueue mem job', err);
        failed++;
      }
    }
  } finally {
    memRef.__ultronRepQueueBusy = false;
  }
  return { processed, failed, remaining: memQueue().length };
}

// --- public API ------------------------------------------------------------

// Add an email to the queue. Idempotent: an email already waiting (pending) or
// in flight (processing) is not enqueued again.
export async function enqueueReputationCheck(email: string, requestedBy = ''): Promise<void> {
  const emailLc = normalize(email);
  if (!emailLc) return;
  try {
    if (!isDbEnabled()) {
      const q = memQueue();
      if (!q.some((j) => j.emailLc === emailLc)) {
        q.push({ email: email.trim(), emailLc, requestedBy, attempts: 0 });
      }
      return;
    }
    await query(
      `INSERT INTO reputation_queue (email, email_lc, requested_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (email_lc) WHERE state IN ('pending', 'processing') DO NOTHING`,
      [email.trim(), emailLc, requestedBy],
    );
  } catch (err) {
    logServerError('enqueueReputationCheck', err);
  }
}

// Drain the queue, honoring the single-flight lock and >= 1s spacing. Returns
// immediately (processed 0) if another worker already holds the lock. Bounded by
// `maxJobs` and `maxMs` so it stays well within a serverless function timeout.
export async function drainReputationQueue(
  { maxJobs = 25, maxMs = 45_000, prefer = '' }: { maxJobs?: number; maxMs?: number; prefer?: string } = {},
): Promise<DrainResult> {
  const preferLc = normalize(prefer);
  if (!isDbEnabled()) return memDrain(maxJobs, maxMs, preferLc);

  try {
    return await withClient(async (client) => {
      const lock = await client.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [ADVISORY_LOCK_KEY]);
      if (!lock.rows[0]?.ok) {
        const rem = await client.query<{ n: string }>(
          "SELECT COUNT(*)::text AS n FROM reputation_queue WHERE state IN ('pending', 'processing')",
        );
        return { processed: 0, failed: 0, remaining: Number(rem.rows[0]?.n ?? '0') };
      }
      try {
        // Seed the spacing clock from the most recent processed job so the limit
        // holds across separate drain invocations, not just within this loop.
        const gap = await client.query<{ s: string | null }>(
          'SELECT EXTRACT(EPOCH FROM (now() - max(processed_at))) AS s FROM reputation_queue WHERE processed_at IS NOT NULL',
        );
        const sinceLast = gap.rows[0]?.s == null ? Infinity : Number(gap.rows[0].s);
        let lastCall = sinceLast === Infinity ? 0 : Date.now() - sinceLast * 1000;

        let processed = 0;
        let failed = 0;
        const start = Date.now();
        while (processed + failed < maxJobs && Date.now() - start < maxMs) {
          const claim = await client.query<{ id: string; email: string }>(
            `UPDATE reputation_queue SET state = 'processing', attempts = attempts + 1, updated_at = now()
             WHERE id = (
               SELECT id FROM reputation_queue WHERE state = 'pending'
               ORDER BY (email_lc = $1) DESC, created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED
             )
             RETURNING id, email`,
            [preferLc],
          );
          const job = claim.rows[0];
          if (!job) break;

          const wait = RATE_MS - (Date.now() - lastCall);
          if (wait > 0) await sleep(wait);
          lastCall = Date.now();

          try {
            // checkEmailReputation never throws for API problems — it returns a
            // 'unknown' verdict (fail open), which we record and treat as done.
            const result = await checkEmailReputation(job.email);
            await recordReputation(job.email, result);
            await applyReputationByEmail(job.email, {
              status: result.status,
              score: result.score,
              checkedAt: result.checkedAt,
              data: result.data,
            });
            await client.query(
              "UPDATE reputation_queue SET state = 'done', processed_at = now(), updated_at = now(), last_error = '' WHERE id = $1",
              [job.id],
            );
            processed++;
          } catch (err) {
            logServerError('reputationQueue job', err);
            const message = err instanceof Error ? err.message : 'unknown error';
            await client.query(
              `UPDATE reputation_queue
               SET state = CASE WHEN attempts >= $2 THEN 'error' ELSE 'pending' END,
                   last_error = $3, updated_at = now()
               WHERE id = $1`,
              [job.id, MAX_ATTEMPTS, message.slice(0, 500)],
            );
            failed++;
          }
        }

        const rem = await client.query<{ n: string }>(
          "SELECT COUNT(*)::text AS n FROM reputation_queue WHERE state IN ('pending', 'processing')",
        );
        return { processed, failed, remaining: Number(rem.rows[0]?.n ?? '0') };
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
      }
    });
  } catch (err) {
    logServerError('drainReputationQueue', err);
    return { processed: 0, failed: 0, remaining: -1 };
  }
}
