import type { DeviceNode } from './devices';
import type { MeasurementPointKind } from './machines';
// Type-only: erased at compile time, so this does not create an import cycle
// with lib/simulation.ts (which imports card helpers from here).
import type { SimulatedChannel } from './simulation';

export const CARD_TYPES = ['Vibration Card', 'RTD Card', 'Universal V/I Card', 'Process Card', 'Speed Card', 'Communication Controller'] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const ACQUISITION_CARD_TYPES: CardType[] = ['Vibration Card', 'RTD Card', 'Universal V/I Card', 'Process Card', 'Speed Card'];
export const CONTROLLER_CARD_TYPES: CardType[] = ['Communication Controller'];

export const PROCESS_INPUT_TYPES = ['0-1 V', '0-5 V', '0-10 V', '4-20 mA', '0-20 mA'] as const;
export type ProcessInputType = (typeof PROCESS_INPUT_TYPES)[number];

export const PROCESS_DISPLAY_PRECISIONS = ['0', '0.0', '0.00', '0.000'] as const;
export type ProcessDisplayPrecision = (typeof PROCESS_DISPLAY_PRECISIONS)[number];

/**
 * Display precision as a decimal-place count, and back.
 *
 * The card stores precision the way the specification writes it — `0`, `0.0`,
 * `0.00`, `0.000` — because that is what an engineer picks from. Everything
 * that formats or generates a number wants a count, and the simulated signal
 * definition stores one, so the two representations are converted here rather
 * than in each caller.
 */
export function decimalsForPrecision(precision: ProcessDisplayPrecision): number {
  const dot = precision.indexOf('.');
  return dot === -1 ? 0 : precision.length - dot - 1;
}

export function precisionForDecimals(decimals: number): ProcessDisplayPrecision {
  const rounded = Math.max(0, Math.min(3, Math.round(Number.isFinite(decimals) ? decimals : 2)));
  return PROCESS_DISPLAY_PRECISIONS[rounded] ?? '0.00';
}

/**
 * A process value rendered at the card's configured display precision.
 *
 * Section 5 of the specification is explicit that precision is presentation
 * only: the stored and calculated value keeps full precision, and only the
 * string shown to the operator is shortened.
 */
export function formatProcessValue(value: number, precision: ProcessDisplayPrecision): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(decimalsForPrecision(precision));
}

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

/**
 * The part of a channel's configuration that is the same on every acquisition
 * card, whatever it measures.
 *
 * Every acquisition card is one channel, and every channel is named, carries a
 * unit, is calibrated by an offset, is alarmed on four levels and is displayed
 * at a precision. Vibration, process and speed cards used to describe those
 * same things with three different field sets, which is why they needed three
 * different editors and three different sync paths into the simulator. They now
 * share this block and one editor.
 *
 * The operating range is deliberately NOT here: it is derived from the enabled
 * alarm levels (see `derivedChannelRange`), so there is nothing to type and
 * nothing that can contradict the limits.
 */
export type ChannelCommonConfig = {
  channelNames: string[];
  tag: string;
  unit: string;
  rangeMin: string;
  rangeMax: string;
  healthyValue: string;
  /** Signed calibration offset, in the channel's engineering unit. */
  offset: string;
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
  /**
   * Mirrors of the High and High-High thresholds, kept because the analysis,
   * dashboard and mapping layers read a single warning/critical pair off the
   * card. `syncChannelLegacyAlarms` keeps them in step; nothing writes them
   * directly.
   */
  alarmWarning: string;
  alarmCritical: string;
};

export type VibrationConfig = ChannelCommonConfig & {
  sensorType: string;
  sensitivity: string;
  samplingRate: string;
  samplingRateSource?: 'operator';
  /**
   * Kept so racks saved before the shared block existed still read, and so the
   * derived operating range has somewhere card-shaped to live. Written by
   * `normalizeChannelConfig`, never typed by hand.
   */
  engineeringUnit: string;
  measurementRangeMin: string;
  measurementRangeMax: string;
};

export type ProcessConfig = ChannelCommonConfig & {
  inputType: ProcessInputType;
  scaling: string;
  filter: string;
  /** Derived from the alarm levels; see the note on VibrationConfig. */
  engineeringMin: string;
  engineeringMax: string;
};

export type SpeedConfig = ChannelCommonConfig & {
  inputType: SpeedInputType;
  pulsesPerRevolution: string;
  trigger: string;
  /**
   * Trigger hysteresis in volts — a property of the pulse input, unrelated to
   * the alarm hysteresis in the shared block. It was called `hysteresis` before
   * the two blocks merged, which is why `normalizeChannelConfig` reads the old
   * name across.
   */
  triggerHysteresis: string;
  /** Derived from the alarm levels; see the note on VibrationConfig. */
  minSpeed: string;
  maxSpeed: string;
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

// The same completion applied to a config being edited, so the form renders
// exactly the fields the card actually has rather than whatever was stored.
export function normalizedCardConfig(type: CardType, config: CardConfig): CardConfig {
  if (channelCountForCardType(type) === 0) return config;
  return normalizeChannelConfig(type, config as unknown as Record<string, unknown>);
}

function isProcessInputType(value: unknown): value is ProcessInputType {
  return PROCESS_INPUT_TYPES.includes(value as ProcessInputType);
}

function isProcessDisplayPrecision(value: unknown): value is ProcessDisplayPrecision {
  return PROCESS_DISPLAY_PRECISIONS.includes(value as ProcessDisplayPrecision);
}

/** The four alarm levels, low to high, as they appear in every editor and rule. */
export const CHANNEL_ALARM_LEVELS = [
  { enabledKey: 'alarmLowLowEnabled', valueKey: 'alarmLowLow', label: 'LL', name: 'Low Low' },
  { enabledKey: 'alarmLowEnabled', valueKey: 'alarmLow', label: 'L', name: 'Low' },
  { enabledKey: 'alarmHighEnabled', valueKey: 'alarmHigh', label: 'H', name: 'High' },
  { enabledKey: 'alarmHighHighEnabled', valueKey: 'alarmHighHigh', label: 'HH', name: 'High High' },
] as const;

export type ChannelAlarmLevel = (typeof CHANNEL_ALARM_LEVELS)[number];

/** The armed thresholds as numbers. A disabled or unparseable level is null. */
export type ChannelAlarmLimits = { lowLow: number | null; low: number | null; high: number | null; highHigh: number | null };

function parsedNumber(value: string | undefined): number | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function channelAlarmLimits(config: ChannelCommonConfig): ChannelAlarmLimits {
  const armed = (enabled: boolean, text: string) => (enabled ? parsedNumber(text) : null);
  return {
    lowLow: armed(config.alarmLowLowEnabled, config.alarmLowLow),
    low: armed(config.alarmLowEnabled, config.alarmLow),
    high: armed(config.alarmHighEnabled, config.alarmHigh),
    highHigh: armed(config.alarmHighHighEnabled, config.alarmHighHigh),
  };
}

function explicitChannelRange(config: ChannelCommonConfig): { min: number; max: number } | null {
  const min = parsedNumber(config.rangeMin);
  const max = parsedNumber(config.rangeMax);
  return min !== null && max !== null && max > min ? { min, max } : null;
}

/** How much room the operating range leaves beyond the outermost alarm level. */
const RANGE_HEADROOM = 0.1;
/** The range a channel gets when no alarm level is enabled at all. */
const FALLBACK_RANGE = { min: 0, max: 100 };

/**
 * The channel's operating range, derived from its enabled alarm levels.
 *
 * There is no minimum/maximum to type any more. An engineer who has said
 * "LL 20, L 40, H 210, HH 230" has already described the span this channel
 * works over, and asking for it a second time only creates a way for the two
 * answers to disagree — a threshold outside its own range, a knob that cannot
 * reach an alarm, a gauge whose bands run off the end of the track.
 *
 * The rule: span the enabled levels and add 10% of that span at each end, so
 * every level is reachable and there is somewhere to sit beyond HH. A range
 * whose levels are all non-negative is not pulled below zero, because a
 * pressure or a speed that reads -1 is a nonsense the operator then has to
 * ignore on every gauge. One level alone has no span, so it is given a quarter
 * of itself as headroom; none at all falls back to 0-100.
 */
export function derivedChannelRange(limits: ChannelAlarmLimits): { min: number; max: number } {
  const armed = [limits.lowLow, limits.low, limits.high, limits.highHigh].filter((value): value is number => value !== null);
  if (armed.length === 0) return { ...FALLBACK_RANGE };

  const lowest = Math.min(...armed);
  const highest = Math.max(...armed);
  const guardsLowSide = limits.lowLow !== null || limits.low !== null;
  const allNonNegative = lowest >= 0;

  // A channel alarmed only on its high side runs from zero up to its limits —
  // that is what "high only" means, and it is how the reference simulator bands
  // a HIGH_ONLY profile. A vibration channel with H 3.5 and HH 4.8 measures
  // 0-5, not 3.4-4.9; anchoring it at the low alarm would leave the knob unable
  // to reach a healthy reading at all.
  const base = guardsLowSide || !allNonNegative ? lowest : 0;
  const span = highest - base;
  const headroom = span > 0 ? span * RANGE_HEADROOM : Math.max(Math.abs(highest) * 0.25, 1);

  // The low end is padded only when a low alarm put it there. A zero floor is
  // deliberate and must not be pushed negative.
  let min = guardsLowSide || !allNonNegative ? base - headroom : base;
  if (allNonNegative && min < 0) min = 0;
  const max = highest + headroom;

  return max > min ? { min, max } : { min, max: min + 1 };
}

export function derivedChannelRangeFor(config: ChannelCommonConfig): { min: number; max: number } {
  return explicitChannelRange(config) ?? derivedChannelRange(channelAlarmLimits(config));
}

/** The derived range as the strings a card stores. */
function derivedRangeText(config: ChannelCommonConfig): { min: string; max: string } {
  const { min, max } = derivedChannelRangeFor(config);
  const decimals = decimalsForPrecision(config.displayPrecision);
  return { min: String(Number(min.toFixed(decimals))), max: String(Number(max.toFixed(decimals))) };
}

function channelSpan(config: ChannelCommonConfig): number | null {
  const { min, max } = derivedChannelRangeFor(config);
  return max > min ? max - min : null;
}

/** Section 5.2's suggested starting point: roughly 1% of the operating span. */
export function suggestedChannelHysteresis(config: ChannelCommonConfig): string {
  const span = channelSpan(config);
  if (span === null) return '';
  const suggested = span * 0.01;
  return Number.isInteger(suggested) ? String(suggested) : String(Number(suggested.toFixed(6)));
}

/**
 * Keeps the single warning/critical pair the rest of the app reads in step with
 * the four-level block the operator actually edits.
 *
 * Only High and High-High are mirrored because existing consumers read these
 * fields as high-side thresholds. Low-side alarms stay in the four-level block,
 * where the knob and alarm-band meter can evaluate their direction correctly.
 */
export function syncChannelLegacyAlarms<T extends ChannelCommonConfig>(config: T): T {
  const alarmWarning = config.alarmHighEnabled && config.alarmHigh.trim() ? config.alarmHigh : '';
  const alarmCritical = config.alarmHighHighEnabled && config.alarmHighHigh.trim() ? config.alarmHighHigh : '';
  return { ...config, alarmWarning, alarmCritical };
}

function commonDefaults(source: Partial<ChannelCommonConfig>, fallbackUnit: string): ChannelCommonConfig {
  const legacy = source as Partial<ChannelCommonConfig> & {
    measurementRangeMin?: string;
    measurementRangeMax?: string;
    engineeringMin?: string;
    engineeringMax?: string;
    minSpeed?: string;
    maxSpeed?: string;
  };
  return {
    channelNames: source.channelNames ?? [],
    tag: source.tag ?? '',
    unit: source.unit ?? fallbackUnit,
    rangeMin: source.rangeMin ?? legacy.measurementRangeMin ?? legacy.engineeringMin ?? legacy.minSpeed ?? '',
    rangeMax: source.rangeMax ?? legacy.measurementRangeMax ?? legacy.engineeringMax ?? legacy.maxSpeed ?? '',
    healthyValue: source.healthyValue ?? '',
    offset: source.offset ?? '0',
    alarmLowLowEnabled: source.alarmLowLowEnabled ?? false,
    alarmLowEnabled: source.alarmLowEnabled ?? false,
    alarmHighEnabled: source.alarmHighEnabled ?? !!source.alarmWarning,
    alarmHighHighEnabled: source.alarmHighHighEnabled ?? !!source.alarmCritical,
    alarmLowLow: source.alarmLowLow ?? '',
    alarmLow: source.alarmLow ?? '',
    alarmHigh: source.alarmHigh ?? source.alarmWarning ?? '',
    alarmHighHigh: source.alarmHighHigh ?? source.alarmCritical ?? '',
    hysteresis: source.hysteresis ?? '',
    alarmDelay: source.alarmDelay ?? '0',
    displayPrecision: isProcessDisplayPrecision(source.displayPrecision) ? source.displayPrecision : '0.00',
    alarmWarning: source.alarmWarning ?? '',
    alarmCritical: source.alarmCritical ?? '',
  };
}

function commonWithRangeDefaults<T extends ChannelCommonConfig>(config: T): T {
  if (config.rangeMin.trim() && config.rangeMax.trim()) return config;
  const range = derivedRangeText(config);
  return { ...config, rangeMin: config.rangeMin || range.min, rangeMax: config.rangeMax || range.max };
}

/**
 * Brings any stored acquisition-card config up to the shared shape, whatever
 * build wrote it, and rewrites the derived range from the alarm levels.
 *
 * This is the one place a card config is made whole. Everything that edits or
 * renders a card runs through it, so a rack saved before the three card types
 * shared a block — a vibration card with only warning/critical, a speed card
 * whose `hysteresis` meant volts — opens with LL/L/H/HH, a precision and a
 * derived range rather than blank fields.
 */
export function normalizeChannelConfig(type: CardType, config: Record<string, unknown>): CardConfig {
  const count = channelCountForCardType(type);
  // `inputType` is excluded from the intersection because the process and speed
  // unions share no member: intersecting them collapses the whole source type
  // to `never`. Each branch narrows it with its own guard instead.
  const source = config as Partial<Omit<ProcessConfig, 'inputType'>> &
    Partial<Omit<VibrationConfig, 'inputType'>> &
    Partial<Omit<SpeedConfig, 'inputType'>> & { inputType?: unknown; samplingRateSource?: unknown };
  const channelNames = Array.from({ length: count }, (_, index) => source.channelNames?.[index] ?? '');

  if (type === 'Vibration Card') {
    const common = commonDefaults({ ...source, channelNames, unit: source.unit ?? source.engineeringUnit }, 'mm/s');
    const ranged = commonWithRangeDefaults(common);
    const withHysteresis = { ...ranged, hysteresis: ranged.hysteresis || suggestedChannelHysteresis(ranged) };
    const range = derivedRangeText(withHysteresis);
    return syncChannelLegacyAlarms({
      ...withHysteresis,
      sensorType: source.sensorType ?? '',
      sensitivity: source.sensitivity ?? '',
      samplingRate: source.samplingRate ?? '',
      ...(source.samplingRateSource === 'operator' ? { samplingRateSource: 'operator' as const } : {}),
      engineeringUnit: withHysteresis.unit,
      measurementRangeMin: range.min,
      measurementRangeMax: range.max,
    });
  }

  if (type === 'Speed Card') {
    const common = commonDefaults({ ...source, channelNames }, 'rpm');
    const ranged = commonWithRangeDefaults(common);
    const withHysteresis = { ...ranged, hysteresis: ranged.hysteresis || suggestedChannelHysteresis(ranged) };
    const range = derivedRangeText(withHysteresis);
    return syncChannelLegacyAlarms({
      ...withHysteresis,
      inputType: SPEED_INPUT_TYPES.includes(source.inputType as SpeedInputType) ? (source.inputType as SpeedInputType) : 'RPM',
      pulsesPerRevolution: source.pulsesPerRevolution ?? '',
      trigger: source.trigger ?? '',
      // `hysteresis` used to be the trigger's volts on a speed card; read it
      // across only when the field it moved to is empty.
      triggerHysteresis: source.triggerHysteresis ?? (typeof config.hysteresis === 'string' && !source.alarmHigh ? (config.hysteresis as string) : '') ?? '',
      minSpeed: range.min,
      maxSpeed: range.max,
    });
  }

  const common = commonDefaults({ ...source, channelNames }, type === 'RTD Card' ? 'C' : '');
  const ranged = commonWithRangeDefaults(common);
  const withHysteresis = { ...ranged, hysteresis: ranged.hysteresis || suggestedChannelHysteresis(ranged) };
  const range = derivedRangeText(withHysteresis);
  return syncChannelLegacyAlarms({
    ...withHysteresis,
    inputType: isProcessInputType(source.inputType) ? source.inputType : '4-20 mA',
    scaling: source.scaling ?? '1',
    filter: source.filter ?? '',
    engineeringMin: range.min,
    engineeringMax: range.max,
  });
}

/** Back-compatible aliases, so existing callers keep reading. */
export function normalizeProcessConfig(config: Partial<ProcessConfig> & Pick<ProcessConfig, 'channelNames'>): ProcessConfig {
  return normalizeChannelConfig('Process Card', config as Record<string, unknown>) as ProcessConfig;
}

export function syncProcessLegacyAlarms(config: ProcessConfig): ProcessConfig {
  return syncChannelLegacyAlarms(config);
}

export function suggestedProcessHysteresis(config: ChannelCommonConfig): string {
  return suggestedChannelHysteresis(config);
}

export function emptyConfigFor(type: CardType): CardConfig {
  if (type === 'Communication Controller') {
    return { controllerName: '', ip: '', port: '', firmware: '', role: 'Primary', partnerController: '' };
  }
  // Every acquisition card starts from the same shared block, so a new card of
  // any type opens on the same editor with the same fields filled in.
  return normalizeChannelConfig(type, { channelNames: emptyChannelNames(type) });
}

/**
 * The value this channel reads when the process is healthy, taken from the
 * channel's own configuration.
 *
 * With the operating range derived from the alarm levels, "healthy" is simply
 * the middle of that range: the point furthest from both the low and the high
 * limits. Returns null when the card declares nothing at all, so a caller
 * reports "not configured" rather than inventing a number.
 */
export function configuredHealthyValue(card: CardNode): number | null {
  const simulated = card.simulation?.[0];
  if (simulated?.healthyValue !== undefined && simulated.healthyValue !== null && Number.isFinite(simulated.healthyValue)) {
    return simulated.healthyValue;
  }
  if (simulated && Number.isFinite(simulated.min) && Number.isFinite(simulated.max) && simulated.max > simulated.min) {
    return (simulated.min + simulated.max) / 2;
  }
  const config = card.config;
  if (!('alarmHigh' in config)) return null;
  const configured = parsedNumber(config.healthyValue);
  if (configured !== null) return configured;
  const { min, max } = derivedChannelRangeFor(config);
  return max > min ? (min + max) / 2 : null;
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
  kind?: MeasurementPointKind | 'Unknown';
  alarmLowCritical?: number;
  alarmLowWarning?: number;
  alarmWarning?: number;
  alarmCritical?: number;
  healthyValue?: number;
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
  if ((card.type === 'RTD Card' || card.type === 'Universal V/I Card' || card.type === 'Process Card') && 'unit' in card.config) {
    const unit = card.config.unit || '';
    if (card.type === 'RTD Card') return { letter: 'T', unit: unit || 'C' };
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
    case 'Power':
      return 'C';
    case 'Level':
    case 'Process Value':
      return 'X';
    case 'Universal Voltage / Current':
      return 'C';
    default:
      return 'X';
  }
}

function measurementKindForSimulatedKind(kind: SimulatedChannel['kind']): MeasurementPointKind | 'Unknown' {
  switch (kind) {
    case 'Vibration':
      return 'Vibration';
    case 'RTD / Temperature':
      return 'Temperature';
    case 'Speed / RPM':
      return 'Speed';
    case 'Pressure':
      return 'Pressure';
    case 'Power':
    case 'Universal Voltage / Current':
      return 'Power';
    case 'Level':
      return 'Level';
    default:
      return 'Unknown';
  }
}

function measurementKindForLetter(letter: ChannelRef['letter']): MeasurementPointKind | 'Unknown' {
  switch (letter) {
    case 'V':
      return 'Vibration';
    case 'T':
      return 'Temperature';
    case 'S':
      return 'Speed';
    case 'P':
      return 'Pressure';
    case 'C':
      return 'Current';
    default:
      return 'Unknown';
  }
}

function channelDescriptor(
  card: CardNode,
  index: number,
): {
  letter: ChannelRef['letter'];
  unit: string;
  kind?: MeasurementPointKind | 'Unknown';
  alarmLowCritical?: number;
  alarmLowWarning?: number;
  alarmWarning?: number;
  alarmCritical?: number;
  healthyValue?: number;
} {
  const simulated = card.simulation?.[index];
  const configLimits = 'alarmHigh' in card.config ? channelAlarmLimits(card.config) : null;
  if (simulated) {
    const letter = letterForSimulatedKind(simulated.kind);
    return {
      letter,
      kind: measurementKindForSimulatedKind(simulated.kind),
      unit: 'unit' in card.config && card.config.unit.trim() ? card.config.unit : simulated.unit,
      alarmLowCritical: configLimits ? (configLimits.lowLow ?? undefined) : undefined,
      alarmLowWarning: configLimits ? (configLimits.low ?? undefined) : undefined,
      alarmWarning: configLimits ? (configLimits.high ?? undefined) : (simulated.alertLimit ?? undefined),
      alarmCritical: configLimits ? (configLimits.highHigh ?? undefined) : (simulated.dangerLimit ?? undefined),
      healthyValue: simulated.healthyValue ?? configuredHealthyValue(card) ?? undefined,
    };
  }
  return {
    ...(() => {
      const base = letterAndUnitForCard(card);
      return { ...base, kind: measurementKindForLetter(base.letter) };
    })(),
    alarmLowCritical: configLimits ? (configLimits.lowLow ?? undefined) : undefined,
    alarmLowWarning: configLimits ? (configLimits.low ?? undefined) : undefined,
    alarmWarning: configLimits ? (configLimits.high ?? undefined) : undefined,
    alarmCritical: configLimits ? (configLimits.highHigh ?? undefined) : undefined,
    healthyValue: configuredHealthyValue(card) ?? undefined,
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
  if (!('alarmHigh' in config)) return null;
  const { min, max } = derivedChannelRangeFor(config);
  return max > min ? { min, max } : null;
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
        const { letter, unit, kind, alarmLowCritical, alarmLowWarning, alarmWarning, alarmCritical, healthyValue } = channelDescriptor(card, index);
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
          kind,
          alarmLowCritical,
          alarmLowWarning,
          alarmWarning,
          alarmCritical,
          healthyValue,
        };
      });
    });
  });
}
