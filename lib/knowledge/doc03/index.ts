/**
 * ULTRON DOC-03 — formulas, baselines and features, as code.
 *
 * DOC-03 §41 names the modules this layer produces. They are:
 *
 *   Common Formula Engine     formulas.ts   §6, §7
 *   TSE Feature Engine        formulas.ts   §8, §9
 *   Baseline Selector         baseline.ts   §11, §12, §13
 *   Baseline Lifecycle        baseline.ts   §14, §26, §27, §28, §29
 *   Deviation & Trend         feature.ts    §6.3, §6.4, §6.5
 *   Standard Feature Object   feature.ts    §35, §36, §37, §38
 *
 * The two rules that govern everything:
 *
 *   §2  QUALITY GATE — DOC-03 must never turn BAD or MISSING inputs into
 *       apparently valid features. `computeFeature` gates before it calculates.
 *
 *   §4  AUTHORITY RULE — a learned baseline or anomaly score must never
 *       silently replace an approved Alert, Danger or Trip. Those live in the
 *       DOC-01 authority registry and are a different type from anything here.
 *
 * And the boundary: DOC-03 says what is normal. It does not say what is wrong —
 * that is DOC-04 — and it does not decide how serious or what to do, which is
 * DOC-05. The symbolic states this layer emits are the handover.
 */

export * from './types';
export * from './formulas';
export * from './baseline';
export * from './feature';
export * from './validation';

export const DOC03_DOCUMENT_REF = 'ULTRON-TSE-DOC-03 v1.0';

/** DOC-03 §4, the concepts that must stay separate and who owns each. */
export const CORE_CONCEPTS: readonly {
  concept: string;
  owner: string;
  ultronCanLearn: boolean;
  note: string;
}[] = [
  {
    concept: 'Engineering Rating',
    owner: 'OEM / nameplate / engineering',
    ultronCanLearn: false,
    note: 'Import and version only.',
  },
  {
    concept: 'Customer Normal Range',
    owner: 'Approved customer engineering',
    ultronCanLearn: false,
    note: 'No silent overwrite.',
  },
  {
    concept: 'ULTRON Baseline',
    owner: 'Commissioning, history or a validated model',
    ultronCanLearn: true,
    note: 'Learned only under the §14 eligibility rules.',
  },
  {
    concept: 'Anomaly Threshold',
    owner: 'DOC-03 / DOC-04 analytics',
    ultronCanLearn: true,
    note: 'Configurable.',
  },
  { concept: 'Alert', owner: 'Customer / OEM / engineering authority', ultronCanLearn: false, note: 'No silent overwrite.' },
  { concept: 'Danger', owner: 'Customer / OEM / engineering authority', ultronCanLearn: false, note: 'No silent overwrite.' },
  {
    concept: 'Trip / Protection',
    owner: 'PLC / SIS / OEM protection',
    ultronCanLearn: false,
    note: 'Monitoring must respect it.',
  },
] as const;

/** DOC-03 §48, what DOC-04 receives. */
export const DOC04_HANDOVER: readonly string[] = [
  'Standard feature objects with value, expected value and deviation',
  'Symbolic feature state per feature',
  'Baseline id, version, level and confidence actually used',
  'Data quality and the lineage behind every number',
  'Operating state and context the comparison was made in',
  'Approved authority limits, kept separate from anything learned',
] as const;
