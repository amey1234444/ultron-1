// Governed registers for the single-screw-extruder diagnostic model.
//
// Ported verbatim from the BlackGATE extruder digital twin:
//   02_config/diagnostics/diagnostic_threshold_register.csv
//   02_config/diagnostics/fault_identifiability.csv
//   02_config/faults/fault_catalogue.csv
//   01_docs/WP07_Optimization_APC/process_constraint_register.csv
//
// The twin's central discipline is that no numeric decision boundary may be
// written inline in rule code — rules reference a `thresholdId` and nothing
// else, so a later field calibration replaces register values without touching
// algorithm code. That rule is kept here: `rules.ts` contains no numbers.
//
// Every threshold below is an engineering-development value. None is field
// calibrated (`fieldCalibrated: false` throughout), and the pipeline says so in
// every report it produces.

export type ThresholdOperator = '>=' | '<=' | '>' | '<';

export type Threshold = {
  thresholdId: string;
  faultId: string;
  sensor: string;
  feature: string;
  operator: ThresholdOperator;
  value: number;
  unit: string;
  source: string;
  sourceStatus: string;
  validationStatus: string;
  fieldCalibrated: boolean;
  notes: string;
};

const PE = 'PROCESS_ENGINEER_PROVIDED';
const ED = 'ENGINEERING_DEVELOPMENT';
const REF = 'REFERENCE_BASED_ENGINEERING_DEVELOPMENT';
const ACC_DOMAIN = 'ENGINEERING_DEVELOPMENT_ACCELERATION_DOMAIN_INTERPRETATION_REQUIRES_DAQ_CONFIRMATION';
const NOT_VALIDATED = 'NOT_FIELD_VALIDATED';
const INPUT = 'ULTRON-SSE-DT-WP1-PROCESS-INPUT-001';
const ISO = 'ISO_13373_SERIES_ROTATING_MACHINERY_CONDITION_MONITORING_PRACTICE';

function threshold(
  thresholdId: string,
  faultId: string,
  sensor: string,
  feature: string,
  operator: ThresholdOperator,
  value: number,
  unit: string,
  source: string,
  sourceStatus: string,
  notes: string,
): Threshold {
  return {
    thresholdId,
    faultId,
    sensor,
    feature,
    operator,
    value,
    unit,
    source,
    sourceStatus,
    validationStatus: NOT_VALIDATED,
    fieldCalibrated: false,
    notes,
  };
}

const THRESHOLD_ROWS: Threshold[] = [
  threshold('TH-MOTOR-LOAD-CURRENT', 'F-MOTOR-LOAD', 'PM1.current', 'current_ratio_to_baseline', '>=', 1.3, 'ratio',
    `${INPUT} fmea.warning_signatures_percent.motor_current`, PE,
    'Controlled +30% motor-current warning signature relative to the 10 A controlled reference'),
  threshold('TH-SCREEN-PRESSURE', 'F-SCREEN', 'P1', 'pressure_ratio_to_baseline', '>=', 1.15, 'ratio',
    `${INPUT} fmea.warning_signatures_percent.screen_pressure`, PE,
    'Controlled +15% melt-pressure warning signature relative to the 4 MPa controlled reference'),
  threshold('TH-DIE-PRESSURE', 'F-DIE', 'P1', 'pressure_ratio_to_baseline', '>=', 1.1, 'ratio',
    `${INPUT} fmea.warning_signatures_percent.die_pressure`, PE,
    'Controlled +10% melt-pressure warning signature relative to the 4 MPa controlled reference'),
  threshold('TH-BEARING-VIB', 'F-MOTOR-BRG', 'V1', 'vibration_ratio_to_baseline', '>=', 1.1, 'ratio',
    `${INPUT} fmea.warning_signatures_percent.bearing_vibration`, PE,
    'Controlled +10% bearing vibration warning signature; requires a declared healthy vibration baseline'),
  threshold('TH-BEARING-ACC-RMS', 'F-MOTOR-BRG', 'V1', 'acceleration_rms_ratio_to_baseline', '>=', 1.1, 'ratio',
    `${INPUT} fmea.warning_signatures_percent.bearing_vibration (measurement domain not declared by the source)`, ACC_DOMAIN,
    'Acceleration-domain mirror of the controlled +10% bearing vibration warning signature. Rolling-element defect energy sits in the kHz structural band, where velocity integration divides by frequency and suppresses it, so a velocity-only amplitude gate cannot see a bearing defect at all.'),
  threshold('TH-GEARBOX-VIB', 'F-GBX-BRG', 'V2', 'vibration_ratio_to_baseline', '>=', 1.05, 'ratio',
    `${INPUT} fmea.warning_signatures_percent.gearbox_vibration`, PE,
    'Controlled +5% gearbox vibration warning signature; requires a declared healthy vibration baseline'),
  threshold('TH-GEARBOX-ACC-RMS', 'F-GBX-BRG', 'V2', 'acceleration_rms_ratio_to_baseline', '>=', 1.05, 'ratio',
    `${INPUT} fmea.warning_signatures_percent.gearbox_vibration (measurement domain not declared by the source)`, ACC_DOMAIN,
    'Acceleration-domain mirror of the controlled +5% gearbox vibration warning signature. Gear mesh and rolling-element energy is high-frequency, so it is measured in the acceleration domain; the mm/s velocity scalar remains the operator-facing amplitude and the only quantity compared against the CON-VIBRATION hard limit.'),
  threshold('TH-HEATER-DROP', 'F-HEATER-FAIL', 'T1|T2|T3', 'zone_setpoint_residual_c', '<=', -5, 'degC',
    `${INPUT} fmea.heater_temperature_drop_c`, PE,
    'Controlled 5 degC zone temperature-drop signature applied to the affected zone only'),
  threshold('TH-ZONE-OVERTEMP', 'F-HEATER-ON', 'T1|T2|T3', 'zone_setpoint_residual_c', '>=', 5, 'degC',
    'SYMMETRIC_APPLICATION_OF_CONTROLLED_HEATER_DROP_MAGNITUDE', ED,
    'Symmetric magnitude of the controlled 5 degC zone residual; the over-temperature direction is not separately controlled'),
  threshold('TH-COOLING-MULTIZONE', 'F-COOL-DEG', 'T1&T2&T3', 'zones_above_setpoint_count', '>=', 2, 'count',
    'ENGINEERING_DEVELOPMENT_CROSS_ZONE_PATTERN_RULE', ED,
    'Cooling acts on the whole barrel jacket; multi-zone elevation separates cooling loss from a single-zone heater stuck on'),
  threshold('TH-FEED-LEVEL-LOW', 'F-STARVE', 'L1', 'level_percent', '<=', 15, 'percent',
    'ENGINEERING_DEVELOPMENT_HOPPER_LOW_LEVEL_INDICATION', ED,
    'Hopper low-level indication; the exact starvation level requires feeder and hopper geometry calibration'),
  threshold('TH-FEED-LEVEL-HIGH', 'F-OVERFEED', 'L1', 'level_percent', '>=', 90, 'percent',
    'ENGINEERING_DEVELOPMENT_HOPPER_HIGH_LEVEL_INDICATION', ED,
    'Hopper high-level indication; the exact overfeed level requires feeder calibration'),
  threshold('TH-PRESSURE-LOW', 'F-STARVE', 'P1', 'pressure_ratio_to_baseline', '<=', 0.9, 'ratio',
    'SYMMETRIC_APPLICATION_OF_CONTROLLED_DIE_PRESSURE_MAGNITUDE', ED,
    'Symmetric magnitude of the controlled 10% die-pressure signature applied in the decrease direction'),
  threshold('TH-CURRENT-LOW', 'F-STARVE', 'PM1.current', 'current_ratio_to_baseline', '<=', 0.9, 'ratio',
    'ENGINEERING_DEVELOPMENT_LOAD_REDUCTION_INDICATION', ED,
    'Reduced drive load indication; the magnitude requires field calibration'),
  threshold('TH-CURRENT-ELEVATED', 'F-OVERFEED', 'PM1.current', 'current_ratio_to_baseline', '>=', 1.1, 'ratio',
    'ENGINEERING_DEVELOPMENT_LOAD_INCREASE_INDICATION', ED,
    'Sub-warning load increase used as supporting evidence only; the controlled overload signature remains 1.30'),
  threshold('TH-VIB-1X-DOMINANT', 'F-IMBALANCE', 'V1|V2', 'order_1x_fraction', '>=', 0.5, 'fraction', ISO, REF,
    'Imbalance concentrates synchronous energy at the first shaft order'),
  threshold('TH-VIB-2X-RATIO', 'F-MISALIGN', 'V1|V2', 'order_2x_to_1x_ratio', '>=', 0.5, 'ratio', ISO, REF,
    'Misalignment raises the second shaft order relative to the first'),
  threshold('TH-VIB-HARMONIC-COUNT', 'F-LOOSENESS', 'V1|V2', 'significant_harmonic_count', '>=', 4, 'count', ISO, REF,
    'Mechanical looseness produces a harmonic-rich synchronous series'),
  threshold('TH-VIB-SUBHARMONIC', 'F-LOOSENESS', 'V1|V2', 'subharmonic_to_1x_ratio', '>=', 0.2, 'ratio', ISO, REF,
    'Half-order content is a recognised looseness indicator'),
  threshold('TH-VIB-NONSYNC', 'F-MOTOR-BRG', 'V1|V2', 'spread_non_synchronous_fraction', '>=', 0.4, 'fraction',
    'ISO_13373_SERIES_ROLLING_ELEMENT_BEARING_CONDITION_MONITORING_PRACTICE', REF,
    'Rolling-element defect frequencies are neither integer shaft multiples nor concentrated at one mesh order'),
  threshold('TH-VIB-CREST', 'F-MOTOR-BRG', 'V1|V2', 'crest_factor', '>=', 4, 'ratio',
    'ISO_13373_SERIES_IMPULSIVENESS_INDICATOR_PRACTICE', REF,
    'Localised defects raise crest factor above the sinusoidal value of about 1.41'),
  threshold('TH-VIB-ENVELOPE-KURT', 'F-MOTOR-BRG', 'V1|V2', 'envelope_kurtosis', '>=', 4, 'ratio',
    'ISO_13373_SERIES_ENVELOPE_DEMODULATION_PRACTICE', REF,
    'Impulsive modulation raises envelope kurtosis above the Gaussian value of 3'),
  threshold('TH-VIB-HF-BAND', 'F-MOTOR-BRG', 'V1|V2', 'high_frequency_energy_fraction', '>=', 0.3, 'fraction',
    'ISO_13373_SERIES_HIGH_FREQUENCY_BEARING_BAND_PRACTICE', REF,
    'Bearing defect energy appears in the high-frequency structural response band'),
  threshold('TH-VIB-MESH-ORDER', 'F-GEAR', 'V2', 'dominant_high_order', '>=', 5, 'order',
    'ISO_13373_SERIES_GEAR_MESH_CONDITION_MONITORING_PRACTICE', REF,
    'Gear mesh appears at a high integer shaft order; the exact mesh order REQUIRES_OEM_GEAR_TOOTH_COUNT'),
  threshold('TH-VIB-SIDEBAND', 'F-GEAR', 'V2', 'sideband_to_carrier_ratio', '>=', 0.15, 'ratio',
    'ISO_13373_SERIES_GEAR_SIDEBAND_MODULATION_PRACTICE', REF,
    'Shaft-rate sidebands around the mesh component indicate gear tooth defects'),
  threshold('TH-VIB-MESH-CONCENTRATION', 'F-GEAR', 'V2', 'dominant_high_order_energy_fraction', '>=', 0.3, 'fraction',
    'ISO_13373_SERIES_GEAR_MESH_CONDITION_MONITORING_PRACTICE', REF,
    'Gear energy concentrates at one integer mesh order; rolling-element defect energy stays spread across the structural band'),
  threshold('TH-TEMP-SUPPORT', 'F-MOTOR-BRG', 'T4|T5', 'temperature_residual_c', '>=', 5, 'degC',
    'ENGINEERING_DEVELOPMENT_BEARING_TEMPERATURE_SUPPORT_INDICATION', ED,
    'Supporting evidence only; motor and gearbox baseline temperatures REQUIRE_FIELD_CALIBRATION'),
  threshold('TH-FROZEN-REPEAT', 'WP3-FROZEN', 'ANY', 'identical_sample_run_length', '>=', 5, 'count',
    'ENGINEERING_DEVELOPMENT_TELEMETRY_STUCK_VALUE_RULE', ED,
    'Consecutive identical samples while correlated signals vary; the window requires DAQ rate confirmation'),
  threshold('TH-DRIFT-MONOTONIC', 'WP3-DRIFT', 'ANY', 'monotonic_trend_fraction', '>=', 0.9, 'fraction',
    'ENGINEERING_DEVELOPMENT_TELEMETRY_DRIFT_RULE', ED,
    'Near-monotonic single-sensor trend inconsistent with correlated sensors'),
  threshold('TH-NOISE-VARIANCE', 'WP3-NOISE', 'ANY', 'noise_ratio_to_baseline', '>=', 5, 'ratio',
    'ENGINEERING_DEVELOPMENT_TELEMETRY_NOISE_RULE', ED,
    'Sample standard deviation above the declared baseline measurement noise'),
  threshold('TH-SCALE-GAIN', 'WP3-SCALE', 'ANY', 'gain_error_ratio', '>=', 1.2, 'ratio',
    'ENGINEERING_DEVELOPMENT_TELEMETRY_GAIN_RULE', ED,
    'Proportional gain error against the process-consistent expectation'),
  threshold('TH-OFFSET-BIAS', 'WP3-OFFSET', 'ANY', 'persistent_bias_ratio', '>=', 0.1, 'ratio',
    'ENGINEERING_DEVELOPMENT_TELEMETRY_BIAS_RULE', ED,
    'Constant additive bias with unchanged variance and unchanged correlated sensors'),
  threshold('TH-DQ-SEQUENCE-GAP', 'WP3-LOSS', 'TELEMETRY', 'sequence_gap_count', '>=', 1, 'count',
    'DAQ_TRANSPORT_SEQUENCE_INTEGRITY_RULE', ED,
    'Any missing sequence number is a transport loss; not a physical machine fault'),
  threshold('TH-DQ-DUPLICATE', 'WP3-DUP', 'TELEMETRY', 'sequence_duplicate_count', '>=', 1, 'count',
    'DAQ_TRANSPORT_SEQUENCE_INTEGRITY_RULE', ED,
    'A repeated sequence number indicates a duplicated packet'),
  threshold('TH-DQ-DELAY', 'WP3-DELAY', 'TELEMETRY', 'max_arrival_gap_ratio', '>=', 2, 'ratio',
    'DAQ_TRANSPORT_LATENCY_RULE', ED,
    'Arrival gap at least twice the declared publish interval; the exact tolerance REQUIRES_DAQ_VERIFICATION'),
  threshold('TH-DQ-TIMESTAMP', 'WP3-TIME', 'TELEMETRY', 'timestamp_regression_count', '>=', 1, 'count',
    'DAQ_TRANSPORT_TIME_BASE_RULE', ED,
    'Non-monotonic sample timestamps indicate a time-base error'),
  threshold('TH-DQ-DROPOUT', 'WP3-DROPOUT', 'ANY', 'missing_sample_count', '>=', 1, 'count',
    'DAQ_MEASUREMENT_AVAILABILITY_RULE', ED,
    'Null measurement for an installed tag; never substituted with zero'),
  threshold('TH-STATE-SPEED-IDLE', 'MACHINE_STATE', 'E1', 'speed_ratio_to_baseline', '<=', 0.05, 'ratio',
    'ENGINEERING_DEVELOPMENT_MACHINE_STATE_INFERENCE', ED,
    'Shaft effectively stopped relative to the controlled reference speed'),
  threshold('TH-STATE-TEMP-RISING', 'MACHINE_STATE', 'T1|T2|T3', 'zone_slope_c_per_sample', '>=', 0.2, 'degC',
    'ENGINEERING_DEVELOPMENT_MACHINE_STATE_INFERENCE', ED,
    'Sustained zone heating trend used to separate startup from a heater fault'),
  threshold('TH-STATE-TEMP-FALLING', 'MACHINE_STATE', 'T1|T2|T3', 'zone_slope_c_per_sample', '<=', -0.2, 'degC',
    'ENGINEERING_DEVELOPMENT_MACHINE_STATE_INFERENCE', ED,
    'Sustained zone cooling trend used to separate shutdown from a heater fault'),
  threshold('TH-HEATER-FALLING', 'F-HEATER-FAIL', 'T1|T2|T3', 'zone_slope_c_per_sample', '<=', -0.2, 'degC',
    'ENGINEERING_DEVELOPMENT_HEATER_FAILURE_TREND_RULE', ED,
    'A completely failed heater keeps falling; a partially degraded heater settles at a lower steady value'),
  threshold('TH-LEVEL-DEPLETION', 'F-OVERFEED', 'L1', 'level_slope_percent_per_sample', '<=', -1, 'percent',
    'ENGINEERING_DEVELOPMENT_HOPPER_DEPLETION_RATE_RULE', ED,
    'Rapid hopper depletion at elevated load separates overfeed from a downstream restriction'),
  threshold('TH-STATE-COLD-DEFICIT', 'MACHINE_STATE', 'T1|T2|T3', 'zone_residual_min_c', '<=', -100, 'degC',
    'ENGINEERING_DEVELOPMENT_MACHINE_STATE_INFERENCE', ED,
    'Separates a cold start from ambient from a warm restart near setpoint'),
  threshold('TH-CONSISTENCY-RATIO', 'ANALYTICAL_REDUNDANCY', 'P1|PM1.current|E1|V1|V2', 'relative_deviation_from_baseline', '>=', 0.05, 'ratio',
    'ENGINEERING_DEVELOPMENT_ANALYTICAL_REDUNDANCY_BAND', ED,
    'Sensitivity band for deciding whether a coupled measurement moved with the suspect tag; not a fault boundary'),
  threshold('TH-CONSISTENCY-TEMP', 'ANALYTICAL_REDUNDANCY', 'T1|T2|T3|T4|T5', 'absolute_deviation_from_baseline_c', '>=', 2, 'degC',
    'ENGINEERING_DEVELOPMENT_ANALYTICAL_REDUNDANCY_BAND', ED,
    'Sensitivity band for deciding whether a coupled temperature moved with the suspect tag; not a fault boundary'),
];

export type ThresholdId = string;

const THRESHOLDS: Record<ThresholdId, Threshold> = Object.fromEntries(
  THRESHOLD_ROWS.map((row) => [row.thresholdId, row]),
);

export function getThreshold(thresholdId: ThresholdId): Threshold {
  const found = THRESHOLDS[thresholdId];
  if (!found) throw new Error(`unknown thresholdId: ${thresholdId}`);
  return found;
}

export function allThresholds(): Threshold[] {
  return THRESHOLD_ROWS;
}

/** True when `observed` crosses the threshold in its declared direction. */
export function satisfiedBy(thresholdId: ThresholdId, observed: number | null | undefined): boolean {
  if (observed === null || observed === undefined || !Number.isFinite(observed)) return false;
  const limit = getThreshold(thresholdId);
  switch (limit.operator) {
    case '>=':
      return observed >= limit.value;
    case '<=':
      return observed <= limit.value;
    case '>':
      return observed > limit.value;
    case '<':
      return observed < limit.value;
  }
}

export function thresholdProvenance(thresholdId: ThresholdId): string {
  const limit = getThreshold(thresholdId);
  return `${limit.thresholdId} (${limit.sourceStatus})`;
}

// --------------------------------------------------------------------------------------
// Fault catalogue
// --------------------------------------------------------------------------------------

export type FaultCategory =
  | 'PROCESS'
  | 'THERMAL'
  | 'MECHANICAL'
  | 'ELECTRICAL_DRIVE'
  | 'MATERIAL_DISTURBANCE'
  | 'INSTRUMENTATION'
  | 'DATA_QUALITY';

export type FaultRecord = {
  faultId: string;
  faultName: string;
  category: FaultCategory;
  subsystem: string;
  sensorObservations: string[];
  recoveryAction: string;
  limitations: string;
};

function fault(
  faultId: string,
  faultName: string,
  category: FaultCategory,
  subsystem: string,
  sensorObservations: string,
  recoveryAction: string,
  limitations: string,
): FaultRecord {
  return {
    faultId,
    faultName,
    category,
    subsystem,
    sensorObservations: sensorObservations ? sensorObservations.split(';').map((tag) => tag.trim()) : [],
    recoveryAction,
    limitations,
  };
}

const FAULT_ROWS: FaultRecord[] = [
  fault('F-SCREEN', 'Screen restriction/blockage', 'PROCESS', 'screen_pack', 'P1;PM1;E1', 'SCREEN_REPLACEMENT', 'Physical mapping absent'),
  fault('F-DIE', 'Die restriction/blockage', 'PROCESS', 'die', 'P1;PM1;E1', 'COMPONENT_REPLACEMENT', 'Physical mapping absent'),
  fault('F-STARVE', 'Feed starvation', 'PROCESS', 'feed', 'L1;P1;PM1;E1', 'MAINTENANCE_RESET', 'Mechanism and downstream effects unvalidated'),
  fault('F-OVERFEED', 'Excessive feed', 'PROCESS', 'feed', 'P1;PM1;E1', 'MAINTENANCE_RESET', 'Not automatically an overload'),
  fault('F-HEATER-FAIL', 'Heater complete failure', 'THERMAL', 'heater', 'T1;T2;T3;PM1', 'HEATER_RESTORATION', 'Temperature response uncalibrated'),
  fault('F-HEATER-PARTIAL', 'Heater partial degradation', 'THERMAL', 'heater', 'T1;T2;T3;PM1', 'HEATER_RESTORATION', 'Effectiveness absent'),
  fault('F-HEATER-ON', 'Heater stuck on', 'THERMAL', 'heater', 'T1;T2;T3;PM1', 'HEATER_RESTORATION', 'Delivered power absent'),
  fault('F-COOL-DEG', 'Cooling degradation', 'THERMAL', 'cooling', 'T1;T2;T3', 'COOLING_RESTORATION', 'Cooling baseline absent'),
  fault('F-COOL-LOSS', 'Cooling loss', 'THERMAL', 'cooling', 'T1;T2;T3', 'COOLING_RESTORATION', 'Configured cooling contribution required'),
  fault('F-MAT-VISC', 'Material viscosity variation', 'MATERIAL_DISTURBANCE', 'material', 'P1;PM1;E1', 'MATERIAL_CHANGE', 'No constitutive conversion'),
  fault('F-MOTOR-LOAD', 'Motor/process overload', 'ELECTRICAL_DRIVE', 'drive', 'PM1;T4;V1;E1', 'MAINTENANCE_RESET', 'OEM load limit and motor map absent'),
  fault('F-MOTOR-EFF', 'Motor efficiency degradation', 'ELECTRICAL_DRIVE', 'motor', 'PM1;T4', 'COMPONENT_REPLACEMENT', 'Installed efficiency map absent'),
  fault('F-MOTOR-BRG', 'Motor bearing degradation', 'MECHANICAL', 'motor_bearing', 'V1;T4;PM1;E1', 'COMPONENT_REPLACEMENT', 'Bearing geometry, amplitude and rate absent'),
  fault('F-GBX-BRG', 'Gearbox bearing degradation', 'MECHANICAL', 'gearbox_bearing', 'V2;T5;PM1;E1', 'COMPONENT_REPLACEMENT', 'Bearing geometry, amplitude and rate absent'),
  fault('F-GEAR', 'Gear degradation', 'MECHANICAL', 'gearbox', 'V2;T5;PM1;E1', 'COMPONENT_REPLACEMENT', 'Gear tooth counts, amplitude and rate absent'),
  fault('F-MISALIGN', 'Misalignment', 'MECHANICAL', 'drive_train', 'V1;V2;E1', 'MAINTENANCE_RESET', 'Order components and transfer functions absent'),
  fault('F-IMBALANCE', 'Imbalance', 'MECHANICAL', 'rotor', 'V1;V2;E1', 'MAINTENANCE_RESET', 'Order components and transfer functions absent'),
  fault('F-LOOSENESS', 'Looseness', 'MECHANICAL', 'mounting', 'V1;V2;E1', 'MAINTENANCE_RESET', 'Order components and transfer functions absent'),
  fault('F-WEAR', 'Screw/barrel wear', 'MECHANICAL', 'extrusion_section', 'P1;PM1;E1', 'COMPONENT_REPLACEMENT', 'Wear rate and mappings absent'),
  fault('WP3-OFFSET', 'Sensor offset', 'INSTRUMENTATION', 'sensor', '', 'SENSOR_REPLACEMENT', 'Separate from physical truth'),
  fault('WP3-DRIFT', 'Sensor drift', 'INSTRUMENTATION', 'sensor', '', 'SENSOR_REPLACEMENT', 'Separate from physical truth'),
  fault('WP3-FROZEN', 'Sensor frozen', 'INSTRUMENTATION', 'sensor', '', 'SENSOR_REPLACEMENT', 'Separate from physical truth'),
  fault('WP3-NOISE', 'Sensor noise', 'INSTRUMENTATION', 'sensor', '', 'SENSOR_REPLACEMENT', 'Separate from physical truth'),
  fault('WP3-DROPOUT', 'Sensor dropout', 'INSTRUMENTATION', 'sensor', '', 'SENSOR_REPLACEMENT', 'Separate from physical truth'),
  fault('WP3-SCALE', 'Scaling/calibration error', 'INSTRUMENTATION', 'sensor', '', 'SENSOR_REPLACEMENT', 'Separate from physical truth'),
  fault('WP3-LOSS', 'Data loss', 'DATA_QUALITY', 'communications', '', 'DAQ_CORRECTION', 'Not a physical machine fault'),
  fault('WP3-DELAY', 'Data delay', 'DATA_QUALITY', 'communications', '', 'DAQ_CORRECTION', 'Not a physical machine fault'),
  fault('WP3-DUP', 'Duplicate data', 'DATA_QUALITY', 'communications', '', 'DAQ_CORRECTION', 'Not a physical machine fault'),
  fault('WP3-TIME', 'Timestamp error', 'DATA_QUALITY', 'communications', '', 'DAQ_CORRECTION', 'Not a physical machine fault'),
];

const FAULTS: Record<string, FaultRecord> = Object.fromEntries(FAULT_ROWS.map((row) => [row.faultId, row]));

export function getFault(faultId: string): FaultRecord | undefined {
  return FAULTS[faultId];
}

export function faultName(faultId: string): string {
  return FAULTS[faultId]?.faultName ?? faultId;
}

// --------------------------------------------------------------------------------------
// Identifiability register
// --------------------------------------------------------------------------------------

export const IDENTIFIABILITY = {
  UNIQUE: 'UNIQUE_FROM_CURRENT_MEASUREMENTS',
  UNIQUE_WITH_FEATURES: 'UNIQUE_WITH_SIGNAL_FEATURES',
  FAMILY_ONLY: 'FAMILY_IDENTIFIABLE_ONLY',
  AMBIGUOUS: 'AMBIGUOUS_WITH_CURRENT_SENSORS',
  TEMPORAL_REQUIRED: 'TEMPORAL_HISTORY_REQUIRED',
  DATA_QUALITY_REQUIRED: 'DATA_QUALITY_METADATA_REQUIRED',
  NOT_IDENTIFIABLE: 'NOT_IDENTIFIABLE_WITH_CURRENT_SENSOR_PACKAGE',
} as const;

export type IdentifiabilityRecord = {
  faultId: string;
  identifiabilityClass: string;
  requiredInformation: string;
  ambiguityPartners: string[];
  separatingMeasurementRequired: string;
  notes: string;
};

function identifiability(
  faultId: string,
  identifiabilityClass: string,
  requiredInformation: string,
  ambiguityPartners: string,
  separatingMeasurementRequired: string,
  notes: string,
): IdentifiabilityRecord {
  return {
    faultId,
    identifiabilityClass,
    requiredInformation,
    ambiguityPartners: ambiguityPartners ? ambiguityPartners.split(';').map((id) => id.trim()) : [],
    separatingMeasurementRequired,
    notes,
  };
}

const IDENTIFIABILITY_ROWS: IdentifiabilityRecord[] = [
  identifiability('F-MOTOR-LOAD', IDENTIFIABILITY.UNIQUE, 'PM1 current against the controlled reference', '', '',
    'A controlled Process Engineer warning signature exists for this fault'),
  identifiability('F-MOTOR-EFF', IDENTIFIABILITY.NOT_IDENTIFIABLE, 'input electrical power and mechanical output power', 'F-MOTOR-LOAD',
    'shaft torque or mechanical output power measurement, or a calibrated motor-drive efficiency map',
    'PM1 supplies the input term only; no torque transducer or calibrated motor map exists, so the ratio cannot be formed'),
  identifiability('F-SCREEN', IDENTIFIABILITY.AMBIGUOUS, 'P1 against the controlled reference', 'F-DIE;F-MAT-VISC',
    'melt pressure transducer downstream of the screen pack',
    'P1 sits upstream of both the screen pack and the die, so it cannot locate the restriction'),
  identifiability('F-DIE', IDENTIFIABILITY.AMBIGUOUS, 'P1 against the controlled reference', 'F-SCREEN;F-MAT-VISC',
    'melt pressure transducer downstream of the screen pack',
    'P1 sits upstream of both the screen pack and the die, so it cannot locate the restriction'),
  identifiability('F-STARVE', IDENTIFIABILITY.UNIQUE, 'L1 hopper level with P1 and PM1 corroboration', '', '',
    'Hopper level directly observes feed availability'),
  identifiability('F-OVERFEED', IDENTIFIABILITY.TEMPORAL_REQUIRED, 'L1 depletion rate with elevated P1', 'F-SCREEN;F-DIE;F-MAT-VISC',
    'mass throughput measurement',
    'Without a hopper depletion rate an over-supplied machine reads like a downstream restriction'),
  identifiability('F-MAT-VISC', IDENTIFIABILITY.AMBIGUOUS, 'P1 and PM1 moving together', 'F-SCREEN;F-DIE;F-WEAR',
    'in-line melt viscosity or a material property input',
    'No material property is measured on this machine'),
  identifiability('F-WEAR', IDENTIFIABILITY.AMBIGUOUS, 'reduced developed pressure with adequate feed', 'F-MAT-VISC',
    'mass throughput measurement or direct clearance inspection',
    'Increased leakage flow and reduced melt viscosity produce the same pressure reading'),
  identifiability('F-HEATER-FAIL', IDENTIFIABILITY.TEMPORAL_REQUIRED, 'zone residual plus zone temperature trend', 'F-HEATER-PARTIAL',
    'zone temperature history',
    'A failed heater keeps falling while a degraded heater settles at a lower steady value'),
  identifiability('F-HEATER-PARTIAL', IDENTIFIABILITY.TEMPORAL_REQUIRED, 'zone residual plus zone temperature trend', 'F-HEATER-FAIL',
    'zone temperature history',
    'A failed heater keeps falling while a degraded heater settles at a lower steady value'),
  identifiability('F-HEATER-ON', IDENTIFIABILITY.UNIQUE, 'single zone above setpoint while other zones are controlled', 'F-COOL-DEG;F-COOL-LOSS', '',
    'A heater acts on one zone; cooling acts on the whole barrel'),
  identifiability('F-COOL-DEG', IDENTIFIABILITY.FAMILY_ONLY, 'several zones above setpoint together', 'F-COOL-LOSS',
    'coolant flow and coolant temperature measurement',
    'Degradation and complete loss differ only in magnitude and no cooling capacity calibration exists'),
  identifiability('F-COOL-LOSS', IDENTIFIABILITY.FAMILY_ONLY, 'several zones above setpoint together', 'F-COOL-DEG',
    'coolant flow and coolant temperature measurement',
    'Degradation and complete loss differ only in magnitude and no cooling capacity calibration exists'),
  identifiability('F-MOTOR-BRG', IDENTIFIABILITY.UNIQUE_WITH_FEATURES, 'V1 raw waveform with E1 shaft reference',
    'F-IMBALANCE;F-MISALIGN;F-LOOSENESS;F-GBX-BRG',
    'raw vibration waveform plus bearing geometry (BPFO/BPFI/BSF) for each drive-train bearing',
    'Localised only when one accelerometer carries the defect signature'),
  identifiability('F-GBX-BRG', IDENTIFIABILITY.UNIQUE_WITH_FEATURES, 'V2 raw waveform with E1 shaft reference', 'F-GEAR;F-MOTOR-BRG',
    'raw vibration waveform plus bearing geometry (BPFO/BPFI/BSF) for each drive-train bearing',
    'Localised only when one accelerometer carries the defect signature'),
  identifiability('F-GEAR', IDENTIFIABILITY.UNIQUE_WITH_FEATURES, 'V2 raw waveform with E1 shaft reference', 'F-GBX-BRG',
    'raw vibration waveform plus gear tooth counts for exact mesh-order confirmation',
    'Mesh order is located structurally; the exact gear mesh frequency REQUIRES_OEM_GEAR_TOOTH_COUNT'),
  identifiability('F-IMBALANCE', IDENTIFIABILITY.UNIQUE_WITH_FEATURES, 'V1 or V2 raw waveform with E1 shaft reference', 'F-MISALIGN;F-LOOSENESS',
    'raw vibration waveform plus a phase-referenced measurement across the coupling',
    'First-order dominance is only visible in the order domain; parallel misalignment also raises the first order'),
  identifiability('F-MISALIGN', IDENTIFIABILITY.UNIQUE_WITH_FEATURES, 'V1 or V2 raw waveform with E1 shaft reference', 'F-IMBALANCE;F-LOOSENESS',
    'raw vibration waveform plus an axial-direction accelerometer and a phase-referenced measurement',
    'Installed sensors are single-axis; axial evidence for misalignment is unavailable'),
  identifiability('F-LOOSENESS', IDENTIFIABILITY.UNIQUE_WITH_FEATURES, 'V1 or V2 raw waveform with E1 shaft reference', 'F-MISALIGN;F-IMBALANCE',
    'raw vibration waveform plus a phase-referenced measurement across the coupling',
    'Harmonic-rich structure is only visible in the order domain'),
  identifiability('WP3-OFFSET', IDENTIFIABILITY.AMBIGUOUS, 'measurement history at one operating point', 'WP3-SCALE',
    'observations at two distinct process levels',
    'A constant bias and a proportional gain error are identical at a single operating point'),
  identifiability('WP3-SCALE', IDENTIFIABILITY.AMBIGUOUS, 'measurement history at one operating point', 'WP3-OFFSET',
    'observations at two distinct process levels',
    'A constant bias and a proportional gain error are identical at a single operating point'),
  identifiability('WP3-DRIFT', IDENTIFIABILITY.TEMPORAL_REQUIRED, 'near-monotonic measurement history', 'WP3-OFFSET', '',
    'Drift is a trend property and cannot be seen in one sample'),
  identifiability('WP3-FROZEN', IDENTIFIABILITY.TEMPORAL_REQUIRED, 'repeated identical samples with other measurements varying', '', '',
    'Frozen is a repetition property and cannot be seen in one sample'),
  identifiability('WP3-NOISE', IDENTIFIABILITY.TEMPORAL_REQUIRED, 'sample dispersion against declared baseline noise', '',
    'declared per-tag baseline measurement noise',
    'Requires a commissioning noise record for each tag'),
  identifiability('WP3-DROPOUT', IDENTIFIABILITY.TEMPORAL_REQUIRED, 'null measurement for an installed tag', '', '',
    'Never substituted with zero'),
  identifiability('WP3-LOSS', IDENTIFIABILITY.DATA_QUALITY_REQUIRED, 'packet sequence numbers', 'WP3-DELAY', '',
    'Transport property; not a machine condition'),
  identifiability('WP3-DELAY', IDENTIFIABILITY.DATA_QUALITY_REQUIRED, 'packet arrival times and the declared publish interval', 'WP3-LOSS', '',
    'Transport property; not a machine condition'),
  identifiability('WP3-DUP', IDENTIFIABILITY.DATA_QUALITY_REQUIRED, 'packet sequence numbers or sample timestamps', '', '',
    'Transport property; not a machine condition'),
  identifiability('WP3-TIME', IDENTIFIABILITY.DATA_QUALITY_REQUIRED, 'sample timestamps', '', '',
    'Transport property; not a machine condition'),
];

const IDENTIFIABILITY_INDEX: Record<string, IdentifiabilityRecord> = Object.fromEntries(
  IDENTIFIABILITY_ROWS.map((row) => [row.faultId, row]),
);

export function identifiabilityFor(faultId: string): IdentifiabilityRecord | undefined {
  return IDENTIFIABILITY_INDEX[faultId];
}

/** Identifiability of an actual outcome, given the candidate set that was returned. */
export function classifyIdentifiability(candidates: string[]): string {
  if (candidates.length === 0) return 'NO_CANDIDATE_RAISED';
  const records = candidates.map((id) => IDENTIFIABILITY_INDEX[id]).filter(Boolean);
  if (records.length === 0) return 'MODEL_NOT_IMPLEMENTED';
  if (candidates.length === 1) return records[0].identifiabilityClass;
  const mutuallyPaired = records.every((record) =>
    candidates.filter((id) => id !== record.faultId).every((id) => record.ambiguityPartners.includes(id)),
  );
  if (mutuallyPaired) {
    const classes = new Set(records.map((record) => record.identifiabilityClass));
    if (classes.size === 1 && classes.has(IDENTIFIABILITY.FAMILY_ONLY)) return IDENTIFIABILITY.FAMILY_ONLY;
  }
  return IDENTIFIABILITY.AMBIGUOUS;
}

/** What extra information would collapse this ambiguity set. */
export function separatingMeasurements(candidates: string[]): string[] {
  const needed = new Set<string>();
  for (const id of candidates) {
    const required = IDENTIFIABILITY_INDEX[id]?.separatingMeasurementRequired;
    if (required) needed.add(required);
  }
  return [...needed].sort();
}

// --------------------------------------------------------------------------------------
// Process constraint register (hard limits, kept separate from the diagnosis)
// --------------------------------------------------------------------------------------

export type ProcessConstraint = {
  constraintId: string;
  name: string;
  tag: string;
  unit: string;
  operator: '<' | '<=';
  upper: number;
  hardSoft: 'HARD' | 'SOFT';
  source: string;
  approvalStatus: string;
  comment: string;
};

export const PROCESS_CONSTRAINTS: ProcessConstraint[] = [
  {
    constraintId: 'CON-CURRENT', name: 'Motor Current', tag: 'PM1.current', unit: 'A', operator: '<', upper: 15,
    hardSoft: 'HARD', source: PE, approvalStatus: 'FORMAL_SIGNOFF_PENDING', comment: 'Strict less-than boundary',
  },
  {
    constraintId: 'CON-PRESSURE', name: 'Melt Pressure', tag: 'P1', unit: 'MPa', operator: '<', upper: 10,
    hardSoft: 'HARD', source: PE, approvalStatus: 'FORMAL_SIGNOFF_PENDING', comment: 'Strict less-than boundary',
  },
  {
    constraintId: 'CON-TEMP', name: 'Maximum Barrel Temperature', tag: 'T1-T3', unit: 'degC', operator: '<', upper: 250,
    hardSoft: 'HARD', source: PE, approvalStatus: 'FORMAL_SIGNOFF_PENDING', comment: 'Strict less-than boundary',
  },
  {
    constraintId: 'CON-RPM-HARDWARE', name: 'Screw Speed', tag: 'E1', unit: 'rpm', operator: '<=', upper: 112.5,
    hardSoft: 'HARD', source: 'USER_RESOLUTION_CONFIRMED', approvalStatus: 'ENGINEERING_SIMULATION_LIMIT',
    comment: 'Current drive physical development range; the production reference and the APC command range remain separate',
  },
  {
    constraintId: 'CON-VIBRATION', name: 'Vibration', tag: 'V1/V2', unit: 'mm/s', operator: '<', upper: 8,
    hardSoft: 'HARD', source: PE, approvalStatus: 'FORMAL_SIGNOFF_PENDING', comment: 'Strict less-than boundary',
  },
  {
    constraintId: 'CON-SCRAP', name: 'Scrap Rate', tag: '', unit: 'percent', operator: '<=', upper: 3,
    hardSoft: 'SOFT', source: PE, approvalStatus: 'FORMAL_SIGNOFF_PENDING',
    comment: 'SOFT_QUALITY / QUALITY_GATE; the measured input is absent',
  },
];
