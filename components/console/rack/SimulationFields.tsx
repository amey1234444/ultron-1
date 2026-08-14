import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  PROCESS_INPUT_TYPES,
  SPEED_INPUT_TYPES,
  type CardConfig,
  type CardType,
  type ProcessConfig,
  type ProcessInputType,
  type SpeedConfig,
  type SpeedInputType,
  type VibrationConfig,
} from '../../../lib/rack';
import {
  SIMULATION_BEHAVIOURS,
  defaultSimulatedChannel,
  isFaultInjection,
  kindsForCardType,
  sensorLabelForKind,
  validateSimulatedChannel,
  type SimulatedChannel,
  type SimulatedChannelKind,
  type SimulationBehaviour,
} from '../../../lib/simulation';
import { FormField } from '../FormField';
import { Chip, FieldLabel } from './CardConfigFields';

type NumericKey =
  | 'min'
  | 'max'
  | 'samplesPerSecond'
  | 'decimals'
  | 'normalMin'
  | 'normalMax'
  | 'alertLimit'
  | 'dangerLimit';

type NumericDrafts = Record<NumericKey, string>;

function numberText(value: number | null): string {
  return value === null || Number.isNaN(value) ? '' : String(value);
}

function draftsFor(channel: SimulatedChannel): NumericDrafts {
  return {
    min: numberText(channel.min),
    max: numberText(channel.max),
    samplesPerSecond: numberText(channel.samplesPerSecond),
    decimals: numberText(channel.decimals),
    normalMin: numberText(channel.normalMin),
    normalMax: numberText(channel.normalMax),
    alertLimit: numberText(channel.alertLimit),
    dangerLimit: numberText(channel.dangerLimit),
  };
}

function SectionLabel({ index, children }: { index: string; children: string }) {
  const { isDark } = useAppTheme();
  return (
    <View className="flex-row items-center gap-2">
      <Text className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">{index}</Text>
      <Text className={cn('font-body-bold text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>{children}</Text>
    </View>
  );
}

function MetadataFields({ config, onChange }: { config: CardConfig; onChange: (next: CardConfig) => void }) {
  const set = (key: string, value: string) => onChange({ ...config, [key]: value } as CardConfig);

  if ('sensorType' in config) {
    const vibration = config as VibrationConfig;
    return (
      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Sensor Type" value={vibration.sensorType} onChangeText={(value) => set('sensorType', value)} placeholder="e.g. Accelerometer" />
        </View>
        <View className="flex-1">
          <FormField label="Sensitivity" value={vibration.sensitivity} onChangeText={(value) => set('sensitivity', value)} placeholder="e.g. 100 mV/g" />
        </View>
      </View>
    );
  }

  if ('engineeringMin' in config) {
    const process = config as ProcessConfig;
    return (
      <View className="gap-3">
        <View className="gap-1.5">
          <FieldLabel>Input Type</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {PROCESS_INPUT_TYPES.map((type) => (
              <Chip key={type} label={type} selected={process.inputType === type} onPress={() => set('inputType', type as ProcessInputType)} />
            ))}
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="Scaling" value={process.scaling} onChangeText={(value) => set('scaling', value)} placeholder="1.0" />
          </View>
          <View className="flex-1">
            <FormField label="Offset" value={process.offset} onChangeText={(value) => set('offset', value)} placeholder="0" />
          </View>
          <View className="flex-1">
            <FormField label="Filter" value={process.filter} onChangeText={(value) => set('filter', value)} placeholder="e.g. 1st order, 5s" />
          </View>
        </View>
      </View>
    );
  }

  if ('minSpeed' in config) {
    const speed = config as SpeedConfig;
    return (
      <View className="gap-3">
        <View className="gap-1.5">
          <FieldLabel>Input Type</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {SPEED_INPUT_TYPES.map((type) => (
              <Chip key={type} label={type} selected={speed.inputType === type} onPress={() => set('inputType', type as SpeedInputType)} />
            ))}
          </View>
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="Pulses / Revolution" value={speed.pulsesPerRevolution} onChangeText={(value) => set('pulsesPerRevolution', value)} placeholder="1" />
          </View>
          <View className="flex-1">
            <FormField label="Trigger" value={speed.trigger} onChangeText={(value) => set('trigger', value)} placeholder="e.g. 2.5 V" />
          </View>
          <View className="flex-1">
            <FormField label="Hysteresis" value={speed.hysteresis} onChangeText={(value) => set('hysteresis', value)} placeholder="e.g. 0.2 V" />
          </View>
        </View>
      </View>
    );
  }

  return null;
}

/**
 * The single source-of-truth editor for one simulated acquisition card. A
 * physical card still uses CardConfigFields; a simulated card deliberately
 * combines identity, meaningful hardware metadata and generation parameters in
 * one surface so no value appears twice.
 */
export function SimulationFields({
  cardType,
  config,
  cardEnabled,
  channels,
  onConfigChange,
  onCardEnabledChange,
  onChange,
}: {
  cardType: CardType;
  config: CardConfig;
  cardEnabled: boolean;
  channels: SimulatedChannel[];
  onConfigChange: (config: CardConfig) => void;
  onCardEnabledChange: (enabled: boolean) => void;
  onChange: (channels: SimulatedChannel[]) => void;
}) {
  const { isDark } = useAppTheme();
  const channel = channels[0];
  const channelName = 'channelNames' in config ? config.channelNames[0] ?? '' : '';
  const [drafts, setDrafts] = useState<NumericDrafts>(() => draftsFor(channel));

  useEffect(() => {
    setDrafts(draftsFor(channel));
  }, [channel.kind]);

  if (!channel || !('channelNames' in config)) return null;

  const errors = validateSimulatedChannel(channel, channelName);
  const kinds = kindsForCardType(cardType);
  const setChannel = <K extends keyof SimulatedChannel>(key: K, value: SimulatedChannel[K]) => {
    onChange(channels.map((current, index) => (index === 0 ? { ...current, [key]: value } : current)));
  };
  const setChannelName = (value: string) => {
    const channelNames = [...config.channelNames];
    channelNames[0] = value;
    onConfigChange({ ...config, channelNames });
  };
  const setNumeric = (key: NumericKey, text: string, optional = false) => {
    setDrafts((current) => ({ ...current, [key]: text }));
    const trimmed = text.trim();
    const parsed = trimmed ? Number(trimmed) : optional ? null : Number.NaN;
    setChannel(key, (Number.isFinite(parsed) || parsed === null ? parsed : Number.NaN) as never);
  };
  const changeKind = (kind: SimulatedChannelKind) => {
    const next = { ...defaultSimulatedChannel(kind), enabled: channel.enabled, behaviour: channel.behaviour };
    setDrafts(draftsFor(next));
    onChange(channels.map((current, index) => (index === 0 ? next : current)));
  };

  const range = `${drafts.min || '—'}–${drafts.max || '—'}${channel.unit ? ` ${channel.unit}` : ''}`;
  const cadence = Number.isFinite(channel.samplesPerSecond) ? `${channel.samplesPerSecond} sample${channel.samplesPerSecond === 1 ? '' : 's'}/s` : 'invalid cadence';
  const stateLabel = cardEnabled && channel.enabled ? 'Publishing' : 'Paused';

  return (
    <View className={cn('overflow-hidden rounded-2xl border', isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel')}>
      <View className={cn('flex-row items-start justify-between gap-4 border-b px-5 py-4', isDark ? 'border-line-dark' : 'border-line-light')}>
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <View className={cn('h-2 w-2 rounded-full', cardEnabled && channel.enabled ? 'bg-status-success' : 'bg-ink-muted')} />
            <Text className="font-mono text-[9px] uppercase tracking-[0.2em] text-accent">Simulated acquisition</Text>
          </View>
          <Text className={cn('font-heading-medium text-base', isDark ? 'text-ink' : 'text-ink-inverse')}>Signal definition</Text>
          <Text className={cn('font-body text-xs leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            One saved definition drives the rack, alarms, trends and analysis pipeline.
          </Text>
        </View>
        <View className={cn('rounded-full border px-2.5 py-1', cardEnabled && channel.enabled ? 'border-accent/40 bg-accent/10' : isDark ? 'border-line-dark' : 'border-line-light')}>
          <Text className={cn('font-mono text-[9px] uppercase tracking-[0.14em]', cardEnabled && channel.enabled ? 'text-accent' : isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {stateLabel}
          </Text>
        </View>
      </View>

      <View className="gap-5 p-5">
        <View className="gap-3">
          <SectionLabel index="01">Identity & source</SectionLabel>
          <FormField label="Channel Name" required value={channelName} onChangeText={setChannelName} placeholder="e.g. Motor DE" error={errors.channelName} />
          <View className="gap-1.5">
            <FieldLabel>Data Type</FieldLabel>
            <View className="flex-row flex-wrap gap-2">
              {kinds.map((kind) => (
                <Chip key={kind} label={kind} selected={channel.kind === kind} onPress={() => changeKind(kind)} />
              ))}
            </View>
          </View>
          <MetadataFields config={config} onChange={onConfigChange} />
        </View>

        <View className={cn('h-px', isDark ? 'bg-line-dark' : 'bg-line-light')} />

        <View className="gap-3">
          <SectionLabel index="02">Availability</SectionLabel>
          <View className="flex-row flex-wrap gap-6">
            <View className="gap-1.5">
              <FieldLabel>Card</FieldLabel>
              <View className="flex-row gap-2">
                <Chip label="Enabled" selected={cardEnabled} onPress={() => onCardEnabledChange(true)} />
                <Chip label="Disabled" selected={!cardEnabled} onPress={() => onCardEnabledChange(false)} />
              </View>
            </View>
            <View className="gap-1.5">
              <FieldLabel>Channel output</FieldLabel>
              <View className="flex-row gap-2">
                <Chip label="Enabled" selected={channel.enabled} onPress={() => setChannel('enabled', true)} />
                <Chip label="Disabled" selected={!channel.enabled} onPress={() => setChannel('enabled', false)} />
              </View>
            </View>
          </View>
        </View>

        <View className={cn('h-px', isDark ? 'bg-line-dark' : 'bg-line-light')} />

        <View className="gap-3">
          <SectionLabel index="03">Generation</SectionLabel>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField label="Unit" value={channel.unit} onChangeText={(value) => setChannel('unit', value)} placeholder="mm/s" />
            </View>
            <View className="flex-1">
              <FormField label="Minimum" value={drafts.min} onChangeText={(value) => setNumeric('min', value)} placeholder="1.2" error={errors.min} />
            </View>
            <View className="flex-1">
              <FormField label="Maximum" value={drafts.max} onChangeText={(value) => setNumeric('max', value)} placeholder="4.5" error={errors.max} />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField label="Samples / second" value={drafts.samplesPerSecond} onChangeText={(value) => setNumeric('samplesPerSecond', value)} placeholder="10" error={errors.samplesPerSecond} />
            </View>
            <View className="flex-1">
              <FormField label="Decimals" value={drafts.decimals} onChangeText={(value) => setNumeric('decimals', value)} placeholder="2" error={errors.decimals} />
            </View>
          </View>
        </View>

        <View className={cn('h-px', isDark ? 'bg-line-dark' : 'bg-line-light')} />

        <View className="gap-3">
          <SectionLabel index="04">Operating bands</SectionLabel>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField label="Normal Min" value={drafts.normalMin} onChangeText={(value) => setNumeric('normalMin', value, true)} placeholder="Optional" error={errors.normalMin} />
            </View>
            <View className="flex-1">
              <FormField label="Normal Max" value={drafts.normalMax} onChangeText={(value) => setNumeric('normalMax', value, true)} placeholder="Optional" error={errors.normalMax} />
            </View>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField label="Warning Limit" value={drafts.alertLimit} onChangeText={(value) => setNumeric('alertLimit', value, true)} placeholder="Optional" error={errors.alertLimit} />
            </View>
            <View className="flex-1">
              <FormField label="Critical Limit" value={drafts.dangerLimit} onChangeText={(value) => setNumeric('dangerLimit', value, true)} placeholder="Optional" error={errors.dangerLimit} />
            </View>
          </View>
        </View>

        <View className={cn('h-px', isDark ? 'bg-line-dark' : 'bg-line-light')} />

        <View className="gap-3">
          <SectionLabel index="05">Signal behaviour</SectionLabel>
          <View className="flex-row flex-wrap gap-2">
            {SIMULATION_BEHAVIOURS.map((behaviour) => (
              <Chip key={behaviour} label={behaviour} selected={channel.behaviour === behaviour} onPress={() => setChannel('behaviour', behaviour as SimulationBehaviour)} />
            ))}
          </View>
          <Text className={cn('font-body text-xs leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {isFaultInjection(channel.behaviour)
              ? 'Fault injection intentionally crosses the configured limit so alarm and analysis paths can be verified.'
              : 'Generated values remain inside the configured minimum and maximum.'}
          </Text>
        </View>

        <View className="rounded-xl border border-accent/30 bg-accent/10 p-4">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">Simulation summary</Text>
            <Text className="font-mono text-[10px] text-accent">{stateLabel}</Text>
          </View>
          <Text className={cn('mt-2 font-body-medium text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
            {channelName.trim() || 'Unnamed channel'} · {sensorLabelForKind(channel.kind)} · {range}
          </Text>
          <Text className={cn('mt-1 font-body text-xs', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
            {cadence} · {channel.decimals} decimals · {channel.behaviour}
          </Text>
        </View>
      </View>
    </View>
  );
}
