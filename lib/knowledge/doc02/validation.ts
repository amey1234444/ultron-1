/**
 * The DOC-02 §37 deployment and validation checklist.
 *
 * Fifteen acceptance requirements, run against what the deployment has actually
 * declared rather than against anyone's memory. Most of them fail today, which
 * is the correct result for a machine that has not been commissioned, and each
 * failure names what would satisfy it.
 *
 * Built the same way as DOC-01's §23 checklist so the two read alike in a
 * commissioning view, and so a site can see one list of outstanding work rather
 * than two documents' worth.
 */

import { DOC02_SIGNAL_MASTER, coverageAgainst } from './signals';
import { hysteresisProblems } from './limits';
import { incompleteMappingFields, isTrustworthy, type SourceMapping } from './sourceMapping';
import { describeRetentionGap, type HistorianRecord } from './historian';
import { missingMandatoryContext, type ContextInput } from './context';
import type { HysteresisConfig, OperatingStateRecord, SignalDefinition } from './types';

export type CheckStatus = 'PASS' | 'FAIL' | 'NOT_APPLICABLE';

export type Doc02CheckResult = {
  checkId: string;
  validationArea: string;
  acceptanceRequirement: string;
  status: CheckStatus;
  detail: string;
};

export type Doc02ValidationInput = {
  /** Machine identity, from the DOC-01 layer. */
  machineId?: string | null;
  variantId?: string | null;
  configurationDeclared?: boolean;
  /** Answers "does this machine measure this signal". */
  hasSignal?: (signal: SignalDefinition) => boolean;
  mappings?: readonly SourceMapping[];
  hysteresis?: readonly HysteresisConfig[];
  state?: OperatingStateRecord | null;
  context?: ContextInput | null;
  historianSample?: Partial<HistorianRecord> | null;
  /** Whether a configuration and limit version process is in place. */
  versioningEnabled?: boolean;
};

export function runDoc02Validation(input: Doc02ValidationInput = {}): Doc02CheckResult[] {
  const results: Doc02CheckResult[] = [];
  const add = (
    checkId: string,
    validationArea: string,
    acceptanceRequirement: string,
    status: CheckStatus,
    detail: string,
  ) => results.push({ checkId, validationArea, acceptanceRequirement, status, detail });

  // 1 — Machine and configuration.
  const identityOk = Boolean(input.machineId) && Boolean(input.variantId) && input.configurationDeclared === true;
  add(
    'D2-01',
    'Machine & configuration',
    'Machine ID, variant, screw configuration ID and die/screen/vent/side-feed configuration validated.',
    identityOk ? 'PASS' : 'FAIL',
    identityOk
      ? 'Machine identity, variant and configuration are declared.'
      : `Missing: ${[
          !input.machineId && 'machine ID',
          !input.variantId && 'variant',
          input.configurationDeclared !== true && 'screw / die / screen / vent configuration',
        ]
          .filter(Boolean)
          .join(', ')}. Without the variant no process knowledge resolves at all.`,
  );

  // 2 — Operating states.
  const stateOk = input.state != null && input.state.operatingState !== 'ST-00';
  add(
    'D2-02',
    'Operating states',
    'Explicit PLC states identified where available; inference rules validated on real transitions.',
    stateOk ? 'PASS' : 'FAIL',
    stateOk
      ? `State engine returns ${input.state?.operatingState} at confidence ${input.state?.stateConfidence}.`
      : input.state?.unknownReason ??
        'The state engine has not been run, or returns UNKNOWN. No explicit PLC state bits and no configured thresholds are available.',
  );

  // 3 — Mandatory signals.
  const coverage = input.hasSignal ? coverageAgainst(input.hasSignal) : null;
  add(
    'D2-03',
    'Mandatory signals',
    'All mandatory signals mapped, or the gap recorded.',
    coverage === null ? 'FAIL' : coverage.missingMandatory.length === 0 ? 'PASS' : 'FAIL',
    coverage === null
      ? `The §15 master defines ${DOC02_SIGNAL_MASTER.length} signals but nothing has been compared against this machine yet.`
      : coverage.missingMandatory.length === 0
        ? `All ${coverage.covered.length} mandatory signals are mapped.`
        : `${coverage.missingMandatory.length} mandatory signals are unmapped (${Math.round(coverage.mandatoryCoverage * 100)}% covered), including ${coverage.missingMandatory
            .slice(0, 4)
            .map((entry) => `${entry.signalId} ${entry.parameter}`)
            .join(', ')}. Recording the gap is acceptable; assuming the value is not.`,
  );

  // 4 — Source priority.
  const mappings = input.mappings ?? [];
  const withoutSource = mappings.filter((mapping) => mapping.sourceKind === null);
  add(
    'D2-04',
    'Source priority',
    'Existing reliable plant data reused; duplicate sensors justified.',
    mappings.length > 0 && withoutSource.length === 0 ? 'PASS' : 'FAIL',
    mappings.length === 0
      ? 'No source mappings are declared, so the §17 reuse-first principle cannot be shown to have been applied.'
      : withoutSource.length === 0
        ? `All ${mappings.length} mappings declare which source tier they read from.`
        : `${withoutSource.length} mappings do not say which source tier they read from.`,
  );

  // 5 — Units and scaling.
  const badUnits = mappings.filter((mapping) => !mapping.sourceUnit || !mapping.canonicalUnit || !mapping.scalingReference);
  add(
    'D2-05',
    'Units / scaling',
    'Raw and engineering units verified against source and instrument.',
    mappings.length > 0 && badUnits.length === 0 ? 'PASS' : 'FAIL',
    mappings.length === 0
      ? 'No source mappings are declared, so no raw-to-engineering unit conversion has been verified against an instrument. A wrong scaling reads as a plausible process value, which is why §37 asks for this explicitly.'
      : badUnits.length === 0
        ? 'Every mapping declares its source unit, canonical unit and scaling reference.'
        : `${badUnits.length} mappings are missing a source unit, canonical unit or scaling reference.`,
  );

  // 6 — Locations.
  const locations = new Set(DOC02_SIGNAL_MASTER.map((entry) => entry.canonicalLocation));
  add(
    'D2-06',
    'Locations',
    'Pressure, temperature and vibration locations physically confirmed.',
    'FAIL',
    `The master resolves ${locations.size} canonical locations, but physical confirmation is a site activity and none is recorded. A pressure without a confirmed tap location is not interpretable.`,
  );

  // 7 — Timestamps.
  const noTimestampPolicy = mappings.filter((mapping) => mapping.timestampSource === null);
  add(
    'D2-07',
    'Timestamps',
    'Clock, source and timestamp policy tested.',
    mappings.length > 0 && noTimestampPolicy.length === 0 ? 'PASS' : 'FAIL',
    mappings.length === 0
      ? 'No source mappings are declared, so no timestamp policy has been set. Whether a value is stamped at the PLC, the gateway or the backend decides whether two signals can be correlated at all.'
      : noTimestampPolicy.length === 0
        ? 'Every mapping declares which clock its timestamp comes from.'
        : `${noTimestampPolicy.length} mappings do not declare a timestamp source.`,
  );

  // 8 — Quality.
  add(
    'D2-08',
    'Quality',
    'Timeout, bad-quality, open/short, spike and stale behaviour tested.',
    'FAIL',
    'The §22 engine implements all ten checks, but each needs per-signal configuration — freshness interval, instrument range, flatline window, rate-of-change bound — and none is declared. An unconfigured check reports nothing rather than guessing a bound.',
  );

  // 9 — Recipe and context.
  const contextMissing = input.context ? missingMandatoryContext(input.context) : null;
  add(
    'D2-09',
    'Recipe / context',
    'Recipe, material, RPM, feed and configuration keys available and correct.',
    contextMissing !== null && contextMissing.length === 0 ? 'PASS' : 'FAIL',
    contextMissing === null
      ? 'No context has been built for this machine.'
      : contextMissing.length === 0
        ? 'All seven mandatory context dimensions are available.'
        : `Mandatory context dimensions missing: ${contextMissing.join(', ')}. DOC-03 cannot select a baseline without them.`,
  );

  // 10 — Limits. Deferred to the DOC-01 authority registry, which owns them.
  add(
    'D2-10',
    'Limits',
    'Customer, OEM and engineering Alert/Danger/Trip values captured with authority and provenance.',
    'FAIL',
    'The authority registry exists and enforces provenance, but every required engineering fact ships undeclared. See the DOC-01 §16 register.',
  );

  // 11 — Persistence and hysteresis.
  const hysteresis = input.hysteresis ?? [];
  const hysteresisIssues = hysteresis.flatMap((config) => hysteresisProblems(config, 'HIGH'));
  add(
    'D2-11',
    'Persistence / hysteresis',
    'Configured only where approved; illustrative examples not used as plant values.',
    hysteresis.length === 0 ? 'NOT_APPLICABLE' : hysteresisIssues.length === 0 ? 'PASS' : 'FAIL',
    hysteresis.length === 0
      ? 'No persistence or hysteresis is configured, which is the correct state until a limit is approved. The document’s illustrative values are deliberately absent from the code.'
      : hysteresisIssues.length === 0
        ? `All ${hysteresis.length} hysteresis configurations are complete and approved.`
        : hysteresisIssues.join(' '),
  );

  // 12 — Canonical tags.
  const taggedSignals = DOC02_SIGNAL_MASTER.filter((entry) => entry.canonicalTag.length > 0).length;
  add(
    'D2-12',
    'Canonical tags',
    'Stable ULTRON tags assigned and source lineage preserved.',
    taggedSignals === DOC02_SIGNAL_MASTER.length ? 'PASS' : 'FAIL',
    `${taggedSignals} of ${DOC02_SIGNAL_MASTER.length} master signals carry a composed §29 canonical tag. Lineage back to a source tag requires the mappings in D2-04.`,
  );

  // 13 — Historian.
  const retentionGaps = input.historianSample ? describeRetentionGap(input.historianSample) : null;
  add(
    'D2-13',
    'Historian',
    'Raw, validated, state, context and configuration fields stored.',
    retentionGaps !== null && retentionGaps.length === 0 ? 'PASS' : 'FAIL',
    retentionGaps === null
      ? 'The §33 layer model is declared but no historian record has been produced against it.'
      : retentionGaps.length === 0
        ? 'A stored observation carries identity, quality, state, context and configuration.'
        : retentionGaps.join(' '),
  );

  // 14 — Versioning.
  add(
    'D2-14',
    'Versioning',
    'Configuration and limit version process enabled.',
    input.versioningEnabled === true ? 'PASS' : 'FAIL',
    input.versioningEnabled === true
      ? 'Configuration and limit versioning is in place, and closed versions are immutable.'
      : 'No versioning process is recorded. §35 requires that historical data retains the configuration and limit version active at the time.',
  );

  // 15 — Handover.
  const blockers = results.filter((result) => result.status === 'FAIL').length;
  add(
    'D2-15',
    'Handover',
    'DOC-03 receives validated data, quality, state, context and approved constraints.',
    blockers === 0 ? 'PASS' : 'FAIL',
    blockers === 0
      ? 'DOC-03 can be handed validated data with state, context and constraints.'
      : `${blockers} earlier checks are outstanding. The DOC-02 engines are implemented and can run, but they are running on a machine whose signals, limits and thresholds have not been declared, so what reaches DOC-03 would be mostly UNKNOWN.`,
  );

  return results;
}

/** A one-line summary of where DOC-02 commissioning stands. */
export function doc02Summary(input: Doc02ValidationInput = {}): {
  passed: number;
  failed: number;
  notApplicable: number;
  total: number;
} {
  const results = runDoc02Validation(input);
  return {
    passed: results.filter((result) => result.status === 'PASS').length,
    failed: results.filter((result) => result.status === 'FAIL').length,
    notApplicable: results.filter((result) => result.status === 'NOT_APPLICABLE').length,
    total: results.length,
  };
}

/** Mapping problems across a deployment, for the source-mapping view. */
export function mappingProblems(mappings: readonly SourceMapping[]): { canonicalTag: string; problems: string[] }[] {
  return mappings
    .map((mapping) => {
      const problems = incompleteMappingFields(mapping).map((field) => `${field} is not declared`);
      if (!isTrustworthy(mapping)) {
        problems.push(
          `validation status is ${mapping.validationStatus}; analytics may only consume a mapping that is site tested or approved`,
        );
      }
      return { canonicalTag: mapping.canonicalTag, problems };
    })
    .filter((entry) => entry.problems.length > 0);
}
