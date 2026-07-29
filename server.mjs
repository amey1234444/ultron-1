import { createServer } from 'node:http';

import next from 'next';

import {
  attachIngestWebSockets,
  handleIngestHealth,
  startIngestRuntime,
} from './services/mqtt-ingest/index.js';

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
  console.log(`[ultron] Next app + gateway WebSockets listening on :${port}`);
});
