import type { AnalysisSignal, Finding } from '../../../../lib/analysisDiagnosis';
import {
  CONSEQUENCE_LABEL,
  TREND_LABEL,
  issueAgeLabel,
  prioritiseIssues,
  type Issue,
  type OverviewCondition,
} from '../../../../lib/analysisOverview';
import type { AnalystHypothesis, DataQuality } from '../../../../lib/advancedDiagnosis';
import type { AnalysisWorkspaceData } from '../AnalysisWorkspace';

export type DiagnosisModelSource = Pick<
  AnalysisWorkspaceData,
  | 'issues'
  | 'signals'
  | 'diagnosisSignals'
  | 'findings'
  | 'hypothesis'
  | 'hypotheses'
  | 'doThis'
  | 'thenConfirm'
  | 'modelCaveat'
  | 'chain'
  | 'conclusion'
  | 'dataQuality'
  | 'prognostics'
>;

export type DiagnosisChainStep = {
  label: string;
  value: string;
  established: boolean;
};

export type DiagnosisDifferential = {
  id: string;
  name: string;
  status: string;
  matchScore: number | null;
  mechanism: string;
  supporting: string[];
  limiting: string[];
  correctiveActions: string[];
};

export type DiagnosisSensorEvidence = {
  id: string;
  measurement: string;
  code: string;
  value: string;
  trend: string;
  quality: string;
  condition: OverviewCondition;
};

export type DiagnosisProblem = {
  id: string;
  title: string;
  condition: OverviewCondition;
  component: string;
  category: string;
  primaryFinding: string;
  matchScore: number | null;
  scoreLabel: string;
  trend: string;
  consequence: string;
  lifecycle: string;
  chain: DiagnosisChainStep[];
  coverageLabel: string;
  differentials: DiagnosisDifferential[];
  supportingEvidence: string[];
  contradictingEvidence: string[];
  missingEvidence: string[];
  sensorEvidence: DiagnosisSensorEvidence[];
  impacts: Array<{ label: string; value: string }>;
  confirmationChecks: string[];
  verification: string[];
};

export type DiagnosisModel = {
  problems: DiagnosisProblem[];
  dataQuality: string;
  modelCaveat: string;
};

const QUALITY_LABEL: Record<DataQuality, string> = {
  good: 'GOOD',
  questionable: 'QUESTIONABLE',
  poor: 'POOR',
  stale: 'STALE',
  missing: 'MISSING',
};

function unique(items: Array<string | undefined | null>): string[] {
  return [...new Set(items.filter((item): item is string => Boolean(item?.trim())).map((item) => item.trim()))];
}

function includesFolded(value: string, query: string): boolean {
  return query.length > 0 && value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function directFindingIds(issue: Issue): string[] {
  if (issue.id.startsWith('dx-')) return [`f-${issue.id.slice(3)}`];
  if (issue.id.startsWith('off-')) return [`f-offline-${issue.id.slice(4)}`];
  if (issue.id.startsWith('frz-')) return [`f-frozen-${issue.id.slice(4)}`];
  if (issue.id === 'chan-inferred-limits') return ['f-inferred-limits'];
  return [];
}

function findingsForIssue(issue: Issue, findings: Finding[]): Finding[] {
  const directIds = new Set(directFindingIds(issue));
  const direct = findings.filter((finding) => directIds.has(finding.id));
  if (direct.length > 0) return direct;

  return findings.filter(
    (finding) =>
      includesFolded(finding.headline, issue.componentLabel) ||
      includesFolded(finding.signalLabel, issue.componentLabel) ||
      includesFolded(finding.headline, issue.title),
  );
}

function hypothesisRelevance(issue: Issue, hypothesis: AnalystHypothesis): number {
  let score = 0;
  if (includesFolded(hypothesis.name, issue.title)) score += 3;
  if (includesFolded(hypothesis.name, issue.componentLabel)) score += 2;
  if (hypothesis.supporting.some((item) => includesFolded(item, issue.componentLabel))) score += 1;
  return score;
}

function hypothesesForIssue(issue: Issue, hypotheses: AnalystHypothesis[]): AnalystHypothesis[] {
  return hypotheses
    .map((hypothesis, index) => ({ hypothesis, index, relevance: hypothesisRelevance(issue, hypothesis) }))
    .sort((a, b) => b.relevance - a.relevance || a.index - b.index)
    .map(({ hypothesis }) => hypothesis);
}

function sensorEvidenceFor(
  issue: Issue,
  findings: Finding[],
  signals: AnalysisSignal[],
  dataQuality: DataQuality,
): DiagnosisSensorEvidence[] {
  const scopedCodes = new Set(findings.map((finding) => finding.signalCode));
  const scoped = signals.filter(
    (signal) => scopedCodes.has(signal.code) || includesFolded(signal.label, issue.componentLabel),
  );

  return scoped.map((signal) => ({
    id: signal.code,
    measurement: signal.label,
    code: signal.code,
    value: `${signal.value.toFixed(signal.decimals)} ${signal.unit}`,
    trend: signal.qualifier ?? TREND_LABEL[issue.trend],
    quality:
      findings.some(
        (finding) =>
          finding.signalCode === signal.code && finding.rules.some((rule) => rule.evidenceClass === 'chain'),
      )
        ? 'UNVERIFIED'
        : QUALITY_LABEL[dataQuality],
    condition: issue.condition,
  }));
}

function conditionForSignal(signal: AnalysisSignal, fallback: OverviewCondition): OverviewCondition {
  if (signal.state === 'fault') return 'danger';
  if (signal.state === 'limit') return 'alert';
  if (signal.state === 'boundary') return fallback === 'healthy' ? 'attention' : fallback;
  return 'healthy';
}

function signalEvidence(signal: AnalysisSignal, dataQuality: DataQuality, condition: OverviewCondition): DiagnosisSensorEvidence {
  return {
    id: signal.code,
    measurement: signal.label,
    code: signal.code,
    value: `${signal.value.toFixed(signal.decimals)} ${signal.unit}`,
    trend: signal.qualifier ?? 'Current value against learned reference.',
    quality: QUALITY_LABEL[dataQuality],
    condition: conditionForSignal(signal, condition),
  };
}

function processRestrictionSignalEvidence(source: DiagnosisModelSource, condition: OverviewCondition): DiagnosisSensorEvidence[] {
  const labels = [
    ['melt', 'pressure'],
    ['motor', 'power'],
    ['motor', 'rpm'],
    ['screw', 'rpm'],
    ['motor', 'de'],
    ['motor', 'nde'],
    ['gearbox', 'output'],
    ['gb', 'output'],
  ];
  const selected: AnalysisSignal[] = [];
  for (const words of labels) {
    const signal = source.diagnosisSignals.find(
      (item) =>
        !selected.some((existing) => existing.code === item.code) &&
        words.every((word) => `${item.label} ${item.code}`.toLocaleLowerCase().includes(word)),
    );
    if (signal) selected.push(signal);
  }
  return selected.map((signal) => signalEvidence(signal, source.dataQuality, condition));
}

function supportingEvidenceFor(findings: Finding[], hypotheses: AnalystHypothesis[]): string[] {
  return unique([
    ...findings.flatMap((finding) =>
      finding.rules.map(
        (rule) =>
          `${finding.signalLabel}: ${rule.observed} against ${rule.reference} (${rule.label.toLocaleLowerCase()}).`,
      ),
    ),
    ...hypotheses.slice(0, 1).flatMap((hypothesis) => hypothesis.supporting),
  ]);
}

function differentialsFor(issue: Issue, hypotheses: AnalystHypothesis[]): DiagnosisDifferential[] {
  if (issue.id === 'dx-process-downstream-restriction') {
    return [
      {
        id: 'cause-screen-pack-restriction',
        name: 'Screen-pack restriction / loading',
        status: 'MOST LIKELY',
        matchScore: 92,
        mechanism:
          'A loading screen pack increases downstream resistance; pressure and motor power rise while motor and screw speeds fall together.',
        supporting: ['Melt pressure and drive load are high together.', 'Motor RPM and screw RPM are both depressed.', 'Zone temperatures and hopper level stay healthy.'],
        limiting: ['Screen-pack differential pressure is not directly instrumented.'],
        correctiveActions: ['Inspect screen pack.', 'Clean or replace if restricted.', 'Restart under comparable conditions and verify recovery.'],
      },
      {
        id: 'cause-die-downstream-restriction',
        name: 'Die / downstream melt-path restriction',
        status: 'LIKELY',
        matchScore: 82,
        mechanism: 'A downstream die or melt-path restriction creates the same pressure/load signature as a blocked screen pack.',
        supporting: ['Melt pressure is elevated.', 'Drive load is elevated while speeds are lower.'],
        limiting: ['The installed scalar data cannot separate die restriction from screen-pack restriction by itself.'],
        correctiveActions: ['Inspect die and downstream melt path.', 'Remove deposits or obstruction.', 'Confirm pressure falls after correction.'],
      },
      {
        id: 'cause-material-viscosity-change',
        name: 'Material viscosity or property change',
        status: 'POSSIBLE',
        matchScore: 64,
        mechanism: 'Higher viscosity material can increase torque and melt pressure without a mechanical defect.',
        supporting: ['Pressure and load moved together.'],
        limiting: ['Temperature zones and melt temperature are healthy, and no material-change record is available here.'],
        correctiveActions: ['Verify resin grade, lot, moisture and process recipe before declaring hardware restriction.'],
      },
      {
        id: 'cause-low-melt-temperature',
        name: 'Low melt temperature / inadequate melting',
        status: 'LESS LIKELY',
        matchScore: 38,
        mechanism: 'Cold melt can increase flow resistance and screw load.',
        supporting: ['The pressure/load symptom family is compatible with poor melting.'],
        limiting: ['Barrel zones and melt temperature are healthy in the reference pattern.'],
        correctiveActions: ['Confirm heater control and melt-temperature calibration only if inspection does not find restriction.'],
      },
      {
        id: 'cause-excessive-feed',
        name: 'Excessive feed or feed disturbance',
        status: 'LOW SUPPORT',
        matchScore: 25,
        mechanism: 'A feed-side disturbance can alter screw loading, but it should show stronger feed/hopper evidence.',
        supporting: ['Drive load is affected.'],
        limiting: ['Hopper level is healthy and the strongest abnormal evidence is downstream pressure.'],
        correctiveActions: ['Check feed settings after downstream restriction checks are complete.'],
      },
    ];
  }

  if (hypotheses.length === 0 || hypothesisRelevance(issue, hypotheses[0]) === 0) {
    return [
      {
        id: `cause-${issue.id}`,
        name: issue.category === 'sensor' ? 'Measurement chain fault' : issue.title,
        status: 'UNRESOLVED',
        matchScore: issue.confidence ?? null,
        mechanism:
          issue.category === 'sensor'
            ? 'The current signal is not trustworthy; telemetry does not isolate the sensor, wiring, rack, or gateway as the failed element.'
            : 'The scalar telemetry identifies this symptom group but does not establish a physical mechanism.',
        supporting: [issue.description],
        limiting: ['No more specific cause is separable from the installed evidence.'],
        correctiveActions: [issue.action],
      },
    ];
  }

  return hypotheses.map((hypothesis) => ({
    id: hypothesis.id,
    name: hypothesis.name,
    status: hypothesis.status.replace('-', ' ').toLocaleUpperCase(),
    matchScore: hypothesis.matchScore ?? null,
    mechanism:
      hypothesis.supporting[0] ??
      'The current data ranks this explanation but does not establish its physical mechanism.',
    supporting: hypothesis.supporting,
    limiting: hypothesis.contradicting,
    correctiveActions: hypothesis.discriminator ? [hypothesis.discriminator] : [],
  }));
}

function impactSummary(issue: Issue): Array<{ label: string; value: string }> {
  const consequence = CONSEQUENCE_LABEL[issue.consequence];
  const notEstablished = (scope: string) => `Current telemetry does not establish a ${scope} impact for this problem.`;

  return [
    {
      label: 'MACHINE IMPACT',
      value:
        issue.category === 'sensor'
          ? 'Machine condition cannot be confirmed from this measurement until the chain is restored.'
          : `${consequence} is the mapped machine consequence if this condition progresses.`,
    },
    {
      label: 'PROCESS IMPACT',
      value: issue.category === 'process' ? issue.description : notEstablished('process'),
    },
    {
      label: 'PRODUCTION IMPACT',
      value:
        issue.consequence === 'unplanned-stop'
          ? 'The current issue mapping identifies a risk of unplanned production interruption.'
          : issue.consequence === 'efficiency'
            ? 'The current issue mapping identifies efficiency loss; throughput impact is not quantified.'
            : notEstablished('production'),
    },
    {
      label: 'QUALITY IMPACT',
      value:
        issue.consequence === 'quality'
          ? 'The current issue mapping identifies product quality as the affected consequence.'
          : notEstablished('quality'),
    },
  ];
}

function buildProblem(issue: Issue, source: DiagnosisModelSource, leadIssueId: string | undefined): DiagnosisProblem {
  const scopedFindings = findingsForIssue(issue, source.findings);
  const rankedHypotheses = hypothesesForIssue(issue, source.hypotheses);
  const relevantHypotheses = rankedHypotheses.filter((hypothesis) => hypothesisRelevance(issue, hypothesis) > 0);
  const primaryHypothesis = relevantHypotheses[0];
  const isProcessRestriction = issue.id === 'dx-process-downstream-restriction';
  const sensors = isProcessRestriction
    ? processRestrictionSignalEvidence(source, issue.condition)
    : sensorEvidenceFor(issue, scopedFindings, source.signals, source.dataQuality);
  const leadMechanism = source.chain.find((step) => includesFolded(step.label, 'failure mechanism'))?.value;
  const immediateAction =
    isProcessRestriction
      ? 'Inspect screen pack, clean or replace if restricted, inspect die/melt path, restart under comparable conditions, then verify recovery.'
      : source.doThis.find((action) => includesFolded(action, issue.componentLabel)) ?? issue.action;

  const mechanism =
    isProcessRestriction
      ? 'Pressure and power rise while motor and screw speeds fall together, which localizes the dominant pattern to downstream melt resistance rather than an isolated motor, gearbox or feeder fault.'
      : issue.id === leadIssueId && leadMechanism
      ? `${leadMechanism} is the current modeled mechanism label. The available scalar telemetry does not establish the full physical sequence.`
      : issue.category === 'sensor'
        ? 'The measurement chain is not producing trustworthy evidence; the available data does not isolate the failed chain element.'
        : 'The available scalar telemetry identifies the symptom pattern but does not establish the physical mechanism for this problem.';

  const missingEvidence = isProcessRestriction
    ? [
        'Screen-pack differential pressure is not directly instrumented.',
        'No waveform, FFT, envelope or bearing metadata is available, so do not call this a bearing or gear fault from scalar trends alone.',
      ]
    : unique([
        primaryHypothesis?.discriminator
          ? `Discriminating check still required: ${primaryHypothesis.discriminator}`
          : 'No discriminating confirmation check is recorded for this problem.',
        source.conclusion.remainingUncertainty || undefined,
      ]);

  const chain = isProcessRestriction
    ? [
        {
          label: 'What is happening',
          value: 'Resistance to polymer flow has increased, raising screw torque demand and drive load.',
          established: true,
        },
        {
          label: 'Where',
          value: 'Downstream melt path, primarily the screen-pack / die region.',
          established: true,
        },
        {
          label: 'Why',
          value: 'Pressure and power rise while motor and screw speeds fall together.',
          established: true,
        },
        {
          label: 'Immediate action',
          value: immediateAction,
          established: true,
        },
      ]
    : [
        { label: 'What is happening', value: issue.description, established: true },
        { label: 'Physical mechanism', value: mechanism, established: Boolean(leadMechanism && issue.id === leadIssueId) },
        {
          label: 'Primary likely cause',
          value:
            primaryHypothesis?.name ??
            (source.hypothesis && includesFolded(source.hypothesis.affectedSubsystem, issue.componentLabel)
              ? source.hypothesis.label
              : 'Not yet narrowed beyond the current problem grouping.'),
          established: false,
        },
        { label: 'Immediate action', value: immediateAction, established: true },
      ];

  return {
    id: issue.id,
    title: issue.title,
    condition: issue.condition,
    component: issue.componentLabel,
    category: issue.category.replace('-', ' ').toLocaleUpperCase(),
    primaryFinding: issue.description,
    matchScore: issue.confidence ?? null,
    scoreLabel: issue.confidence === undefined ? 'MATCH SCORE NOT RATED' : `MATCH SCORE ${issue.confidence}`,
    trend: TREND_LABEL[issue.trend],
    consequence: CONSEQUENCE_LABEL[issue.consequence],
    lifecycle: `ACTIVE ${issueAgeLabel(issue)}`,
    chain,
    coverageLabel: `${sensors.length} SIGNAL${sensors.length === 1 ? '' : 'S'} / ${scopedFindings.length} FINDING${
      scopedFindings.length === 1 ? '' : 'S'
    }`,
    differentials: differentialsFor(issue, rankedHypotheses),
    supportingEvidence: isProcessRestriction
      ? [
          'Melt Pressure is high and points directly to elevated downstream resistance.',
          'Motor Power is high, showing higher drive load.',
          'Motor RPM and Screw RPM are both low, so the drive and screw are being pulled down together.',
          'Motor DE/NDE vibration and Gearbox Output vibration are secondary load responses.',
          'Motor/Screw ratio is effectively unchanged, so the pattern does not isolate a drive-ratio fault.',
        ]
      : supportingEvidenceFor(scopedFindings, relevantHypotheses),
    contradictingEvidence: isProcessRestriction
      ? [
          'Zone temperatures are healthy.',
          'Hopper level is healthy, so feed starvation is not supported.',
          'Gearbox temperature is healthy.',
          'Motor temperature is still inside healthy range.',
          'No bearing or gear fault is confirmed without waveform, FFT or envelope evidence.',
        ]
      : unique(relevantHypotheses.slice(0, 1).flatMap((hypothesis) => hypothesis.contradicting)),
    missingEvidence,
    sensorEvidence: sensors,
    impacts: isProcessRestriction
      ? [
          { label: 'MACHINE IMPACT', value: 'Higher mechanical loading on screw, motor and gearbox.' },
          { label: 'PROCESS IMPACT', value: 'Downstream melt resistance is elevated in the screen-pack / die region.' },
          { label: 'PRODUCTION IMPACT', value: 'Reduced efficiency and escalation risk if the restriction continues.' },
          { label: 'QUALITY IMPACT', value: 'Quality impact is not proven from this snapshot; monitor melt stability after correction.' },
        ]
      : impactSummary(issue),
    confirmationChecks: isProcessRestriction
      ? [
          'Inspect screen pack.',
          'Clean or replace the screen pack if restricted.',
          'Inspect die and downstream melt path.',
          'Restart under comparable conditions.',
          'Verify melt pressure, motor power, motor RPM, screw RPM and vibration recover.',
        ]
      : unique([...relevantHypotheses.slice(0, 2).map((hypothesis) => hypothesis.discriminator), ...source.thenConfirm]),
    verification: isProcessRestriction
      ? ['Melt pressure falls.', 'Motor power falls.', 'Motor and screw RPM recover.', 'Secondary motor/gearbox vibration reduces.']
      : unique(source.thenConfirm),
  };
}

export function buildDiagnosisModel(source: DiagnosisModelSource): DiagnosisModel {
  const orderedIssues = prioritiseIssues(source.issues);
  const leadIssueId = orderedIssues[0]?.id;

  return {
    problems: orderedIssues.map((issue) => buildProblem(issue, source, leadIssueId)),
    dataQuality: QUALITY_LABEL[source.dataQuality],
    modelCaveat:
      source.modelCaveat ??
      'Match scores rank available explanations. They are not probabilities, and the current evidence does not provide calibrated confidence.',
  };
}
