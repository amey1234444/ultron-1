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
  type MachinePlan,
  type SimulationTarget,
} from '../../../lib/machineSimulationProfile';
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
  const devices: DeviceNode[] = [];
  const cards: CardNode[] = [];
  const layouts: Record<string, SavedLayout> = {};
  const machines: MachinePlan[] = [];
  const skipped: WiringPlan['skipped'] = [];

  targets.forEach((target, index) => {
    const connectors = connectorsForTemplate(target.template);
    if (connectors.length === 0) {
      skipped.push({
        id: target.id,
        name: target.name,
        reason: `${target.template} has no instrument points to wire`,
      });
      return;
    }

    const plan = planMachine(
      target,
      connectors.map((connector) => ({ code: connector.code, label: connector.label, kind: connector.kind })),
      index,
    );
    if (!plan) {
      skipped.push({ id: target.id, name: target.name, reason: 'no hardware could be planned' });
      return;
    }
    if (present.has(plan.gateway.id)) {
      skipped.push({ id: target.id, name: target.name, reason: 'already has generated hardware' });
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

/** One line per machine, for the confirmation the operator reads before applying. */
export function describeWiringPlan(plan: WiringPlan): string[] {
  return plan.machines.map((machine) => {
    const racks = machine.racks.length;
    return `${machine.machineName} · ${machine.profile} · ${machine.points.length} points across ${racks} rack${racks === 1 ? '' : 's'}`;
  });
}
