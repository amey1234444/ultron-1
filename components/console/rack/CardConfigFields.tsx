import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  PROCESS_DISPLAY_PRECISIONS,
  PROCESS_INPUT_TYPES,
  SPEED_INPUT_TYPES,
  type ControllerConfig,
  type ProcessDisplayPrecision,
  type ProcessConfig,
  type ProcessInputType,
  type SpeedConfig,
  type SpeedInputType,
  type VibrationConfig,
  decimalsForPrecision,
  formatProcessValue,
  suggestedProcessHysteresis,
  syncProcessLegacyAlarms,
} from '../../../lib/rack';
import { SIMULATION_BEHAVIOURS, kindsForCardType, manualChannelValue, restingValue, type SimulatedChannel } from '../../../lib/simulation';
import { FormField } from '../FormField';
import { AlarmBandMeter, ExactValueField, KnobResetButton, RotaryKnob, processConditionFor, quantize, type AlarmLimits } from './ChannelValueKnob';

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

const COMMON_PROCESS_UNITS = ['bar', 'psi', 'kPa', 'MPa', 'degC', 'degF', '%', 'L/min', 'm3/h', 'A', 'V', 'Nm', 'N', 'mm', 'Hz'];

// Section 3.3: which end of the electrical range maps to which end of the
// engineering range. Ultron performs the linear conversion internally - no
// slope or intercept field is exposed - so this is shown as a statement of
// what the card will do rather than as something to configure.
const ELECTRICAL_MAPPING: Record<ProcessInputType, string> = {
  '0-1 V': '0 V → minimum · 1 V → maximum',
  '0-5 V': '0 V → minimum · 5 V → maximum',
  '0-10 V': '0 V → minimum · 10 V → maximum',
  '4-20 mA': '4 mA → minimum · 20 mA → maximum',
  '0-20 mA': '0 mA → minimum · 20 mA → maximum',
};

const PROCESS_ALARM_LEVELS = [
  { enabledKey: 'alarmLowLowEnabled', valueKey: 'alarmLowLow', label: 'LL', name: 'Low Low' },
  { enabledKey: 'alarmLowEnabled', valueKey: 'alarmLow', label: 'L', name: 'Low' },
  { enabledKey: 'alarmHighEnabled', valueKey: 'alarmHigh', label: 'H', name: 'High' },
  { enabledKey: 'alarmHighHighEnabled', valueKey: 'alarmHighHigh', label: 'HH', name: 'High High' },
] as const;

type ProcessAlarmLevel = (typeof PROCESS_ALARM_LEVELS)[number];
type ProcessErrorKey =
  | 'displayName'
  | 'inputType'
  | 'unit'
  | 'engineeringMin'
  | 'engineeringMax'
  | 'offset'
  | 'alarmLowLow'
  | 'alarmLow'
  | 'alarmHigh'
  | 'alarmHighHigh'
  | 'hysteresis'
  | 'alarmDelay'
  | 'displayPrecision'
  | 'channelValue';

export type ProcessConfigErrors = Partial<Record<ProcessErrorKey, string>>;

function numberFromText(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function processConfigErrors(config: ProcessConfig): ProcessConfigErrors {
  const errors: ProcessConfigErrors = {};
  const displayName = config.channelNames[0] ?? '';
  const min = numberFromText(config.engineeringMin);
  const max = numberFromText(config.engineeringMax);
  const offset = numberFromText(config.offset);
  const hysteresis = numberFromText(config.hysteresis);
  const alarmDelay = numberFromText(config.alarmDelay);
  const hasRange = min !== null && max !== null && max > min;
  const span = hasRange ? max - min : null;

  if (!displayName.trim()) errors.displayName = 'Display name is required';
  if (!PROCESS_INPUT_TYPES.includes(config.inputType)) errors.inputType = 'Select an input type';
  if (!config.unit.trim()) errors.unit = 'Engineering unit is required';
  if (min === null) errors.engineeringMin = 'Engineering minimum must be numeric';
  if (max === null) errors.engineeringMax = 'Engineering maximum must be numeric';
  if (min !== null && max !== null && max <= min) errors.engineeringMax = 'Engineering maximum must be greater than minimum';
  if (offset === null) errors.offset = 'Offset must be numeric';
  if (hysteresis === null) {
    errors.hysteresis = 'Hysteresis must be numeric';
  } else if (hysteresis < 0) {
    errors.hysteresis = 'Hysteresis must be zero or greater';
  } else if (span !== null && hysteresis >= span) {
    errors.hysteresis = 'Hysteresis must be less than the engineering span';
  }
  if (alarmDelay === null) {
    errors.alarmDelay = 'Delay must be numeric';
  } else if (alarmDelay < 0) {
    errors.alarmDelay = 'Delay must be zero or greater';
  }
  if (!PROCESS_DISPLAY_PRECISIONS.includes(config.displayPrecision)) errors.displayPrecision = 'Select a display precision';

  const enabledThresholds: { level: ProcessAlarmLevel; value: number }[] = [];
  for (const level of PROCESS_ALARM_LEVELS) {
    if (!config[level.enabledKey]) continue;
    const value = numberFromText(config[level.valueKey]);
    if (value === null) {
      errors[level.valueKey] = `${level.label} threshold must be numeric`;
      continue;
    }
    if (hasRange && (value < min || value > max)) {
      errors[level.valueKey] = `${level.label} must be inside the engineering range`;
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

// A read-only figure shown beside the fields that produce it - the calibration
// arithmetic and the display-precision preview. Deliberately not an input: the
// specification exposes exactly one calibration control, a signed offset.
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
 * The inline validation bar from section 8 of the specification.
 *
 * Field-level messages already sit under each control; this restates them in
 * one place so the reason Save is disabled is visible without hunting down the
 * page for a red line.
 */
function ValidationBar({ errors }: { errors: ProcessConfigErrors }) {
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

export function ChannelNameFields({
  channelNames,
  setChannelName,
  placeholder,
}: {
  channelNames: string[];
  setChannelName: (index: number, value: string) => void;
  placeholder: (index: number) => string;
}) {
  // One channel per card, so the single field is just "Channel Name"; the map is
  // kept so a card type that ever exposes more than one still renders correctly.
  return (
    <>
      {channelNames.map((name, index) => (
        <FormField
          key={index}
          label={channelNames.length === 1 ? 'Channel Name' : `Channel ${index + 1} Name`}
          required={index === 0}
          value={name}
          onChangeText={(v) => setChannelName(index, v)}
          placeholder={placeholder(index)}
        />
      ))}
    </>
  );
}

export function VibrationFields({
  config,
  set,
  setChannelName,
}: {
  config: VibrationConfig;
  set: (k: string, v: string) => void;
  setChannelName: (index: number, value: string) => void;
}) {
  return (
    <>
      <ChannelNameFields
        channelNames={config.channelNames}
        setChannelName={setChannelName}
        placeholder={(i) => (i === 0 ? 'e.g. DE Horizontal' : 'e.g. DE Vertical')}
      />
      <FormField label="Sensor Type" value={config.sensorType} onChangeText={(v) => set('sensorType', v)} placeholder="e.g. Accelerometer" />
      <FormField label="Sensitivity" value={config.sensitivity} onChangeText={(v) => set('sensitivity', v)} placeholder="e.g. 100 mV/g" />
      <FormField label="Engineering Unit" value={config.engineeringUnit} onChangeText={(v) => set('engineeringUnit', v)} placeholder="e.g. mm/s" />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Range Min" value={config.measurementRangeMin} onChangeText={(v) => set('measurementRangeMin', v)} placeholder="0" />
        </View>
        <View className="flex-1">
          <FormField label="Range Max" value={config.measurementRangeMax} onChangeText={(v) => set('measurementRangeMax', v)} placeholder="50" />
        </View>
      </View>
      <FormField label="Sampling Rate" value={config.samplingRate} onChangeText={(v) => set('samplingRate', v)} placeholder="e.g. 2560 Hz" />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Warning Alarm" value={config.alarmWarning} onChangeText={(v) => set('alarmWarning', v)} placeholder="e.g. 7.1" />
        </View>
        <View className="flex-1">
          <FormField label="Critical Alarm" value={config.alarmCritical} onChangeText={(v) => set('alarmCritical', v)} placeholder="e.g. 11.0" />
        </View>
      </View>
    </>
  );
}

/**
 * The alarm thresholds that are actually armed, as numbers.
 *
 * A disabled level is null rather than its stored text, because section 5 is
 * explicit that disabled alarms take no part in ordering, in banding or in
 * evaluating a reading — and a stored threshold survives being switched off.
 */
export function processAlarmLimits(config: ProcessConfig): AlarmLimits {
  const armed = (enabled: boolean, text: string) => (enabled ? numberFromText(text) : null);
  return {
    lowLow: armed(config.alarmLowLowEnabled, config.alarmLowLow),
    low: armed(config.alarmLowEnabled, config.alarmLow),
    high: armed(config.alarmHighEnabled, config.alarmHigh),
    highHigh: armed(config.alarmHighHighEnabled, config.alarmHighHigh),
  };
}

/**
 * Whether a driven channel value is usable against this card's configuration.
 *
 * Kept beside `processConfigErrors` rather than inside it because the value
 * lives on the signal definition, not on the card: a physical card has no such
 * value and must not be blocked from saving for lacking one.
 */
export function processChannelValueError(config: ProcessConfig, value: number | null): string | undefined {
  const min = numberFromText(config.engineeringMin);
  const max = numberFromText(config.engineeringMax);
  if (value === null || !Number.isFinite(value)) return 'Channel value must be numeric';
  if (min !== null && max !== null && max > min && (value < min || value > max)) {
    return 'Channel value must be inside the engineering range';
  }
  return undefined;
}

/** The step the knob moves in, taken from the configured display precision. */
export function processValueStep(precision: ProcessConfig['displayPrecision']): number {
  const decimals = decimalsForPrecision(precision);
  return Number(Math.pow(10, -decimals).toFixed(decimals));
}

/**
 * The channel-value editor: a rotary knob driving the exact figure this channel
 * publishes.
 *
 * This is the piece that removes the discrepancy between the configuration page
 * and the machine view. Turning the knob writes `manualValue` onto the signal
 * definition and switches the channel to the `Manual` behaviour, and the
 * generator publishes that number verbatim — no walk, no noise, no pull toward
 * a band midpoint. The number under the knob, the number on the rack faceplate
 * and the number on the mapped machine point are then the same number, because
 * they are all one stored value rather than three samples of one random walk.
 *
 * The generated behaviours remain available beside it, for the case a moving
 * signal is what is wanted; the knob then shows where the walk currently sits
 * and is read-only.
 */
function ChannelValuePanel({
  config,
  channel,
  onChannelChange,
}: {
  config: ProcessConfig;
  channel: SimulatedChannel;
  onChannelChange: (channel: SimulatedChannel) => void;
}) {
  const { isDark } = useAppTheme();
  // Held while the operator is mid-keystroke: committing "12." on every
  // character would turn it into 12 and eat the decimal point. The same applies
  // to the acquisition fields below, which is why they keep drafts too.
  const [draft, setDraft] = useState<string | null>(null);
  const [numericDrafts, setNumericDrafts] = useState<Partial<Record<'samplesPerSecond' | 'normalMin' | 'normalMax', string>>>({});

  const manual = channel.behaviour === 'Manual';
  const min = numberFromText(config.engineeringMin);
  const max = numberFromText(config.engineeringMax);
  const hasRange = min !== null && max !== null && max > min;
  const step = processValueStep(config.displayPrecision);
  const offset = numberFromText(config.offset) ?? 0;
  const unit = config.unit.trim();

  const value = manualChannelValue(channel);
  const scaled = value - offset;
  const limits = processAlarmLimits(config);
  const condition = processConditionFor(value, limits);
  const valueError = manual ? processChannelValueError(config, channel.manualValue) : undefined;

  const drive = (next: number) => {
    setDraft(null);
    onChannelChange({ ...channel, behaviour: 'Manual', manualValue: next });
  };
  const numberText = (raw: number | null) => (raw === null || !Number.isFinite(raw) ? '' : String(raw));
  const setNumeric = (key: 'samplesPerSecond' | 'normalMin' | 'normalMax', text: string, optional: boolean) => {
    setNumericDrafts((current) => ({ ...current, [key]: text }));
    const trimmed = text.trim();
    if (!trimmed) {
      onChannelChange({ ...channel, [key]: optional ? null : Number.NaN });
      return;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) onChannelChange({ ...channel, [key]: parsed });
  };
  const typeValue = (text: string) => {
    setDraft(text);
    const parsed = Number(text.trim());
    // Typed values are taken verbatim: section 6 makes precision a display
    // concern, so the exact-value field must not round what it is given.
    if (text.trim() && Number.isFinite(parsed)) onChannelChange({ ...channel, behaviour: 'Manual', manualValue: parsed });
  };

  const conditionLabel = condition === 'critical' ? 'Critical' : condition === 'warning' ? 'Warning' : 'Normal';
  const conditionClass = condition === 'critical' ? 'text-status-critical' : condition === 'warning' ? 'text-status-warning' : 'text-accent';
  const shown = draft ?? formatProcessValue(value, config.displayPrecision);

  return (
    <SectionPanel
      index="06"
      title="Channel Value"
      note="Drives the value this channel publishes to the rack, to mapped machine points and to trends. Drag the knob, scroll it, use the arrow keys, or type an exact value."
    >
      <View className="flex-row flex-wrap items-start gap-5">
        <View className="items-center gap-3" style={{ flexBasis: 180 }}>
          <RotaryKnob
            label={`${config.channelNames[0]?.trim() || 'Channel'} value`}
            value={value}
            min={hasRange ? (min as number) : channel.min}
            max={hasRange ? (max as number) : channel.max}
            step={step}
            tone={condition}
            disabled={!manual}
            onChange={drive}
          />
          {!manual && (
            <Text className={cn('text-center font-body text-[11px] leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
              Generated by {channel.behaviour}. Turn on Manual to set the value directly.
            </Text>
          )}
        </View>

        <View className="flex-1 gap-3" style={{ flexBasis: 260, minWidth: 260 }}>
          <View className={cn('rounded-lg border px-4 py-3', isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light')}>
            <FieldLabel>Published value</FieldLabel>
            <View className="mt-1 flex-row items-baseline gap-2">
              <Text className={cn('font-mono text-3xl', conditionClass)}>{formatProcessValue(value, config.displayPrecision)}</Text>
              <Text className={cn('font-body-medium text-sm', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{unit || '—'}</Text>
            </View>
            <Text className={cn('mt-1 font-body text-[11px]', conditionClass)}>{conditionLabel} against the configured alarm limits</Text>
          </View>

          <View className="flex-row flex-wrap items-end gap-3">
            <View className="flex-1" style={{ minWidth: 160 }}>
              <ExactValueField value={shown} unit={unit} disabled={!manual} error={valueError} onChange={typeValue} />
            </View>
            <KnobResetButton label="Reset" disabled={!manual} onPress={() => drive(quantize(restingValue(channel), step))} />
          </View>

          <View className="gap-1.5">
            <FieldLabel>Value Source</FieldLabel>
            <View className="flex-row flex-wrap gap-2">
              {SIMULATION_BEHAVIOURS.map((behaviour) => (
                <Chip
                  key={behaviour}
                  label={behaviour}
                  selected={channel.behaviour === behaviour}
                  onPress={() => onChannelChange({ ...channel, behaviour })}
                />
              ))}
            </View>
          </View>

          <View className="gap-1.5">
            <FieldLabel>Channel Output</FieldLabel>
            <View className="flex-row gap-2">
              <Chip label="Enabled" selected={channel.enabled} onPress={() => onChannelChange({ ...channel, enabled: true })} />
              <Chip label="Disabled" selected={!channel.enabled} onPress={() => onChannelChange({ ...channel, enabled: false })} />
            </View>
          </View>
        </View>

        <View className="flex-1 gap-3" style={{ flexBasis: 280, minWidth: 260 }}>
          <FieldLabel>Alarm Bands</FieldLabel>
          <AlarmBandMeter
            min={hasRange ? (min as number) : channel.min}
            max={hasRange ? (max as number) : channel.max}
            value={value}
            limits={limits}
            unit={unit}
          />
          <ReadoutTile label="Scaled Value" value={`${formatProcessValue(scaled, config.displayPrecision)} ${unit}`.trim()} />
          <ReadoutTile label="Calibration Offset" value={`${offset >= 0 ? '+' : ''}${formatProcessValue(offset, config.displayPrecision)} ${unit}`.trim()} />
        </View>
      </View>

      <View className={cn('gap-3 rounded-lg border p-3', isDark ? 'border-line-dark' : 'border-line-light')}>
        <FieldLabel>Acquisition</FieldLabel>
        <View className="gap-1.5">
          <FieldLabel>Measurement Type</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {kindsForCardType('Process Card').map((kind) => (
              <Chip key={kind} label={kind} selected={channel.kind === kind} onPress={() => onChannelChange({ ...channel, kind })} />
            ))}
          </View>
          <Text className={cn('font-body text-[11px] leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            Decides how this channel is classified where it is mapped. Unit, range and alarm limits come from the sections above.
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-3">
          <FieldCell basis={160}>
            <FormField
              label="Samples / second"
              value={numericDrafts.samplesPerSecond ?? numberText(channel.samplesPerSecond)}
              onChangeText={(value) => setNumeric('samplesPerSecond', value, false)}
              placeholder="1"
            />
          </FieldCell>
          <FieldCell basis={160}>
            <FormField
              label="Normal Min"
              value={numericDrafts.normalMin ?? numberText(channel.normalMin)}
              onChangeText={(value) => setNumeric('normalMin', value, true)}
              placeholder="Optional"
            />
          </FieldCell>
          <FieldCell basis={160}>
            <FormField
              label="Normal Max"
              value={numericDrafts.normalMax ?? numberText(channel.normalMax)}
              onChangeText={(value) => setNumeric('normalMax', value, true)}
              placeholder="Optional"
            />
          </FieldCell>
        </View>
      </View>
    </SectionPanel>
  );
}

export function ProcessFields({
  config,
  setChannelName,
  setConfig,
  channel,
  onChannelChange,
}: {
  config: ProcessConfig;
  setChannelName: (index: number, value: string) => void;
  setConfig: (config: ProcessConfig) => void;
  /** Present only for a card in a simulated rack — enables the value knob. */
  channel?: SimulatedChannel;
  onChannelChange?: (channel: SimulatedChannel) => void;
}) {
  const { isDark } = useAppTheme();
  const [unitQuery, setUnitQuery] = useState('');
  const errors = processConfigErrors(config);
  const suggestion = suggestedProcessHysteresis(config);
  const commit = (next: ProcessConfig) => setConfig(syncProcessLegacyAlarms(next));
  const setProcessField = <K extends keyof ProcessConfig>(key: K, value: ProcessConfig[K]) => {
    if (key === 'engineeringMin' || key === 'engineeringMax') {
      const previousSuggestion = suggestedProcessHysteresis(config);
      const ranged = { ...config, [key]: value };
      const shouldRefreshHysteresis = !config.hysteresis.trim() || config.hysteresis === previousSuggestion;
      commit({
        ...ranged,
        hysteresis: shouldRefreshHysteresis ? suggestedProcessHysteresis(ranged) : config.hysteresis,
      });
      return;
    }
    commit({ ...config, [key]: value });
  };
  const setAlarmEnabled = (level: ProcessAlarmLevel, enabled: boolean) => commit({ ...config, [level.enabledKey]: enabled });

  // Section 3.2 asks for a searchable unit list rather than a long dropdown.
  // The free-text field above doubles as the search box and as the custom-unit
  // entry, so a unit that is not on the list is still one field away.
  const matchingUnits = useMemo(() => {
    const query = unitQuery.trim().toLowerCase();
    if (!query) return COMMON_PROCESS_UNITS;
    return COMMON_PROCESS_UNITS.filter((unit) => unit.toLowerCase().includes(query));
  }, [unitQuery]);

  const offset = numberFromText(config.offset);
  const previewScaled = 98.7;
  const channelErrors: ProcessConfigErrors =
    channel && channel.behaviour === 'Manual'
      ? { ...errors, channelValue: processChannelValueError(config, channel.manualValue) }
      : errors;

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
            <FormField label="Tag" value={config.tag} onChangeText={(value) => setProcessField('tag', value)} placeholder="e.g. PT-101" />
          </FieldCell>
        </View>
      </SectionPanel>

      <SectionPanel index="02" title="Channel Configuration" note="Electrical input, engineering unit and linear scaling for CH-01 on this Universal V/I card.">
        <View className="gap-2">
          <FieldLabel>Input Type *</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {PROCESS_INPUT_TYPES.map((type) => {
              const selected = config.inputType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setProcessField('inputType', type as ProcessInputType)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  className={cn(
                    'min-h-[54px] justify-center rounded-lg border px-4 py-3',
                    selected
                      ? 'border-status-success bg-status-success/10'
                      : isDark
                        ? 'border-line-dark bg-surface-dark'
                        : 'border-line-light bg-surface-light',
                  )}
                  style={{ flexBasis: 142, flexGrow: 1 }}
                >
                  <Text className={cn('font-body-bold text-sm', selected ? 'text-status-success' : isDark ? 'text-ink' : 'text-ink-inverse')}>{type}</Text>
                  <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
                    {type.includes('V') ? 'Voltage input' : 'Current input'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {ELECTRICAL_MAPPING[config.inputType]} — Ultron applies the linear conversion internally.
          </Text>
          {errors.inputType && <Text className="font-body text-xs text-status-critical">{errors.inputType}</Text>}
        </View>

        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField
              label="Engineering Unit"
              required
              value={config.unit}
              onChangeText={(value) => {
                setUnitQuery(value);
                setProcessField('unit', value);
              }}
              placeholder="Search or type a custom unit"
              error={errors.unit}
            />
          </FieldCell>
          <FieldCell>
            <View className="gap-1.5">
              <FieldLabel>Common Units</FieldLabel>
              <View className="flex-row flex-wrap gap-2">
                {matchingUnits.map((unit) => (
                  <Chip
                    key={unit}
                    label={unit}
                    selected={config.unit === unit}
                    onPress={() => {
                      setUnitQuery('');
                      setProcessField('unit', unit);
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

        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField
              label="Engineering Min"
              required
              value={config.engineeringMin}
              onChangeText={(value) => setProcessField('engineeringMin', value)}
              placeholder="0"
              error={errors.engineeringMin}
            />
          </FieldCell>
          <FieldCell>
            <FormField
              label="Engineering Max"
              required
              value={config.engineeringMax}
              onChangeText={(value) => setProcessField('engineeringMax', value)}
              placeholder="250"
              error={errors.engineeringMax}
            />
          </FieldCell>
        </View>
      </SectionPanel>

      <SectionPanel index="03" title="Calibration" note="One signed offset in the selected engineering unit. The final process value is the scaled value plus this offset.">
        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField
              label="Calibration Offset"
              value={config.offset}
              onChangeText={(value) => setProcessField('offset', value)}
              placeholder="0"
              error={errors.offset}
            />
          </FieldCell>
          <FieldCell>
            <ReadoutTile label="Worked Example — Scaled Value" value={`${formatProcessValue(previewScaled, config.displayPrecision)} ${config.unit.trim()}`.trim()} />
          </FieldCell>
          <FieldCell>
            <ReadoutTile
              label="Worked Example — Final Value"
              tone="accent"
              value={
                offset === null
                  ? '—'
                  : `${formatProcessValue(previewScaled + offset, config.displayPrecision)} ${config.unit.trim()}`.trim()
              }
            />
          </FieldCell>
        </View>
      </SectionPanel>

      <SectionPanel
        index="04"
        title="Alarm Configuration"
        note="Each level has its own enable control. Enabled limits must stay inside the engineering range and in the order LL < L < H < HH; disabled levels are ignored."
      >
        <View className="gap-3">
          {PROCESS_ALARM_LEVELS.map((level) => (
            <View key={level.valueKey} className={cn('flex-row flex-wrap items-center gap-3 rounded-lg border p-3', isDark ? 'border-line-dark' : 'border-line-light')}>
              <View className="w-[120px] gap-1">
                <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{level.label}</Text>
                <Text className={cn('font-body text-[11px]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{level.name}</Text>
              </View>
              <ToggleSwitch enabled={config[level.enabledKey]} onChange={(enabled) => setAlarmEnabled(level, enabled)} />
              <FieldCell basis={180}>
                <FormField
                  label={`Threshold${config.unit.trim() ? ` (${config.unit.trim()})` : ''}`}
                  value={config[level.valueKey]}
                  onChangeText={(value) => setProcessField(level.valueKey, value)}
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
            <FormField
              label={`Hysteresis${config.unit.trim() ? ` (${config.unit.trim()})` : ''}`}
              value={config.hysteresis}
              onChangeText={(value) => setProcessField('hysteresis', value)}
              placeholder={suggestion ? `Suggested ${suggestion}` : '1% of span'}
              error={errors.hysteresis}
            />
          </FieldCell>
          <FieldCell>
            <FormField
              label="Alarm Delay (seconds)"
              value={config.alarmDelay}
              onChangeText={(value) => setProcessField('alarmDelay', value)}
              placeholder="0"
              error={errors.alarmDelay}
            />
          </FieldCell>
        </View>
        <Text className={cn('font-body text-[11px] leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          One common hysteresis and one common delay apply to every enabled level. A high alarm clears below its threshold minus the hysteresis; a low alarm clears above its
          threshold plus the hysteresis. An alarm is raised only once the value stays beyond the limit for the whole delay.
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
                onPress={() => setProcessField('displayPrecision', precision as ProcessDisplayPrecision)}
              />
            ))}
          </View>
          {errors.displayPrecision && <Text className="font-body text-xs text-status-critical">{errors.displayPrecision}</Text>}
        </View>
        <FieldCell>
          <ReadoutTile label="Displayed Example" value={`${formatProcessValue(125.4271, config.displayPrecision)} ${config.unit.trim()}`.trim()} />
        </FieldCell>
      </SectionPanel>

      {channel && onChannelChange ? (
        <ChannelValuePanel config={config} channel={channel} onChannelChange={onChannelChange} />
      ) : (
        <SectionPanel index="06" title="Channel Value" note="Where this channel's reading comes from.">
          <Text className={cn('font-body text-xs leading-5', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            This card is wired to the field, so CH-01 reads whatever the transmitter sends and there is nothing to set here. A card installed in a simulated rack is driven from
            this page instead, with a knob for the exact value it should publish.
          </Text>
        </SectionPanel>
      )}

      <ValidationBar errors={channelErrors} />
    </View>
  );
}

export function SpeedFields({
  config,
  set,
  setChannelName,
}: {
  config: SpeedConfig;
  set: (k: string, v: string) => void;
  setChannelName: (index: number, value: string) => void;
}) {
  return (
    <>
      <ChannelNameFields
        channelNames={config.channelNames}
        setChannelName={setChannelName}
        placeholder={(i) => (i === 0 ? 'e.g. Rotor Speed' : 'e.g. Keyphasor')}
      />
      <View className="gap-1.5">
        <FieldLabel>Input Type</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {SPEED_INPUT_TYPES.map((t) => (
            <Chip key={t} label={t} selected={config.inputType === t} onPress={() => set('inputType', t as SpeedInputType)} />
          ))}
        </View>
      </View>
      <FormField label="Engineering Unit" value={config.unit ?? ''} onChangeText={(v) => set('unit', v)} placeholder="e.g. rpm" />
      <FormField label="Pulses Per Revolution" value={config.pulsesPerRevolution} onChangeText={(v) => set('pulsesPerRevolution', v)} placeholder="1" />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Trigger" value={config.trigger} onChangeText={(v) => set('trigger', v)} placeholder="e.g. 2.5 V" />
        </View>
        <View className="flex-1">
          <FormField label="Hysteresis" value={config.hysteresis} onChangeText={(v) => set('hysteresis', v)} placeholder="e.g. 0.2 V" />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Min Speed" value={config.minSpeed} onChangeText={(v) => set('minSpeed', v)} placeholder="0" />
        </View>
        <View className="flex-1">
          <FormField label="Max Speed" value={config.maxSpeed} onChangeText={(v) => set('maxSpeed', v)} placeholder="3600" />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Warning Alarm" value={config.alarmWarning} onChangeText={(v) => set('alarmWarning', v)} placeholder="e.g. 3800" />
        </View>
        <View className="flex-1">
          <FormField label="Critical Alarm" value={config.alarmCritical} onChangeText={(v) => set('alarmCritical', v)} placeholder="e.g. 4000" />
        </View>
      </View>
    </>
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
