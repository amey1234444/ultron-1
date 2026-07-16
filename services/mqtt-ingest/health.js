// Minimal HTTP health endpoint. Lets the worker run as a (free) web service
// on hosts that require an open HTTP port, and gives keep-alive pingers a
// target. Responds on / and /healthz with the live MQTT connection state.

import { createServer } from 'node:http';

export function startHealthServer(port, getStatus) {
  const server = createServer((req, res) => {
    if (req.url === '/' || req.url === '/healthz') {
      // Always 200: the process being up is what matters to the platform's
      // health check; MQTT connection state is reported in the body.
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getStatus()));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"not found"}');
    }
  });
  server.listen(port, () => console.log(`[health] listening on :${port}`));
  return server;
}
