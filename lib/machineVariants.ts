/**
 * Machine variants, as the console needs to talk about them.
 *
 * This file used to hold its own list of variants alongside the knowledge
 * module, which made the variant a label that happened to sit next to the
 * knowledge rather than the thing that selects it. DOC-01 §21 puts `variant`
 * among the minimum fields of `MachineTemplate` and encodes it in
 * `template_id`, so the knowledge registry is the single source of truth and
 * everything here is a projection of it.
 *
 * What remains is the presentation layer: the Add Machine dialog needs a list
 * of options with names and ids, and a machine header needs a short label. The
 * resolution that actually matters — which process knowledge applies to a
 * machine — lives in `lib/knowledge/registry.ts` and runs from `variantId`
 * alone.
 */

import type { MachineKnowledge, VariantStanding } from './knowledge/machineKnowledge';
import { knowledgeForMachine, knowledgeForTemplateId, KNOWLEDGE_PACKS, packsForConsoleTemplate } from './knowledge/registry';
import type { MachineTemplate } from './machines';

export type { VariantStanding };

export type MachineVariant = {
  /** Stable id, stored on the machine. This is the DOC-01 template id. */
  variantId: string;
  /** The console template this variant is built on. */
  template: MachineTemplate;
  /** The variant's name — DOC-01 §21's `variant` field, composed from the template. */
  name: string;
  /** One line on what the variant is for, for the dropdown's second row. */
  summary: string;
  standing: VariantStanding;
  documentRef: string;
};

function asVariant(pack: MachineKnowledge): MachineVariant {
  return {
    variantId: pack.template.templateId,
    template: pack.consoleTemplate,
    // Read straight off the template rather than restated here. DOC-01 §21
    // makes this a field of MachineTemplate, and composing it there means the
    // dropdown cannot show "Co-Rotating" for a template whose rotation says
    // otherwise.
    name: pack.template.variant,
    summary: pack.summary,
    standing: pack.standing,
    documentRef: pack.documentRef,
  };
}

/** Every declared variant, across all templates. */
export const MACHINE_VARIANTS: readonly MachineVariant[] = KNOWLEDGE_PACKS.map(asVariant);

/**
 * The variants a template offers.
 *
 * Empty for every template with no knowledge document, which is what the Add
 * Machine dialog reads to decide whether to show the dropdown at all.
 */
export function variantsForTemplate(template: MachineTemplate | null | undefined): MachineVariant[] {
  return packsForConsoleTemplate(template).map(asVariant);
}

/** Whether a template offers a variant choice. */
export function templateHasVariants(template: MachineTemplate | null | undefined): boolean {
  return packsForConsoleTemplate(template).length > 0;
}

/**
 * Look up a variant by id.
 *
 * Returns undefined for an unknown id rather than falling back to the first
 * variant of anything. A machine created against a variant that has since been
 * removed is a real situation, and answering it with a different variant's
 * identity would be worse than answering it with nothing.
 */
export function variantById(variantId: string | null | undefined): MachineVariant | undefined {
  const pack = knowledgeForTemplateId(variantId);
  return pack ? asVariant(pack) : undefined;
}

/** The variant a machine is running, if one is declared and still resolves. */
export function variantForMachine(machine: {
  template: MachineTemplate;
  variantId?: string | null;
}): MachineVariant | undefined {
  const resolution = knowledgeForMachine(machine);
  return resolution.kind === 'resolved' ? asVariant(resolution.knowledge) : undefined;
}

/**
 * Whether a machine still needs someone to declare its variant.
 *
 * True for a machine whose template offers a choice that has not been made, and
 * also for one holding an id that no longer resolves — both leave the machine
 * without knowledge, and both are fixed by declaring a variant.
 */
export function variantIsUndeclared(machine: {
  template: MachineTemplate;
  variantId?: string | null;
}): boolean {
  const resolution = knowledgeForMachine(machine);
  return resolution.kind === 'variant-undeclared' || resolution.kind === 'variant-unknown';
}

/**
 * Normalise a variant id on the way into storage.
 *
 * Anything that is not a declared variant of the given template is stored as
 * null. A stored id that no longer resolves would read later as a declared
 * variant while behaving like an undeclared one, and null is the honest version
 * of that state.
 */
export function normaliseVariantId(
  template: MachineTemplate | null | undefined,
  variantId: unknown,
): string | null {
  if (typeof variantId !== 'string' || !template) return null;
  const pack = knowledgeForTemplateId(variantId);
  return pack && pack.consoleTemplate === template ? pack.template.templateId : null;
}

/** A compact label for headers and tables. Null when the template has no variants. */
export function variantShortLabel(machine: { template: MachineTemplate; variantId?: string | null }): string | null {
  const variant = variantForMachine(machine);
  if (variant) return variant.variantId;
  return variantIsUndeclared(machine) ? 'VARIANT NOT DECLARED' : null;
}
