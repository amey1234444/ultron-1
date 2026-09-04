// Shared analysis contract.
//
// Two condition-monitoring models now live in the app — the rotary-airlock
// analyzer and the single-screw-extruder diagnostic pipeline ported from the
// BlackGATE extruder digital twin. Both produce this shape, so the Analysis tab,
// the Overview deep-analyzer panel, and the durable `analysis_*` tables stay
// model-agnostic and only the model-specific extension blocks differ.

import type { DoctorReport, MaintenanceCaseSummary, PlantAnalysisSummary, QualityStatus } from './rotaryAirlockAnalyzer';

export type AnalysisModelKey = 'rotary_airlock_valve' | 'single_screw_extruder';

export type AnalysisSignalReading = {
  code: string;
  value: number | null;
  unit: string;
  quality?: string;
  valid?: boolean;
  timestamp: string;
  source?: 'gateway' | 'derived' | 'demo' | 'manual';
};

export type SignalQuality = {
  code: string;
  status: QualityStatus;
  checks: string[];
  limitations: string[];
  latestValue: number | null;
  unit: string;
};

export type BaselineRecord = {
  code: string;
  available: boolean;
  maturity: 'unavailable' | 'immature' | 'learning' | 'mature';
  sampleCount: number;
  median: number | null;
  mad: number | null;
  limitations: string[];
};

export type AnomalyContribution = {
  code: string;
  score: number;
  direction: 'high' | 'low' | 'normal';
  description: string;
};

export type AnomalySummary = {
  state: 'none' | 'candidate' | 'active' | 'recovering' | 'resolved';
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  score: number;
  contributors: AnomalyContribution[];
  limitations: string[];
};

// `confidence` is only a probability-like number when `confidenceBasis` says so.
// The extruder model has no calibrated fault-probability model for this machine,
// so it reports an ordinal engineering match score and the UI must render the
// match class rather than a percentage.
export type DiagnosisConfidenceBasis = 'CALIBRATED_PROBABILITY' | 'ORDINAL_ENGINEERING_MATCH_SCORE';

export type Diagnosis = {
  code: string;
  title: string;
  confidence: number;
  confidenceBasis?: DiagnosisConfidenceBasis;
  urgency: 'monitor' | 'inspect_soon' | 'inspect_promptly' | 'urgent';
  supporting: string[];
  contradicting: string[];
  limitations: string[];
  immediateAction: string;
  inspection: string[];
};

export type MachineAnalysisResult = {
  model: AnalysisModelKey;
  modelVersion: string;
  generatedAt: string;
  readiness: {
    ready: boolean;
    score: number;
    missingEssential: string[];
    missingDiagnostic: string[];
    limitations: string[];
  };
  derived: AnalysisSignalReading[];
  quality: SignalQuality[];
  baselines: BaselineRecord[];
  operatingState: {
    state: string;
    confidence: number;
    supporting: string[];
    contradicting: string[];
    limitations: string[];
  };
  anomaly: AnomalySummary;
  diagnoses: Diagnosis[];
  maintenance: MaintenanceCaseSummary;
  doctorReport: DoctorReport;
  plantSummary: PlantAnalysisSummary;
};
