/**
 * A machine's knowledge pack, and how one is chosen.
 *
 * DOC-01 §21 lists `variant` among the minimum fields of `MachineTemplate`, and
 * `template_id` encodes it — TSE-7Z-CR-INT-PAR-COMP is 7-Zone, Co-Rotating,
 * INTermeshing, PARallel, COMPounding. §2's classification chain narrows down
 * to exactly that point, and §20 speaks of knowledge reusable across "co-rotating
 * TSE templates", plural. Taken together the document is unambiguous: one
 * template is one variant, and the variant *is* the knowledge identity.
 *
 * So resolution runs in one direction only:
 *
 *     machine.variantId  ->  template_id  ->  MachineKnowledge
 *
 * and never from the console's own template name. The console's
 * `MachineTemplate` ('Twin Screw Extruder') is a coarser thing: it selects the
 * 3D asset, the point registry, the icon and the default layout — all of which
 * a counter-rotating machine would share — and it is deliberately not allowed
 * to select the process knowledge, which a counter-rotating machine would not
 * share at all. Its zone map, its cause-effect priors and its measurement
 * locations are different, and handing it this pack would be a confident wrong
 * answer of exactly the kind DOC-01 is written to prevent.
 *
 * An undeclared variant therefore resolves to *no knowledge*, not to the first
 * pack registered under the template. That is the same rule §7 applies to zone
 * function: a reference is something a person confirms, never a default the
 * software supplies on their behalf.
 */

import type { MachineTemplate } from '../machines';
import type {
  AssetNode,
  ComponentDefinition,
  ConfigurationVersion,
  EngineeringFact,
  MachineTemplateDefinition,
  MeasurementLocation,
  ParameterDefinition,
  ProcessLocation,
  ReferenceZoneEntry,
  RelationshipDefinition,
  ZoneDefinition,
} from './tse/types';

/** How firmly a template identity is established (DOC-01 §2 "Reference Variant"). */
export type VariantStanding = 'REFERENCE' | 'SITE_VALIDATED';

/**
 * Everything DOC-01 §21 says a machine template carries, as one swappable unit.
 *
 * Bundled rather than exported loose so that adding a second variant is adding
 * a second pack, not threading a variant id through every accessor in the
 * knowledge module. A pack is self-contained: nothing inside it refers to
 * another pack's zones, relationships or facts.
 */
export type MachineKnowledge = {
  /** The DOC-01 machine-template object. Its `templateId` keys the registry. */
  template: MachineTemplateDefinition;
  /** Which console template renders this machine. Not what selects the pack. */
  consoleTemplate: MachineTemplate;
  standing: VariantStanding;
  documentRef: string;
  /** One line on what the variant is for, for a dropdown's second row. */
  summary: string;

  assetTree: readonly AssetNode[];
  /** Zone positions for the installed machine, with functions undeclared. */
  zones: () => ZoneDefinition[];
  /** The reference zone map. Candidates for a person to confirm, never applied. */
  referenceZoneMap: readonly ReferenceZoneEntry[];
  processFlow: readonly ProcessLocation[];
  components: readonly ComponentDefinition[];
  parameters: readonly ParameterDefinition[];
  relationships: readonly RelationshipDefinition[];
  measurementLocations: readonly MeasurementLocation[];
  /** The DOC-01 §16 facts this machine needs, all undeclared until a site supplies them. */
  requiredFacts: readonly EngineeringFact[];
  referenceConfiguration: ConfigurationVersion;
};

/**
 * Why a machine has no knowledge pack, when it has none.
 *
 * Four distinct answers, because they need four different actions. Collapsing
 * them into a null would leave the console unable to say whether someone has to
 * pick a variant, fix a stale record, or wait for a pack to be written.
 */
export type KnowledgeResolution =
  /**
   * Knowledge applies.
   *
   * `defaulted` says how it was chosen. False means a person picked this
   * variant. True means the template offers exactly one, nobody picked it, and
   * the single option was applied so the machine is usable — a convenience, not
   * a confirmation. A commissioning view should still ask someone to confirm
   * it, and the flag is what lets it tell the two apart.
   */
  | { kind: 'resolved'; knowledge: MachineKnowledge; defaulted: boolean }
  /** The template offers variants and this machine has not been given one. */
  | { kind: 'variant-undeclared'; consoleTemplate: MachineTemplate; available: MachineKnowledge[] }
  /** A variant id is stored that no pack claims, or that belongs to another template. */
  | { kind: 'variant-unknown'; variantId: string }
  /** This console template has no DOC-01 knowledge written for it at all. */
  | { kind: 'no-knowledge-for-template'; consoleTemplate: MachineTemplate };

/** Whether a resolution carries usable knowledge. */
export function isResolved(
  resolution: KnowledgeResolution,
): resolution is Extract<KnowledgeResolution, { kind: 'resolved' }> {
  return resolution.kind === 'resolved';
}

/** A sentence a console can show for a resolution that produced nothing. */
export function unresolvedReason(resolution: KnowledgeResolution): string | null {
  switch (resolution.kind) {
    case 'resolved':
      return null;
    case 'variant-undeclared':
      return `This machine has no variant declared, so no process knowledge applies to it. A ${resolution.consoleTemplate} can be built in arrangements whose melting, mixing and pressure behaviour differ, and the knowledge for one is not valid for another. Declare the variant to attach it.`;
    case 'variant-unknown':
      return `This machine is recorded as variant "${resolution.variantId}", which no longer matches any declared machine template. Nothing is assumed in its place. Re-declare the variant against a current template.`;
    case 'no-knowledge-for-template':
      return `No machine-knowledge document has been written for the ${resolution.consoleTemplate} template yet, so there is no process knowledge to apply.`;
  }
}
