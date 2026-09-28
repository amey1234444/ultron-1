// Turning a generated hardware plan into a wired canvas.
//
// `planMachine` produces the gateway, racks and cards a machine's instruments
// need. That is half the job: a machine whose hardware exists but whose pads
// are not mapped to it still shows nothing, and mapping them by hand is the
// twenty deliberate acts this is meant to avoid.
//
// The layout it produces is the same one "⟲ Template" produces — a card per
// pad, placed where the template says that pad's card belongs — with each
// card's `channelId` already set to the channel generated for that same
// instrument. Nothing here invents geometry; it binds.
import {
  planMachine,
  SLOTS_PER_RACK,
  type MachinePlan,
  type SimulationTarget,
} from '../../../lib/machineSimulationProfile';
import { normalizeDeviceNameForUniqueness } from '../../../lib/deviceUniqueness';
import type { CardNode } from '../../../lib/rack';
import type { DeviceNode } from '../../../lib/devices';
import { connectorsForTemplate } from './machineConnectors';
import { createTemplateDefaultLayout, type MachineRect } from './templateDefaultLayouts';
import type { SavedLayout } from './TrailBoard';

export type WiringPlan = {
  devices: DeviceNode[];
  cards: CardNode[];
  /** Keyed by machine id, ready to persist through the layout endpoint. */
  layouts: Record<string, SavedLayout>;
  machines: MachinePlan[];
  /** Machines that produced nothing, and why — reported rather than dropped. */
  skipped: { id: string; name: string; reason: string }[];
};

/**
 * Plan hardware and wiring for every machine given.
 *
 * Machines whose template has no instrument registry are skipped and named.
 * That is the generic templates — Motor, Gearbox, Fan and the rest — which
 * have no drawing and therefore no pads; generating a gateway for one would
 * produce hardware with nothing to connect it to.
 */
export function planMachineWiring(
  targets: readonly SimulationTarget[],
  machineRect?: MachineRect | null,
  /**
   * What the workspace already has.
   *
   * Machines whose generated gateway is already present are skipped, so
   * pressing the button twice tops up what is missing rather than producing a
   * second copy of everything. Generated device ids are derived from the
   * machine, so "already generated" is a lookup rather than a guess.
   */
  existingDevices: readonly DeviceNode[] = [],
): WiringPlan {
  const present = new Set(existingDevices.map((device) => device.id));
  const taken = takenAddresses(existingDevices);
  const devices: DeviceNode[] = [];
  const cards: CardNode[] = [];
  const layouts: Record<string, SavedLayout> = {};
  const machines: MachinePlan[] = [];
  const skipped: WiringPlan['skipped'] = [];

  targets.forEach((target) => {
    const connectors = connectorsForTemplate(target.template);
    if (connectors.length === 0) {
      skipped.push({
        id: target.id,
        name: target.name,
        reason: `${target.template} has no instrument points to wire`,
      });
      return;
    }

    // Before planning, not after: a machine that already has its hardware must
    // not consume a block or a name, or re-running the generator would shift
    // every later machine onto different addresses than it had last time.
    const gatewayId = generatedGatewayId(target);
    if (present.has(gatewayId)) {
      skipped.push({ id: target.id, name: target.name, reason: 'already has generated hardware' });
      return;
    }

    const rackCount = Math.max(1, Math.ceil(connectors.length / SLOTS_PER_RACK));
    const addressing = taken.reserve(target.name, rackCount);
    if (!addressing) {
      skipped.push({
        id: target.id,
        name: target.name,
        reason: 'no free address block is left in 10.80.0.0/16',
      });
      return;
    }

    const plan = planMachine(
      target,
      connectors.map((connector) => ({ code: connector.code, label: connector.label, kind: connector.kind })),
      addressing,
    );
    if (!plan) {
      skipped.push({ id: target.id, name: target.name, reason: 'no hardware could be planned' });
      return;
    }

    machines.push(plan);
    devices.push(plan.gateway, ...plan.racks);
    cards.push(...plan.cards);

    // The template's own layout, then bound. Every generated card carries the
    // pad's `templatePointCode`, which is what the channel is matched on —
    // not the label, which two machines can share and an operator can edit.
    const layout = createTemplateDefaultLayout(target.template, [], machineRect ?? null);
    const channelByCode = new Map(plan.points.map((point) => [point.code, point.channelId]));
    layouts[target.id] = {
      ...layout,
      boxes: layout.boxes.map((box) => {
        const channelId = box.templatePointCode ? channelByCode.get(box.templatePointCode) : undefined;
        return channelId ? { ...box, channelId } : box;
      }),
    };
  });

  return { devices, cards, layouts, machines, skipped };
}

/**
 * The gateway id `planMachine` will produce for a machine.
 *
 * Duplicated here so that "does this machine already have hardware?" can be
 * answered without planning it, which is what keeps a re-run from renumbering
 * the machines it is about to skip. Kept in step by
 * `generateMachineWiringChecks`, which plans a machine and compares.
 */
function generatedGatewayId(target: SimulationTarget): string {
  const slug = target.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'machine';
  return `sim-${slug}-${target.id.slice(-6)}-gw`;
}

/** Third octets we will hand out, in order. `10.80.10.0` through `10.80.249.0`. */
const FIRST_BLOCK = 10;
const LAST_BLOCK = 249;

/**
 * What the workspace has already used, and what is still free.
 *
 * Both dimensions the device list refuses to duplicate — configured IPs, and
 * names within a type — are tracked together, because a machine needs a block
 * and a name that are *both* free, and reserving one without the other would
 * only move the collision.
 *
 * Archived devices are ignored, matching `lib/deviceUniqueness`: archiving is
 * how the console retires a device, and a retired address is free again.
 */
function takenAddresses(existing: readonly DeviceNode[]) {
  const ips = new Set<string>();
  const names = new Set<string>();
  for (const device of existing) {
    if (device.archived || (device.type !== 'Gateway' && device.type !== 'Rack')) continue;
    // Read defensively: this is persisted data, and a row written by an
    // older build can be missing a field the type promises.
    const ip = typeof device.ip === 'string' ? device.ip.trim() : '';
    if (ip) ips.add(ip);
    const name = typeof device.name === 'string' ? normalizeDeviceNameForUniqueness(device.name) : '';
    if (name) names.add(`${device.type}:${name}`);
  }

  /** Addresses a machine planned earlier in this same run needs. */
  const addressesFor = (block: number, rackCount: number) => [
    `10.80.${block}.1`,
    ...Array.from({ length: rackCount }, (_, i) => `10.80.${block}.${11 + i}`),
  ];
  const namesFor = (hardwareName: string, rackCount: number) => [
    `Gateway:${normalizeDeviceNameForUniqueness(`GW ${hardwareName}`)}`,
    ...Array.from({ length: rackCount }, (_, i) => `Rack:${normalizeDeviceNameForUniqueness(`${hardwareName} R${i + 1}`)}`),
  ];

  return {
    /**
     * Claim a free block and a free name, or null when the space is full.
     *
     * A machine name may repeat across folders, so the name is disambiguated
     * with a counted suffix when it has to be — the hierarchy keeps the name
     * the operator chose, and only the hardware carries the suffix.
     */
    reserve(machineName: string, rackCount: number): { block: number; hardwareName?: string } | null {
      let block = -1;
      for (let candidate = FIRST_BLOCK; candidate <= LAST_BLOCK; candidate++) {
        if (addressesFor(candidate, rackCount).every((ip) => !ips.has(ip))) {
          block = candidate;
          break;
        }
      }
      if (block < 0) return null;

      let hardwareName = machineName;
      for (let attempt = 2; namesFor(hardwareName, rackCount).some((key) => names.has(key)); attempt++) {
        hardwareName = `${machineName} (${attempt})`;
      }

      for (const ip of addressesFor(block, rackCount)) ips.add(ip);
      for (const key of namesFor(hardwareName, rackCount)) names.add(key);
      return hardwareName === machineName ? { block } : { block, hardwareName };
    },
  };
}

/** One line per machine, for the confirmation the operator reads before applying. */
export function describeWiringPlan(plan: WiringPlan): string[] {
  return plan.machines.map((machine) => {
    const racks = machine.racks.length;
    return `${machine.machineName} · ${machine.profile} · ${machine.points.length} points across ${racks} rack${racks === 1 ? '' : 's'}`;
  });
}
