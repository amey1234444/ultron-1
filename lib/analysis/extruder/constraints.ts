// Hard process-constraint checks, kept strictly separate from the diagnosis.
//
// Ported from the digital twin's `diagnostics/snapshot_constraints.py`. A
// constraint says whether the machine is inside its declared safe operating
// envelope right now. That is a different question from "what is wrong with the
// machine", and mixing the two is how an in-limit machine with a developing
// bearing defect gets reported as healthy.
//
// Vibration domain
// ----------------
// CON-VIBRATION bounds vibration at 8 mm/s. mm/s is a *velocity*, so the
// comparison is only valid against a band-limited velocity RMS. A broadband
// acceleration RMS in g is a different physical quantity and is never compared
// against this limit.
//
// Screw speed
// -----------
// CON-RPM-HARDWARE bounds *screw* speed. E1 measures the *motor* shaft, so the
// screw speed is derived through the gearbox reduction ratio before comparison.
// Without a ratio the check reports NOT_EVALUATED rather than comparing the
// wrong shaft against the limit.

import { PROCESS_CONSTRAINTS, type ProcessConstraint } from './registers';
import type { ExtruderTag } from './signalMap';

export type ConstraintStatus = 'PASS' | 'VIOLATION' | 'NOT_EVALUATED_MISSING_INPUT';
export type ConstraintOverall = 'PASS' | 'PARTIAL' | 'VIOLATION';

export type ConstraintCheck = {
  constraintId: string;
  name: string;
  value: number | null;
  unit: string;
  operator: string;
  limit: number;
  hardSoft: ProcessConstraint['hardSoft'];
  status: ConstraintStatus;
  reason?: string;
};

const BY_ID: Record<string, ProcessConstraint> = Object.fromEntries(
  PROCESS_CONSTRAINTS.map((constraint) => [constraint.constraintId, constraint]),
);

function evaluateOne(constraintId: string, value: number): ConstraintCheck {
  const definition = BY_ID[constraintId];
  const violated = definition.operator === '<' ? !(value < definition.upper) : !(value <= definition.upper);
  return {
    constraintId,
    name: definition.name,
    value,
    unit: definition.unit,
    operator: definition.operator,
    limit: definition.upper,
    hardSoft: definition.hardSoft,
    status: violated ? 'VIOLATION' : 'PASS',
  };
}

function notEvaluated(constraintId: string, reason: string): ConstraintCheck {
  const definition = BY_ID[constraintId];
  return {
    constraintId,
    name: definition.name,
    value: null,
    unit: definition.unit,
    operator: definition.operator,
    limit: definition.upper,
    hardSoft: definition.hardSoft,
    status: 'NOT_EVALUATED_MISSING_INPUT',
    reason,
  };
}

/**
 * The worst-case vibration velocity RMS in mm/s across the installed channels.
 * Returns `null` when no channel reported a velocity, which happens when both
 * accelerometers report only in the acceleration domain.
 */
function worstVibrationVelocity(
  values: Partial<Record<ExtruderTag, number | null>>,
): { value: number | null; source: string | null } {
  let worst: { tag: string; value: number } | null = null;
  for (const tag of ['V1', 'V2'] as const) {
    const value = values[tag];
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    if (!worst || value > worst.value) worst = { tag, value };
  }
  if (!worst) return { value: null, source: null };
  return { value: worst.value, source: `${worst.tag} velocity RMS scalar` };
}

export function evaluateConstraints(
  values: Partial<Record<ExtruderTag, number | null>>,
  reductionRatio: number | null,
): { overall: ConstraintOverall; checks: ConstraintCheck[] } {
  const checks: ConstraintCheck[] = [];

  const current = values['PM1.current'];
  checks.push(
    current !== null && current !== undefined && Number.isFinite(current)
      ? evaluateOne('CON-CURRENT', current)
      : notEvaluated('CON-CURRENT', 'PM1 motor current is not mapped on this machine.'),
  );

  const pressure = values.P1;
  checks.push(
    pressure !== null && pressure !== undefined && Number.isFinite(pressure)
      ? evaluateOne('CON-PRESSURE', pressure)
      : notEvaluated('CON-PRESSURE', 'P1 melt pressure is not mapped on this machine.'),
  );

  const motorRpm = values.E1;
  const screwRpmValue =
    motorRpm === null || motorRpm === undefined || !Number.isFinite(motorRpm) || !reductionRatio
      ? null
      : motorRpm / reductionRatio;
  checks.push(
    screwRpmValue !== null
      ? evaluateOne('CON-RPM-HARDWARE', screwRpmValue)
      : notEvaluated(
          'CON-RPM-HARDWARE',
          motorRpm === null || motorRpm === undefined
            ? 'E1 motor shaft speed is not mapped on this machine.'
            : 'The gearbox reduction ratio is required to derive screw speed from the motor-shaft measurement.',
        ),
  );

  const temperatures = (['T1', 'T2', 'T3'] as const)
    .map((tag) => values[tag])
    .filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  checks.push(
    temperatures.length > 0
      ? evaluateOne('CON-TEMP', Math.max(...temperatures))
      : notEvaluated('CON-TEMP', 'No T1-T3 barrel zone measurement is mapped on this machine.'),
  );

  const vibration = worstVibrationVelocity(values);
  if (vibration.value === null) {
    checks.push(
      notEvaluated(
        'CON-VIBRATION',
        'No V1/V2 velocity RMS (mm/s) measurement is available. A broadband acceleration RMS in g is a different physical quantity and is never compared against this limit.',
      ),
    );
  } else {
    const check = evaluateOne('CON-VIBRATION', vibration.value);
    checks.push({
      ...check,
      reason: `Evaluated in the velocity domain from the ${vibration.source}; band-limit equivalence to the register limit REQUIRES_DAQ_VERIFICATION.`,
    });
  }

  checks.push(notEvaluated('CON-SCRAP', 'Scrap rate is not an installed measurement on this machine.'));

  const overall: ConstraintOverall = checks.some((check) => check.status === 'VIOLATION')
    ? 'VIOLATION'
    : checks.some((check) => check.status === 'NOT_EVALUATED_MISSING_INPUT')
      ? 'PARTIAL'
      : 'PASS';
  return { overall, checks };
}
