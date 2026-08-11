import { analyzeExtruder, type ExtruderInputReading } from '../../lib/analysis/extruder';
import type { OverviewAnalysisInput, OverviewHistoryPoint } from '../../lib/analysis/overviewSnapshot';
import { analyzeRotaryAirlock, type AnalysisReading, type AnalysisSignalCode } from '../../lib/analysis/rotaryAirlockAnalyzer';
import type { MachineAnalysisResult } from '../../lib/analysis/types';
import type { DeviceNode } from '../../lib/devices';
import { applyLiveStatus, latestMeasurementForChannel } from '../../lib/liveTelemetry';
import { listChannels, type CardNode } from '../../lib/rack';
import { ensureSchema, isDbEnabled, query } from './db';
import { ApiError } from './errors';
import { getWorkspace, type Layout } from './workspace';
import { getLiveState } from './telemetry';

type LayoutBox = {
  id?: string;
  label?: string;
  channelId?: string;
};

type SnapshotRow = { id: string };

const LABEL_TO_SIGNAL: { match: RegExp; code: AnalysisSignalCode }[] = [
  { match: /motor.*current|current/i, code: 'motor_current' },
  { match: /rotor.*speed|speed|rpm/i, code: 'rotor_speed' },
  { match: /de.*bearing.*temp|drive.*bearing.*temp/i, code: 'de_bearing_temperature' },
  { match: /nde.*bearing.*temp|non.*drive.*bearing.*temp/i, code: 'nde_bearing_temperature' },
  { match: /de.*vib|drive.*vib/i, code: 'de_vibration_acceleration_rms' },
  { match: /nde.*vib|non.*drive.*vib/i, code: 'nde_vibration_acceleration_rms' },
  { match: /inlet.*pressure/i, code: 'inlet_pressure' },
  { match: /outlet.*pressure|discharge.*pressure/i, code: 'outlet_pressure' },
  { match: /material.*temp/i, code: 'material_temperature' },
];

function signalCodeFor(label: string): AnalysisSignalCode | null {
  return LABEL_TO_SIGNAL.find((entry) => entry.match.test(label))?.code ?? null;
}

function channelNumber(channelId: string): number {
  const match = channelId.match(/\.CH(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function boxes(layout: Layout | undefined): LayoutBox[] {
  return Array.isArray(layout?.boxes) ? (layout.boxes as LayoutBox[]) : [];
}

function readingForMappedBox(
  box: LayoutBox,
  channel: ReturnType<typeof listChannels>[number],
  devices: DeviceNode[],
  cards: CardNode[],
  live: Awaited<ReturnType<typeof getLiveState>>,
): AnalysisReading | null {
  if (!box.channelId) return null;
  const code = signalCodeFor(`${box.label ?? ''} ${channel.label}`);
  if (!code) return null;
  const rack = devices.find((device) => device.id === channel.rackId);
  const card = cards.find((candidate) => candidate.deviceId === channel.rackId && candidate.slot === channel.slot);
  if (!rack || !card) return null;
  const measurement = latestMeasurementForChannel(rack, card, channelNumber(box.channelId), live);
  if (!measurement) return null;
  return {
    code,
    value: measurement.value,
    unit: measurement.unit,
    quality: measurement.quality,
    valid: measurement.measurementValid,
    timestamp: measurement.updatedAt,
    source: 'gateway',
  };
}

// The extruder model resolves its canonical pilot tags from the mapped point's
// own label, so a box only has to be named for the instrument it is wired to.
function extruderReadingForMappedBox(
  box: LayoutBox,
  channel: ReturnType<typeof listChannels>[number],
  devices: DeviceNode[],
  cards: CardNode[],
  live: Awaited<ReturnType<typeof getLiveState>>,
): ExtruderInputReading | null {
  if (!box.channelId) return null;
  const rack = devices.find((device) => device.id === channel.rackId);
  const card = cards.find((candidate) => candidate.deviceId === channel.rackId && candidate.slot === channel.slot);
  if (!rack || !card) return null;
  const measurement = latestMeasurementForChannel(rack, card, channelNumber(box.channelId), live);
  if (!measurement) return null;
  return {
    // Resolve on the box label alone (falling back to the channel label when the
    // box is unnamed), so a card's own wording cannot leak into the tag match.
    label: (box.label ?? '').trim() || channel.label,
    value: measurement.value,
    unit: measurement.unit || channel.unit,
    quality: measurement.quality,
    valid: measurement.measurementValid,
    timestamp: measurement.updatedAt,
    source: 'gateway',
  };
}

/**
 * Analysis models available server-side, keyed by machine template.
 *
 * Both models produce a `MachineAnalysisResult`, so everything downstream —
 * the durable `analysis_*` tables, the Overview deep-analyzer panel and the
 * Analysis tab's shared panels — stays model-agnostic.
 */
const ANALYSIS_TEMPLATES = new Set(['Rotary Airlock Valve', 'Single Screw Extruder']);

export async function runMachineAnalysis(machineId: string): Promise<MachineAnalysisResult> {
  if (!isDbEnabled()) throw new ApiError(503, 'DATABASE_URL is required for durable analysis.');
  await ensureSchema();
  const workspace = await getWorkspace();
  if (!workspace) throw new ApiError(503, 'Workspace persistence is not available.');
  const machine = workspace.machines.find((candidate) => candidate.id === machineId);
  if (!machine) throw new ApiError(404, 'Machine not found.');
  if (!ANALYSIS_TEMPLATES.has(machine.template)) {
    throw new ApiError(400, `No analysis model exists for the ${machine.template} template.`);
  }

  const live = await getLiveState();
  const liveDevices = applyLiveStatus(workspace.devices, live);
  const channels = listChannels(liveDevices, workspace.cards);
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const mapped = boxes(workspace.layouts[machineId])
    .map((box) => {
      const channel = box.channelId ? byId.get(box.channelId) : undefined;
      return channel ? { box, channel } : null;
    })
    .filter((entry): entry is { box: LayoutBox; channel: ReturnType<typeof listChannels>[number] } => entry !== null);

  const now = new Date().toISOString();
  let result: MachineAnalysisResult;
  if (machine.template === 'Single Screw Extruder') {
    const readings = mapped
      .map(({ box, channel }) => extruderReadingForMappedBox(box, channel, liveDevices, workspace.cards, live))
      .filter((reading): reading is ExtruderInputReading => reading !== null);
    result = analyzeExtruder({ readings, now, machineCount: workspace.machines.length });
  } else {
    const readings = mapped
      .map(({ box, channel }) => readingForMappedBox(box, channel, liveDevices, workspace.cards, live))
      .filter((reading): reading is AnalysisReading => reading !== null);
    result = analyzeRotaryAirlock({ readings, now, machineCount: workspace.machines.length });
  }

  await persistAnalysisSnapshot(machine.id, machine.template, result);
  return result;
}

export async function persistAnalysisSnapshot(machineId: string, machineTemplate: string, result: MachineAnalysisResult): Promise<number> {
  const title = result.diagnoses[0]?.title ?? '';
  const snapshot = await query<SnapshotRow>(
    `INSERT INTO analysis_snapshots
       (machine_id, machine_template, model_key, model_version, generated_at, readiness_score,
        operating_state, anomaly_state, anomaly_severity, condition_title, maintenance_priority, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
     RETURNING id`,
    [
      machineId,
      machineTemplate,
      result.model,
      result.modelVersion,
      result.generatedAt,
      result.readiness.score,
      result.operatingState.state,
      result.anomaly.state,
      result.anomaly.severity,
      title,
      result.maintenance.priority,
      JSON.stringify(result),
    ],
  );
  const snapshotId = Number(snapshot.rows[0]?.id);
  for (const quality of result.quality) {
    await query(
      `INSERT INTO analysis_signal_quality
         (snapshot_id, machine_id, signal_code, status, checks, limitations, latest_value, unit)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)`,
      [snapshotId, machineId, quality.code, quality.status, JSON.stringify(quality.checks), JSON.stringify(quality.limitations), quality.latestValue, quality.unit],
    );
  }
  for (const baseline of result.baselines) {
    await query(
      `INSERT INTO analysis_baselines
         (machine_id, signal_code, model_key, maturity, sample_count, median, mad, payload, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now())
       ON CONFLICT (machine_id, signal_code, model_key)
       DO UPDATE SET maturity = EXCLUDED.maturity, sample_count = EXCLUDED.sample_count,
                     median = EXCLUDED.median, mad = EXCLUDED.mad, payload = EXCLUDED.payload,
                     updated_at = now()`,
      [machineId, baseline.code, result.model, baseline.maturity, baseline.sampleCount, baseline.median, baseline.mad, JSON.stringify(baseline)],
    );
  }
  if (result.anomaly.state !== 'none') {
    await query(
      `INSERT INTO analysis_anomaly_episodes
         (machine_id, state, severity, score, contributors, payload)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
      [machineId, result.anomaly.state, result.anomaly.severity, result.anomaly.score, JSON.stringify(result.anomaly.contributors), JSON.stringify(result.anomaly)],
    );
  }
  if (result.maintenance.caseRequired) {
    await query(
      `INSERT INTO analysis_maintenance_cases
         (machine_id, snapshot_id, title, priority, recommended_actions, verification_steps, similar_case_signals)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)`,
      [
        machineId,
        snapshotId,
        result.maintenance.title,
        result.maintenance.priority,
        JSON.stringify(result.maintenance.recommendedActions),
        JSON.stringify(result.maintenance.verificationSteps),
        JSON.stringify(result.maintenance.similarCaseSignals),
      ],
    );
  }
  return snapshotId;
}

// Stores an Overview analysis that was calculated in the browser: the deep
// analyzer result lands in the same durable tables as a server-side run, plus a
// row of the Overview's own readiness/condition metrics for the trend charts.
export async function persistOverviewAnalysis(
  machineId: string,
  input: OverviewAnalysisInput,
): Promise<{ snapshotId: number; overviewId: string }> {
  if (!isDbEnabled()) throw new ApiError(503, 'DATABASE_URL is required for durable analysis.');
  await ensureSchema();
  const workspace = await getWorkspace();
  const machine = workspace?.machines.find((candidate) => candidate.id === machineId);
  if (!machine) throw new ApiError(404, 'Machine not found.');

  const snapshotId = await persistAnalysisSnapshot(machine.id, machine.template, input.deepAnalysis);
  const overview = await query<{ id: string }>(
    `INSERT INTO analysis_overview_snapshots
       (machine_id, machine_template, generated_at, readiness_percent, readiness_label,
        condition_score, condition_label, operating_state, state_confidence, mapped_count,
        expected_points, live_count, vibration_spread, rpm_deviation_percent, temperature_delta,
        pressure_differential, priority_finding, source, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'frontend',$18::jsonb)
     RETURNING id`,
    [
      machine.id,
      machine.template,
      input.generatedAt,
      input.readinessPercent,
      input.readinessLabel,
      input.conditionScore,
      input.conditionLabel,
      input.operatingState,
      input.stateConfidence,
      input.mappedCount,
      input.expectedPoints,
      input.liveCount,
      input.vibrationSpread,
      input.rpmDeviationPercent,
      input.temperatureDelta,
      input.pressureDifferential,
      input.priorityFinding,
      JSON.stringify({
        blockers: input.blockers,
        weakSignals: input.weakSignals,
        findings: input.findings,
        topEvidence: input.topEvidence,
      }),
    ],
  );
  return { snapshotId, overviewId: String(overview.rows[0]?.id ?? '') };
}

type OverviewRow = {
  id: string;
  generated_at: string | Date;
  readiness_percent: number;
  condition_score: number;
  condition_label: string;
  operating_state: string;
  live_count: number;
  mapped_count: number;
  vibration_spread: number | null;
  rpm_deviation_percent: number | null;
  temperature_delta: number | null;
  pressure_differential: number | null;
  priority_finding: string;
};

function toHistoryPoint(row: OverviewRow): OverviewHistoryPoint {
  return {
    id: String(row.id),
    generatedAt: new Date(row.generated_at).toISOString(),
    readinessPercent: Number(row.readiness_percent),
    conditionScore: Number(row.condition_score),
    conditionLabel: row.condition_label,
    operatingState: row.operating_state,
    liveCount: Number(row.live_count),
    mappedCount: Number(row.mapped_count),
    vibrationSpread: row.vibration_spread === null ? null : Number(row.vibration_spread),
    rpmDeviationPercent: row.rpm_deviation_percent === null ? null : Number(row.rpm_deviation_percent),
    temperatureDelta: row.temperature_delta === null ? null : Number(row.temperature_delta),
    pressureDifferential: row.pressure_differential === null ? null : Number(row.pressure_differential),
    priorityFinding: row.priority_finding,
  };
}

export async function getOverviewHistory(machineId: string, limit = 120): Promise<OverviewHistoryPoint[]> {
  if (!isDbEnabled()) return [];
  await ensureSchema();
  const rows = await query<OverviewRow>(
    `SELECT id, generated_at, readiness_percent, condition_score, condition_label, operating_state,
            live_count, mapped_count, vibration_spread, rpm_deviation_percent, temperature_delta,
            pressure_differential, priority_finding
     FROM analysis_overview_snapshots
     WHERE machine_id = $1
     ORDER BY generated_at DESC
     LIMIT $2`,
    [machineId, Math.min(500, Math.max(1, limit))],
  );
  // Oldest first so the trend charts read left-to-right.
  return rows.rows.map(toHistoryPoint).reverse();
}

export async function getLatestAnalysisSnapshot(machineId: string): Promise<MachineAnalysisResult | null> {
  if (!isDbEnabled()) return null;
  await ensureSchema();
  const result = await query<{ payload: MachineAnalysisResult }>(
    `SELECT payload FROM analysis_snapshots WHERE machine_id = $1 ORDER BY generated_at DESC LIMIT 1`,
    [machineId],
  );
  return result.rows[0]?.payload ?? null;
}

export async function getAnalysisUiBundle(machineId: string): Promise<{
  latest: MachineAnalysisResult | null;
  snapshots: unknown[];
  episodes: unknown[];
  cases: unknown[];
  overview: OverviewHistoryPoint[];
}> {
  if (!isDbEnabled()) return { latest: null, snapshots: [], episodes: [], cases: [], overview: [] };
  await ensureSchema();
  const [snapshots, episodes, cases, overview] = await Promise.all([
    query(
      `SELECT id, generated_at, readiness_score, operating_state, anomaly_state,
              anomaly_severity, condition_title, maintenance_priority, payload
       FROM analysis_snapshots
       WHERE machine_id = $1
       ORDER BY generated_at DESC
       LIMIT 50`,
      [machineId],
    ),
    query(
      `SELECT id, started_at, last_seen_at, resolved_at, state, severity, score, contributors, payload
       FROM analysis_anomaly_episodes
       WHERE machine_id = $1
       ORDER BY last_seen_at DESC
       LIMIT 50`,
      [machineId],
    ),
    query(
      `SELECT id, snapshot_id, title, priority, status, recommended_actions,
              verification_steps, similar_case_signals, created_at, updated_at, closed_at
       FROM analysis_maintenance_cases
       WHERE machine_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [machineId],
    ),
    getOverviewHistory(machineId),
  ]);
  const latest = (snapshots.rows[0] as { payload?: MachineAnalysisResult } | undefined)?.payload ?? null;
  return { latest, snapshots: snapshots.rows, episodes: episodes.rows, cases: cases.rows, overview };
}
