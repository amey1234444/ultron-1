import type { RotaryAirlockAnalysisResult } from './rotaryAirlockAnalyzer';

// Contract for the machine Overview analysis. The browser owns the calculation
// (it is the only place that sees the mapped live signals in real time) and
// posts the result here; the server validates it and stores it so the trends,
// history and maintenance records survive a reload.

export type OverviewFinding = {
  title: string;
  urgency: string;
  confidence: number;
  evidence: string[];
  contradictions: string[];
};

export type OverviewEvidence = {
  code: string;
  label: string;
  value: number;
  unit: string;
  level: 'critical' | 'warning' | 'normal';
};

export type OverviewAnalysisInput = {
  machineTemplate: string;
  generatedAt: string;
  readinessPercent: number;
  readinessLabel: string;
  conditionScore: number;
  conditionLabel: string;
  operatingState: string;
  stateConfidence: number;
  mappedCount: number;
  expectedPoints: number;
  liveCount: number;
  vibrationSpread: number | null;
  rpmDeviationPercent: number | null;
  temperatureDelta: number | null;
  pressureDifferential: number | null;
  priorityFinding: string;
  blockers: string[];
  weakSignals: string[];
  findings: OverviewFinding[];
  topEvidence: OverviewEvidence[];
  deepAnalysis: RotaryAirlockAnalysisResult;
};

export type OverviewHistoryPoint = {
  id: string;
  generatedAt: string;
  readinessPercent: number;
  conditionScore: number;
  conditionLabel: string;
  operatingState: string;
  liveCount: number;
  mappedCount: number;
  vibrationSpread: number | null;
  rpmDeviationPercent: number | null;
  temperatureDelta: number | null;
  pressureDifferential: number | null;
  priorityFinding: string;
};

export class OverviewAnalysisError extends Error {}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new OverviewAnalysisError(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function str(source: Record<string, unknown>, field: string, fallback?: string): string {
  const value = source[field];
  if (typeof value === 'string') return value.slice(0, 400);
  if (fallback !== undefined) return fallback;
  throw new OverviewAnalysisError(`${field} must be a string.`);
}

function num(source: Record<string, unknown>, field: string, min: number, max: number): number {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new OverviewAnalysisError(`${field} must be a number.`);
  return Math.min(max, Math.max(min, value));
}

function nullableNum(source: Record<string, unknown>, field: string): number | null {
  const value = source[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new OverviewAnalysisError(`${field} must be a number or null.`);
  return value;
}

function strList(source: Record<string, unknown>, field: string, limit = 20): string[] {
  const value = source[field];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new OverviewAnalysisError(`${field} must be an array.`);
  return value.filter((item): item is string => typeof item === 'string').slice(0, limit).map((item) => item.slice(0, 400));
}

function timestamp(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new OverviewAnalysisError(`${field} must be an ISO timestamp.`);
  return new Date(value).toISOString();
}

function parseFindings(value: unknown): OverviewFinding[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new OverviewAnalysisError('findings must be an array.');
  return value.slice(0, 10).map((entry, index) => {
    const finding = record(entry, `findings[${index}]`);
    return {
      title: str(finding, 'title'),
      urgency: str(finding, 'urgency', 'Low'),
      confidence: num(finding, 'confidence', 0, 100),
      evidence: strList(finding, 'evidence'),
      contradictions: strList(finding, 'contradictions'),
    };
  });
}

function parseEvidence(value: unknown): OverviewEvidence[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new OverviewAnalysisError('topEvidence must be an array.');
  return value.slice(0, 24).map((entry, index) => {
    const item = record(entry, `topEvidence[${index}]`);
    const level = str(item, 'level', 'normal');
    return {
      code: str(item, 'code'),
      label: str(item, 'label', ''),
      value: num(item, 'value', -1e9, 1e9),
      unit: str(item, 'unit', ''),
      level: level === 'critical' || level === 'warning' ? level : 'normal',
    };
  });
}

// The deep analyzer result is produced by the shared analyzer module, so only
// its identifying envelope is verified before it is stored verbatim.
function parseDeepAnalysis(value: unknown): RotaryAirlockAnalysisResult {
  const deep = record(value, 'deepAnalysis');
  if (deep.model !== 'rotary_airlock_valve') throw new OverviewAnalysisError('deepAnalysis.model is not supported.');
  for (const key of ['readiness', 'operatingState', 'anomaly', 'maintenance', 'doctorReport', 'plantSummary'] as const) {
    record(deep[key], `deepAnalysis.${key}`);
  }
  for (const key of ['derived', 'quality', 'baselines', 'diagnoses'] as const) {
    if (!Array.isArray(deep[key])) throw new OverviewAnalysisError(`deepAnalysis.${key} must be an array.`);
  }
  return deep as unknown as RotaryAirlockAnalysisResult;
}

export function parseOverviewAnalysis(raw: unknown): OverviewAnalysisInput {
  const body = record(raw, 'body');
  return {
    machineTemplate: str(body, 'machineTemplate', ''),
    generatedAt: timestamp(body, 'generatedAt'),
    readinessPercent: Math.round(num(body, 'readinessPercent', 0, 100)),
    readinessLabel: str(body, 'readinessLabel', ''),
    conditionScore: Math.round(num(body, 'conditionScore', 0, 100)),
    conditionLabel: str(body, 'conditionLabel', ''),
    operatingState: str(body, 'operatingState', 'Unknown'),
    stateConfidence: Math.round(num(body, 'stateConfidence', 0, 100)),
    mappedCount: Math.round(num(body, 'mappedCount', 0, 100_000)),
    expectedPoints: Math.round(num(body, 'expectedPoints', 0, 100_000)),
    liveCount: Math.round(num(body, 'liveCount', 0, 100_000)),
    vibrationSpread: nullableNum(body, 'vibrationSpread'),
    rpmDeviationPercent: nullableNum(body, 'rpmDeviationPercent'),
    temperatureDelta: nullableNum(body, 'temperatureDelta'),
    pressureDifferential: nullableNum(body, 'pressureDifferential'),
    priorityFinding: str(body, 'priorityFinding', ''),
    blockers: strList(body, 'blockers'),
    weakSignals: strList(body, 'weakSignals'),
    findings: parseFindings(body.findings),
    topEvidence: parseEvidence(body.topEvidence),
    deepAnalysis: parseDeepAnalysis(body.deepAnalysis),
  };
}
