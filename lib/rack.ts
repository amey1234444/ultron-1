import type { DeviceNode } from './devices';
// Type-only: erased at compile time, so this does not create an import cycle
// with lib/simulation.ts (which imports card helpers from here).
import type { SimulatedChannel } from './simulation';

export const CARD_TYPES = ['Vibration Card', 'Process Card', 'Speed Card', 'Communication Controller'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const ACQUISITION_CARD_TYPES: CardType[] = ['Vibration Card', 'Process Card', 'Speed Card'];
export const CONTROLLER_CARD_TYPES: CardType[] = ['Communication Controller'];

export const PROCESS_INPUT_TYPES = ['0-1 V', '0-5 V', '0-10 V', '4-20 mA', '0-20 mA'] as const;
export type ProcessInputType = (typeof PROCESS_INPUT_TYPES)[number];

export const PROCESS_DISPLAY_PRECISIONS = ['0', '0.0', '0.00', '0.000'] as const;
export type ProcessDisplayPrecision = (typeof PROCESS_DISPLAY_PRECISIONS)[number];

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
  tag: string;
  inputType: ProcessInputType;
  engineeringMin: string;
  engineeringMax: string;
  unit: string;
  scaling: string;
  offset: string;
  filter: string;
  alarmLowLowEnabled: boolean;
  alarmLowEnabled: boolean;
  alarmHighEnabled: boolean;
  alarmHighHighEnabled: boolean;
  alarmLowLow: string;
  alarmLow: string;
  alarmHigh: string;
  alarmHighHigh: string;
  hysteresis: string;
  alarmDelay: string;
  displayPrecision: ProcessDisplayPrecision;
  alarmWarning: string;
  alarmCritical: string;
};

export type SpeedConfig = {
  channelNames: string[];
  inputType: SpeedInputType;
  pulsesPerRevolution: string;
  trigger: string;
  hysteresis: string;
  /**
   * Engineering unit for the speed reading. Optional so racks saved before this
   * field existed keep working — `letterAndUnitForCard` falls back to rpm.
   */
  unit?: string;
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
  // Set only on cards installed in a simulated rack: one entry per channel,
  // describing the signal the simulator should generate for it. Kept beside
  // `config` rather than inside it so the card's real configuration schema is
  // unchanged — see lib/simulation.ts.
  simulation?: SimulatedChannel[];
};

// One acquisition card carries exactly one measurement channel, so a slot maps
// one-to-one onto a sensor point: slot 3 is always "the sensor in slot 3", with
// no channel sub-address to carry through mapping, alarms or analysis.
// Controllers manage the rack link rather than exposing sensor channels.
export function channelCountForCardType(type: CardType): number {
  return type === 'Communication Controller' ? 0 : 1;
}

function emptyChannelNames(type: CardType): string[] {
  return Array.from({ length: channelCountForCardType(type) }, () => '');
}

// Channel names as stored can disagree with the card's channel count — a card
// saved when acquisition cards carried 2 or 4 channels, or one whose type was
// changed since. Everything that renders or enumerates channels goes through
// here, so a stored extra name can never surface as a phantom channel.
export function channelNamesForCard(card: CardNode): string[] {
  const count = channelCountForCardType(card.type);
  const stored = 'channelNames' in card.config ? card.config.channelNames : [];
  return Array.from({ length: count }, (_, index) => stored[index] ?? '');
}

// The same resize applied to a config being edited, so the form renders exactly
// the fields the card actually has rather than whatever length was stored.
export function normalizedCardConfig(type: CardType, config: CardConfig): CardConfig {
  const count = channelCountForCardType(type);
  if (type === 'Process Card' && 'engineeringMin' in config) {
    return normalizeProcessConfig({ ...config, channelNames: Array.from({ length: count }, (_, index) => config.channelNames[index] ?? '') });
  }
  if (!('channelNames' in config)) return config;
  if (config.channelNames.length === count) return config;
  return { ...config, channelNames: Array.from({ length: count }, (_, index) => config.channelNames[index] ?? '') };
}

function isProcessInputType(value: unknown): value is ProcessInputType {
  return PROCESS_INPUT_TYPES.includes(value as ProcessInputType);
}

function isProcessDisplayPrecision(value: unknown): value is ProcessDisplayPrecision {
  return PROCESS_DISPLAY_PRECISIONS.includes(value as ProcessDisplayPrecision);
}

function processSpan(config: Pick<ProcessConfig, 'engineeringMin' | 'engineeringMax'>): number | null {
  const min = Number(config.engineeringMin);
  const max = Number(config.engineeringMax);
  return Number.isFinite(min) && Number.isFinite(max) && max > min ? max - min : null;
}

export function suggestedProcessHysteresis(config: Pick<ProcessConfig, 'engineeringMin' | 'engineeringMax'>): string {
  const span = processSpan(config);
  if (span === null) return '';
  const suggested = span * 0.01;
  return Number.isInteger(suggested) ? String(suggested) : String(Number(suggested.toFixed(6)));
}

export function syncProcessLegacyAlarms(config: ProcessConfig): ProcessConfig {
  const alarmWarning = config.alarmHighEnabled && config.alarmHigh.trim() ? config.alarmHigh : config.alarmLowEnabled && config.alarmLow.trim() ? config.alarmLow : '';
  const alarmCritical =
    config.alarmHighHighEnabled && config.alarmHighHigh.trim() ? config.alarmHighHigh : config.alarmLowLowEnabled && config.alarmLowLow.trim() ? config.alarmLowLow : '';
  return { ...config, alarmWarning, alarmCritical };
}

export function normalizeProcessConfig(config: Partial<ProcessConfig> & Pick<ProcessConfig, 'channelNames'>): ProcessConfig {
  const base: ProcessConfig = {
    channelNames: config.channelNames,
    tag: config.tag ?? '',
    inputType: isProcessInputType(config.inputType) ? config.inputType : '4-20 mA',
    engineeringMin: config.engineeringMin ?? '',
    engineeringMax: config.engineeringMax ?? '',
    unit: config.unit ?? '',
    scaling: config.scaling ?? '1',
    offset: config.offset ?? '0',
    filter: config.filter ?? '',
    alarmLowLowEnabled: config.alarmLowLowEnabled ?? false,
    alarmLowEnabled: config.alarmLowEnabled ?? false,
    alarmHighEnabled: config.alarmHighEnabled ?? !!config.alarmWarning,
    alarmHighHighEnabled: config.alarmHighHighEnabled ?? !!config.alarmCritical,
    alarmLowLow: config.alarmLowLow ?? '',
    alarmLow: config.alarmLow ?? '',
    alarmHigh: config.alarmHigh ?? config.alarmWarning ?? '',
    alarmHighHigh: config.alarmHighHigh ?? config.alarmCritical ?? '',
    hysteresis: config.hysteresis ?? '',
    alarmDelay: config.alarmDelay ?? '0',
    displayPrecision: isProcessDisplayPrecision(config.displayPrecision) ? config.displayPrecision : '0.00',
    alarmWarning: config.alarmWarning ?? '',
    alarmCritical: config.alarmCritical ?? '',
  };
  return syncProcessLegacyAlarms({
    ...base,
    hysteresis: base.hysteresis || suggestedProcessHysteresis(base),
  });
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
        tag: '',
        inputType: '4-20 mA',
        engineeringMin: '',
        engineeringMax: '',
        unit: '',
        scaling: '',
        offset: '0',
        filter: '',
        alarmLowLowEnabled: false,
        alarmLowEnabled: false,
        alarmHighEnabled: false,
        alarmHighHighEnabled: false,
        alarmLowLow: '',
        alarmLow: '',
        alarmHigh: '',
        alarmHighHigh: '',
        hysteresis: '',
        alarmDelay: '0',
        displayPrecision: '0.00',
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
        unit: 'rpm',
        minSpeed: '',
        maxSpeed: '',
        alarmWarning: '',
        alarmCritical: '',
      };
    case 'Communication Controller':
      return { controllerName: '', ip: '', port: '', firmware: '', role: 'Primary', partnerController: '' };
  }
}

function midpoint(low: string | undefined, high: string | undefined): number | null {
  const min = Number.parseFloat(String(low ?? '').trim());
  const max = Number.parseFloat(String(high ?? '').trim());
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  return (min + max) / 2;
}

/**
 * The value this channel reads when the process is healthy, taken from the
 * channel's own configuration.
 *
 * Preference order, strongest declaration first:
 *   1. the simulated signal's declared NORMAL band (what the commissioning
 *      engineer said "good" looks like)
 *   2. the simulated signal's generation range
 *   3. the card's engineering range
 *
 * Returns `null` when the card declares no range at all, so a caller reports
 * "not configured" rather than inventing a number.
 */
export function configuredHealthyValue(card: CardNode): number | null {
  const simulated = card.simulation?.[0];
  if (simulated) {
    if (simulated.normalMin !== null && simulated.normalMax !== null && simulated.normalMax > simulated.normalMin) {
      return (simulated.normalMin + simulated.normalMax) / 2;
    }
    if (Number.isFinite(simulated.min) && Number.isFinite(simulated.max) && simulated.max > simulated.min) {
      return (simulated.min + simulated.max) / 2;
    }
  }
  const config = card.config;
  if ('measurementRangeMin' in config) return midpoint(config.measurementRangeMin, config.measurementRangeMax);
  if ('engineeringMin' in config) return midpoint(config.engineeringMin, config.engineeringMax);
  if ('minSpeed' in config) return midpoint(config.minSpeed, config.maxSpeed);
  return null;
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

type ListChannelOptions = {
  channelIsAvailable?: (rack: DeviceNode, card: CardNode, channelNumber: number) => boolean;
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
  if (card.type === 'Speed Card') {
    const unit = ('unit' in card.config ? card.config.unit : '') || 'rpm';
    return { letter: 'S', unit };
  }
  if (card.type === 'Process Card' && 'unit' in card.config) {
    const unit = card.config.unit || '';
    const normalized = unit.toLowerCase().trim();
    if (normalized.includes('bar') || normalized.includes('psi') || normalized.includes('pa')) {
      return { letter: 'P', unit: unit || 'bar' };
    }
    // Level/ratio units are matched before the temperature test: "percent"
    // contains a 'c', so without this a hopper level would be typed — and
    // demo-banded, and charted — as a temperature.
    if (normalized === '%' || normalized.includes('percent') || normalized.includes('fraction')) {
      return { letter: 'X', unit };
    }
    if (normalized.includes('c') && !normalized.includes('ma')) return { letter: 'T', unit: unit || '°C' };
    if (normalized.includes('a')) return { letter: 'C', unit: unit || 'A' };
    return { letter: 'X', unit };
  }
  return { letter: 'X', unit: '' };
}

// A simulated channel declares what it measures outright, so its letter and unit
// are read off the signal rather than sniffed from the card's single shared unit
// — which is how a simulated Process Card can carry, say, two temperatures and a
// pressure and still have each one map correctly.
function letterForSimulatedKind(kind: SimulatedChannel['kind']): ChannelRef['letter'] {
  switch (kind) {
    case 'Vibration':
      return 'V';
    case 'RTD / Temperature':
      return 'T';
    case 'Speed / RPM':
      return 'S';
    case 'Pressure':
      return 'P';
    case 'Universal Voltage / Current':
      return 'C';
    default:
      return 'X';
  }
}

function channelDescriptor(card: CardNode, index: number): { letter: ChannelRef['letter']; unit: string; alarmWarning?: number; alarmCritical?: number } {
  const simulated = card.simulation?.[index];
  if (simulated) {
    return {
      letter: letterForSimulatedKind(simulated.kind),
      unit: simulated.unit,
      alarmWarning: simulated.alertLimit ?? undefined,
      alarmCritical: simulated.dangerLimit ?? undefined,
    };
  }
  return {
    ...letterAndUnitForCard(card),
    alarmWarning: 'alarmWarning' in card.config ? parsedThreshold(card.config.alarmWarning) : undefined,
    alarmCritical: 'alarmCritical' in card.config ? parsedThreshold(card.config.alarmCritical) : undefined,
  };
}

/**
 * The engineering range a channel is actually measured against.
 *
 * Same precedence `channelDescriptor` uses for the unit and the alarm limits,
 * and for the same reason: on a simulated card the signal definition is the
 * source of truth, and the card-level fields are a mirror of channel 1 only. A
 * caller that reads the card config directly gets channel 1's range for every
 * channel on the card, and gets it stale whenever the two have not been synced.
 *
 * Null when nothing declares a range, so a caller falls back to a display
 * default rather than inventing one.
 */
export function channelEngineeringRange(card: CardNode, index: number): { min: number; max: number } | null {
  const simulated = card.simulation?.[index];
  if (simulated && Number.isFinite(simulated.min) && Number.isFinite(simulated.max) && simulated.max > simulated.min) {
    return { min: simulated.min, max: simulated.max };
  }

  const config = card.config;
  const range = (min: string | undefined, max: string | undefined) => {
    const lo = parsedThreshold(min);
    const hi = parsedThreshold(max);
    return lo !== undefined && hi !== undefined && hi > lo ? { min: lo, max: hi } : null;
  };

  if ('measurementRangeMin' in config) return range(config.measurementRangeMin, config.measurementRangeMax);
  if ('engineeringMin' in config) return range(config.engineeringMin, config.engineeringMax);
  if ('minSpeed' in config) return range(config.minSpeed, config.maxSpeed);
  return null;
}

// Flattens every acquisition-card channel across all racks into a pickable list —
// used wherever something (e.g. a machine's mapping trail) needs to reference a
// physical rack channel, independent of that rack's own detail screen.
export function listChannels(devices: DeviceNode[], cards: CardNode[], options: ListChannelOptions = {}): ChannelRef[] {
  const racks = devices.filter((d) => d.type === 'Rack' && !d.archived);
  const letterCounts: Record<string, number> = {};

  return racks.flatMap((rack) => {
    const cardBySlot = new Map<number, CardNode>();
    for (const card of cards) {
      if (card.deviceId !== rack.id || channelCountForCardType(card.type) <= 0) continue;
      cardBySlot.set(card.slot, card);
    }
    const rackCards = Array.from(cardBySlot.values()).sort((a, b) => a.slot - b.slot);

    return rackCards.flatMap((card) => {
      return channelNamesForCard(card).flatMap((name, index) => {
        const channelNumber = index + 1;
        if (options.channelIsAvailable && !options.channelIsAvailable(rack, card, channelNumber)) return [];
        const { letter, unit, alarmWarning, alarmCritical } = channelDescriptor(card, index);
        letterCounts[letter] = (letterCounts[letter] ?? 0) + 1;
        return {
          id: `${rack.id}.S${String(card.slot).padStart(2, '0')}.CH${channelNumber}`,
          rackId: rack.id,
          slot: card.slot,
          deviceName: rack.name,
          // One channel per card, so the card's own name is the point name.
          label: name.trim() || `${card.type} · Slot ${card.slot}`,
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
