# Direct WebSocket Gateway Ingest

Use this deployment when the BlackGATE gateway should send data directly to the
application without EMQX/MQTT in the live path.

```text
BlackGATE gateway
  -> wss://YOUR-RENDER-APP/ws/gateway
  -> validated live frame
  -> wss://YOUR-RENDER-APP/ws/live -> frontend
  -> queued persistence -> PostgreSQL/Supabase
```

The frontend still keeps `/api/live/stream` and `/api/live/state` as fallbacks,
but channel telemetry is painted from WebSocket frames first. Database writes are
queued behind the frame and can be optimized later without adding display
latency.

## Single Render Service

Deploy the repo root as one Render Web Service. The custom `server.mjs` starts
Next.js and mounts the gateway/live WebSocket endpoints on the same HTTP server.

The included `render.yaml` creates this single service.

Build command:

```bash
npm ci --include=dev && npm run build
```

Start command:

```bash
npm run start:render
```

Environment:

```env
INGEST_TRANSPORT=websocket
DATABASE_URL=postgresql://...
DIRECT_WS_GATEWAY_SECRET=generate-a-long-random-secret
PERSISTENCE_ENABLED=true
STALE_AFTER_S=15
METRICS_FLUSH_INTERVAL_MS=2000
```

Render sets `PORT` automatically for the web service. Do not hardcode it.

For first live bring-up before database storage is ready, set
`PERSISTENCE_ENABLED=false`. The gateway frames still validate and broadcast to
`/ws/live`, but quarantine/history/latest-state writes and PostgreSQL NOTIFY are
skipped. Turn it back on when `DATABASE_URL` is configured.

Health check:

```text
https://YOUR-RENDER-APP.onrender.com/health
```

Gateway ingest URL:

```text
wss://YOUR-RENDER-APP.onrender.com/ws/gateway
```

Frontend live URL:

```text
wss://YOUR-RENDER-APP.onrender.com/ws/live
```

## Gateway

Set these on the Raspberry Pi gateway:

```env
GATEWAY_TRANSPORT=websocket
DIRECT_WS_URL=wss://YOUR-RENDER-APP.onrender.com/ws/gateway
DIRECT_WS_TOKEN=same-value-as-DIRECT_WS_GATEWAY_SECRET
```

The gateway continues to send the same BlackGATE envelope and topic contract. The
only change is the transport.

## Frontend

By default the browser connects to the same Render origin at `/ws/live`, so no
frontend live URL is required. Only set these when you intentionally want to
override the live WebSocket URL:

```env
NEXT_PUBLIC_ULTRON_LIVE_WS_URL=wss://YOUR-RENDER-APP.onrender.com/ws/live
LIVE_NOTIFY_DATABASE_URL=postgresql://...session-mode-url...
DATABASE_URL=postgresql://...
```

Rebuild after changing `NEXT_PUBLIC_ULTRON_LIVE_WS_URL`; it is also used by the
production Content-Security-Policy header.

## Notes

Use a paid Render instance for gateway deployments. Free instances can sleep,
which breaks long-running gateway WebSockets and adds cold-start latency.
