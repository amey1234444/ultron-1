/**
 * Twin-screw analysis entry point.
 *
 * Mirrors the shape of `lib/analysis/extruder/index.ts` so the console can
 * treat the two machines the same way, while keeping their models strictly
 * apart. See `rules.ts` for why this machine reports configuration-required
 * rather than a condition verdict.
 */

export {
  analyseTwinScrew,
  hasCommissionedModel,
  THRESHOLD_RULES,
  type RuleResult,
  type RuleSeverity,
  type RuleStatus,
  type TagSample,
  type TwinScrewAnalysis,
} from './rules';

export {
  CANONICAL_UNITS,
  deriveScreenDifferential,
  deriveScrewSpeedImbalance,
  deriveZoneGradient,
  electricalQuantityForUnit,
  normaliseReading,
  resolveSignal,
  UnitError,
  type DerivedValue,
  type NormalisedReading,
  type SignalResolution,
  type SpeedDomain,
  type VibrationDomain,
} from './signalMap';
