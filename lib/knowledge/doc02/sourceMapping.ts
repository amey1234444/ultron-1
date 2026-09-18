/**
 * Source mapping, lineage and configuration versioning.
 *
 * DOC-02 §30 defines the record that binds a customer's tag to a canonical one,
 * §31 defines the lineage that record sits in, and §35 defines what has to be
 * versioned when any of it changes.
 *
 * The field that does the most work here is `validationStatus`. DOC-02 gives it
 * four values — Mapped, Bench Tested, Site Tested, Approved — and they are a
 * ladder, not a label: a mapping that has been typed in is not a mapping that
 * has been proven against the instrument. `isTrustworthy` reads that ladder so
 * analytics cannot quietly consume an unproven mapping, which is how a byte-order
 * mistake becomes a process diagnosis.
 */

import type { AcquisitionClass, QualityVerdict, SourceKind } from './types';

/** How far a mapping has been proven (DOC-02 §30). */
export type MappingValidationStatus = 'MAPPED' | 'BENCH_TESTED' | 'SITE_TESTED' | 'APPROVED';

export const MAPPING_VALIDATION_LADDER: readonly MappingValidationStatus[] = [
  'MAPPED',
  'BENCH_TESTED',
  'SITE_TESTED',
  'APPROVED',
] as const;

export const MAPPING_VALIDATION_MEANING: Record<MappingValidationStatus, string> = {
  MAPPED: 'The address has been entered. Nothing has been read back from the device.',
  BENCH_TESTED: 'Read back correctly off the device on a bench, so the address, data type and byte order are right.',
  SITE_TESTED: 'Read back correctly on the installed machine against the real instrument and its scaling.',
  APPROVED: 'Site tested and signed off. Fit to found analytics on.',
};

/** One row of the DOC-02 §30 mapping record. */
export type SourceMapping = {
  canonicalTag: string;
  /** The §15 signal this mapping supplies. */
  signalId: string;
  sourceSystem: string | null;
  protocol: string | null;
  /** Node id, register address or channel reference, customer-specific. */
  sourceTag: string | null;
  dataType: string | null;
  byteOrder: string | null;
  sourceUnit: string | null;
  canonicalUnit: string | null;
  /** Where the engineering scaling comes from. */
  scalingReference: string | null;
  pollClass: AcquisitionClass | null;
  /** Monitoring mappings are read-only unless a write path was separately engineered. */
  access: 'READ_ONLY' | 'READ_WRITE';
  /** How the source's own quality bits map onto ULTRON quality. */
  qualityMapping: Record<string, QualityVerdict> | null;
  /** Which clock the timestamp comes from. Defined per project. */
  timestampSource: 'SOURCE' | 'GATEWAY' | 'BACKEND' | null;
  sourceKind: SourceKind | null;
  validationStatus: MappingValidationStatus;
};

/** An empty mapping for a signal, with everything still to be supplied. */
export function emptyMapping(signalId: string, canonicalTag: string): SourceMapping {
  return {
    canonicalTag,
    signalId,
    sourceSystem: null,
    protocol: null,
    sourceTag: null,
    dataType: null,
    byteOrder: null,
    sourceUnit: null,
    canonicalUnit: null,
    scalingReference: null,
    pollClass: null,
    access: 'READ_ONLY',
    qualityMapping: null,
    timestampSource: null,
    sourceKind: null,
    validationStatus: 'MAPPED',
  };
}

/** Fields a mapping still needs before it can be site tested. */
export function incompleteMappingFields(mapping: SourceMapping): string[] {
  const required: (keyof SourceMapping)[] = [
    'sourceSystem',
    'protocol',
    'sourceTag',
    'dataType',
    'sourceUnit',
    'canonicalUnit',
    'scalingReference',
    'pollClass',
    'timestampSource',
    'sourceKind',
  ];
  return required.filter((field) => mapping[field] === null || mapping[field] === '').map(String);
}

/**
 * Whether analytics may consume this mapping.
 *
 * Site tested or better. A bench-tested mapping proves the protocol decode but
 * not the instrument behind it, and a merely mapped one proves nothing at all.
 */
export function isTrustworthy(mapping: SourceMapping): boolean {
  return MAPPING_VALIDATION_LADDER.indexOf(mapping.validationStatus) >= MAPPING_VALIDATION_LADDER.indexOf('SITE_TESTED');
}

/* 31 — Lineage ------------------------------------------------------------------- */

/**
 * The DOC-02 §31 lineage chain.
 *
 * Kept as data so a UI can render the path a number travelled, and so the
 * TRACEABILITY REQUIREMENT is expressible rather than aspirational: "Every
 * important derived feature or diagnosis should be traceable back to source
 * tags, configuration version, formula/rule/model versions and the exact
 * context used."
 */
export const LINEAGE_CHAIN: readonly string[] = [
  'Physical variable / source',
  'Raw source tag / sensor channel',
  'Scaling / engineering unit',
  'Timestamp + source quality',
  'ULTRON data quality',
  'Canonical tag',
  'Operating state + context',
  'DOC-03 formula / feature',
  'DOC-04/05 diagnosis & decision',
] as const;

/** What a derived value must carry to satisfy §31. */
export type LineageRecord = {
  canonicalTag: string;
  sourceTags: string[];
  configurationVersion: string | null;
  /** Formula, rule or model version that produced the value, when derived. */
  producedByVersion: string | null;
  contextId: string | null;
  quality: QualityVerdict;
};

/** Whether a lineage record can actually be traced back. */
export function lineageIsComplete(record: LineageRecord): boolean {
  return (
    record.sourceTags.length > 0 &&
    record.configurationVersion !== null &&
    record.contextId !== null
  );
}

/* 35 — Configuration versioning -------------------------------------------------- */

export type VersionedChange = {
  change: string;
  consequence: string;
  /** Whether prior baselines survive this change. */
  invalidatesBaselines: boolean;
};

/** DOC-02 §35, what must be version-controlled and what each change costs. */
export const VERSIONED_CHANGES: readonly VersionedChange[] = [
  {
    change: 'Screw-element configuration changed',
    consequence: 'New machine configuration version; review or relearn contextual baselines.',
    invalidatesBaselines: true,
  },
  {
    change: 'Die or screen configuration changed',
    consequence: 'Version the downstream configuration; pressure baselines may change.',
    invalidatesBaselines: true,
  },
  {
    change: 'Pressure tap or sensor moved',
    consequence: 'New measurement-location configuration; old values are not directly comparable.',
    invalidatesBaselines: true,
  },
  {
    change: 'Sensor replaced or re-ranged',
    consequence: 'Update the instrument and scaling version, and revalidate.',
    invalidatesBaselines: true,
  },
  {
    change: 'VFD, motor or gearbox replaced',
    consequence: 'Review drive metadata and load relationships.',
    invalidatesBaselines: true,
  },
  {
    change: 'Recipe structure materially changed',
    consequence: 'New or updated recipe context.',
    invalidatesBaselines: true,
  },
  {
    change: 'Tag or protocol mapping changed',
    consequence: 'New mapping version; revalidate lineage.',
    invalidatesBaselines: false,
  },
  {
    change: 'Approved Alert or Danger changed',
    consequence: 'Preserve the previous authority record and create an approved new version.',
    invalidatesBaselines: false,
  },
] as const;

/**
 * DOC-02 §35's HISTORICAL INTEGRITY rule, as a guard.
 *
 * "Never overwrite the past as though an old configuration never existed.
 * Historical data must retain the configuration and limit version that was
 * active at the time." So a version record is closed by giving it an end, never
 * by editing or deleting it.
 */
export type ConfigurationVersionRecord = {
  versionId: string;
  effectiveFrom: string;
  /** Null while current. Set to close the record; the record itself never changes. */
  effectiveTo: string | null;
  changeReason: string;
  approvedBy: string | null;
  invalidatesBaselines: boolean;
};

export class HistoricalIntegrityError extends Error {}

/**
 * Close the current version and open a new one.
 *
 * Returns both records. The old one is returned with an end date rather than
 * mutated, and this function refuses to reopen a version that was already
 * closed, because a history that can be rewritten cannot be used to explain
 * what the machine was doing last month.
 */
export function supersedeVersion(
  current: ConfigurationVersionRecord | null,
  next: Omit<ConfigurationVersionRecord, 'effectiveTo'>,
): { closed: ConfigurationVersionRecord | null; opened: ConfigurationVersionRecord } {
  if (current && current.effectiveTo !== null) {
    throw new HistoricalIntegrityError(
      `Configuration version ${current.versionId} was already closed on ${current.effectiveTo}. A closed version is history and is never reopened or overwritten.`,
    );
  }
  if (current && Date.parse(next.effectiveFrom) < Date.parse(current.effectiveFrom)) {
    throw new HistoricalIntegrityError(
      `A new configuration version cannot start before the one it replaces (${next.effectiveFrom} precedes ${current.effectiveFrom}).`,
    );
  }
  return {
    closed: current ? { ...current, effectiveTo: next.effectiveFrom } : null,
    opened: { ...next, effectiveTo: null },
  };
}

/** The version that was active at a given moment. */
export function versionActiveAt(
  history: readonly ConfigurationVersionRecord[],
  atIso: string,
): ConfigurationVersionRecord | undefined {
  const at = Date.parse(atIso);
  return history.find((record) => {
    const from = Date.parse(record.effectiveFrom);
    const to = record.effectiveTo === null ? Number.POSITIVE_INFINITY : Date.parse(record.effectiveTo);
    return at >= from && at < to;
  });
}
