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
 * Order matters between the two below. The simulator publishes telemetry and
 * the feeder reads it back from the database, so starting the feeder first
 * would spend its first tick or two finding nothing — harmless, and avoidable
 * by starting them the way round the data flows.
 */

export async function register(): Promise<void> {
  // The edge runtime has no timers worth starting and no database access. The
  // check is not decoration — without it this runs twice and every machine is
  // fed at double rate.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

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
