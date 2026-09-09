// Application server: Next.js and the MQTT ingest runtime in one process.
//
// The ingest runtime is not a sidecar — it holds this process's broker
// subscription, fans frames out to the browsers connected to this instance, and
// exposes its command publisher to the API routes running alongside it.

import { createServer } from 'node:http';

import next from 'next';

import {
  attachIngestWebSockets,
  handleIngestHealth,
  startIngestRuntime,
  stopIngestRuntime,
} from './src/server/ingest/index.mjs';

const port = Number(process.env.PORT ?? 3000);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();
await startIngestRuntime();

const server = createServer((req, res) => {
  if (handleIngestHealth(req, res)) return;
  handle(req, res);
});

attachIngestWebSockets(server);

server.listen(port, () => {
  console.log(`[ultron] Next app + MQTT ingest listening on :${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    void stopIngestRuntime().finally(() => process.exit(0));
  });
}
