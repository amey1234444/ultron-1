/**
 * The TSE reference variant assembled as one knowledge pack.
 *
 * Everything the rest of this directory declares, gathered behind the single
 * identity DOC-01 gives it: `TSE-7Z-CR-INT-PAR-COMP`. The module's loose
 * exports remain, because the checks and the validation layer read them
 * directly, but application code should reach this knowledge through
 * `knowledgeForMachine` so that it arrives having been selected by a declared
 * variant rather than by a template name.
 */

import type { MachineKnowledge } from '../machineKnowledge';
import { TSE_ASSET_TREE } from './assets';
import { TSE_COMPONENT_LIBRARY } from './components';
import { TSE_REQUIRED_FACTS } from './engineeringFacts';
import { TSE_MEASUREMENT_LOCATIONS } from './measurementLocations';
import { TSE_PARAMETERS } from './parameters';
import { TSE_PROCESS_FLOW } from './processFlow';
import { TSE_RELATIONSHIPS } from './relationships';
import { TSE_DOCUMENT_REF, TSE_REFERENCE_CONFIGURATION, TSE_TEMPLATE } from './template';
import { installedZoneDefinitions, REFERENCE_ZONE_MAP } from './zones';

export const TSE_KNOWLEDGE: MachineKnowledge = {
  template: TSE_TEMPLATE,
  consoleTemplate: 'Twin Screw Extruder',
  // DOC-01 §2 calls this the Reference Variant and spends the section insisting
  // a reference is a starting point rather than a description of any installed
  // machine. The standing travels with the pack so the console can say so.
  standing: 'REFERENCE',
  documentRef: `${TSE_DOCUMENT_REF} §2, §21.1`,
  summary: 'The DOC-01 reference variant for continuous polymer compounding.',

  assetTree: TSE_ASSET_TREE,
  zones: installedZoneDefinitions,
  referenceZoneMap: REFERENCE_ZONE_MAP,
  processFlow: TSE_PROCESS_FLOW,
  components: TSE_COMPONENT_LIBRARY,
  parameters: TSE_PARAMETERS,
  relationships: TSE_RELATIONSHIPS,
  measurementLocations: TSE_MEASUREMENT_LOCATIONS,
  requiredFacts: TSE_REQUIRED_FACTS,
  referenceConfiguration: TSE_REFERENCE_CONFIGURATION,
};
