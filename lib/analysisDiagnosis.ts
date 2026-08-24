import { LEVEL_HEX } from './condition';

// The analysis layer's own vocabulary: what was observed, which rule said so, and
// — the distinction the whole page turns on — whether that rule describes the
// machine or the instrument measuring it.
//
// A rule that fires because a reading has not moved in 38 minutes is not evidence
// about a screw, a bearing or a die. It is evidence about a sensor. Mixing the two
// classes into one severity-sorted list is what makes an analysis page assert
// "sensor cause suspected" in prose while burying the three rules that prove it
// under a heading about boundaries. Classification is therefore a field on the
// rule, not a judgement made later in the UI.

export type EvidenceClass = 'machine' | 'chain';

export const EVIDENCE_LABEL: Record<EvidenceClass, string> = {
  machine: 'Machine',
  chain: 'Measurement chain',
};

// Ordered most severe first. These are distinct kinds of claim, not degrees of one
// claim: a matched fault signature says what is wrong, a breached limit says a
// value went somewhere it must not, and a crossed boundary says a value left the
// reference band it was commissioned against.
export type Severity = 'fault' | 'limit' | 'boundary';

export const SEVERITY_ORDER: Severity[] = ['fault', 'limit', 'boundary'];

export const SEVERITY_LABEL: Record<Severity, string> = {
  fault: 'Detected faults',
  limit: 'Breached limits',
  boundary: 'Boundaries crossed',
};

export const SEVERITY_SHORT: Record<Severity, string> = {
  fault: 'FAULT',
  limit: 'LIMIT',
  boundary: 'BOUNDARY',
};

export const SEVERITY_BLURB: Record<Severity, string> = {
  fault: 'A signature the model recognises',
  limit: 'Above a hard limit',
  boundary: 'Outside its registered reference',
};

// Stays inside the existing ULTRON palette rather than introducing a fourth hue:
// faults take critical, limits take warning, and a crossed boundary takes the gold
// accent — notable, not yet alarming.
export const SEVERITY_HEX: Record<Severity, string> = {
  fault: LEVEL_HEX.danger,
  limit: LEVEL_HEX.alert,
  boundary: '#C9A15C',
};

export const IN_CONTROL_HEX = LEVEL_HEX.normal;

// --- Rules and findings ------------------------------------------------------

export type Exceedance = {
  // Signed, in the signal's own unit. The design this replaces printed a bare
  // "+38" in a column shared by rpm, mm/s and dimensionless ratios, which cannot
  // be read: the unit travels with the number here.
  value: number;
  unit: string;
  decimals: number;
};

export type RuleHit = {
  id: string;
  // Rule identifier as configured, e.g. TH-FROZEN-REPEAT.
  code: string;
  // What the rule measures, in words.
  label: string;
  evidenceClass: EvidenceClass;
  // Both as display strings: a rule's reference may be a duration, a ratio or a
  // value in engineering units, and forcing them into one numeric type would mean
  // formatting them wrong somewhere.
  reference: string;
  observed: string;
  exceedance: Exceedance | null;
  // How long the rule has been continuously true.
  activeForMinutes: number;
};

export type Finding = {
  id: string;
  severity: Severity;
  headline: string;
  // The signal it fired on.
  signalCode: string;
  signalLabel: string;
  unit: string;
  rules: RuleHit[];
  // An analyst's note, where one rule set needs interpreting as a group.
  note?: string;
};

// --- Derived: what the evidence adds up to -----------------------------------

export function findingEvidenceClass(finding: Finding): EvidenceClass | 'mixed' {
  const classes = new Set(finding.rules.map((r) => r.evidenceClass));
  if (classes.size === 0) return 'machine';
  if (classes.size > 1) return 'mixed';
  return classes.has('chain') ? 'chain' : 'machine';
}

// A signal is unverified when anything about its measurement chain is in doubt.
// The page must not present such a reading as a fact about the machine, and this
// is the one place that decision is made — the banner, the signal strips and the
// evidence rows all read it from here.
export function unverifiedSignals(findings: Finding[]): Set<string> {
  const unverified = new Set<string>();
  for (const finding of findings) {
    for (const rule of finding.rules) {
      if (rule.evidenceClass === 'chain') unverified.add(finding.signalCode);
    }
  }
  return unverified;
}

export type AnalysisCounts = {
  // Findings and rules are counted separately and labelled separately. Conflating
  // them is what produced a sidebar reading "Faults 7" beside a filter chip
  // reading "Faults 4" on the same screen.
  findingsBySeverity: Record<Severity, number>;
  rulesBySeverity: Record<Severity, number>;
  totalFindings: number;
  totalRules: number;
  machineRules: number;
  chainRules: number;
  // Machine-class rules that fired on a signal whose own measurement chain is in
  // doubt. This is the number that actually matters, and it took seeing the page
  // rendered to notice it was missing: a bare "7 machine rules vs 4 chain rules"
  // reads as "mostly a machine problem", when a single frozen sensor can make the
  // machine rules sitting on that signal worthless. Counting them separately is
  // what lets the page say which machine evidence still stands.
  machineRulesOnUnverifiedSignals: number;
};

export function countAnalysis(findings: Finding[]): AnalysisCounts {
  const unverified = unverifiedSignals(findings);
  const findingsBySeverity: Record<Severity, number> = { fault: 0, limit: 0, boundary: 0 };
  const rulesBySeverity: Record<Severity, number> = { fault: 0, limit: 0, boundary: 0 };
  let machineRules = 0;
  let chainRules = 0;
  let machineRulesOnUnverifiedSignals = 0;

  for (const finding of findings) {
    findingsBySeverity[finding.severity] += 1;
    rulesBySeverity[finding.severity] += finding.rules.length;
    for (const rule of finding.rules) {
      if (rule.evidenceClass === 'chain') {
        chainRules += 1;
      } else {
        machineRules += 1;
        if (unverified.has(finding.signalCode)) machineRulesOnUnverifiedSignals += 1;
      }
    }
  }

  return {
    findingsBySeverity,
    rulesBySeverity,
    totalFindings: findings.length,
    totalRules: machineRules + chainRules,
    machineRules,
    chainRules,
    machineRulesOnUnverifiedSignals,
  };
}

export function worstSeverity(findings: Finding[]): Severity | null {
  for (const severity of SEVERITY_ORDER) {
    if (findings.some((f) => f.severity === severity)) return severity;
  }
  return null;
}

// --- The leading hypothesis ---------------------------------------------------

export type Hypothesis = {
  label: string;
  // Whether the leading explanation is the machine or the instrumentation.
  cause: EvidenceClass;
  // True when the evidence points at one component rather than the machine at
  // large. An unlocalised hypothesis is a weaker claim and should read as one.
  localised: boolean;
  affectedSubsystem: string;
  statement: string;
  // How many other explanations the installed sensor set cannot separate from
  // this one. The honest denominator behind a "leading" hypothesis.
  indistinguishableAlternatives: number;
  // A relative ranking score, if the model produces one. Deliberately not a
  // probability: see confidenceStatement.
  matchScore?: number;
  // Whether this machine has a fault-probability model that has been calibrated
  // against outcomes. Almost never true, and the page must not imply otherwise.
  calibrated: boolean;
};

// What the page is allowed to say about certainty. An uncalibrated model can rank
// hypotheses but cannot put a percentage on one, and printing "87% confidence"
// off a match score is the single most misleading thing an analysis layer can do.
export function confidenceStatement(hypothesis: Hypothesis): string {
  if (hypothesis.calibrated) return 'Confidence is calibrated against recorded outcomes for this machine.';

  const alternatives = hypothesis.indistinguishableAlternatives;
  const score = hypothesis.matchScore;

  const ranked =
    alternatives > 0
      ? `Ranked ahead of ${alternatives} other explanation${alternatives === 1 ? '' : 's'} the installed sensors cannot separate from it.`
      : 'No competing explanation was separable from this one.';

  const scoring = score !== undefined ? ` Match score ${score} is a ranking, not a probability.` : '';

  return `${ranked}${scoring} This machine has no calibrated fault-probability model, so no percentage confidence is reported.`;
}

export type Verdict = {
  level: 'fault' | 'limit' | 'boundary' | 'clear';
  // "Warning" / "Fault" / "Advisory" — the word at the top of the page.
  headline: string;
  // Set when the leading hypothesis is about the instrument rather than the
  // machine, which changes what the reader should do next.
  chainSuspected: boolean;
  // True when no machine-class evidence survives, i.e. the machine's condition
  // cannot be confirmed from the sensors installed.
  machineUnconfirmable: boolean;
};

const HEADLINE: Record<Severity, string> = {
  fault: 'Fault',
  limit: 'Warning',
  boundary: 'Advisory',
};

export function deriveVerdict(findings: Finding[], hypothesis: Hypothesis | null): Verdict {
  const worst = worstSeverity(findings);
  const counts = countAnalysis(findings);
  const chainSuspected = hypothesis?.cause === 'chain';

  // A fault is a claim about the machine, and it cannot be made on readings whose
  // instruments are themselves in doubt. When the leading explanation is the
  // measurement chain, the page steps the headline down rather than asserting a
  // fault it would have to retract — which is exactly why the source design read
  // "Warning" while listing detected faults.
  const headline = worst ? (chainSuspected && worst === 'fault' ? HEADLINE.limit : HEADLINE[worst]) : 'In control';

  return {
    level: worst ?? 'clear',
    headline,
    chainSuspected,
    // If every rule that fired describes the measurement chain, nothing here is
    // evidence about the machine at all.
    machineUnconfirmable: counts.totalRules > 0 && counts.machineRules === 0,
  };
}

export function verdictHex(verdict: Verdict): string {
  return verdict.level === 'clear' ? IN_CONTROL_HEX : SEVERITY_HEX[verdict.level];
}

// --- Signals ------------------------------------------------------------------

export type SignalState = 'in-control' | 'boundary' | 'limit' | 'fault';

export const SIGNAL_STATE_LABEL: Record<SignalState, string> = {
  'in-control': 'IN CONTROL',
  boundary: 'BOUNDARY',
  limit: 'LIMIT',
  fault: 'FAULT',
};

export const SIGNAL_STATE_HEX: Record<SignalState, string> = {
  'in-control': IN_CONTROL_HEX,
  boundary: SEVERITY_HEX.boundary,
  limit: SEVERITY_HEX.limit,
  fault: SEVERITY_HEX.fault,
};

export type AnalysisSignal = {
  code: string;
  label: string;
  unit: string;
  value: number;
  decimals: number;
  // The commissioned reference band and the hard limit, so a strip can show how
  // much headroom is left rather than just a number. Either may be absent.
  reference?: { target: number; tolerance: number };
  limit?: number;
  // Display span for the bar.
  range: { min: number; max: number };
  state: SignalState;
  // Qualifier under the value: "flat 38 min, unverified".
  qualifier?: string;
};

// Formats a signed exceedance with its unit, so the number can be read on its own.
export function formatExceedance(exceedance: Exceedance | null): string {
  if (!exceedance) return '--';
  const sign = exceedance.value > 0 ? '+' : '';
  return `${sign}${exceedance.value.toFixed(exceedance.decimals)} ${exceedance.unit}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours % 1 === 0 ? hours : hours.toFixed(1)} h`;
  return `${Math.round(hours / 24)} d`;
}
