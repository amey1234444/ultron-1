import type { DeviceNode } from '../../../../lib/devices';
import type { CardNode, CardType, ChannelRef } from '../../../../lib/rack';

// Who and where a reading is: the identity block on a sensor tile.
//
// Most of this is real and comes straight out of the rack model — the rack, the
// slot, the channel, the card type, the input type, the sensor type and
// sensitivity, and the configured engineering range are all fields the card
// configs already carry. Three things are not, and are marked at the point they
// are produced rather than quietly presented as data:
//
//   * Tag — there is no tag field, so one is composed from the machine name and
//     the channel code. A real plant wants its own ISA-style tag here.
//   * Gateway — the model has no rack-to-gateway relationship at all; both
//     Gateway and Rack devices simply carry a projectId. The best available
//     answer is "the Gateway in this rack's project", and when there isn't one
//     the rack's own endpoint is shown, labelled as direct.
//   * Location — there is no mounting field, so the position is read out of the
//     point label's own vocabulary (DE/NDE, H/V/A, winding, bearing) plus the
//     component it belongs to.

export type SensorIdentity = {
  tag: string;
  tagIsComposed: boolean;
  sensor: string;
  cardType: CardType | null;
  inputType: string | null;
  rackName: string;
  // "S01 / CH2" — the physical address within the rack.
  address: string;
  gateway: string;
  gatewayIsDirect: boolean;
  location: string;
  engineeringRange: { min: number; max: number } | null;
};

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Channel ids are built as `${rackId}.S03.CH2` by listChannels, so the channel
// number is recoverable even though ChannelRef doesn't carry it separately.
function channelNumber(channelId: string): number | null {
  const match = /\.CH(\d+)$/.exec(channelId);
  return match ? Number(match[1]) : null;
}

// The channel's own configured engineering range. Exported because this is not
// only identity: LIVE_RANGE_FOR_LETTER is presentation metadata for drawing an
// empty axis, and wherever a card actually declares a range, that range is the
// band a reading has to be judged against. Falling back to the letter's default
// puts a 0-2 bar transmitter on a 0-10 bar scale and, for an uncommissioned
// channel, infers its alarm limits from the wrong span entirely.
export function engineeringRangeFor(card: CardNode | null): { min: number; max: number } | null {
  if (!card) return null;
  const c = card.config;

  if ('measurementRangeMin' in c) {
    const min = parseNumber(c.measurementRangeMin);
    const max = parseNumber(c.measurementRangeMax);
    return min !== null && max !== null && max > min ? { min, max } : null;
  }
  if ('engineeringMin' in c) {
    const min = parseNumber(c.engineeringMin);
    const max = parseNumber(c.engineeringMax);
    return min !== null && max !== null && max > min ? { min, max } : null;
  }
  if ('minSpeed' in c) {
    const min = parseNumber(c.minSpeed);
    const max = parseNumber(c.maxSpeed);
    return min !== null && max !== null && max > min ? { min, max } : null;
  }
  return null;
}

function inputTypeFor(card: CardNode | null): string | null {
  if (!card) return null;
  const c = card.config;
  return 'inputType' in c ? c.inputType : null;
}

// What is actually on the end of the wire. A vibration card names the transducer
// and its sensitivity; a process or speed card is defined by the signal it
// accepts, which is the more useful thing to show for a 4-20 mA or RTD input.
function sensorFor(card: CardNode | null, unit: string): string {
  if (!card) return '--';
  const c = card.config;

  if ('sensorType' in c) {
    const type = c.sensorType.trim();
    const sensitivity = c.sensitivity.trim();
    if (type && sensitivity) return `${type} · ${sensitivity}`;
    return type || sensitivity || '--';
  }
  // A universal input is defined by the signal it takes and what that signal is
  // scaled into, so show the conversion: a 4-20 mA loop reading out in bar is a
  // different thing to know than "4-20 mA".
  if ('inputType' in c) return unit ? `${c.inputType} → ${unit}` : c.inputType;
  return '--';
}

// Mounting position, read out of the label's own vocabulary. Ordered longest-first
// where prefixes overlap, so NDE is never matched as DE.
const POSITION_TERMS: Array<[RegExp, string]> = [
  [/\bnde\b|non[- ]drive/i, 'non-drive end'],
  [/\bde\b|drive end/i, 'drive end'],
  [/winding/i, 'winding'],
  [/bearing/i, 'bearing'],
  [/discharge/i, 'discharge'],
  [/suction/i, 'suction'],
  [/inlet/i, 'inlet'],
  [/outlet/i, 'outlet'],
  [/oil/i, 'oil'],
  [/input/i, 'input side'],
  [/output/i, 'output side'],
];

const AXIS_TERMS: Array<[RegExp, string]> = [
  [/\bh$|horizontal/i, 'horizontal'],
  [/\bv$|vertical/i, 'vertical'],
  [/\ba$|axial/i, 'axial'],
];

function locationFor(label: string, componentLabel: string | null): string {
  const parts: string[] = [];
  if (componentLabel) parts.push(componentLabel);

  const position = POSITION_TERMS.find(([re]) => re.test(label));
  if (position) parts.push(position[1]);

  const axis = AXIS_TERMS.find(([re]) => re.test(label.trim()));
  if (axis) parts.push(axis[1]);

  return parts.length > 0 ? parts.join(' · ') : 'location not recorded';
}

export function resolveSensorIdentity({
  channel,
  machineName,
  componentLabel,
  devices,
  cards,
}: {
  channel: ChannelRef;
  machineName: string;
  componentLabel: string | null;
  devices: DeviceNode[];
  cards: CardNode[];
}): SensorIdentity {
  const rack = devices.find((d) => d.id === channel.rackId) ?? null;
  const card = cards.find((c) => c.deviceId === channel.rackId && c.slot === channel.slot) ?? null;

  const ch = channelNumber(channel.id);
  const address = `S${String(channel.slot).padStart(2, '0')}${ch !== null ? ` / CH${ch}` : ''}`;

  // The only rack-to-gateway association the model supports is shared project.
  const gatewayDevice = rack
    ? devices.find((d) => d.type === 'Gateway' && !d.archived && d.projectId !== null && d.projectId === rack.projectId)
    : undefined;

  const gateway = gatewayDevice ? gatewayDevice.name : rack ? `direct · ${rack.ip}` : '--';

  return {
    tag: `${machineName}-${channel.code}`,
    tagIsComposed: true,
    sensor: sensorFor(card, channel.unit),
    cardType: card?.type ?? null,
    inputType: inputTypeFor(card),
    rackName: rack?.name ?? channel.deviceName,
    address,
    gateway,
    gatewayIsDirect: !gatewayDevice,
    location: locationFor(channel.label, componentLabel),
    engineeringRange: engineeringRangeFor(card),
  };
}
