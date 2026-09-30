/**
 * Simulated gateways, publishing through the real ingest path.
 *
 * A machine wired with generated hardware carries `simulated: true` devices
 * and a signal definition on every card. Until now the only thing that turned
 * those definitions into readings was the console, in the browser — so a
 * simulated machine looked alive on screen and was silent to everything
 * server-side. `getLiveState` reads the database; the ML feeder reads
 * `getLiveState`; so the service was never sent a frame and answered, quite
 * correctly, "no telemetry has been processed for this machine yet".
 *
 * This runs the same simulation on the server and publishes it the way a real
 * gateway does: a v2 envelope per frame, handed to `onMessage`, through
 * validation, dedup, persistence and the live bus. Nothing downstream can
 * tell the difference, which is the point — a simulated machine should
 * exercise the same path as a real one or it proves nothing about it.
 *
 * **It only ever touches devices marked `simulated`.** A gateway that
 * represents real hardware is never published on behalf of; if it is silent,
 * that silence is the truth about a real machine and inventing readings for
 * it would be the worst thing this file could do.
 */
import { randomUUID } from 'node:crypto';

import {
  channelCountForCardType,
  type CardNode,
} from '../../lib/rack';
import { generatedGatewayId } from '../../lib/machineSimulationProfile';
import {
  channelRuntimeKey,
  createSimulationRuntime,
  isSimulatedDevice,
  nextChannelValue,
  simulatedSlotPayload,
  simulationForCard,
  type SimulationRuntime,
} from '../../lib/simulation';
import type { DeviceNode } from '../../lib/devices';
import { onMessage } from './ingest/pipeline.mjs';
import { topicForMessage } from './ingest/topics.mjs';
import { isDbEnabled } from './db';
import { getWorkspace, listWorkspaceIds } from './workspace';

/**
 * Which machines are published for.
 *
 * The twin screw only, for now. Every simulated channel is a row in
 * `measurement_history` on every tick, and the whole oilseed plant at fifty
 * machines writes far more than the one machine anything currently reads.
 * The twin screw is that machine: it is what the ML service is trained
 * against, what `mlFeeder` feeds, and the only template with a component
 * breakdown behind the health index.
 *
 * Widening this is a line. Do it when the storage for it has been decided,
 * not before — the reason it is narrow is cost, not capability.
 */
export const SIMULATED_TEMPLATES = new Set<string>(['Twin Screw Extruder']);

/** Default cadence. See `intervalMs` for why this is not one second. */
const DEFAULT_INTERVAL_MS = 10_000;
const MIN_INTERVAL_MS = 1_000;
/** Structure is republished on this cadence, not every tick. */
const TOPOLOGY_EVERY_MS = 60_000;

type GatewayState = { bootId: string; sequence: number; lastTopologyMs: number };

const globalRef = globalThis as unknown as {
  __ultronSimGateway?: {
    timer: ReturnType<typeof setInterval> | null;
    runtime: SimulationRuntime;
    gateways: Map<string, GatewayState>;
    lastTickMs: number;
  };
};

function state() {
  if (!globalRef.__ultronSimGateway) {
    globalRef.__ultronSimGateway = {
      timer: null,
      runtime: createSimulationRuntime(),
      gateways: new Map(),
      lastTickMs: 0,
    };
  }
  return globalRef.__ultronSimGateway;
}

export function simulationEnabled(): boolean {
  return (process.env.SIMULATE_GATEWAYS ?? '1').trim() !== '0';
}

/**
 * How often to publish.
 *
 * Ten seconds, not one. Every tick writes a row per reporting channel to
 * `measurement_history`, and a plant of fifty machines at thirteen channels
 * each is six hundred rows a tick — a hundred and eighty thousand an hour at
 * this cadence, and ten times that at one second. The channels' own sample
 * rates still cap them individually; this is the floor under all of them.
 */
function intervalMs(): number {
  const raw = Number(process.env.SIMULATE_GATEWAYS_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= MIN_INTERVAL_MS ? raw : DEFAULT_INTERVAL_MS;
}

function gatewayState(gatewayId: string): GatewayState {
  const store = state().gateways;
  let entry = store.get(gatewayId);
  if (!entry) {
    // A boot id per process. Restarting the server is a gateway reboot as far
    // as the dedup logic is concerned, which is exactly what it is.
    entry = { bootId: randomUUID(), sequence: 0, lastTopologyMs: 0 };
    store.set(gatewayId, entry);
  }
  return entry;
}

function envelopeFor(
  schema: string,
  gateway: { realGatewayId: string; ip: string },
  rackId: string | undefined,
  payload: Record<string, unknown>,
  nowMs: number,
): Record<string, unknown> {
  const entry = gatewayState(gateway.realGatewayId);
  entry.sequence += 1;
  return {
    schema,
    schema_version: '2.0',
    message_id: randomUUID(),
    gateway_id: gateway.realGatewayId,
    gateway_boot_id: entry.bootId,
    gateway_ip: gateway.ip.trim(),
    ...(rackId ? { rack_id: rackId } : {}),
    gateway_sequence: entry.sequence,
    created_at: new Date(nowMs).toISOString(),
    created_at_us: String(nowMs * 1000),
    replayed: false,
    payload,
  };
}

async function deliver(message: Record<string, unknown>): Promise<boolean> {
  const topic = topicForMessage(message);
  if (!topic) return false;
  await onMessage(topic, Buffer.from(JSON.stringify(message)));
  return true;
}

export type SimulationTickResult = { gateways: number; frames: number; channels: number };

/**
 * Publish one tick for every simulated gateway in every workspace.
 *
 * Exported so it can be driven by a test or a route rather than only by the
 * timer — the same reason `feedOnce` is separate from the ML feeder's
 * interval.
 */
export async function simulateOnce(nowMs = Date.now()): Promise<SimulationTickResult> {
  const result: SimulationTickResult = { gateways: 0, frames: 0, channels: 0 };
  if (!isDbEnabled() || !simulationEnabled()) return result;

  const store = state();
  const elapsedMs = store.lastTickMs > 0 ? Math.max(0, nowMs - store.lastTickMs) : intervalMs();
  store.lastTickMs = nowMs;

  for (const workspaceId of await listWorkspaceIds()) {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) continue;

    // The gateway id is derived from the machine, so which machine a gateway
    // belongs to is a lookup rather than a string match on its description.
    const wanted = new Set(
      workspace.machines
        .filter((machine) => SIMULATED_TEMPLATES.has(machine.template))
        .map((machine) =>
          generatedGatewayId({ id: machine.id, name: machine.name }),
        ),
    );

    const simulated = workspace.devices.filter(
      (device) =>
        device.type === 'Gateway'
        && !device.archived
        && isSimulatedDevice(device)
        && wanted.has(device.id),
    );

    for (const gateway of simulated) {
      const realId = gateway.realGatewayId;
      if (!realId || !gateway.ip.trim()) continue;
      const racks = workspace.devices.filter(
        (device) => device.type === 'Rack' && !device.archived && device.gatewayId === gateway.id,
      );
      if (racks.length === 0) continue;
      result.gateways += 1;

      const entry = gatewayState(realId);
      if (nowMs - entry.lastTopologyMs >= TOPOLOGY_EVERY_MS) {
        entry.lastTopologyMs = nowMs;
        const topology = envelopeFor(
          'ultron.gateway.topology',
          { realGatewayId: realId, ip: gateway.ip },
          undefined,
          {
            racks: racks.map((rack) => ({
              rack_id: String(rack.realRackId ?? rack.id),
              status: 'connected',
              data_current: true,
            })),
          },
          nowMs,
        );
        if (await deliver(topology)) result.frames += 1;
        const status = envelopeFor(
          'ultron.gateway.status',
          { realGatewayId: realId, ip: gateway.ip },
          undefined,
          { state: 'ONLINE' },
          nowMs,
        );
        if (await deliver(status)) result.frames += 1;
      }

      for (const rack of racks) {
        const rackId = String(rack.realRackId ?? rack.id);
        const cards = workspace.cards.filter((card) => card.deviceId === rack.id);
        const telemetry = telemetryEnvelope(
          { realGatewayId: realId, ip: gateway.ip },
          rackId,
          cards,
          store.runtime,
          elapsedMs,
          nowMs,
        );
        if (telemetry && (await deliver(telemetry))) {
          result.frames += 1;
          result.channels += ((telemetry.payload as { slots: unknown[] }).slots ?? []).length;
        }
      }
    }
  }

  return result;
}

/**
 * One rack's telemetry message, ready to publish.
 *
 * Exported so the envelope can be validated against the same schema the
 * ingest path enforces, without a database or a broker. A simulated gateway
 * whose messages the validator rejects publishes nothing, and the symptom is
 * silence — the failure this whole file exists to remove.
 */
export function telemetryEnvelope(
  gateway: { realGatewayId: string; ip: string },
  rackId: string,
  cards: readonly CardNode[],
  runtime: SimulationRuntime,
  elapsedMs: number,
  nowMs: number,
): Record<string, unknown> | null {
  const slots = slotsFor(gateway.realGatewayId, rackId, cards, runtime, elapsedMs);
  if (slots.length === 0) return null;
  return envelopeFor(
    'ultron.rack.telemetry',
    gateway,
    rackId,
    // `rack_id` and `slot_count` are required inside the payload as well as
    // on the envelope. Not redundancy: a rack message is consumed by things
    // that were handed the payload alone, and the count is how a truncated
    // batch is noticed.
    { rack_id: rackId, slot_count: slots.length, telemetry: { data_current: true }, slots },
    nowMs,
  );
}

function slotsFor(
  gatewayId: string,
  rackId: string,
  cards: readonly CardNode[],
  runtime: SimulationRuntime,
  elapsedMs: number,
): Record<string, unknown>[] {
  const slots: Record<string, unknown>[] = [];
  for (const card of cards) {
    const count = channelCountForCardType(card.type);
    if (count === 0 || !card.enabled) continue;
    const channels = simulationForCard(card);
    const names = 'channelNames' in card.config ? (card.config.channelNames as string[]) : [];

    for (let index = 0; index < count; index += 1) {
      const channel = channels[index];
      if (!channel?.enabled) continue;
      const channelNumber = index + 1;
      const key = channelRuntimeKey(gatewayId, rackId, card.slot, channelNumber);
      const value = nextChannelValue(key, channel, runtime, elapsedMs);
      slots.push(
        simulatedSlotPayload(card.slot, channelNumber, card.type, names[index]?.trim() ?? '', channel, value) as unknown as Record<string, unknown>,
      );
    }
  }
  return slots;
}

/** Start the timer. Idempotent, and a no-op when simulation is switched off. */
export function startSimulatedGateways(): void {
  if (!simulationEnabled() || !isDbEnabled()) return;
  const store = state();
  if (store.timer) return;
  store.timer = setInterval(() => {
    void simulateOnce().catch(() => {
      // A tick that fails is a tick. The next one is along shortly, and
      // logging every transient database hiccup from a background timer
      // would bury whatever is actually wrong.
    });
  }, intervalMs());
  if (typeof store.timer.unref === 'function') store.timer.unref();
}
