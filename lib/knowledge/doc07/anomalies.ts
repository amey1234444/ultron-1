/**
 * The DOC-07 anomaly library — forty named anomalies with their detection rules.
 *
 * DOC-04 answers "is this signal anomalous" with a verdict. DOC-07 gives that
 * verdict a *name and an identity*: `A-PRES-H`, `A-DP-RISE`, `A-TQ-OSC`. That
 * identity is what makes the finding usable downstream — DOC-07 §9 and DOC-06
 * §32 both key their ML labels on it, and a fault rule cites the anomalies it
 * consumes rather than re-deriving them.
 *
 * Each entry carries the four gates DOC-07 makes explicit for every anomaly,
 * and they are the same four DOC-04 §3 enforces:
 *
 *   dataQualityGate  GOOD required for a high-confidence process anomaly;
 *                    BAD or MISSING routes to instrumentation logic instead.
 *   contextGate      state, recipe, RPM, feed, setpoint and configuration are
 *                    checked before an unexpected change is declared.
 *   persistence      required unless an approved fast-protection rule allows
 *                    immediate classification.
 *   primaryBoundary  a contextual envelope or model residual — never a fixed
 *                    number, which is §2's whole argument.
 *
 * The library is knowledge, not an engine. `anomalyIdFor` is the join: it maps
 * a running DOC-04 verdict onto the library entry so a finding can be labelled,
 * and returns undefined rather than guessing when no entry fits.
 */

import type { AnomalyVerdict } from '../doc04/types';

export type AnomalyDefinition = {
  anomalyId: string;
  name: string;
  /** The quantity this watches. */
  parameter: string;
  primarySensor: string;
  /** The symbolic state DOC-03 must produce for this to fire. */
  outputState: string;
  applicableState: string;
  /** What the value is judged against. Contextual, never a fixed number. */
  primaryBoundary: string;
  healthyBehaviour: string;
  /** DOC-03 formula ids this rests on. */
  formulaFeature: string;
  anomalyDecision: string;
  persistence: string;
  dataQualityGate: string;
  contextGate: string;
};

function anomaly(
  anomalyId: string,
  name: string,
  parameter: string,
  primarySensor: string,
  outputState: string,
  applicableState: string,
  primaryBoundary: string,
  healthyBehaviour: string,
  formulaFeature: string,
  anomalyDecision: string,
  persistence: string,
  dataQualityGate: string,
  contextGate: string,
): AnomalyDefinition {
  return {
    anomalyId,
    name,
    parameter,
    primarySensor,
    outputState,
    applicableState,
    primaryBoundary,
    healthyBehaviour,
    formulaFeature,
    anomalyDecision,
    persistence,
    dataQualityGate,
    contextGate,
  };
}

/** DOC-07 Part A, all forty anomalies in document order. */
export const DOC07_ANOMALIES: readonly AnomalyDefinition[] = [
  anomaly(
    'A-PRES-H',
    'Pressure High',
    'Melt/process pressure',
    'Pressure transmitter',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Contextual upper envelope / expected-value residual',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-PRES-L',
    'Pressure Low',
    'Melt/process pressure',
    'Pressure transmitter',
    'LOW_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Contextual lower envelope',
    'Signal remains inside the contextual healthy lower envelope and tracks expected process demand.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Current/feature falls below contextual lower anomaly boundary and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-PRES-ROC+',
    'Pressure Rising Fast',
    'Melt/process pressure',
    'Pressure transmitter',
    'RISING_FAST',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Healthy positive ROC envelope',
    'Rate of change remains inside the healthy state-specific ROC envelope after known setpoint/context changes are excluded.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Healthy ROC/trend envelope exceeded for the current operating state/context; persistence must be satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-PRES-ROC-',
    'Pressure Falling Fast',
    'Melt/process pressure',
    'Pressure transmitter',
    'FALLING_FAST',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Healthy negative ROC envelope',
    'Rate of change remains inside the healthy state-specific ROC envelope after known setpoint/context changes are excluded.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Healthy ROC/trend envelope exceeded for the current operating state/context; persistence must be satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-PRES-OSC',
    'Pressure Oscillation',
    'Melt/process pressure',
    'Pressure transmitter',
    'OSCILLATING',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Healthy variability / oscillation envelope',
    'Signal variability remains inside the healthy state/context envelope and does not show sustained cyclic behavior.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Healthy variability/CV or oscillation envelope exceeded for the configured persistence window, after state/context changes are excluded.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-PRES-SPIKE',
    'Pressure Spike',
    'Melt/process pressure',
    'Pressure transmitter',
    'SPIKE',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Impulse/ROC/plausibility rule',
    'No isolated impulses beyond the validated physical/noise envelope.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Impulse/ROC boundary + plausibility check. A single sample is not accepted as a physical event unless related evidence supports it.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-DP-H',
    'Differential Pressure High',
    'Pressure differential',
    'Two pressure transmitters',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Contextual ΔP upper envelope',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-DP-RISE',
    'Differential Pressure Rising',
    'Pressure differential',
    'Two pressure transmitters',
    'RISING',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Healthy ΔP trend/ROC envelope',
    'Rate of change remains inside the healthy state-specific ROC envelope after known setpoint/context changes are excluded.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Healthy ROC/trend envelope exceeded for the current operating state/context; persistence must be satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-TQ-H',
    'Torque High',
    'Screw/drive torque',
    'VFD/drive torque estimate or torque measurement',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Expected torque model / contextual upper envelope',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-COM-008/009 deviation; F-COM-011 ROC; F-COM-015 Z-score; expected-torque residual model',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-TQ-L',
    'Torque Low',
    'Screw/drive torque',
    'VFD/drive torque estimate',
    'LOW_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Expected torque model / lower envelope',
    'Signal remains inside the contextual healthy lower envelope and tracks expected process demand.',
    'F-COM-008/009 deviation; F-COM-011 ROC; F-COM-015 Z-score; expected-torque residual model',
    'Current/feature falls below contextual lower anomaly boundary and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-TQ-OSC',
    'Torque Unstable',
    'Screw/drive torque',
    'VFD/drive',
    'UNSTABLE',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Healthy variability/CV envelope',
    'Signal variability remains inside the healthy state/context envelope and does not show sustained cyclic behavior.',
    'F-COM-008/009 deviation; F-COM-011 ROC; F-COM-015 Z-score; expected-torque residual model',
    'Healthy variability/CV or oscillation envelope exceeded for the configured persistence window, after state/context changes are excluded.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-TQ-SPIKE',
    'Torque Spike',
    'Screw/drive torque',
    'VFD/drive',
    'SPIKE',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Impulse/ROC threshold',
    'No isolated impulses beyond the validated physical/noise envelope.',
    'F-COM-008/009 deviation; F-COM-011 ROC; F-COM-015 Z-score; expected-torque residual model',
    'Impulse/ROC boundary + plausibility check. A single sample is not accepted as a physical event unless related evidence supports it.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-CUR-H',
    'Motor Current High',
    'Motor current',
    'VFD / power meter / current transducer',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Contextual current/load baseline',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-COM-008/009 deviation; F-COM-019 expected-value residual; torque-current residual',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-PWR-H',
    'Active Power High',
    'Active power',
    'VFD / power meter',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Contextual power / specific energy baseline',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-COM-008/009 deviation; F-TSE-001 Specific Energy where throughput is valid',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-FEED-L',
    'Feed Low',
    'Main feed rate',
    'Gravimetric feeder/controller',
    'LOW_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Feed SP/expected-value error',
    'Signal remains inside the contextual healthy lower envelope and tracks expected process demand.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving mean/std/CV; persistence',
    'Current/feature falls below contextual lower anomaly boundary and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-FEED-H',
    'Feed High',
    'Main feed rate',
    'Gravimetric feeder/controller',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Feed SP/expected-value error',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving mean/std/CV; persistence',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-FEED-OSC',
    'Feed Unstable',
    'Main feed rate',
    'Gravimetric feeder/controller',
    'UNSTABLE',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'CV/variability + ROC envelope',
    'Signal variability remains inside the healthy state/context envelope and does not show sustained cyclic behavior.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving mean/std/CV; persistence',
    'Healthy variability/CV or oscillation envelope exceeded for the configured persistence window, after state/context changes are excluded.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-FEED-MIS',
    'Feed SP/Actual Mismatch',
    'Main feed rate',
    'Feeder controller',
    'MISMATCH',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Actual - setpoint error',
    'Actual value tracks its approved setpoint/command within the context-specific tracking band.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving mean/std/CV; persistence',
    'Absolute/setpoint residual exceeds the approved tracking band for the configured persistence time.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-RPM-L',
    'RPM Low',
    'Screw speed',
    'VFD encoder/speed feedback',
    'LOW_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'RPM SP/expected residual',
    'Signal remains inside the contextual healthy lower envelope and tracks expected process demand.',
    'DOC-03 contextual deviation, ROC, trend, variability and persistence features applicable to the parameter',
    'Current/feature falls below contextual lower anomaly boundary and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-RPM-H',
    'RPM High',
    'Screw speed',
    'VFD encoder/speed feedback',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'RPM SP/expected residual',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'DOC-03 contextual deviation, ROC, trend, variability and persistence features applicable to the parameter',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-RPM-OSC',
    'RPM Unstable',
    'Screw speed',
    'VFD encoder/speed feedback',
    'UNSTABLE',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Healthy speed variability',
    'Signal variability remains inside the healthy state/context envelope and does not show sustained cyclic behavior.',
    'DOC-03 contextual deviation, ROC, trend, variability and persistence features applicable to the parameter',
    'Healthy variability/CV or oscillation envelope exceeded for the configured persistence window, after state/context changes are excluded.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-RPM-MIS',
    'RPM Command/Actual Mismatch',
    'Screw speed',
    'VFD command + feedback',
    'MISMATCH',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'RPM_actual - RPM_SP',
    'Actual value tracks its approved setpoint/command within the context-specific tracking band.',
    'DOC-03 contextual deviation, ROC, trend, variability and persistence features applicable to the parameter',
    'Absolute/setpoint residual exceeds the approved tracking band for the configured persistence time.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-TEMP-H',
    'Zone Temperature High',
    'Barrel-zone temperature',
    'RTD/TC/PLC temperature input',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'SP residual / contextual envelope',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving variability; F-TSE-003 zone error; F-TSE-004 gradients',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-TEMP-L',
    'Zone Temperature Low',
    'Barrel-zone temperature',
    'RTD/TC/PLC temperature input',
    'LOW_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'SP residual / contextual envelope',
    'Signal remains inside the contextual healthy lower envelope and tracks expected process demand.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving variability; F-TSE-003 zone error; F-TSE-004 gradients',
    'Current/feature falls below contextual lower anomaly boundary and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-TEMP-OSC',
    'Zone Temperature Oscillating',
    'Barrel-zone temperature',
    'RTD/TC + control output',
    'OSCILLATING',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Healthy loop variability',
    'Signal follows its contextual healthy baseline and expected physical relationships.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving variability; F-TSE-003 zone error; F-TSE-004 gradients',
    'Contextual baseline/relationship rule exceeded with GOOD data quality and valid operating state.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-TEMP-ROC',
    'Temperature ROC Abnormal',
    'Barrel-zone temperature',
    'RTD/TC',
    'ROC_ABNORMAL',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'State-specific heating/cooling ROC envelope',
    'Rate of change remains inside the healthy state-specific ROC envelope after known setpoint/context changes are excluded.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving variability; F-TSE-003 zone error; F-TSE-004 gradients',
    'Healthy ROC/trend envelope exceeded for the current operating state/context; persistence must be satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-TGRAD',
    'Zone-to-Zone Gradient Abnormal',
    'Thermal profile',
    'Multiple zone temperature sensors',
    'PROFILE_ABNORMAL',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Expected thermal-gradient profile',
    'Signal follows its contextual healthy baseline and expected physical relationships.',
    'F-TSE-003 zone error; F-TSE-004 zone-to-zone gradient; profile residual',
    'Contextual baseline/relationship rule exceeded with GOOD data quality and valid operating state.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-MELT-H',
    'Melt Temperature High',
    'Melt temperature',
    'Melt thermocouple/RTD',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Contextual melt-temp envelope',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving variability; F-TSE-003 zone error; F-TSE-004 gradients',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-MELT-L',
    'Melt Temperature Low',
    'Melt temperature',
    'Melt thermocouple/RTD',
    'LOW_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Contextual melt-temp envelope',
    'Signal remains inside the contextual healthy lower envelope and tracks expected process demand.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving variability; F-TSE-003 zone error; F-TSE-004 gradients',
    'Current/feature falls below contextual lower anomaly boundary and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-VAC-L',
    'Vacuum Poor',
    'Vacuum pressure/level',
    'Vacuum transmitter/controller',
    'LOW_PERFORMANCE',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Vacuum SP/context residual',
    'Signal remains inside the contextual healthy lower envelope and tracks expected process demand.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Current/feature falls below contextual lower anomaly boundary and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-VAC-OSC',
    'Vacuum Unstable',
    'Vacuum pressure/level',
    'Vacuum transmitter/controller',
    'UNSTABLE',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Vacuum variability envelope',
    'Signal variability remains inside the healthy state/context envelope and does not show sustained cyclic behavior.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Healthy variability/CV or oscillation envelope exceeded for the configured persistence window, after state/context changes are excluded.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-VAC-LOST',
    'Vacuum Lost',
    'Vacuum pressure/level',
    'Vacuum transmitter + pump status',
    'LOST',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Minimum acceptable vacuum / pump state',
    'Signal/service remains available and within minimum acceptable operating range.',
    'F-COM-008 Absolute deviation; F-COM-009 % deviation; F-COM-011 ROC; F-COM-017 Persistence; F-TSE-002 ΔP where two pressure points exist',
    'Service/signal falls outside minimum availability/quality condition or associated equipment state confirms loss.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-THR-L',
    'Throughput Low',
    'Throughput/output rate',
    'Downstream scale, feeder mass balance, MES/QMS',
    'LOW_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Expected throughput model',
    'Signal remains inside the contextual healthy lower envelope and tracks expected process demand.',
    'expected-value residual; % deviation; moving variability; trend',
    'Current/feature falls below contextual lower anomaly boundary and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-THR-OSC',
    'Throughput Unstable',
    'Throughput/output rate',
    'Downstream scale/MES',
    'UNSTABLE',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Healthy throughput variability',
    'Signal variability remains inside the healthy state/context envelope and does not show sustained cyclic behavior.',
    'expected-value residual; % deviation; moving variability; trend',
    'Healthy variability/CV or oscillation envelope exceeded for the configured persistence window, after state/context changes are excluded.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-SE-H',
    'Specific Energy High',
    'Specific energy',
    'Calculated from active power + throughput',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Contextual specific-energy baseline',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-TSE-001 Specific Energy = Active Power / Throughput; contextual deviation; trend',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-SE-L',
    'Specific Energy Low',
    'Specific energy',
    'Calculated from active power + throughput',
    'LOW_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Contextual specific-energy baseline',
    'Signal remains inside the contextual healthy lower envelope and tracks expected process demand.',
    'F-TSE-001 Specific Energy = Active Power / Throughput; contextual deviation; trend',
    'Current/feature falls below contextual lower anomaly boundary and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-VIB-H',
    'Overall Vibration High',
    'Overall vibration',
    'Vibration sensor / transmitter',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'RPM/load contextual baseline',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'overall level deviation/trend only in base layer; detailed FFT/envelope belongs Advanced CM',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-BTEMP-H',
    'Bearing Temperature High',
    'Bearing temperature',
    'RTD/temperature sensor',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'RPM/load contextual baseline',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving variability; F-TSE-003 zone error; F-TSE-004 gradients',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-OILT-H',
    'Gearbox Oil Temperature High',
    'Oil temperature',
    'RTD/temperature transmitter',
    'HIGH_ANOMALY',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Load/ambient contextual baseline',
    'Signal remains inside the contextual healthy upper envelope for the current state, recipe, load and configuration.',
    'F-COM-010 setpoint error; F-COM-011 ROC; moving variability; F-TSE-003 zone error; F-TSE-004 gradients',
    'Current/feature exceeds contextual upper anomaly boundary (e.g., model residual or healthy percentile such as P99) and persistence is satisfied.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
  anomaly(
    'A-DQ',
    'Data Quality Abnormal',
    'Any signal',
    'Quality engine',
    'BAD_OR_UNCERTAIN',
    'State-dependent; run only where the parameter has a valid healthy reference',
    'Timeout/range/flatline/plausibility/cross-sensor rules',
    'Signal follows its contextual healthy baseline and expected physical relationships.',
    'DOC-03 contextual deviation, ROC, trend, variability and persistence features applicable to the parameter',
    'Contextual baseline/relationship rule exceeded with GOOD data quality and valid operating state.',
    'Required unless an approved fast-protection/ROC rule explicitly allows immediate classification. Persistence is configured by process dynamics and sample rate.',
    'GOOD required for high-confidence process anomaly. BAD/MISSING must route to instrumentation/data-quality logic.',
    'Check operating state, recipe/material, RPM, feed, setpoint and configuration before declaring an unexpected change.',
  ),
];

const BY_ID = new Map(DOC07_ANOMALIES.map((entry) => [entry.anomalyId, entry]));

export function anomalyById(anomalyId: string): AnomalyDefinition | undefined {
  return BY_ID.get(anomalyId);
}

/** Anomalies whose symbolic output is the given state. */
export function anomaliesForState(outputState: string): AnomalyDefinition[] {
  return DOC07_ANOMALIES.filter((entry) => entry.outputState === outputState);
}

/**
 * Which library anomaly a running signal's verdict corresponds to.
 *
 * The match is on the parameter family plus the direction, because that is what
 * the library is keyed on — `A-PRES-H` is "pressure, high", not "TS-P3, high".
 * Returns undefined when nothing fits rather than picking the nearest entry: an
 * unlabelled anomaly is still a usable finding, whereas a wrongly labelled one
 * corrupts every ML label built on it.
 */
export function anomalyIdFor(signalId: string, verdict: AnomalyVerdict): string | undefined {
  const family = parameterFamily(signalId);
  if (!family) return undefined;

  const suffix =
    verdict === 'HIGH_ANOMALY'
      ? 'H'
      : verdict === 'LOW_ANOMALY'
        ? 'L'
        : verdict === 'RISING_ABNORMAL'
          ? 'ROC+'
          : verdict === 'FALLING_ABNORMAL'
            ? 'ROC-'
            : verdict === 'OSCILLATING'
              ? 'OSC'
              : null;
  if (!suffix) return undefined;

  const candidate = `A-${family}-${suffix}`;
  return BY_ID.has(candidate) ? candidate : undefined;
}

/**
 * The library's parameter family for a twin-screw tag.
 *
 * Deliberately explicit rather than pattern-matched on the tag string. A tag is
 * an instrument on a drawing; a family is a physical quantity, and the mapping
 * between them is a decision worth being able to read.
 */
export function parameterFamily(signalId: string): string | undefined {
  if (/^TS-P[1-4]$/.test(signalId)) return 'PRES';
  if (signalId === 'TS-PV') return 'VAC';
  if (signalId === 'TS-PM1') return 'PWR';
  if (/^TS-S[12]$/.test(signalId) || signalId === 'TS-E1') return 'RPM';
  if (signalId === 'TS-F1' || signalId === 'TS-F2') return 'FEED';
  if (/^TS-TZ\d$/.test(signalId)) return 'ZT';
  if (signalId === 'TS-TM') return 'MELT';
  if (/^TS-V[1-5]$/.test(signalId)) return 'VIB';
  if (signalId === 'TS-T2' || signalId === 'TS-T3') return 'GBT';
  if (signalId === 'TS-L1') return 'LVL';
  return undefined;
}

/** Anomaly ids the library defines but this machine can never produce. */
export function anomaliesWithoutSignal(availableSignalIds: readonly string[]): AnomalyDefinition[] {
  const families = new Set(
    availableSignalIds.map(parameterFamily).filter((family): family is string => family !== undefined),
  );
  return DOC07_ANOMALIES.filter((entry) => {
    const family = entry.anomalyId.split('-')[1];
    return !families.has(family);
  });
}
