/**
 * BLACKGATE DOC-02 — operations, sensors and data requirements, as code.
 *
 * DOC-02 §36 names eight software modules. All eight are declared here:
 *
 *   Signal Registry          signals.ts        (§15, §16, §17, §19, §20, §21, §29)
 *   Source / Tag Mapping     sourceMapping.ts  (§30, §31)
 *   Data Quality Engine      dataQuality.ts    (§22)
 *   Operating State Engine   operatingState.ts (§4–§14)
 *   Context Engine           context.ts        (§26, §27, §28)
 *   Limit & Authority        limits.ts         (§23, §24, §25)
 *   Configuration Manager    sourceMapping.ts  (§35)
 *   Historian Schema         historian.ts      (§33, §34)
 *
 * The scope boundary of §1.2 holds throughout: DOC-02 identifies state,
 * context, source, metadata and data quality, and stores customer and OEM
 * limits. It does not calculate normal. No file here computes a baseline, a
 * feature or a deviation — those are DOC-03 — and none decides whether a
 * reading is bad *for the machine*, only whether the reading itself can be
 * trusted.
 *
 * Nothing invents a number either. Every threshold the engines compare against
 * arrives as configuration, and an engine with none says which one it is
 * missing rather than defaulting. That is the same discipline the DOC-01 layer
 * applies to engineering facts, for the same reason.
 */

export * from './types';
export * from './signals';
export * from './dataQuality';
export * from './operatingState';
export * from './context';
export * from './sourceMapping';
export * from './historian';
export * from './limits';
export * from './validation';

/** The document this module implements. */
export const DOC02_DOCUMENT_REF = 'BLACKGATE-TSE-DOC-02 v1.0';

/** DOC-02 §36, the modules and what each is responsible for. */
export const DOC02_MODULES: readonly { module: string; responsibilities: string; primaryOutputs: string }[] = [
  {
    module: 'Signal Registry',
    responsibilities: 'Canonical IDs, units, source priority, location, priority and classification.',
    primaryOutputs: 'Signal metadata.',
  },
  {
    module: 'Source / Tag Mapping',
    responsibilities: 'PLC, DCS, controller and BLACKGATE channels onto canonical tags.',
    primaryOutputs: 'Validated mapping.',
  },
  {
    module: 'Data Quality Engine',
    responsibilities: 'Freshness, timestamps, range, sensor diagnostics and plausibility.',
    primaryOutputs: 'GOOD / UNCERTAIN / BAD / MISSING, with a reason.',
  },
  {
    module: 'Operating State Engine',
    responsibilities: 'State inference, override and transition logic.',
    primaryOutputs: 'State, confidence and timing.',
  },
  {
    module: 'Context Engine',
    responsibilities: 'Recipe, RPM, feed, configuration and state, plus optional keys.',
    primaryOutputs: 'Context object and id, with confidence.',
  },
  {
    module: 'Limit & Authority Registry',
    responsibilities: 'Ratings, Alert, Danger, Trip, SOP authority and versioning.',
    primaryOutputs: 'Active approved values with provenance.',
  },
  {
    module: 'Configuration Manager',
    responsibilities: 'Machine, sensor, tag and version control.',
    primaryOutputs: 'Configuration version.',
  },
  {
    module: 'Historian Schema',
    responsibilities: 'Raw plus validated plus context plus provenance storage.',
    primaryOutputs: 'ML and analytics ready history.',
  },
] as const;

/** DOC-02 §38, what DOC-03 receives from this layer. */
export const DOC03_HANDOVER: readonly string[] = [
  'Validated signal values with their quality verdict and reason',
  'Operating state with confidence, timing and evidence',
  'Context object with confidence and named gaps',
  'Approved limits with authority and provenance',
  'Configuration version active at the time of the observation',
  'Lineage back to the source tag',
] as const;
