import { Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  SIMULATION_BEHAVIOURS,
  isFaultInjection,
  kindsForCardType,
  defaultSimulatedChannel,
  type SimulatedChannel,
  type SimulatedChannelKind,
  type SimulationBehaviour,
} from '../../../lib/simulation';
import type { CardType } from '../../../lib/rack';
import { FormField } from '../FormField';
import { Chip, FieldLabel } from './CardConfigFields';

// Numeric fields are edited as text so a half-typed value ("4." , "-") is not
// destroyed mid-keystroke; blank means "not set" for the optional limits.
function numberText(value: number | null): string {
  return value === null || Number.isNaN(value) ? '' : String(value);
}

function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function ChannelSimulationCard({
  index,
  name,
  cardType,
  channel,
  onChange,
}: {
  index: number;
  name: string;
  cardType: CardType;
  channel: SimulatedChannel;
  onChange: (next: SimulatedChannel) => void;
}) {
  const { isDark } = useAppTheme();
  const kinds = kindsForCardType(cardType);
  const set = <K extends keyof SimulatedChannel>(key: K, value: SimulatedChannel[K]) => onChange({ ...channel, [key]: value });
  const setNumber = (key: 'min' | 'max' | 'samplesPerSecond' | 'decimals', text: string) => {
    const parsed = parseNumber(text);
    if (parsed !== null) set(key, parsed);
  };
  const rangeInvalid = channel.max <= channel.min;
  const limitsInverted =
    channel.alertLimit !== null && channel.dangerLimit !== null && channel.dangerLimit < channel.alertLimit;

  return (
    <View className={cn('gap-3 rounded-xl border p-4', isDark ? 'border-line-dark bg-white/[0.02]' : 'border-line-light bg-white')}>
      <View className="flex-row items-center justify-between">
        <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>
          Channel {index + 1}
          {name ? ` · ${name}` : ''}
        </Text>
        <View className="flex-row gap-2">
          <Chip label="Enabled" selected={channel.enabled} onPress={() => set('enabled', true)} />
          <Chip label="Disabled" selected={!channel.enabled} onPress={() => set('enabled', false)} />
        </View>
      </View>

      {kinds.length > 1 && (
        <View className="gap-1.5">
          <FieldLabel>Channel Type</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            {kinds.map((kind) => (
              <Chip
                key={kind}
                label={kind}
                selected={channel.kind === kind}
                // Switching type re-seeds the whole signal: a temperature band
                // makes no sense carried over to a current channel.
                onPress={() => onChange({ ...defaultSimulatedChannel(kind as SimulatedChannelKind), enabled: channel.enabled, behaviour: channel.behaviour })}
              />
            ))}
          </View>
        </View>
      )}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Minimum Value" value={numberText(channel.min)} onChangeText={(v) => setNumber('min', v)} placeholder="4.44" />
        </View>
        <View className="flex-1">
          <FormField label="Maximum Value" value={numberText(channel.max)} onChangeText={(v) => setNumber('max', v)} placeholder="4.46" />
        </View>
      </View>
      {rangeInvalid && <Text className="font-body text-xs text-status-critical">Maximum must be greater than minimum.</Text>}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField label="Unit" value={channel.unit} onChangeText={(v) => set('unit', v)} placeholder="mm/s" />
        </View>
        <View className="flex-1">
          <FormField
            label="Samples / second"
            value={numberText(channel.samplesPerSecond)}
            onChangeText={(v) => setNumber('samplesPerSecond', v)}
            placeholder="10"
          />
        </View>
        <View className="flex-1">
          <FormField label="Decimals" value={numberText(channel.decimals)} onChangeText={(v) => setNumber('decimals', v)} placeholder="2" />
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField
            label="Normal Range Min"
            value={numberText(channel.normalMin)}
            onChangeText={(v) => set('normalMin', parseNumber(v))}
            placeholder="optional"
          />
        </View>
        <View className="flex-1">
          <FormField
            label="Normal Range Max"
            value={numberText(channel.normalMax)}
            onChangeText={(v) => set('normalMax', parseNumber(v))}
            placeholder="optional"
          />
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <FormField
            label="Alert Limit"
            value={numberText(channel.alertLimit)}
            onChangeText={(v) => set('alertLimit', parseNumber(v))}
            placeholder="5"
          />
        </View>
        <View className="flex-1">
          <FormField
            label="Danger Limit"
            value={numberText(channel.dangerLimit)}
            onChangeText={(v) => set('dangerLimit', parseNumber(v))}
            placeholder="7"
          />
        </View>
      </View>
      {limitsInverted && <Text className="font-body text-xs text-status-warning">Danger limit is below the alert limit.</Text>}

      <View className="gap-1.5">
        <FieldLabel>Signal Behaviour</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {SIMULATION_BEHAVIOURS.map((behaviour) => (
            <Chip
              key={behaviour}
              label={behaviour}
              selected={channel.behaviour === behaviour}
              onPress={() => set('behaviour', behaviour as SimulationBehaviour)}
            />
          ))}
        </View>
        <Text className={cn('font-body text-xs leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          {isFaultInjection(channel.behaviour)
            ? 'Fault injection: values are driven past the limit above so the alarm, dashboard and analysis path can be exercised. The configured range is deliberately exceeded.'
            : 'Values stay inside the configured minimum and maximum.'}
        </Text>
      </View>
    </View>
  );
}

/**
 * Per-channel simulated signal configuration for a card in a simulated rack.
 * Shown alongside the card's normal configuration — the card keeps its real
 * schema; this only describes what the virtual sensor should produce.
 */
export function SimulationFields({
  cardType,
  channelNames,
  channels,
  onChange,
}: {
  cardType: CardType;
  channelNames: string[];
  channels: SimulatedChannel[];
  onChange: (channels: SimulatedChannel[]) => void;
}) {
  const { isDark } = useAppTheme();
  if (channels.length === 0) return null;

  return (
    <View className="gap-3">
      <View className={cn('border-t pt-4', isDark ? 'border-line-dark' : 'border-line-light')}>
        <Text className={cn('font-body-bold text-sm', isDark ? 'text-ink' : 'text-ink-inverse')}>Simulated Signal</Text>
        <Text className={cn('mt-1 font-body text-xs leading-4', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>
          This card sits in a simulated rack. Each channel below generates values in place of a physical sensor and publishes
          them through the same pipeline real hardware uses.
        </Text>
      </View>

      {channels.map((channel, index) => (
        <ChannelSimulationCard
          key={index}
          index={index}
          name={channelNames[index]?.trim() ?? ''}
          cardType={cardType}
          channel={channel}
          onChange={(next) => onChange(channels.map((current, position) => (position === index ? next : current)))}
        />
      ))}
    </View>
  );
}
