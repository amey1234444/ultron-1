/**
 * Simulated telemetry straight to the model, and nothing written down.
 *
 * The other path goes through the database: a gateway publishes, ingest
 * validates and persists, `getLiveState` reads it back, the feeder builds a
 * frame from what it read. That is the right shape for real hardware — the
 * store decouples the models from the ingest hot path and survives a restart
 * — and it is a lot of machinery to stand between a simulated value and the
 * model that is going to score it.
 *
 * This is the short way round. The simulation already knows what every
 * channel reads; that value is put straight into a canonical frame, posted,
 * and the answer returned to the caller. No row is written, nothing is
 * persisted, and the prediction is not stored either. Turning it off leaves
 * no trace behind it, which is the point of running it this way while the
 * storage design is still being decided.
 *
 * What is given up, said plainly, because both are real:
 *
 *   - **No history.** Nothing accumulates, so the health index and remaining
 *     life have nothing to trend and will report INSUFFICIENT_HISTORY for as
 *     long as this is the only path running. Those read `measurement_history`.
 *   - **No audit trail.** A prediction nobody stored cannot be compared later
 *     against what actually happened, which is the whole basis on which a
 *     model earns promotion.
 *
 * Both come back by turning the stored path on. Neither is a reason not to
 * have this one while the machines are simulated and the question is whether
 * the chain answers at all.
 */
import { channelCountForCardType, listChannels, type CardNode } from '../../lib/rack';
import {
  channelRuntimeKey,
  createSimulationRuntime,
  isSimulatedDevice,
  nextChannelValue,
  simulationForCard,
  type SimulationRuntime,
} from '../../lib/simulation';
import { generatedGatewayId } from '../../lib/machineSimulationProfile';
import { normaliseReading, UnitError } from '../../lib/analysis/twinScrew/signalMap';
import { twinScrewPointByCode } from '../../lib/machinePoints/twinScrewExtruderPoints';
import { mlConfigured, runInference } from './mlClient';
import { isDbEnabled } from './db';
import { getWorkspace, listWorkspaceIds } from './workspace';

const TWIN_SCREW = 'Twin Screw Extruder';
const DEFAULT_INTERVAL_MS = 5_000;
const MIN_INTERVAL_MS = 1_000;

export type DirectFeedOutcome = {
  machineId: string;
  sent: boolean;
  reporting?: number;
  reason?: string;
  predictionId?: string;
};

const globalRef = globalThis as unknown as {
  __ultronMlDirect?: { timer: ReturnType<typeof setInterval> | null; runtime: SimulationRuntime; lastTickMs: number };
};

function state() {
  if (!globalRef.__ultronMlDirect) {
    globalRef.__ultronMlDirect = { timer: null, runtime: createSimulationRuntime(), lastTickMs: 0 };
  }
  return globalRef.__ultronMlDirect;
}

/**
 * `direct` posts simulated readings straight to the model and stores nothing.
 * `database` is the stored path: ingest, persist, poll, feed.
 */
export function feedMode(): 'direct' | 'database' | 'off' {
  const raw = (process.env.ML_FEED_MODE ?? 'direct').trim().toLowerCase();
  return raw === 'database' || raw === 'off' ? raw : 'direct';
}

function intervalMs(): number {
  const raw = Number(process.env.ML_DIRECT_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  return Number.isFinite(raw) && raw >= MIN_INTERVAL_MS ? raw : DEFAULT_INTERVAL_MS;
}

type Reading = { tag: string; value: number | null; unit: string | null };

/**
 * Every mapped pad's current reading, computed rather than looked up.
 *
 * The canvas says which channel a pad is wired to and the registry says which
 * analyzer tag that pad is, so the value the simulation produces for that
 * channel is the value of that tag. No store is consulted because nothing
 * here was ever stored.
 */
export function readingsFor(
  boxes: readonly { templatePointCode?: unknown; channelId?: unknown }[],
  cards: readonly CardNode[],
  gatewayRealId: string,
  racks: Map<string, string>,
  runtime: SimulationRuntime,
  elapsedMs: number,
): Reading[] {
  const cardBySlot = new Map(cards.map((card) => [`${card.deviceId}:${card.slot}`, card]));
  const readings: Reading[] = [];

  for (const box of boxes) {
    if (typeof box.templatePointCode !== 'string' || typeof box.channelId !== 'string') continue;
    const point = twinScrewPointByCode(box.templatePointCode);
    if (!point) continue;

    const parsed = /^(.+)\.S(\d{1,3})\.CH(\d{1,3})$/.exec(box.channelId);
    if (!parsed) continue;
    const [, rackDeviceId, slotText, channelText] = parsed;
    const card = cardBySlot.get(`${rackDeviceId}:${Number(slotText)}`);
    const realRackId = racks.get(rackDeviceId);
    if (!card || !realRackId || !card.enabled) continue;

    const channelNumber = Number(channelText);
    if (channelNumber > channelCountForCardType(card.type)) continue;
    const channel = simulationForCard(card)[channelNumber - 1];
    if (!channel?.enabled) continue;

    const key = channelRuntimeKey(gatewayRealId, realRackId, card.slot, channelNumber);
    const raw = nextChannelValue(key, channel, runtime, elapsedMs);

    try {
      const normalised = normaliseReading(point.analyzerTag, raw, channel.unit);
      readings.push({ tag: point.analyzerTag, value: normalised.value, unit: normalised.unit });
    } catch (error) {
      // A unit the tag cannot carry is a configuration fault. The value is
      // withheld rather than sent unconverted, exactly as the stored path
      // does, and the service reports it as DQ-008.
      if (!(error instanceof UnitError)) throw error;
      readings.push({ tag: point.analyzerTag, value: null, unit: channel.unit });
    }
  }
  return readings;
}

/** One tick: build a frame per twin screw, post it, return what came back. */
export async function feedDirectOnce(nowMs = Date.now()): Promise<DirectFeedOutcome[]> {
  if (!mlConfigured() || !isDbEnabled()) return [];

  const store = state();
  const elapsedMs = store.lastTickMs > 0 ? Math.max(0, nowMs - store.lastTickMs) : intervalMs();
  store.lastTickMs = nowMs;

  const outcomes: DirectFeedOutcome[] = [];

  for (const workspaceId of await listWorkspaceIds()) {
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) continue;

    const machines = workspace.machines.filter((machine) => machine.template === TWIN_SCREW);
    if (machines.length === 0) continue;

    const racks = new Map(
      workspace.devices
        .filter((device) => device.type === 'Rack' && !device.archived)
        .map((device) => [device.id, String(device.realRackId ?? device.id)] as const),
    );
    // Only simulated machines. A real twin screw is fed from what its gateway
    // actually reported, through the stored path; inventing readings for one
    // would be the worst thing this file could do.
    const simulated = new Set(
      workspace.devices.filter((device) => isSimulatedDevice(device)).map((device) => device.id),
    );

    for (const machine of machines) {
      const gatewayId = generatedGatewayId({ id: machine.id, name: machine.name });
      if (!simulated.has(gatewayId)) {
        outcomes.push({ machineId: machine.id, sent: false, reason: 'not a simulated machine' });
        continue;
      }
      const boxes = (workspace.layouts?.[machine.id]?.boxes ?? []) as readonly {
        templatePointCode?: unknown;
        channelId?: unknown;
      }[];
      const readings = readingsFor(
        boxes,
        workspace.cards,
        `${gatewayId}-real`,
        racks,
        store.runtime,
        elapsedMs,
      );
      const reporting = readings.filter((reading) => reading.value !== null).length;
      if (reporting === 0) {
        outcomes.push({ machineId: machine.id, sent: false, reason: 'no mapped channel is reporting' });
        continue;
      }

      const at = new Date(nowMs).toISOString();
      const channels: Record<string, unknown> = {};
      for (const reading of readings) {
        channels[reading.tag] = {
          value: reading.value,
          unit: reading.unit,
          source_timestamp: at,
          received_at: at,
          source_quality: 'GOOD',
          source: 'simulator',
          alert_active: false,
          danger_active: false,
          trip_active: false,
        };
      }

      const response = await runInference({
        machine_id: machine.id,
        timestamp: at,
        machine_type: 'TWIN_SCREW_EXTRUDER',
        template_id: machine.variantId ?? null,
        configuration_version: null,
        context: { recipe_id: null, material_id: null, commanded_change: null },
        channels,
        setpoints: {},
        // Labelled at the source. A prediction made from generated readings
        // must never be mistaken for one made from a machine.
        data_source: 'SIMULATION',
        sequence: null,
        ingest_metadata: { mapped_channels: readings.length, reporting, unknown_points: [], unit_problems: [] },
      });

      // Deliberately not persisted. This path stores nothing; see the file
      // comment for what that costs.
      outcomes.push(
        response.ok
          ? { machineId: machine.id, sent: true, reporting, predictionId: response.value.predictionId }
          : { machineId: machine.id, sent: false, reporting, reason: response.detail },
      );
    }
  }

  return outcomes;
}

/** Start the timer. Idempotent, and a no-op unless the mode is `direct`. */
export function startMlDirectFeed(): void {
  if (feedMode() !== 'direct' || !mlConfigured() || !isDbEnabled()) return;
  const store = state();
  if (store.timer) return;
  store.timer = setInterval(() => {
    void feedDirectOnce().catch(() => {
      // A tick that fails is a tick; the next is along shortly.
    });
  }, intervalMs());
  if (typeof store.timer.unref === 'function') store.timer.unref();
}
