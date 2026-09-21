/**
 * The TSE machine template and its configuration lineage (DOC-01 §21.1, §8.1).
 *
 * `TSE_TEMPLATE` is the minimum machine-template object DOC-01 §21.1 specifies,
 * transcribed field for field. The one value it does *not* carry is
 * `screwConfigurationVersion`: DOC-01 writes that as "<validated site/OEM
 * value>", so it stays null here and is filled by commissioning. A template
 * that shipped with a made-up configuration id would let baselines attach
 * themselves to a geometry nobody has confirmed.
 */

import type {
  ConfigurationVersion,
  MachineTemplateDefinition,
  ScrewEngagement,
  ScrewRotation,
  ShaftGeometry,
} from './types';
import { AUTHORITY_PRECEDENCE } from './types';

export const TSE_DOCUMENT_REF = 'BLACKGATE-TSE-DOC-01 v1.0';

const ROTATION_LABEL: Record<ScrewRotation, string> = {
  CO_ROTATING: 'Co-Rotating',
  COUNTER_ROTATING: 'Counter-Rotating',
};

const ENGAGEMENT_LABEL: Record<ScrewEngagement, string> = {
  FULLY_INTERMESHING: 'Fully Intermeshing',
  PARTIALLY_INTERMESHING: 'Partially Intermeshing',
  NON_INTERMESHING: 'Non-Intermeshing',
};

const GEOMETRY_LABEL: Record<ShaftGeometry, string> = {
  PARALLEL: 'Parallel',
  CONICAL: 'Conical',
};

/** Title-case an application enum: COMPOUNDING -> Compounding. */
function applicationLabel(application: string): string {
  return application
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Compose the §21 `variant` field from the template's own attributes.
 *
 * DOC-01's cover states the reference variant as a single line —
 * "Co-Rotating • Fully Intermeshing • Parallel • 7-Zone Reference •
 * Compounding" — and §21.1 states the same thing as separate fields. Deriving
 * the line from the fields rather than storing both means the two cannot
 * disagree: change `rotation` to COUNTER_ROTATING and the descriptor follows,
 * instead of leaving a label that still claims co-rotating.
 */
export function composeVariantDescriptor(
  template: Pick<MachineTemplateDefinition, 'rotation' | 'engagement' | 'geometry' | 'referenceZones' | 'application'>,
): string {
  return [
    ROTATION_LABEL[template.rotation],
    ENGAGEMENT_LABEL[template.engagement],
    GEOMETRY_LABEL[template.geometry],
    `${template.referenceZones}-Zone Reference`,
    applicationLabel(template.application),
  ].join(' • ');
}

const TSE_ATTRIBUTES = {
  rotation: 'CO_ROTATING',
  engagement: 'FULLY_INTERMESHING',
  geometry: 'PARALLEL',
  referenceZones: 7,
  application: 'COMPOUNDING',
} as const;

/** DOC-01 §21.1, verbatim, with the §21 `variant` field composed from it. */
export const TSE_TEMPLATE: MachineTemplateDefinition = {
  templateId: 'TSE-7Z-CR-INT-PAR-COMP',
  family: 'EXTRUDER',
  type: 'TWIN_SCREW',
  variant: composeVariantDescriptor(TSE_ATTRIBUTES),
  rotation: 'CO_ROTATING',
  engagement: 'FULLY_INTERMESHING',
  geometry: 'PARALLEL',
  referenceZones: 7,
  application: 'COMPOUNDING',
  zoneFunctionSource: 'MACHINE_CONFIGURATION',
  screwConfigurationVersion: null,
  authorityModel: AUTHORITY_PRECEDENCE,
  consoleTemplate: 'Twin Screw Extruder',
  documentRef: `${TSE_DOCUMENT_REF} §21.1`,
};

/**
 * The classification chain of DOC-01 §2, kept as data.
 *
 * Read top to bottom it is the machine's identity: an extrusion machine, of the
 * twin-screw kind, with parallel shafts, fully intermeshing, co-rotating, with
 * a seven-zone reference process section, applied to compounding. Each term
 * carries the engineering meaning DOC-01 gives it, so a UI or an LLM can
 * explain the variant without the prose document.
 */
export const TSE_CLASSIFICATION: readonly {
  term: string;
  engineeringMeaning: string;
  knowledgeClass: 'TSE_SPECIFIC' | 'MACHINE_SPECIFIC';
}[] = [
  {
    term: 'Twin-screw extruder',
    engineeringMeaning:
      'Two screws operate in a common barrel or process section to convey, melt, mix, devolatilise and pressurise material depending on the screw and barrel configuration.',
    knowledgeClass: 'TSE_SPECIFIC',
  },
  {
    term: 'Co-rotating',
    engineeringMeaning:
      'Both screws rotate in the same rotational direction. Widely used for continuous polymer compounding and mixing.',
    knowledgeClass: 'TSE_SPECIFIC',
  },
  {
    term: 'Fully intermeshing',
    engineeringMeaning:
      'The screw profiles overlap; self-wiping geometry reduces stagnant material and supports efficient material renewal.',
    knowledgeClass: 'TSE_SPECIFIC',
  },
  {
    term: 'Parallel',
    engineeringMeaning: 'The screw centrelines remain parallel along the process length.',
    knowledgeClass: 'TSE_SPECIFIC',
  },
  {
    term: 'Segmented / modular',
    engineeringMeaning:
      'Screw elements and barrel modules are arranged as building blocks to perform different unit operations.',
    knowledgeClass: 'TSE_SPECIFIC',
  },
  {
    term: '7-zone reference',
    engineeringMeaning:
      'Seven controlled barrel zones are the reference BLACKGATE template. The actual functional role of each zone is configuration-specific.',
    knowledgeClass: 'MACHINE_SPECIFIC',
  },
  {
    term: 'Compounding',
    engineeringMeaning:
      'The reference application combines a polymer matrix with fillers, additives, pigments or modifiers to produce a controlled homogeneous compound.',
    knowledgeClass: 'TSE_SPECIFIC',
  },
] as const;

/**
 * The configuration-version record for the reference machine.
 *
 * Every field is null or empty on purpose. DOC-01 §8.1 lists exactly these as
 * metadata BLACKGATE *needs*, and §22 lists them as items to collect from the OEM
 * — not as things the template may assume. What this record therefore does
 * today is state the shape of the gap, which `validation.ts` turns into a
 * commissioning checklist.
 *
 * `invalidatesBaselinesBefore` is true because DOC-01 §13 and §19 both say a
 * screw-configuration change invalidates prior baselines. The flag is set at
 * declaration time so the consequence cannot be forgotten when a later version
 * is added.
 */
export const TSE_REFERENCE_CONFIGURATION: ConfigurationVersion = {
  versionId: 'TSE-CONFIG-UNDECLARED',
  effectiveDate: null,
  changeReason: 'Reference template instantiation; no site configuration has been validated yet.',
  approvedBy: null,
  screwConfigurationRef: null,
  screwDiameterMm: null,
  lengthToDiameterRatio: null,
  feedLocations: [],
  sideFeedLocations: [],
  liquidInjectionLocations: [],
  ventLocations: [],
  screenConfiguration: null,
  dieConfiguration: null,
  invalidatesBaselinesBefore: true,
  knowledgeClass: 'MACHINE_SPECIFIC',
};

/** The screw-configuration metadata DOC-01 §8.1 requires, and why. */
export const SCREW_CONFIGURATION_METADATA: readonly { field: keyof ConfigurationVersion; whyNeeded: string }[] = [
  {
    field: 'versionId',
    whyNeeded: 'Allows baselines and fault patterns to be tied to the actual process geometry.',
  },
  {
    field: 'screwDiameterMm',
    whyNeeded: 'Important machine descriptor; performance is not inferred from it alone.',
  },
  {
    field: 'lengthToDiameterRatio',
    whyNeeded: 'Important machine descriptor; performance is not inferred from it alone.',
  },
  {
    field: 'screwConfigurationRef',
    whyNeeded:
      'Element sequence or OEM drawing reference. Provides the physical basis for zone function and for expected pressure and fill behaviour.',
  },
  {
    field: 'feedLocations',
    whyNeeded: 'Defines where material enters the process.',
  },
  {
    field: 'sideFeedLocations',
    whyNeeded: 'Defines where composition changes downstream of the main feed.',
  },
  {
    field: 'liquidInjectionLocations',
    whyNeeded: 'Defines where liquid additions change composition.',
  },
  {
    field: 'ventLocations',
    whyNeeded: 'Defines where low-pressure and devolatilisation behaviour is expected.',
  },
  {
    field: 'screenConfiguration',
    whyNeeded: 'Strongly affects downstream pressure and restriction diagnostics.',
  },
  {
    field: 'dieConfiguration',
    whyNeeded: 'Strongly affects downstream pressure and restriction diagnostics.',
  },
] as const;

/** Whether a configuration version carries everything DOC-01 §8.1 asks for. */
export function configurationIsDeclared(version: ConfigurationVersion): boolean {
  return SCREW_CONFIGURATION_METADATA.every(({ field }) => {
    const value = version[field];
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== '' && value !== 'TSE-CONFIG-UNDECLARED';
  });
}

/** The §8.1 fields still missing from a configuration version. */
export function undeclaredConfigurationFields(version: ConfigurationVersion): string[] {
  return SCREW_CONFIGURATION_METADATA.filter(({ field }) => {
    const value = version[field];
    if (Array.isArray(value)) return value.length === 0;
    return value === null || value === '' || value === 'TSE-CONFIG-UNDECLARED';
  }).map(({ field }) => String(field));
}
