// Per-payload latency, measured on two clocks that must not be confused.
//
//   gatewayToApp : msg.created_at_us (the GATEWAY's clock) → arrival here (OUR
//                  clock). This is the number people mean by "end to end", and
//                  it is only as trustworthy as the gateway's clock. A
//                  Raspberry Pi has no battery-backed RTC, so one that has not
//                  synced NTP reports its own clock error as latency.
//   pipeline     : arrival here → frame handed to the browser sockets. One
//                  clock, one process, so this number is exact regardless of
//                  what any gateway believes the time is.
//
// Both are kept because they answer different questions: pipeline says whether
// this application is the bottleneck, gatewayToApp says whether the reading on
// screen is fresh.
//
// Skew shows up in the minimum. True latency has a floor (serialise, one
// network hop, parse) that is small and positive, so over a few hundred samples
// the smallest observed gatewayToApp is roughly the clock offset. A negative
// minimum is proof of skew — it means a message was stamped in the future.

const WINDOW = Number(process.env.LATENCY_WINDOW ?? 1000);
// Log every Nth payload's latency. 0 = off; 1 = every message.
const LOG_EVERY = Number(process.env.LATENCY_LOG_EVERY ?? 0);
// Below this, a negative or large minimum is more likely noise than skew.
const MIN_SAMPLES_FOR_SKEW = 20;
const SKEW_SUSPECT_MS = 2000;

function series() {
  return { samples: new Array(WINDOW), count: 0, total: 0, last: null };
}

const streams = new Map(); // name -> series
let logged = 0;

function push(name, ms) {
  let stream = streams.get(name);
  if (!stream) {
    stream = series();
    streams.set(name, stream);
  }
  stream.samples[stream.count % WINDOW] = ms;
  stream.count += 1;
  stream.total += 1;
  stream.last = ms;
}

function stats(stream) {
  const size = Math.min(stream.count, WINDOW);
  if (size === 0) return null;
  const sorted = stream.samples.slice(0, size).sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(size - 1, Math.floor((size - 1) * p))];
  const mean = sorted.reduce((sum, value) => sum + value, 0) / size;
  return {
    samples: size,
    total: stream.total,
    last: round(stream.last),
    min: round(sorted[0]),
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    p99: round(at(0.99)),
    max: round(sorted[size - 1]),
    mean: round(mean),
  };
}

function round(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 1000) / 1000;
}

// `gatewayId` keeps fleets separable: one Pi with a bad clock should not make
// every other gateway's numbers look wrong.
export function recordGatewayToApp(gatewayId, sourceCreatedAtMs, arrivedAtMs) {
  if (typeof sourceCreatedAtMs !== 'number' || !Number.isFinite(sourceCreatedAtMs)) return null;
  const ms = arrivedAtMs - sourceCreatedAtMs;
  push('gatewayToApp', ms);
  if (gatewayId) push(`gateway:${gatewayId}`, ms);
  return ms;
}

export function recordPipeline(ms) {
  push('pipeline', ms);
}

export function maybeLogPayload(topic, gatewayToAppMs, pipelineMs) {
  if (LOG_EVERY <= 0) return;
  logged += 1;
  if (logged % LOG_EVERY !== 0) return;
  const end = gatewayToAppMs === null ? 'n/a' : `${round(gatewayToAppMs)}ms`;
  console.log(`[latency] ${topic} gateway→app ${end} pipeline ${round(pipelineMs)}ms`);
}

function assessClock(gatewayStats) {
  if (!gatewayStats || gatewayStats.samples < MIN_SAMPLES_FOR_SKEW) {
    return { skewSuspected: false, estimatedOffsetMs: null, note: 'not enough samples yet' };
  }
  const offset = gatewayStats.min;
  if (offset < 0) {
    return {
      skewSuspected: true,
      estimatedOffsetMs: offset,
      note: "messages arrive stamped in the future: this gateway's clock is ahead of the server. Run `sudo timedatectl set-ntp true` on it; its gateway->app figures are unusable until then.",
    };
  }
  if (offset > SKEW_SUSPECT_MS) {
    return {
      skewSuspected: true,
      estimatedOffsetMs: offset,
      note: `even the fastest message took ${offset}ms, far above any network floor: this gateway's clock is probably behind the server by about that much. Subtract it, or sync NTP on the gateway.`,
    };
  }
  return {
    skewSuspected: false,
    estimatedOffsetMs: offset,
    note: "minimum observed latency is plausible as a real network floor, so this gateway's clock looks synchronised.",
  };
}

export function latencySnapshot() {
  const end = streams.get('gatewayToApp');
  const endStats = end ? stats(end) : null;

  const perGateway = {};
  for (const [name, stream] of streams) {
    if (name.startsWith('gateway:')) perGateway[name.slice('gateway:'.length)] = stats(stream);
  }

  // Assessed per gateway, because each one has its own clock. A single fleet
  // figure would let one unsynced Pi discredit every other gateway's numbers,
  // or hide its own skew behind theirs.
  const clocks = {};
  let anySkewSuspected = false;
  for (const [gatewayId, gatewayStats] of Object.entries(perGateway)) {
    clocks[gatewayId] = assessClock(gatewayStats);
    if (clocks[gatewayId].skewSuspected) anySkewSuspected = true;
  }

  return {
    units: 'milliseconds',
    gatewayToApp: endStats,
    pipeline: streams.has('pipeline') ? stats(streams.get('pipeline')) : null,
    perGateway,
    clocks,
    anySkewSuspected,
    windowSize: WINDOW,
  };
}
