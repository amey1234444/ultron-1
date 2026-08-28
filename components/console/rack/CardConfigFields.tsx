import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  CHANNEL_ALARM_LEVELS,
  PROCESS_DISPLAY_PRECISIONS,
  PROCESS_INPUT_TYPES,
  SPEED_INPUT_TYPES,
  channelAlarmLimits,
  decimalsForPrecision,
  derivedChannelRangeFor,
  formatProcessValue,
  suggestedChannelHysteresis,
  syncChannelLegacyAlarms,
  type CardType,
  type ChannelAlarmLevel,
  type ChannelCommonConfig,
  type ControllerConfig,
  type ProcessConfig,
  type ProcessDisplayPrecision,
  type ProcessInputType,
  type SpeedConfig,
  type SpeedInputType,
  type VibrationConfig,
} from '../../../lib/rack';
import { SIMULATION_BEHAVIOURS, kindsForCardType, manualChannelValue, restingValue, type SimulatedChannel } from '../../../lib/simulation';
import { FormField } from '../FormField';
import { AlarmBandMeter, ExactValueField, KnobResetButton, RotaryKnob, processConditionFor, quantize } from './ChannelValueKnob';

export function Chip<T extends string>({ label, selected, onPress }: { label: T; selected: boolean; onPress: () => void }) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-full border px-3 py-1.5',
        selected ? (isDark ? 'border-ink bg-ink' : 'border-ink-inverse bg-ink-inverse') : isDark ? 'border-line-dark' : 'border-line-light',
      )}
    >
      <Text className={cn('font-body-medium text-xs', selected ? (isDark ? 'text-ink-inverse' : 'text-ink') : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
        {label}
      </Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: string }) {
  const { isDark } = useAppTheme();
  return <Text className={cn('font-body-medium text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{children}</Text>;
}

export function EnabledToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <View className="gap-1.5">
      <FieldLabel>Status</FieldLabel>
      <View className="flex-row gap-2">
        <Chip label="Enabled" selected={enabled} onPress={() => onChange(true)} />
        <Chip label="Disabled" selected={!enabled} onPress={() => onChange(false)} />
      </View>
    </View>
  );
}

// Suggested units per card family. The unit field is free text, so this is a
// shortlist to click rather than a constraint — a custom unit is always typable.
const COMMON_UNITS: Record<string, string[]> = {
  'Vibration Card': ['mm/s', 'mm/s²', 'g', 'µm', 'in/s', 'mil', 'Hz'],
  'RTD Card': ['C', 'degC', 'degF', 'K'],
  'Universal V/I Card': ['bar', 'psi', 'kPa', 'MPa', 'degC', 'degF', '%', 'L/min', 'm3/h', 'A', 'V', 'kW', 'Nm', 'N', 'mm', 'Hz'],
  'Process Card': ['bar', 'psi', 'kPa', 'MPa', 'degC', 'degF', '%', 'L/min', 'm3/h', 'A', 'V', 'Nm', 'N', 'mm', 'Hz'],
  'Speed Card': ['rpm', 'Hz', 'rad/s', 'm/s'],
};

// Which end of the electrical range maps to which end of the operating range.
// Ultron performs the linear conversion internally — no slope or intercept
// field is exposed — so this is a statement of what the card will do rather
// than something to configure.
const ELECTRICAL_MAPPING: Record<ProcessInputType, string> = {
  '0-1 V': '0 V → minimum · 1 V → maximum',
  '0-5 V': '0 V → minimum · 5 V → maximum',
  '0-10 V': '0 V → minimum · 10 V → maximum',
  '4-20 mA': '4 mA → minimum · 20 mA → maximum',
  '0-20 mA': '0 mA → minimum · 20 mA → maximum',
};

type ChannelErrorKey =
  | 'displayName'
  | 'inputType'
  | 'unit'
  | 'rangeMin'
  | 'rangeMax'
  | 'healthyValue'
  | 'offset'
  | 'alarmLowLow'
  | 'alarmLow'
  | 'alarmHigh'
  | 'alarmHighHigh'
  | 'hysteresis'
  | 'alarmDelay'
  | 'displayPrecision'
  | 'channelValue';

export type ChannelConfigErrors = Partial<Record<ChannelErrorKey, string>>;
/** Retained name, so callers that spoke of "process" errors keep compiling. */
export type ProcessConfigErrors = ChannelConfigErrors;

function numberFromText(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Every rule that can block a save, for any acquisition card.
 *
 * There is no minimum/maximum rule any more, because there are no minimum and
 * maximum fields: the operating range is derived from the enabled alarm levels,
 * so a threshold cannot fall outside its own range and the two can never be
 * made to disagree. What is left is the levels' own ordering, the hysteresis
 * and delay bounds, and the fields the channel cannot be identified without.
 */
export function channelConfigErrors(type: CardType, config: ChannelCommonConfig): ChannelConfigErrors {
  const errors: ChannelConfigErrors = {};
  const displayName = config.channelNames[0] ?? '';
  const offset = numberFromText(config.offset);
  const hysteresis = numberFromText(config.hysteresis);
  const alarmDelay = numberFromText(config.alarmDelay);
  const rangeMin = numberFromText(config.rangeMin);
  const rangeMax = numberFromText(config.rangeMax);
  const healthyValue = numberFromText(config.healthyValue);
  const { min, max } = derivedChannelRangeFor(config);
  const span = max > min ? max - min : null;

  if (!displayName.trim()) errors.displayName = 'Display name is required';
  if (!config.unit.trim()) errors.unit = 'Engineering unit is required';
  if ((type === 'Process Card' || type === 'Universal V/I Card') && 'inputType' in config && !PROCESS_INPUT_TYPES.includes((config as ProcessConfig).inputType)) {
    errors.inputType = 'Select an input type';
  }
  if (type === 'Speed Card' && 'inputType' in config && !SPEED_INPUT_TYPES.includes((config as SpeedConfig).inputType)) {
    errors.inputType = 'Select an input type';
  }
  if (rangeMin === null) errors.rangeMin = 'Full range minimum must be numeric';
  if (rangeMax === null) {
    errors.rangeMax = 'Full range maximum must be numeric';
  } else if (rangeMin !== null && rangeMax <= rangeMin) {
    errors.rangeMax = 'Full range maximum must be greater than minimum';
  }
  if (config.healthyValue.trim() && healthyValue === null) {
    errors.healthyValue = 'Healthy/reset value must be numeric';
  } else if (healthyValue !== null && rangeMin !== null && rangeMax !== null && rangeMax > rangeMin && (healthyValue < rangeMin || healthyValue > rangeMax)) {
    errors.healthyValue = 'Healthy/reset value must be inside the full range';
  }
  if (offset === null) errors.offset = 'Calibration offset must be numeric';
  if (hysteresis === null) {
    errors.hysteresis = 'Hysteresis must be numeric';
  } else if (hysteresis < 0) {
    errors.hysteresis = 'Hysteresis must be zero or greater';
  } else if (span !== null && hysteresis >= span) {
    errors.hysteresis = 'Hysteresis must be less than the operating span';
  }
  if (alarmDelay === null) {
    errors.alarmDelay = 'Alarm delay must be numeric';
  } else if (alarmDelay < 0) {
    errors.alarmDelay = 'Alarm delay must be zero or greater';
  }
  if (!PROCESS_DISPLAY_PRECISIONS.includes(config.displayPrecision)) errors.displayPrecision = 'Select a display precision';

  const enabledThresholds: { level: ChannelAlarmLevel; value: number }[] = [];
  for (const level of CHANNEL_ALARM_LEVELS) {
    if (!config[level.enabledKey]) continue;
    const value = numberFromText(config[level.valueKey]);
    if (value === null) {
      errors[level.valueKey] = `${level.label} threshold must be numeric`;
      continue;
    }
    enabledThresholds.push({ level, value });
  }

  for (let index = 1; index < enabledThresholds.length; index += 1) {
    const previous = enabledThresholds[index - 1];
    const current = enabledThresholds[index];
    if (current.value <= previous.value) {
      errors[current.level.valueKey] = `${current.level.label} must be greater than ${previous.level.label}`;
    }
  }

  return errors;
}

/** Retained name for callers written against the process-only editor. */
export function processConfigErrors(config: ChannelCommonConfig): ChannelConfigErrors {
  return channelConfigErrors('Process Card', config);
}

/**
 * Whether a driven channel value is usable against this card's configuration.
 *
 * Kept beside `channelConfigErrors` rather than inside it because the value
 * lives on the signal definition, not on the card: a physical card has no such
 * value and must not be blocked from saving for lacking one.
 */
export function channelValueError(config: ChannelCommonConfig, value: number | null): string | undefined {
  const { min, max } = derivedChannelRangeFor(config);
  if (value === null || !Number.isFinite(value)) return 'Channel value must be numeric';
  if (max > min && (value < min || value > max)) return 'Channel value must be inside the full range';
  return undefined;
}

/** Retained name. */
export function processChannelValueError(config: ChannelCommonConfig, value: number | null): string | undefined {
  return channelValueError(config, value);
}

/** The step the knob moves in, taken from the configured display precision. */
export function channelValueStep(precision: ProcessDisplayPrecision): number {
  const decimals = decimalsForPrecision(precision);
  return Number(Math.pow(10, -decimals).toFixed(decimals));
}

function SectionPanel({ index, title, note, children }: { index: string; title: string; note?: string; children: ReactNode }) {
  const { isDark } = useAppTheme();
  return (
    <View className={cn('gap-4 rounded-lg border p-4', isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel')}>
      <View className="gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">{index}</Text>
          <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
        </View>
        {note && <Text className={cn('font-body text-[11px] leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{note}</Text>}
      </View>
      {children}
    </View>
  );
}

// A read-only figure shown beside the fields that produce it — the calibration
// arithmetic, the derived range, the precision preview. Deliberately not an
// input: each of these is a consequence of a value entered somewhere else.
function ReadoutTile({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'warning' | 'critical' }) {
  const { isDark } = useAppTheme();
  const toneClass =
    tone === 'critical' ? 'text-status-critical' : tone === 'warning' ? 'text-status-warning' : tone === 'accent' ? 'text-accent' : isDark ? 'text-ink' : 'text-ink-inverse';
  return (
    <View className={cn('rounded-lg border px-3 py-2', isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light')}>
      <FieldLabel>{label}</FieldLabel>
      <Text className={cn('mt-1 font-mono text-sm', toneClass)}>{value}</Text>
    </View>
  );
}

/**
 * The inline validation bar.
 *
 * Field-level messages already sit under each control; this restates them in
 * one place so the reason Save is disabled is visible without hunting down the
 * page for a red line.
 */
function ValidationBar({ errors }: { errors: ChannelConfigErrors }) {
  const { isDark } = useAppTheme();
  const messages = Object.values(errors).filter((message): message is string => !!message);

  if (messages.length === 0) {
    return (
      <View className="flex-row items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3">
        <View className="h-2 w-2 rounded-full bg-status-success" />
        <Text className="font-body-medium text-xs text-accent">Configuration is valid. Save and Save &amp; Upload are available.</Text>
      </View>
    );
  }

  return (
    <View className="gap-1.5 rounded-lg border border-status-critical/40 bg-status-critical/10 px-4 py-3">
      <Text className="font-body-bold text-xs text-status-critical">
        {messages.length} issue{messages.length === 1 ? '' : 's'} — Save and Save &amp; Upload are disabled
      </Text>
      {messages.map((message) => (
        <Text key={message} className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          · {message}
        </Text>
      ))}
    </View>
  );
}

function FieldCell({ children, basis = 220 }: { children: ReactNode; basis?: number }) {
  return (
    <View className="flex-1" style={{ flexBasis: basis, minWidth: basis }}>
      {children}
    </View>
  );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {
  const { isDark } = useAppTheme();
  return (
    <Pressable
      onPress={() => onChange(!enabled)}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      className={cn(
        'h-8 w-[76px] justify-center rounded-full border px-1',
        enabled ? 'border-status-success bg-status-success' : isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light',
      )}
    >
      <View className={cn('h-6 w-6 rounded-full', enabled ? 'ml-auto bg-white' : isDark ? 'bg-ink-muted' : 'bg-ink-inverse-muted')} />
    </Pressable>
  );
}

/**
 * The one part of the editor that differs by card type: the physical input.
 *
 * Everything else on the page — identity, unit, calibration, alarms, precision,
 * the value knob — is the same for a vibration, process or speed card, because
 * every acquisition card is one channel that reads one number.
 */
function HardwareFields({
  type,
  config,
  setField,
  error,
}: {
  type: CardType;
  config: ChannelCommonConfig;
  setField: (key: string, value: string) => void;
  error?: string;
}) {
  const { isDark } = useAppTheme();

  if (type === 'Vibration Card') {
    const vibration = config as VibrationConfig;
    return (
      <View className="flex-row flex-wrap gap-3">
        <FieldCell>
          <FormField label="Sensor Type" value={vibration.sensorType} onChangeText={(value) => setField('sensorType', value)} placeholder="e.g. Accelerometer" />
        </FieldCell>
        <FieldCell>
          <FormField label="Sensitivity" value={vibration.sensitivity} onChangeText={(value) => setField('sensitivity', value)} placeholder="e.g. 100 mV/g" />
        </FieldCell>
        <FieldCell>
          <FormField label="Sampling Rate" value={vibration.samplingRate} onChangeText={(value) => setField('samplingRate', value)} placeholder="e.g. 2560 Hz" />
        </FieldCell>
      </View>
    );
  }

  if (type === 'Speed Card') {
    const speed = config as SpeedConfig;
    return (
      <View className="gap-3">
        <View className="gap-2">
          <FieldLabel>Input Type *</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {SPEED_INPUT_TYPES.map((option) => (
              <Chip key={option} label={option} selected={speed.inputType === option} onPress={() => setField('inputType', option)} />
            ))}
          </View>
          {error && <Text className="font-body text-xs text-status-critical">{error}</Text>}
        </View>
        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField label="Pulses / Revolution" value={speed.pulsesPerRevolution} onChangeText={(value) => setField('pulsesPerRevolution', value)} placeholder="1" />
          </FieldCell>
          <FieldCell>
            <FormField label="Trigger" value={speed.trigger} onChangeText={(value) => setField('trigger', value)} placeholder="e.g. Rising" />
          </FieldCell>
          <FieldCell>
            <FormField label="Trigger Hysteresis" value={speed.triggerHysteresis} onChangeText={(value) => setField('triggerHysteresis', value)} placeholder="e.g. 0.2 V" />
          </FieldCell>
        </View>
      </View>
    );
  }

  if (type === 'RTD Card') {
    const rtd = config as ProcessConfig;
    return (
      <View className="flex-row flex-wrap gap-3">
        <FieldCell>
          <ReadoutTile label="Sensor Type" value="RTD temperature input" />
        </FieldCell>
        <FieldCell>
          <FormField label="Scaling" value={rtd.scaling} onChangeText={(value) => setField('scaling', value)} placeholder="1" />
        </FieldCell>
        <FieldCell>
          <FormField label="Filter" value={rtd.filter} onChangeText={(value) => setField('filter', value)} placeholder="e.g. 1st order, 5 s" />
        </FieldCell>
      </View>
    );
  }

  const process = config as ProcessConfig;
  return (
    <View className="gap-3">
      <View className="gap-2">
        <FieldLabel>Input Type *</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {PROCESS_INPUT_TYPES.map((option) => {
            const selected = process.inputType === option;
            return (
              <Pressable
                key={option}
                onPress={() => setField('inputType', option)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                className={cn(
                  'min-h-[54px] justify-center rounded-lg border px-4 py-3',
                  selected ? 'border-status-success bg-status-success/10' : isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light',
                )}
                style={{ flexBasis: 142, flexGrow: 1 }}
              >
                <Text className={cn('font-body-bold text-sm', selected ? 'text-status-success' : isDark ? 'text-ink' : 'text-ink-inverse')}>{option}</Text>
                <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                  {option.includes('V') ? 'Voltage input' : 'Current input'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {ELECTRICAL_MAPPING[process.inputType]} — Ultron applies the linear conversion internally.
        </Text>
        {error && <Text className="font-body text-xs text-status-critical">{error}</Text>}
      </View>
      <View className="flex-row flex-wrap gap-3">
        <FieldCell>
          <FormField label="Scaling" value={process.scaling} onChangeText={(value) => setField('scaling', value)} placeholder="1" />
        </FieldCell>
        <FieldCell>
          <FormField label="Filter" value={process.filter} onChangeText={(value) => setField('filter', value)} placeholder="e.g. 1st order, 5 s" />
        </FieldCell>
      </View>
    </View>
  );
}

/**
 * The channel-value editor: a rotary knob driving the exact figure this channel
 * publishes.
 *
 * This is what removes the discrepancy between the configuration page and the
 * machine view. Turning the knob writes `manualValue` onto the signal
 * definition and switches the channel to the `Manual` behaviour, and the
 * generator publishes that number verbatim — no walk, no noise, no pull toward
 * a midpoint. The number on the knob face, the number on the rack faceplate and
 * the number on the mapped machine point are then one stored value rather than
 * three samples of one random walk.
 *
 * The generated behaviours remain beside it for the case a moving signal is
 * what is wanted; touching the knob or exact-value field switches the source
 * back to Manual because the operator is now explicitly setting the value.
 */
function ChannelValuePanel({
  type,
  config,
  channel,
  onChannelChange,
}: {
  type: CardType;
  config: ChannelCommonConfig;
  channel: SimulatedChannel;
  onChannelChange: (channel: SimulatedChannel) => void;
}) {
  const { isDark } = useAppTheme();
  // Held while the operator is mid-keystroke: committing "12." on every
  // character would turn it into 12 and eat the decimal point. The acquisition
  // fields below keep drafts for the same reason.
  const [draft, setDraft] = useState<string | null>(null);
  const [numericDrafts, setNumericDrafts] = useState<Partial<Record<'samplesPerSecond', string>>>({});

  const manual = channel.behaviour === 'Manual';
  const { min, max } = derivedChannelRangeFor(config);
  const step = channelValueStep(config.displayPrecision);
  const offset = numberFromText(config.offset) ?? 0;
  const unit = config.unit.trim();

  const value = manualChannelValue(channel);
  const scaled = value - offset;
  const limits = channelAlarmLimits(config);
  const condition = processConditionFor(value, limits);
  const valueError = manual ? channelValueError(config, channel.manualValue) : undefined;
  const sampleRateText = numericDrafts.samplesPerSecond ?? (Number.isFinite(channel.samplesPerSecond) ? String(channel.samplesPerSecond) : '');
  const sampleRateValue = Number(sampleRateText.trim());
  const sampleRateError =
    sampleRateText.trim() && (!Number.isFinite(sampleRateValue) || sampleRateValue < 0.1 || sampleRateValue > 50)
      ? 'Use 0.1 to 50 samples/second. Decimals are allowed.'
      : undefined;

  const drive = (next: number) => {
    setDraft(null);
    onChannelChange({ ...channel, behaviour: 'Manual', manualValue: next });
  };
  const typeValue = (text: string) => {
    setDraft(text);
    const parsed = Number(text.trim());
    // Typed values are taken verbatim: display precision is a presentation
    // concern, so the exact-value field must not round what it is given.
    if (text.trim() && Number.isFinite(parsed)) onChannelChange({ ...channel, behaviour: 'Manual', manualValue: parsed });
  };

  const conditionLabel = condition === 'critical' ? 'Critical' : condition === 'warning' ? 'Warning' : 'Healthy';
  const conditionClass = condition === 'critical' ? 'text-status-critical' : condition === 'warning' ? 'text-status-warning' : 'text-accent';
  const shown = draft ?? formatProcessValue(value, config.displayPrecision);

  return (
    <SectionPanel
      index="06"
      title="Channel Value"
      note="The configured value published to the rack, mapped machine points and trends."
    >
      <View className={cn('overflow-hidden rounded-lg border', isDark ? 'border-line-dark bg-[#101010]' : 'border-line-light bg-surface-lightpanel')}>
        <View className={cn('flex-row items-start justify-between gap-3 border-b px-4 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
          <View className="min-w-0 flex-1 gap-1">
            <Text className={cn('font-mono text-[9px] uppercase tracking-[0.14em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              CH-01{config.tag.trim() ? `  ·  ${config.tag.trim()}` : ''}
            </Text>
            <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
              {config.channelNames[0]?.trim() || 'Channel 1'}
            </Text>
          </View>
          <View
            className={cn(
              'shrink-0 rounded border px-2 py-1',
              condition === 'critical' ? 'border-status-critical/70' : condition === 'warning' ? 'border-status-warning/70' : 'border-accent/70',
            )}
          >
            <Text className={cn('font-mono text-[8px] uppercase tracking-[0.1em]', conditionClass)}>{conditionLabel}</Text>
          </View>
        </View>

        <View className="items-center px-5 pb-4 pt-5">
          <View className="mb-3 flex-row items-baseline gap-2">
            <Text className={cn('font-mono text-3xl font-light', isDark ? 'text-[#F2EEE6]' : 'text-ink-inverse')}>
              {formatProcessValue(value, config.displayPrecision)}
            </Text>
            <Text className={cn('font-mono text-[10px]', isDark ? 'text-[#96928A]' : 'text-ink-inverse-muted')}>{unit || '—'}</Text>
          </View>
          <RotaryKnob
            label={`${config.channelNames[0]?.trim() || 'Channel'} value`}
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={false}
            onChange={drive}
          />
          {!manual && (
            <Text className={cn('text-center font-body text-[11px] leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              Generated by {channel.behaviour}. Turn the knob or type a value to take direct control.
            </Text>
          )}
        </View>

        <View className="gap-4 px-5 pb-5">
          <AlarmBandMeter min={min} max={max} value={value} limits={limits} unit={unit} />
          <View className="flex-row flex-wrap items-end gap-3">
            <View className="flex-1" style={{ minWidth: 160 }}>
              <ExactValueField value={shown} unit={unit} disabled={false} error={valueError} onChange={typeValue} />
            </View>
            <KnobResetButton label="Reset" disabled={false} onPress={() => drive(quantize(restingValue({ min, max, healthyValue: numberFromText(config.healthyValue) }), step))} />
          </View>

        </View>

        <View className={cn('border-t px-5 py-3', isDark ? 'border-line-dark' : 'border-line-light')}>
          <Text className={cn('font-mono text-[9px] uppercase tracking-[0.08em]', isDark ? 'text-[#716E67]' : 'text-ink-inverse-muted')}>
            {config.tag.trim() || 'UNMAPPED'} / CH-01 / {channel.behaviour.toUpperCase()}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-3">
        <View className="flex-1 gap-1.5" style={{ flexBasis: 260, minWidth: 240 }}>
          <FieldLabel>Value Source</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {SIMULATION_BEHAVIOURS.map((behaviour) => (
              <Chip key={behaviour} label={behaviour} selected={channel.behaviour === behaviour} onPress={() => onChannelChange({ ...channel, behaviour })} />
            ))}
          </View>
        </View>
        <View className="flex-1 gap-1.5" style={{ flexBasis: 220, minWidth: 220 }}>
          <FieldLabel>Channel Output</FieldLabel>
          <View className="flex-row gap-2">
            <Chip label="Enabled" selected={channel.enabled} onPress={() => onChannelChange({ ...channel, enabled: true })} />
            <Chip label="Disabled" selected={!channel.enabled} onPress={() => onChannelChange({ ...channel, enabled: false })} />
          </View>
        </View>
        <View className="flex-1 flex-row gap-3" style={{ flexBasis: 320, minWidth: 280 }}>
          <View className="flex-1">
            <ReadoutTile label="Scaled Value" value={`${formatProcessValue(scaled, config.displayPrecision)} ${unit}`.trim()} />
          </View>
          <View className="flex-1">
            <ReadoutTile label="Calibration Offset" value={`${offset >= 0 ? '+' : ''}${formatProcessValue(offset, config.displayPrecision)} ${unit}`.trim()} />
          </View>
        </View>
      </View>

      <View className={cn('gap-3 rounded-lg border p-3', isDark ? 'border-line-dark' : 'border-line-light')}>
        <FieldLabel>Acquisition</FieldLabel>
        <View className="gap-1.5">
          <FieldLabel>Measurement Type</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {kindsForCardType(type).map((kind) => (
              <Chip key={kind} label={kind} selected={channel.kind === kind} onPress={() => onChannelChange({ ...channel, kind })} />
            ))}
          </View>
          <Text className={cn('font-body text-[11px] leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            Decides how this channel is classified where it is mapped. Unit, full range and alarm levels come from the sections above.
          </Text>
        </View>
        <FieldCell basis={180}>
          <FormField
            label="Samples / second"
            value={sampleRateText}
            onChangeText={(text) => {
              setNumericDrafts({ samplesPerSecond: text });
              const parsed = Number(text.trim());
              if (text.trim() && Number.isFinite(parsed) && parsed >= 0.1 && parsed <= 50) onChannelChange({ ...channel, samplesPerSecond: parsed });
            }}
            placeholder="1"
            error={sampleRateError}
          />
        </FieldCell>
      </View>
    </SectionPanel>
  );
}

/**
 * One configuration page for every acquisition card.
 *
 * Vibration, process and speed cards each carry a single channel that is named,
 * scaled, calibrated, alarmed on four levels, displayed at a precision and —
 * when simulated — driven by a knob. They had three separate editors describing
 * those same things in three different vocabularies; this is the one editor,
 * with the physical input as the only card-specific block.
 */
export function ChannelConfigFields({
  type,
  config,
  setChannelName,
  setConfig,
  channel,
  onChannelChange,
}: {
  type: CardType;
  config: ChannelCommonConfig;
  setChannelName: (index: number, value: string) => void;
  setConfig: (config: ChannelCommonConfig) => void;
  /** Present only for a card in a simulated rack — enables the value knob. */
  channel?: SimulatedChannel;
  onChannelChange?: (channel: SimulatedChannel) => void;
}) {
  const { isDark } = useAppTheme();
  const [unitQuery, setUnitQuery] = useState('');
  const errors = channelConfigErrors(type, config);
  const suggestion = suggestedChannelHysteresis(config);
  const unitOptions = COMMON_UNITS[type] ?? COMMON_UNITS['Process Card'];

  const commit = (next: ChannelCommonConfig) => setConfig(syncChannelLegacyAlarms(next));
  const setField = (key: string, value: string | boolean) => {
    const next = { ...config, [key]: value } as ChannelCommonConfig;
    // The suggested hysteresis tracks the operating span, which the alarm
    // levels move. It is refreshed only while the operator has not overridden
    // it, so a hand-entered value is never quietly replaced.
    const alarmKeys = [
      'rangeMin',
      'rangeMax',
      'alarmLowLow',
      'alarmLow',
      'alarmHigh',
      'alarmHighHigh',
      'alarmLowLowEnabled',
      'alarmLowEnabled',
      'alarmHighEnabled',
      'alarmHighHighEnabled',
    ];
    if (alarmKeys.includes(key)) {
      const previousSuggestion = suggestedChannelHysteresis(config);
      const untouched = !config.hysteresis.trim() || config.hysteresis === previousSuggestion;
      commit({ ...next, hysteresis: untouched ? suggestedChannelHysteresis(next) : config.hysteresis });
      return;
    }
    commit(next);
  };

  // A searchable unit list rather than a long dropdown. The free-text field
  // above doubles as the search box and as the custom-unit entry, so a unit
  // that is not on the list is still one field away.
  const matchingUnits = useMemo(() => {
    const query = unitQuery.trim().toLowerCase();
    if (!query) return unitOptions;
    return unitOptions.filter((unit) => unit.toLowerCase().includes(query));
  }, [unitQuery, unitOptions]);

  const unit = config.unit.trim();
  const offset = numberFromText(config.offset);
  const { min, max } = derivedChannelRangeFor(config);
  const anyAlarmEnabled = CHANNEL_ALARM_LEVELS.some((level) => config[level.enabledKey]);
  const previewScaled = 98.7;
  const allErrors: ChannelConfigErrors =
    channel && channel.behaviour === 'Manual' ? { ...errors, channelValue: channelValueError(config, channel.manualValue) } : errors;

  return (
    <View className="gap-4">
      <SectionPanel index="01" title="Identification" note="Name the signal first: the display name is what the rest of Ultron labels this channel with.">
        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField
              label="Display Name"
              required
              value={config.channelNames[0] ?? ''}
              onChangeText={(value) => setChannelName(0, value)}
              placeholder="e.g. Melt Pressure"
              error={errors.displayName}
            />
          </FieldCell>
          <FieldCell>
            <FormField label="Tag" value={config.tag} onChangeText={(value) => setField('tag', value)} placeholder="e.g. PT-101" />
          </FieldCell>
        </View>
      </SectionPanel>

      <SectionPanel index="02" title="Channel Configuration" note="The physical input and the engineering unit this channel is read in.">
        <HardwareFields type={type} config={config} setField={setField} error={errors.inputType} />
        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField
              label="Engineering Unit"
              required
              value={config.unit}
              onChangeText={(value) => {
                setUnitQuery(value);
                setField('unit', value);
              }}
              placeholder="Search or type a custom unit"
              error={errors.unit}
            />
          </FieldCell>
          <FieldCell>
            <View className="gap-1.5">
              <FieldLabel>Common Units</FieldLabel>
              <View className="flex-row flex-wrap gap-2">
                {matchingUnits.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    selected={config.unit === option}
                    onPress={() => {
                      setUnitQuery('');
                      setField('unit', option);
                    }}
                  />
                ))}
                {matchingUnits.length === 0 && (
                  <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    No match — the typed unit is used as a custom unit.
                  </Text>
                )}
              </View>
            </View>
          </FieldCell>
        </View>
      </SectionPanel>

      <SectionPanel index="03" title="Calibration" note="One signed offset in the selected engineering unit. The final process value is the scaled value plus this offset.">
        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField label="Calibration Offset" value={config.offset} onChangeText={(value) => setField('offset', value)} placeholder="0" error={errors.offset} />
          </FieldCell>
          <FieldCell>
            <ReadoutTile label="Worked Example — Scaled Value" value={`${formatProcessValue(previewScaled, config.displayPrecision)} ${unit}`.trim()} />
          </FieldCell>
          <FieldCell>
            <ReadoutTile
              label="Worked Example — Final Value"
              tone="accent"
              value={offset === null ? '—' : `${formatProcessValue(previewScaled + offset, config.displayPrecision)} ${unit}`.trim()}
            />
          </FieldCell>
        </View>
      </SectionPanel>

      <SectionPanel
        index="04"
        title="Alarm Configuration"
        note="The full range defines the knob and graph scale. LL/L/H/HH define only condition color and alarm state; enabled levels must run LL < L < H < HH."
      >
        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField
              label={`Full Range Minimum${unit ? ` (${unit})` : ''}`}
              value={config.rangeMin}
              onChangeText={(value) => setField('rangeMin', value)}
              placeholder="0"
              error={errors.rangeMin}
            />
          </FieldCell>
          <FieldCell>
            <FormField
              label={`Full Range Maximum${unit ? ` (${unit})` : ''}`}
              value={config.rangeMax}
              onChangeText={(value) => setField('rangeMax', value)}
              placeholder="100"
              error={errors.rangeMax}
            />
          </FieldCell>
          <FieldCell>
            <FormField
              label={`Healthy / Reset Value${unit ? ` (${unit})` : ''}`}
              value={config.healthyValue}
              onChangeText={(value) => setField('healthyValue', value)}
              placeholder="Nominal process value"
              error={errors.healthyValue}
            />
          </FieldCell>
        </View>

        <View className="gap-3">
          {CHANNEL_ALARM_LEVELS.map((level) => (
            <View key={level.valueKey} className={cn('flex-row flex-wrap items-center gap-3 rounded-lg border p-3', isDark ? 'border-line-dark' : 'border-line-light')}>
              <View className="w-[120px] gap-1">
                <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{level.label}</Text>
                <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{level.name}</Text>
              </View>
              <ToggleSwitch enabled={config[level.enabledKey]} onChange={(enabled) => setField(level.enabledKey, enabled)} />
              <FieldCell basis={180}>
                <FormField
                  label={`Threshold${unit ? ` (${unit})` : ''}`}
                  value={config[level.valueKey]}
                  onChangeText={(value) => setField(level.valueKey, value)}
                  placeholder={config[level.enabledKey] ? 'Required' : 'Optional'}
                  error={errors[level.valueKey]}
                />
              </FieldCell>
              <Text className={cn('font-body text-[11px]', config[level.enabledKey] ? 'text-accent' : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                {config[level.enabledKey] ? 'Enabled' : 'Disabled — ignored'}
              </Text>
            </View>
          ))}
        </View>

        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <ReadoutTile
              label="Full Range"
              tone={anyAlarmEnabled ? 'accent' : 'warning'}
              value={`${formatProcessValue(min, config.displayPrecision)} to ${formatProcessValue(max, config.displayPrecision)} ${unit}`.trim()}
            />
          </FieldCell>
          <FieldCell>
            <FormField
              label={`Hysteresis${unit ? ` (${unit})` : ''}`}
              value={config.hysteresis}
              onChangeText={(value) => setField('hysteresis', value)}
              placeholder={suggestion ? `Suggested ${suggestion}` : '1% of span'}
              error={errors.hysteresis}
            />
          </FieldCell>
          <FieldCell>
            <FormField label="Alarm Delay (seconds)" value={config.alarmDelay} onChangeText={(value) => setField('alarmDelay', value)} placeholder="0" error={errors.alarmDelay} />
          </FieldCell>
        </View>

        <Text className={cn('font-body text-[11px] leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {anyAlarmEnabled
            ? 'The configured full range stays independent from the alarm levels, so values such as 2.97 stay normal when H is 5 and HH is 7. A high alarm clears below its threshold minus hysteresis, a low alarm clears above its threshold plus hysteresis, and delay applies before an alarm is raised.'
            : 'No alarm level is enabled, so the channel can still publish and graph values inside the configured full range without raising a condition.'}
        </Text>
      </SectionPanel>

      <SectionPanel index="05" title="Display" note="Presentation only — stored and calculated values keep full internal precision.">
        <View className="gap-2">
          <FieldLabel>Display Precision</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {PROCESS_DISPLAY_PRECISIONS.map((precision) => (
              <Chip
                key={precision}
                label={precision}
                selected={config.displayPrecision === precision}
                onPress={() => setField('displayPrecision', precision as ProcessDisplayPrecision)}
              />
            ))}
          </View>
          {errors.displayPrecision && <Text className="font-body text-xs text-status-critical">{errors.displayPrecision}</Text>}
        </View>
        <FieldCell>
          <ReadoutTile label="Displayed Example" value={`${formatProcessValue(125.4271, config.displayPrecision)} ${unit}`.trim()} />
        </FieldCell>
      </SectionPanel>

      {channel && onChannelChange ? (
        <ChannelValuePanel type={type} config={config} channel={channel} onChannelChange={onChannelChange} />
      ) : (
        <SectionPanel index="06" title="Channel Value" note="Where this channel's reading comes from.">
          <Text className={cn('font-body text-xs leading-5', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            This card is wired to the field, so CH-01 reads whatever the sensor sends and there is nothing to set here. A card installed in a simulated rack is driven from this
            page instead, with a knob for the exact value it should publish.
          </Text>
        </SectionPanel>
      )}

      <ValidationBar errors={allErrors} />
    </View>
  );
}

export function ControllerFields({ config, set }: { config: ControllerConfig; set: (k: string, v: string) => void }) {
  return (
    <>
      <FormField label="Controller Name" required value={config.controllerName} onChangeText={(v) => set('controllerName', v)} placeholder="e.g. CTRL-01" />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="IP Address" required value={config.ip} onChangeText={(v) => set('ip', v)} placeholder="192.168.1.21" />
        </View>
        <View className="flex-1">
          <FormField label="Port" required value={config.port} onChangeText={(v) => set('port', v)} placeholder="502" />
        </View>
      </View>
      <FormField label="Firmware" value={config.firmware} onChangeText={(v) => set('firmware', v)} placeholder="e.g. v2.3.1" />
      <View className="gap-1.5">
        <FieldLabel>Role</FieldLabel>
        <View className="flex-row gap-2">
          <Chip label="Primary" selected={config.role === 'Primary'} onPress={() => set('role', 'Primary')} />
          <Chip label="Standby" selected={config.role === 'Standby'} onPress={() => set('role', 'Standby')} />
        </View>
      </View>
      <FormField label="Partner Controller" value={config.partnerController} onChangeText={(v) => set('partnerController', v)} placeholder="e.g. CTRL-02" />
    </>
  );
}
