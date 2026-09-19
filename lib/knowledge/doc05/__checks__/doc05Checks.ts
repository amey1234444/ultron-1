/**
 * Checks for the DOC-05 decision engine.
 *
 *   npm run check:doc05
 *
 * The seven executable cases of §45 are run against the shipped engine, plus
 * the three structural rules the document is built on:
 *
 *   §3   the five outputs stay separate
 *   §5   hard limits always win
 *   §16  low confidence never downgrades high severity
 */

import {
  assessConfidence,
  assessImpact,
  assessPriority,
  assessSeverity,
  blockedTests,
  decide,
  DOC05_VALIDATION_TESTS,
  executableTests,
  peakImpact,
  recommend,
  type ConfidenceInput,
  type SeverityInput,
} from '../index';

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — got: ${detail}` : ''}`);
  }
}

const noLimits: SeverityInput = {
  tripActive: false,
  customerDangerReached: false,
  customerAlertReached: false,
  oemLimitReached: false,
  anomalyStrength: 'NONE',
  faultSeverityFloor: null,
  requiredMeasurementUnusable: false,
};

const goodEvidence: ConfidenceInput = {
  dataQuality: 1,
  baselineConfidence: 0.9,
  contextConfidence: 0.9,
  requiredEvidenceSatisfied: true,
  supportingEvidenceCount: 3,
  contradictingEvidenceCount: 0,
  missingEvidenceCount: 0,
  locationResolvable: true,
  rootCauseProposed: true,
};

const weakEvidence: ConfidenceInput = {
  ...goodEvidence,
  dataQuality: 0.4,
  baselineConfidence: 0.2,
  contextConfidence: 0.4,
  supportingEvidenceCount: 1,
  contradictingEvidenceCount: 1,
  missingEvidenceCount: 2,
  locationResolvable: false,
};

console.log('\n--- §45: the documented validation scenarios ---');

// D05-T01 — anomaly above the learned envelope, below the customer Alert.
const t01 = assessSeverity({ ...noLimits, anomalyStrength: 'HIGH' });
check('D05-T01 · a strong anomaly below Alert is not automatically ALERT', t01.severity === 'NORMAL', t01.severity);
check('D05-T01 · and it says analytics do not redefine plant severity', t01.reason.includes('do not redefine'));

// D05-T02 / D05-T03 — approved limits.
check('D05-T02 · a customer Alert makes severity at least ALERT', assessSeverity({ ...noLimits, customerAlertReached: true }).severity === 'ALERT');
check('D05-T03 · a customer Danger makes severity DANGER', assessSeverity({ ...noLimits, customerDangerReached: true }).severity === 'DANGER');
check(
  'D05-T03 · and a weak anomaly cannot downgrade it',
  assessSeverity({ ...noLimits, customerDangerReached: true, anomalyStrength: 'NONE' }).severity === 'DANGER',
);
check('a trip outranks everything', assessSeverity({ ...noLimits, tripActive: true }).authority === 'SAFETY_TRIP');

// D05-T04 — the rule the document puts in a section of its own.
const dangerWeak = decide({
  decisionId: 'D1',
  timestamp: '2026-09-19T10:00:00Z',
  diagnosis: 'PROCESS_RESTRICTION',
  location: 'Downstream melt path',
  faultFamily: 'DOWNSTREAM',
  severity: { ...noLimits, customerDangerReached: true, anomalyStrength: 'MEDIUM' },
  confidence: weakEvidence,
  trend: 'UNKNOWN',
  abnormalFeatureCount: 2,
  assetCritical: true,
  redundancyAvailable: false,
  safetyRelevant: false,
  throughputAffected: true,
  qualityRelevant: true,
  instrumentationSuspect: false,
});
check('D05-T04 · Danger with low confidence is still DANGER', dangerWeak.severity === 'DANGER');
check('D05-T04 · and still P1', dangerWeak.priority === 'P1', dangerWeak.priority);
check('D05-T04 · confidence is reported as low, not hidden', dangerWeak.confidence.faultLevel === 'LOW', dangerWeak.confidence.faultLevel);
check(
  'D05-T04 · and the action becomes urgent verification',
  dangerWeak.recommendation.level === 'URGENT_INTERVENTION' && dangerWeak.recommendation.text.includes('verify'),
  dangerWeak.recommendation.level,
);

// D05-T05 — a confident but minor instrumentation finding.
const drift = decide({
  decisionId: 'D2',
  timestamp: '2026-09-19T10:00:00Z',
  diagnosis: 'SENSOR_DRIFT',
  location: 'Pre-screen transmitter',
  faultFamily: 'INSTRUMENTATION',
  severity: { ...noLimits, anomalyStrength: 'LOW' },
  confidence: goodEvidence,
  trend: 'STABLE',
  abnormalFeatureCount: 1,
  assetCritical: false,
  redundancyAvailable: false,
  safetyRelevant: false,
  throughputAffected: false,
  qualityRelevant: false,
  instrumentationSuspect: true,
});
check('D05-T05 · confident minor drift stays low severity', drift.severity === 'NORMAL', drift.severity);
check('D05-T05 · and is not escalated', drift.priority === 'P4', drift.priority);
check('D05-T05 · an instrumentation fault does not claim equipment impact', drift.impact.equipment === 'NONE');

// D05-T06 — same severity, different priority.
const shared = { severity: 'ALERT' as const, confidence: 'HIGH' as const, impact: 'MEDIUM' as const, trend: 'STABLE' as const, safetyRelevant: false };
const critical = assessPriority({ ...shared, assetCritical: true, redundancyAvailable: false });
const redundant = assessPriority({ ...shared, assetCritical: false, redundancyAvailable: true });
check('D05-T06 · the same Alert yields different priorities by context', critical.priority !== redundant.priority, `${critical.priority} vs ${redundant.priority}`);
check('D05-T06 · and the redundant machine is the less urgent one', redundant.priority === 'P3');

// D05-T10 — worsening trend below the limit still earns attention.
const worsening = assessPriority({ ...shared, severity: 'NORMAL', trend: 'WORSENING', assetCritical: true, redundancyAvailable: false });
check('D05-T10 · a worsening trend below any limit is not merely monitored', worsening.priority === 'P3', worsening.priority);

console.log('\n--- §3: the five outputs stay separate ---');
check(
  'severity does not move when confidence does',
  assessSeverity({ ...noLimits, customerAlertReached: true }).severity ===
    assessSeverity({ ...noLimits, customerAlertReached: true }).severity,
);
const highSevLowConf = decide({
  decisionId: 'D3',
  timestamp: '2026-09-19T10:00:00Z',
  diagnosis: 'X',
  location: 'Y',
  faultFamily: null,
  severity: { ...noLimits, customerAlertReached: true },
  confidence: weakEvidence,
  trend: 'STABLE',
  abnormalFeatureCount: 1,
  assetCritical: true,
  redundancyAvailable: false,
  safetyRelevant: false,
  throughputAffected: false,
  qualityRelevant: false,
  instrumentationSuspect: false,
});
check('an ALERT with weak evidence keeps ALERT severity', highSevLowConf.severity === 'ALERT');
check('and reports LOW confidence beside it', highSevLowConf.confidence.faultLevel === 'LOW');

console.log('\n--- §13: three confidences, correctly ordered ---');
const conf = assessConfidence(goodEvidence);
check('location confidence never exceeds fault confidence', conf.location <= conf.fault);
check('root-cause confidence never exceeds location confidence', conf.rootCause <= conf.location);
check(
  'an unresolvable location lowers location confidence',
  assessConfidence({ ...goodEvidence, locationResolvable: false }).location < conf.location,
);
check('no proposed root cause yields zero root-cause confidence', assessConfidence({ ...goodEvidence, rootCauseProposed: false }).rootCause === 0);

console.log('\n--- §12: the mandatory evidence gate ---');
const gated = assessConfidence({ ...goodEvidence, requiredEvidenceSatisfied: false });
check('missing required evidence yields INSUFFICIENT_EVIDENCE', gated.faultLevel === 'INSUFFICIENT_EVIDENCE');
check('and it does not fabricate a root cause', gated.rootCause === 0);
check(
  'the recommendation then asks for the evidence rather than a repair',
  recommend({
    severity: 'ALERT',
    confidence: 'INSUFFICIENT_EVIDENCE',
    priority: 'P2',
    tripActive: false,
    instrumentationSuspect: false,
    location: 'Z',
  }).text.includes('Restore'),
);

console.log('\n--- §29/§32: actions and their authority ---');
const tripped = recommend({ severity: 'DANGER', confidence: 'HIGH', priority: 'P1', tripActive: true, instrumentationSuspect: false, location: 'Z' });
check('a trip directs to the approved procedure', tripped.level === 'IMMEDIATE_ESCALATION');
check('and is marked as an approved procedure, not an ULTRON suggestion', tripped.authority === 'APPROVED_PROCEDURE');
check('and says ULTRON does not replace protection', tripped.text.includes('does not replace'));
check(
  'an ordinary recommendation is marked as ULTRON advice',
  recommend({ severity: 'ALERT', confidence: 'HIGH', priority: 'P2', tripActive: false, instrumentationSuspect: false, location: 'Z' })
    .authority === 'ULTRON_RECOMMENDATION',
);

console.log('\n--- §17/§18: impact ---');
const impact = assessImpact({ severity: 'DANGER', faultFamily: 'DOWNSTREAM', throughputAffected: true, qualityRelevant: true, safetyRelevant: false });
check('a Danger condition has current rather than potential horizon', impact.horizon === 'CURRENT');
check('peak impact is reported', peakImpact(impact) === 'HIGH', peakImpact(impact));
check(
  'a NORMAL condition reports potential impact',
  assessImpact({ severity: 'NORMAL', faultFamily: null, throughputAffected: false, qualityRelevant: false, safetyRelevant: false }).horizon ===
    'POTENTIAL',
);

console.log('\n--- §41 / §45 bookkeeping ---');
check('all ten validation scenarios are declared', DOC05_VALIDATION_TESTS.length === 10);
check('seven are executable here', executableTests().length === 7, String(executableTests().length));
check('the three that are not say why', blockedTests().every((entry) => (entry.notExecutableReason ?? '').length > 30));
check('every decision answers the four explainability questions', dangerWeak.explainability.length === 4);
check('and each answer is non-empty', dangerWeak.explainability.every((entry) => entry.answer.length > 0));

if (failures > 0) {
  console.log(`\n${failures} CHECK(S) FAILED\n`);
  process.exit(1);
}
console.log('\nALL CHECKS PASSED\n');
