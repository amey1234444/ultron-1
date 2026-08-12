// Scenario execution and scoring.
//
// Turns one of the twin's 61 verified scenarios into a diagnostic request, runs
// it through the same pipeline the live path uses, and scores the answer against
// the acceptance class the twin declares for that case.
//
// Two rules carried over from the twin's harness, and they are the reason its
// results mean anything:
//
//  1. **The detector is never told the answer.** The request carries measurements
//     only — no scenario id, no fault id, no expected result. `runScenario`
//     builds the request from `scenario.measurements` and nothing else, and the
//     expected outcome is only consulted afterwards, to score a diagnosis that
//     has already finished.
//  2. **`expectedFaultIds` is what was injected, not what must be reported.**
//     Whether the detector is supposed to name it is decided by the acceptance
//     class. A fault that is undetectable with this sensor package
//     (`PASS_NOT_IDENTIFIABLE`) passes by reporting nothing at all.

import { analyzeExtruder, type ExtruderAnalysisResult, type ExtruderInputReading } from './pipeline';
import type { Scenario } from './scenarios';
import { CANONICAL_UNITS, TAG_LABELS, type ExtruderTag } from './signalMap';

/**
 * The point label each tag is submitted under.
 *
 * These match the pilot template's own point names, so a scenario run exercises
 * exactly the same label -> tag resolution that live data goes through rather
 * than bypassing it.
 */
export const SCENARIO_POINT_LABELS: Record<ExtruderTag, string> = {
  E1: 'Motor Shaft Speed',
  V1: 'Motor Vibration',
  V2: 'Gearbox Vibration',
  T1: 'Barrel Zone 1 Temperature',
  T2: 'Barrel Zone 2 Temperature',
  T3: 'Barrel Zone 3 Temperature',
  T4: 'Motor Temperature',
  T5: 'Gearbox Temperature',
  P1: 'Melt Pressure',
  L1: 'Hopper Level',
  'PM1.current': 'Motor Current',
  'PM1.power': 'Electrical Power',
  'PM1.voltage': 'Line Voltage',
  'PM1.power_factor': 'Power Factor',
};

/** Canonical-unit readings for a scenario. Carries measurements only — never a label. */
export function readingsForScenario(scenario: Scenario, now: string): ExtruderInputReading[] {
  return (Object.entries(scenario.measurements) as [ExtruderTag, number | null][])
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([tag, value]) => ({
      label: SCENARIO_POINT_LABELS[tag] ?? TAG_LABELS[tag],
      value,
      unit: CANONICAL_UNITS[tag],
      quality: 'GOOD',
      valid: true,
      timestamp: now,
      source: 'manual' as const,
    }));
}

export type ScenarioVerdict = 'PASS' | 'DEVIATION' | 'NOT_REPRODUCIBLE';

export type ScenarioRun = {
  scenario: Scenario;
  analysis: ExtruderAnalysisResult;
  /** What the pipeline actually raised. */
  actualFaultIds: string[];
  /** What the twin injected. Not necessarily what must be reported. */
  expectedFaultIds: string[];
  verdict: ScenarioVerdict;
  /** Plain-language statement of why the verdict is what it is. */
  rationale: string;
};

function score(scenario: Scenario, actual: string[]): { verdict: ScenarioVerdict; rationale: string } {
  const expected = [...scenario.expectedFaultIds].sort();
  const got = [...actual].sort();

  if (scenario.unsupported) {
    return {
      verdict: 'NOT_REPRODUCIBLE',
      rationale: scenario.unsupported,
    };
  }

  switch (scenario.acceptance) {
    case 'PASS_HEALTHY':
      return got.length === 0
        ? { verdict: 'PASS', rationale: 'No condition was injected and none was reported.' }
        : { verdict: 'DEVIATION', rationale: `Nothing was injected, but ${got.join(', ')} was reported.` };

    case 'PASS_NOT_IDENTIFIABLE':
      return got.length === 0
        ? {
            verdict: 'PASS',
            rationale: `${expected.join(', ')} was injected, but it is not identifiable with the installed sensor package. Reporting nothing is the correct answer — ${scenario.notes || 'the measurement that would separate it does not exist on this machine'}.`,
          }
        : {
            verdict: 'DEVIATION',
            rationale: `This condition is not identifiable with the installed sensors, so nothing should have been named, yet ${got.join(', ')} was reported.`,
          };

    case 'PASS_UNIQUE':
      return got.length === expected.length && got.every((id, index) => id === expected[index])
        ? { verdict: 'PASS', rationale: 'The single expected hypothesis was isolated.' }
        : {
            verdict: 'DEVIATION',
            rationale: `Expected exactly ${expected.join(', ')}; got ${got.join(', ') || 'nothing'}.`,
          };

    default:
      // PASS_AMBIGUOUS / PASS_FAMILY / PASS_TEMPORAL. An empty expected set means
      // a transition case: nothing was injected, so nothing must be reported.
      if (expected.length === 0) {
        return got.length === 0
          ? { verdict: 'PASS', rationale: 'An operating-state transition, correctly reported as no fault.' }
          : { verdict: 'DEVIATION', rationale: `A state transition should raise nothing; got ${got.join(', ')}.` };
      }
      if (got.length === 0) {
        return { verdict: 'DEVIATION', rationale: `Expected one or more of ${expected.join(', ')}; got nothing.` };
      }
      const outside = got.filter((id) => !expected.includes(id));
      return outside.length === 0
        ? {
            verdict: 'PASS',
            rationale:
              got.length === 1
                ? 'The reported hypothesis is inside the acceptable set.'
                : `Ambiguity retained across ${got.length} hypotheses, all inside the acceptable set — which is the correct answer when the installed sensors cannot separate them.`,
          }
        : {
            verdict: 'DEVIATION',
            rationale: `${outside.join(', ')} is outside the acceptable set ${expected.join(', ')}.`,
          };
  }
}

/**
 * Run one scenario and score it.
 *
 * The scenario's own measurement sequences are supplied as history, which is what
 * lets the temporal cases (heater failure vs degradation, sensor drift vs offset)
 * resolve at all.
 */
export function runScenario(scenario: Scenario, now = new Date().toISOString()): ScenarioRun {
  const analysis = analyzeExtruder({
    readings: readingsForScenario(scenario, now),
    history: scenario.history,
    now,
  });
  const actualFaultIds = analysis.extruder.candidateFaults;
  const { verdict, rationale } = score(scenario, actualFaultIds);
  return {
    scenario,
    analysis,
    actualFaultIds,
    expectedFaultIds: scenario.expectedFaultIds,
    verdict,
    rationale,
  };
}
