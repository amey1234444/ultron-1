/**
 * The DOC-02 §23–§25 limit and authority registry.
 *
 * §23 and §24 restate DOC-01 §17 — the authority ladder, the value types, the
 * rule that BLACKGATE analytics never displaces an approved plant value — and that
 * part is already implemented in `lib/knowledge/tse/engineeringFacts.ts`. This
 * file adds what DOC-02 brings that DOC-01 did not: §24's explicit separation
 * of the five concepts, and §25's persistence and hysteresis fields.
 *
 * §25 is the substantive addition. A limit with a single boundary chatters: the
 * condition enters at 90, clears at 89.9, enters again at 90.1, and an operator
 * gets twenty alerts for one event. A separate clear threshold and a persistence
 * window are what make a limit usable, and DOC-02's job is to establish that
 * those fields exist and are controlled configuration. What the analytical layer
 * does with them is DOC-03 and DOC-05.
 *
 * The document's own numbers — "Alert enters above 90 bar for 15 s and clears
 * below 87 bar for 30 s" — are labelled "Illustrative example only", so they
 * appear nowhere in this file. §37 asks specifically that examples are not used
 * as plant values.
 */

import type { HysteresisConfig, OperatingStateId } from './types';

/* 24 — The five concepts, kept apart ---------------------------------------------- */

export type LimitConcept = 'BASELINE' | 'ANOMALY_THRESHOLD' | 'ALERT' | 'DANGER' | 'TRIP_PROTECTION';

export const LIMIT_CONCEPT: Record<
  LimitConcept,
  { meaning: string; definedBy: string; interpretation: string }
> = {
  BASELINE: {
    meaning: 'Expected healthy behaviour in a defined context.',
    definedBy: 'DOC-03, using customer, OEM, commissioning and historical data.',
    interpretation: 'The normal distribution for this recipe at this RPM and feed.',
  },
  ANOMALY_THRESHOLD: {
    meaning: 'An analytics boundary indicating unusual behaviour.',
    definedBy: 'BLACKGATE and DOC-03 contextual analytics.',
    interpretation: 'Unusual against normal, but possibly still below the plant Alert.',
  },
  ALERT: {
    meaning: 'An approved condition requiring attention.',
    definedBy: 'Customer, OEM or engineering policy.',
    interpretation: 'Investigate and plan a response.',
  },
  DANGER: {
    meaning: 'An approved serious-condition threshold.',
    definedBy: 'Customer, OEM or engineering policy.',
    interpretation: 'Urgent response.',
  },
  TRIP_PROTECTION: {
    meaning: 'A control or protection action threshold or state.',
    definedBy: 'PLC, SIS, protection design or OEM.',
    interpretation: 'A machine protection action. BLACKGATE recognises it and does not replace it.',
  },
};

/**
 * The ordering DOC-02 §24 implies, loosest first.
 *
 * An anomaly threshold that sits above an Alert, or an Alert above a Trip, is a
 * configuration mistake rather than a tighter policy — it means the analytics
 * would never fire before the plant already had. `orderingProblems` reports it.
 */
export const LIMIT_CONCEPT_ORDER: readonly LimitConcept[] = [
  'BASELINE',
  'ANOMALY_THRESHOLD',
  'ALERT',
  'DANGER',
  'TRIP_PROTECTION',
] as const;

/**
 * Check a set of declared limits for an ordering that cannot be right.
 *
 * Only compares limits given in the same direction and unit; a low-side trip
 * and a high-side alert are not comparable and are left alone.
 */
export function orderingProblems(
  limits: readonly { concept: LimitConcept; value: number; unit: string; direction: 'HIGH' | 'LOW' }[],
): string[] {
  const problems: string[] = [];
  for (const direction of ['HIGH', 'LOW'] as const) {
    const side = limits.filter((limit) => limit.direction === direction);
    const units = new Set(side.map((limit) => limit.unit));
    for (const unit of units) {
      const inUnit = side
        .filter((limit) => limit.unit === unit)
        .sort((a, b) => LIMIT_CONCEPT_ORDER.indexOf(a.concept) - LIMIT_CONCEPT_ORDER.indexOf(b.concept));
      for (let i = 1; i < inUnit.length; i += 1) {
        const looser = inUnit[i - 1];
        const tighter = inUnit[i];
        const wrong = direction === 'HIGH' ? looser.value > tighter.value : looser.value < tighter.value;
        if (wrong) {
          problems.push(
            `${looser.concept} (${looser.value} ${unit}) is beyond ${tighter.concept} (${tighter.value} ${unit}) on the ${direction.toLowerCase()} side, so the analytics boundary would never be reached before the approved one.`,
          );
        }
      }
    }
  }
  return problems;
}

/* 25 — Persistence and hysteresis -------------------------------------------------- */

/** The §25 fields and what each is for. */
export const HYSTERESIS_FIELDS: readonly { field: keyof HysteresisConfig; purpose: string }[] = [
  { field: 'enterThreshold', purpose: 'The condition that begins a candidate Alert or anomaly.' },
  { field: 'enterPersistenceSeconds', purpose: 'How long, or how many valid samples, the condition must persist.' },
  { field: 'clearThreshold', purpose: 'The recovery boundary, often different from the enter threshold.' },
  { field: 'clearPersistenceSeconds', purpose: 'The required recovery time before clearing.' },
  { field: 'hardLimitBypass', purpose: 'Whether an approved hard Danger or Trip condition bypasses persistence.' },
  { field: 'applicableStates', purpose: 'The operating states the rule is valid in.' },
  { field: 'sourceAuthority', purpose: 'Who approved the values.' },
] as const;

/** An undeclared hysteresis config for a subject, with nothing assumed. */
export function emptyHysteresis(configId: string, subject: string): HysteresisConfig {
  return {
    configId,
    subject,
    enterThreshold: null,
    enterPersistenceSeconds: null,
    clearThreshold: null,
    clearPersistenceSeconds: null,
    hardLimitBypass: false,
    applicableStates: [],
    applicableContext: null,
    sourceAuthority: null,
    approvedBy: null,
    version: null,
  };
}

export class HysteresisConfigError extends Error {}

/**
 * Validate a hysteresis configuration before it is used.
 *
 * The chatter check is the one that matters: a clear threshold equal to the
 * enter threshold is not hysteresis at all, and it is the single most common
 * way a limit configuration produces an unusable alert stream. Reported rather
 * than thrown so a commissioning UI can show every problem at once.
 */
export function hysteresisProblems(config: HysteresisConfig, direction: 'HIGH' | 'LOW'): string[] {
  const problems: string[] = [];

  if (config.enterThreshold === null) {
    problems.push(`${config.configId} has no enter threshold, so there is no condition to detect.`);
  }
  if (config.sourceAuthority === null || config.approvedBy === null) {
    problems.push(
      `${config.configId} has no approving authority. DOC-02 §37 requires persistence and hysteresis to be configured only where approved, and forbids using the document's illustrative values as plant values.`,
    );
  }
  if (config.enterThreshold !== null && config.clearThreshold !== null) {
    if (config.enterThreshold === config.clearThreshold) {
      problems.push(
        `${config.configId} clears at the same value it enters at, which is not hysteresis: the condition will chatter around the boundary.`,
      );
    } else {
      const wrongWay =
        direction === 'HIGH' ? config.clearThreshold > config.enterThreshold : config.clearThreshold < config.enterThreshold;
      if (wrongWay) {
        problems.push(
          `${config.configId} clears further from normal than it enters, so once entered it can never clear.`,
        );
      }
    }
  }
  if (config.enterPersistenceSeconds !== null && config.enterPersistenceSeconds < 0) {
    problems.push(`${config.configId} has a negative enter persistence.`);
  }
  return problems;
}

/** Whether a config is complete enough to be applied. */
export function hysteresisIsUsable(config: HysteresisConfig, direction: 'HIGH' | 'LOW'): boolean {
  return hysteresisProblems(config, direction).length === 0;
}

/**
 * Whether a hysteresis rule applies in a given operating state.
 *
 * An empty `applicableStates` means unrestricted, which is the right default
 * for a rule nobody has scoped. A rule scoped to states it does not list is
 * simply not evaluated there — §25 makes "Applicable State/Context" a field
 * precisely so a production limit is not applied during warm-up.
 */
export function appliesInState(config: HysteresisConfig, stateId: OperatingStateId): boolean {
  return config.applicableStates.length === 0 || config.applicableStates.includes(stateId);
}
