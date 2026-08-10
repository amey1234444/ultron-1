import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  PROCESS_INPUT_TYPES,
  SPEED_INPUT_TYPES,
  type ControllerConfig,
  type ProcessConfig,
  type ProcessInputType,
  type SpeedConfig,
  type SpeedInputType,
  type VibrationConfig,
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
  set,
  setChannelName,
}: {
  config: ProcessConfig;
  set: (k: string, v: string) => void;
  setChannelName: (index: number, value: string) => void;
}) {
  return (
    <>
      <ChannelNameFields channelNames={config.channelNames} setChannelName={setChannelName} placeholder={(i) => `e.g. Process Point ${i + 1}`} />
      <View className="gap-1.5">
        <FieldLabel>Input Type</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {PROCESS_INPUT_TYPES.map((t) => (
            <Chip key={t} label={t} selected={config.inputType === t} onPress={() => set('inputType', t as ProcessInputType)} />
          ))}
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Eng. Min" value={config.engineeringMin} onChangeText={(v) => set('engineeringMin', v)} placeholder="0" />
        </View>
        <View className="flex-1">
          <FormField label="Eng. Max" value={config.engineeringMax} onChangeText={(v) => set('engineeringMax', v)} placeholder="100" />
        </View>
      </View>
      <FormField label="Unit" value={config.unit} onChangeText={(v) => set('unit', v)} placeholder="e.g. bar" />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Scaling" value={config.scaling} onChangeText={(v) => set('scaling', v)} placeholder="1.0" />
        </View>
        <View className="flex-1">
          <FormField label="Offset" value={config.offset} onChangeText={(v) => set('offset', v)} placeholder="0" />
        </View>
      </View>
      <FormField label="Filter" value={config.filter} onChangeText={(v) => set('filter', v)} placeholder="e.g. 1st order, 5s" />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Warning Alarm" value={config.alarmWarning} onChangeText={(v) => set('alarmWarning', v)} placeholder="e.g. 8.5" />
        </View>
        <View className="flex-1">
          <FormField label="Critical Alarm" value={config.alarmCritical} onChangeText={(v) => set('alarmCritical', v)} placeholder="e.g. 10.5" />
        </View>
      </View>
    </>
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
