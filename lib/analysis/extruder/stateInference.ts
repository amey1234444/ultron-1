// Machine-state inference from measurements and recent history.
//
// Ported from the digital twin's `diagnostics/state_inference.py`.
//
// Startup, shutdown and idle are legitimate operating states, not faults. A
// barrel zone below setpoint during warm-up is normal; the same reading during
// production is a heater fault. The pipeline therefore infers state first and
// uses it to gate the process and thermal rules.
//
// State is always derived from measurements. A declared machine state on the
// request is deliberately ignored, because a caller that passed the true state
// would be leaking the answer for the transition cases.

import { satisfiedBy } from './registers';

export const MachineState = {
  PRODUCING: 'PRODUCING',
  STARTUP_COLD: 'STARTUP_COLD',
  STARTUP_WARM: 'STARTUP_WARM',
  SHUTDOWN: 'SHUTDOWN',
  IDLE: 'IDLE',
  UNDETERMINED: 'UNDETERMINED',
} as const;

export type MachineStateValue = (typeof MachineState)[keyof typeof MachineState];

/**
 * States in which process and thermal deviation rules are suppressed, because
 * the process is not at its production operating point by design.
 */
export const NON_PRODUCTION_STATES: ReadonlySet<string> = new Set<string>([
  MachineState.STARTUP_COLD,
  MachineState.STARTUP_WARM,
  MachineState.SHUTDOWN,
  MachineState.IDLE,
]);

export type StateInference = {
  state: MachineStateValue;
  basis: string[];
  speedRatio: number | null;
  meanZoneSlope: number | null;
};

function meanZoneSlope(temporal: Record<string, number>): number | null {
  const slopes = (['T1', 'T2', 'T3'] as const)
    .map((tag) => temporal[`${tag}.slope_per_sample`])
    .filter((slope): slope is number => slope !== undefined && Number.isFinite(slope));
  if (slopes.length === 0) return null;
  return slopes.reduce((sum, slope) => sum + slope, 0) / slopes.length;
}

/** Derive the operating state from speed, zone residuals and zone trend. */
export function inferState(scalar: Record<string, number>, temporal: Record<string, number>): StateInference {
  const speedRatio = scalar.speed_ratio_to_baseline ?? null;
  const zoneMin = scalar.zone_residual_min_c ?? null;
  const zoneMax = scalar.zone_residual_max_c ?? null;
  const slope = meanZoneSlope(temporal);
  const basis: string[] = [];

  const stopped = speedRatio === null ? null : satisfiedBy('TH-STATE-SPEED-IDLE', speedRatio);
  const heating = slope === null ? false : satisfiedBy('TH-STATE-TEMP-RISING', slope);
  const cooling = slope === null ? false : satisfiedBy('TH-STATE-TEMP-FALLING', slope);
  const belowSetpoint = zoneMin !== null && zoneMin < 0;

  if (speedRatio === null && zoneMin === null) {
    return {
      state: MachineState.UNDETERMINED,
      basis: ['No shaft-speed or barrel-zone measurement is mapped, so the operating state cannot be derived.'],
      speedRatio: null,
      meanZoneSlope: slope,
    };
  }

  if (heating && belowSetpoint && slope !== null && zoneMin !== null) {
    basis.push(`Zone temperatures rising at ${slope.toFixed(2)} degC/sample while below setpoint.`);
    if (satisfiedBy('TH-STATE-COLD-DEFICIT', zoneMin)) {
      basis.push(`Largest zone deficit ${zoneMin.toFixed(0)} degC indicates a cold start.`);
      return { state: MachineState.STARTUP_COLD, basis, speedRatio, meanZoneSlope: slope };
    }
    return { state: MachineState.STARTUP_WARM, basis, speedRatio, meanZoneSlope: slope };
  }

  if (cooling && belowSetpoint && stopped !== false && slope !== null) {
    basis.push(`Zone temperatures falling at ${slope.toFixed(2)} degC/sample with the drive stopped.`);
    return { state: MachineState.SHUTDOWN, basis, speedRatio, meanZoneSlope: slope };
  }

  if (stopped === true) {
    basis.push('Shaft speed is at or below the controlled idle fraction of the reference speed.');
    if (belowSetpoint && zoneMin !== null && satisfiedBy('TH-STATE-COLD-DEFICIT', zoneMin)) {
      basis.push('Barrel zones are near ambient.');
    }
    return { state: MachineState.IDLE, basis, speedRatio, meanZoneSlope: slope };
  }

  if (stopped === false) {
    basis.push('Shaft speed is within the production envelope.');
    if (zoneMax !== null && zoneMin !== null) {
      basis.push(`Zone residuals between ${zoneMin.toFixed(1)} and ${zoneMax.toFixed(1)} degC.`);
    }
    return { state: MachineState.PRODUCING, basis, speedRatio, meanZoneSlope: slope };
  }

  return {
    state: MachineState.UNDETERMINED,
    basis: ['Insufficient evidence for state inference; map the E1 shaft-speed point to resolve it.'],
    speedRatio,
    meanZoneSlope: slope,
  };
}
