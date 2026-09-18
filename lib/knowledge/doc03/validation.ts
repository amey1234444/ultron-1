/**
 * The DOC-03 §47 deployment validation checklist.
 *
 * Run against what a deployment has actually declared. Built the same way as
 * the DOC-01 §23 and DOC-02 §37 checklists so a commissioning view can show one
 * list of outstanding work across all three documents.
 */

import { DOC03_FORMULAS, formulasByCategory, formulasWithoutGuardrail } from './formulas';
import { evaluateEligibility, type EligibilityInput } from './baseline';
import type { BaselineRecord, FeatureObject } from './types';

export type Doc03CheckResult = {
  checkId: string;
  area: string;
  requirement: string;
  status: 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
  detail: string;
};

export type Doc03ValidationInput = {
  baselines?: readonly BaselineRecord[];
  features?: readonly FeatureObject[];
  eligibility?: EligibilityInput | null;
  /** Whether analytics bands (deviation, anomaly) have been configured. */
  bandsConfigured?: boolean;
};

export function runDoc03Validation(input: Doc03ValidationInput = {}): Doc03CheckResult[] {
  const results: Doc03CheckResult[] = [];
  const add = (
    checkId: string,
    area: string,
    requirement: string,
    status: Doc03CheckResult['status'],
    detail: string,
  ) => results.push({ checkId, area, requirement, status, detail });

  // 1 — Formula library.
  const noGuardrail = formulasWithoutGuardrail();
  add(
    'D3-01',
    'Formula library',
    'Every formula carries its definition standard, including a guardrail.',
    noGuardrail.length === 0 ? 'PASS' : 'FAIL',
    noGuardrail.length === 0
      ? `All ${DOC03_FORMULAS.length} formulas (${formulasByCategory('COMMON').length} common, ${formulasByCategory('TSE_SPECIFIC').length} TSE-specific) carry a guardrail stating when the result is meaningless.`
      : `${noGuardrail.length} formulas have no guardrail, so nothing states when their arithmetic is valid but their answer is not.`,
  );

  // 2 — Baselines exist.
  const baselines = input.baselines ?? [];
  add(
    'D3-02',
    'Baselines',
    'A baseline exists for each feature that will be compared.',
    baselines.length > 0 ? 'PASS' : 'FAIL',
    baselines.length > 0
      ? `${baselines.length} baselines are declared.`
      : 'No baselines exist. Every comparison would fall through to the weakest fallback or produce no expected value at all.',
  );

  // 3 — Baseline maturity.
  const usable = baselines.filter((record) => record.status === 'VALID' || record.status === 'PROVISIONAL');
  add(
    'D3-03',
    'Baseline maturity',
    'Baselines reach VALID or PROVISIONAL before analytics rely on them.',
    baselines.length === 0 ? 'NOT_APPLICABLE' : usable.length > 0 ? 'PASS' : 'FAIL',
    baselines.length === 0
      ? 'No baselines to assess, so maturity cannot be judged yet.'
      : usable.length > 0
        ? `${usable.length} of ${baselines.length} baselines are usable.`
        : 'No baseline has reached PROVISIONAL, so nothing mature enough to compare against exists.',
  );

  // 4 — Eligibility gate.
  const eligibility = input.eligibility ? evaluateEligibility(input.eligibility) : null;
  add(
    'D3-04',
    'Eligibility gate',
    'Healthy-data selection is deterministic and auditable.',
    eligibility === null ? 'FAIL' : 'PASS',
    eligibility === null
      ? 'The §14 gate is implemented with all eight conditions, but no candidate window has been evaluated through it, so nothing is being learned.'
      : eligibility.eligible
        ? 'The current window is eligible for baseline learning.'
        : `Learning is correctly excluded: ${eligibility.exclusions[0]}`,
  );

  // 5 — Fallback traceability.
  const features = input.features ?? [];
  const untraced = features.filter((feature) => feature.baselineId !== null && feature.baselineLevel === null);
  add(
    'D3-05',
    'Fallback traceability',
    'Every comparison records which baseline level was used.',
    features.length === 0 ? 'FAIL' : untraced.length === 0 ? 'PASS' : 'FAIL',
    features.length === 0
      ? 'No features have been computed, so fallback traceability cannot be demonstrated on real output.'
      : untraced.length === 0
        ? 'Every feature records the baseline level behind its expected value.'
        : `${untraced.length} features cite a baseline without recording which fallback level it came from, so a weak fallback looks identical to exact-context history.`,
  );

  // 6 — Quality gate.
  const leaked = features.filter(
    (feature) =>
      (feature.dataQuality === 'BAD' || feature.dataQuality === 'MISSING') && feature.absoluteDeviation !== null,
  );
  add(
    'D3-06',
    'Quality gate',
    'BAD or MISSING inputs never become apparently valid features.',
    leaked.length === 0 ? 'PASS' : 'FAIL',
    leaked.length === 0
      ? 'No feature carries a deviation computed from untrustworthy input.'
      : `${leaked.length} features report a deviation despite BAD or MISSING input.`,
  );

  // 7 — Analytics bands.
  add(
    'D3-07',
    'Analytics bands',
    'Deviation and anomaly bands configured per feature.',
    input.bandsConfigured === true ? 'PASS' : 'FAIL',
    input.bandsConfigured === true
      ? 'Deviation and anomaly bands are configured.'
      : 'No deviation or anomaly bands are configured. The symbolic-state classifier takes them as arguments and will not assume a universal sigma.',
  );

  // 8 — Handover.
  const blockers = results.filter((result) => result.status === 'FAIL').length;
  add(
    'D3-08',
    'Handover',
    'DOC-04 receives features, symbolic states, baseline provenance and quality.',
    blockers === 0 ? 'PASS' : 'FAIL',
    blockers === 0
      ? 'DOC-04 can be handed features with provenance and quality.'
      : `${blockers} earlier checks are outstanding. The formula, baseline and feature engines are implemented, but with no baselines and no configured bands what reaches DOC-04 would be NOT_APPLICABLE or INSUFFICIENT_DATA throughout.`,
  );

  return results;
}
