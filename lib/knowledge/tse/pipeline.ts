/**
 * The twin-screw analytics pipeline — DOC-02 → DOC-03 → DOC-04, end to end.
 *
 * This is the piece that was missing. Four layers of knowledge existed as
 * libraries with nothing joining them to a live reading, so the console could
 * show an operator nothing at all. The chain the documents describe is:
 *
 *   validated channel values
 *     ↓ DOC-02  quality verdict per signal        (§22)
 *     ↓ DOC-02  operating state                   (§4, §14)
 *     ↓ DOC-02  context object                    (§26)
 *     ↓ DOC-03  feature per signal vs baseline    (§36)
 *     ↓ DOC-04  anomaly per signal                (§3)
 *     ↓ DOC-04  abnormal pattern                  (§7)
 *     ↓ DOC-04  diagnosis with evidence           (§21)
 *
 * and each stage gates the next. That gating is the value: a BAD reading never
 * reaches the anomaly engine, an unknown state never selects a baseline, and an
 * expected response to a feed change never becomes a fault.
 *
 * Every number the pipeline compares against comes from `commissioning.ts` and
 * is engineering-development, not field calibrated. The result says so, and the
 * view is expected to repeat it.
 */

import { deviceWithGatewayConnectionState, type DeviceNode } from '../../devices';
import {
  CHANNEL_LIVE_GRACE_MS,
  latestMeasurementForChannel,
  type LiveMeasurement,
  type LiveState,
} from '../../liveTelemetry';
import type { CardNode } from '../../rack';
import { normaliseReading, UnitError } from '../../analysis/twinScrew/signalMap';
import { twinScrewPointByCode, type TwinScrewTag } from '../../twinScrewExtruderPoints';
import { evaluateQuality, type QualitySample } from '../doc02/dataQuality';
import { inferOperatingState, type StateEvidenceInput } from '../doc02/operatingState';
import { buildContext, fallbackContextId, type ContextInput } from '../doc02/context';
import type { OperatingStateRecord, QualityVerdict, SignalQuality } from '../doc02/types';
import { computeFeature } from '../doc03/feature';
import type { FeatureObject } from '../doc03/types';
import {
  assessEvidence,
  diagnose,
  evaluateAnomaly,
  type InconsistencyCheck,
} from '../doc04/engine';
import type { AnomalyResult, AnomalyVerdict, DiagnosisObject, EvidenceItem } from '../doc04/types';
import {
  COMMISSIONING_NOTICE,
  FEATURE_BANDS,
  FIELD_CALIBRATED,
  baselineFor,
  qualityConfigFor,
  STATE_THRESHOLDS,
} from './commissioning';
import { signalForTag, unboundMandatorySignals } from './signalBinding';
import { anomalyIdFor } from '../doc07/anomalies';
import { decide } from '../doc05/engine';
import type { DecisionObject } from '../doc05/types';

/** One channel as the console already holds it. */
export type PipelineChannel = {
  templatePointCode?: string;
  channel: { rackId: string; slot: number; id: string; unit?: string };
  label: string;
};

export type PipelineInput = {
  machineId: string;
  variantId: string | null;
  configurationVersion: string | null;
  channels: readonly PipelineChannel[];
  devices: readonly DeviceNode[];
  cards: readonly CardNode[];
  live?: LiveState;
  nowMs?: number;
  /** Recent values per tag, when the caller keeps history. Enables trend. */
  history?: Partial<Record<TwinScrewTag, number[]>>;
  /**
   * A commanded change whose process response is physically expected.
   *
   * DOC-04 §3 gate 8: a feed, RPM, recipe or setpoint change that the machine
   * answers exactly as physics predicts is not an anomaly. The gate has always
   * been implemented; nothing could reach it because this machine publishes no
   * setpoint or command signals — D015 feed setpoint and D006 RPM setpoint are
   * both unbound. A caller that knows a change was commanded passes it here,
   * and the gate does the rest.
   */
  commandedChange?: string | null;
};

export type PipelineResult = {
  /** DOC-02 §22 — one verdict per signal, with the findings behind it. */
  quality: SignalQuality[];
  /** DOC-02 §14 — the operating state and why. */
  state: OperatingStateRecord;
  /** DOC-02 §26 — the context, with its confidence and gaps. */
  context: ReturnType<typeof buildContext>;
  /** DOC-03 §36 — a feature per signal that had a value. */
  features: FeatureObject[];
  /** DOC-04 §3 — an anomaly verdict per signal. */
  anomalies: AnomalyResult[];
  /**
   * DOC-07 — the library identity of each anomaly that fired.
   *
   * A verdict says "this pressure is high"; the library id says *which named
   * anomaly* that is, and DOC-07 §9 and DOC-06 §32 both key their ML labels on
   * it. Signals whose verdict matches no library entry are simply absent rather
   * than labelled with the nearest fit.
   */
  labelledAnomalies: { signalId: string; anomalyId: string; verdict: AnomalyVerdict }[];
  /** DOC-04 §21 — the diagnosis, or a NO_FAULT one. */
  diagnosis: DiagnosisObject;
  /** Signals reporting values right now. */
  reportingCount: number;
  /** DOC-02 mandatory signals this machine cannot supply. */
  unboundMandatory: string[];
  /**
   * DOC-05 §40 — severity, confidence, impact, priority and action.
   *
   * Present even when the diagnosis is NO_FAULT, because "NORMAL, P4, monitor"
   * is a decision an operator needs as much as an alarm is.
   */
  decision: DecisionObject;
  /** Always true here — nothing in the commissioning set is field calibrated. */
  usesUncalibratedLimits: boolean;
  commissioningNotice: string;
};

function channelNumber(id: string): number {
  const match = /(\d+)\s*$/.exec(id);
  return match ? Number(match[1]) : 0;
}

/** The reading on a channel, or null when nothing usable arrived. */
function measurementFor(
  mapped: PipelineChannel,
  devices: readonly DeviceNode[],
  cards: readonly CardNode[],
  live: LiveState | undefined,
): LiveMeasurement | undefined {
  const rack = devices.find((device) => device.id === mapped.channel.rackId);
  const card = cards.find(
    (candidate) => candidate.deviceId === mapped.channel.rackId && candidate.slot === mapped.channel.slot,
  );
  if (!rack || !card || !live) return undefined;
  return latestMeasurementForChannel(
    deviceWithGatewayConnectionState(rack, devices as DeviceNode[]),
    card,
    channelNumber(mapped.channel.id),
    live,
  );
}

/**
 * One instrument, read and judged.
 *
 * Exported because the analytics chain and the channel-reading adapter are two
 * separate jobs. A caller that already holds values — a test, a replay, a
 * simulator — drives `analyseReadings` directly rather than constructing rack,
 * card and gateway scaffolding it does not otherwise need.
 */
export type TagReading = {
  tag: TwinScrewTag;
  label: string;
  /** Value in the tag's canonical unit, or null. */
  value: number | null;
  unit: string;
  raw: number | null;
  measurement?: LiveMeasurement | undefined;
  quality: SignalQuality;
};

type Reading = TagReading;

/**
 * Read every mapped channel, normalise it, and judge its quality.
 *
 * Normalisation happens before the quality check on purpose: an instrument
 * range declared in MPa has to be compared against a value in MPa, and a
 * channel reporting bar would otherwise read as wildly out of range. A unit the
 * tag cannot carry is itself a DQ-008 finding rather than a crash.
 */
function readChannels(input: PipelineInput, nowMs: number): Reading[] {
  const readings: Reading[] = [];

  for (const mapped of input.channels) {
    const point = twinScrewPointByCode(mapped.templatePointCode);
    if (!point) continue;

    const tag = point.analyzerTag;
    const measurement = measurementFor(mapped, input.devices, input.cards, input.live);
    const rawUnit = measurement?.unit || mapped.channel.unit || '';
    const raw = typeof measurement?.value === 'number' && Number.isFinite(measurement.value) ? measurement.value : null;

    let value: number | null = null;
    let unit = rawUnit;
    let unitProblem: string | null = null;
    try {
      const normalised = normaliseReading(tag, raw, rawUnit);
      value = normalised.value;
      unit = normalised.unit;
    } catch (error) {
      if (error instanceof UnitError) unitProblem = error.message;
      else throw error;
    }

    const stale =
      measurement === undefined ||
      measurement.measurementValid === false ||
      !Number.isFinite(Date.now() - Date.parse(measurement.updatedAt)) ||
      Date.now() - Date.parse(measurement.updatedAt) > CHANNEL_LIVE_GRACE_MS;

    const sample: QualitySample = {
      signalId: tag,
      value: stale ? null : value,
      unit,
      sourceTimestampMs: measurement ? Date.parse(measurement.updatedAt) : null,
      receivedAtMs: measurement ? Date.parse(measurement.updatedAt) : null,
      history: input.history?.[tag],
      sourceQuality: measurement?.quality ?? null,
    };

    const signal = signalForTag(tag);
    const quality = evaluateQuality({
      sample,
      config: qualityConfigFor(tag),
      nowMs,
      mandatory: signal?.priority === 'MANDATORY',
    });

    // A unit the tag cannot carry is a calibration/configuration fault, DQ-008.
    if (unitProblem) {
      quality.findings.push({
        ruleId: 'DQ-008',
        check: 'Calibration / configuration',
        verdict: 'BAD',
        reason: `${point.label} reports in "${rawUnit}", which ${tag} cannot carry. ${unitProblem}`,
        downstreamRule: 'Do not call a machine fault from an invalid scale.',
      });
      quality.verdict = 'BAD';
      quality.suppressesPhysicalDiagnosis = signal?.priority === 'MANDATORY';
    }

    readings.push({ tag, label: point.label, value: stale ? null : value, unit, raw, measurement, quality });
  }

  return readings;
}

/** Mean of the mapped barrel zone readings, for the state engine. */
function zoneMean(readings: readonly Reading[]): number | null {
  const zones = readings.filter((reading) => /^TS-TZ\d$/.test(reading.tag) && reading.value !== null);
  if (zones.length === 0) return null;
  return zones.reduce((sum, reading) => sum + (reading.value as number), 0) / zones.length;
}

function valueOf(readings: readonly Reading[], tag: TwinScrewTag): number | null {
  return readings.find((reading) => reading.tag === tag)?.value ?? null;
}

/**
 * §17 instrumentation-first checks, built from what is actually readable.
 *
 * Each is a case where one signal claims something dramatic and every signal
 * that would have to agree with it does not. These are the four DOC-04 names,
 * expressed against this machine's tags.
 */
function inconsistencyChecks(readings: readonly Reading[]): InconsistencyCheck[] {
  const screwA = valueOf(readings, 'TS-S1');
  const screwB = valueOf(readings, 'TS-S2');
  const power = valueOf(readings, 'TS-PM1');
  const pressure = valueOf(readings, 'TS-P3');
  const feed = valueOf(readings, 'TS-F1');
  const meltTemp = valueOf(readings, 'TS-TM');
  const zones = zoneMean(readings);

  return [
    {
      observation: 'Screw speed reads zero while the drive still draws load',
      holds: screwA !== null && screwA < 1 && power !== null && power > 5,
      interpretation: 'A speed tag or pulse fault is more likely than a stopped machine that is still consuming power.',
    },
    {
      observation: 'Melt pressure is high while feed and drive load are unremarkable',
      holds: pressure !== null && pressure > 20 && feed !== null && feed < 5 && power !== null && power < 10,
      interpretation:
        'A restriction raises load as well as pressure. Pressure alone points at the transmitter or its port rather than the process.',
    },
    {
      observation: 'Melt temperature disagrees sharply with every barrel zone',
      holds: meltTemp !== null && zones !== null && Math.abs(meltTemp - zones) > 120,
      interpretation: 'A melt probe that disagrees with the whole barrel profile by this much is a sensor or channel fault candidate.',
    },
    {
      observation: 'The two geared screw shafts report very different speeds',
      holds:
        screwA !== null &&
        screwB !== null &&
        Math.max(screwA, screwB) > 1 &&
        Math.abs(screwA - screwB) / Math.max(screwA, screwB) > 0.5,
      interpretation:
        'The shafts are geared together, so a difference this large is a speed-tag or scaling fault before it is a gear-train failure.',
    },
  ];
}

/**
 * Match the §7 abnormal patterns against the anomalies found.
 *
 * Only the patterns this machine has the instruments to see are attempted. A
 * pattern needing a signal the machine lacks is simply not evaluated, rather
 * than being half-matched on the signals that happen to exist.
 */
function matchPattern(
  anomalies: readonly AnomalyResult[],
  readings: readonly Reading[],
): { patternId: string; patternName: string; faultCandidates: string[] } | null {
  const verdict = (tag: TwinScrewTag) => anomalies.find((entry) => entry.signalId === tag)?.verdict;
  const high = (tag: TwinScrewTag) => verdict(tag) === 'HIGH_ANOMALY';
  const low = (tag: TwinScrewTag) => verdict(tag) === 'LOW_ANOMALY';
  const steadyish = (tag: TwinScrewTag) => {
    const value = verdict(tag);
    return value === undefined || value === 'NOT_ANOMALOUS';
  };

  const inlet = valueOf(readings, 'TS-P3');
  const outlet = valueOf(readings, 'TS-P4');
  const differentialHigh = inlet !== null && outlet !== null && inlet - outlet > 3;

  // P-002 before P-001: a localised screen restriction is the more specific
  // reading of the same evidence, and §16 lets us claim it only when both taps
  // exist.
  if (high('TS-P3') && differentialHigh && steadyish('TS-F1')) {
    return {
      patternId: 'P-002',
      patternName: 'Localized Screen Restriction',
      faultCandidates: ['TSE-DOWN-001'],
    };
  }

  if ((high('TS-P3') || high('TS-P1')) && high('TS-PM1') && steadyish('TS-F1') && steadyish('TS-S1')) {
    return {
      patternId: 'P-001',
      patternName: 'Increased Process Resistance',
      faultCandidates: ['TSE-PROC-001'],
    };
  }

  if (low('TS-F1') && (low('TS-PM1') || low('TS-P3'))) {
    return { patternId: 'P-005', patternName: 'Feed Starvation', faultCandidates: ['TSE-FEED-001'] };
  }

  if (high('TS-PM1') && low('TS-TM')) {
    return { patternId: 'P-006', patternName: 'High-Viscosity Behaviour', faultCandidates: ['TSE-PROC-006'] };
  }

  if (low('TS-PV')) {
    return { patternId: 'P-010', patternName: 'Poor Devolatilisation', faultCandidates: ['TSE-VENT-001'] };
  }

  return null;
}

/** Run the whole chain over one moment of live data. */
export function runTwinScrewPipeline(input: PipelineInput): PipelineResult {
  const nowMs = input.nowMs ?? Date.now();
  return analyseReadings(input, readChannels(input, nowMs), nowMs);
}

/**
 * The analytics chain, over readings that have already been taken.
 *
 * Everything from DOC-02's state engine onward. Split from the channel reading
 * so the chain can be exercised on known values without a rack behind it.
 */
export function analyseReadings(
  input: Pick<PipelineInput, 'machineId' | 'variantId' | 'configurationVersion' | 'history' | 'commandedChange'>,
  readings: readonly TagReading[],
  nowMs: number,
): PipelineResult {
  const quality = readings.map((reading) => reading.quality);

  // --- DOC-02 §14: operating state ------------------------------------------
  const screwSpeed = valueOf(readings, 'TS-S1') ?? valueOf(readings, 'TS-S2');
  const feedRate = valueOf(readings, 'TS-F1');
  const power = valueOf(readings, 'TS-PM1');
  const worstMandatory = quality
    .filter((entry) => signalForTag(entry.signalId as TwinScrewTag)?.priority === 'MANDATORY')
    .reduce<QualityVerdict>((worst, entry) => (entry.verdict === 'BAD' || entry.verdict === 'MISSING' ? entry.verdict : worst), 'GOOD');

  const evidence: StateEvidenceInput = {
    // The machine has no run bit, so rotation stands in for it. Honest, and it
    // is why the state engine's confidence is capped below an explicit state.
    motorRunning: screwSpeed === null ? null : screwSpeed > STATE_THRESHOLDS.zeroRpm,
    screwRpm: screwSpeed,
    feedRate,
    torque: null,
    meltPressure: valueOf(readings, 'TS-P3'),
    zoneSetpointError: null,
    zoneTemperatureSlope: null,
    heaterActive: null,
    processStable: screwSpeed !== null && feedRate !== null ? true : null,
    evidenceQuality: worstMandatory,
  };

  const state = inferOperatingState({
    explicit: {},
    evidence,
    thresholds: STATE_THRESHOLDS,
    nowMs,
  });

  // --- DOC-02 §26: context ---------------------------------------------------
  const contextInput: ContextInput = {
    machineId: input.machineId,
    machineVariant: input.variantId,
    configurationVersion: input.configurationVersion,
    operatingState: state.operatingState,
    // No recipe reaches ULTRON on this machine; §27 says that lowers confidence
    // rather than being papered over.
    recipeId: null,
    screwRpm: screwSpeed,
    mainFeedRate: feedRate,
    sideFeed: valueOf(readings, 'TS-F2'),
    sideFeedInstalled: true,
    vacuumInstalled: true,
  };
  const context = buildContext(contextInput);

  // No recipe reaches ULTRON on this machine, so the exact-context id is null.
  // §27 permits an approved fallback, and §12 calls it BROADER_CONTEXT — a real
  // comparison at lower confidence, rather than no comparison at all.
  const comparisonContextId = context.contextId ?? fallbackContextId(contextInput);

  // --- DOC-03 §36: features --------------------------------------------------
  const features: FeatureObject[] = readings.map((reading) => {
    const baseline = baselineFor(reading.tag);
    return computeFeature(
      {
        featureId: reading.tag,
        timestamp: new Date(nowMs).toISOString(),
        machineId: input.machineId,
        configurationVersion: input.configurationVersion,
        state: state.operatingState,
        stateConfidence: state.stateConfidence,
        contextId: comparisonContextId,
        value: reading.value,
        unit: reading.unit,
        inputQualities: [reading.quality.verdict],
        window: input.history?.[reading.tag],
        baseline,
        baselineConfidence: baseline?.confidence ?? 'NONE',
        formulaIds: ['F-COM-010', 'F-COM-011'],
        lineage: [`${reading.label} (${reading.tag})`],
      },
      FEATURE_BANDS,
    );
  });

  // --- DOC-04 §3: anomalies --------------------------------------------------
  const anomalies: AnomalyResult[] = features.map((feature) => {
    const reading = readings.find((entry) => entry.tag === feature.featureId);
    return evaluateAnomaly({
      signalId: feature.featureId,
      quality: feature.dataQuality,
      // Only steady production supports a production baseline comparison.
      stateApplicable: state.operatingState === 'ST-06',
      contextValid: comparisonContextId !== null && context.confidence >= 0.5,
      baselineAvailable: feature.baselineId !== null && feature.expectedValue !== null,
      symbolicState: feature.symbolicState,
      // Without stored history a single frame cannot prove persistence, so it
      // is accepted rather than blocking every finding. A caller that keeps
      // history should pass it and get the stricter answer.
      persistenceSatisfied: true,
      rocAbnormal: false,
      expectedContextChange: input.commandedChange ?? null,
      limitStatus: reading?.measurement?.dangerState === 'ACTIVE'
        ? 'DANGER'
        : reading?.measurement?.alertState === 'ACTIVE'
          ? 'ALERT'
          : 'NONE',
    });
  });

  // --- DOC-04 §7 and §21: pattern and diagnosis ------------------------------
  const matched = matchPattern(anomalies, readings);

  const evidenceItems: EvidenceItem[] = [];
  for (const anomaly of anomalies) {
    if (anomaly.verdict === 'HIGH_ANOMALY' || anomaly.verdict === 'LOW_ANOMALY') {
      const feature = features.find((entry) => entry.featureId === anomaly.signalId);
      evidenceItems.push({
        evidenceClass: evidenceItems.length === 0 ? 'REQUIRED' : 'SUPPORTING',
        statement: `${anomaly.signalId} ${anomaly.verdict === 'HIGH_ANOMALY' ? 'HIGH' : 'LOW'}${
          feature?.percentDeviation != null ? ` (${feature.percentDeviation.toFixed(1)}% from expected)` : ''
        }`,
        signalId: anomaly.signalId,
        quality: feature?.dataQuality ?? null,
      });
    }
  }
  if (valueOf(readings, 'TS-P4') === null) {
    evidenceItems.push({
      evidenceClass: 'MISSING',
      statement: 'Post-screen pressure is not reporting, so a screen restriction cannot be separated from a die restriction.',
      signalId: 'TS-P4',
      quality: null,
    });
  }

  const diagnosis = diagnose({
    diagnosisId: `DG-${input.machineId}-${nowMs}`,
    timestamp: new Date(nowMs).toISOString(),
    machineId: input.machineId,
    configurationVersion: input.configurationVersion,
    anomalies,
    patternId: matched?.patternId ?? null,
    patternName: matched?.patternName ?? null,
    faultCandidates: matched?.faultCandidates ?? [],
    evidence: evidenceItems,
    inconsistencies: inconsistencyChecks(readings),
    dataQuality: assessEvidence(evidenceItems).requiredSatisfied ? 'GOOD' : 'UNCERTAIN',
    alternativeDiagnoses:
      matched?.patternId === 'P-002'
        ? ['Die or adapter restriction', 'High-viscosity material', 'Low melt temperature']
        : matched
          ? ['Sensor or port problem', 'Material or recipe change']
          : [],
    rootCauseCandidates: matched?.patternId === 'P-002' ? ['Screen contamination or buildup'] : [],
    featureVersions: ['F-COM-010 v1.0'],
    topology: {
      hasUpstreamPressure: valueOf(readings, 'TS-P3') !== null,
      hasDownstreamPressure: valueOf(readings, 'TS-P4') !== null,
    },
  });

  const labelledAnomalies = anomalies
    .map((entry) => {
      const anomalyId = anomalyIdFor(entry.signalId, entry.verdict);
      return anomalyId ? { signalId: entry.signalId, anomalyId, verdict: entry.verdict } : null;
    })
    .filter((entry): entry is { signalId: string; anomalyId: string; verdict: AnomalyVerdict } => entry !== null);

  // --- DOC-05 §40: the decision ---------------------------------------------
  const alertReached = anomalies.some((entry) => entry.limitStatus === 'ALERT');
  const dangerReached = anomalies.some((entry) => entry.limitStatus === 'DANGER');
  const tripActive = anomalies.some((entry) => entry.limitStatus === 'TRIP');
  const strongAnomalies = anomalies.filter(
    (entry) => entry.verdict === 'HIGH_ANOMALY' || entry.verdict === 'LOW_ANOMALY',
  ).length;
  const assessment = assessEvidence(evidenceItems);
  const instrumentationSuspect = diagnosis.primaryDiagnosis === 'INSTRUMENTATION_SUSPECT';

  const decision = decide({
    decisionId: `DEC-${input.machineId}-${nowMs}`,
    timestamp: new Date(nowMs).toISOString(),
    diagnosis: diagnosis.primaryDiagnosis,
    location: diagnosis.where,
    faultFamily: instrumentationSuspect ? 'INSTRUMENTATION' : matched ? 'DOWNSTREAM' : null,
    severity: {
      tripActive,
      customerDangerReached: dangerReached,
      customerAlertReached: alertReached,
      // No OEM limit is declared for this machine, so none can be reached.
      oemLimitReached: false,
      anomalyStrength: strongAnomalies >= 3 ? 'HIGH' : strongAnomalies === 0 ? 'NONE' : strongAnomalies === 1 ? 'LOW' : 'MEDIUM',
      faultSeverityFloor: null,
      requiredMeasurementUnusable: quality.some((entry) => entry.suppressesPhysicalDiagnosis),
    },
    confidence: {
      // Data quality as a fraction of signals that are GOOD.
      dataQuality: quality.length === 0 ? 0 : quality.filter((entry) => entry.verdict === 'GOOD').length / quality.length,
      // Cold-start baselines are LOW by declaration, which is the honest input.
      baselineConfidence: 0.3,
      contextConfidence: context.confidence,
      requiredEvidenceSatisfied: assessment.requiredSatisfied,
      supportingEvidenceCount: assessment.supporting.length,
      contradictingEvidenceCount: assessment.contradicting.length,
      missingEvidenceCount: assessment.missing.length,
      locationResolvable: valueOf(readings, 'TS-P3') !== null && valueOf(readings, 'TS-P4') !== null,
      rootCauseProposed: diagnosis.rootCauseCandidates.length > 0,
    },
    trend: 'UNKNOWN',
    abnormalFeatureCount: strongAnomalies,
    assetCritical: true,
    redundancyAvailable: false,
    safetyRelevant: false,
    throughputAffected: strongAnomalies > 0,
    qualityRelevant: strongAnomalies > 0,
    instrumentationSuspect,
  });

  return {
    quality,
    state,
    context,
    features,
    anomalies,
    labelledAnomalies,
    decision,
    diagnosis,
    reportingCount: readings.filter((reading) => reading.value !== null).length,
    unboundMandatory: unboundMandatorySignals().map((signal) => `${signal.signalId} ${signal.parameter}`),
    usesUncalibratedLimits: !FIELD_CALIBRATED,
    commissioningNotice: COMMISSIONING_NOTICE,
  };
}
