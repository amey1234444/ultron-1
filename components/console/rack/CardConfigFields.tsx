import type { ReactNode } from 'react';
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
  suggestedProcessHysteresis,
  syncProcessLegacyAlarms,
} from '../../../lib/rack';
import { FormField } from '../FormField';

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

const PROCESS_ALARM_LEVELS = [
  { enabledKey: 'alarmLowLowEnabled', valueKey: 'alarmLowLow', label: 'LL', name: 'Low Low' },
  { enabledKey: 'alarmLowEnabled', valueKey: 'alarmLow', label: 'L', name: 'Low' },
  { enabledKey: 'alarmHighEnabled', valueKey: 'alarmHigh', label: 'H', name: 'High' },
  { enabledKey: 'alarmHighHighEnabled', valueKey: 'alarmHighHigh', label: 'HH', name: 'High High' },
] as const;

type ProcessAlarmLevel = (typeof PROCESS_ALARM_LEVELS)[number];
type ProcessErrorKey =
  | 'displayName'
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
  | 'displayPrecision';

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

function SectionPanel({ title, children }: { title: string; children: ReactNode }) {
  const { isDark } = useAppTheme();
  return (
    <View className={cn('gap-4 rounded-lg border p-4', isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel')}>
      <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{title}</Text>
      {children}
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

export function ProcessFields({
  config,
  setChannelName,
  setConfig,
}: {
  config: ProcessConfig;
  setChannelName: (index: number, value: string) => void;
  setConfig: (config: ProcessConfig) => void;
}) {
  const { isDark } = useAppTheme();
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

  return (
    <View className="gap-4">
      <SectionPanel title="Identification">
        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField
              label="Display Name"
              required
              value={config.channelNames[0] ?? ''}
              onChangeText={(value) => setChannelName(0, value)}
              placeholder="e.g. Inlet Pressure"
              error={errors.displayName}
            />
          </FieldCell>
          <FieldCell>
            <FormField label="Tag" value={config.tag} onChangeText={(value) => setProcessField('tag', value)} placeholder="e.g. PT-101" />
          </FieldCell>
        </View>
      </SectionPanel>

      <SectionPanel title="Channel Configuration">
        <View className="gap-2">
          <FieldLabel>Input Type</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {PROCESS_INPUT_TYPES.map((type) => {
              const selected = config.inputType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setProcessField('inputType', type as ProcessInputType)}
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
        </View>
        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField label="Engineering Unit" required value={config.unit} onChangeText={(value) => setProcessField('unit', value)} placeholder="e.g. bar" error={errors.unit} />
          </FieldCell>
          <FieldCell>
            <View className="gap-1.5">
              <FieldLabel>Common Units</FieldLabel>
              <View className="flex-row flex-wrap gap-2">
                {COMMON_PROCESS_UNITS.map((unit) => (
                  <Chip key={unit} label={unit} selected={config.unit === unit} onPress={() => setProcessField('unit', unit)} />
                ))}
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
              placeholder="100"
              error={errors.engineeringMax}
            />
          </FieldCell>
        </View>
      </SectionPanel>

      <SectionPanel title="Calibration">
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
            <View className={cn('rounded-lg border px-3 py-2', isDark ? 'border-line-dark bg-surface-dark' : 'border-line-light bg-surface-light')}>
              <FieldLabel>Applied Unit</FieldLabel>
              <Text className={cn('mt-1 font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>{config.unit.trim() || 'Engineering unit'}</Text>
            </View>
          </FieldCell>
        </View>
      </SectionPanel>

      <SectionPanel title="Alarm Configuration">
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
                  label="Threshold"
                  value={config[level.valueKey]}
                  onChangeText={(value) => setProcessField(level.valueKey, value)}
                  placeholder="Optional"
                  error={errors[level.valueKey]}
                />
              </FieldCell>
            </View>
          ))}
        </View>
        <View className="flex-row flex-wrap gap-3">
          <FieldCell>
            <FormField
              label="Hysteresis"
              value={config.hysteresis}
              onChangeText={(value) => setProcessField('hysteresis', value)}
              placeholder={suggestion ? `Suggested ${suggestion}` : '1% of span'}
              error={errors.hysteresis}
            />
          </FieldCell>
          <FieldCell>
            <FormField label="Alarm Delay Seconds" value={config.alarmDelay} onChangeText={(value) => setProcessField('alarmDelay', value)} placeholder="0" error={errors.alarmDelay} />
          </FieldCell>
        </View>
      </SectionPanel>

      <SectionPanel title="Display">
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
      </SectionPanel>
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
