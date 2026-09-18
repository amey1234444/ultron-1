/**
 * The machine-knowledge registry.
 *
 * Keyed by DOC-01 `template_id`, which is the variant — TSE-7Z-CR-INT-PAR-COMP
 * is 7-Zone, Co-Rotating, INTermeshing, PARallel, COMPounding. That is the
 * whole point of keying it this way: a counter-rotating machine added later
 * gets its own key and its own pack, and there is no arrangement of the code in
 * which it can reach this one.
 *
 * The console template appears only as an attribute of a pack, never as a key.
 * `packsForConsoleTemplate` reads it to answer the one question the Add Machine
 * dialog needs — which variants may a machine of this template be — and that is
 * a reverse index for offering a choice, not a way of resolving knowledge.
 */

import type { MachineTemplate } from '../machines';
import type { KnowledgeResolution, MachineKnowledge } from './machineKnowledge';
import { TSE_KNOWLEDGE } from './tse/pack';

/** Every declared machine template, by its DOC-01 template id. */
export const KNOWLEDGE_PACKS: readonly MachineKnowledge[] = [TSE_KNOWLEDGE];

const BY_TEMPLATE_ID = new Map(KNOWLEDGE_PACKS.map((pack) => [pack.template.templateId, pack]));

/** The pack for a DOC-01 template id, or undefined when none claims it. */
export function knowledgeForTemplateId(templateId: string | null | undefined): MachineKnowledge | undefined {
  if (!templateId) return undefined;
  return BY_TEMPLATE_ID.get(templateId);
}

/**
 * The variants a console template may be built as.
 *
 * Empty for every template with no knowledge document written yet, which is
 * what the Add Machine dialog reads to decide whether to show the dropdown.
 */
export function packsForConsoleTemplate(
  consoleTemplate: MachineTemplate | null | undefined,
): MachineKnowledge[] {
  if (!consoleTemplate) return [];
  return KNOWLEDGE_PACKS.filter((pack) => pack.consoleTemplate === consoleTemplate);
}

/**
 * Resolve a machine's knowledge from its declared variant.
 *
 * The only supported route from a machine to its process knowledge. It reads
 * `variantId` and nothing else to choose a pack; `template` is used solely to
 * tell the three failure cases apart, never to pick a pack when the variant is
 * missing.
 */
export function knowledgeForMachine(machine: {
  template: MachineTemplate;
  variantId?: string | null;
}): KnowledgeResolution {
  const available = packsForConsoleTemplate(machine.template);

  if (available.length === 0) {
    return { kind: 'no-knowledge-for-template', consoleTemplate: machine.template };
  }

  if (!machine.variantId) {
    return { kind: 'variant-undeclared', consoleTemplate: machine.template, available };
  }

  const pack = BY_TEMPLATE_ID.get(machine.variantId);

  // A pack that belongs to a different console template is not this machine's
  // knowledge, however the id came to be stored. A template change on an
  // existing machine would leave exactly this behind.
  if (!pack || pack.consoleTemplate !== machine.template) {
    return { kind: 'variant-unknown', variantId: machine.variantId };
  }

  return { kind: 'resolved', knowledge: pack };
}

/**
 * The engineering facts that apply to a machine.
 *
 * Empty when no variant is declared, which is the honest answer: the DOC-01 §16
 * fact register is written per machine template, so with no template identity
 * there is no register — as opposed to a register whose values are merely not
 * filled in yet. The rule layer reports both states, and they read differently.
 */
export function factsForMachine(machine: {
  template: MachineTemplate;
  variantId?: string | null;
}): readonly import('./tse/types').EngineeringFact[] {
  const resolution = knowledgeForMachine(machine);
  return resolution.kind === 'resolved' ? resolution.knowledge.requiredFacts : [];
}
