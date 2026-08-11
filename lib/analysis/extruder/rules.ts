// Fault-specific evidence rules.
//
// Ported from the digital twin's `diagnostics/rules.py`. Each rule turns
// extracted features into evidence for one fault hypothesis. Every numeric
// boundary is fetched from the threshold register by `thresholdId` — there is
// deliberately not one inline decision constant in this module.
//
// Sensor-location semantics
// -------------------------
// V1 is mounted on the motor housing and V2 on the gearbox housing, so the
// motor and gearbox mechanical hypotheses are separated by *which channel
// carries the pattern*, not by different limits on the same channel.
//
// E1 is a one-pulse-per-revolution proximity sensor on the motor rear shaft, so
// E1 is motor shaft speed and the order reference for both channels. Screw
// speed is derived through the controlled gearbox reduction ratio.

import {
  EvidenceStrength,
  PRIMARY_CONTRADICTION,
  type EvidenceStrengthValue,
  type FaultEvidence,
} from './evidence';
import { AVAILABLE, type FeatureSet } from './features';
import { getThreshold, satisfiedBy, type ThresholdId } from './registers';
import { NON_PRODUCTION_STATES, type StateInference } from './stateInference';

const PRIMARY = EvidenceStrength.PRIMARY;
const SUPPORTING = EvidenceStrength.SUPPORTING;
const WEAK = EvidenceStrength.WEAK;
const CONTRA = EvidenceStrength.CONTRADICTED;

export type RuleContext = {
  features: FeatureSet;
  state: StateInference;
};

function scalar(context: RuleContext, name: string): number | null {
  const value = context.features.scalar[name];
  return value === undefined || !Number.isFinite(value) ? null : value;
}

function temporal(context: RuleContext, name: string): number | null {
  const value = context.features.temporal[name];
  return value === undefined || !Number.isFinite(value) ? null : value;
}

function telemetry(context: RuleContext, name: string): number | null {
  const value = context.features.telemetry[name];
  return value === undefined || !Number.isFinite(value) ? null : value;
}

function channelValue(context: RuleContext, tag: 'V1' | 'V2', name: string): number | null {
  const value = context.features.vibration[tag]?.[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function waveformAvailable(context: RuleContext, tag: 'V1' | 'V2'): boolean {
  return context.features.availability[`vibration.${tag}`] === AVAILABLE;
}

function inProduction(context: RuleContext): boolean {
  return !NON_PRODUCTION_STATES.has(context.state.state);
}

/** Emit evidence when `observed` crosses the registered threshold. */
function evidence(
  faultId: string,
  sensor: string,
  thresholdId: ThresholdId,
  observed: number | null,
  strength: EvidenceStrengthValue,
  description: string,
): FaultEvidence | null {
  if (observed === null || !satisfiedBy(thresholdId, observed)) return null;
  const limit = getThreshold(thresholdId);
  return {
    faultId,
    sensor,
    feature: limit.feature,
    observedValue: observed,
    expectedDirection: `${limit.operator} ${limit.value} ${limit.unit}`,
    strength,
    source: limit.sourceStatus,
    thresholdId,
    description,
  };
}

function contradiction(
  faultId: string,
  sensor: string,
  feature: string,
  observed: number | null,
  description: string,
  primary = false,
): FaultEvidence {
  return {
    faultId,
    sensor,
    feature,
    observedValue: observed,
    expectedDirection: primary ? PRIMARY_CONTRADICTION : 'INCONSISTENT_WITH_MECHANISM',
    strength: CONTRA,
    source: 'CROSS_FAULT_CONTRADICTION_CHECK',
    description,
  };
}

// --------------------------------------------------------------------------------------
// Electrical / drive
// --------------------------------------------------------------------------------------

/** F-MOTOR-LOAD. The primary observable is drive current against the controlled reference. */
function motorOverload(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  const ratio = scalar(context, 'current_ratio_to_baseline');
  if (ratio === null) return out;
  const hit = evidence('F-MOTOR-LOAD', 'PM1.current', 'TH-MOTOR-LOAD-CURRENT', ratio, PRIMARY,
    'Drive current reached the controlled overload warning signature.');
  if (hit) out.push(hit);
  else if (ratio <= 1) {
    out.push(contradiction('F-MOTOR-LOAD', 'PM1.current', 'current_ratio_to_baseline', ratio,
      'Drive current is at or below the controlled reference, so the drive is not overloaded.', true));
  }
  const support = evidence('F-MOTOR-LOAD', 'T4', 'TH-TEMP-SUPPORT', scalar(context, 'T4.temperature_residual_c'),
    SUPPORTING, 'Motor temperature is elevated above its declared baseline.');
  if (support) out.push(support);
  return out;
}

/**
 * F-MOTOR-EFF. Efficiency needs input AND output power; mechanical output is not
 * measured on this machine, so only weak corroboration is ever emitted and this
 * hypothesis can never become a unique primary diagnosis.
 */
function driveEfficiency(context: RuleContext): FaultEvidence[] {
  const ratio = scalar(context, 'current_ratio_to_baseline');
  const residual = scalar(context, 'T4.temperature_residual_c');
  if (ratio === null || ratio <= 1 || residual === null || residual <= 0) return [];
  return [
    {
      faultId: 'F-MOTOR-EFF',
      sensor: 'PM1.current',
      feature: 'current_ratio_to_baseline',
      observedValue: ratio,
      expectedDirection: 'increased input current at unchanged speed with elevated motor temperature',
      strength: WEAK,
      source: 'ENGINEERING_DEVELOPMENT',
      description: 'Consistent with reduced drive efficiency, but mechanical output power is not measured.',
    },
  ];
}

// --------------------------------------------------------------------------------------
// Process
// --------------------------------------------------------------------------------------

/**
 * F-SCREEN and F-DIE. P1 sits upstream of both the screen pack and the die, so a
 * single upstream transducer cannot say *where* the restriction is. Both
 * hypotheses receive the same primary evidence and the ambiguity is reported
 * rather than resolved by invention.
 */
function restriction(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  if (!inProduction(context)) return out;
  const ratio = scalar(context, 'pressure_ratio_to_baseline');
  if (ratio === null) return out;
  // Detection uses the LOWEST controlled restriction signature. Using the two
  // different signature levels to choose between screen and die would be a false
  // isolation: at a pressure between them a screen blockage would be reported as
  // a die fault.
  const escalated = satisfiedBy('TH-SCREEN-PRESSURE', ratio);
  for (const [faultId, label] of [['F-SCREEN', 'screen'], ['F-DIE', 'die']] as const) {
    const hit = evidence(faultId, 'P1', 'TH-DIE-PRESSURE', ratio, PRIMARY,
      `Melt pressure reached the controlled restriction warning signature upstream of both the screen pack and the ${label}` +
        (escalated ? ', and has also passed the higher screen-pressure signature.' : '.'));
    if (hit) {
      out.push(hit);
      const support = evidence(faultId, 'PM1.current', 'TH-CURRENT-ELEVATED',
        scalar(context, 'current_ratio_to_baseline'), SUPPORTING,
        'Drive load raised consistently with increased flow resistance.');
      if (support) out.push(support);
      const zone = scalar(context, 'T3.zone_setpoint_residual_c');
      if (zone !== null && zone > 0) {
        out.push({
          faultId,
          sensor: 'T3',
          feature: 'T3.zone_setpoint_residual_c',
          observedValue: zone,
          expectedDirection: '> 0 degC',
          strength: WEAK,
          source: 'ENGINEERING_DEVELOPMENT',
          description: 'Metering-zone temperature above setpoint, consistent with increased shear.',
        });
      }
    } else if (ratio <= 1) {
      out.push(contradiction(faultId, 'P1', 'pressure_ratio_to_baseline', ratio,
        'Melt pressure is not elevated, so flow resistance has not increased.', true));
    }
  }
  return out;
}

/** F-STARVE. Hopper level is the most direct observable of feed availability. */
function feedStarvation(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  if (!inProduction(context)) return out;
  const level = scalar(context, 'level_percent');
  const hit = evidence('F-STARVE', 'L1', 'TH-FEED-LEVEL-LOW', level, PRIMARY,
    'Hopper level is at or below the low-level indication.');
  if (hit) out.push(hit);
  const supports: [string, ThresholdId, string, string][] = [
    ['P1', 'TH-PRESSURE-LOW', 'pressure_ratio_to_baseline',
      'Melt pressure fell below the controlled reference, consistent with reduced fill.'],
    ['PM1.current', 'TH-CURRENT-LOW', 'current_ratio_to_baseline',
      'Drive load fell below the controlled reference, consistent with reduced fill.'],
  ];
  for (const [sensor, thresholdId, feature, text] of supports) {
    const support = evidence('F-STARVE', sensor, thresholdId, scalar(context, feature), SUPPORTING, text);
    if (support) out.push(support);
  }
  if (level !== null && level >= getThreshold('TH-FEED-LEVEL-HIGH').value) {
    out.push(contradiction('F-STARVE', 'L1', 'level_percent', level,
      'The hopper is full, so feed availability is not the limiting factor.', true));
  }
  return out;
}

/**
 * F-OVERFEED. Elevated pressure and load also occur for a downstream restriction.
 * The separating observable is hopper depletion rate, which needs history — so
 * without history this hypothesis stays supporting-only and lands in an
 * ambiguity set with the restrictions.
 */
function overfeed(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  if (!inProduction(context)) return out;
  const slope = temporal(context, 'L1.slope_per_sample');
  const pressure = scalar(context, 'pressure_ratio_to_baseline');
  const depletion = evidence('F-OVERFEED', 'L1', 'TH-LEVEL-DEPLETION', slope, PRIMARY,
    'The hopper is depleting rapidly while melt pressure is elevated.');
  if (depletion && pressure !== null && pressure > 1) out.push(depletion);
  const supports: [string, ThresholdId, string, string][] = [
    ['PM1.current', 'TH-CURRENT-ELEVATED', 'current_ratio_to_baseline',
      'Drive load elevated, consistent with increased material throughput.'],
    ['L1', 'TH-FEED-LEVEL-HIGH', 'level_percent',
      'Hopper level high, consistent with continuous over-supply.'],
  ];
  for (const [sensor, thresholdId, feature, text] of supports) {
    const support = evidence('F-OVERFEED', sensor, thresholdId, scalar(context, feature), SUPPORTING, text);
    if (support) out.push(support);
  }
  if (pressure !== null && pressure <= 1) {
    out.push(contradiction('F-OVERFEED', 'P1', 'pressure_ratio_to_baseline', pressure,
      'Melt pressure is not elevated, so the machine is not over-supplied.', true));
  }
  return out;
}

/**
 * F-MAT-VISC. A viscosity change moves pressure and load exactly like a
 * restriction. No material property is measured on this machine, so this
 * hypothesis is reported inside the correct ambiguity set rather than resolved.
 */
function materialVariation(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  if (!inProduction(context)) return out;
  const pressure = scalar(context, 'pressure_ratio_to_baseline');
  const current = scalar(context, 'current_ratio_to_baseline');
  if (pressure === null) return out;

  // A material property change does not empty the hopper. When a pressure and
  // load reduction is accompanied by a demonstrably low feed level, the rheology
  // hypothesis does not explain the observation and is refuted.
  const level = scalar(context, 'level_percent');
  if (level !== null && satisfiedBy('TH-FEED-LEVEL-LOW', level)) {
    out.push(contradiction('F-MAT-VISC', 'L1', 'level_percent', level,
      'Hopper level is at the low-level indication, which a material property change does not cause.', true));
    return out;
  }
  const rising = evidence('F-MAT-VISC', 'P1', 'TH-DIE-PRESSURE', pressure, PRIMARY,
    'Melt pressure and drive load raised together at unchanged commanded speed, which an increase in melt viscosity also produces.');
  const falling = evidence('F-MAT-VISC', 'P1', 'TH-PRESSURE-LOW', pressure, PRIMARY,
    'Melt pressure and drive load reduced together at unchanged commanded speed, which a reduction in melt viscosity also produces.');
  if (rising && current !== null && current > 1) out.push(rising);
  else if (falling && current !== null && current < 1) out.push(falling);
  else if (pressure >= 0.95 && pressure <= 1.05) {
    out.push(contradiction('F-MAT-VISC', 'P1', 'pressure_ratio_to_baseline', pressure,
      'Melt pressure is at its reference, so the material rheology has not shifted.', true));
  }
  return out;
}

/**
 * F-WEAR. Increased screw/barrel clearance raises leakage flow, lowering
 * developed pressure. A viscosity reduction produces the same reading, so the
 * pair stays ambiguous. No throughput measurement and no wear calibration
 * exist, so severity is not assessed.
 */
function screwBarrelWear(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  if (!inProduction(context)) return out;
  const pressure = scalar(context, 'pressure_ratio_to_baseline');
  const level = scalar(context, 'level_percent');
  if (pressure === null) return out;
  const feedAdequate = level === null || level > getThreshold('TH-FEED-LEVEL-LOW').value;
  const hit = evidence('F-WEAR', 'P1', 'TH-PRESSURE-LOW', pressure, PRIMARY,
    'Developed melt pressure is below the controlled reference while feed remains available.');
  if (hit && feedAdequate) {
    out.push(hit);
    const speed = scalar(context, 'speed_ratio_to_baseline');
    if (speed !== null && speed >= 0.95 && speed <= 1.05) {
      out.push({
        faultId: 'F-WEAR',
        sensor: 'E1',
        feature: 'speed_ratio_to_baseline',
        observedValue: speed,
        expectedDirection: 'unchanged commanded speed',
        strength: SUPPORTING,
        source: 'ENGINEERING_DEVELOPMENT',
        description: 'Pressure loss occurred without a speed reduction.',
      });
    }
  } else if (pressure >= 1) {
    out.push(contradiction('F-WEAR', 'P1', 'pressure_ratio_to_baseline', pressure,
      'Developed pressure is not reduced, so leakage flow has not increased.', true));
  }
  return out;
}

// --------------------------------------------------------------------------------------
// Thermal
// --------------------------------------------------------------------------------------

const ZONES = ['T1', 'T2', 'T3'] as const;

/**
 * F-HEATER-FAIL / F-HEATER-PARTIAL / F-HEATER-ON, evaluated per zone.
 *
 * A heater acts on one zone, so evidence is zone-local. Complete failure and
 * partial degradation differ only in trend: a failed heater keeps falling, a
 * degraded heater settles lower. Without history both remain candidates, which
 * is a family-level answer rather than an invented sub-type.
 */
function heaterFaults(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  if (!inProduction(context)) return out;
  const below = scalar(context, 'zones_below_setpoint_count') ?? 0;
  const above = scalar(context, 'zones_above_setpoint_count') ?? 0;
  const measured = scalar(context, 'measured_zone_count') ?? 0;

  for (const zone of ZONES) {
    const residual = scalar(context, `${zone}.zone_setpoint_residual_c`);
    if (residual === null) continue;
    const slope = temporal(context, `${zone}.slope_per_sample`);

    const drop = evidence('F-HEATER-FAIL', zone, 'TH-HEATER-DROP', residual, PRIMARY,
      `${zone} met the controlled heater temperature-drop signature.`);
    if (drop) {
      const falling = slope === null ? null : satisfiedBy('TH-HEATER-FALLING', slope);
      if (falling === true) {
        out.push(drop);
        out.push({
          faultId: 'F-HEATER-FAIL',
          sensor: zone,
          feature: `${zone}.slope_per_sample`,
          observedValue: slope,
          expectedDirection: 'continuing downward trend',
          strength: SUPPORTING,
          source: 'ENGINEERING_DEVELOPMENT',
          description: `${zone} is still falling, consistent with total loss of delivered heater power.`,
        });
        out.push(contradiction('F-HEATER-PARTIAL', zone, `${zone}.slope_per_sample`, slope,
          `${zone} has not stabilised, so delivered power is lost rather than reduced.`));
      } else if (falling === false) {
        out.push({
          faultId: 'F-HEATER-PARTIAL',
          sensor: zone,
          feature: `${zone}.zone_setpoint_residual_c`,
          observedValue: residual,
          expectedDirection: drop.expectedDirection,
          strength: PRIMARY,
          source: getThreshold('TH-HEATER-DROP').sourceStatus,
          thresholdId: 'TH-HEATER-DROP',
          description: `${zone} settled below setpoint, consistent with reduced heater effectiveness.`,
        });
        out.push({
          faultId: 'F-HEATER-PARTIAL',
          sensor: zone,
          feature: `${zone}.slope_per_sample`,
          observedValue: slope,
          expectedDirection: 'stabilised below setpoint',
          strength: SUPPORTING,
          source: 'ENGINEERING_DEVELOPMENT',
          description: `${zone} is no longer falling.`,
        });
        out.push(contradiction('F-HEATER-FAIL', zone, `${zone}.slope_per_sample`, slope,
          `${zone} has stabilised, so heater power is reduced rather than lost.`));
      } else {
        // No trend information: report the family without inventing a sub-type.
        out.push(drop);
        out.push({
          faultId: 'F-HEATER-PARTIAL',
          sensor: zone,
          feature: `${zone}.zone_setpoint_residual_c`,
          observedValue: residual,
          expectedDirection: drop.expectedDirection,
          strength: PRIMARY,
          source: getThreshold('TH-HEATER-DROP').sourceStatus,
          thresholdId: 'TH-HEATER-DROP',
          description: `${zone} is below setpoint; trend history is required to separate total loss from reduced effectiveness.`,
        });
      }
    }

    // Stuck-on: a heater drives one zone. Several zones above setpoint is a
    // cooling problem, so the single-zone condition is required here.
    if (above > 0 && above < Math.max(measured, 1) && residual > 0) {
      const stuck = evidence('F-HEATER-ON', zone, 'TH-ZONE-OVERTEMP', residual, PRIMARY,
        `${zone} is above setpoint while the remaining zones are controlled.`);
      if (stuck) out.push(stuck);
    }
  }

  if (measured > 0 && below === 0) {
    for (const faultId of ['F-HEATER-FAIL', 'F-HEATER-PARTIAL']) {
      out.push(contradiction(faultId, 'T1|T2|T3', 'zones_below_setpoint_count', below,
        'No zone is below setpoint, so no heater is under-delivering.', true));
    }
  }
  return out;
}

/**
 * F-COOL-DEG / F-COOL-LOSS. The jacket acts on the whole barrel, so evidence is
 * cross-zone. Degradation and complete loss differ only in magnitude and no
 * cooling capacity calibration exists, so the two are reported as a family.
 */
function coolingFaults(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  if (!inProduction(context)) return out;
  const above = scalar(context, 'zones_above_setpoint_count');
  if (above === null) return out;
  for (const faultId of ['F-COOL-DEG', 'F-COOL-LOSS']) {
    const hit = evidence(faultId, 'T1|T2|T3', 'TH-COOLING-MULTIZONE', above, PRIMARY,
      'Several barrel zones are above setpoint together, consistent with reduced heat removal.');
    if (hit) {
      out.push(hit);
      const spread = scalar(context, 'zone_residual_spread_c');
      if (spread !== null) {
        out.push({
          faultId,
          sensor: 'T1|T2|T3',
          feature: 'zone_residual_spread_c',
          observedValue: spread,
          expectedDirection: 'uniform multi-zone elevation',
          strength: SUPPORTING,
          source: 'ENGINEERING_DEVELOPMENT',
          description: 'Elevation is distributed across zones rather than confined to one heater.',
        });
      }
    } else {
      out.push(contradiction(faultId, 'T1|T2|T3', 'zones_above_setpoint_count', above,
        'Barrel zones are not jointly above setpoint, so heat removal is adequate.', true));
    }
  }
  return out;
}

// --------------------------------------------------------------------------------------
// Mechanical (vibration)
// --------------------------------------------------------------------------------------

/**
 * Per-channel mechanical configuration.
 *
 * `amplitudeThreshold`    velocity-domain (mm/s RMS) warning signature. The
 *                         operator-visible amplitude and the right severity
 *                         domain for imbalance, misalignment and looseness.
 * `accelerationThreshold` acceleration-domain (g RMS) warning signature.
 *                         Rolling-element and gear-mesh damage puts its energy
 *                         in the kHz structural band, where velocity
 *                         integration divides by frequency and suppresses it by
 *                         two orders of magnitude. A velocity-only gate would be
 *                         blind to exactly the faults the accelerometers were
 *                         installed to see.
 */
const MECHANICAL_CHANNELS: Record<'V1' | 'V2', {
  bearing: string;
  temperature: 'T4' | 'T5';
  amplitudeThreshold: ThresholdId;
  accelerationThreshold: ThresholdId;
  location: string;
}> = {
  V1: {
    bearing: 'F-MOTOR-BRG',
    temperature: 'T4',
    amplitudeThreshold: 'TH-BEARING-VIB',
    accelerationThreshold: 'TH-BEARING-ACC-RMS',
    location: 'motor',
  },
  V2: {
    bearing: 'F-GBX-BRG',
    temperature: 'T5',
    amplitudeThreshold: 'TH-GEARBOX-VIB',
    accelerationThreshold: 'TH-GEARBOX-ACC-RMS',
    location: 'gearbox',
  },
};

/**
 * Whether either vibration amplitude domain reached its controlled warning
 * signature. Both are checked because the two domains answer the question for
 * different fault mechanisms and neither alone covers the installed package.
 */
function amplitudeSignatureCrossed(context: RuleContext, tag: 'V1' | 'V2'): boolean {
  const spec = MECHANICAL_CHANNELS[tag];
  return (
    satisfiedBy(spec.amplitudeThreshold, channelValue(context, tag, 'amplitude_ratio_to_baseline')) ||
    satisfiedBy(spec.accelerationThreshold, channelValue(context, tag, 'acceleration_rms_ratio_to_baseline'))
  );
}

function bearingRule(context: RuleContext, tag: 'V1' | 'V2'): FaultEvidence[] {
  const spec = MECHANICAL_CHANNELS[tag];
  const out: FaultEvidence[] = [];
  const spread = channelValue(context, tag, 'spread_non_synchronous_fraction');
  const hit = evidence(spec.bearing, tag, 'TH-VIB-NONSYNC', spread, PRIMARY,
    `${tag} carries broadband non-synchronous energy at the ${spec.location}, which is not an integer shaft order and not a single mesh order.`);
  if (!hit) {
    if (spread !== null) {
      out.push(contradiction(spec.bearing, tag, 'spread_non_synchronous_fraction', spread,
        `${tag} energy follows the shaft order structure, so it is not a rolling-element defect.`, true));
    }
    return out;
  }
  out.push(hit);
  const structural: [ThresholdId, string, string][] = [
    ['TH-VIB-HF-BAND', 'high_frequency_energy_fraction', 'The high-frequency structural band carries most of the energy.'],
    ['TH-VIB-CREST', 'crest_factor', 'The waveform is impulsive rather than sinusoidal.'],
    ['TH-VIB-ENVELOPE-KURT', 'envelope_kurtosis', 'The envelope is strongly modulated by repetitive impacts.'],
  ];
  for (const [thresholdId, feature, text] of structural) {
    const support = evidence(spec.bearing, tag, thresholdId, channelValue(context, tag, feature), SUPPORTING, text);
    if (support) out.push(support);
  }
  // Rolling-element severity is an acceleration-domain observation; the velocity
  // scalar is reported too when it also crosses, but it is not the primary
  // amplitude for this mechanism.
  const amplitudes: [ThresholdId, string, string][] = [
    [spec.accelerationThreshold, 'acceleration_rms_ratio_to_baseline',
      'Broadband acceleration RMS reached the controlled warning signature above the declared baseline.'],
    [spec.amplitudeThreshold, 'amplitude_ratio_to_baseline',
      'Vibration velocity RMS reached the controlled warning signature above the declared baseline.'],
  ];
  for (const [thresholdId, feature, text] of amplitudes) {
    const amplitude = evidence(spec.bearing, tag, thresholdId, channelValue(context, tag, feature), SUPPORTING, text);
    if (amplitude) out.push(amplitude);
  }
  const temperatureSupport = evidence(spec.bearing, spec.temperature, 'TH-TEMP-SUPPORT',
    scalar(context, `${spec.temperature}.temperature_residual_c`), SUPPORTING,
    `${spec.location[0].toUpperCase()}${spec.location.slice(1)} temperature is elevated above its declared baseline.`);
  if (temperatureSupport) out.push(temperatureSupport);
  return out;
}

/** F-GEAR, gearbox channel only. The exact mesh order REQUIRES_OEM_GEAR_TOOTH_COUNT. */
function gearRule(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  const order = channelValue(context, 'V2', 'dominant_high_order');
  const concentration = channelValue(context, 'V2', 'dominant_high_order_energy_fraction');
  const orderHit = evidence('F-GEAR', 'V2', 'TH-VIB-MESH-ORDER', order, PRIMARY,
    'A dominant high integer shaft order is present on the gearbox channel.');
  const concentrationHit = evidence('F-GEAR', 'V2', 'TH-VIB-MESH-CONCENTRATION', concentration, PRIMARY,
    'Gearbox energy is concentrated at one integer order rather than spread.');
  if (orderHit && concentrationHit) {
    out.push(orderHit, concentrationHit);
    const sideband = evidence('F-GEAR', 'V2', 'TH-VIB-SIDEBAND', channelValue(context, 'V2', 'sideband_to_carrier_ratio'),
      SUPPORTING, 'Shaft-rate sidebands surround the mesh component.');
    if (sideband) out.push(sideband);
    const amplitudes: [ThresholdId, string, string][] = [
      ['TH-GEARBOX-ACC-RMS', 'acceleration_rms_ratio_to_baseline',
        'Gearbox acceleration RMS reached the controlled warning signature above the declared baseline.'],
      ['TH-GEARBOX-VIB', 'amplitude_ratio_to_baseline',
        'Gearbox vibration velocity RMS reached the controlled warning signature above the declared baseline.'],
    ];
    for (const [thresholdId, feature, text] of amplitudes) {
      const amplitude = evidence('F-GEAR', 'V2', thresholdId, channelValue(context, 'V2', feature), SUPPORTING, text);
      if (amplitude) out.push(amplitude);
    }
    const temperatureSupport = evidence('F-GEAR', 'T5', 'TH-TEMP-SUPPORT', scalar(context, 'T5.temperature_residual_c'),
      SUPPORTING, 'Gearbox temperature is elevated above its declared baseline.');
    if (temperatureSupport) out.push(temperatureSupport);
  } else if (concentration !== null) {
    out.push(contradiction('F-GEAR', 'V2', 'dominant_high_order_energy_fraction', concentration,
      'Gearbox energy is not concentrated at a mesh-like integer order.', true));
  }
  return out;
}

/** F-IMBALANCE / F-MISALIGN / F-LOOSENESS from synchronous order structure. */
function rotatingRules(context: RuleContext, tag: 'V1' | 'V2'): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  const oneX = channelValue(context, tag, 'order_1x_fraction');
  const twoXRatio = channelValue(context, tag, 'order_2x_to_1x_ratio');
  const harmonics = channelValue(context, tag, 'significant_harmonic_count');
  const subharmonic = channelValue(context, tag, 'subharmonic_to_1x_ratio');
  const harmonicRich = satisfiedBy('TH-VIB-HARMONIC-COUNT', harmonics);
  const twoXHigh = satisfiedBy('TH-VIB-2X-RATIO', twoXRatio);

  const imbalance = evidence('F-IMBALANCE', tag, 'TH-VIB-1X-DOMINANT', oneX, PRIMARY,
    'The first shaft order dominates the spectrum.');
  if (imbalance && !twoXHigh) {
    out.push(imbalance);
    if (harmonicRich) {
      out.push(contradiction('F-IMBALANCE', tag, 'significant_harmonic_count', harmonics,
        'Harmonic-rich content prevents unique isolation as pure imbalance.', true));
    }
  } else if (oneX !== null) {
    if (twoXHigh) {
      out.push(contradiction('F-IMBALANCE', tag, 'order_2x_to_1x_ratio', twoXRatio,
        'Strong second-order content is not characteristic of pure imbalance.', true));
    } else if (harmonicRich) {
      out.push(contradiction('F-IMBALANCE', tag, 'significant_harmonic_count', harmonics,
        'A rich harmonic series is not characteristic of pure imbalance.', true));
    } else {
      out.push(contradiction('F-IMBALANCE', tag, 'order_1x_fraction', oneX,
        'First-order energy does not dominate the spectrum.', true));
    }
  }

  const misalignment = evidence('F-MISALIGN', tag, 'TH-VIB-2X-RATIO', twoXRatio, PRIMARY,
    'The second shaft order is raised relative to the first.');
  if (misalignment && !harmonicRich) {
    out.push(misalignment);
    if (oneX !== null) {
      out.push({
        faultId: 'F-MISALIGN',
        sensor: tag,
        feature: 'order_1x_fraction',
        observedValue: oneX,
        expectedDirection: 'synchronous spectrum',
        strength: SUPPORTING,
        source: 'REFERENCE_BASED_ENGINEERING_DEVELOPMENT',
        description: 'Energy remains on the shaft order series rather than broadband.',
      });
    }
  } else if (twoXRatio !== null && harmonicRich) {
    out.push(contradiction('F-MISALIGN', tag, 'significant_harmonic_count', harmonics,
      'A rich harmonic series indicates looseness rather than misalignment.', true));
  } else if (twoXRatio !== null) {
    out.push(contradiction('F-MISALIGN', tag, 'order_2x_to_1x_ratio', twoXRatio,
      'Second-order content is not raised.', true));
  }

  const loosenessHits = [
    evidence('F-LOOSENESS', tag, 'TH-VIB-HARMONIC-COUNT', harmonics, PRIMARY,
      'A harmonic-rich synchronous series is present.'),
    evidence('F-LOOSENESS', tag, 'TH-VIB-SUBHARMONIC', subharmonic, SUPPORTING, 'Half-order content is present.'),
  ].filter((hit): hit is FaultEvidence => hit !== null);
  if (loosenessHits.length > 0) out.push(...loosenessHits);
  else if (harmonics !== null) {
    out.push(contradiction('F-LOOSENESS', tag, 'significant_harmonic_count', harmonics,
      'The synchronous series is not harmonic-rich.', true));
  }
  return out;
}

/**
 * All vibration-based mechanical hypotheses, per sensor location.
 *
 * Two independent questions are answered in order:
 *
 *  1. Is there a fault on this channel at all? Answered by amplitude against the
 *     declared healthy baseline, using the controlled Process Engineer warning
 *     signature. Every running machine shows some first-order content, so
 *     structure alone would diagnose a healthy machine with imbalance.
 *  2. Which fault is it? Answered by the order-domain structure, which is
 *     self-normalising and needs no amplitude calibration.
 *
 * A channel inside its warning signature contributes neither support nor
 * refutation, so a quiet gearbox can never eliminate a fault the motor channel
 * observes.
 */
function mechanical(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  for (const tag of ['V1', 'V2'] as const) {
    const velocityRatio = channelValue(context, tag, 'amplitude_ratio_to_baseline');
    const accelerationRatio = channelValue(context, tag, 'acceleration_rms_ratio_to_baseline');
    // No declared healthy baseline in either domain: severity cannot be
    // established, so no mechanical hypothesis is raised from structure alone.
    if (velocityRatio === null && accelerationRatio === null) continue;
    if (!amplitudeSignatureCrossed(context, tag)) continue;
    out.push(...bearingRule(context, tag));
    out.push(...rotatingRules(context, tag));
    if (tag === 'V2') out.push(...gearRule(context));
  }
  return out;
}

// --------------------------------------------------------------------------------------
// Instrumentation (temporal inference)
// --------------------------------------------------------------------------------------

const INSTRUMENT_TAGS = ['E1', 'V1', 'V2', 'T1', 'T2', 'T3', 'T4', 'T5', 'P1', 'L1', 'PM1.current'] as const;

/**
 * Physically coupled measurements used for analytical redundancy. If a suspect
 * tag deviates and a coupled partner deviates with it, the machine changed. If
 * the suspect tag deviates alone, the measurement chain is the more likely
 * explanation.
 */
const COUPLED_MEASUREMENTS: Record<string, string[]> = {
  T1: ['T2', 'T3'],
  T2: ['T1', 'T3'],
  T3: ['T1', 'T2', 'P1'],
  T4: ['V1', 'PM1.current'],
  T5: ['V2'],
  V1: ['T4', 'PM1.current'],
  V2: ['T5'],
  P1: ['PM1.current', 'L1', 'T3'],
  L1: ['P1'],
  'PM1.current': ['P1', 'E1', 'T4'],
  E1: ['PM1.current'],
};

/**
 * Structural vibration features that indicate a machine condition rather than a
 * measurement-chain problem. Any of these crossing its registered threshold
 * means the waveform carries real mechanical structure.
 */
const MECHANICAL_STRUCTURE_CHECKS: [string, ThresholdId][] = [
  ['spread_non_synchronous_fraction', 'TH-VIB-NONSYNC'],
  ['order_1x_fraction', 'TH-VIB-1X-DOMINANT'],
  ['order_2x_to_1x_ratio', 'TH-VIB-2X-RATIO'],
  ['significant_harmonic_count', 'TH-VIB-HARMONIC-COUNT'],
  ['dominant_high_order_energy_fraction', 'TH-VIB-MESH-CONCENTRATION'],
];

/** True when a vibration channel carries a recognised mechanical order structure. */
function hasMechanicalStructure(context: RuleContext, tag: 'V1' | 'V2'): boolean {
  if (!waveformAvailable(context, tag)) return false;
  return MECHANICAL_STRUCTURE_CHECKS.some(([feature, thresholdId]) =>
    satisfiedBy(thresholdId, channelValue(context, tag, feature)),
  );
}

/**
 * Whether a measurement has moved away from its healthy reference.
 *
 * This uses the analytical-redundancy consistency band, which is deliberately
 * more sensitive than a fault-detection threshold: the question here is "did
 * this coupled measurement move at all", not "has it reached a fault limit".
 */
function tagIsDeviating(context: RuleContext, tag: string): boolean {
  if (tag === 'T1' || tag === 'T2' || tag === 'T3') {
    const residual = scalar(context, `${tag}.zone_setpoint_residual_c`);
    return residual !== null && satisfiedBy('TH-CONSISTENCY-TEMP', Math.abs(residual));
  }
  if (tag === 'T4' || tag === 'T5') {
    const residual = scalar(context, `${tag}.temperature_residual_c`);
    return residual !== null && satisfiedBy('TH-CONSISTENCY-TEMP', Math.abs(residual));
  }
  if (tag === 'P1' || tag === 'PM1.current' || tag === 'E1') {
    const key = { P1: 'pressure_ratio_to_baseline', 'PM1.current': 'current_ratio_to_baseline', E1: 'speed_ratio_to_baseline' }[tag];
    const ratio = scalar(context, key);
    return ratio !== null && satisfiedBy('TH-CONSISTENCY-RATIO', Math.abs(ratio - 1));
  }
  if (tag === 'L1') {
    const level = scalar(context, 'level_percent');
    return level !== null && (satisfiedBy('TH-FEED-LEVEL-LOW', level) || satisfiedBy('TH-FEED-LEVEL-HIGH', level));
  }
  if (tag === 'V1' || tag === 'V2') {
    for (const feature of ['amplitude_ratio_to_baseline', 'acceleration_rms_ratio_to_baseline']) {
      const ratio = channelValue(context, tag, feature);
      if (ratio !== null && satisfiedBy('TH-CONSISTENCY-RATIO', Math.abs(ratio - 1))) return true;
    }
    return hasMechanicalStructure(context, tag);
  }
  return false;
}

/** Whether a tag has reached the fault-detection boundary registered for it. */
function crossedFaultThreshold(context: RuleContext, tag: string): boolean {
  if (tag === 'T1' || tag === 'T2' || tag === 'T3') {
    const residual = scalar(context, `${tag}.zone_setpoint_residual_c`);
    return residual !== null && (satisfiedBy('TH-HEATER-DROP', residual) || satisfiedBy('TH-ZONE-OVERTEMP', residual));
  }
  if (tag === 'T4' || tag === 'T5') {
    return satisfiedBy('TH-TEMP-SUPPORT', scalar(context, `${tag}.temperature_residual_c`));
  }
  if (tag === 'P1') {
    const ratio = scalar(context, 'pressure_ratio_to_baseline');
    return ratio !== null && (satisfiedBy('TH-DIE-PRESSURE', ratio) || satisfiedBy('TH-PRESSURE-LOW', ratio));
  }
  if (tag === 'PM1.current') {
    const ratio = scalar(context, 'current_ratio_to_baseline');
    return ratio !== null && (satisfiedBy('TH-MOTOR-LOAD-CURRENT', ratio) || satisfiedBy('TH-CURRENT-LOW', ratio));
  }
  if (tag === 'L1') {
    const level = scalar(context, 'level_percent');
    return level !== null && (satisfiedBy('TH-FEED-LEVEL-LOW', level) || satisfiedBy('TH-FEED-LEVEL-HIGH', level));
  }
  if (tag === 'V1' || tag === 'V2') return amplitudeSignatureCrossed(context, tag);
  return false;
}

/**
 * True when a coupled measurement moved with the suspect tag, or the waveform
 * shows structure. This is the guard that keeps a real machine fault from being
 * reported as a sensor fault: a bearing defect raises V1 *and* T4 *and* puts
 * recognisable structure in the waveform, whereas a biased accelerometer raises
 * V1 alone with a healthy spectrum.
 */
function isCorroborated(context: RuleContext, tag: string): boolean {
  if ((tag === 'V1' || tag === 'V2') && hasMechanicalStructure(context, tag)) return true;
  return (COUPLED_MEASUREMENTS[tag] ?? []).some((partner) => tagIsDeviating(context, partner));
}

/** True when at least one other measurement is moving, so a frozen channel stands out. */
function processIsVarying(context: RuleContext, exclude: string): boolean {
  return INSTRUMENT_TAGS.some((tag) => {
    if (tag === exclude) return false;
    const run = temporal(context, `${tag}.identical_sample_run_length`);
    const samples = temporal(context, `${tag}.sample_count`);
    return run !== null && samples !== null && run < samples;
  });
}

/** WP3 sensor-fault hypotheses inferred from time behaviour, never declared by the operator. */
function instrumentation(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  for (const tag of INSTRUMENT_TAGS) {
    const missing = temporal(context, `${tag}.missing_sample_count`);
    const dropout = evidence('WP3-DROPOUT', tag, 'TH-DQ-DROPOUT', missing, PRIMARY,
      `${tag} produced no measurement while the tag remains installed.`);
    if (dropout) out.push(dropout);

    const samples = temporal(context, `${tag}.sample_count`);
    if (samples === null) continue;

    // Analytical redundancy: a deviation confirmed by a physically coupled
    // measurement is a machine condition and must not be reported as a sensor fault.
    if (isCorroborated(context, tag)) continue;

    const run = temporal(context, `${tag}.identical_sample_run_length`);
    const frozen = evidence('WP3-FROZEN', tag, 'TH-FROZEN-REPEAT', run, PRIMARY,
      `${tag} repeated an identical value while other measurements continued to vary.`);
    if (frozen && processIsVarying(context, tag)) out.push(frozen);

    // Sensor drift is a slow departure detected BEFORE the reading looks like a
    // process fault. Once a tag has crossed its own fault-detection threshold the
    // plant hypothesis owns the observation.
    const span = temporal(context, `${tag}.range`);
    const monotonic = temporal(context, `${tag}.monotonic_trend_fraction`);
    const drift = evidence('WP3-DRIFT', tag, 'TH-DRIFT-MONOTONIC', monotonic, PRIMARY,
      `${tag} moved almost monotonically while the process remained at its operating point.`);
    if (drift && span !== null && span > 0 && inProduction(context) && !crossedFaultThreshold(context, tag)) {
      out.push(drift);
    }

    const noise = evidence('WP3-NOISE', tag, 'TH-NOISE-VARIANCE', temporal(context, `${tag}.noise_ratio_to_baseline`),
      PRIMARY, `${tag} sample dispersion is far above its declared baseline measurement noise.`);
    if (noise) out.push(noise);

    // A constant bias and a proportional gain error produce the SAME reading at a
    // single operating point: an additive offset b on a baseline x0 is identical
    // to a gain of (x0 + b)/x0. They are detected by one observation and raised as
    // an ambiguous pair; separating them needs two distinct process levels.
    const stable = run !== null && run < samples;
    const drifting = satisfiedBy('TH-DRIFT-MONOTONIC', monotonic);
    const biasRatio = temporal(context, `${tag}.persistent_bias_ratio`);
    if (stable && !drifting && satisfiedBy('TH-OFFSET-BIAS', biasRatio)) {
      out.push({
        faultId: 'WP3-OFFSET',
        sensor: tag,
        feature: 'persistent_bias_ratio',
        observedValue: biasRatio,
        expectedDirection: `>= ${getThreshold('TH-OFFSET-BIAS').value} ratio`,
        strength: PRIMARY,
        source: getThreshold('TH-OFFSET-BIAS').sourceStatus,
        thresholdId: 'TH-OFFSET-BIAS',
        description: `${tag} departs persistently from its expected value with unchanged dispersion.`,
      });
      out.push({
        faultId: 'WP3-SCALE',
        sensor: tag,
        feature: 'gain_error_ratio',
        observedValue: temporal(context, `${tag}.gain_error_ratio`),
        expectedDirection: 'equivalent proportional departure',
        strength: PRIMARY,
        source: getThreshold('TH-SCALE-GAIN').sourceStatus,
        thresholdId: 'TH-SCALE-GAIN',
        description: `${tag} departs from its expected value by a factor that a gain error would also produce.`,
      });
    }
  }
  return out;
}

// --------------------------------------------------------------------------------------
// Data quality (transport metadata)
// --------------------------------------------------------------------------------------

/** WP3 transport hypotheses. These are stream properties, never machine conditions. */
function dataQuality(context: RuleContext): FaultEvidence[] {
  const out: FaultEvidence[] = [];
  const checks: [string, ThresholdId, string, string][] = [
    ['WP3-LOSS', 'TH-DQ-SEQUENCE-GAP', 'sequence_gap_count',
      'Packet sequence numbers are missing, so samples were lost in transport.'],
    ['WP3-DUP', 'TH-DQ-DUPLICATE', 'sequence_duplicate_count',
      'A packet sequence number repeated, so a sample was delivered twice.'],
    ['WP3-DELAY', 'TH-DQ-DELAY', 'max_arrival_gap_ratio',
      'The sample arrival gap exceeded the declared publish interval.'],
    ['WP3-TIME', 'TH-DQ-TIMESTAMP', 'timestamp_regression_count',
      'Sample timestamps are not monotonic, so the time base is inconsistent.'],
  ];
  for (const [faultId, thresholdId, feature, text] of checks) {
    const hit = evidence(faultId, 'TELEMETRY', thresholdId, telemetry(context, feature), PRIMARY, text);
    if (hit) out.push(hit);
  }
  const duplicates = telemetry(context, 'timestamp_duplicate_count');
  if (duplicates && !out.some((item) => item.faultId === 'WP3-DUP')) {
    out.push({
      faultId: 'WP3-DUP',
      sensor: 'TELEMETRY',
      feature: 'timestamp_duplicate_count',
      observedValue: duplicates,
      expectedDirection: '>= 1 count',
      strength: PRIMARY,
      source: 'ENGINEERING_DEVELOPMENT',
      thresholdId: 'TH-DQ-DUPLICATE',
      description: 'A sample timestamp repeated, so a sample was delivered twice.',
    });
  }
  return out;
}

/** Evaluation order is irrelevant to the outcome; rules are independent by construction. */
const RULES: ((context: RuleContext) => FaultEvidence[])[] = [
  motorOverload,
  driveEfficiency,
  restriction,
  feedStarvation,
  overfeed,
  materialVariation,
  screwBarrelWear,
  heaterFaults,
  coolingFaults,
  mechanical,
  instrumentation,
  dataQuality,
];

/** Run every rule and return the combined evidence list. */
export function evaluateRules(context: RuleContext): FaultEvidence[] {
  return RULES.flatMap((rule) => rule(context));
}
