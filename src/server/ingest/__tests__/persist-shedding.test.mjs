// Storage must never be able to stall or sink the live path. These cover the
// two ways it could: an unbounded queue behind a database that stopped
// answering, and current-state work piling up instead of coalescing.

import assert from 'node:assert/strict';
import test from 'node:test';

process.env.PERSIST_QUEUE_MAX = '5';
const { coalescedCount, droppedCount, enqueue, flushQueue, queueDepth } = await import('../persistQueue.mjs');

test('a stalled database sheds the oldest writes instead of growing without limit', async () => {
  let release;
  const stalled = new Promise((resolve) => {
    release = resolve;
  });
  const ran = [];

  // The first job never settles, so nothing behind it can drain — the shape of
  // a database that has stopped answering.
  enqueue('stalled', () => stalled);
  for (let i = 0; i < 20; i += 1) enqueue(`alarm|${i}`, async () => ran.push(i));

  assert.equal(queueDepth(), 5, 'queue is capped');
  assert.ok(droppedCount() >= 15, 'the overflow was dropped and counted');

  release();
  await flushQueue();
  assert.equal(queueDepth(), 0);
  // Only what survived the cap runs, and it is the newest work.
  assert.deepEqual(ran, [15, 16, 17, 18, 19]);
});

test('current-state work coalesces, so a slow database costs resolution not liveness', async () => {
  const before = coalescedCount();
  let release;
  const stalled = new Promise((resolve) => {
    release = resolve;
  });
  const written = [];

  enqueue('stalled', () => stalled);
  // Same key three times: a rack publishing faster than the database can keep up.
  for (const value of [1, 2, 3]) enqueue('telemetry|gw|rack', async () => written.push(value));

  assert.equal(coalescedCount() - before, 2, 'two supersedeed jobs were coalesced');
  release();
  await flushQueue();
  assert.deepEqual(written, [3], 'only the newest reading is written');
});
