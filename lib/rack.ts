import type { DeviceNode } from './devices';

export const CARD_TYPES = ['Vibration Card', 'Process Card', 'Speed Card', 'Communication Controller'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const ACQUISITION_CARD_TYPES: CardType[] = ['Vibration Card', 'Process Card', 'Speed Card'];
export const CONTROLLER_CARD_TYPES: CardType[] = ['Communication Controller'];

export const PROCESS_INPUT_TYPES = [
  '0-1 V',
  '0-5 V',
  '0-10 V',
  '0-20 mA',
  '4-20 mA',
  'RTD 2-wire',
  'RTD 3-wire',
  'RTD 4-wire',
  'Thermocouple',
] as const;
export type ProcessInputType = (typeof PROCESS_INPUT_TYPES)[number];

export const SPEED_INPUT_TYPES = ['Pulse', 'Frequency', 'RPM', 'Keyphasor'] as const;
export type SpeedInputType = (typeof SPEED_INPUT_TYPES)[number];

// Slots 1-12 = acquisition cards, 13-14 = communication controllers (spec §6.1).
export const TOTAL_SLOTS = 14;
export function slotKind(slot: number): 'acquisition' | 'controller' {
  return slot <= 12 ? 'acquisition' : 'controller';
}
export function allowedCardTypesForSlot(slot: number): CardType[] {
  return slotKind(slot) === 'acquisition' ? ACQUISITION_CARD_TYPES : CONTROLLER_CARD_TYPES;
}

export type VibrationConfig = {
  channelNames: string[];
  sensorType: string;
  sensitivity: string;
  engineeringUnit: string;
  measurementRangeMin: string;
  measurementRangeMax: string;
  samplingRate: string;
  alarmWarning: string;
  alarmCritical: string;
};

export type ProcessConfig = {
  channelNames: string[];
  inputType: ProcessInputType;
  engineeringMin: string;
  engineeringMax: string;
  unit: string;
  scaling: string;
  offset: string;
  filter: string;
  alarmWarning: string;
  alarmCritical: string;
};

export type SpeedConfig = {
  channelNames: string[];
  inputType: SpeedInputType;
  pulsesPerRevolution: string;
  trigger: string;
  hysteresis: string;
  minSpeed: string;
  maxSpeed: string;
  alarmWarning: string;
  alarmCritical: string;
};

export type ControllerConfig = {
  controllerName: string;
  ip: string;
  port: string;
  firmware: string;
  role: 'Primary' | 'Standby';
  partnerController: string;
};

export type CardConfig = VibrationConfig | ProcessConfig | SpeedConfig | ControllerConfig;

export type CardNode = {
  id: string;
  deviceId: string;
  slot: number;
  type: CardType;
  enabled: boolean;
  config: CardConfig;
};

export function channelCountForCardType(type: CardType): number {
  // Vibration and Speed cards expose 2 physical channels, Process exposes 4;
  // controllers manage the rack link rather than exposing sensor channels.
  switch (type) {
    case 'Vibration Card':
    case 'Speed Card':
      return 2;
    case 'Process Card':
      return 4;
    case 'Communication Controller':
      return 0;
  }
}

function emptyChannelNames(type: CardType): string[] {
  return Array.from({ length: channelCountForCardType(type) }, () => '');
}

export function emptyConfigFor(type: CardType): CardConfig {
  switch (type) {
    case 'Vibration Card':
      return {
        channelNames: emptyChannelNames(type),
        sensorType: '',
        sensitivity: '',
        engineeringUnit: 'mm/s',
        measurementRangeMin: '',
        measurementRangeMax: '',
        samplingRate: '',
        alarmWarning: '',
        alarmCritical: '',
      };
    case 'Process Card':
      return {
        channelNames: emptyChannelNames(type),
        inputType: '4-20 mA',
        engineeringMin: '',
        engineeringMax: '',
        unit: '',
        scaling: '',
        offset: '',
        filter: '',
        alarmWarning: '',
        alarmCritical: '',
      };
    case 'Speed Card':
      return {
        channelNames: emptyChannelNames(type),
        inputType: 'Pulse',
        pulsesPerRevolution: '',
        trigger: '',
        hysteresis: '',
        minSpeed: '',
        maxSpeed: '',
        alarmWarning: '',
        alarmCritical: '',
      };
    case 'Communication Controller':
      return { controllerName: '', ip: '', port: '', firmware: '', role: 'Primary', partnerController: '' };
  }
}

// A freshly-installed card has only defaults — nothing worth showing in a
// read-only overview yet, so callers use this to decide whether "Configure"
// should land on the overview or jump straight to the edit form.
export function isCardConfigured(card: CardNode): boolean {
  if ('controllerName' in card.config) return card.config.controllerName.trim().length > 0;
  if ('channelNames' in card.config) return card.config.channelNames.some((name) => name.trim().length > 0);
  return false;
}

export type ChannelRef = {
  id: string;
  rackId: string;
  slot: number;
  deviceName: string;
  label: string;
  code: string;
  unit: string;
  letter: 'V' | 'T' | 'S' | 'P' | 'C' | 'X';
  alarmWarning?: number;
  alarmCritical?: number;
};

function parsedThreshold(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// Approximates the same V/T/S/P/C live-reading letter scheme used for machine
// measurement points, so a rack channel and a machine point look/behave the same
// once something is mapped to them. Process Card channels vary per-channel in
// reality, but the card only stores one `unit` for all of them, so that single
// unit decides the letter for every channel on the card.
function letterAndUnitForCard(card: CardNode): { letter: ChannelRef['letter']; unit: string } {
  if (card.type === 'Vibration Card') return { letter: 'V', unit: 'engineeringUnit' in card.config ? card.config.engineeringUnit || 'mm/s' : 'mm/s' };
  if (card.type === 'Speed Card') return { letter: 'S', unit: 'rpm' };
  if (card.type === 'Process Card' && 'unit' in card.config) {
    const unit = card.config.unit || '';
    const normalized = unit.toLowerCase();
    if (normalized.includes('bar') || normalized.includes('psi')) return { letter: 'P', unit: unit || 'bar' };
    if (normalized.includes('c') && !normalized.includes('ma')) return { letter: 'T', unit: unit || '°C' };
    if (normalized.includes('a')) return { letter: 'C', unit: unit || 'A' };
    return { letter: 'X', unit };
  }
  return { letter: 'X', unit: '' };
}

// Flattens every acquisition-card channel across all racks into a pickable list —
// used wherever something (e.g. a machine's mapping trail) needs to reference a
// physical rack channel, independent of that rack's own detail screen.
export function listChannels(devices: DeviceNode[], cards: CardNode[]): ChannelRef[] {
  const racks = devices.filter((d) => d.type === 'Rack' && !d.archived);
  const letterCounts: Record<string, number> = {};

  return racks.flatMap((rack) => {
    const rackCards = cards.filter((c) => c.deviceId === rack.id && channelCountForCardType(c.type) > 0).sort((a, b) => a.slot - b.slot);

    return rackCards.flatMap((card) => {
      const names = 'channelNames' in card.config ? card.config.channelNames : [];
      const { letter, unit } = letterAndUnitForCard(card);
      const alarmWarning = 'alarmWarning' in card.config ? parsedThreshold(card.config.alarmWarning) : undefined;
      const alarmCritical = 'alarmCritical' in card.config ? parsedThreshold(card.config.alarmCritical) : undefined;

      return names.map((name, index) => {
        letterCounts[letter] = (letterCounts[letter] ?? 0) + 1;
        return {
          id: `${rack.id}.S${String(card.slot).padStart(2, '0')}.CH${index + 1}`,
          rackId: rack.id,
          slot: card.slot,
          deviceName: rack.name,
          label: name.trim() || `${card.type} CH${index + 1}`,
          code: `${letter}${letterCounts[letter]}`,
          unit,
          letter,
          alarmWarning,
          alarmCritical,
        };
      });
    });
  });
}
