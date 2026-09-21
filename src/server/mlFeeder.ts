/**
 * The thing that keeps the ML service fed.
 *
 * Shadow mode only produces data if frames arrive whether or not anyone is
 * looking. A browser-driven feed collects telemetry while a tab is open and
 * nothing overnight, which is precisely the period a developing fault runs
 * through — so the feed lives here, on the server, and runs on a timer.
 *
 * What it does, per tick, per twin-screw machine:
 *
 *   read the workspace and live state (already cached for the console)
 *     → build a canonical frame from the mapped channels
 *     → skip it if nothing is reporting
 *     → POST it to the service
 *     → persist the diagnosis
 *
 * Three properties it holds:
 *
 * **It never throws into anything.** A tick that fails logs and returns. The
 * feeder going down must not take the ingest path, the console or the
 * deterministic analysis with it — it is the most optional component in the
 * system.
 *
 * **It does not start itself.** `startMlFeeder` is called from the server
 * entry point and is a no-op unless `ML_SERVICE_URL` is set, so a deployment
 * that has not adopted the ML layer pays nothing and starts no timers.
 *
 * **It is single-instance by construction.** The interval handle lives on
 * `globalThis`, because Next's dev server re-evaluates modules and two timers
 * would double every machine's frame rate and corrupt the service's own
 * duplicate detection.
 */

import { buildTelemetryFrame, frameIsWorthSending } from '../../lib/knowledge/ml/telemetryFrame';
import { applyLiveStatus } from '../../lib/liveTelemetry';
import { listChannels } from '../../lib/rack';
import { mlConfigured, runInference } from './mlClient';
import { persistMlDiagnosis } from './mlPersistence';
import { getLiveState } from './telemetry';
import { getWorkspace, type Layout } from './workspace';

/** The console template whose mapped points carry twin-screw analyser tags. */
const TWIN_SCREW_TEMPLATE = 'Twin Screw Extruder';

type LayoutBox = { id?: string; label?: string; channelId?: string; templatePointCode?: string };

const globalRef = globalThis as unknown as {
  __ultronMlFeeder?: ReturnType<typeof setInterval>;
  __ultronMlFeederSeq?: Map<string, number>;
};

function intervalMs(): number {
  const raw = Number(process.env.ML_FEED_INTERVAL_MS ?? '5000');
  // Floored at a second. The service applies its own inference cadence on top,
  // so feeding faster than this buys rolling-window resolution and nothing
  // else, and feeding faster than the telemetry arrives buys nothing at all.
  return Number.isFinite(raw) && raw >= 1000 ? raw : 5000;
}

function boxes(layout: Layout | undefined): LayoutBox[] {
  return Array.isArray(layout?.boxes) ? (layout.boxes as LayoutBox[]) : [];
}

function nextSequence(machineId: string): number {
  if (!globalRef.__ultronMlFeederSeq) globalRef.__ultronMlFeederSeq = new Map();
  const next = (globalRef.__ultronMlFeederSeq.get(machineId) ?? 0) + 1;
  globalRef.__ultronMlFeederSeq.set(machineId, next);
  return next;
}

export type FeedOutcome = {
  machineId: string;
  sent: boolean;
  reason?: string;
  reporting?: number;
  predictionId?: string;
  stored?: boolean;
};

/**
 * One pass over every twin-screw machine in the workspace.
 *
 * Exported so the tick can be driven by a cron route or a test instead of the
 * timer — the same reason the feature is a function rather than a closure over
 * an interval.
 */
export async function feedOnce(): Promise<FeedOutcome[]> {
  if (!mlConfigured()) return [];

  const workspace = await getWorkspace();
  if (!workspace) return [];

  const machines = workspace.machines.filter((entry) => entry.template === TWIN_SCREW_TEMPLATE);
  if (machines.length === 0) return [];

  const live = await getLiveState();
  const liveDevices = applyLiveStatus(workspace.devices, live);
  const channels = listChannels(liveDevices, workspace.cards);
  const byId = new Map(channels.map((channel) => [channel.id, channel]));

  const outcomes: FeedOutcome[] = [];

  for (const machine of machines) {
    const mapped = boxes(workspace.layouts[machine.id])
      .map((box) => {
        const channel = box.channelId ? byId.get(box.channelId) : undefined;
        if (!channel || !box.templatePointCode) return null;
        return {
          templatePointCode: box.templatePointCode,
          channel: {
            rackId: channel.rackId,
            slot: channel.slot,
            id: channel.id,
            unit: channel.unit,
          },
          label: box.label ?? channel.label,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    if (mapped.length === 0) {
      outcomes.push({ machineId: machine.id, sent: false, reason: 'No channels are mapped.' });
      continue;
    }

    const result = buildTelemetryFrame({
      machineId: machine.id,
      variantId: machine.variantId ?? null,
      configurationVersion: null,
      channels: mapped,
      devices: liveDevices,
      cards: workspace.cards,
      live,
      sequence: nextSequence(machine.id),
    });

    if (!frameIsWorthSending(result)) {
      // Not an error: an unwired or stopped machine reports nothing, and
      // filling the service's windows with empty frames would make a gap look
      // like a measurement.
      outcomes.push({ machineId: machine.id, sent: false, reason: 'No channel is reporting.' });
      continue;
    }

    const response = await runInference(result.frame);
    if (!response.ok) {
      outcomes.push({ machineId: machine.id, sent: false, reason: response.detail });
      continue;
    }

    const stored = await persistMlDiagnosis(response.value).catch(() => ({ stored: false }));
    outcomes.push({
      machineId: machine.id,
      sent: true,
      reporting: result.diagnostics.reportingCount,
      predictionId: response.value.predictionId,
      stored: stored.stored,
    });
  }

  return outcomes;
}

/**
 * Start the timer. Idempotent, and a no-op when the ML layer is not configured.
 */
export function startMlFeeder(): void {
  if (!mlConfigured()) return;
  if (globalRef.__ultronMlFeeder) return;

  const period = intervalMs();
  let running = false;

  globalRef.__ultronMlFeeder = setInterval(() => {
    // A tick that overruns must not stack. The service's own cadence means a
    // skipped tick costs nothing; overlapping ticks would double-count
    // sequence numbers and confuse its duplicate detection.
    if (running) return;
    running = true;
    void feedOnce()
      .catch((error: unknown) => {
        console.warn('[ml-feeder] tick failed:', (error as Error).message);
      })
      .finally(() => {
        running = false;
      });
  }, period);

  // Never hold the process open on its own account. The DOM `setInterval`
  // type says this returns a number; under Node it is a Timeout with `unref`,
  // so the capability is checked rather than the type widened.
  (globalRef.__ultronMlFeeder as unknown as { unref?: () => void }).unref?.();
  console.log(`[ml-feeder] feeding the ML service every ${period}ms`);
}

export function stopMlFeeder(): void {
  if (globalRef.__ultronMlFeeder) {
    clearInterval(globalRef.__ultronMlFeeder);
    globalRef.__ultronMlFeeder = undefined;
  }
}
