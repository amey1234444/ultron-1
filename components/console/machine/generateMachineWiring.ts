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
  /**
   * Generated rows this plan replaces. Remove them when applying it.
   *
   * A machine wired before its template's instrument list changed keeps a
   * rack built for the old list — twenty cards for a machine that now has
   * eight, in slots the new canvas does not address. It is not enough to
   * leave it be and not enough to add beside it: the old rack has to go.
   * Only ever generated rows, whose ids are derived from the machine.
   */
  supersededDeviceIds: string[];
  supersededCardIds: string[];
  /**
   * Canvases for machines whose hardware is already right.
   *
   * Kept apart from `layouts` on purpose. These machines are not being
   * rewired, and their canvas may be one somebody has arranged by hand — so
   * this is offered rather than applied, and the caller uses it only for a
   * machine whose canvas has nothing mapped on it at all.
   */
  rebind: Record<string, SavedLayout>;
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
  /**
   * The cards already installed.
   *
   * Needed to tell hardware that is still right from hardware built for an
   * older version of the template: the generator makes one card per pad, so
   * a count that no longer matches is the signal to rebuild.
   */
  existingCards: readonly CardNode[] = [],
): WiringPlan {
  const present = new Set(existingDevices.map((device) => device.id));
  const taken = takenAddresses(existingDevices);
  const devices: DeviceNode[] = [];
  const cards: CardNode[] = [];
  const layouts: Record<string, SavedLayout> = {};
  const rebind: Record<string, SavedLayout> = {};
  const machines: MachinePlan[] = [];
  const skipped: WiringPlan['skipped'] = [];
  const supersededDeviceIds: string[] = [];
  const supersededCardIds: string[] = [];

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

    const gatewayId = generatedGatewayId(target);
    // This machine's own generated hardware. Matched on the id the generator
    // derives from the machine, so a gateway somebody added by hand is not
    // mistaken for one of ours and is never superseded below.
    //
    // Cards are matched the same way, on the id of the rack they name rather
    // than on that rack still being there. A deleted rack leaves its cards
    // behind: they belong to no device, they are invisible in the devices
    // table, and a rebuild regenerates the rack under the very id those cards
    // still name — so they have to be found and cleared, or the machine ends
    // with two cards in every slot and a plan that rebuilds it again on the
    // next pass.
    const ownsDevice = (id: string) => id === gatewayId || id.startsWith(`${gatewayId}-r`);
    const ownDevices = existingDevices.filter((device) => ownsDevice(device.id));
    const ownCards = existingCards.filter((card: CardNode) => ownsDevice(card.deviceId));
    const expectedRacks = Math.max(1, Math.ceil(connectors.length / SLOTS_PER_RACK));
    const ownRackCount = ownDevices.filter((device) => device.type === 'Rack').length;

    // Reclaims the block off whatever of this machine's hardware is still
    // there, gateway or rack — a rebuild is the same gateway and must not be
    // renumbered. Only a machine with nothing left claims a free block.
    const plan = planMachineFor(target, connectors, taken, ownDevices.length > 0 ? ownDevices : null);
    if (!plan) {
      skipped.push({ id: target.id, name: target.name, reason: 'no hardware could be planned' });
      return;
    }

    const boundLayout = bindLayout(target, plan, machineRect ?? null);

    // The hardware is there and still matches the template: nothing to build,
    // and a canvas offered in case the machine has lost its own.
    //
    // The rack count is part of "matches". A machine can carry a card per pad
    // and still be missing the rack those cards sit in, which reads as
    // complete by channel count alone and is not something anything can read.
    const intact = present.has(gatewayId)
      && ownRackCount === expectedRacks
      && ownCards.length === connectors.length;
    if (intact) {
      rebind[target.id] = boundLayout;
      skipped.push({ id: target.id, name: target.name, reason: 'already has generated hardware' });
      return;
    }

    // Anything left over carrying this machine's generated ids is superseded,
    // whether or not its gateway survived. Leaving it produces two racks with
    // one id and twice the cards on them, which the device table refuses and
    // which the pass after this one would try to rebuild all over again —
    // the state a deleted gateway used to leave behind.
    if (ownDevices.length > 0 || ownCards.length > 0) {
      for (const device of ownDevices) supersededDeviceIds.push(device.id);
      for (const card of ownCards) supersededCardIds.push(card.id);
      skipped.push({
        id: target.id,
        name: target.name,
        reason: !present.has(gatewayId)
          ? `rebuilt: its gateway was missing, ${ownDevices.length} orphaned device${ownDevices.length === 1 ? '' : 's'} replaced`
          : ownRackCount !== expectedRacks
            ? `rebuilt: ${ownRackCount} rack${ownRackCount === 1 ? '' : 's'} where ${expectedRacks} ${expectedRacks === 1 ? 'is' : 'are'} needed`
            : `rebuilt: ${ownCards.length} channels for ${connectors.length} instrument points`,
      });
    }

    machines.push(plan);
    devices.push(plan.gateway, ...plan.racks);
    cards.push(...plan.cards);
    layouts[target.id] = boundLayout;
  });

  return { devices, cards, layouts, machines, skipped, supersededDeviceIds, supersededCardIds, rebind };
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

/**
 * Plan one machine's hardware, reusing its addresses when it already has them.
 *
 * A rebuild must not move the machine to a different address block: the
 * gateway is the same gateway, and renumbering it would look like a new one
 * to anything watching. So when the machine already has hardware its block is
 * read back off it, and only a genuinely new machine claims a free one.
 */
function planMachineFor(
  target: SimulationTarget,
  connectors: readonly { code: string; label: string; kind?: string }[],
  taken: ReturnType<typeof takenAddresses>,
  existingOwn: readonly DeviceNode[] | null,
): MachinePlan | null {
  const points = connectors.map((connector) => ({ code: connector.code, label: connector.label, kind: connector.kind }));
  const rackCount = Math.max(1, Math.ceil(connectors.length / SLOTS_PER_RACK));

  if (existingOwn && existingOwn.length > 0) {
    const gateway = existingOwn.find((device) => device.type === 'Gateway') ?? existingOwn[0];
    const block = blockOf(gateway.ip);
    const hardwareName = gateway.name.startsWith('GW ') ? gateway.name.slice(3) : target.name;
    if (block !== null) return planMachine(target, points, { block, hardwareName });
  }

  const addressing = taken.reserve(target.name, rackCount);
  return addressing ? planMachine(target, points, addressing) : null;
}

/** The third octet of a 10.80.x.y address, or null if it is not one. */
function blockOf(ip: string | undefined): number | null {
  const match = typeof ip === 'string' ? ip.match(/^10\.80\.(\d{1,3})\.\d{1,3}$/) : null;
  if (!match) return null;
  const block = Number(match[1]);
  return Number.isFinite(block) ? block : null;
}

/** The template's own canvas, with each card bound to its pad's channel. */
function bindLayout(target: SimulationTarget, plan: MachinePlan, machineRect: MachineRect | null): SavedLayout {
  const layout = createTemplateDefaultLayout(target.template, [], machineRect);
  const channelByCode = new Map(plan.points.map((point) => [point.code, point.channelId]));
  return {
    ...layout,
    boxes: layout.boxes.map((box) => {
      const channelId = box.templatePointCode ? channelByCode.get(box.templatePointCode) : undefined;
      return channelId ? { ...box, channelId } : box;
    }),
  };
}

/**
 * Add what a canvas is missing, without disturbing what it has.
 *
 * A machine can be partly wired: some pads carded and mapped, others not.
 * That happens when a template gains a point, when a canvas was saved
 * half-finished, and — the case this was written for — when a template's
 * instrument list is trimmed and the cards for the pads that went are
 * removed, leaving the rest bound and the machine looking finished.
 *
 * Replacing the whole canvas would fix it and throw away wherever the
 * operator had dragged their cards to. Leaving it alone was what the console
 * did, and it left a four-point machine showing one connection for good,
 * because "does this canvas have any channel on it" answered yes.
 *
 * So: a pad with no card gets the card the template would have given it, a
 * card that exists but is bound to nothing gets bound, and everything else
 * is returned exactly as it was. Null when there was nothing to do, so a load
 * that changes nothing writes nothing.
 */
export function withMissingPads(current: SavedLayout, complete: SavedLayout): SavedLayout | null {
  const wanted = new Map(
    complete.boxes.filter((box) => box.templatePointCode).map((box) => [box.templatePointCode as string, box]),
  );
  const present = new Set(
    current.boxes.map((box) => box.templatePointCode).filter((code): code is string => Boolean(code)),
  );
  let changed = false;

  // A card the operator has already placed keeps its position and its label.
  // Only an empty binding is filled in.
  const boxes = current.boxes.map((box) => {
    if (!box.templatePointCode || box.channelId) return box;
    const channelId = wanted.get(box.templatePointCode)?.channelId;
    if (!channelId) return box;
    changed = true;
    return { ...box, channelId };
  });

  const missing = complete.boxes.filter(
    (box) => box.templatePointCode && !present.has(box.templatePointCode),
  );
  if (missing.length > 0) changed = true;
  const missingIds = new Set(missing.map((box) => box.id));

  if (!changed) return null;
  return {
    ...current,
    boxes: [...boxes, ...missing],
    trails: [
      ...current.trails,
      ...complete.trails.filter((trail) => trail.endBoxId && missingIds.has(trail.endBoxId)),
    ],
  };
}

/** One line per machine, for the confirmation the operator reads before applying. */
export function describeWiringPlan(plan: WiringPlan): string[] {
  return plan.machines.map((machine) => {
    const racks = machine.racks.length;
    return `${machine.machineName} · ${machine.profile} · ${machine.points.length} points across ${racks} rack${racks === 1 ? '' : 's'}`;
  });
}
