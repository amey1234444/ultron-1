/**
 * Mapped console channels → the ML service's canonical telemetry frame.
 *
 * The link between what the console already holds — a machine, its mapped
 * channels, the rack, and the live state — and what the Python service eats.
 * Without it the service is configured, healthy and permanently idle, because
 * nothing ever posts to it.
 *
 * Three decisions worth stating, because each is a way this could quietly go
 * wrong:
 *
 * **Keyed by analyser tag, not by point code.** `TS-P3` is the instrument the
 * knowledge layer reasons about; `melt-pressure-pre-screen` is where it sits on
 * the drawing. The service's knowledge snapshot is keyed on the tag, so the
 * conversion happens here, once, rather than being half-done in three places.
 *
 * **Values are normalised to canonical units before they leave.** The same
 * `normaliseReading` the existing pipeline uses, so a channel publishing bar
 * arrives as MPa and a channel publishing a unit the tag cannot carry arrives
 * as `null` with the unit preserved — which the service's DQ-008 check then
 * reports, rather than silently comparing a bar reading against an MPa
 * baseline.
 *
 * **Absence and nullity are kept apart.** A channel that is not mapped is
 * simply absent from `channels`; a channel that is mapped but reporting nothing
 * is present with `value: null`. The first is a mapping gap, the second is a
 * sensor problem, and the service's quality engine says different things about
 * them. Collapsing the two would make an unwired machine look like a machine
 * with thirty dead sensors.
 *
 * This module is pure and platform-free: it takes values and returns a plain
 * object. That is what lets the browser drive it for an on-demand inference and
 * the server drive it on a cadence, from one implementation.
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

/** One channel as the console already holds it. Same shape the pipeline takes. */
export type FrameChannel = {
  templatePointCode?: string;
  channel: { rackId: string; slot: number; id: string; unit?: string };
  label: string;
};

export type BuildFrameInput = {
  machineId: string;
  variantId?: string | null;
  configurationVersion?: string | null;
  channels: readonly FrameChannel[];
  devices: readonly DeviceNode[];
  cards: readonly CardNode[];
  live?: LiveState;
  nowMs?: number;

  /** Recipe and material, where the site supplies them. */
  recipeId?: string | null;
  materialId?: string | null;

  /**
   * A change an operator or the control system just commanded.
   *
   * DOC-04 §3 gate 8 reads this, and it is the only way the gate can ever
   * fire: a pressure rise that follows a commanded feed increase is the
   * machine working, not a fault. Nothing on this machine publishes setpoints,
   * so a caller that knows a change was made has to say so.
   */
  commandedChange?: string | null;

  /** Setpoints keyed by the tag whose actual they govern, where published. */
  setpoints?: Partial<Record<TwinScrewTag, number | null>>;

  /** Marks replayed or generated frames. Never inferred. */
  dataSource?: 'REAL' | 'SYNTHETIC' | 'SIMULATION' | 'REPLAY';

  /** Monotonic counter, for the service's duplicate and ordering checks. */
  sequence?: number;
};

/** One channel, in the wire shape the service's schema declares. */
export type FrameChannelPayload = {
  value: number | null;
  unit: string | null;
  source_timestamp: string | null;
  received_at: string | null;
  source_quality: 'GOOD' | 'UNCERTAIN' | 'BAD' | 'MISSING' | null;
  source: string | null;
  alert_active: boolean;
  danger_active: boolean;
  trip_active: boolean;
};

/** The canonical telemetry frame, snake_cased for the Python contract. */
export type TelemetryFramePayload = {
  machine_id: string;
  timestamp: string;
  machine_type: string;
  template_id: string | null;
  configuration_version: string | null;
  context: {
    recipe_id: string | null;
    material_id: string | null;
    commanded_change: string | null;
  };
  channels: Record<string, FrameChannelPayload>;
  setpoints: Record<string, number | null>;
  data_source: string;
  sequence: number | null;
  ingest_metadata: Record<string, unknown>;
};

/**
 * What the build could not do, so a caller can show it rather than guess.
 *
 * Returned alongside the frame instead of thrown: a machine with one
 * mis-scaled channel should still send the other thirty-one, and the service's
 * own quality engine is the right place for the finding to surface.
 */
export type FrameDiagnostics = {
  /** Mapped points whose code is not in the twin-screw registry. */
  unknownPoints: string[];
  /** Tags whose published unit the tag cannot carry, with the message. */
  unitProblems: { tag: string; message: string }[];
  /** Tags present in the mapping but with no live measurement at all. */
  silentTags: string[];
  /** Tags carrying a value in this frame. */
  reportingCount: number;
};

export type BuildFrameResult = {
  frame: TelemetryFramePayload;
  diagnostics: FrameDiagnostics;
};

function channelNumber(id: string): number {
  const match = /(\d+)\s*$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function measurementFor(
  mapped: FrameChannel,
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
 * The gateway's own quality word, when it is one the service recognises.
 *
 * `LiveMeasurement.quality` is a free-form string from the device. Only the
 * four DOC-02 verdicts carry meaning downstream, and a word the service does
 * not know is sent as null rather than passed through — the quality engine
 * would otherwise have to guess what a vendor's "SUSPECT" means, and its own
 * checks are a better answer than a guess.
 */
function sourceQuality(value: string | undefined): FrameChannelPayload['source_quality'] {
  const word = (value ?? '').trim().toUpperCase();
  return word === 'GOOD' || word === 'UNCERTAIN' || word === 'BAD' || word === 'MISSING'
    ? word
    : null;
}

function iso(value: number | string | undefined): string | null {
  if (value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Build one canonical frame from the console's own live state.
 *
 * Mirrors `readChannels` in `lib/knowledge/tse/pipeline.ts` deliberately: the
 * deterministic chain and the ML service must see the same numbers, or a
 * disagreement between them is a disagreement between two readers rather than
 * two judgements. Normalisation happens before the value leaves, for the same
 * reason it does there — an instrument range declared in MPa has to be
 * compared against a value in MPa.
 */
export function buildTelemetryFrame(input: BuildFrameInput): BuildFrameResult {
  const nowMs = input.nowMs ?? Date.now();
  const channels: Record<string, FrameChannelPayload> = {};
  const diagnostics: FrameDiagnostics = {
    unknownPoints: [],
    unitProblems: [],
    silentTags: [],
    reportingCount: 0,
  };

  for (const mapped of input.channels) {
    const point = twinScrewPointByCode(mapped.templatePointCode);
    if (!point) {
      if (mapped.templatePointCode) diagnostics.unknownPoints.push(mapped.templatePointCode);
      continue;
    }

    const tag = point.analyzerTag;
    const measurement = measurementFor(mapped, input.devices, input.cards, input.live);
    const rawUnit = measurement?.unit || mapped.channel.unit || '';
    const raw =
      typeof measurement?.value === 'number' && Number.isFinite(measurement.value)
        ? measurement.value
        : null;

    let value: number | null = null;
    let unit: string | null = rawUnit || null;
    try {
      const normalised = normaliseReading(tag, raw, rawUnit);
      value = normalised.value;
      unit = normalised.unit;
    } catch (error) {
      // A unit the tag cannot carry is a configuration fault, and the value is
      // withheld rather than passed through unconverted. The service reports it
      // as DQ-008 from the unit mismatch it can still see.
      if (error instanceof UnitError) {
        diagnostics.unitProblems.push({ tag, message: error.message });
        value = null;
      } else {
        throw error;
      }
    }

    // Past the grace window the reading is not current. It is sent as null
    // with its original timestamp, so the service's freshness check reports a
    // stale channel rather than this layer silently forward-filling one.
    const updatedMs = measurement ? Date.parse(measurement.updatedAt) : Number.NaN;
    const stale =
      measurement === undefined ||
      measurement.measurementValid === false ||
      !Number.isFinite(updatedMs) ||
      nowMs - updatedMs > CHANNEL_LIVE_GRACE_MS;

    if (measurement === undefined) diagnostics.silentTags.push(tag);

    const finalValue = stale ? null : value;
    if (finalValue !== null) diagnostics.reportingCount += 1;

    channels[tag] = {
      value: finalValue,
      unit,
      source_timestamp: measurement ? iso(measurement.updatedAt) : null,
      received_at: measurement ? iso(measurement.updatedAt) : null,
      source_quality: sourceQuality(measurement?.quality),
      source: measurement ? 'gateway' : null,
      alert_active: measurement?.alertState === 'ACTIVE',
      danger_active: measurement?.dangerState === 'ACTIVE',
      trip_active: false,
    };
  }

  const setpoints: Record<string, number | null> = {};
  for (const [tag, setpoint] of Object.entries(input.setpoints ?? {})) {
    if (setpoint !== undefined) setpoints[tag] = setpoint;
  }

  return {
    frame: {
      machine_id: input.machineId,
      timestamp: new Date(nowMs).toISOString(),
      machine_type: 'TWIN_SCREW_EXTRUDER',
      template_id: input.variantId ?? null,
      configuration_version: input.configurationVersion ?? null,
      context: {
        recipe_id: input.recipeId ?? null,
        material_id: input.materialId ?? null,
        commanded_change: input.commandedChange ?? null,
      },
      channels,
      setpoints,
      data_source: input.dataSource ?? 'REAL',
      sequence: input.sequence ?? null,
      ingest_metadata: {
        mapped_channels: input.channels.length,
        reporting: diagnostics.reportingCount,
        // Carried so a prediction can be traced back to the mapping that fed
        // it, which is half of reproducing one.
        unknown_points: diagnostics.unknownPoints,
        unit_problems: diagnostics.unitProblems.map((entry) => entry.tag),
      },
    },
    diagnostics,
  };
}

/**
 * Whether a frame carries enough to be worth sending.
 *
 * A frame with no reporting channels tells the service nothing it does not
 * already know, and sending one per second from an unwired machine would fill
 * the rolling windows with gaps and the logs with nothing.
 */
export function frameIsWorthSending(result: BuildFrameResult): boolean {
  return result.diagnostics.reportingCount > 0;
}
