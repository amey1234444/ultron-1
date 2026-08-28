/**
 * The acquisition chain, as data.
 *
 * The Analyzer can say what a parameter reads and what the model concluded from
 * it, but until now it could not answer the question a commissioning engineer
 * actually asks first: *where does this number physically come from*. That path
 * — parameter → gateway → rack → slot → channel → tag — already exists in the
 * workspace, spread across four unrelated structures (the saved canvas boxes,
 * the rack/card tree, the device hierarchy, and the live measurement frames).
 * Nothing here invents any of it; this module only walks those structures once
 * and returns the joined record, so no view has to re-derive it and no two
 * views can disagree about it.
 *
 * Deliberately model-agnostic: the pilot-tag resolution is passed in as a
 * callback, so the extruder model's `resolveSignal` stays in the extruder
 * package and a second machine model can supply its own without touching this
 * file.
 */

import { deviceWithGatewayConnectionState, gatewayForRack, type DeviceNode } from '../devices';
import {
  CHANNEL_LIVE_GRACE_MS,
  latestMeasurementForChannel,
  type LiveMeasurement,
  type LiveState,
} from '../liveTelemetry';
import type { CardNode, ChannelRef } from '../rack';

/**
 * How much to trust the last reading that arrived on this channel.
 *
 * `warning` is specifically "the last value was good but it is going stale" —
 * distinct from `bad`, which is the gateway telling us the reading itself is
 * not to be trusted.
 */
export type ConnectionQuality = 'good' | 'warning' | 'bad' | 'offline';

/** Whether the parameter reaches the diagnostic model at all. */
export type ConnectionState = 'connected' | 'unmapped' | 'offline';

export type ParameterConnection = {
  /** The mapped box's own id — several boxes may point at one channel. */
  parameterId: string;
  /** What the operator named this point on the machine drawing. */
  parameter: string;
  /** Pilot tag the model resolved this onto, or null when it resolved onto none. */
  tag: string | null;
  /** Human sentence for the tag. Null when there is no tag. */
  tagLabel: string | null;

  gatewayId: string;
  gatewayName: string;
  gatewayOnline: boolean;

  rackId: string;
  rackName: string;
  rackOnline: boolean;

  slot: number;
  /** Display id for the acquisition channel, e.g. `CH-04`. */
  channelId: string;
  /** Display id for the physical terminal, e.g. `AI-04`. */
  inputId: string;
  /** The rack's own channel code (V1, T4 …), which the rack UI shows. */
  channelCode: string;

  /** Card model the channel is wired into. */
  cardType: string;
  /** Electrical signal on the terminal, as configured — `4-20 mA`, `Pulse`, … */
  signalType: string;
  /** What kind of value the chain carries once scaled. */
  dataType: string;

  value: number | null;
  unit: string;
  quality: ConnectionQuality;
  /** ISO timestamp of the last measurement, or null when none has arrived. */
  lastUpdatedAt: string | null;
  state: ConnectionState;
  /** Why this row is not connected, when it is not. Empty when it is. */
  note: string;
};

export type ConnectivitySummary = {
  total: number;
  connected: number;
  unmapped: number;
  offline: number;
  gateways: number;
  racks: number;
  channels: number;
};

/** One gateway → rack → channel branch, for the topology view. */
export type ConnectivityTopology = {
  gatewayId: string;
  gatewayName: string;
  online: boolean;
  racks: {
    rackId: string;
    rackName: string;
    online: boolean;
    channels: { parameterId: string; channelId: string; tag: string | null; parameter: string; quality: ConnectionQuality }[];
  }[];
}[];

/** What a caller must tell this module about one mapped point. */
export type ConnectivityInput = {
  id: string;
  label: string;
  channel: ChannelRef;
  templatePointCode?: string;
};

/** Resolution of a point label onto a diagnostic tag, supplied by the model. */
export type TagResolution = { tag: string; label: string } | null;

function channelNumber(channelId: string): number {
  const match = channelId.match(/\.CH(\d+)$/);
  return match ? Number(match[1]) : 1;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * The electrical signal on the terminal, read off the card's own configuration.
 *
 * A vibration card declares its sensor rather than an input type, so that is
 * what is shown for it; falling back to a generic "analog" would be an invented
 * fact where a declared one exists.
 */
function signalTypeFor(card: CardNode | undefined): string {
  if (!card) return 'Unknown';
  const config = card.config;
  if ('inputType' in config && config.inputType) return config.inputType;
  if ('sensorType' in config && config.sensorType.trim()) return config.sensorType.trim();
  if (card.type === 'Vibration Card') return 'IEPE accelerometer';
  if (card.type === 'RTD Card') return 'RTD temperature input';
  if (card.type === 'Universal V/I Card') return 'Universal voltage/current input';
  return 'Unknown';
}

/** What the scaled value represents, keyed off the rack's own channel letter. */
function dataTypeFor(letter: ChannelRef['letter'], card: CardNode | undefined): string {
  if (card?.type === 'Speed Card') return 'Pulse · rate';
  switch (letter) {
    case 'V':
      return 'Analog · vibration';
    case 'T':
      return 'Analog · temperature';
    case 'P':
      return 'Analog · pressure';
    case 'S':
      return 'Pulse · speed';
    case 'C':
      return 'Analog · electrical';
    default:
      return 'Analog · scalar';
  }
}

/** Terminal id. Pulse inputs are digital terminals; everything else is analog. */
function inputIdFor(letter: ChannelRef['letter'], card: CardNode | undefined, slot: number): string {
  const digital = card?.type === 'Speed Card' || letter === 'S';
  return `${digital ? 'DI' : 'AI'}-${pad(slot)}`;
}

function qualityFor(measurement: LiveMeasurement | undefined, nowMs: number): ConnectionQuality {
  if (!measurement) return 'offline';
  if (measurement.measurementValid === false) return 'bad';
  if (measurement.quality && measurement.quality !== 'GOOD') return 'bad';
  const ageMs = nowMs - Date.parse(measurement.updatedAt);
  if (!Number.isFinite(ageMs)) return 'bad';
  return ageMs > CHANNEL_LIVE_GRACE_MS ? 'warning' : 'good';
}

function usableValue(measurement: LiveMeasurement | undefined, quality: ConnectionQuality): number | null {
  if (!measurement || quality === 'offline' || quality === 'bad') return null;
  return typeof measurement.value === 'number' && Number.isFinite(measurement.value) ? measurement.value : null;
}

/**
 * Joins every saved mapped point onto the acquisition chain behind it.
 *
 * A point with no live measurement is returned with a null value and an
 * `offline` quality rather than being dropped: "this channel is wired and
 * silent" is the single most useful thing this table can say, and omitting the
 * row would say the opposite.
 */
export function buildParameterConnections({
  points,
  devices,
  cards,
  live,
  resolveTag,
  now = Date.now(),
}: {
  points: ConnectivityInput[];
  devices: DeviceNode[];
  cards: CardNode[];
  live?: LiveState;
  /** Model-supplied: which pilot tag, if any, this point resolves onto. */
  resolveTag: (point: ConnectivityInput) => TagResolution;
  now?: number;
}): ParameterConnection[] {
  return points.map((point) => {
    const rack = devices.find((device) => device.id === point.channel.rackId);
    const card = cards.find(
      (candidate) => candidate.deviceId === point.channel.rackId && candidate.slot === point.channel.slot,
    );
    const gateway = rack ? gatewayForRack(rack, devices) : undefined;
    const rackState = rack ? deviceWithGatewayConnectionState(rack, devices) : undefined;
    const number = channelNumber(point.channel.id);
    const measurement =
      rackState && card && live ? latestMeasurementForChannel(rackState, card, number, live) : undefined;
    const quality = qualityFor(measurement, now);
    const resolution = resolveTag(point);

    const state: ConnectionState =
      !resolution ? 'unmapped' : quality === 'offline' || quality === 'bad' ? 'offline' : 'connected';

    const note = !resolution
      ? 'No diagnostic tag resolved from this point name, so the model does not read it.'
      : quality === 'offline'
        ? 'Wired to the model but no measurement has arrived from the gateway.'
        : quality === 'bad'
          ? 'The gateway is reporting this channel as invalid or bad quality.'
          : quality === 'warning'
            ? 'The last reading is older than the live grace window.'
            : '';

    return {
      parameterId: point.id,
      parameter: point.label,
      tag: resolution?.tag ?? null,
      tagLabel: resolution?.label ?? null,

      gatewayId: gateway?.realGatewayId?.trim() || gateway?.id || '—',
      gatewayName: gateway?.name ?? 'Unassigned gateway',
      gatewayOnline: gateway?.status === 'Online',

      rackId: rack?.realRackId !== undefined && rack?.realRackId !== null ? String(rack.realRackId) : (rack?.id ?? '—'),
      rackName: rack?.name ?? point.channel.deviceName,
      rackOnline: rack?.status === 'Online',

      slot: point.channel.slot,
      channelId: `CH-${pad(number)}`,
      inputId: inputIdFor(point.channel.letter, card, point.channel.slot),
      channelCode: point.channel.code,

      cardType: card?.type ?? 'Unknown card',
      signalType: signalTypeFor(card),
      dataType: dataTypeFor(point.channel.letter, card),

      value: usableValue(measurement, quality),
      unit: measurement?.unit || point.channel.unit,
      quality,
      lastUpdatedAt: measurement?.updatedAt ?? null,
      state,
      note,
    };
  });
}

export function summariseConnections(rows: ParameterConnection[]): ConnectivitySummary {
  return {
    total: rows.length,
    connected: rows.filter((row) => row.state === 'connected').length,
    unmapped: rows.filter((row) => row.state === 'unmapped').length,
    offline: rows.filter((row) => row.state === 'offline').length,
    gateways: new Set(rows.map((row) => row.gatewayName)).size,
    racks: new Set(rows.map((row) => `${row.gatewayName}|${row.rackName}`)).size,
    channels: new Set(rows.map((row) => `${row.rackName}|${row.channelId}`)).size,
  };
}

/**
 * The same rows, nested for the topology sketch.
 *
 * Insertion order is preserved rather than sorted alphabetically: the order the
 * points were saved on the canvas is the order the engineer wired them, and it
 * is more useful than an alphabet.
 */
export function buildTopology(rows: ParameterConnection[]): ConnectivityTopology {
  const gateways = new Map<string, ConnectivityTopology[number]>();
  for (const row of rows) {
    let gateway = gateways.get(row.gatewayName);
    if (!gateway) {
      gateway = { gatewayId: row.gatewayId, gatewayName: row.gatewayName, online: row.gatewayOnline, racks: [] };
      gateways.set(row.gatewayName, gateway);
    }
    let rack = gateway.racks.find((entry) => entry.rackName === row.rackName);
    if (!rack) {
      rack = { rackId: row.rackId, rackName: row.rackName, online: row.rackOnline, channels: [] };
      gateway.racks.push(rack);
    }
    rack.channels.push({
      parameterId: row.parameterId,
      channelId: row.channelId,
      tag: row.tag,
      parameter: row.parameter,
      quality: row.quality,
    });
  }
  return [...gateways.values()];
}

/** "2 sec ago" / "4 min ago" — the form an operator reads freshness in. */
export function relativeAge(iso: string | null, now = Date.now()): string {
  if (!iso) return 'never';
  const ageMs = now - Date.parse(iso);
  if (!Number.isFinite(ageMs)) return 'unknown';
  if (ageMs < 1500) return 'just now';
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)} sec ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)} min ago`;
  if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)} hr ago`;
  return new Date(iso).toLocaleString();
}
