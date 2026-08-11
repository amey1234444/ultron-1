// Single-screw-extruder diagnostic model.
//
// A TypeScript port of the diagnostic layer of the ULTRON single-screw-extruder
// digital twin (`03_src/ultron_extruder/diagnostics/*`), together with its
// governed registers. The twin's engineering discipline is carried over intact:
//
//  - Every numeric decision boundary lives in `registers.ts`, never inline in a
//    rule. A field calibration replaces register values without touching
//    algorithm code.
//  - Evidence is fused categorically. There is no calibrated fault-probability
//    model for this machine, so the only numeric output is an ordinal
//    ENGINEERING_MATCH_SCORE that ranks candidates and is never a confidence.
//  - Ambiguity is retained wherever the installed sensors cannot separate the
//    candidates, and the measurement that would resolve it is named.
//  - Transport, sensor and machine problems are diagnosed at three independent
//    layers with an explicit precedence, so a broken data stream is never
//    reported as a machine condition.
//  - A missing input is reported as NOT_EVALUATED, never substituted with zero.
//
// What this port does not carry over: raw-waveform order-domain analysis. The
// twin computes 1x/2x fractions, harmonic counts, envelope kurtosis and gear
// mesh orders from a 25.6 kS/s acceleration record. The app's gateway carries
// scalar measurements only, so those features report
// NOT_EVALUATED_WAVEFORM_REQUIRED and the mechanical sub-type rules decline to
// name a sub-type rather than guessing one from an amplitude.

export {
  analyzeExtruder,
  appendHistory,
  EXTRUDER_MODEL_KEY,
  EXTRUDER_MODEL_VERSION,
  type ExtruderAnalysisInput,
  type ExtruderAnalysisResult,
  type ExtruderDetail,
  type ExtruderInputReading,
  type FaultAssessmentRecord,
  type FaultLayer,
  type ResolvedSignal,
  type TriggeredThreshold,
  type UnconsumedSignal,
} from './pipeline';
export { type ConstraintCheck, type ConstraintOverall, type ConstraintStatus } from './constraints';
export { type FaultEvidence, type MatchClassValue } from './evidence';
export {
  ALL_TAGS,
  CANONICAL_UNITS,
  DIAGNOSTIC_TAGS,
  ESSENTIAL_TAGS,
  resolveSignal,
  TAG_LABELS,
  type ExtruderTag,
} from './signalMap';
export { allThresholds, PROCESS_CONSTRAINTS, type Threshold } from './registers';
export { type BaselineValue } from './baseline';
export { MachineState } from './stateInference';
