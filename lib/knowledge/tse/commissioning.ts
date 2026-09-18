/**
 * Engineering-development commissioning values for the twin screw.
 *
 * Every engine built from DOC-02, DOC-03 and DOC-04 takes its boundaries as
 * input and refuses to invent them. That is correct, and it is also why the
 * whole chain returns UNKNOWN and NOT_APPLICABLE on a machine nobody has
 * commissioned: there is nothing to compare against.
 *
 * This file supplies a starting set so the pipeline produces real output, on
 * exactly the terms the single-screw pilot already uses
 * (`lib/analysis/extruder/registers.ts`): every value is
 * ENGINEERING_DEVELOPMENT, none is field calibrated, and the pipeline says so
 * in every report it produces. They are plausible values for a machine of this
 * class, not measurements from this machine.
 *
 * The distinction matters more here than anywhere else in the knowledge layer,
 * because these numbers are what turn a reading into "HIGH_ANOMALY" in front of
 * an operator. So:
 *
 *   - `FIELD_CALIBRATED` is false and is carried into every diagnosis.
 *   - Baselines are declared at `TEMPLATE_REFERENCE` level with LOW confidence,
 *     which is precisely what DOC-03 §12 prescribes for a cold start — not at
 *     EXACT_CONTEXT, which would claim learned history that does not exist.
 *   - Instrument ranges are the honest part: they come from what the
 *     transmitter can physically read, and a value outside them really is a
 *     calibration or scaling problem rather than a process one.
 *
 * Replacing these with site values is the commissioning job. Nothing here
 * should survive contact with a real machine.
 */

import type { QualityConfig } from '../doc02/dataQuality';
import type { StateThresholds } from '../doc02/operatingState';
import type { BaselineRecord } from '../doc03/types';
import type { FeatureBands } from '../doc03/feature';
import type { TwinScrewTag } from '../../twinScrewExtruderPoints';

/** Nothing in this file has been validated against a physical machine. */
export const FIELD_CALIBRATED = false;

export const COMMISSIONING_SOURCE = 'ENGINEERING_DEVELOPMENT';

export const COMMISSIONING_NOTICE =
  'Limits and baselines below are engineering-development values for a machine of this class, not measurements from this machine. No value here is field calibrated, so every finding carries reduced confidence until a site commissions its own.';

/**
 * Per-signal data-quality configuration (DOC-02 §22).
 *
 * `rangeMin` / `rangeMax` are instrument ranges — what the transmitter can
 * physically read — rather than process limits. A reading outside them is a
 * scaling or calibration fault, which is the DQ-003 verdict, and is a different
 * claim from "the process is too hot".
 *
 * `freshnessMs` is generous at 30 seconds because the console's own channel
 * grace is of that order; a tighter value would report healthy channels as
 * stale on a slow link.
 */
export const QUALITY_CONFIG: Readonly<Partial<Record<TwinScrewTag, QualityConfig>>> = {
  // Drive
  'TS-E1': { rangeMin: 0, rangeMax: 3000, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 400 },
  'TS-PM1': { rangeMin: 0, rangeMax: 400, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 80 },
  'TS-S1': { rangeMin: 0, rangeMax: 800, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 120 },
  'TS-S2': { rangeMin: 0, rangeMax: 800, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 120 },
  'TS-T1': { rangeMin: -20, rangeMax: 200, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 2 },
  'TS-T2': { rangeMin: -20, rangeMax: 150, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 2 },
  'TS-T3': { rangeMin: -20, rangeMax: 200, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 2 },
  'TS-V1': { rangeMin: 0, rangeMax: 50, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 10 },
  'TS-V2': { rangeMin: 0, rangeMax: 50, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 10 },
  'TS-V3': { rangeMin: 0, rangeMax: 50, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 10 },
  'TS-V4': { rangeMin: 0, rangeMax: 50, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 10 },
  'TS-V5': { rangeMin: 0, rangeMax: 50, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 10 },

  // Feeding
  'TS-F1': { rangeMin: 0, rangeMax: 1000, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 60 },
  'TS-F2': { rangeMin: 0, rangeMax: 500, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 40 },
  'TS-N1': { rangeMin: 0, rangeMax: 300, freshnessMs: 30_000, flatlineSamples: 8 },
  'TS-N2': { rangeMin: 0, rangeMax: 300, freshnessMs: 30_000, flatlineSamples: 8 },
  'TS-I1': { rangeMin: 0, rangeMax: 60, freshnessMs: 30_000, flatlineSamples: 8 },
  'TS-I2': { rangeMin: 0, rangeMax: 60, freshnessMs: 30_000, flatlineSamples: 8 },
  'TS-L1': { rangeMin: 0, rangeMax: 100, freshnessMs: 60_000, flatlineSamples: 12 },

  // Barrel — a zone transmitter reads to 400 degC; the process runs far below it.
  'TS-TT0': { rangeMin: -20, rangeMax: 300, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
  'TS-TZ1': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
  'TS-TZ2': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
  'TS-TZ3': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
  'TS-TZ4': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
  'TS-TZ5': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
  'TS-TZ6': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
  'TS-TZ7': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
  'TS-TZ8': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
  'TS-TZ9': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },

  // Melt and discharge. Canonical unit is MPa, not bar — see the signal map.
  'TS-P1': { rangeMin: 0, rangeMax: 35, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 5 },
  'TS-P2': { rangeMin: 0, rangeMax: 35, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 5 },
  'TS-P3': { rangeMin: 0, rangeMax: 35, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 5 },
  'TS-P4': { rangeMin: 0, rangeMax: 35, freshnessMs: 30_000, flatlineSamples: 8, maxRateOfChangePerSecond: 5 },
  'TS-TM': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
  'TS-PV': { rangeMin: 0, rangeMax: 0.15, freshnessMs: 30_000, flatlineSamples: 8 },
  'TS-TV': { rangeMin: -20, rangeMax: 400, freshnessMs: 60_000, flatlineSamples: 10, maxRateOfChangePerSecond: 3 },
};

/**
 * What counts as stopped, fed and at temperature on this machine (DOC-02 §7).
 *
 * DOC-02 is explicit that ready criteria "are machine/recipe-specific
 * configuration fields, not universal numbers", so these are the first thing a
 * site should replace. They are set wide enough that ordinary measurement noise
 * does not flip the state.
 */
export const STATE_THRESHOLDS: StateThresholds = {
  zeroRpm: 5,
  zeroFeed: 1,
  minProductionFeed: 10,
  readyBandDegC: 8,
  warmUpSlopeDegCPerMin: 0.5,
};

/**
 * Where a deviation becomes an anomaly (DOC-03 §35).
 *
 * Expressed in robust-score units, so they behave sensibly on a skewed
 * distribution. Two is a deviation worth showing, three an anomaly worth
 * diagnosing — conventional, and deliberately not presented as anything more
 * authoritative than that.
 */
export const FEATURE_BANDS: FeatureBands = {
  deviationBand: 2,
  anomalyBand: 3,
  flatBand: 0.5,
};

/** A cold-start baseline: template reference, low confidence, not learned. */
function templateBaseline(
  tag: TwinScrewTag,
  unit: string,
  centre: number,
  spread: number,
): BaselineRecord {
  return {
    baselineId: `BL-TEMPLATE-${tag}`,
    version: '1',
    // PROVISIONAL, never VALID: DOC-03 §26 reserves VALID for an approved,
    // mature contextual baseline, and nothing here was learned from this
    // machine at all.
    status: 'PROVISIONAL',
    level: 'TEMPLATE_REFERENCE',
    source: 'OEM_ENGINEERING',
    contextId: null,
    configurationVersion: null,
    featureId: tag,
    unit,
    mean: centre,
    median: centre,
    stdDev: spread,
    p05: centre - 1.64 * spread,
    p50: centre,
    p95: centre + 1.64 * spread,
    iqr: 1.35 * spread,
    mad: 0.67 * spread,
    sampleCount: 0,
    learnedFrom: null,
    learnedTo: null,
    confidence: 'LOW',
  };
}

/**
 * Cold-start baselines for the signals a diagnosis actually rests on.
 *
 * Only the signals DOC-04's fault rules read are given one. A baseline for a
 * signal nothing diagnoses from would add confident-looking numbers to the UI
 * without improving any conclusion.
 *
 * The centres are typical steady-production values for a compounding twin
 * screw; the spreads are wide, which is the right direction to be wrong in —
 * a wide baseline under-reports anomalies rather than inventing them.
 */
export const TEMPLATE_BASELINES: Readonly<Partial<Record<TwinScrewTag, BaselineRecord>>> = {
  'TS-P1': templateBaseline('TS-P1', 'MPa', 7.5, 1.2),
  'TS-P2': templateBaseline('TS-P2', 'MPa', 7.0, 1.2),
  'TS-P3': templateBaseline('TS-P3', 'MPa', 8.0, 1.2),
  'TS-P4': templateBaseline('TS-P4', 'MPa', 6.0, 1.0),
  'TS-TM': templateBaseline('TS-TM', 'degC', 215, 8),
  'TS-TZ1': templateBaseline('TS-TZ1', 'degC', 170, 6),
  'TS-TZ2': templateBaseline('TS-TZ2', 'degC', 185, 6),
  'TS-TZ3': templateBaseline('TS-TZ3', 'degC', 200, 6),
  'TS-TZ4': templateBaseline('TS-TZ4', 'degC', 210, 6),
  'TS-TZ5': templateBaseline('TS-TZ5', 'degC', 210, 6),
  'TS-TZ6': templateBaseline('TS-TZ6', 'degC', 205, 6),
  'TS-TZ7': templateBaseline('TS-TZ7', 'degC', 205, 6),
  'TS-TZ8': templateBaseline('TS-TZ8', 'degC', 205, 6),
  'TS-TZ9': templateBaseline('TS-TZ9', 'degC', 205, 6),
  'TS-F1': templateBaseline('TS-F1', 'kg/h', 120, 6),
  'TS-F2': templateBaseline('TS-F2', 'kg/h', 30, 3),
  'TS-S1': templateBaseline('TS-S1', 'rpm', 250, 10),
  'TS-S2': templateBaseline('TS-S2', 'rpm', 250, 10),
  'TS-E1': templateBaseline('TS-E1', 'rpm', 1450, 40),
  'TS-PM1': templateBaseline('TS-PM1', 'kW', 45, 6),
  'TS-T1': templateBaseline('TS-T1', 'degC', 65, 8),
  'TS-T2': templateBaseline('TS-T2', 'degC', 58, 7),
  'TS-T3': templateBaseline('TS-T3', 'degC', 62, 8),
  'TS-V1': templateBaseline('TS-V1', 'mm/s RMS', 2.2, 0.6),
  'TS-V2': templateBaseline('TS-V2', 'mm/s RMS', 2.0, 0.6),
  'TS-V3': templateBaseline('TS-V3', 'mm/s RMS', 2.4, 0.7),
  'TS-V4': templateBaseline('TS-V4', 'mm/s RMS', 2.4, 0.7),
  'TS-V5': templateBaseline('TS-V5', 'mm/s RMS', 2.4, 0.7),
  'TS-PV': templateBaseline('TS-PV', 'MPa', 0.03, 0.008),
  'TS-TV': templateBaseline('TS-TV', 'degC', 200, 8),
  'TS-TT0': templateBaseline('TS-TT0', 'degC', 55, 8),
  'TS-L1': templateBaseline('TS-L1', 'percent', 60, 15),
};

export function qualityConfigFor(tag: TwinScrewTag): QualityConfig {
  return QUALITY_CONFIG[tag] ?? {};
}

export function baselineFor(tag: TwinScrewTag): BaselineRecord | null {
  return TEMPLATE_BASELINES[tag] ?? null;
}
