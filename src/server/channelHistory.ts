import { createHash } from 'crypto';

import { decodeChannelHistorySamples, encodeChannelHistorySamples, type EncodedChannelHistoryChunk } from '../../lib/channelHistoryCodec';
import { ensureSchema, query } from './db';

export type ChannelHistoryWrite = {
  gatewayId: string;
  rackId: string | number;
  slotId: number;
  channelId: number;
  measurementType?: string | null;
  value: number;
  timestampMs: number;
  unit?: string | null;
  quality?: string | null;
  cardType?: string | null;
  sensor?: string | null;
};

export type CloudHistoryPoint = {
  t: number;
  v: number;
  value: number;
  sourceTimestampUs: string;
};

type ChunkRow = {
  payload: EncodedChannelHistoryChunk;
};

type LegacyRow = {
  value: number;
  source_timestamp_us: string;
};

const ENCODING = 'delta-varint-f64xor-v1';

function pointKey(sample: ChannelHistoryWrite): string {
  return [
    sample.gatewayId,
    String(sample.rackId),
    sample.slotId,
    sample.channelId,
    sample.measurementType ?? '',
  ].join('|');
}

function chunkId(key: string, first: number, last: number, count: number, payload: EncodedChannelHistoryChunk): string {
  return createHash('sha1').update(`${key}|${first}|${last}|${count}|${payload.td}|${payload.vx}`).digest('hex');
}

function toPoint(t: number, v: number): CloudHistoryPoint {
  return { t, v, value: v, sourceTimestampUs: String(Math.round(t * 1000)) };
}

export async function storeCompressedHistoryMeasurements(samples: ChannelHistoryWrite[]): Promise<number> {
  const valid = samples.filter(
    (sample) =>
      sample.gatewayId &&
      String(sample.rackId) &&
      Number.isInteger(sample.slotId) &&
      Number.isInteger(sample.channelId) &&
      Number.isFinite(sample.value) &&
      Number.isFinite(sample.timestampMs),
  );
  if (valid.length === 0) return 0;

  await ensureSchema();
  const groups = new Map<string, ChannelHistoryWrite[]>();
  for (const sample of valid) {
    const key = pointKey(sample);
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }

  let stored = 0;
  for (const [key, group] of groups) {
    const ordered = [...group].sort((a, b) => a.timestampMs - b.timestampMs);
    const first = Math.round(ordered[0].timestampMs);
    const last = Math.round(ordered[ordered.length - 1].timestampMs);
    const payload = encodeChannelHistorySamples(ordered.map((sample) => ({ t: sample.timestampMs, v: sample.value })));
    const firstSample = ordered[0];
    const result = await query(
      `INSERT INTO measurement_history_chunks (
         id, gateway_id, rack_id, slot_id, channel_id, measurement_type, unit,
         quality, card_type, sensor, first_timestamp_ms, last_timestamp_ms,
         sample_count, encoding, payload, created_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,now())
       ON CONFLICT (id) DO NOTHING`,
      [
        chunkId(key, first, last, ordered.length, payload),
        firstSample.gatewayId,
        String(firstSample.rackId),
        firstSample.slotId,
        firstSample.channelId,
        firstSample.measurementType ?? '',
        firstSample.unit ?? '',
        firstSample.quality ?? 'GOOD',
        firstSample.cardType ?? null,
        firstSample.sensor ?? null,
        first,
        last,
        ordered.length,
        ENCODING,
        JSON.stringify(payload),
      ],
    );
    stored += result.rowCount ?? 0;
  }
  return stored;
}

export async function getCompressedMeasurementHistory(
  gatewayId: string,
  rackId: string | number,
  slotId: number,
  channelId: number,
  limit: number,
  fromMs?: number,
  toMs?: number,
): Promise<CloudHistoryPoint[]> {
  await ensureSchema();
  const upper = Number.isFinite(toMs) ? Number(toMs) : Date.now();
  const lower = Number.isFinite(fromMs) ? Number(fromMs) : 0;
  const cappedLimit = Math.min(Math.max(Math.round(limit), 1), 8000);
  const chunks = await query<ChunkRow>(
    `SELECT payload
     FROM measurement_history_chunks
     WHERE gateway_id = $1
       AND rack_id = $2
       AND slot_id = $3
       AND channel_id = $4
       AND last_timestamp_ms >= $5
       AND first_timestamp_ms <= $6
     ORDER BY last_timestamp_ms DESC
     LIMIT $7`,
    [gatewayId, String(rackId), slotId, channelId, lower, upper, Math.max(200, cappedLimit)],
  );

  const byTimestamp = new Map<number, number>();
  for (const row of chunks.rows) {
    for (const sample of decodeChannelHistorySamples(row.payload)) {
      if (sample.t < lower || sample.t > upper) continue;
      byTimestamp.set(sample.t, sample.v);
    }
  }

  if (byTimestamp.size === 0) {
    const legacy = await query<LegacyRow>(
      `SELECT value, source_timestamp_us FROM measurement_history
       WHERE gateway_id = $1 AND rack_id = $2 AND slot_id = $3 AND channel_id = $4
       ORDER BY source_timestamp_us DESC LIMIT $5`,
      [gatewayId, String(rackId), slotId, channelId, cappedLimit],
    );
    return legacy.rows
      .map((row) => {
        const t = Math.round(Number(row.source_timestamp_us) / 1000);
        return toPoint(t, row.value);
      })
      .filter((point) => Number.isFinite(point.t) && point.t >= lower && point.t <= upper)
      .reverse();
  }

  return [...byTimestamp.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-cappedLimit)
    .map(([t, v]) => toPoint(t, v));
}
