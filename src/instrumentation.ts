/**
 * Server startup hook.
 *
 * Next calls `register` once per server process, before the first request. It
 * is the only place a background timer can be started that is neither tied to a
 * request nor duplicated across the edge and Node runtimes.
 *
 * The ML feeder and the simulated gateways live here. The MQTT ingest runtime
 * is started by `server.mjs` instead, because it owns the HTTP server's
 * WebSocket upgrade path and has to exist before `listen`.
 *
 * Which of them start depends on `ML_FEED_MODE`. In `direct` the simulated
 * reading goes straight to the model and nothing is written down; in
 * `database` it travels the path a real gateway's reading travels. They are
 * exclusive: running both doubles every machine's rate and makes a
 * prediction impossible to attribute to an input.
 */

export async function register(): Promise<void> {
  // The edge runtime has no timers worth starting and no database access. The
  // check is not decoration — without it this runs twice and every machine is
  // fed at double rate.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { feedMode } = await import('./server/mlDirectFeed');
  const mode = feedMode();

  // Two ways telemetry reaches the models, and only ever one of them at a
  // time. `direct` computes a simulated reading and posts it, storing
  // nothing. `database` is the stored path a real gateway uses: publish,
  // validate, persist, poll, feed. Running both would double every machine's
  // rate and make a prediction impossible to attribute to an input.
  if (mode === 'direct') {
    try {
      const { startMlDirectFeed } = await import('./server/mlDirectFeed');
      startMlDirectFeed();
    } catch (error) {
      console.warn('[instrumentation] the direct ML feed did not start:', (error as Error).message);
    }
    return;
  }

  if (mode === 'off') return;

  try {
    // Publishes on behalf of devices marked `simulated`, through the same
    // ingest path a real gateway uses. Never on behalf of real hardware: a
    // silent real gateway is telling the truth about a real machine.
    const { startSimulatedGateways } = await import('./server/simulatedGateway');
    startSimulatedGateways();
  } catch (error) {
    console.warn('[instrumentation] simulated gateways did not start:', (error as Error).message);
  }

  try {
    const { startMlFeeder } = await import('./server/mlFeeder');
    startMlFeeder();
  } catch (error) {
    // A feeder that will not start must not stop the application booting. It
    // is advisory; the console, the ingest path and the deterministic analysis
    // do not depend on it.
    console.warn('[instrumentation] the ML feeder did not start:', (error as Error).message);
  }
}
