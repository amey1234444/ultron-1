/**
 * Component health and remaining life, computed from stored measurements.
 *
 * Answers `GET /api/ml/health/:machineId/components/:componentId/rul`.
 *
 * This does not live in the Python service, and the reason is where the data
 * is. Remaining life is a trend over weeks; the service holds rolling windows
 * measured in minutes and has no access to `measurement_history`. Fault
 * prognosis — will this develop in the next thirty minutes — stays there,
 * because that is what the models were trained to answer. The two are
 * different questions over different spans and they are answered in different
 * places on purpose.
 *
 * Everything numeric happens in `lib/rul`, which is pure and checked. This
 * file's whole job is to turn a machine id into the samples and limits that
 * computation needs, and it is deliberately the thin half.
 */
import { listChannels } from '../../lib/rack';
import { buildComponentRul, serializeComponentRul } from '../../lib/rul/estimate';
import { dailyHealth, type IndicatorSample } from '../../lib/rul/healthIndex';
import type { HealthDriver, MaintenanceEvent } from '../../lib/knowledge/ml/rulContract';
import { twinScrewPointByCode } from '../../lib/machinePoints/twinScrewExtruderPoints';
import { isDbEnabled, query } from './db';
import { getWorkspace } from './workspace';

/** How far back to read. Beyond this the component is a different component. */
const HISTORY_DAYS = 120;

/**
 * Which component a template's instrument point belongs to.
 *
 * Only the twin screw is wired up. Every registry carries a `component` on
 * each point, so adding one is an entry here — but each is a separate module
 * with its own component union, and importing sixteen of them to answer a
 * question nobody has asked yet would cost every request that does not need
 * them. A template with no entry reports that it has no component breakdown
 * rather than guessing one.
 */
const COMPONENT_OF: Record<string, (code: string) => string | null> = {
  'Twin Screw Extruder': (code) => twinScrewPointByCode(code)?.component ?? null,
};

export type RulLookup =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/** `rack-id.S04.CH1` → its parts, or null if it is not a channel id. */
function parseChannelId(channelId: string): { rackId: string; slot: number; channel: number } | null {
  const match = /^(.+)\.S(\d{1,3})\.CH(\d{1,3})$/.exec(channelId);
  if (!match) return null;
  return { rackId: match[1], slot: Number(match[2]), channel: Number(match[3]) };
}

function numberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The fields of a saved canvas card this needs.
 *
 * `Workspace.layouts` is stored as free JSON, so its boxes arrive untyped.
 * Narrowed here rather than asserted, because a layout written by an older
 * build can be missing either field and the answer then is that the point is
 * not mapped — not a crash.
 */
type MappedBox = { templatePointCode?: unknown; channelId?: unknown };
function mapping(box: unknown): { code: string; channelId: string } | null {
  const candidate = box as MappedBox;
  return typeof candidate?.templatePointCode === 'string' && typeof candidate?.channelId === 'string'
    ? { code: candidate.templatePointCode, channelId: candidate.channelId }
    : null;
}

type HistoryRow = {
  slot_id: number;
  channel_id: number;
  value: number;
  quality: string;
  danger_threshold: number | null;
  alert_threshold: number | null;
  received_at: Date | string;
};

export async function componentRul(
  workspaceId: string,
  machineId: string,
  componentId: string,
  now = Date.now(),
): Promise<RulLookup> {
  if (!isDbEnabled()) {
    return { ok: false, status: 503, error: 'No database is configured, so there is no history to read.' };
  }
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return { ok: false, status: 404, error: 'Workspace not found.' };

  const machine = workspace.machines.find((candidate) => candidate.id === machineId);
  if (!machine) return { ok: false, status: 404, error: 'Machine not found in this workspace.' };

  const resolve = COMPONENT_OF[machine.template];
  if (!resolve) {
    return { ok: false, status: 501, error: `${machine.template} has no component breakdown configured.` };
  }

  // The canvas is what ties an instrument point to a channel. A machine
  // nobody has wired has no mapping, and that is a different answer from a
  // machine with no history.
  const layout = workspace.layouts?.[machineId];
  const boxes = ((layout?.boxes ?? []) as unknown[])
    .map(mapping)
    .filter((box): box is { code: string; channelId: string } => box !== null && resolve(box.code) === componentId);
  if (boxes.length === 0) {
    return { ok: false, status: 404, error: `No mapped instrument points belong to ${componentId} on this machine.` };
  }

  const channels = new Map(listChannels(workspace.devices, workspace.cards).map((channel) => [channel.id, channel]));
  const racks = new Map(workspace.devices.filter((device) => device.type === 'Rack').map((device) => [device.id, device]));

  // One query per rack rather than per channel: a component's points usually
  // share a rack, and the index is on (gateway, rack, slot, channel).
  const byRack = new Map<string, { slots: Set<number>; channelByKey: Map<string, { id: string; code: string }> }>();
  for (const box of boxes) {
    const parsed = parseChannelId(box.channelId);
    if (!parsed) continue;
    let entry = byRack.get(parsed.rackId);
    if (!entry) {
      entry = { slots: new Set(), channelByKey: new Map() };
      byRack.set(parsed.rackId, entry);
    }
    entry.slots.add(parsed.slot);
    entry.channelByKey.set(`${parsed.slot}:${parsed.channel}`, { id: box.channelId, code: box.code });
  }

  const since = new Date(now - HISTORY_DAYS * 86_400_000).toISOString();
  const samples: Record<string, IndicatorSample[]> = {};
  const driverWeight = new Map<string, { label: string; worst: number }>();

  for (const [rackId, entry] of byRack) {
    const rack = racks.get(rackId);
    if (!rack?.realGatewayId || rack.realRackId === null || rack.realRackId === undefined) continue;

    const rows = await query<HistoryRow>(
      `SELECT slot_id, channel_id, value, quality, danger_threshold, alert_threshold, received_at
         FROM measurement_history
        WHERE gateway_id = $1 AND rack_id = $2 AND slot_id = ANY($3::int[]) AND received_at >= $4
        ORDER BY received_at ASC`,
      [rack.realGatewayId, String(rack.realRackId), [...entry.slots], since],
    );

    for (const row of rows.rows) {
      const bound = entry.channelByKey.get(`${row.slot_id}:${row.channel_id}`);
      if (!bound) continue;
      const channel = channels.get(bound.id);
      // The limits the operator approved on the card, with whatever the
      // controller reported alongside the sample as the fallback.
      const danger = numberOrNull(channel?.alarmCritical) ?? row.danger_threshold;
      const alert = numberOrNull(channel?.alarmWarning) ?? row.alert_threshold;
      const baseline = numberOrNull(channel?.healthyValue);
      if (danger === null || baseline === null) continue;

      const at = row.received_at instanceof Date ? row.received_at.getTime() : Date.parse(String(row.received_at));
      (samples[bound.id] ??= []).push({
        t: at,
        value: row.value,
        baseline,
        danger,
        alert,
        // GOOD only. A sample the controller flagged is not evidence of wear.
        usable: row.quality === 'GOOD',
      });

      const span = danger - baseline;
      if (Math.abs(span) > 1e-9) {
        const consumed = Math.min(1, Math.max(0, (row.value - baseline) / span));
        const seen = driverWeight.get(bound.id);
        if (!seen || consumed > seen.worst) {
          driverWeight.set(bound.id, { label: channel?.label ?? bound.code, worst: consumed });
        }
      }
    }
  }

  const history = dailyHealth(samples);

  // Contribution is each indicator's share of the health actually consumed,
  // so the panel names the measurement driving the number rather than listing
  // every channel on the component.
  const consumedTotal = [...driverWeight.values()].reduce((sum, entry) => sum + entry.worst, 0);
  const drivers: HealthDriver[] = [...driverWeight.entries()]
    .map(([indicator, entry]) => ({
      indicator,
      label: entry.label,
      contribution: consumedTotal > 0 ? entry.worst / consumedTotal : 0,
    }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);

  const warningSample = Object.values(samples).flat().find((sample) => sample.alert !== null);
  const warningHi =
    warningSample && Math.abs(warningSample.danger - warningSample.baseline) > 1e-9
      ? Math.min(1, Math.max(0, 1 - (warningSample.alert! - warningSample.baseline) / (warningSample.danger - warningSample.baseline)))
      : null;

  const events: MaintenanceEvent[] = [];

  const rul = buildComponentRul(
    {
      component: {
        componentId,
        componentType: componentId,
        displayName: componentId,
        // No install record exists yet, so the component's life starts at the
        // oldest measurement rather than at a date nobody entered.
        installedAt: new Date(history[0] ? Date.parse(`${history[0].date}T00:00:00Z`) : now).toISOString(),
      },
      warningHi,
      failureHi: Object.keys(samples).length > 0 ? 0 : null,
      history,
      drivers,
      events,
      thresholdConfigured: Object.keys(samples).length > 0,
    },
    now,
  );

  return { ok: true, payload: serializeComponentRul(rul) };
}
