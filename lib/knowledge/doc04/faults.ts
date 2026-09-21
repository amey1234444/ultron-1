/**
 * The DOC-04 §11 fault master index and §7 abnormal pattern library.
 *
 * Ninety faults across ten families, and the twelve patterns that bridge an
 * anomaly to a fault candidate. Both were parsed out of the document rather
 * than retyped, so the family, location, applicable states and minimum required
 * evidence of each are the document's own words.
 *
 * `minimumRequiredEvidence` is the field that matters. §18 makes it binding: a
 * rule whose required evidence is missing or BAD returns INSUFFICIENT_EVIDENCE
 * rather than a weaker conclusion, and `faultsEvaluableWith` is what a
 * deployment uses to find out which of the ninety it can actually run.
 */

import type { FaultDefinition, FaultFamily, PatternDefinition } from './types';

function fault(
  faultId: string,
  name: string,
  family: FaultFamily,
  primaryLocation: string,
  applicableStates: string,
  minimumRequiredEvidence: string,
): FaultDefinition {
  return { faultId, name, family, primaryLocation, applicableStates, minimumRequiredEvidence, ruleVersion: '1.0' };
}

function pattern(
  patternId: string,
  name: string,
  typicalEvidence: string,
  faultCandidateDirection: string,
): PatternDefinition {
  return { patternId, name, typicalEvidence, faultCandidateDirection };
}

/** DOC-04 §11, all ninety faults in document order. */
export const DOC04_FAULTS: readonly FaultDefinition[] = [
  fault(
    'TSE-FEED-001',
    'Feed Starvation',
    'FEEDING',
    'Main feeder / feed throat',
    'STARTUP, RAMP_UP, STEADY',
    'Feed actual, feed SP, RPM',
  ),
  fault(
    'TSE-FEED-002',
    'Feed Surging / Oscillation',
    'FEEDING',
    'Feeder / feed throat',
    'RAMP_UP, STEADY',
    'Feed actual trend/variability, RPM',
  ),
  fault(
    'TSE-FEED-003',
    'Hopper Bridging / Poor Flow',
    'FEEDING',
    'Hopper outlet / feeder inlet',
    'STEADY',
    'Feed actual, feed SP, hopper level or operator evidence',
  ),
  fault(
    'TSE-FEED-004',
    'Feeder Blockage / Mechanical Jam',
    'FEEDING',
    'Feeder screw / discharge',
    'STARTUP, STEADY',
    'Feed command/actual, feeder motor load/status',
  ),
  fault(
    'TSE-FEED-005',
    'Feeder Command-Actual Mismatch',
    'FEEDING',
    'Feeder control loop',
    'ALL producing states',
    'Feed SP, feed actual',
  ),
  fault(
    'TSE-FEED-006',
    'Feeder Refill Disturbance',
    'FEEDING',
    'Loss-in-weight hopper / refill system',
    'STEADY',
    'Refill status, feed actual',
  ),
  fault(
    'TSE-FEED-007',
    'Side Feeder Starvation',
    'FEEDING',
    'Side feeder',
    'STEADY',
    'Side-feed SP/actual',
  ),
  fault(
    'TSE-FEED-008',
    'Side Feeder Overfeed',
    'FEEDING',
    'Side feeder / downstream feed zone',
    'STEADY',
    'Side-feed actual/SP',
  ),
  fault(
    'TSE-FEED-009',
    'Feed-Throat Thermal / Intake Problem',
    'FEEDING',
    'Feed throat / Zone 1',
    'WARM_UP, STARTUP, STEADY',
    'Feed behavior, Z1/feed-throat temperature',
  ),
  fault(
    'TSE-PROC-001',
    'General Process Restriction',
    'PROCESS',
    'Melt path, location not yet resolved',
    'STEADY',
    'Pressure, torque, feed, RPM, recipe',
  ),
  fault(
    'TSE-PROC-002',
    'Poor / Incomplete Melting',
    'PROCESS',
    'Melting section',
    'RAMP_UP, STEADY',
    'Melt temp or indirect process indicators, zone temps, torque',
  ),
  fault(
    'TSE-PROC-003',
    'Excessive Shear / Process Overheating',
    'PROCESS',
    'High-shear mixing/kneading zones',
    'STEADY',
    'Melt temp, RPM, torque/specific energy',
  ),
  fault(
    'TSE-PROC-004',
    'Excessive Specific Energy',
    'PROCESS',
    'Whole process / mixing section',
    'STEADY',
    'Specific energy, recipe/context',
  ),
  fault(
    'TSE-PROC-005',
    'Abnormally Low Specific Energy',
    'PROCESS',
    'Whole process',
    'STEADY',
    'Specific energy, recipe/context',
  ),
  fault(
    'TSE-PROC-006',
    'Material Viscosity Increase',
    'PROCESS',
    'Melt / formulation',
    'STEADY',
    'Torque, pressure, melt temp, recipe',
  ),
  fault(
    'TSE-PROC-007',
    'Material Viscosity Decrease',
    'PROCESS',
    'Melt / formulation',
    'STEADY',
    'Torque, pressure, melt temp, recipe',
  ),
  fault(
    'TSE-PROC-008',
    'Throughput Loss',
    'PROCESS',
    'Line output',
    'STEADY',
    'Throughput expected/actual, feed, RPM',
  ),
  fault(
    'TSE-PROC-009',
    'Throughput Instability / Surging',
    'PROCESS',
    'Whole extrusion line',
    'STEADY',
    'Throughput variability, feed variability',
  ),
  fault(
    'TSE-PROC-010',
    'Process Load Too High',
    'PROCESS',
    'Whole process',
    'STEADY',
    'Torque/current/power vs context',
  ),
  fault(
    'TSE-PROC-011',
    'Process Load Too Low',
    'PROCESS',
    'Whole process',
    'STEADY',
    'Torque/current/power vs context',
  ),
  fault(
    'TSE-PROC-012',
    'Abnormal Residence / Hold-Up Suspicion',
    'PROCESS',
    'Processing section',
    'STEADY',
    'Throughput, RPM, pressure/torque trend, process history',
  ),
  fault(
    'TSE-PROC-013',
    'Material Degradation Suspicion',
    'PROCESS',
    'Melt/process',
    'STEADY',
    'Melt temp, residence indicators, quality evidence',
  ),
  fault(
    'TSE-THERM-008',
    'Zone Temperature Low',
    'THERMAL',
    'Any barrel zone',
    'WARM_UP, READY, STEADY',
    'Zone actual/SP',
  ),
  fault(
    'TSE-THERM-009',
    'Zone Temperature Oscillation / Hunting',
    'THERMAL',
    'Any barrel zone',
    'WARM_UP, READY, STEADY',
    'Zone actual/SP variability',
  ),
  fault(
    'TSE-THERM-010',
    'Slow Heating / Warm-Up Failure',
    'THERMAL',
    'Any barrel zone',
    'WARM_UP',
    'Temperature ROC vs warm-up profile, heater output',
  ),
  fault(
    'TSE-THERM-011',
    'Heater Non-Response',
    'THERMAL',
    'Heater / barrel zone',
    'WARM_UP, STEADY',
    'heater command/output, zone temp ROC',
  ),
  fault(
    'TSE-THERM-012',
    'Cooling Ineffective / Cooling Loss',
    'THERMAL',
    'Cooling system / affected zone',
    'STEADY',
    'cooling command, zone temp trend',
  ),
  fault(
    'TSE-THERM-013',
    'Excessive Cooling / Overcooling',
    'THERMAL',
    'Cooling system / affected zone',
    'STEADY',
    'zone actual/SP, cooling output',
  ),
  fault(
    'TSE-THERM-014',
    'Melt Temperature High',
    'THERMAL',
    'Melt downstream',
    'STEADY',
    'melt temp baseline, recipe/RPM/feed',
  ),
  fault(
    'TSE-THERM-015',
    'Melt Temperature Low',
    'THERMAL',
    'Melt downstream',
    'STEADY',
    'melt temp baseline',
  ),
  fault(
    'TSE-THERM-016',
    'Abnormal Zone-to-Zone Thermal Gradient',
    'THERMAL',
    'Barrel thermal profile',
    'READY, STEADY',
    'zone profile/gradients vs expected',
  ),
  fault(
    'TSE-VENT-001',
    'Vacuum Level Too Low / Cannot Reach Setpoint',
    'VENTING',
    'Vacuum vent / pump',
    'STEADY',
    'vacuum actual/SP',
  ),
  fault(
    'TSE-VENT-002',
    'Vacuum Unstable',
    'VENTING',
    'Vacuum system',
    'STEADY',
    'vacuum variability',
  ),
  fault(
    'TSE-VENT-003',
    'Vacuum Lost',
    'VENTING',
    'Vacuum system',
    'STEADY',
    'vacuum actual, pump status',
  ),
  fault(
    'TSE-VENT-004',
    'Vacuum Vent Blockage / Material Build-Up',
    'VENTING',
    'Vent port / insert',
    'STEADY',
    'vacuum behavior, pressure/load, operator/visual evidence',
  ),
  fault(
    'TSE-VENT-005',
    'Vent Flooding / Melt Carryover',
    'VENTING',
    'Atmospheric/vacuum vent',
    'STEADY',
    'vent event/operator sensor, vacuum, feed/RPM',
  ),
  fault(
    'TSE-VENT-006',
    'Excess Volatile / Moisture Load Suspicion',
    'VENTING',
    'Devolatilization section',
    'STEADY',
    'vacuum load/instability, quality/moisture evidence',
  ),
  fault(
    'TSE-VENT-007',
    'Vacuum Pump / Control Problem',
    'VENTING',
    'Vacuum pump/valves',
    'STEADY',
    'pump status, vacuum actual/SP',
  ),
  fault(
    'TSE-DOWN-001',
    'Screen Restriction / Blockage',
    'DOWNSTREAM',
    'Screen pack / screen changer',
    'STEADY',
    'pre/post pressure or pre pressure, torque, feed/RPM',
  ),
  fault(
    'TSE-DOWN-002',
    'Die Restriction / Blockage',
    'DOWNSTREAM',
    'Die',
    'STEADY',
    'die/upstream pressure, feed/RPM',
  ),
  fault(
    'TSE-DOWN-003',
    'Adapter / Transfer Restriction',
    'DOWNSTREAM',
    'Adapter / transfer channel',
    'STEADY',
    'pressure topology if available',
  ),
  fault(
    'TSE-DOWN-004',
    'High Melt Pressure - Cause Unresolved',
    'DOWNSTREAM',
    'Pressure path',
    'STEADY',
    'melt pressure, context',
  ),
  fault(
    'TSE-DOWN-005',
    'Low Melt Pressure',
    'DOWNSTREAM',
    'Discharge path',
    'STEADY',
    'melt pressure, feed/RPM',
  ),
  fault(
    'TSE-DOWN-006',
    'Pressure Pulsation / Surging',
    'DOWNSTREAM',
    'Discharge path',
    'STEADY',
    'pressure variability/oscillation',
  ),
  fault(
    'TSE-DOWN-007',
    'Screen ΔP Rising Trend',
    'DOWNSTREAM',
    'Screen pack',
    'STEADY',
    'ΔP trend',
  ),
  fault(
    'TSE-DOWN-008',
    'Pressure Loss / Leak / Open Flow Suspicion',
    'DOWNSTREAM',
    'Downstream path',
    'STEADY',
    'pressure LOW and throughput/context',
  ),
  fault(
    'TSE-LOAD-001',
    'High Torque',
    'DRIVE_LOAD',
    'Screw drive',
    'STARTUP, RAMP_UP, STEADY',
    'torque anomaly, context',
  ),
  fault(
    'TSE-LOAD-002',
    'Torque Instability / Spikes',
    'DRIVE_LOAD',
    'Screw drive',
    'STARTUP, STEADY',
    'torque variability/spikes',
  ),
  fault(
    'TSE-LOAD-003',
    'High Motor Current',
    'DRIVE_LOAD',
    'Main motor/VFD',
    'RAMP_UP, STEADY',
    'current anomaly, rated current',
  ),
  fault(
    'TSE-LOAD-004',
    'High Active Power',
    'DRIVE_LOAD',
    'Main drive',
    'STEADY',
    'power anomaly',
  ),
  fault(
    'TSE-LOAD-005',
    'Speed Command-Actual Mismatch',
    'DRIVE_LOAD',
    'VFD / screws',
    'STARTUP, RAMP_UP, STEADY',
    'speed SP/actual',
  ),
  fault(
    'TSE-LOAD-006',
    'Drive Trip / Overload Event',
    'DRIVE_LOAD',
    'VFD/motor',
    'ANY running state',
    'VFD trip code/status',
  ),
  fault(
    'TSE-LOAD-007',
    'Torque-Current Relationship Abnormal',
    'DRIVE_LOAD',
    'Motor/VFD measurement chain',
    'STEADY',
    'torque-current residual',
  ),
  fault(
    'TSE-LOAD-008',
    'Electrical Load Imbalance / Phase Issue (if available)',
    'DRIVE_LOAD',
    'Motor supply',
    'RUNNING',
    'phase current/voltage',
  ),
  fault(
    'TSE-MECH-001',
    'Motor Bearing Temperature High',
    'MECHANICAL',
    'Motor DE/NDE bearing',
    'RUNNING',
    'bearing temp baseline',
  ),
  fault(
    'TSE-MECH-002',
    'Gearbox Oil Temperature High',
    'MECHANICAL',
    'Gearbox oil',
    'RUNNING',
    'oil temp baseline',
  ),
  fault(
    'TSE-MECH-003',
    'Gearbox Bearing Temperature High',
    'MECHANICAL',
    'Gearbox bearing',
    'RUNNING',
    'bearing temp baseline',
  ),
  fault(
    'TSE-MECH-004',
    'General Motor Vibration High',
    'MECHANICAL',
    'Motor bearing housing',
    'RUNNING',
    'overall vibration',
  ),
  fault(
    'TSE-MECH-005',
    'General Gearbox Vibration High',
    'MECHANICAL',
    'Gearbox housing',
    'RUNNING',
    'overall vibration',
  ),
  fault(
    'TSE-MECH-006',
    'Mechanical Drag / Resistance Suspicion',
    'MECHANICAL',
    'Drive train / screws',
    'STEADY',
    'torque/current high with weak pressure relationship',
  ),
  fault(
    'TSE-MECH-007',
    'Lubrication Abnormality Suspicion',
    'MECHANICAL',
    'Gearbox/bearings',
    'RUNNING',
    'oil/bearing temp, vibration trend',
  ),
  fault(
    'TSE-MECH-008',
    'Coupling / Transmission Abnormality Suspicion',
    'MECHANICAL',
    'Motor-coupling-gearbox',
    'RUNNING',
    'speed/load/vibration/temp',
  ),
  fault(
    'TSE-INST-001',
    'Sensor Communication Loss',
    'INSTRUMENTATION',
    'Any source/tag',
    'ALL',
    'update/timeout',
  ),
  fault(
    'TSE-INST-002',
    'Stale / Frozen Signal',
    'INSTRUMENTATION',
    'Any analog/process signal',
    'ALL',
    'flatline + context changes',
  ),
  fault(
    'TSE-INST-003',
    'Sensor Spike / Impulsive Outlier',
    'INSTRUMENTATION',
    'Any analog sensor',
    'ALL',
    'spike detector/ROC',
  ),
  fault(
    'TSE-INST-004',
    'Sensor Drift Suspicion',
    'INSTRUMENTATION',
    'Any sensor',
    'STEADY/long term',
    'slow residual vs independent evidence',
  ),
  fault(
    'TSE-INST-005',
    'Sensor Offset / Calibration Error',
    'INSTRUMENTATION',
    'Any sensor',
    'ALL',
    'persistent bias vs reference',
  ),
  fault(
    'TSE-INST-006',
    'Scaling / Engineering Unit Error',
    'INSTRUMENTATION',
    'Analog/tag mapping',
    'ALL',
    'range/plausibility/cross-sensor',
  ),
  fault(
    'TSE-INST-007',
    'Tag Mapping / Channel Mismatch',
    'INSTRUMENTATION',
    'PLC/ULTRON mapping',
    'ALL',
    'cross-location contradiction',
  ),
  fault(
    'TSE-INST-008',
    'RTD / Temperature Sensor Open-Short',
    'INSTRUMENTATION',
    'Temperature channel',
    'ALL',
    'instrument diagnostics/out-of-range',
  ),
  fault(
    'TSE-INST-009',
    'Pressure Transmitter / Port Problem',
    'INSTRUMENTATION',
    'Pressure sensor/tap',
    'STEADY',
    'pressure plausibility/flatline/drift',
  ),
  fault(
    'TSE-INST-010',
    'RPM Pulse Dropout / Speed Sensor Fault',
    'INSTRUMENTATION',
    'Speed sensor',
    'RUNNING',
    'pulse integrity vs VFD/run',
  ),
  fault(
    'TSE-INST-011',
    'Vibration Sensor Disconnected / Saturated',
    'INSTRUMENTATION',
    'Vibration channel',
    'RUNNING',
    'sensor health/saturation',
  ),
  fault(
    'TSE-INST-012',
    'Timestamp / Time Synchronization Error',
    'INSTRUMENTATION',
    'Data pipeline',
    'ALL',
    'timestamp monotonicity/offset',
  ),
  fault(
    'TSE-INST-013',
    'Data Dropout / Excess Missing Samples',
    'INSTRUMENTATION',
    'Data pipeline',
    'ALL',
    'missing %',
  ),
  fault(
    'TSE-INST-014',
    'Data Quality Conflict / Contradictory Measurements',
    'INSTRUMENTATION',
    'Any correlated measurement set',
    'ALL',
    'cross-sensor residual',
  ),
  fault(
    'TSE-CTRL-001',
    'Temperature Loop Oscillation',
    'CONTROL',
    'Zone temperature loop',
    'WARM_UP, STEADY',
    'actual/SP/output oscillation',
  ),
  fault(
    'TSE-CTRL-002',
    'Temperature Setpoint Tracking Failure',
    'CONTROL',
    'Zone loop',
    'READY, STEADY',
    'actual-SP error',
  ),
  fault(
    'TSE-CTRL-003',
    'Heater Command Without Response',
    'CONTROL',
    'Heater output',
    'WARM_UP, STEADY',
    'command + temp ROC',
  ),
  fault(
    'TSE-CTRL-004',
    'Cooling Command Without Response',
    'CONTROL',
    'Cooling output',
    'STEADY',
    'command + temp trend',
  ),
  fault(
    'TSE-CTRL-005',
    'Control Output Saturated',
    'CONTROL',
    'Any loop',
    'STEADY',
    'output near 0/100% persistently',
  ),
  fault(
    'TSE-CTRL-006',
    'Feeder Control Hunting',
    'CONTROL',
    'Feeder loop',
    'STEADY',
    'feed SP/actual/output oscillation',
  ),
  fault(
    'TSE-CTRL-007',
    'Speed Control Tracking Failure',
    'CONTROL',
    'VFD speed loop',
    'RUNNING',
    'speed SP/actual',
  ),
  fault(
    'TSE-CTRL-008',
    'Mode / Configuration Mismatch',
    'CONTROL',
    'PLC/ULTRON configuration',
    'ALL',
    'mode/config vs actual signals',
  ),
  fault(
    'TSE-QUAL-001',
    'Poor Dispersion / Mixing Suspicion',
    'QUALITY',
    'Mixing section / product',
    'STEADY',
    'quality result + process features',
  ),
  fault(
    'TSE-QUAL-002',
    'Bubbles / Off-Gassing / Residual Volatiles',
    'QUALITY',
    'Product / venting',
    'STEADY',
    'quality/visual + vacuum/moisture',
  ),
  fault(
    'TSE-QUAL-003',
    'Gels / Contamination Suspicion',
    'QUALITY',
    'Product / process',
    'STEADY',
    'quality inspection',
  ),
  fault(
    'TSE-QUAL-004',
    'Color / Degradation Shift Suspicion',
    'QUALITY',
    'Product',
    'STEADY',
    'color/lab + melt temp/residence',
  ),
  fault(
    'TSE-QUAL-005',
    'Product Property Deviation',
    'QUALITY',
    'Product/QMS',
    'STEADY',
    'lab/QMS result + context',
  ),
  fault(
    'TSE-QUAL-006',
    'Output Geometry / Strand Instability',
    'QUALITY',
    'Die/downstream',
    'STEADY',
    'output/vision/operator + pressure/throughput',
  ),
];

/** DOC-04 §7, the anomaly-to-fault bridge. */
export const DOC04_PATTERNS: readonly PatternDefinition[] = [
  pattern(
    'P-001',
    'Increased Process Resistance',
    'Pressure HIGH + Torque HIGH + Feed STABLE + RPM STABLE',
    'Restriction / high viscosity / low melt temp candidates',
  ),
  pattern(
    'P-002',
    'Localized Screen Restriction',
    'Pre-screen pressure/ΔP HIGH + context stable',
    'Screen restriction candidate',
  ),
  pattern(
    'P-003',
    'Downstream / Die Restriction',
    'Both upstream/downstream pressure high; screen ΔP not dominant',
    'Die/adapter/downstream candidate',
  ),
  pattern(
    'P-004',
    'Feed-Driven Instability',
    'Feed OSCILLATING; torque/pressure follow with lag; RPM stable',
    'Feeder/control/material-flow candidates',
  ),
  pattern(
    'P-005',
    'Feed Starvation',
    'Feed actual LOW vs SP + torque/current/throughput fall',
    'Hopper/feeder/feed-throat candidates',
  ),
  pattern(
    'P-006',
    'High-Viscosity Behaviour',
    'Torque/pressure HIGH + melt temp LOW or recipe/material changed',
    'Viscosity/material/thermal candidate',
  ),
  pattern(
    'P-007',
    'Thermal Control Instability',
    'Zone temp oscillates at unchanged SP; output oscillates/saturates',
    'Heater/cooling/control/sensor candidate',
  ),
  pattern(
    'P-008',
    'Cooling Ineffective',
    'Temp rising + cooling demand high + stable feed/RPM',
    'Cooling utility/valve/flow candidate',
  ),
  pattern(
    'P-009',
    'Vacuum / Degassing Problem',
    'Vacuum poor + process context valid',
    'Leak/pump/blockage/flooding/volatile load candidate',
  ),
  pattern(
    'P-010',
    'Mechanical Drag',
    'Torque/current high + weak pressure evidence + gearbox/motor thermal/vibration evidence',
    'Drive-train/mechanical candidate',
  ),
  pattern(
    'P-011',
    'Instrumentation Suspicion',
    'One signal abnormal + related signals physically unchanged/contradictory',
    'Sensor/scaling/tag/port issue',
  ),
  pattern(
    'P-012',
    'Unknown Abnormal Pattern',
    'Strong multi-signal anomaly but no known pattern fits',
    'FAULT_UNKNOWN; engineering review',
  ),
];

const BY_ID = new Map(DOC04_FAULTS.map((entry) => [entry.faultId, entry]));
const PATTERN_BY_ID = new Map(DOC04_PATTERNS.map((entry) => [entry.patternId, entry]));

export function faultById(faultId: string): FaultDefinition | undefined {
  return BY_ID.get(faultId);
}

export function patternById(patternId: string): PatternDefinition | undefined {
  return PATTERN_BY_ID.get(patternId);
}

export function faultsByFamily(family: FaultFamily): FaultDefinition[] {
  return DOC04_FAULTS.filter((entry) => entry.family === family);
}

/**
 * Faults whose rule is meaningful in a given operating state.
 *
 * The document writes applicable states as prose — "STARTUP, RAMP_UP, STEADY",
 * "ALL producing states" — so this matches on the words rather than on a parsed
 * enum. A fault that names no state at all is treated as applicable, because
 * omitting the column is not the same as excluding every state.
 */
export function faultsForState(stateName: string): FaultDefinition[] {
  const wanted = stateName.toUpperCase();
  const producing = ['STARTUP', 'RAMP_UP', 'STEADY_PRODUCTION', 'STEADY'].includes(wanted);
  return DOC04_FAULTS.filter((entry) => {
    const states = entry.applicableStates.toUpperCase();
    if (states.trim() === '' || states.includes('ALL STATES')) return true;
    if (states.includes('ALL PRODUCING') && producing) return true;
    return states.includes(wanted);
  });
}

/**
 * Which faults a deployment can actually evaluate.
 *
 * `hasEvidence` is asked per fault so a caller can answer it against whatever
 * its own signal mapping looks like. The unevaluable list is the honest answer
 * to "why is the diagnosis engine quiet" — usually because most of the ninety
 * rules have no data behind them.
 */
export function faultsEvaluableWith(hasEvidence: (entry: FaultDefinition) => boolean): {
  evaluable: FaultDefinition[];
  unevaluable: FaultDefinition[];
} {
  const evaluable: FaultDefinition[] = [];
  const unevaluable: FaultDefinition[] = [];
  for (const entry of DOC04_FAULTS) (hasEvidence(entry) ? evaluable : unevaluable).push(entry);
  return { evaluable, unevaluable };
}

/**
 * Faults that are instrumentation problems rather than machine problems.
 *
 * §17's instrumentation-first rule needs these separable: when evidence is
 * inconsistent, this family is evaluated before any physical diagnosis is
 * allowed to stand.
 */
export function instrumentationFaults(): FaultDefinition[] {
  return faultsByFamily('INSTRUMENTATION');
}
