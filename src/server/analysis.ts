import { analyzeRotaryAirlock, type AnalysisReading, type AnalysisSignalCode, type RotaryAirlockAnalysisResult } from '../../lib/analysis/rotaryAirlockAnalyzer';
import type { DeviceNode } from '../../lib/devices';
import { applyLiveStatus, latestMeasurementForChannel } from '../../lib/liveTelemetry';
import { listChannels, type CardNode } from '../../lib/rack';
import { ensureSchema, isDbEnabled, query } from './db';
import { ApiError } from './errors';
import { getWorkspace, type Layout } from './studio';
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

export async function runMachineAnalysis(machineId: string): Promise<RotaryAirlockAnalysisResult> {
  if (!isDbEnabled()) throw new ApiError(503, 'DATABASE_URL is required for durable analysis.');
  await ensureSchema();
  const workspace = await getWorkspace();
  if (!workspace) throw new ApiError(503, 'Workspace persistence is not available.');
  const machine = workspace.machines.find((candidate) => candidate.id === machineId);
  if (!machine) throw new ApiError(404, 'Machine not found.');
  if (machine.template !== 'Rotary Airlock Valve') throw new ApiError(400, 'Only Rotary Airlock Valve analysis is available.');

  const live = await getLiveState();
  const liveDevices = applyLiveStatus(workspace.devices, live);
  const channels = listChannels(liveDevices, workspace.cards);
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const readings = boxes(workspace.layouts[machineId])
    .map((box) => {
      const channel = box.channelId ? byId.get(box.channelId) : undefined;
      return channel ? readingForMappedBox(box, channel, liveDevices, workspace.cards, live) : null;
    })
    .filter((reading): reading is AnalysisReading => reading !== null);

  const result = analyzeRotaryAirlock({ readings, now: new Date().toISOString(), machineCount: workspace.machines.length });
  await persistAnalysisSnapshot(machine.id, machine.template, result);
  return result;
}

export async function persistAnalysisSnapshot(machineId: string, machineTemplate: string, result: RotaryAirlockAnalysisResult): Promise<number> {
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

export async function getLatestAnalysisSnapshot(machineId: string): Promise<RotaryAirlockAnalysisResult | null> {
  if (!isDbEnabled()) return null;
  await ensureSchema();
  const result = await query<{ payload: RotaryAirlockAnalysisResult }>(
    `SELECT payload FROM analysis_snapshots WHERE machine_id = $1 ORDER BY generated_at DESC LIMIT 1`,
    [machineId],
  );
  return result.rows[0]?.payload ?? null;
}

export async function getAnalysisUiBundle(machineId: string): Promise<{
  latest: RotaryAirlockAnalysisResult | null;
  snapshots: unknown[];
  episodes: unknown[];
  cases: unknown[];
}> {
  if (!isDbEnabled()) return { latest: null, snapshots: [], episodes: [], cases: [] };
  await ensureSchema();
  const [snapshots, episodes, cases] = await Promise.all([
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
  ]);
  const latest = (snapshots.rows[0] as { payload?: RotaryAirlockAnalysisResult } | undefined)?.payload ?? null;
  return { latest, snapshots: snapshots.rows, episodes: episodes.rows, cases: cases.rows };
}
