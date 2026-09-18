/**
 * The TSE machine-knowledge layer — DOC-01 as code.
 *
 * `ULTRON-TSE-DOC-01` §21 says its knowledge "maps to explicit entities and
 * relationships in the ULTRON software model" and names ten of them. All ten
 * are declared in this directory:
 *
 *   MachineTemplate         template.ts
 *   AssetNode               assets.ts
 *   ProcessLocation         processFlow.ts
 *   ZoneDefinition          zones.ts
 *   ComponentDefinition     components.ts
 *   ParameterDefinition     parameters.ts
 *   RelationshipDefinition  relationships.ts
 *   MeasurementLocation     measurementLocations.ts
 *   EngineeringFact         engineeringFacts.ts
 *   ConfigurationVersion    template.ts
 *
 * What this layer is not, per DOC-01 §1.2: it calculates no statistical
 * baselines, defines no anomaly thresholds, implements no fault-detection
 * rules, and computes no severity or confidence. Those belong to DOC-03 through
 * DOC-06. It supplies the physical and process knowledge those engines depend
 * on, and it is deliberately empty of every number a site has not supplied.
 */

export * from './types';
export * from './template';
export * from './assets';
export * from './zones';
export * from './processFlow';
export * from './components';
export * from './parameters';
export * from './relationships';
export * from './measurementLocations';
export * from './engineeringFacts';
export * from './operatingStates';
export * from './validation';

/* 25 — Reference basis -------------------------------------------------------- */

/**
 * The public OEM and industry material DOC-01 §25 cites as its reference basis.
 *
 * Kept in code so a generated explanation can cite where a piece of generic TSE
 * knowledge came from. DOC-01 attaches a caveat to R5 that travels with it
 * here: the Thermo Scientific unit is cited only as a real example of a
 * parallel, fully segmented co-rotating TSE with seven barrel zones, and its
 * numerical specifications are not universal limits.
 */
export const TSE_REFERENCE_SOURCES: readonly {
  ref: string;
  source: string;
  knowledgeUsed: string;
  url: string;
}[] = [
  {
    ref: 'R1',
    source:
      'Coperion — "Co-Rotating Fully Intermeshing Twin-Screw Compounding: Advancements for Improved Performance and Productivity."',
    knowledgeUsed:
      'Fully intermeshing co-rotating architecture, self-wiping behaviour, compounding role, torque/RPM/process-energy context.',
    url: 'https://www.coperion.com/media/2745/2013_twin-screw-compounding_spe-01-2013_en.pdf',
  },
  {
    ref: 'R2',
    source: 'Leistritz — "Quick overview of commercially available twin screw extruders (TSEs)."',
    knowledgeUsed:
      'Co-rotating intermeshing TSE prevalence, modular barrels and screws, kneading elements, independent feed rate and screw RPM, vents and downstream feeding.',
    url: 'https://extruders.leistritz.com/en-us/extrusion/newsletter/2020-03/quick-overview-of-tses.pdf',
  },
  {
    ref: 'R3',
    source: 'Leistritz — Extrusion Technology brochure.',
    knowledgeUsed:
      'Modular barrel and screw system, feeders, vents, side stuffers, conveying/distributive/dispersive elements.',
    url: 'https://extruders.leistritz.com/en-us/extrusion/downloads/Leistritz-Extrusion-brochure-2024.pdf',
  },
  {
    ref: 'R4',
    source: 'Japan Steel Works — CMP series.',
    knowledgeUsed:
      'Fully intermeshed co-rotating screws and building-block cylinder/screw process-zone configuration for compounding and devolatilisation.',
    url: 'https://www.jsw.co.jp/en/product/business/plastics_machinery/pm_0100/',
  },
  {
    ref: 'R5',
    source: 'Thermo Scientific — Process 11 Parallel Twin-Screw Extruder.',
    knowledgeUsed:
      'Cited only as a real OEM example of a parallel, fully segmented co-rotating TSE with seven barrel zones. Its numerical specifications are not universal limits.',
    url: 'https://www.thermofisher.com/order/catalog/product/567-7600',
  },
] as const;

/* 26 — Terminology ------------------------------------------------------------ */

/** DOC-01 §26, so a UI or an LLM can define a term the same way the document does. */
export const TSE_TERMINOLOGY: Readonly<Record<string, string>> = {
  Baseline:
    'Expected healthy behaviour under a defined operating context. Defined mathematically in DOC-03, not here.',
  Context:
    'The operating conditions needed to interpret a value correctly — state, recipe, RPM, feed, configuration.',
  'Fully intermeshing': 'Screw geometry where the two screw profiles intermesh. Actual geometry is OEM-specific.',
  'Co-rotating': 'Both screw shafts rotate in the same direction.',
  'Starve-fed':
    'Feed rate is metered below, and independently of, the screw’s full volumetric intake capacity. Common in co-rotating compounding TSE operation.',
  'Specific energy': 'Energy normalised by throughput. The exact formula is defined in DOC-03.',
  'Zone function': 'The physical or process role of a barrel section. Not determined by zone number alone.',
  'Configuration version':
    'A traceable identifier for a physical or process configuration whose change may invalidate prior baselines.',
  Authority:
    'The source priority that determines whether a value is safety, customer, OEM, engineering or ULTRON-calculated.',
};

/* Handover to DOC-02 — §24 ---------------------------------------------------- */

/** What DOC-02 builds from each DOC-01 output (§24). */
export const DOC02_HANDOVER: readonly { doc01Output: string; doc02Builds: string }[] = [
  { doc01Output: 'Asset hierarchy', doc02Builds: 'Sensor and data-point locations, and canonical naming.' },
  { doc01Output: 'Material and process flow', doc02Builds: 'Operating-state definitions and process sequencing.' },
  { doc01Output: 'Zone functions', doc02Builds: 'Zone-specific signal and context requirements.' },
  { doc01Output: 'Component observables', doc02Builds: 'Signal master: mandatory, recommended and supporting data.' },
  {
    doc01Output: 'Cause-effect relationships',
    doc02Builds: 'Context and relationship requirements for later analytics.',
  },
  {
    doc01Output: 'Engineering facts and authority model',
    doc02Builds: 'The ratings and limits registry, with source and priority.',
  },
  { doc01Output: 'Recipe and material influence', doc02Builds: 'Context-engine dimensions.' },
  { doc01Output: 'Configuration version', doc02Builds: 'Baseline and configuration lineage.' },
  {
    doc01Output: 'Measurement-location philosophy',
    doc02Builds: 'The PLC/DCS reuse versus ULTRON sensor decision.',
  },
] as const;
