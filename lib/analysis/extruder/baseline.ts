// Healthy-reference (baseline) context for baseline-relative extruder diagnostics.
//
// Ported from the digital twin's `diagnostics/baseline_context.py` and
// `diagnostics/healthy_baseline.py`. Condition monitoring compares a measurement
// against the machine's own healthy reference, never against an invented
// absolute number, so every reference below carries where it came from:
//
//   SOURCE_BACKED            the controlled Process Engineer / machine-config value
//   DERIVED                  computed from source-backed values through a documented relation
//   ENGINEERING_DEVELOPMENT  a development placeholder with no source and no field baseline
//   LEARNED                  observed from this machine's own recent history in the app
//
// Where no controlled baseline exists and none is supplied, the reference stays
// `null` and the dependent feature is reported `NOT_EVALUATED_BASELINE_REQUIRED`
// rather than silently defaulting to zero.

export type BaselineStatus = 'SOURCE_BACKED' | 'DERIVED' | 'ENGINEERING_DEVELOPMENT' | 'LEARNED';

export type BaselineValue = {
  tag: string;
  label: string;
  value: number | null;
  unit: string;
  status: BaselineStatus;
  provenance: string;
  fieldCalibrated: boolean;
};

// Controlled machine configuration (02_config/machine/ultron_sse_machine_specific.yaml).
export type Recipe = {
  id: string;
  name: string;
  meltPressureMPa: number;
  screwSpeedRpm: number;
  meltTemperatureC: number;
};

export const RECIPES: Record<string, Recipe> = {
  'RD-001': { id: 'RD-001', name: 'Standard PA6', meltPressureMPa: 4, screwSpeedRpm: 100, meltTemperatureC: 210 },
  'RD-002': { id: 'RD-002', name: 'High-strength', meltPressureMPa: 5, screwSpeedRpm: 100, meltTemperatureC: 220 },
  'RD-003': { id: 'RD-003', name: 'Low-viscosity', meltPressureMPa: 3, screwSpeedRpm: 100, meltTemperatureC: 200 },
};

export const DEFAULT_RECIPE_ID = 'RD-001';

/** Controlled gearbox reduction ratio; E1 measures the motor shaft, the recipe declares screw speed. */
export const GEARBOX_REDUCTION_RATIO = 20;

/** Controlled heater zone setpoints. */
export const ZONE_SETPOINTS_C: Record<'T1' | 'T2' | 'T3', number> = { T1: 180, T2: 210, T3: 220 };

/** Controlled validation reference point for drive current. */
export const REFERENCE_MOTOR_CURRENT_A = 10;

// Development placeholders with no controlled source. Declared once, here, so no
// other module can quietly assume a different healthy value for the same tag.
export const HEALTHY_MOTOR_TEMPERATURE_C = 40;
export const HEALTHY_GEARBOX_TEMPERATURE_C = 40;
export const HEALTHY_HOPPER_LEVEL_PERCENT = 75;

/** Baseline measurement dispersion for the barrel-zone thermocouples (development value). */
export const HEALTHY_ZONE_NOISE_C = 0.2;

export type BaselineContext = {
  recipeId: string;
  reductionRatio: number;
  zoneSetpointsC: Record<string, number>;
  values: Record<string, number | null>;
  provenance: Record<string, string>;
  status: Record<string, BaselineStatus>;
  suppliedTags: string[];
};

const REQUIRES_SUPPLIED: Record<string, string> = {
  V1: 'REQUIRES_FIELD_CALIBRATION_HEALTHY_VIBRATION_BASELINE',
  V2: 'REQUIRES_FIELD_CALIBRATION_HEALTHY_VIBRATION_BASELINE',
  T4: 'REQUIRES_FIELD_CALIBRATION_MOTOR_TEMPERATURE_BASELINE',
  T5: 'REQUIRES_FIELD_CALIBRATION_GEARBOX_TEMPERATURE_BASELINE',
  L1: 'REQUIRES_PROCESS_DEFINITION_HOPPER_WORKING_LEVEL',
};

/**
 * Assemble the baseline from controlled configuration plus supplied overrides.
 *
 * `supplied` carries references the machine configuration cannot provide — a
 * healthy vibration amplitude recorded during commissioning, or a value the app
 * learned from this machine's own history. Those are recorded with their own
 * provenance so a report can always separate a controlled reference from a
 * site-observed one.
 */
export function buildBaselineContext(
  recipeId: string = DEFAULT_RECIPE_ID,
  supplied?: Record<string, number | null>,
  suppliedStatus: BaselineStatus = 'LEARNED',
): BaselineContext {
  const recipe = RECIPES[recipeId] ?? RECIPES[DEFAULT_RECIPE_ID];
  const values: Record<string, number | null> = {
    P1: recipe.meltPressureMPa,
    'PM1.current': REFERENCE_MOTOR_CURRENT_A,
    T1: ZONE_SETPOINTS_C.T1,
    T2: ZONE_SETPOINTS_C.T2,
    T3: ZONE_SETPOINTS_C.T3,
    // E1 measures the motor shaft; the recipe declares screw speed.
    E1: recipe.screwSpeedRpm * GEARBOX_REDUCTION_RATIO,
    'T1.noise_std': HEALTHY_ZONE_NOISE_C,
    'T2.noise_std': HEALTHY_ZONE_NOISE_C,
    'T3.noise_std': HEALTHY_ZONE_NOISE_C,
  };
  const provenance: Record<string, string> = {
    P1: `CONTROLLED_RECIPE_${recipe.id}_MELT_PRESSURE`,
    'PM1.current': 'CONTROLLED_VALIDATION_REFERENCE_MOTOR_CURRENT',
    T1: 'CONTROLLED_HEATER_ZONE_1_SETPOINT',
    T2: 'CONTROLLED_HEATER_ZONE_2_SETPOINT',
    T3: 'CONTROLLED_HEATER_ZONE_3_SETPOINT',
    E1: `DERIVED_${recipe.id}_OPERATING_POINT_REQUIRES_OEM_VFD_CONFIRMATION (motor_rpm = screw_rpm x gearbox_ratio = ${recipe.screwSpeedRpm} x ${GEARBOX_REDUCTION_RATIO})`,
    'T1.noise_std': 'ENGINEERING_DEVELOPMENT_ZONE_THERMOCOUPLE_NOISE',
    'T2.noise_std': 'ENGINEERING_DEVELOPMENT_ZONE_THERMOCOUPLE_NOISE',
    'T3.noise_std': 'ENGINEERING_DEVELOPMENT_ZONE_THERMOCOUPLE_NOISE',
  };
  const status: Record<string, BaselineStatus> = {
    P1: 'SOURCE_BACKED',
    'PM1.current': 'SOURCE_BACKED',
    T1: 'SOURCE_BACKED',
    T2: 'SOURCE_BACKED',
    T3: 'SOURCE_BACKED',
    E1: 'DERIVED',
    'T1.noise_std': 'ENGINEERING_DEVELOPMENT',
    'T2.noise_std': 'ENGINEERING_DEVELOPMENT',
    'T3.noise_std': 'ENGINEERING_DEVELOPMENT',
  };

  for (const [tag, reason] of Object.entries(REQUIRES_SUPPLIED)) {
    if (!(tag in values)) {
      values[tag] = null;
      provenance[tag] = reason;
      status[tag] = 'ENGINEERING_DEVELOPMENT';
    }
  }

  const suppliedTags: string[] = [];
  for (const [tag, value] of Object.entries(supplied ?? {})) {
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    values[tag] = value;
    provenance[tag] =
      suppliedStatus === 'LEARNED'
        ? 'LEARNED_FROM_OBSERVED_HISTORY_ON_THIS_MACHINE_NOT_FIELD_CALIBRATED'
        : 'SUPPLIED_HEALTHY_BASELINE_MEASUREMENT';
    status[tag] = suppliedStatus;
    suppliedTags.push(tag);
  }

  return {
    recipeId: recipe.id,
    reductionRatio: GEARBOX_REDUCTION_RATIO,
    zoneSetpointsC: { ...ZONE_SETPOINTS_C },
    values,
    provenance,
    status,
    suppliedTags: suppliedTags.sort(),
  };
}

export function baselineOf(context: BaselineContext, tag: string): number | null {
  const value = context.values[tag];
  return value === undefined ? null : value;
}

/** Convert a measured motor shaft speed (E1) to screw speed. */
export function screwRpm(context: BaselineContext, motorRpm: number | null): number | null {
  if (motorRpm === null || !Number.isFinite(motorRpm)) return null;
  return motorRpm / context.reductionRatio;
}

/** Motor shaft rotational rate in Hz — the order-analysis reference for V1/V2. */
export function shaftRateHz(motorRpm: number | null): number | null {
  if (motorRpm === null || !Number.isFinite(motorRpm) || motorRpm <= 0) return null;
  return motorRpm / 60;
}

const VELOCITY_SCALAR_UNIT = 'mm/s RMS';

/** The canonical healthy baseline as display records, one entry per value. */
export function baselineRecords(context: BaselineContext): BaselineValue[] {
  const motorRpm = baselineOf(context, 'E1');
  const screw = screwRpm(context, motorRpm);
  const record = (tag: string, label: string, unit: string): BaselineValue => ({
    tag,
    label,
    value: baselineOf(context, tag),
    unit,
    status: context.status[tag] ?? 'ENGINEERING_DEVELOPMENT',
    provenance: context.provenance[tag] ?? 'UNKNOWN',
    // Nothing in this model is field calibrated; the twin's registers all say so.
    fieldCalibrated: false,
  });

  return [
    {
      tag: 'screw_speed_rpm',
      label: 'Screw speed reference',
      value: screw,
      unit: 'rpm',
      status: 'SOURCE_BACKED',
      provenance: `CONTROLLED_RECIPE_${context.recipeId}_SCREW_SPEED_RPM`,
      fieldCalibrated: false,
    },
    {
      tag: 'gearbox_ratio',
      label: 'Gearbox reduction ratio',
      value: context.reductionRatio,
      unit: 'ratio (N:1)',
      status: 'SOURCE_BACKED',
      provenance: 'CONTROLLED_GEARBOX_REDUCTION_RATIO',
      fieldCalibrated: false,
    },
    record('E1', 'E1 motor shaft speed', 'rpm'),
    record('T1', 'T1 barrel zone 1 temperature', 'degC'),
    record('T2', 'T2 barrel zone 2 temperature', 'degC'),
    record('T3', 'T3 barrel zone 3 temperature', 'degC'),
    record('P1', 'P1 melt pressure', 'MPa'),
    record('PM1.current', 'PM1 motor current', 'A'),
    record('V1', 'V1 motor vibration velocity RMS', VELOCITY_SCALAR_UNIT),
    record('V2', 'V2 gearbox vibration velocity RMS', VELOCITY_SCALAR_UNIT),
    record('T4', 'T4 motor temperature', 'degC'),
    record('T5', 'T5 gearbox temperature', 'degC'),
    record('L1', 'L1 hopper level', 'percent'),
  ];
}

/** Tags whose healthy value still has no field baseline behind it. */
export function missingFieldBaselines(records: BaselineValue[]): string[] {
  return records.filter((item) => item.value === null || item.status === 'ENGINEERING_DEVELOPMENT').map((item) => item.tag);
}
