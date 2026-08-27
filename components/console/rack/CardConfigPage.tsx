import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '../../../hooks/useAppTheme';
import { cn } from '../../../lib/cn';
import {
  channelCountForCardType,
  normalizedCardConfig,
  type CardConfig,
  type CardType,
  type ControllerConfig,
  type ProcessConfig,
  type SpeedConfig,
  type VibrationConfig,
} from '../../../lib/rack';
import { cardConfigWithSimulation, simulationWithCardConfig, validateSimulatedChannel, type SimulatedChannel } from '../../../lib/simulation';
import { ActionButton } from '../ActionButton';
import { BackButton } from '../BackButton';
import { ControllerFields, EnabledToggle, ProcessFields, SpeedFields, VibrationFields, processChannelValueError, processConfigErrors } from './CardConfigFields';
import { SimulationFields } from './SimulationFields';

type CardConfigPageProps = {
  /** Rack name, shown in the page header alongside slot, card type and channel. */
  rackName?: string;
  slot: number;
  cardType: CardType;
  initialConfig: CardConfig;
  initialEnabled: boolean;
  /** Present only for a card in a simulated rack — one entry per channel. */
  initialSimulation?: SimulatedChannel[];
  backLabel?: string;
  onBack: () => void;
  onSave: (config: CardConfig, enabled: boolean, simulation?: SimulatedChannel[]) => void;
};

export function CardConfigPage({ rackName, slot, cardType, initialConfig, initialEnabled, initialSimulation, backLabel = 'Back', onBack, onSave }: CardConfigPageProps) {
  const { isDark } = useAppTheme();
  const [form, setForm] = useState<{ config: CardConfig; enabled: boolean; simulation?: SimulatedChannel[] }>(() => {
    const normalized = normalizedCardConfig(cardType, initialConfig);
    return {
      config: initialSimulation?.length ? cardConfigWithSimulation(cardType, normalized, initialSimulation) : normalized,
      enabled: initialEnabled,
      simulation: initialSimulation,
    };
  });
  const { config, enabled, simulation } = form;
  const isSimulatedSignal = !!simulation?.length;
  const isExistingSignal = 'channelNames' in initialConfig && !!initialConfig.channelNames[0]?.trim();

  // Unit, range and alarm limits live on the card AND on the signal definition
  // of a simulated channel. Editing either side now updates the other, so a
  // value typed here is not silently replaced on save — which is exactly what
  // used to happen, and made the card's Unit field look read-only.
  const set = <K extends string>(key: K, value: string) =>
    setForm((previous) => {
      const nextConfig = { ...previous.config, [key]: value } as CardConfig;
      return {
        ...previous,
        config: nextConfig,
        simulation: previous.simulation ? simulationWithCardConfig(cardType, nextConfig, previous.simulation) : previous.simulation,
      };
    });
  const setChannelName = (index: number, value: string) =>
    setForm((previous) => {
      if (!('channelNames' in previous.config)) return previous;
      const channelNames = [...previous.config.channelNames];
      channelNames[index] = value;
      return { ...previous, config: { ...previous.config, channelNames } };
    });
  // The knob panel edits only the signal definition (value, behaviour, output
  // state, measurement type, cadence, normal band). It deliberately does NOT
  // mirror back into the card config: unit, range, alarms and precision flow
  // card -> signal, and echoing them back would rewrite the text an operator is
  // still typing ("0.5" becoming "0.5" only after a round-trip through Number).
  const setPrimaryChannel = (channel: SimulatedChannel) =>
    setForm((previous) => {
      if (!previous.simulation?.length) return previous;
      return { ...previous, simulation: previous.simulation.map((entry, index) => (index === 0 ? channel : entry)) };
    });

  const setProcessConfig = (nextConfig: ProcessConfig) =>
    setForm((previous) => ({
      ...previous,
      config: nextConfig,
      simulation: previous.simulation ? simulationWithCardConfig(cardType, nextConfig, previous.simulation) : previous.simulation,
    }));

  const canSave = (() => {
    if ('controllerName' in config) {
      return config.controllerName.trim().length > 0 && config.ip.trim().length > 0 && config.port.trim().length > 0;
    }
    if ('channelNames' in config) {
      if (!config.channelNames[0]?.trim()) return false;
      // The Universal V/I editor owns a Process Card whether or not it is
      // simulated, so its specification rules always apply — and when a signal
      // is attached, the knob's value has to satisfy them too. Both sides are
      // checked, rather than one standing in for the other.
      if (cardType === 'Process Card' && 'engineeringMin' in config) {
        if (Object.keys(processConfigErrors(config as ProcessConfig)).length > 0) return false;
        const channel = simulation?.[0];
        if (channel && channel.behaviour === 'Manual' && processChannelValueError(config as ProcessConfig, channel.manualValue)) return false;
        if (simulation) {
          return simulation.every((entry, index) => Object.keys(validateSimulatedChannel(entry, config.channelNames[index] ?? '')).length === 0);
        }
        return true;
      }
      if (isSimulatedSignal && simulation) {
        return simulation.every((channel, index) => Object.keys(validateSimulatedChannel(channel, config.channelNames[index] ?? '')).length === 0);
      }
      return true;
    }
    return false;
  })();

  /**
   * Saves the configuration as typed, with the free-text fields trimmed.
   *
   * Section 3.4 asks for a custom unit to be trimmed before saving; a trailing
   * space in a unit is invisible in the field and then shows up beside every
   * reading on every screen that renders the channel.
   */
  const save = () => {
    if (!canSave) return;
    let nextConfig = config;
    if ('channelNames' in nextConfig) {
      nextConfig = { ...nextConfig, channelNames: nextConfig.channelNames.map((name) => name.trim()) } as CardConfig;
    }
    if ('unit' in nextConfig && typeof nextConfig.unit === 'string') {
      nextConfig = { ...nextConfig, unit: nextConfig.unit.trim() } as CardConfig;
    }
    if ('tag' in nextConfig) {
      nextConfig = { ...nextConfig, tag: nextConfig.tag.trim() } as CardConfig;
    }
    onSave(nextConfig, enabled, simulation);
  };

  const lineClass = isDark ? 'border-line-dark' : 'border-line-light';
  const acquisitionChannelCount = channelCountForCardType(cardType);
  // The Universal V/I page is the Process Card's editor in both worlds. A
  // simulated Process Card used to be sent to the generic signal form instead,
  // which meant the specification's card page — input tiles, calibration, the
  // LL/L/H/HH block, display precision — was only reachable on a card that
  // could never publish a value, and the value that WAS published came from a
  // form with none of it. One editor removes that split.
  const isUniversalVIEditor = cardType === 'Process Card';

  const contextPill = (label: string, value: string) => (
    <View key={label} className={cn('rounded-lg border px-3 py-2', isDark ? 'border-line-dark bg-surface-darkpanel' : 'border-line-light bg-surface-lightpanel')}>
      <Text className={cn('font-mono text-[9px] uppercase tracking-[0.16em]', isDark ? 'text-ink-muted' : 'text-ink-inverse-muted')}>{label}</Text>
      <Text className={cn('mt-0.5 font-body-bold text-xs', isDark ? 'text-ink' : 'text-ink-inverse')}>{value}</Text>
    </View>
  );

  return (
    <View className="flex-1">
      <View className="px-6 pt-5">
        <BackButton label={backLabel} onPress={onBack} />
      </View>

      <View className="px-6 pt-3">
        <Text className={cn('font-body-bold text-lg', isDark ? 'text-ink' : 'text-ink-inverse')}>{isUniversalVIEditor ? 'Universal V/I Channel Configuration' : `Configure ${cardType}`}</Text>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {rackName ? contextPill('Rack', rackName) : null}
          {contextPill('Slot', `Slot-${String(slot).padStart(2, '0')}`)}
          {contextPill('Card Type', isUniversalVIEditor ? 'Universal V/I' : cardType)}
          {acquisitionChannelCount > 0 && contextPill('Channel', 'CH-01')}
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-6 py-5">
        {!isSimulatedSignal && cardType === 'Vibration Card' && <VibrationFields config={config as VibrationConfig} set={set} setChannelName={setChannelName} />}
        {cardType === 'Process Card' && (
          <ProcessFields
            config={config as ProcessConfig}
            setChannelName={setChannelName}
            setConfig={setProcessConfig}
            channel={simulation?.[0]}
            onChannelChange={setPrimaryChannel}
          />
        )}
        {!isSimulatedSignal && cardType === 'Speed Card' && <SpeedFields config={config as SpeedConfig} set={set} setChannelName={setChannelName} />}
        {cardType === 'Communication Controller' && <ControllerFields config={config as ControllerConfig} set={set} />}

        {(!isSimulatedSignal || isUniversalVIEditor) && <EnabledToggle enabled={enabled} onChange={(next) => setForm((previous) => ({ ...previous, enabled: next }))} />}

        {isSimulatedSignal && !isUniversalVIEditor && simulation && (
          <SimulationFields
            cardType={cardType}
            config={config}
            cardEnabled={enabled}
            channels={simulation}
            onCardEnabledChange={(next) => setForm((previous) => ({ ...previous, enabled: next }))}
            onConfigChange={(next) => setForm((previous) => ({ ...previous, config: next }))}
            onChange={(channels) => {
              setForm((previous) => ({
                ...previous,
                simulation: channels,
                config: cardConfigWithSimulation(cardType, previous.config, channels),
              }));
            }}
          />
        )}
      </ScrollView>

      <View className={cn('flex-row flex-wrap justify-end gap-3 border-t px-6 py-4', lineClass)}>
        <ActionButton label="Cancel" variant="secondary" onPress={onBack} />
        {isUniversalVIEditor && <ActionButton label="Save" variant="secondary" onPress={save} disabled={!canSave} />}
        <ActionButton
          label={isUniversalVIEditor ? 'Save & Upload' : isSimulatedSignal ? `Save & ${isExistingSignal ? 'update' : 'start'} simulation` : 'Save'}
          // Both sides are already in step (see `set` above), so saving stores
          // what is on screen rather than overwriting it from the signal.
          onPress={save}
          disabled={!canSave}
        />
      </View>
    </View>
  );
}
